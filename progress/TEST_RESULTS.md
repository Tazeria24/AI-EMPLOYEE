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

---

## Milestone 05 — AI Agent (PARTIAL)
- date: 2026-09-13
- commit: (this commit)
- tests: `npm test` — 81 passed / 81 (Vitest), up from 53. Added: grounding
  guardrail (9), untrusted-content wrapping (4), lead capture validation (5),
  agent loop with a scripted provider (9), embedding provider resolution (1)
- typecheck: `npm run typecheck` — pass
- lint: `npm run lint` — pass
- build: `npm run build` — pass (adds /dashboard/assistant; 16 routes + Proxy)
- migrations: 0001–0005 apply cleanly on PostgreSQL 16 + pgvector 0.6.0;
  `knowledge_chunks.embedding` confirmed as `vector(1024)` after 0004
- isolation suites: **all four PASSED on real PostgreSQL**, psql exit 0 —
  tenant, products, knowledge (incl. cross-tenant retrieval), and the new
  agent suite (customers/leads/lead_events/agent_runs). No regressions.
  The agent suite proves a lead or agent_run cannot be written into another
  organization even when the organization id passed in is a foreign one —
  the shape a prompt-injection or a bug would take.
- manual QA (`npm start`, dummy env):
    - /dashboard/assistant unauthenticated → 307 → /login?redirect=...
- agent-loop behaviour verified deterministically (scripted provider, no API):
    - grounded reply after a tool call → allowed
    - invented price after a tool call → BLOCKED, escalated, safe fallback
    - price stated with no tool call at all → BLOCKED
    - escalate_to_human → turn marked escalated
    - model that never stops calling tools → stopped at the 4-iteration cap
    - unknown tool name → handled, not thrown
    - empty reply → blocked
    - customer message is wrapped as <untrusted> before being sent
    - token usage accumulates across iterations

### NOT DONE — acceptance criterion not met
tasks/05 requires "at least 100 representative conversations are evaluated".
**No live model evaluation has been run.** This environment has no
ANTHROPIC_API_KEY or VOYAGE_API_KEY, and no Supabase project, so:
  - the 105 eval cases exist (`evals/cases.json`, 15 categories from
    docs/AI_AGENT.md) and `npm run eval` prints a cost estimate (~$2.05 for
    105 cases before prompt caching), but the runner stops before executing:
    it still needs wiring to an authenticated org so the tools read a real
    catalogue and knowledge base
  - real model behaviour (grounding under pressure, injection resistance,
    escalation judgement) is therefore UNVERIFIED
  - real retrieval quality is UNVERIFIED: retrieval has only ever been
    exercised with the lexical stub embedder, never with Voyage
Treat Milestone 05 as implementation-complete and evaluation-pending.

- security checks:
  - every tool handler receives organizationId from the session, never from
    model output; RLS enforces the same boundary independently (proved above)
  - customer text and retrieved chunks are wrapped as untrusted data, with
    delimiter-forgery neutralized (tested)
  - price/stock claims are verified against tool results before a reply is
    released; unverifiable claims escalate instead of going out (tested)
  - hard cap of 4 tool iterations per turn bounds spend per customer turn
  - Voyage error bodies are never surfaced to callers (they can echo content)
  - `npm test` runs with no API key and makes no network calls

---

## Milestone 06 — Conversations
- date: 2026-09-13
- commit: (this commit)
- tests: `npm test` — 90 passed / 90 (Vitest), up from 81. Added the
  conversation state machine suite (9 cases: legal/illegal transitions, who may
  post in each state, status labels)
- typecheck: `npm run typecheck` — pass
- lint: `npm run lint` — pass
- build: `npm run build` — pass (adds /dashboard/conversations and
  /dashboard/conversations/[id]; 18 routes + Proxy)
- migrations: 0001–0006 apply cleanly on PostgreSQL 16 + pgvector. 0006 also
  closes the leads.conversation_id foreign key deferred in 0005 (ADR-041), and
  guards the supabase_realtime publication so plain PostgreSQL still applies it.
- isolation suites: **all five PASSED**, psql exit 0 — tenant, products,
  knowledge, agent, and the new conversations suite. No regressions.

