# Follow Up Boss MCP Server

A remote Model Context Protocol server, built with `@modelcontextprotocol/sdk` and Streamable HTTP transport, that wraps the Follow Up Boss API so any MCP-compatible AI client (Claude, etc.) can read and manage your leads.

## Tools

| Tool | Description |
| --- | --- |
| `list_leads` | List/filter leads by pipeline stage, sorted by updated date, with a limit. |
| `get_lead` | Full detail for one person by id - profile, notes, calls, texts, emails. |
| `search_leads` | Search leads by name, phone, or email. |
| `add_lead` | Create a new person/lead. |
| `add_note` | Attach a note to an existing person. |
| `find_engaged_leads` | Rank recently-active leads by website-browsing signals (properties viewed/saved) and responsiveness signals (texts/calls back, contacted) so you can prioritize who to reach out to for an appointment. |

## How auth works

Every request to the Follow Up Boss API uses:

- HTTP Basic Auth - your FUB API key as the username, blank password.
- `X-System` and `X-System-Key` headers - required identification headers issued to registered FUB integrations (see "Identification" in the FUB docs).

All three values are read from environment variables (`FUB_API_KEY`, `FUB_SYSTEM`, `FUB_SYSTEM_KEY`) at request time. They are never hardcoded or logged, and `.env` is git-ignored - only `.env.example` (with blank values) is committed.

Optionally, you can also require callers of this MCP server to present a bearer token, via `MCP_AUTH_TOKENS` (comma-separated list of accepted tokens). Leave it blank for local development; set it once you deploy publicly.

## Project layout

```
src/
  index.js        Express app + Streamable HTTP MCP transport, session handling
    fubClient.js     Thin fetch wrapper: adds Basic Auth + X-System headers
      tools/index.js   The 5 MCP tool definitions, calling fubClient
      .env.example
      package.json
      ```

      ## Local setup

      1. Get your Follow Up Boss API key: Admin -> API in your FUB account.
      2. Get your `X-System` / `X-System-Key` values by registering your integration with Follow Up Boss (see the Identification docs linked above) - these are issued to you directly by FUB, not self-generated.
      3. Install dependencies:

      ```bash
      npm install
      ```

      4. Copy the example env file and fill in your real values:

      ```bash
      cp .env.example .env
      ```

      ```
      FUB_API_KEY=your_fub_api_key
      FUB_SYSTEM=your_system_name
      FUB_SYSTEM_KEY=your_system_key
      PORT=3000
      MCP_AUTH_TOKENS=
      ```

      5. Run it:

      ```bash
      npm start
      ```

      You should see:

      ```
      Follow Up Boss MCP server listening on port 3000
      MCP endpoint: POST/GET/DELETE http://localhost:3000/mcp
      ```

      Point an MCP client at `http://localhost:3000/mcp` (Streamable HTTP transport). A quick health check is also available at `GET /health`.

      ## Deploying to Railway

      1. Push this project to a GitHub repo (make sure `.env` is not committed - `.gitignore` already excludes it).
      2. In Railway: New Project -> Deploy from GitHub repo, and select this repo.
      3. Railway auto-detects Node.js and runs `npm install` then `npm start`. No Procfile is needed, but you can add one (`web: npm start`) if you prefer to be explicit.
      4. In the Railway project's Variables tab, add:
         - `FUB_API_KEY`
            - `FUB_SYSTEM`
               - `FUB_SYSTEM_KEY`
                  - `MCP_AUTH_TOKENS` (recommended once public - a long random token)
                  5. Do not set `PORT` - Railway injects it automatically and `src/index.js` already reads `process.env.PORT`.
                  6. Deploy. Railway will give you a public URL like `https://your-app.up.railway.app`. Your MCP endpoint is:

                  ```
                  https://your-app.up.railway.app/mcp
                  ```

                  7. Configure your MCP client to connect to that URL with Streamable HTTP transport, sending `Authorization: Bearer <token>` if you set `MCP_AUTH_TOKENS`.

                  ## Notes & gotchas

                  - `add_lead` creates a person record directly via `POST /v1/people`. Follow Up Boss's own docs note this will not trigger lead-routing automations or action plans - those only fire from event notifications (`POST /v1/events`) coming from a registered lead source. If you need automations to run, that's a separate integration path; this tool is for straightforward manual contact creation.
                  - Rate limits: Follow Up Boss enforces roughly 1,000 requests per 10 minutes per API key, returning 429 if exceeded. This server doesn't currently implement retry/backoff - add it if you expect heavy tool usage.
                  - Sessions are held in memory (a Map in `src/index.js`). That's fine for a single Railway instance; if you ever scale to multiple instances you'll need a shared session store instead.
                  - `find_engaged_leads` relies on Follow Up Boss's `propertiesViewed`/`propertiesSaved` counters, which only populate if your website/IDX provider is sending property-view activity into FUB via `POST /v1/events` (event types like `Viewed Property`, `Saved Property`, `Property Search`). If your site isn't wired up to send those events, this tool will only ever see the responsiveness signals (texts/calls/contacted), not the browsing ones - check with your IDX provider or FUB support if scores look browsing-blind.
                  
