// Force fresh deploy: ensure crypto polyfill fix is actually live (see cryptoPolyfill.js)
import "./cryptoPolyfill.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerFubTools, registerDealMachineTools } from "./tools/index.js";
import { registerFubWebhookRoute } from "./webhooks.js";
import { registerOAuthRoutes } from "./oauth.js";
import { timingSafeEqualStr } from "./security.js";

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
  // Check every configured token (rather than short-circuiting via
  // Array.includes) and compare each one in constant time, so neither which
  // token matched nor how far a wrong guess got is observable from timing.
  const isValid = token ? AUTH_TOKENS.reduce((acc, t) => timingSafeEqualStr(token, t) || acc, false) : false;
  if (isValid) return true;
  res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
  return false;
}

function createServer() {
  const server = new McpServer({ name: "followupboss-mcp-server", version: "1.0.0" });
  registerFubTools(server);
  registerDealMachineTools(server);
  return server;
}

const app = express();

// Mounted before express.json() so this route gets the raw body it needs
// for FUB-Signature verification (see src/webhooks.js).
registerFubWebhookRoute(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
registerOAuthRoutes(app);

app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

const sessions = new Map();

async function handleMcpPost(req, res) {
  if (!checkAuth(req, res)) return;

  const sessionId = req.headers["mcp-session-id"];
  let session = sessionId ? sessions.get(sessionId) : undefined;

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
    session = { server, transport };
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
  await session.transport.handleRequest(req, res);
}

app.post("/mcp", handleMcpPost);
app.get("/mcp", handleMcpSessionRequest);
app.delete("/mcp", handleMcpSessionRequest);

app.listen(PORT, () => {
  console.error("Follow Up Boss MCP server listening on port " + PORT);
  console.error("MCP endpoint: POST/GET/DELETE http://localhost:" + PORT + "/mcp");
});
