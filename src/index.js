import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerFubTools } from "./tools/index.js";
import { registerFubWebhookRoute } from "./webhooks.js";

const PORT = process.env.PORT || 3000;
const AUTH_TOKENS = (process.env.MCP_AUTH_TOKENS || "").split(",").map((t) => t.trim()).filter(Boolean);
const AUTH_REQUIRED = AUTH_TOKENS.length > 0;

// Static bearer-token auth (MCP_AUTH_TOKENS), not OAuth. This server used to
// implement a full dynamic-client-registration OAuth flow, but it kept every
// registered client and issued token in an in-memory Map - a redeploy (any
// process restart) silently wiped all of it and broke every connected
// client until they went through the whole auth flow again. A static token
// has no server-side state to lose, so it survives restarts/redeploys.
function checkAuth(req, res) {
  if (!AUTH_REQUIRED) return true;
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token && AUTH_TOKENS.includes(token)) return true;
  res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
  return false;
}

function createServer() {
  const server = new McpServer({ name: "followupboss-mcp-server", version: "1.0.0" });
  registerFubTools(server);
  return server;
}

const app = express();

// Mounted before express.json() so this route gets the raw body it needs
// for FUB-Signature verification (see src/webhooks.js).
registerFubWebhookRoute(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: no valid session, and not an initialize request" },
      id: null,
    });
    return;
  }

  await session.transport.handleRequest(req, res, req.body);
}

async function handleMcpSessionRequest(req, res) {
  if (!checkAuth(req, res)) return;
  const sessionId = req.headers["mcp-session-id"];
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) {
    res.status(400).send("Invalid or missing session ID");
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
