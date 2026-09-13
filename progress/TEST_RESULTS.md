# Test Results

For every milestone record:
- date
- commit
- tests
- typecheck
- lint
- manual QA
- security checks
- failures/fixes

---

## Milestone 00 — Foundation
- date: 2026-09-13
- commit: (this commit)
- tests: `npm test` — 6 passed / 6 (Vitest): cn util (3), health route (1), Button (2)
- typecheck: `npm run typecheck` — pass (tsc --noEmit, 0 errors)
- lint: `npm run lint` — pass (eslint, 0 errors)
- build: `npm run build` — pass (Next 16, routes /, /_not-found, /api/health)
- manual QA: `npm start` smoke test — GET /api/health → 200 `{status:"ok"}`; `/`
  renders with title "AI Sales Employee"
- security checks:
  - no secrets committed (.env* gitignored; only .env.example tracked)
  - `npm audit` — 0 vulnerabilities at install time
  - service-role key access isolated to a server-only accessor (lib/env.ts);
    Supabase clients use the public anon key only
- failures/fixes:
  - typecheck failed on generated `LayoutProps` global → typed layout props
    explicitly so typecheck is independent of build order
  - Button test matched multiple nodes → added afterEach(cleanup) setup file
  - .env.example was ignored by `.env*` → added `!.env.example` negation
