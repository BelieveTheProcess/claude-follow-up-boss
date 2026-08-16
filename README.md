# Follow Up Boss MCP Server

A remote Model Context Protocol server, built with `@modelcontextprotocol/sdk` and Streamable HTTP transport, that wraps the Follow Up Boss API (plus Twilio, Real Geeks, and Slack) so any MCP-compatible AI client (Claude, etc.) can read and manage your leads.

## Tools

| Tool | Description |
| --- | --- |
| `list_leads` | List/filter leads by pipeline stage, sorted by updated date, with a limit. |
| `get_lead` | Full detail for one person by id - profile, notes, calls, texts, emails. |
| `search_leads` | Search leads by name, phone, or email. |
| `add_lead` | Create a new person/lead, optionally with tags. Does NOT trigger automations. |
| `create_lead_event` | Send a lead via POST /events - the only path that triggers FUB lead-routing/Action Plans. |
| `update_lead` | Update an existing person's stage, tags, assignment, price, or background. |
| `list_pipeline_stages` | List this account's actual pipeline stage names, to avoid silently mismatched stages. |
| `list_custom_fields` | List this account's configured custom fields (label, API name, type). |
| `get_priority_leads` | One-call pipeline scan with each lead's recent notes/calls/texts/emails attached, instead of list_leads + N×get_lead. |
| `tag_lead_priority` | Set/clear a `Priority: Hot/Warm/Cool` tag on a person - persists a scoring pass back into FUB. |
| `add_note` | Attach a note to an existing person. |
| `send_text` | Actually send an SMS via Twilio, then log it on the person's FUB timeline. |
| `list_action_plans` | List the follow-up sequences ("Action Plans") configured in FUB. |
| `apply_action_plan` | Enroll a lead in an existing Action Plan by id. |
| `sync_lead_to_realgeeks` | Push a FUB lead into a Real Geeks site so a search alert / IDX drip can be set up. |
| `notify_slack` | Post a drafted message (email, social batch, report) to a configured Slack channel for review. |
| `add_task` | Create a follow-up task/reminder in FUB, tied to a person. |
| `list_tasks` | List tasks - due today/overdue/upcoming, or scoped to one person. |
| `complete_task` | Mark a task done (or reopen it). |
| `list_calls` | List logged calls, optionally across the whole pipeline (no personId), for missed-call follow-up. |
| `register_fub_webhook` | Register a FUB webhook pointed at this server's `/webhooks/fub` endpoint (speed-to-lead setup). |

## How auth works

**Follow Up Boss** - every request uses:

- HTTP Basic Auth - your FUB API key as the username, blank password.
- `X-System` and `X-System-Key` headers - required identification headers issued to registered FUB integrations (see "Identification" in the FUB docs).

**Twilio** - `send_text` authenticates with `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` and sends from `TWILIO_FROM_NUMBER`.

**Real Geeks** - `sync_lead_to_realgeeks` uses HTTP Basic Auth with partner credentials (`REALGEEKS_USERNAME` / `REALGEEKS_PASSWORD`) issued by Real Geeks, scoped to a specific site via `REALGEEKS_SITE_UUID`. These are not self-service like a FUB API key - see "Real Geeks setup" below.

**Slack** - `notify_slack` posts to one of your Slack channels via an Incoming Webhook URL. `SLACK_WEBHOOKS` is a JSON object mapping a channel label you choose (e.g. `"marketing-review"`) to that channel's webhook URL - see `skills/slack-review-queue/SKILL.md` for setup.

All secrets are read from environment variables at request time. They are never hardcoded or logged, and `.env` is git-ignored - only `.env.example` (with blank values) is committed.

**Connecting client (Claude, etc.)** - the real credential is a static bearer token via `MCP_AUTH_TOKENS` (comma-separated list of accepted tokens), required for any deployment reachable over the internet; leave it blank only for local-only development. On top of that, `src/oauth.js` implements an OAuth shell (dynamic client registration + PKCE via `/register`, `/authorize`, `/token`) purely because Claude's custom-connector UI requires a remote MCP server to complete an OAuth handshake to connect at all - it has no plain "paste a token" field. Client registrations and authorization codes from that flow are short-lived and kept in memory (fine, they're only used for a few minutes during the interactive login), but `/token` does **not** generate and store a fresh random access token - it hands back the server's own `MCP_AUTH_TOKENS` value directly. So the token obtained through the OAuth login is the same static secret either way, and stays valid across restarts/redeploys - unlike an earlier version of this file that generated and stored real tokens in memory and silently logged out every connected client on every redeploy. `OAUTH_PASSWORD` gates the login page itself (the human-interactive step); set it alongside `MCP_AUTH_TOKENS`.

## Project layout

