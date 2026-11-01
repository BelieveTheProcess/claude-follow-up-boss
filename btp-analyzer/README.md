# BTP Analyzer (standalone)

Express + Postgres service serving the prototype (`public/index.html`) with `public/shim.js` standing in for Claude's `window.claude.use()`.

Run locally (in-memory DB when `DATABASE_URL` is empty):

    cp .env.example .env   # fill in, then export the vars
    npm install && npm start
    npm test

Status: Phases 1–3 done (auth, reports, server-side prompts via `/api/analyze-room`, `/api/analyze-docs`, `/api/parse-comps`, `/api/comps/*`, usage tracking, admin page at `/admin.html`).
Next: Phase 4 (Railway deploy, domain). See `CLAUDE.md`.
Unverified: DealMachine response shapes (make one real call with a live key), and DealMachine's terms for client-facing use.
