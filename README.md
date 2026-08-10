# Follow Up Boss MCP Server

A remote Model Context Protocol server, built with `@modelcontextprotocol/sdk` and Streamable HTTP transport, that wraps the Follow Up Boss API (plus Twilio and Real Geeks) so any MCP-compatible AI client (Claude, etc.) can read and manage your leads.

## Tools

| Tool | Description |
| --- | --- |
| `list_leads` | List/filter leads by pipeline stage, sorted by updated date, with a limit. |
| `get_lead` | Full detail for one person by id - profile, notes, calls, texts, emails. |
| `search_leads` | Search leads by name, phone, or email. |
| `add_lead` | Create a new person/lead, optionally with tags. |
| `add_note` | Attach a note to an existing person. |
| `send_text` | Actually send an SMS via Twilio, then log it on the person's FUB timeline. |
| `list_action_plans` | List the follow-up sequences ("Action Plans") configured in FUB. |
| `apply_action_plan` | Enroll a lead in an existing Action Plan by id. |
| `sync_lead_to_realgeeks` | Push a FUB lead into a Real Geeks site so a search alert / IDX drip can be set up. |

## How auth works

**Follow Up Boss** - every request uses:

- HTTP Basic Auth - your FUB API key as the username, blank password.
- `X-System` and `X-System-Key` headers - required identification headers issued to registered FUB integrations (see "Identification" in the FUB docs).

**Twilio** - `send_text` authenticates with `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` and sends from `TWILIO_FROM_NUMBER`.

**Real Geeks** - `sync_lead_to_realgeeks` uses HTTP Basic Auth with partner credentials (`REALGEEKS_USERNAME` / `REALGEEKS_PASSWORD`) issued by Real Geeks, scoped to a specific site via `REALGEEKS_SITE_UUID`. These are not self-service like a FUB API key - see "Real Geeks setup" below.

All secrets are read from environment variables at request time. They are never hardcoded or logged, and `.env` is git-ignored - only `.env.example` (with blank values) is committed.

Optionally, you can also require callers of this MCP server to present a bearer token, via `MCP_AUTH_TOKENS` (comma-separated list of accepted tokens). Leave it blank for local development; set it once you deploy publicly.

## Project layout

```
src/
  index.js            Express app + Streamable HTTP MCP transport, session handling
  fubClient.js         Thin fetch wrapper: adds FUB Basic Auth + X-System headers
  twilioClient.js       Thin wrapper around the Twilio SDK for sending SMS
  realGeeksClient.js     Thin fetch wrapper: adds Real Geeks Basic Auth
  tools/index.js          The MCP tool definitions, calling the clients above
.env.example
package.json
skills/                 Claude Skill definitions for the four CRM workflows this repo enables
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

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

REALGEEKS_USERNAME=
REALGEEKS_PASSWORD=
REALGEEKS_SITE_UUID=
```

Twilio and Real Geeks variables are only required if you use `send_text` or `sync_lead_to_realgeeks` - the FUB tools work fine without them.

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

## Real Geeks setup

Unlike the FUB API key, Real Geeks credentials aren't self-service:

1. Register as an integration at https://developers.realgeeks.com to get a partner `username`/`password` (shared across every Real Geeks site you sync to).
2. The Real Geeks site owner (you, for your own site) visits a grant URL specific to your integration and approves access.
3. Real Geeks emails you the `Site UUID` for that site - this is `REALGEEKS_SITE_UUID`.

Until those three env vars are set, `sync_lead_to_realgeeks` will fail with a clear "missing environment variable" error rather than a confusing API error.

## Deploying to Railway

1. Push this project to a GitHub repo (make sure `.env` is not committed - `.gitignore` already excludes it).
2. In Railway: New Project -> Deploy from GitHub repo, and select this repo.
3. Railway auto-detects Node.js and runs `npm install` then `npm start`. No Procfile is needed, but you can add one (`web: npm start`) if you prefer to be explicit.
4. In the Railway project's Variables tab, add whichever of these you need:
   - `FUB_API_KEY`, `FUB_SYSTEM`, `FUB_SYSTEM_KEY`
   - `MCP_AUTH_TOKENS` (recommended once public - a long random token)
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (for `send_text`)
   - `REALGEEKS_USERNAME`, `REALGEEKS_PASSWORD`, `REALGEEKS_SITE_UUID` (for `sync_lead_to_realgeeks`)
5. Do not set `PORT` - Railway injects it automatically and `src/index.js` already reads `process.env.PORT`.
6. Deploy. Railway will give you a public URL like `https://your-app.up.railway.app`. Your MCP endpoint is:

```
https://your-app.up.railway.app/mcp
```

7. Configure your MCP client to connect to that URL with Streamable HTTP transport, sending `Authorization: Bearer <token>` if you set `MCP_AUTH_TOKENS`.

## Notes & gotchas

- `add_lead` creates a person record directly via `POST /v1/people`. Follow Up Boss's own docs note this will not trigger lead-routing automations or action plans - those only fire from event notifications (`POST /v1/events`) coming from a registered lead source. If you need automations to run, that's a separate integration path; this tool is for straightforward manual contact creation. Use `apply_action_plan` afterwards if you want the new lead enrolled in a sequence.
- FUB's `/textMessages` endpoint only records a log entry - it cannot deliver anything. `send_text` sends the real message through Twilio first, then logs it so it still shows up correctly on the FUB timeline.
- The FUB API can list Action Plans and enroll/pause people on them, but it cannot create or edit a plan's steps/content - new or edited sequences (subject lines, email bodies, wait times) still have to be built in the FUB UI under Automations. See `skills/fub-sequence-writer/SKILL.md` for how this repo works around that.
- Rate limits: Follow Up Boss enforces roughly 1,000 requests per 10 minutes per API key, returning 429 if exceeded. This server doesn't currently implement retry/backoff - add it if you expect heavy tool usage.
- Sessions are held in memory (a Map in `src/index.js`). That's fine for a single Railway instance; if you ever scale to multiple instances you'll need a shared session store instead.

## Skills

`skills/` contains Claude Skill definitions (`SKILL.md`) for the four workflows this MCP server is meant to power - point Claude at this repo (or drop the skill folders into your skills directory) to use them:

- `fub-lead-scoring` - daily Hot/Warm/Cool follow-up list, scored against a Keller Williams-style lead matrix.
- `fub-lead-capture` - turn a screenshot of a text/email thread, or a quick spoken note, into a new lead + note.
- `fub-sequence-writer` - draft personalized follow-up sequences (referencing your own video/content library) for FUB Action Plans.
