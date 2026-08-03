import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerFubTools } from "./tools/index.js";

const PORT = process.env.PORT || 3000;

// Optional simple bearer-token gate. If MCP_AUTH_TOKENS is set (comma
// separated), incoming requests must present one of those tokens via
// `Authorization: Bearer <token>`. Leave unset for local/dev use.
const AUTH_TOKENS = (process.env.MCP_AUTH_TOKENS || "")
  .split(",")
    .map((t) => t.trim())
      .filter(Boolean);

      function checkAuth(req, res) {
        if (AUTH_TOKENS.length === 0) return true;
          const header = req.headers.authorization || "";
            const token = header.startsWith("Bearer ") ? header.slice(7) : null;
              if (token && AUTH_TOKENS.includes(token)) return true;
                res.status(401).json({
                    jsonrpc: "2.0",
                        error: { code: -32001, message: "Unauthorized" },
                            id: null,
                              });
                                return false;
                                }

                                function createServer() {
                                  const server = new McpServer({
                                      name: "followupboss-mcp-server",
                                          version: "1.0.0",
                                            });
                                              registerFubTools(server);
                                                return server;
                                                }

                                                const app = express();
                                                app.use(express.json());

                                                // Basic health check for Railway / uptime monitors.
                                                app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

                                                // Session store: sessionId -> { server, transport }
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
                                                                                                                                                                            app.get("/mcp", handleMcpSessionRequest); // server-to-client notifications (SSE stream)
                                                                                                                                                                            app.delete("/mcp", handleMcpSessionRequest); // client-initiated session termination
                                                                                                                                                                            
                                                                                                                                                                            app.listen(PORT, () => {
                                                                                                                                                                              console.error(`Follow Up Boss MCP server listening on port ${PORT}`);
                                                                                                                                                                                console.error(`MCP endpoint: POST/GET/DELETE http://localhost:${PORT}/mcp`);
                                                                                                                                                                                });
                                                                                                                                                                                
