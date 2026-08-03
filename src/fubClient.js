// Thin wrapper around the Follow Up Boss REST API.
//
// Auth model (per https://docs.followupboss.com/reference/authentication):
// - HTTP Basic Auth, API key as the username, blank password.
// - Every request must also carry X-System and X-System-Key headers
//   identifying the integration (see "Identification" in the FUB docs).
//
// All three secrets are read from environment variables at call time —
// never hardcoded, never logged.

const FUB_BASE_URL = "https://api.followupboss.com/v1";

function requireEnv(name) {
  const value = process.env[name];
    if (!value) {
        throw new Error(
              `Missing required environment variable ${name}. Set it before starting the server (see .env.example).`
                  );
                    }
                      return value;
                      }

                      function authHeaders() {
                        const apiKey = requireEnv("FUB_API_KEY");
                          const system = requireEnv("FUB_SYSTEM");
                            const systemKey = requireEnv("FUB_SYSTEM_KEY");

                              const basic = Buffer.from(`${apiKey}:`).toString("base64");

                                return {
                                    Authorization: `Basic ${basic}`,
                                        "X-System": system,
                                            "X-System-Key": systemKey,
                                                "Content-Type": "application/json",
                                                    Accept: "application/json",
                                                      };
                                                      }

                                                      function buildQuery(params = {}) {
                                                        const query = new URLSearchParams();
                                                          for (const [key, value] of Object.entries(params)) {
                                                              if (value === undefined || value === null || value === "") continue;
                                                                  query.set(key, String(value));
                                                                    }
                                                                      const qs = query.toString();
                                                                        return qs ? `?${qs}` : "";
                                                                        }

                                                                        /**
                                                                         * Low-level request helper. Throws a descriptive Error on non-2xx
                                                                          * responses so callers (MCP tool handlers) can surface a clean message.
                                                                           */
                                                                           async function fubRequest(method, path, { query, body } = {}) {
                                                                             const url = `${FUB_BASE_URL}${path}${buildQuery(query)}`;

                                                                               const res = await fetch(url, {
                                                                                   method,
                                                                                       headers: authHeaders(),
                                                                                           body: body !== undefined ? JSON.stringify(body) : undefined,
                                                                                             });

                                                                                               const text = await res.text();
                                                                                                 let data;
                                                                                                   try {
                                                                                                       data = text ? JSON.parse(text) : {};
                                                                                                         } catch {
                                                                                                             data = { raw: text };
                                                                                                               }
                                                                                                               
                                                                                                                 if (!res.ok) {
                                                                                                                     const message =
                                                                                                                           (data && (data.errorMessage || data.message || data.error)) ||
                                                                                                                                 `Follow Up Boss API request failed (${res.status} ${res.statusText})`;
                                                                                                                                     const err = new Error(`${message} [${method} ${path}]`);
                                                                                                                                         err.status = res.status;
                                                                                                                                             err.body = data;
                                                                                                                                                 throw err;
                                                                                                                                                   }
                                                                                                                                                   
                                                                                                                                                     return data;
                                                                                                                                                     }
                                                                                                                                                     
                                                                                                                                                     export const fub = {
                                                                                                                                                       get: (path, query) => fubRequest("GET", path, { query }),
                                                                                                                                                         post: (path, body, query) => fubRequest("POST", path, { body, query }),
                                                                                                                                                           put: (path, body, query) => fubRequest("PUT", path, { body, query }),
                                                                                                                                                           };
                                                                                                                                                           
                                                                                                                                                           export { FUB_BASE_URL };
                                                                                                                                                           
