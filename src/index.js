// Force fresh deploy: ensure crypto polyfill fix is actually live (see cryptoPolyfill.js)
import "./cryptoPolyfill.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerFubTools } from "./tools/index.js";
import { registerFubWebhookRoute } from "./webhooks.js";
import { registerOAuthRoutes } from "./oauth.js";
import { createRateLimiter } from "./rateLimit.js";
import { timingSafeEqualStr } from "./authUtils.js";

const PORT = process.env.PORT || 3000;
const AUTH_TOKENS = (process.env.MCP_AUTH_TOKENS || "").split(",").map((t) => t.trim()).filter(Boolean);
const AUTH_REQUIRED = AUTH_TOKENS.length > 0;

// Auth is fundamentally a static bearer token (MCP_AUTH_TOKENS) - see
// oauth.js for why an OAuth *shell* still exists on top of it: Claude's
// custom-connector UI requires a remote MCP server to complete an OAuth
// handshake to connect at all, it has no plain "paste a token" field. That
// flow's /token endpoint hands back this same static token rather than a
// randomly generated one, so checking membership here is all that's needed
// either way - direct bearer-token callers and OAuth-obtained ones both end
// up presenting a value from this same list.
function checkAuth(req, res) {
  if (!AUTH_REQUIRED) return true;
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  // Compare against every configured token (not returning early on a match)
  // so the response time doesn't reveal how close an invalid token got.
  let matched = false;
  if (token) {
    for (const validToken of AUTH_TOKENS) {
      if (timingSafeEqualStr(token, validToken)) matched = true;
    }
  }
  if (matched) return true;
  res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
  return false;
}

function createServer() {
  const server = new McpServer({ name: "followupboss-mcp-server", version: "1.0.0" });
  registerFubTools(server);
  return server;
}

const app = express();

// Trust the first proxy hop (Railway terminates TLS in front of us) so
// req.ip reflects the real client address instead of the proxy's - both the
// rate limiter below and any IP-based logging depend on this being accurate.
app.set("trust proxy", 1);

// Mounted before express.json() so this route gets the raw body it needs
// for FUB-Signature verification (see src/webhooks.js).
registerFubWebhookRoute(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
registerOAuthRoutes(app);

app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

const mcpRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many MCP requests, slow down.",
});

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const sessions = new Map();

// A client that never sends DELETE /mcp (or a session id that's simply
// abandoned) would otherwise leak an entry here forever. Sweep anything
// that's gone quiet for a while.
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > SESSION_IDLE_TIMEOUT_MS) {
      session.transport.close?.();
      sessions.delete(id);
    }
  }
}, SESSION_SWEEP_INTERVAL_MS).unref();

async function handleMcpPost(req, res) {
  if (!checkAuth(req, res)) return;

  const sessionId = req.headers["mcp-session-id"];
  let session = sessionId ? sessions.get(sessionId) : undefined;
  if (session) session.lastActivity = Date.now();

  if (!session && isInitializeRequest(req.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        sessions.set(newSessionId, session);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };

    const server = createServer();
    session = { server, transport, lastActivity: Date.now() };
    await server.connect(transport);
  } else if (!session) {
    // A session id was presented but doesn't match anything we know about -
    // most commonly because a restart (any redeploy) cleared the in-memory
    // `sessions` map out from under a client that's still holding an older
    // id. Per the MCP Streamable HTTP spec, respond 404 here (not a generic
    // 400) so a compliant client recognizes "session gone" and starts a
    // fresh `initialize` on its own, instead of retrying the same dead
    // session id forever.
    if (sessionId) {
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Session not found - start a new session with an initialize request" },
        id: null,
      });
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: no valid session, and not an initialize request" },
        id: null,
      });
    }
    return;
  }

  await session.transport.handleRequest(req, res, req.body);
}

async function handleMcpSessionRequest(req, res) {
  if (!checkAuth(req, res)) return;
  const sessionId = req.headers["mcp-session-id"];
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) {
    // Same reasoning as handleMcpPost: an unrecognized session id gets 404
    // so the client knows to reinitialize, rather than a generic 400.
    res.status(sessionId ? 404 : 400).send("Invalid or missing session ID");
    return;
  }
  session.lastActivity = Date.now();
  await session.transport.handleRequest(req, res);
}

app.post("/mcp", mcpRateLimit, handleMcpPost);
app.get("/mcp", mcpRateLimit, handleMcpSessionRequest);
app.delete("/mcp", mcpRateLimit, handleMcpSessionRequest);

app.listen(PORT, () => {
  console.error("Follow Up Boss MCP server listening on port " + PORT);
  console.error("MCP endpoint: POST/GET/DELETE http://localhost:" + PORT + "/mcp");
});