```
src/
  index.js            Express app + Streamable HTTP MCP transport, session handling
  fubClient.js         Thin fetch wrapper: adds FUB Basic Auth + X-System headers
  twilioClient.js       Thin wrapper around the Twilio SDK for sending SMS
  realGeeksClient.js     Thin fetch wrapper: adds Real Geeks Basic Auth
  slackClient.js          Thin wrapper around Slack Incoming Webhooks
  webhooks.js               FUB webhook receiver: signature verification + speed-to-lead reaction
  tools/index.js              The MCP tool definitions, calling the clients above
.env.example
package.json
BRAND.md               Fillable brand/voice doc the content skills read before drafting
skills/                 Claude Skill definitions for the CRM + content workflows this repo enables
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

SLACK_WEBHOOKS=
```

Twilio, Real Geeks, and Slack variables are only required if you use `send_text`, `sync_lead_to_realgeeks`, or `notify_slack` respectively - the FUB tools work fine without them.

Also fill in `BRAND.md` at the repo root with your voice/tone/farm-area details - the content-generating skills (listing descriptions, market updates, social posts, open house follow-up) read it before drafting anything.

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

6. Run the test suite (unit tests for the pure/security-sensitive logic - signature verification, PKCE, template filling, query building, timing-safe comparisons - using Node's built-in test runner, no extra dependency):

```bash
npm test
```

## Real Geeks setup

Unlike the FUB API key, Real Geeks credentials aren't self-service:

1. Register as an integration at https://developers.realgeeks.com to get a partner `username`/`password` (shared across every Real Geeks site you sync to).
2. The Real Geeks site owner (you, for your own site) visits a grant URL specific to your integration and approves access.
3. Real Geeks emails you the `Site UUID` for that site - this is `REALGEEKS_SITE_UUID`.

Until those three env vars are set, `sync_lead_to_realgeeks` will fail with a clear "missing environment variable" error rather than a confusing API error.

## Slack setup

`notify_slack` posts through Slack Incoming Webhooks, not a full Slack app - see `skills/slack-review-queue/SKILL.md` for step-by-step setup and for what this integration deliberately does not do (no reading replies, no bot mentions, no automated metrics gathering).

## Speed-to-lead (webhooks)

`POST /webhooks/fub` receives Follow Up Boss webhook events and reacts within seconds - creating an urgent callback task and firing a Slack alert on every new lead, with an optional (off by default) automatic first-touch text. Full setup and a compliance note on the auto-text option are in `skills/speed-to-lead/SKILL.md`. Short version:

1. Deploy this server at a public HTTPS URL.
2. Configure a `speed-to-lead` channel in `SLACK_WEBHOOKS`.
3. Ask Claude to call `register_fub_webhook` with your deployed URL + `/webhooks/fub`.

No separate webhook secret is needed - signatures are verified using your existing `FUB_SYSTEM_KEY`.

## Deploying to Railway

1. Push this project to a GitHub repo (make sure `.env` is not committed - `.gitignore` already excludes it).
2. In Railway: New Project -> Deploy from GitHub repo, and select this repo.
3. Railway auto-detects Node.js and runs `npm install` then `npm start`. No Procfile is needed, but you can add one (`web: npm start`) if you prefer to be explicit.
4. In the Railway project's Variables tab, add whichever of these you need:
   - `FUB_API_KEY`, `FUB_SYSTEM`, `FUB_SYSTEM_KEY`
   - `MCP_AUTH_TOKENS` (required once public - a long random token; see "How auth works" above)
   - `OAUTH_PASSWORD` (required if connecting via a client that needs the OAuth login page, e.g. Claude's connector UI)
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (for `send_text`)
   - `REALGEEKS_USERNAME`, `REALGEEKS_PASSWORD`, `REALGEEKS_SITE_UUID` (for `sync_lead_to_realgeeks`)
   - `SLACK_WEBHOOKS` (for `notify_slack`)
   - `SPEED_TO_LEAD_SLACK_CHANNEL`, `AUTO_FIRST_TOUCH_SMS`, `FIRST_TOUCH_SMS_TEMPLATE`, `AGENT_NAME` (for speed-to-lead - see below)
5. Do not set `PORT` - Railway injects it automatically and `src/index.js` already reads `process.env.PORT`.
6. Deploy. Railway will give you a public URL like `https://your-app.up.railway.app`. Your MCP endpoint is:

```
https://your-app.up.railway.app/mcp
```

7. Configure your MCP client to connect to that URL with Streamable HTTP transport. In Claude's connector settings, this means going through the login page (`OAUTH_PASSWORD`) - the token you end up connected with is the same as `MCP_AUTH_TOKENS`, it's just obtained via the OAuth flow rather than pasted directly. For a client that supports a plain bearer token field instead, supply one of the `MCP_AUTH_TOKENS` values directly (`Authorization: Bearer <token>`).

## Notes & gotchas

- `add_lead` creates a person record directly via `POST /v1/people` and will **not** trigger lead-routing automations or Action Plans. Use `create_lead_event` (`POST /v1/events`) instead when the lead's source has an Action Plan mapped to it in Admin > Lead Flow and you want it to auto-fire - only `source` values that exactly match a configured Lead Source will trigger anything; otherwise it's logged like `add_lead`. `apply_action_plan` remains the manual fallback to enroll a lead in a sequence after the fact.
- `stage` on `add_lead`/`update_lead`/`create_lead_event` is free text matched against this account's actual pipeline stages - an unrecognized value silently falls back to a default stage instead of erroring (confirmed in practice: `"Attempting to Contact - Buyer"` silently became `"Lead"` when it didn't match a configured stage name). Call `list_pipeline_stages` first if the exact stage matters.
- FUB's `/textMessages` endpoint only records a log entry - it cannot deliver anything. `send_text` sends the real message through Twilio first, then logs it so it still shows up correctly on the FUB timeline.
- The FUB API can list Action Plans and enroll/pause people on them, but it cannot create or edit a plan's steps/content - new or edited sequences (subject lines, email bodies, wait times) still have to be built in the FUB UI under Automations. See `skills/fub-sequence-writer/SKILL.md` for how this repo works around that.
- There is no email-sending tool in this repo. `weekly-market-update` and similar skills produce drafts (optionally routed through `notify_slack` for review) that you still send through your own email tool/ESP.
- `skills/youtube-clip-agent/SKILL.md` is a setup/design guide, not a working integration - it depends on Higsfield and YouTube Analytics API credentials that aren't configured here. Read it before assuming clipping is automated.
- `/webhooks/fub` only handles `peopleCreated` today. FUB supports many more event types (stage changes, calls, texts, etc.) - extending `src/webhooks.js` to react to those is straightforward but deliberately not done until asked for, since each new automatic reaction is another thing that fires without a human in the loop.
- `AUTO_FIRST_TOUCH_SMS` is off by default on purpose - see the compliance note in `skills/speed-to-lead/SKILL.md` before turning it on.
- Rate limits: Follow Up Boss enforces roughly 1,000 requests per 10 minutes per API key, returning 429 if exceeded. `fubClient.js` retries a 429 or 5xx up to 3 times with backoff (honoring `Retry-After` when FUB sends one) before surfacing the error to the caller.
- Sessions are held in memory (a Map in `src/index.js`). That's fine for a single Railway instance; if you ever scale to multiple instances you'll need a shared session store instead.
- Auth's real credential is the static `MCP_AUTH_TOKENS` bearer token; `src/oauth.js` is a thin OAuth-shaped wrapper around it, kept only because Claude's custom-connector UI requires an OAuth handshake to connect at all (no plain token field). Its `/token` endpoint hands back the static token instead of generating one, so it survives restarts - an earlier version generated and stored real per-login tokens in memory and silently logged out every connected client on every redeploy. If `MCP_AUTH_TOKENS` is unset, the server accepts unauthenticated requests - only acceptable for local-only development, never for a public deployment.

## Skills

`skills/` contains Claude Skill definitions (`SKILL.md`) for the workflows this MCP server is meant to power - point Claude at this repo (or drop the skill folders into your skills directory) to use them. Content-generating skills read `BRAND.md` first for voice/tone.

**Lead flow & engagement:**
- `speed-to-lead` - automatic: new lead in FUB -> urgent task + Slack alert (+ optional auto-text) within seconds. See its compliance note before enabling auto-text.
- `daily-crm-debrief` - one morning snapshot (tasks due/overdue, Hot/Warm leads, missed calls) posted to Slack - the FUB equivalent of a Gmail/Calendar daily debrief.
- `stale-lead-revival` - find leads gone quiet and draft a specific win-back touch for each.
- `missed-call-followup` - find unanswered calls across the pipeline and draft same-day "sorry I missed you" texts.
- `fub-lead-scoring` - daily Hot/Warm/Cool follow-up list, scored on motivation, timeframe, financing, and recent engagement.
- `fub-lead-capture` - turn a screenshot of a text/email thread, or a quick spoken note, into a new lead + note.
- `expired-fsbo-prospecting` - turn an MLS-scraped or pasted expired/FSBO list into deduplicated, tagged FUB leads. Read its compliance note (DNC/TCPA) before contacting anyone it adds.
- `fub-sequence-writer` - draft personalized follow-up sequences (referencing your own video/content library) for FUB Action Plans.
- `openhouse-followup` - turn a sign-in sheet into logged leads plus same-day follow-up drafts.

**Content workflows:**
- `listing-description-writer` - MLS/social listing copy from property facts and photos.
- `weekly-market-update` - a general market update plus localized versions per farm area.
- `consultation-prep-sheet` - a one-page prep sheet from a lead's FUB history before a listing/buyer appointment.
- `social-media-content-batch` - five related social posts from one topic/theme.
- `buyer-seller-journey-visual` - a branded, interactive step-by-step buyer/seller journey artifact for consults and listing presentations.

**Operations:**
- `slack-review-queue` - how to set up and use `notify_slack` to route drafts to Slack for human review.
- `youtube-clip-agent` - a setup/design guide for a video-repurposing pipeline; **not wired up** (see Notes & gotchas).
