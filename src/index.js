import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerFubTools } from "./tools/index.js";
import { registerOAuthRoutes, isValidAccessToken } from "./oauth.js";
import { runSpeedToLeadAutomation } from "./automations/speedToLead.js";

const PORT = process.env.PORT || 3000;
const AUTH_TOKENS = (process.env.MCP_AUTH_TOKENS || "")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);
const AUTH_REQUIRED = AUTH_TOKENS.length > 0 || Boolean(process.env.OAUTH_PASSWORD);

function checkAuth(req, res) {
  if (!AUTH_REQUIRED) return true;
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token && (AUTH_TOKENS.includes(token) || isValidAccessToken(token))) return true;
  res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
  return false;
}

function createServer() {
  const server = new McpServer({ name: "followupboss-mcp-server", version: "1.0.0" });
  registerFubTools(server);
  return server;
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

registerOAuthRoutes(app);

app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

// Inbound webhook for lead sources that post directly (form, ad platform,
// Zapier, etc.) instead of going through the MCP tool. Runs the same Speed
// to Lead automation as the run_speed_to_lead_automation MCP tool.
app.post("/webhooks/speed-to-lead", async (req, res) => {
  const expectedSecret = process.env.SPEED_TO_LEAD_WEBHOOK_SECRET;
  if (expectedSecret) {
    const provided = req.headers["x-webhook-token"] || req.query.token;
    if (provided !== expectedSecret) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
  }

  const { firstName, lastName, email, phone, message, eventType } = req.body || {};
  try {
    const result = await runSpeedToLeadAutomation({
      firstName,
      lastName,
      email,
      phone,
      message,
      eventType,
    });
    res.status(200).json({ ok: true, result });
  } catch (err) {
    const status = /required/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, error: err.message });
  }
});

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
