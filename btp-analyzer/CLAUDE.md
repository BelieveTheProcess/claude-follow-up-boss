# Believe the Process Analyzer: standalone web app

Owner: Adan Mantilla (California real estate agent and investor, SF Bay Area).
Goal: turn the working prototype in `prototype/btp-analyzer.html` into a real web app his buyer clients and investor partners can open on their phones, without needing a Claude account.

Read this whole file first, then `docs/dealmachine-api.md`. Start with Phase 1.

## What the product does

Walk a property, take photos, get a ballpark repair budget. One engine, two modes (Buyer: plain language and a simple range; Investor: contractor-style scope, contingency, category breakdown, 70% rule).

Features already working in the prototype (all in one HTML file):
1. **Scan rooms:** upload up to 8 photos per room, Claude vision returns materials, issues, severity, low/high costs. Costs are editable and each item can be toggled on or off.
2. **Rehab calculator:** quick tiers (light, medium, full) at a cost per sq ft, plus 13 line-item categories (skip, light, medium, full, with manual override). Both stay in sync. Scanner findings show as hints per category.
3. **Inspection reports:** upload PDF, page photos, or pasted text. Claude extracts findings, prices them, and when a finding matches a photo item the report estimate replaces the photo estimate. Uses pdf.js (cdnjs 3.11.174) to read PDF text; scanned PDFs fall back to page images.
4. **Quick CMA:** address in, DealMachine comps out (top 3 closest in size shown). Also paste comps or upload screenshots and Claude parses them. Window follows Adan's rule: start at 0.25 mile and 90 days, widen as needed (0.25 to 1 mile, 90 to 365 days), prefer comps closest in living area. Optional "renovated comps" toggle shows as-is value and the 70% rule max offer.
5. **Saved reports:** per-user saved reports (rooms, calculator, findings, CMA).

Planned later (do not build yet): LiDAR floor plan scanner (needs a native iOS app using Apple RoomPlan), AI chat assistant on every screen, property lookup links, client branding.

## How the prototype runs today (important)

It is a single HTML file hosted inside Claude. It uses Claude's `window.claude.use(...)` capabilities:

| Prototype call | What it does | Standalone replacement |
|---|---|---|
| `claude.use('sample')` then `sample.json(prompt, {images, signal})` and `sample.limits()` | Claude text/vision call returning parsed JSON | `POST /api/ai` on our server, which calls the Anthropic Messages API |
| `claude.use('db')` then `db.collection(path).get()`, `.doc(id).set(obj)`, `.doc(id).delete()` | Per-user saved reports | `/api/reports` backed by Postgres, scoped to the logged-in user |
| `claude.use('user')` then `user.id()` | Current user id | `GET /api/me` |
| `claude.use('mcp')` then `mcp.callTool('DealMachine', tool, input)` | Viewer's DealMachine connector | `POST /api/comps/match` and `POST /api/comps/search` on our server using one DealMachine API key |

Recommended approach: write a small `public/shim.js` that defines `window.claude.use()` with the same interface, backed by `fetch` to our API. Then the prototype's feature code runs almost unchanged. Once stable, refactor the shim away and move the prompt-building to the server.

All prompts are built inside the page today (search `buildPrompt`, `buildDocPrompt`, `COMP_SCHEMA`). Phase 3 moves them server-side so clients cannot send arbitrary prompts.

## Target architecture

- **One Node 20+ service** (Express), serving `public/` (the front end) and `/api/*`.
- **Postgres** (Railway plugin, `DATABASE_URL`). Tables: `users`, `reports` (user_id, id, name, json, updated_at), `usage` (user_id, day, ai_calls).
- **Auth:** invite-only. Adan creates client accounts or shares an invite code. Email plus password, hashed with Node's built-in `crypto.scrypt`. Session in an HttpOnly, Secure, SameSite=Lax signed cookie. No third-party auth needed for v1.
- **AI:** Anthropic Messages API via `fetch` (`https://api.anthropic.com/v1/messages`, headers `x-api-key` and `anthropic-version: 2023-06-01`). Model from env `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`. Images go as base64 `image` blocks (JPEG). Ask for JSON only, strip code fences, `JSON.parse`, return 502 with a friendly code on failure.
- **Limits:** per-user daily AI call cap (env `DAILY_AI_LIMIT`, default 40), max 8 images per request, max 1.5 MB per image after client-side resize, max prompt 250 KB, request timeout 120 s. Rate-limit auth endpoints.
- **DealMachine:** server-side only, one key in env `DEALMACHINE_API_KEY`. See `docs/dealmachine-api.md`.
- **Secrets** only in env vars. Never ship keys to the browser. `.env` in `.gitignore`.

