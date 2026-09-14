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

---

## Milestone 08 — Automations
- date: 2026-09-14
- commit: (this commit)
- tests: `npm test` — 114 passed / 114 (Vitest), up from 99. Added the
  eligibility suite (15 cases: inactivity window and its boundary, opt-out,
  won/lost, follow-up numbering, never a third, unparseable timestamps,
  quiet hours, timezone reading with a safe fallback, deferral to morning)
- typecheck / lint: pass
- build: `npm run build` — pass (adds /dashboard/automations and
  /api/cron/automations; 22 routes + Proxy)
- isolation suites: **all seven PASSED** on real PostgreSQL 16, psql exit 0.
  No regressions.

### The follow-up cap (audit finding #11) — enforced by the database
`automations_isolation.sql` proves the constraints, not the application:
  - follow-ups #1 and #2 insert normally
  - a **third** follow-up is rejected (check_violation) — there is no valid
    third number
  - a **retry of #1** is rejected (unique_violation) — this is what makes a
    scheduler retry safe
  - a run marked `sent` with **no** follow-up number is rejected, closing the
    loophole of dodging the cap with a null
  - exactly 2 runs remain for the lead afterwards

### Atomic run claiming — two-connection race
Worker A claimed a scheduled run inside an uncommitted transaction; Worker B
then called `claim_automation_run` on the same run:
  - Worker A received the run id (claimed)
  - Worker B **blocked 1608 ms**, then received **NULL**
  - final status: `running` — exactly one worker executes
This is the overlapping-cron-firing scenario, which an application-level
"is it still scheduled?" check would not survive.

- manual QA (`npm start`, dummy env):
    - POST /api/cron/automations with no secret → **401**
    - POST with a wrong secret → **401**, body `{"error":"unauthorized"}`
      (does not reveal whether the secret is unset or merely wrong)
    - GET /api/cron/automations → 405
    - /dashboard/automations unauthenticated → 307 → /login?redirect=...
- security checks:
  - cron secret compared with `timingSafeEqual`, after a length check
  - the cron path uses the service-role client (no user session exists), so
    RLS does not apply there — every query is explicitly filtered by
    organization_id, including the lead lookup inside executeRun
  - automations are created **disabled**; nothing is sent on a business's
    behalf until they turn it on
  - opt-out is re-checked at send time, not only when scheduling
  - AI-drafted follow-ups pass through the grounding guardrail: with no tools
    called there is no evidence, so any price/stock figure fails the draft
  - per-invocation cap of 25 runs bounds the work one firing can do
- not verified here: AI-drafted follow-up text and real email delivery need
  ANTHROPIC_API_KEY / RESEND_API_KEY and a Supabase project, as in M05–M07.
- known limitation (ADR-050): conversation-delivered follow-ups are recorded
  but do NOT reach the customer until the widget (M09) or WhatsApp (M10)
  exists. Email is currently the only channel that actually leaves the
  building.

---

## Milestone 09 — Website Widget
- date: 2026-09-14
- commit: (this commit)
- tests: `npm test` — **144 passed / 144** (18 files). New: widget input
  validation (12 — widget-key and session-token shape, message length, the
  frame-ancestors builder, refusal-to-message mapping) and widget settings
  validation (allowed-origin parsing incl. CSP-breaking payloads, hex colour,
  greeting length, every cap bound).
