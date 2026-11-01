# BTP Analyzer (standalone)

Express + Postgres service serving the prototype (`public/index.html`) with `public/shim.js` standing in for Claude's `window.claude.use()`.

Run locally (in-memory DB when `DATABASE_URL` is empty):

    cp .env.example .env   # fill in, then export the vars
    npm install && npm start
    npm test

Status: Phases 1–2 done (auth, reports, `/api/ai`, `/api/comps/*`, admin API, tests with mocked Anthropic/DealMachine).
Next: Phase 3 (move prompts server-side, admin UI, usage views) and Phase 4 (Railway deploy). See `CLAUDE.md`.
Unverified: DealMachine response shapes (make one real call with a live key), and DealMachine's terms for client-facing use.
