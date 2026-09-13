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

---

## Milestone 01 — Authentication
- date: 2026-09-13
- commit: (this commit)
- tests: `npm test` — 16 passed / 16 (Vitest): added auth validation suite
  (email/password validation, parseCredentials, parseEmail — 10 cases)
- typecheck: `npm run typecheck` — pass
- lint: `npm run lint` — pass
- build: `npm run build` — pass (routes /, /login, /signup, /forgot-password,
  /reset-password, /auth/confirm, /dashboard, /api/health + Proxy)
- manual QA (`npm start` with dummy Supabase env):
  - /login, /signup, /forgot-password → 200
  - /dashboard unauthenticated → 307 → /login?redirect=/dashboard
  - /auth/confirm without token → 307 → /login?error=... (safe message)
  - /reset-password without recovery session → 307 → /login?error=...
- security checks:
  - route protection enforced in proxy (getUser revalidates the token; cookies
    are not trusted alone) AND a server-side guard in the dashboard layout
    (defense in depth)
  - password reset does not reveal whether an email is registered (no user
    enumeration)
  - all form input validated server-side before any Supabase call
  - no secrets in client; anon key only in browser/server clients
- failures/fixes:
  - Next 16 deprecates the `middleware` filename → migrated to `proxy.ts`
    (function renamed to `proxy`); build warning cleared
  - initial smoke test hit a stale leftover `next start` server (old build) →
    killed strays and retested on a fresh port; all routes correct
