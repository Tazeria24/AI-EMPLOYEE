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

---

## Milestone 02 — Multi-tenancy
- date: 2026-09-13
- commit: (this commit)
- tests: `npm test` — 23 passed / 23 (Vitest): added org validation + role
  helper suite (parseBusinessProfile, canManageOrg — 7 cases)
- typecheck: `npm run typecheck` — pass
- lint: `npm run lint` — pass
- build: `npm run build` — pass (adds /onboarding; 10 routes + Proxy)
- tenant-isolation (RLS): **passed on real PostgreSQL 16**. Applied the
  migration to a throwaway local cluster (with supabase/tests/00_supabase_shim.sql
  emulating auth.uid()/roles) and ran supabase/tests/tenant_isolation.sql:
  acting as user A (authenticated) with A's JWT —
    - sees only own org / membership / business profile (1 each)
    - cannot see org B by id (0 rows)
    - can update own business profile (1 row)
    - cannot update org B's business profile (0 rows)
    - membership insert into org B blocked by RLS (insufficient_privilege)
    - confirmed no cross-tenant write landed
  Result: "TENANT ISOLATION TESTS PASSED", psql exit 0.
- manual QA (`npm start`, dummy Supabase env):
    - /onboarding unauthenticated → 307 → /login?redirect=/onboarding
    - /dashboard unauthenticated → 307 → /login?redirect=/dashboard
- security checks:
  - RLS enforced in DB AND org scoping in the service layer (getCurrentContext
    is always scoped to auth.uid())
  - membership helpers are SECURITY DEFINER with `set search_path = ''`
  - anon role is NOT granted access to tenant tables
  - onboarding write requires owner/admin (canManageOrg) before the DB call
- how to run the RLS tests locally (no Supabase CLI required):
    initdb + start a local PG cluster, then (as a superuser role):
    `psql -d app -f supabase/tests/00_supabase_shim.sql`
    `psql -d app -f supabase/migrations/0001_multi_tenancy.sql`
    `psql -d app -f supabase/tests/tenant_isolation.sql`
  On a real Supabase project the shim is unnecessary (auth.* already exists);
  run the migration via the Supabase CLI / SQL editor.
- failures/fixes:
  - first RLS test draft used psql var interpolation inside dollar-quoted DO
    blocks and confused org ids with user ids → rewrote to pass org ids via
    transaction-local GUCs (set_config), which any role can read

---

## Milestone 03 — Products
- date: 2026-09-13
- commit: (this commit)
- tests: `npm test` — 32 passed / 32 (Vitest): added product/category
  validation suite (parseProduct, parseCategory — 9 cases)
- typecheck: `npm run typecheck` — pass
- lint: `npm run lint` — pass
- build: `npm run build` — pass (adds /dashboard/products, .../new,
  .../[id]/edit; 13 routes + Proxy)
- products isolation (RLS): **passed on real PostgreSQL 16**. Applied shim +
  0001 + 0002, ran supabase/tests/products_isolation.sql as user A:
    - sees only own products; cannot see org B's
    - can create in own org; cannot update/delete org B's (0 rows)
    - product insert into org B blocked (insufficient_privilege)
    - confirmed org B product untouched
  Result: "PRODUCTS ISOLATION TESTS PASSED", psql exit 0.
  M02 tenant_isolation.sql re-run alongside: still PASSED (no regression).
- manual QA (`npm start`, dummy env):
    - /dashboard/products unauthenticated → 307 → /login?redirect=/dashboard/products
    - /dashboard/products/new unauthenticated → 307 → /login
- security checks:
  - products/categories RLS: members read, owner/admin write; anon no access
  - actions guard canManageOrg before writing; writes scoped to ctx.organizationId
  - search input has LIKE wildcards escaped before ILIKE
  - members (non-admin) get a read-only list (no New/Edit/Archive controls)
- notes:
  - "archive" implemented as soft delete via status='archived'
  - search via ILIKE on name/sku (full-text deferred)
  - SKU unique per organization (partial unique index; 23505 surfaced as a
    friendly "SKU already exists" message)

---

## Milestone 04 — Knowledge Base
- date: 2026-09-13
- commit: (this commit)
- tests: `npm test` — 53 passed / 53 (Vitest): added chunking (7),
  stub embedder + provider resolution (8), knowledge validation (6)
- typecheck: `npm run typecheck` — pass
- lint: `npm run lint` — pass
- build: `npm run build` — pass (adds /dashboard/knowledge, .../new;
  15 routes + Proxy)
- migrations: 0001 + 0002 + 0003 apply cleanly on PostgreSQL 16 with
  pgvector 0.6.0 (HNSW index on vector(1536), cosine ops)
- knowledge isolation (RLS + retrieval): **passed on real PostgreSQL**.
  supabase/tests/knowledge_isolation.sql, acting as user A:
    - sees only own document/chunk; 0 rows for org B
    - retrieval in own org returns 1 row (positive control — not vacuous)
    - **CRITICAL: match_knowledge_chunks(orgB_id, <exact-match vector for org
      B's chunk>) returns 0 rows** — the RPC is SECURITY INVOKER so RLS gates
      it; a foreign org id leaks nothing
    - no returned content contained org B's text
    - chunk insert into org B blocked (insufficient_privilege); document
      update on org B affected 0 rows; org B data intact afterwards
  Result: "KNOWLEDGE ISOLATION TESTS PASSED", psql exit 0.
  M02 + M03 suites re-run alongside: still PASSED (no regression).
- end-to-end retrieval ranking (real stub embeddings → pgvector):
  seeded two documents via the actual chunker + stub embedder, serialized with
  the same JSON.stringify path used by processing.ts, then queried
  "how long does delivery take in Lagos":
    delivery chunk similarity 0.3299 (rank 1) vs sizing chunk 0.0917 (rank 2).
  Confirms vector serialization round-trips and ranking is correct.
- manual QA (`npm start`, dummy env):
    - /dashboard/knowledge unauthenticated → 307 → /login?redirect=...
    - /dashboard/knowledge/new unauthenticated → 307 → /login
- security checks:
  - retrieval RPC is SECURITY INVOKER; organization id is a scoping hint, never
    the authorization boundary (RLS is) — verified by the cross-tenant test
  - organizationId always derived server-side from the session, never client input
  - knowledge tables: members read, owner/admin write; anon no access
  - stub embedder runs locally: no network calls, no third-party data sharing,
    no spend while the provider decision (ADR-008/009) is open
- notes / limits:
  - the stub embedder is lexical (hashing vectorizer), NOT semantic — it
    exercises the full pipeline but must be replaced before production
  - indexing runs synchronously in the request (ADR-030); large documents will
    need a background job before beta