### The human-takeover race (audit finding #12) — closed and proved
Sequential gate (`conversations_isolation.sql`):
  - AI_ACTIVE → append_ai_message inserts (returns an id)
  - human takes over → append_ai_message returns NULL, writes nothing, and the
    discarded text exists nowhere in the table
  - CLOSED → also refused
  - handed back to AI_ACTIVE → posts again
  - unknown conversation id → returns NULL rather than erroring
  - append_ai_message against another organization's conversation → NULL

**Genuine two-connection concurrency test** (the part a sequential test cannot
prove). Session A opened a transaction, set status='HUMAN_ACTIVE' and held the
row lock without committing; Session B then called append_ai_message:
  - Session B **blocked for 1603 ms** on `select ... for update`
  - after A committed, B observed HUMAN_ACTIVE, returned NULL
  - messages written to that conversation: **0**
  - final status: HUMAN_ACTIVE
An application-level status check would have read AI_ACTIVE before A committed
and posted the reply anyway. This is why the check and the insert live in one
locked function rather than in the app.

- manual QA (`npm start`, dummy env):
    - /dashboard/conversations unauthenticated → 307 → /login?redirect=...
    - /dashboard/conversations/[id] unauthenticated → 307 → /login
- security checks:
  - conversations/messages RLS: members read, owner/admin write; no anon
  - append_ai_message is SECURITY INVOKER, so RLS gates it exactly like a
    direct query (verified: it refuses another org's conversation)
  - human replies are rejected unless the conversation is HUMAN_ACTIVE, both in
    the pure state machine and before the insert
  - customer text from history is re-wrapped as untrusted before reaching the
    model, same as a fresh message
  - a discarded AI reply is logged to agent_runs as blocked_reason='taken_over'
    and surfaced in the UI rather than silently dropped
- not verified here: real AI replies inside a thread still need
  ANTHROPIC_API_KEY / VOYAGE_API_KEY / a Supabase project, as in M05. Realtime
  delivery itself is likewise unverified (no Supabase project); the 15s poll is
  the reason the inbox still works without it.

---

## Milestone 07 — Leads
- date: 2026-09-13
- commit: (this commit)
- tests: `npm test` — 99 passed / 99 (Vitest), up from 90. Added the lead status
  model suite (9 cases: status list matches the DB constraint, terminal states,
  safe validation of unknown values, transition classification incl. reopen)
- typecheck: `npm run typecheck` — pass
- lint: `npm run lint` — pass
- build: `npm run build` — pass (adds /dashboard/leads and /dashboard/leads/[id];
  20 routes + Proxy)
- isolation suites: **all six PASSED** on real PostgreSQL 16, psql exit 0 —
  tenant, products, knowledge, agent, conversations, and the new leads suite.
  No regressions.
- the leads suite covers the pipeline operations specifically (M05's agent suite
  covered the raw tables). As user A:
    - sees only own leads and lead events; org B's intent text never appears
    - can move own lead through statuses, score it and add notes
    - cannot move org B's lead (0 rows), cannot rewrite its score/notes (0 rows)
    - cannot write to org B's activity timeline (insufficient_privilege)
    - cannot delete org B's lead (0 rows)
    - afterwards org B's status, score, notes and event count are unchanged
- manual QA (`npm start`, dummy env):
    - /dashboard/leads unauthenticated → 307 → /login?redirect=...
    - /dashboard/leads/[id] unauthenticated → 307 → /login
- security checks:
  - every action re-derives organizationId from the session and scopes writes
    with `.eq("organization_id", ctx.organizationId)` on top of RLS
  - members (non-admin) get a read-only pipeline: no status buttons, no edit form
  - lead status from the form is validated against the status list before use,
    so an edited form value cannot write an unknown status
  - creating a lead from a conversation refuses to create a duplicate for a
    conversation that already has one
- notes:
  - score is manual (ADR-042); the AI does not guess one
  - transitions are permissive but every change is recorded (ADR-043)
- not verified here: AI-captured leads end-to-end still need a live model and
  Supabase project, as in M05/M06. The create_lead → conversation link is
  covered by typecheck and the isolation suite, not by a live run.