- typecheck / lint: pass
- build: `npm run build` — pass (adds /dashboard/widget, /widget/[key] and the
  four /api/widget/* routes; 28 routes + Proxy)
- isolation suites: **all eight PASSED** on real PostgreSQL 16, psql exit 0.
  No regressions.

### The public surface (audit finding #10) — proved by grant, not by argument
`widget_isolation.sql` asserts that `anon`:
  - holds **no** select/insert/update/delete on any of the 14 business tables
    (widget settings/sessions/usage, products, knowledge, conversations,
    messages, leads, customers, organizations, business profiles, agent runs)
  - **can** execute exactly the four widget functions
  - **cannot** execute `match_knowledge_chunks` or `append_ai_message` —
    PostgreSQL's default PUBLIC grant on those was found open during this
    milestone and is now revoked in migration 0008
It also asserts `widget_config` returns exactly
`business_name, greeting, theme_color` — no price, no knowledge, no
organization id — and that an unknown key is indistinguishable from a
disabled one (0 rows either way).

### The spend caps — enforced by the database
  - per-session cap: with the cap at 2, messages 1 and 2 are accepted, the
    third returns `session_limit`, and exactly 2 messages are stored
  - a refused message does **not** consume quota (the daily counter is
    unchanged), so refusals cannot themselves become a denial of service
  - per-organization daily message cap: the next message returns `org_limit`
    and the counter is restored
  - per-organization daily session cap: the next session returns
    `rate_limited` and the counter is restored — this is what stops opening
    fresh sessions being a way around the per-session limit
  - a widget switched off mid-chat refuses an **existing** token too, not just
    new sessions
  - a B token only ever writes under org B, and is invisible as an A session

### Concurrent messages on one session — two-connection race
Per-session cap set to 1. Worker A called `widget_send` inside an uncommitted
transaction; worker B called it on the same session 0.3s later:
  - Worker A: `ok`
  - Worker B: **blocked 1204 ms**, then `session_limit`
  - final state: 1 message stored, `message_count` = 1, daily counter = 1
Without the row lock both would have read "under the cap" and both would have
called the model. This is the cost-amplification attack in miniature.

- manual QA (`npm start`, dummy env):
    - /dashboard/widget unauthenticated → 307 → /login?redirect=...
    - GET /api/widget/config?key=nope → 404 `{"error":"not_found"}`
    - GET /api/widget/config with a well-formed but unknown key → 404, same body
    - POST /api/widget/session with a malformed key → 404
    - POST /api/widget/message with a malformed token → 404
    - POST /api/widget/message with a 2100-character message → 400
    - GET /api/widget/embed?key=<32 hex> → 200 `application/javascript`
    - GET /api/widget/embed?key=../../etc/passwd → 400
    - GET /widget/<key> → 200, `content-security-policy: frame-ancestors *`
      (no business configured in this environment, so it renders the neutral
      "not available" state)
    - GET /login and GET / → `frame-ancestors 'none'` + `X-Frame-Options: DENY`
- security checks:
  - the tenant is never named by the caller: the visitor holds a 256-bit
    session token and the database resolves it to an organization
  - the AI turn runs with the service-role client (a visitor has no session),
    so RLS does not apply there — `listProducts` and `listMessages` now
    **require** an explicit organizationId when a client is injected and throw
    without one. `listProducts` previously relied on RLS alone, which would
    have been cross-tenant on this path; found and fixed during this milestone
  - `match_knowledge_chunks` already filters on `p_organization_id` inside the
    function, so retrieval stays scoped under a service-role client
  - allowed origins are validated against a strict `scheme://host[:port]`
    shape before reaching the CSP header; `"; script-src *"`, `'unsafe-inline'`,
    `*` and wildcard hosts are all rejected (unit-tested)
  - the theme colour is re-checked against a hex literal in the client before
    it reaches a style value
  - the widget starts **disabled** for every organization; turning it on is an
    owner/admin action and is the kill switch for the whole public surface
  - sessions are created on first message, not page load, so ordinary traffic
    cannot exhaust the daily session quota
- not verified here: a complete live visitor conversation needs
  ANTHROPIC_API_KEY / VOYAGE_API_KEY and a Supabase project, as in M05–M08.
  Everything above the model call is proved; the model's answers are not.
- known limitation (ADR-058): the widget does **not** close ADR-050's delivery
  gap. A widget session is not resumable, so a follow-up posted into a widget
  conversation is never seen by the visitor. Email remains the only channel
  that reaches a customer unprompted.

---

## Milestone 10 — WhatsApp (PARTIAL — see "not verified" below)
- date: 2026-09-14
- commit: (this commit)
- tests: `npm test` — **193 passed / 193** (22 files). New: signature
  verification (15 — valid, tampered body, wrong secret, absent secret, six
  malformed header shapes, upper-case hex, and a raw-bytes-vs-reparsed-JSON
  case), the verify-token handshake (5), inbound payload parsing (13 — text,
  status callback, non-text, truncation, missing ids, no routing id, and eight
  malformed bodies), the 24-hour window (8), connection-form validation (8).
- typecheck / lint: pass
- build: `npm run build` — pass (adds /api/webhooks/whatsapp and
  /dashboard/whatsapp; 30 routes + Proxy)
- isolation suites: **all nine PASSED** on real PostgreSQL 16, psql exit 0.
  No regressions.

### Replay protection (audit finding #13) — a constraint, not a memory
`whatsapp_isolation.sql` proves:
  - the first `claim_integration_event` for a Meta message id returns an id
  - a **redelivery of the same id returns NULL** — so no second AI reply
  - only **one** `integration_events` row exists afterwards
  - a direct duplicate insert is rejected (`unique_violation`)
  - **cross-tenant replay** of a captured event id is rejected by the same
    constraint
  - one customer per WhatsApp number per organization (`unique_violation` on a
    duplicate), so concurrent deliveries cannot fork a conversation — while the
    same number at a *different* business is correctly a different customer

### Concurrent redelivery — two-connection race
Worker A claimed `wamid.RACE` inside an uncommitted transaction; worker B
attempted the same event 0.3s later:
  - Worker A: claimed (returned an id)
  - Worker B: **blocked 1202 ms**, then returned **NULL**
  - one row recorded
This is Meta retrying before the first delivery has committed — the case an
application-level "have we seen this id?" check does not survive.

### Credentials are write-only for the dashboard
  - `has_column_privilege('authenticated', …, 'select')` is **false** for
    `verify_token`, `app_secret` and `access_token`, and **true** for `update`
  - selecting `app_secret` or `access_token` as `authenticated` raises
    `insufficient_privilege` — a privilege error, not an empty result
  - `whatsapp_integration_status` reports them as booleans only, and is
    tenant-scoped even though it runs as its owner (org B is invisible through it)
  - `anon` holds nothing on `whatsapp_integrations`, `integration_events` or
    the status view, and cannot execute `claim_integration_event`
  - a newly created organization gets an integration row with `enabled = false`

- manual QA (`npm start`, dummy env):
    - GET the webhook with a wrong verify token → **403**
    - GET with missing hub params → **403**
    - POST with no signature → **401** `{"error":"unauthorized"}`
    - POST with a valid-looking signature for an unknown phone number id →
      **401** (fails closed; indistinguishable from a forged signature, so
      probing reveals nothing about which businesses are connected)
    - POST a tampered body with an otherwise-valid signature → **401**
    - POST a status callback (delivered/read, no `messages`) → **200**, no work
    - POST non-JSON → **200**, no work (no retry storm)
    - /dashboard/whatsapp unauthenticated → 307 → /login?redirect=...
- security checks:
  - the signature is computed over the **raw body**, before any JSON parse
    (unit-tested against a reparsed-but-equivalent body, which must fail)
  - constant-time comparison for both the signature and the verify token, with
    a length pre-check so a mismatched length returns false instead of throwing
  - the payload is parsed before verification **only to route** — to read
    `phone_number_id` — and nothing is written, sent or spent until the
    signature passes. The parser is pure and tested against eight malformed
    bodies, so it cannot itself be a vector
  - the tenant is resolved from the database by `phone_number_id`; nothing in
    the payload chooses an organization (ADR-063, revising ADR-054's "second
    and last" service-role exception)
  - a verified message for a **disabled** integration is dropped without
    calling the model
  - human takeover still wins: the reply goes through `append_ai_message`, and
    a discarded reply is not sent over WhatsApp either
  - non-text messages get a fixed reply with no model call
- **not verified here — M10 is PARTIAL.** `developers.facebook.com` is blocked
  by this environment's egress proxy, and there are no Meta test credentials,
  no `ANTHROPIC_API_KEY` and no Supabase project. So `tasks/10`'s acceptance
  criterion — "test environment supports verified inbound → AI → outbound" —
  is **not met**. What is proved: signature verification, the handshake,
  payload parsing, the window rule, replay protection (including under
  concurrency) and tenant isolation. What is not: a real round trip against
  Meta's sandbox, the exact live payload shape, and the send call against the
  real Cloud API. Closing it needs a Meta test number plus the same API keys
  and Supabase project M05 has been waiting on.
- known limitation (ADR-065/066): no message templates, so WhatsApp reaches a
  customer unprompted only within 24 hours of their last message. Beyond that,
  email is still the only channel that gets through.
