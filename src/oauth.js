import { randomUUID, createHash } from "node:crypto";
import { createRateLimiter } from "./rateLimit.js";
import { timingSafeEqualStr } from "./authUtils.js";

// OAuth surface for MCP clients (Claude's custom-connector flow, specifically)
// that require a remote MCP server to speak OAuth - dynamic client
// registration plus PKCE - even for a single-user tool with no real
// multi-tenant client base. Client registrations and authorization codes are
// short-lived (used once, within ~10 minutes, during interactive login), so
// keeping them in memory is fine - a restart mid-login just means starting
// the login over.
//
// The token this hands back is NOT randomly generated and stored, though.
// It's the server's own configured MCP_AUTH_TOKENS secret (see index.js).
// That means a token obtained through this flow stays valid for as long as
// that env var is set, regardless of process restarts - unlike an earlier
// version of this file, which generated and stored a fresh random token per
// login and silently logged out every connected client on every redeploy.

const clients = new Map();
const authCodes = new Map();
const CODE_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60; // informational only - the token doesn't actually expire server-side

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function verifyPkce(codeVerifier, codeChallenge) {
  const hash = createHash("sha256").update(codeVerifier).digest();
  return base64url(hash) === codeChallenge;
}

// Login page and token exchange are unauthenticated by nature (that's the
// point of /authorize and /token) - rate-limit them so guessing
// OAUTH_PASSWORD or brute-forcing an auth code isn't free.
const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many attempts, try again later.",
});

function primaryAuthToken() {
  const tokens = (process.env.MCP_AUTH_TOKENS || "").split(",").map((t) => t.trim()).filter(Boolean);
  return tokens[0];
}

function baseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${req.headers.host}`;
}

export function registerOAuthRoutes(app) {
  app.get("/.well-known/oauth-authorization-server", (req, res) => {
    const issuer = baseUrl(req);
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    const issuer = baseUrl(req);
    res.json({ resource: `${issuer}/mcp`, authorization_servers: [issuer] });
  });

  // Dynamic client registration (RFC 7591). Short-lived by design - see note above.
  app.post("/register", (req, res) => {
    const redirect_uris = (req.body || {}).redirect_uris;
    if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return res.status(400).json({ error: "invalid_client_metadata", error_description: "redirect_uris is required" });
    }
    const client_id = randomUUID();
    clients.set(client_id, { redirect_uris });
    res.status(201).json({
      client_id,
      redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  });

  app.get("/authorize", authRateLimit, (req, res) => {
    const { client_id, redirect_uri, response_type, code_challenge, code_challenge_method } = req.query;
    const state = req.query.state || "";
    const client = clients.get(client_id);
    if (!client || !client.redirect_uris.includes(redirect_uri)) {
      return res.status(400).send("Unknown client or redirect_uri");
    }
    if (response_type !== "code" || code_challenge_method !== "S256" || !code_challenge) {
      return res.status(400).send("Unsupported request: only response_type=code with PKCE (S256) is supported");
    }

    const html = [
      "<!doctype html>",
      "<html>",
      "<head><title>Connect Follow Up Boss</title></head>",
      "<body style='font-family: sans-serif; max-width: 360px; margin: 80px auto;'>",
      "<h2>Connect to Follow Up Boss</h2>",
      "<p>Enter your access password to allow this Claude app to connect.</p>",
      "<form method='POST' action='/authorize'>",
      `<input type='hidden' name='client_id' value='${client_id}' />`,
      `<input type='hidden' name='redirect_uri' value='${redirect_uri}' />`,
      `<input type='hidden' name='code_challenge' value='${code_challenge}' />`,
      `<input type='hidden' name='state' value='${state}' />`,
      "<input type='password' name='password' placeholder='Access password' autofocus style='width: 100%; padding: 8px; margin-bottom: 12px;' />",
      "<button type='submit' style='width: 100%; padding: 8px;'>Connect</button>",
      "</form>",
      "</body>",
      "</html>",
    ].join("\n");
    res.set("Content-Type", "text/html").send(html);
  });

  app.post("/authorize", authRateLimit, (req, res) => {
    const { client_id, redirect_uri, code_challenge, state, password } = req.body || {};
    const client = clients.get(client_id);
    if (!client || !client.redirect_uris.includes(redirect_uri)) {
      return res.status(400).send("Unknown client or redirect_uri");
    }

    const expectedPassword = process.env.OAUTH_PASSWORD || "";
    if (!expectedPassword || !timingSafeEqualStr(password || "", expectedPassword)) {
      return res.status(401).send("Incorrect password. Go back and try again.");
    }

    const code = randomUUID();
    authCodes.set(code, {
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      expiresAt: Date.now() + CODE_TTL_MS,
    });

    const redirect = new URL(redirect_uri);
    redirect.searchParams.set("code", code);
    if (state) redirect.searchParams.set("state", state);
    res.redirect(redirect.toString());
  });

  app.post("/token", authRateLimit, (req, res) => {
    const body = req.body || {};
    const token = primaryAuthToken();
    if (!token) {
      return res
        .status(500)
        .json({ error: "server_error", error_description: "MCP_AUTH_TOKENS is not configured on the server" });
    }

    if (body.grant_type === "authorization_code") {
      const { code, redirect_uri, code_verifier, client_id } = body;
      const record = authCodes.get(code);
      if (!record || record.expiresAt < Date.now()) {
        return res.status(400).json({ error: "invalid_grant" });
      }
      if (record.clientId !== client_id || record.redirectUri !== redirect_uri) {
        return res.status(400).json({ error: "invalid_grant" });
      }
      if (!code_verifier || !verifyPkce(code_verifier, record.codeChallenge)) {
        return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
      }
      authCodes.delete(code);
      return res.json({ access_token: token, token_type: "Bearer", expires_in: TOKEN_TTL_SECONDS, refresh_token: token });
    }

    if (body.grant_type === "refresh_token") {
      if (body.refresh_token !== token) {
        return res.status(400).json({ error: "invalid_grant" });
      }
      return res.json({ access_token: token, token_type: "Bearer", expires_in: TOKEN_TTL_SECONDS, refresh_token: token });
    }

    res.status(400).json({ error: "unsupported_grant_type" });
  });
}