## Environment variables

```
DATABASE_URL=            # Railway Postgres
SESSION_SECRET=          # long random string
ANTHROPIC_API_KEY=       # from console.anthropic.com (separate from a Claude.ai subscription, billed by usage)
ANTHROPIC_MODEL=claude-sonnet-5-5
DEALMACHINE_API_KEY=     # dm_sk_live_..., created in DealMachine Settings > Developer
INVITE_CODE=             # optional shared code for client sign-up
DAILY_AI_LIMIT=40
```

## Phases

**Phase 1: skeleton that runs locally**
- Express app, Postgres migrations on boot, `/api/health`.
- Auth: sign-up (invite code), login, logout, `/api/me`.
- Serve the prototype as `public/index.html` with `shim.js` loaded first.
- Reports CRUD behind auth.
- Tests: use PGlite (`@electric-sql/pglite`) or a local Postgres for tests; mock `fetch` for Anthropic and DealMachine.

**Phase 2: AI and comps endpoints**
- `/api/ai`: prompt, optional images (base64), returns parsed JSON. Enforce limits.
- `/api/comps/match` (address to property id and details) and `/api/comps/search` (property id, radius, timeframe to comps). Shape the responses so the existing page code keeps working (see doc).
- Smoke test every tab end to end with mocks.

**Phase 3: harden**
- Move prompts server-side (`/api/analyze-room`, `/api/analyze-docs`, `/api/parse-comps`).
- Usage tracking per user, an admin view for Adan (list users, usage, disable a user).
- Error copy for every failure code (see the existing `errCopy` and `dmErr` in the prototype).

**Phase 4: deploy**
- GitHub repo, Railway project with Postgres plugin, env vars set, deploy from GitHub.
- Optional custom domain, such as a subdomain of believetheprocess.com.
- Add a clear disclaimer on first use (already in the prototype: ballpark estimates, not an inspection, appraisal, or bid). Adan wants this kept.

## Things to get right

- **Do not guess DealMachine behavior.** Endpoints in `docs/dealmachine-api.md` were read from DealMachine's official CLI source; the response shapes were observed from DealMachine's MCP connector. Make one real call per endpoint with Adan's key and compare before trusting the shapes.
- **Terms of use:** DealMachine lists "apps powered by DealMachine" under API licensing. Before showing DealMachine data to clients inside the app, Adan should confirm his plan allows it. Build the comps provider behind one file (`server/providers/dealmachine.js`) so it can be swapped for an MLS/IDX feed.
- **Costs:** every room scan, report analysis, and comp parse is a paid Anthropic API call. Keep the daily cap and log usage.
- **Privacy:** inspection reports and photos are sensitive. Do not store uploaded files or photos on the server in v1 (the prototype keeps only tiny thumbnails inside saved reports). Do not log prompts or document text.
- **California is a disclosure state**, so comps include sale prices; in non-disclosure states DealMachine may return fewer prices. Handle empty results gracefully.
- Keep the UI mobile-first. Most use happens on a phone during a walkthrough.
- Typographic punctuation in visible text (’ and “ ”), as in the prototype.

## Known gaps in the prototype

- The scanner, report analysis, and comp parsing were tested with mocked responses and one live test of the photo estimator by Adan. Report analysis with a real long PDF is untested.
- The PDF reader loads pdf.js from cdnjs; the worker file may need to be self-hosted if the CDN worker is blocked.
- Reports are not shareable between users yet. A "share with client" link is a good v2 feature (agent creates a report, client views it read-only).
- Comps are not adjusted for condition, lot, view, or upgrades. This is a quick estimate, not a CMA or appraisal, and the UI says so.

## Who the users are

- **Buyer clients** (non-technical): want "what should I worry about and what might it cost."
- **Investors and flippers:** want a rehab budget, contingency, and max offer.
Both need honest ranges, never false precision.
