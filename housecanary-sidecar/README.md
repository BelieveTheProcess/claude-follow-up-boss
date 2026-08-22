# HouseCanary MCP sidecar

Fronts [housecanary-mcp](https://pypi.org/project/housecanary-mcp/) (the
third-party PyPI package that exposes ~180 HouseCanary Analytics API
endpoints - valuations, comps, forecasts, hazard data, rental estimates -
as MCP tools) with the same auth and rate-limit posture as the main FUB
server in `../src/`.

## Why a proxy in front of it

`housecanary-mcp` has **no authentication of its own** on the HTTP endpoint
it serves (confirmed by reading its source - the only credentials it takes
are the HouseCanary API username/password, which it uses to call
HouseCanary's API, not to protect its own MCP endpoint). Every tool call is
also billed against your HouseCanary contract. Putting it directly on a
public Railway URL would let anyone list and call all ~180 tools, on your
bill.

`proxy.py` spawns `housecanary-mcp` bound to loopback only
(`127.0.0.1:8123`), and reverse-proxies bearer-token-authenticated,
rate-limited requests from the public port to it - mirroring
`checkAuth`/`createRateLimiter` in `../src/index.js` and
`../src/rateLimit.js` (constant-time token comparison, 120 req/min per IP).

## Deploying

This is a separate Railway service from the main FUB server - same repo,
different root directory:

1. In Railway, add a new service pointing at this repo with **root
   directory** set to `housecanary-sidecar/`.
2. Set env vars (see `.env.example`): `HOUSECANARY_API_USERNAME`,
   `HOUSECANARY_API_PASSWORD`, `MCP_AUTH_TOKENS`.
3. Railway auto-detects the Python app via `requirements.txt` and runs the
   `Procfile`'s `web: python proxy.py`.
4. You'll get a second public URL, e.g.
   `https://housecanary-mcp-sidecar.up.railway.app/mcp`.

## Connecting it to Claude

This prototype only implements plain bearer-token auth (`Authorization:
Bearer <token>`) - the same mechanism the main FUB server accepts directly,
without going through an OAuth handshake. That's enough for:

- Claude Code / the Agent SDK, or any MCP client where you can hand-configure
  a remote server with a static bearer token
- A quick `curl`/script check like the one used to validate this prototype

**Claude's own custom-connector UI (the "Connectors" picker in claude.ai)
requires the server to complete an OAuth handshake to connect at all** - it
has no plain "paste a token" field. The main FUB server works around this
with the OAuth shell in `../src/oauth.js` (dynamic client registration +
PKCE, backed by the same static token). This sidecar doesn't have that yet.
If you want to add HouseCanary as a connector in Claude's UI specifically,
the same `oauth.js` pattern would need to be ported here - happy to do that
next if this is worth pursuing past the prototype stage.

## What was verified locally

- `housecanary-mcp` installs cleanly from PyPI and boots in HTTP mode via
  `FASTMCP_TRANSPORT=http` / `FASTMCP_HOST` / `FASTMCP_PORT` /
  `FASTMCP_STREAMABLE_HTTP_PATH` env vars (confirmed by reading
  `fastmcp`'s source, not just the vendor's docs).
- Full MCP handshake (`initialize` -> `notifications/initialized` ->
  `tools/list`) through the proxy returns all ~180 tools.
- `/mcp` returns 401 with no token or a wrong token, 200 with a correct one.
- The rate limiter trips (429) once a client exceeds 120 requests/minute.
- Streaming (SSE) responses and the `Mcp-Session-Id` header pass through
  the proxy correctly.

Not yet tested: real HouseCanary credentials (local testing used dummy
values - the server boots fine either way since it only validates
credentials when a tool actually calls the HouseCanary API), and an actual
deploy to Railway.

## Known limitations of this prototype

- No OAuth shell (see above) - bearer-token-only for now.
- Every tool call still counts against your HouseCanary billing; nothing
  here changes that, it just controls *who* can trigger a call.
- Single process, in-memory rate-limit state - fine for one Railway
  instance, would need a shared store (Redis, etc.) if this were ever
  scaled to multiple instances.
