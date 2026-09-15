# Architecture Decisions

## ADR-001 — Start with Nigerian online retailers
Reason: repetitive catalog/customer questions, strong WhatsApp/Instagram usage, clear sales workflow.

## ADR-002 — Website widget before WhatsApp
Reason: allows the core AI/conversation engine to stabilize before external-channel complexity.

## ADR-003 — Multi-tenant from the beginning
Reason: tenant isolation is difficult and risky to retrofit.

## ADR-004 — Tool-based AI
Reason: business actions/data access must be constrained and auditable.

## ADR-005 — Vercel Cron initially
Reason: simplest low-cost scheduler for MVP. Replace only when scale requires a dedicated queue/job system.

## ADR-006 — Provider abstraction
Reason: avoid locking product architecture to one AI model/provider.

## ADR-007 — MVP AI tool set (accepted)
Decision: the MVP agent ships exactly these tools — search_products, search_knowledge, get_business_hours, create_lead, update_lead, create_followup, escalate_to_human.
Reason: resolves the contradiction between CLAUDE.md/ARCHITECTURE and tasks/05. `check_order` is deferred because there is no `orders` table in DATABASE.md, so it would have no verified data to read and would risk inventing order status.
Follow-up: introduce `check_order` only alongside an explicit `orders` model in a future ADR.

## ADR-008 — AI provider and model (PROPOSED — pending founder confirmation)
Context: docs mandate a provider abstraction but name no default; a default is needed to build tasks/05 and to pin embedding behavior.
Recommendation: default to Anthropic Claude behind the ai/provider interface, keeping the interface provider-agnostic so it can be swapped.
Boundary: this is a major paid infrastructure dependency (CLAUDE.md decision boundary) — founder must confirm the provider/account before it is wired.

## ADR-009 — Embedding model and pgvector dimensions (PROPOSED — pending founder confirmation)
Context: tasks/04 (knowledge base) cannot fix a `knowledge_chunks.embedding` column type until embedding dimensions are chosen.
Recommendation: pick one embedding model up front and pin its exact vector dimension in DATABASE.md before writing the migration; keep embedding generation behind the ai/provider abstraction.
Boundary: tied to ADR-008 (paid dependency) — confirm with founder together.

## ADR-010 — Payment provider (PROPOSED — pending founder confirmation)
Context: CLAUDE.md/BILLING list "Paystack or Flutterwave"; one must be chosen for tasks/11.
Recommendation: choose a single provider for MVP behind the payments abstraction; do not build both. Selection criteria: NGN subscription/recurring support, webhook signature verification, and settlement fit for the Nigerian ICP.
Boundary: changes billing behavior and adds a paid dependency (CLAUDE.md decision boundary) — founder decides.
Status update (Milestone 11): still PROPOSED and still the founder's to decide, but it no longer blocks the milestone. M11 shipped behind the payment abstraction with a stub provider (ADR-069), so choosing a vendor now means adding one adapter file rather than building billing.

## ADR-011 — Per-organization AI spend budget and public-endpoint guards (accepted)
Decision: every public/AI endpoint (starting with the widget) must enforce per-business and per-visitor rate limits, a max messages/session, and a per-org daily token/₦ budget with a hard cutoff; spend is recorded in `usage_events`.
Reason: a public widget endpoint that triggers paid LLM/embedding calls is a cost-amplification/DoS vector; without a hard budget an attacker (or a runaway loop) can generate large bills before any real customer exists.

## ADR-012 — Signup provisions organization atomically (accepted)
Decision: signup creates profile → organization → owner membership in a single transaction; a user is never left without an organization, and tenant-scoped queries never fall back to a "default" org.
Reason: closes the unspecified `profiles` ↔ `auth.users` / org-creation gap between tasks/01 and tasks/02 and removes a class of wrong-tenant bugs.

## ADR-013 — Security tests are CI-gating from Milestone 00 (accepted)
Decision: CI runs typecheck + lint + unit tests + build from Milestone 00, and the tenant-isolation, cross-tenant-retrieval, and prompt-injection suites are required checks (not deferred to tasks/12).
Reason: TEST_RESULTS is empty and there is no CI; gating early prevents milestones being marked "done" without enforced verification and stops isolation regressions from accumulating.

## ADR-014 — Vitest + Testing Library for tests (accepted)
Decision: use Vitest with @testing-library/react and jsdom as the test runner.
Reason: native ESM/TypeScript support, fast, integrates with the Vite toolchain, and works cleanly alongside Next 16. Establishes the test framework required by Milestone 00.

## ADR-015 — System font stack instead of next/font Google fonts (accepted)
Decision: use a system font stack (defined in app/globals.css) rather than fetching Geist via next/font/google.
Reason: keeps the production build hermetic (no build-time network fetch of font files), which is more reliable in restricted/CI environments. Can revisit and adopt a self-hosted brand font later without architectural change.

## ADR-016 — UI primitives authored in-repo, minimal dependencies (accepted)
Decision: author shadcn/ui-style primitives (Button, Card) directly in components/ui using class-variance-authority + clsx + tailwind-merge; do not add Radix UI (e.g. Slot/asChild) until interactive components require it. components.json is present so future `shadcn add` stays consistent.
Reason: satisfies "base UI primitives" for the foundation while honoring CLAUDE.md's "do not install dependencies without justification." Radix and other primitives are added when a milestone actually needs them.

## ADR-017 — Lazy, fail-loud environment access (accepted)
Decision: read environment variables inside accessor functions (lib/env.ts) that throw a clear error when a required value is missing, rather than validating at module import.
Reason: a missing variable fails at the point of use with an actionable message and never breaks the production build; keeps public (NEXT_PUBLIC_*) and server-only secrets clearly separated per docs/SECURITY.md.

## ADR-018 — Auth via Server Actions + @supabase/ssr (accepted)
Decision: implement auth with Next Server Actions calling @supabase/ssr clients; sessions live in cookies and are refreshed in proxy (middleware). Always verify identity with `supabase.auth.getUser()` (which revalidates the token), never by trusting session cookies alone.
Reason: matches current Supabase SSR guidance for the App Router, keeps secrets server-side, and gives durable SSR sessions that survive refresh.

## ADR-019 — Route protection in proxy + server-side guard (accepted)
Decision: protect /dashboard in proxy (redirect unauthenticated users to /login) and additionally guard in the dashboard layout server component. If Supabase env is absent, proxy skips session handling so public pages still render.
Reason: defense in depth — a single missed check should not expose tenant surfaces. The layout guard also covers any path the proxy matcher might miss.

## ADR-020 — Adopt Next 16 `proxy` convention (accepted)
Decision: use `proxy.ts` (exporting `proxy`) instead of the deprecated `middleware.ts`.
Reason: Next 16 deprecated the `middleware` filename in favor of `proxy`; adopting it now avoids a deprecation warning and future breakage (CLAUDE.md: prefer current APIs).

## ADR-021 — No user enumeration on password reset (accepted)
Decision: the password-reset action always returns the same "if that email is registered, a link is on its way" message and does not surface provider errors.
Reason: avoids leaking which email addresses have accounts (docs/SECURITY.md — validate inputs, avoid leaking internal state).

## ADR-022 — Atomic org provisioning via signup trigger (accepted, implements ADR-012)
Decision: a SECURITY DEFINER trigger `handle_new_user()` on `auth.users` creates the profile, organization, owner membership and an empty business profile in one transaction on signup.
Reason: guarantees no org-less users and no wrong-tenant fallback (ADR-012), and does it at the database layer so it holds regardless of which app path created the user.

## ADR-023 — SECURITY DEFINER membership helpers (accepted)
Decision: `is_org_member(org)` and `is_org_admin(org)` are SECURITY DEFINER SQL functions with `set search_path = ''`, used inside RLS policies.
Reason: policies on `organization_members` that check membership would recurse into the same table; a definer function reads it without re-triggering RLS, which is the supported Supabase pattern.

## ADR-024 — Role model: members read, owner/admin write (accepted)
Decision: for organization-owned tables, any member may read; only owner/admin may write. The `anon` role is not granted access to tenant tables at all.
Reason: least privilege for the dashboard surface; public/widget access (later milestones) will use a separate, explicitly-scoped path rather than the tenant tables directly.

## ADR-025 — Migrations in supabase/migrations; local RLS test harness (accepted)
Decision: SQL migrations live in `supabase/migrations/`. Because CI has no Supabase CLI, tenant-isolation tests run as a plain-SQL script (`supabase/tests/tenant_isolation.sql`) against any PostgreSQL, using a small local-only auth shim (`supabase/tests/00_supabase_shim.sql`) that emulates `auth.uid()` and the Supabase roles.
Reason: keeps migrations reproducible and lets the critical isolation tests run without external infrastructure; on real Supabase the shim is unnecessary.

## ADR-026 — Archive products via status (soft delete) (accepted)
Decision: products are archived by setting `status='archived'` rather than being hard-deleted; the catalog defaults to showing active products.
Reason: task 03 requires "archive"; products are referenced by future leads/conversations/recommendations, so preserving them (DATABASE.md "soft deletion where justified") avoids dangling references and keeps history.

## ADR-027 — Product search via ILIKE for MVP (accepted)
Decision: product search matches name/sku with `ILIKE` (wildcards in user input escaped), backed by btree indexes; full-text / trigram search is deferred.
Reason: simplest solution that meets the catalog-size needs of the ICP; can add `pg_trgm` or tsvector later without changing the API.

## ADR-028 — SKU unique per organization (accepted)
Decision: `sku` is optional but unique within an organization (partial unique index where sku is not null); the duplicate-key error surfaces as a friendly message.
Reason: SKUs identify stock within a business and must not collide there, while remaining optional and not globally unique across tenants.

## ADR-029 — Embedding provider abstraction with a stub default; dimensions pinned at 1536 (accepted)
Decision: embeddings go through `EmbeddingProvider` (lib/ai/provider). Until ADR-008/ADR-009 are confirmed, the default is a deterministic local stub (a hashing vectorizer, L2-normalized) selected by `EMBEDDING_PROVIDER=stub`. The DB column is `vector(1536)`.
Reason: unblocks Milestone 04 without committing to a paid provider, incurring spend, or sending business data to a third party, while exercising chunking, storage, pgvector retrieval and ranking end to end. Consequence: the stub is lexical, not semantic, and must not be used in production; a real provider must emit 1536-dim vectors or the schema needs a migration plus a full re-embed.

## ADR-030 — Synchronous indexing for MVP (accepted)
Decision: chunking + embedding run inline when a document is saved or reindexed; status is tracked on the document (`pending`/`processing`/`ready`/`error`) with the error text stored for display, and reindexing is idempotent (chunks are replaced).
Reason: simplest thing that satisfies "processing status/error handling" and keeps failures visible and recoverable. Move to a queue/Vercel Cron job when documents get large enough to exceed request limits.

## ADR-031 — Retrieval RPC is SECURITY INVOKER; RLS is the boundary (accepted)
Decision: `match_knowledge_chunks(organization_id, query_embedding, match_count)` is SECURITY INVOKER. The organization id is a scoping/index hint only; RLS on `knowledge_chunks` is the authorization boundary, and the app always passes a server-derived organization id.
Reason: directly answers the top risk from the planning audit (cross-tenant RAG leakage). Verified by test: calling the RPC with another organization's id and an exact-match query vector for that organization's chunk returns zero rows. A SECURITY DEFINER function here would have leaked.

## ADR-032 — Paragraph-first chunking with overlap only on hard splits (accepted)
Decision: `chunkText` packs paragraphs up to 1000 characters and only hard-splits paragraphs that exceed the limit, applying 150 characters of overlap on those splits.
Reason: paragraph boundaries are already semantically clean, so overlap there adds duplication without benefit; overlap is applied exactly where a fact could be cut in half.

## ADR-033 — knowledge_documents.error column (accepted, extends DATABASE.md)
Decision: add an `error text` column to `knowledge_documents` beyond the fields listed in docs/DATABASE.md.
Reason: task 04 requires failures to be "visible and recoverable"; storing the last error on the row lets the UI show why indexing failed and offer a reindex.

## ADR-008a — AI provider/model DECIDED: Claude Sonnet 5 (accepted; supersedes ADR-008's proposed status)
Decision: the agent runs on Anthropic `claude-sonnet-5` behind the `ChatProvider` interface, with adaptive thinking, `strict: true` tools, and prompt caching on the stable system prefix.
Reason: founder decision on unit economics. At ~15 turns with RAG context a conversation costs roughly $0.17 on Sonnet 5 versus ~$0.42 on Opus 5; against a ₦15,000/month Starter tier that difference decides whether the plan is profitable. Sonnet 5 retains strong tool use and instruction-following, which is what the grounding rules depend on. Revisit if eval results show grounding or escalation quality falling short.

## ADR-009a — Embeddings DECIDED: Voyage AI `voyage-4`, 1024 dims (accepted; supersedes ADR-009's proposed status)
Decision: embeddings come from Voyage AI `voyage-4` (1024 dimensions) via `EMBEDDING_PROVIDER=voyage`; the stub remains for tests and offline development.
Reason: verified against Anthropic's documentation that Anthropic offers no first-party embedding model and recommends Voyage. Consequence the founder accepted: Voyage is a **second vendor** with its own `VOYAGE_API_KEY`. Migration 0004 changes the column from vector(1536) to vector(1024) and clears chunks for re-indexing — done now precisely because there is no production data. Voyage vectors are unit-normalized, so the existing cosine index and retrieval RPC are otherwise unchanged.

## ADR-034 — Pull customers/leads/lead_events forward into Milestone 05 (accepted)
Decision: create `customers`, `leads` and `lead_events` (per docs/DATABASE.md) in migration 0005, ahead of their Milestones 06/07, and add `agent_runs` for the tasks/05 logging requirement.
Reason: tasks/05 requires a `create_lead` tool, and a tool with nowhere to write would have to discard or invent data — the same defect the audit caught with `check_order`. `leads.conversation_id` is an unconstrained uuid until M06 adds the conversations table and its foreign key.

## ADR-035 — Manual tool loop rather than an SDK tool-runner (accepted)
Decision: `lib/ai/agent/run.ts` implements the request → tool → loop cycle directly, with a hard cap of 4 tool iterations per customer turn.
Reason: this agent's security properties depend on details the loop owns — binding every tool call to a server-derived organization id, capping spend, and logging each call. Keeping the loop explicit makes those auditable, and avoids depending on a beta SDK surface.

## ADR-036 — Grounding enforced by a deterministic claim checker (accepted)
Decision: before any reply reaches a customer, price and stock figures in the draft are extracted and matched against the tool results from that turn. Unmatched figures block the reply, which is replaced by a handoff message and the turn is marked escalated.
Reason: CLAUDE.md's "never invent price/stock" cannot be enforced by prompting alone. The check is deliberately narrow — only price- and stock-shaped claims — so legitimate numbers quoted from knowledge ("2 working days") are not flagged. It is unit-testable without calling a model, so it runs free in CI.

## ADR-037 — Two-layer evaluation: deterministic in CI, live opt-in (accepted)
Decision: guardrails, tool dispatch, the iteration cap and grounding are tested deterministically in `npm test` (no API key, no cost). The 105 live conversations across the 15 docs/AI_AGENT.md categories live in `evals/` behind `npm run eval`, which prints a cost estimate and requires explicit confirmation.
Reason: resolves the audit's "~15 categories vs 100 conversations" contradiction — both numbers are now real and serve different purposes. Keeps CI free, fast and deterministic while making the expensive, non-deterministic evaluation a conscious, budgeted act.

## ADR-038 — Takeover race fixed in the database, not the application (accepted)
Decision: AI replies are written through `append_ai_message(conversation_id, content, metadata)`, a SECURITY INVOKER function that takes `select ... for update` on the conversation row, and returns NULL without inserting unless the status is still `AI_ACTIVE`. Human takeover is a plain UPDATE on the same row, so the two are serialized by the row lock.
Reason: closes audit finding #12. Checking the status in application code before inserting is a genuine race — a human can take over between the check and the insert, and the customer then sees the AI and a person answering at once. Verified with two concurrent connections: with an uncommitted takeover holding the lock, `append_ai_message` blocked for ~1.6s, then observed HUMAN_ACTIVE, returned NULL and wrote nothing.

## ADR-039 — A discarded AI reply is recorded, never silent (accepted)
Decision: when `append_ai_message` refuses, the reply is dropped and the run is logged to `agent_runs` with `blocked_reason = 'taken_over'` and `status = 'blocked'`; the UI tells the operator it happened.
Reason: silently swallowing a generated reply hides both cost and behaviour. Making the refusal observable means a spike in takeover collisions is diagnosable rather than invisible.

## ADR-040 — Realtime via Supabase, with a polling fallback (accepted)
Decision: the conversation view subscribes to Supabase Realtime `postgres_changes` on `messages`, and also polls every 15s. Migration 0006 adds the tables to the `supabase_realtime` publication inside a `pg_publication` existence guard.
Reason: realtime is part of the already-chosen Supabase stack, so it adds no vendor. The guard keeps migrations applicable to plain PostgreSQL, which is what the local isolation suites run on; the poll means the inbox still updates if realtime is not enabled or the socket drops. Both paths only trigger a re-render — message data still comes through RLS-scoped queries.

## ADR-041 — leads.conversation_id foreign key closed (accepted, completes ADR-034)
Decision: migration 0006 adds the foreign key from `leads.conversation_id` to `conversations(id) on delete set null`.
Reason: ADR-034 left the column unconstrained only because `conversations` did not exist yet. With the table created, the deferred integrity gap is closed as planned.

## ADR-042 — Lead scoring is manual, not inferred (accepted)
Decision: `leads.score` is entered by the business (0–100). The AI captures intent and contact details but does not invent a score.
Reason: there is no conversion history yet to calibrate a model or heuristic against, so any generated number would be arbitrary while looking authoritative — exactly the "never invent business facts" failure mode the product exists to avoid. Revisit once real won/lost outcomes exist to learn from.

## ADR-043 — Permissive pipeline transitions, strict recording (accepted)
Decision: any lead status may follow any other (only a no-op or unknown status is rejected); every change is classified (progress / regress / won / lost / reopen) and written to `lead_events`.
Reason: real sales move backwards and dead deals get revived, so a restrictive state machine would fight the user. The value is in an accurate, complete timeline rather than in refusing transitions.

## ADR-044 — Leads captured by the AI link to their conversation (accepted)
Decision: `ToolContext` carries an optional `conversationId`, so `create_lead` attaches the conversation the agent is answering in; creating a lead by hand from a thread reuses that conversation's customer and refuses to create a second lead for the same conversation.
Reason: the FK became usable once M06 created `conversations` (ADR-041). Linking lead and thread means the pipeline can show what was actually said, and prevents duplicate leads per conversation.

## ADR-045 — The two-follow-up cap is a database constraint (accepted)
Decision: `automation_runs.follow_up_number` is constrained to 1 or 2, `(lead_id, follow_up_number)` is uniquely indexed, and a run may only reach status `sent` if it carries a number.
Reason: closes audit finding #11. An application-level "have we already sent two?" check is defeated by a scheduler retry, two overlapping cron firings, or a worker crashing mid-run. With these constraints a third follow-up has no valid number to use and a retry of #1 collides with the existing row, so spamming a customer is impossible regardless of application bugs. Verified: the database rejects a third insert, a duplicate #1, and a `sent` run with no number.

## ADR-046 — Runs are claimed atomically before execution (accepted)
Decision: `claim_automation_run(run_id)` is a conditional `update ... where status = 'scheduled' returning id`; the cron worker executes only runs it actually claimed.
Reason: same lesson as ADR-038. Two overlapping cron firings would otherwise both execute the same scheduled run. Verified with two connections: with the first claim uncommitted, the second worker blocked ~1.6s and then received NULL, so exactly one executes.

## ADR-047 — Quiet hours and opt-out are part of eligibility (accepted)
Decision: follow-ups are never scheduled to send between 21:00 and 08:00 in the business's timezone (deferred to the next morning rather than dropped), `customers.marketing_opt_out` is filtered in the eligibility query, the opt-out is re-checked at send time, and won/lost leads are excluded.
Reason: the rest of audit finding #11. The cap stops volume; these stop the other ways automated follow-up becomes spam. The rules live in a pure module (`lib/automations/eligibility.ts`) so they are exhaustively unit-tested without a database or a clock.

## ADR-048 — Service-role client confined to the cron runner (accepted)
Decision: `lib/supabase/admin.ts` provides a service-role client used only by the automations cron, which has no user session; every query it makes is explicitly filtered by `organization_id`.
Reason: audit finding #7 warned that reaching for the service-role key silently removes the tenant boundary. Background jobs genuinely cannot use the request-scoped client, so the exception is narrow, documented at the call site, and compensated by writing the scoping out by hand — RLS is not there to catch a mistake in this path.

## ADR-049 — Follow-up drafts go through the grounding guardrail (accepted)
Decision: an AI-drafted follow-up is checked by `checkGrounding(message, "")` — with no tool evidence, any price or stock figure is unverified — and a failing draft is recorded as `failed` rather than delivered.
Reason: a follow-up is still a message from the business. The same "never invent price/stock" rule applies, and with no tools called during drafting there is nothing to ground a number against.

## ADR-050 — Delivery is abstracted; conversation delivery does not yet reach customers (accepted)
Decision: `lib/delivery` defines a `DeliveryProvider` with `conversation` and `email` (Resend) implementations, selected per automation.
Reason: the abstraction is what tasks/08 asks for. Recorded limitation: until the widget (M09) or WhatsApp (M10) exists, a conversation-delivered follow-up is stored and visible in the inbox but does **not** reach the customer — email is currently the only channel that actually leaves the building. Automations default to `conversation` and start disabled, so nothing is sent on a business's behalf until they opt in.

## ADR-051 — The widget's public API is four functions, and `anon` holds nothing else (accepted)
Decision: the publicly reachable surface is `widget_config`, `widget_start_session`, `widget_send` and `widget_frame_policy` — SECURITY DEFINER functions on which `anon` holds EXECUTE. `anon` is granted **no table privileges at all**, and migration 0008 also revokes the default PUBLIC EXECUTE from the application's other functions.
Reason: from this milestone the internet holds a key for the `anon` role, so "what can an anonymous caller do?" must be answerable by reading grants rather than by reasoning about route handlers. With no table grants, a bug in a route handler cannot become table access: the four functions are the whole attack surface, and each returns only the fields a visitor may see. Proved in `widget_isolation.sql`, which asserts anon holds no select/insert/update/delete on any business table and cannot execute the retrieval or message-append RPCs.

## ADR-052 — Widget spend caps live inside the database, under a row lock (accepted)
Decision: `widget_send` takes `select ... for update` on the session row, then checks the per-session message cap, the per-organization daily message cap and (in `widget_start_session`) the daily session cap — incrementing the counter and refusing in the same transaction, and releasing the increment when it refuses. Nothing paid runs unless the function returns `ok`.
Reason: closes audit finding #10, the highest-cost risk in the product — a public endpoint where each request costs an LLM call plus an embedding call. An application-level "are we under the cap?" check loses the race against concurrent requests, which is exactly the shape of the attack. Verified with two connections: with worker A's `widget_send` uncommitted and the cap set to 1, worker B **blocked 1204 ms**, then returned `session_limit`; exactly one message was stored. Capping sessions as well as messages is what stops opening fresh sessions being a way around the per-session limit.

## ADR-053 — The widget runs in an iframe on our own origin (accepted)
Decision: the embed snippet injects an iframe pointing at `/widget/<key>` on our domain; the business's page never hosts the chat. Who may frame it is set per business from `allowed_origins` as a `Content-Security-Policy: frame-ancestors` header in `proxy.ts`; every other route is served `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
Reason: the session token, the transcript and the Supabase key stay inside our origin, so a compromised or hostile host page cannot read them, and the widget's own requests are same-origin — no CORS to get wrong. The origin list is validated against a strict `scheme://host[:port]` shape before it reaches the header, because a stray quote or semicolon there would rewrite the directive. It fails **open** (any embedder) on an unknown key or a lookup error: this header is an anti-abuse control, not the tenant boundary, so a transient database error should not take a working widget offline. Adding iframes to the app is also why the rest of it is now explicitly frame-denied.

## ADR-054 — The widget's AI turn uses the service-role client, with the tenant resolved by the database (accepted, extends ADR-048)
Decision: `POST /api/widget/message` runs the agent with the service-role client. The visitor sends only an opaque 256-bit session token; `widget_send` resolves it and returns the organization and conversation ids, and those — never anything from the request — are what the agent runs against.
Reason: a widget visitor has no account, so there is no request-scoped client that can read products and knowledge or write a message. This is the second and last exception to ADR-048, and the riskier one because it *is* a request handler. What makes it safe is that a caller cannot name an organization: the tenant comes out of the database, keyed by a token it issued.

## ADR-055 — Injected-client call sites must write the tenant filter out (accepted)
Decision: `listProducts` and `listMessages` throw if a client is injected without an `organizationId`, and apply `.eq("organization_id", …)` when one is given. Functions that nothing injects (`getProduct`, `listCategories`) no longer accept a client at all.
Reason: found while wiring ADR-054. `listProducts` relied entirely on RLS, which is correct for the request-scoped client and silently cross-tenant under a service-role one — precisely audit finding #7. Making the parameter required at the boundary turns "remember to scope it" into something the code refuses to skip.

## ADR-056 — Widget sessions are created on the first message, not on page load (accepted)
Decision: loading a page with the widget on it costs nothing; the session is created when the visitor actually sends something.
Reason: a session consumes the business's daily session quota. Creating one per page view would let ordinary traffic — or a crawler — exhaust the quota without a single conversation happening.

## ADR-057 — The widget keeps no transcript in the browser (accepted)
Decision: the widget holds the conversation in component state only. There is no public endpoint that reads messages back, and a refresh starts a new chat.
Reason: a read-back endpoint would be a second public surface to get right, and offers an attacker a way to fish for content using a stolen token. The business's copy of the conversation — the one that matters — is in the inbox, where a human can take over at any time.

## ADR-058 — ADR-050's delivery gap is still open after the widget (accepted, revises ADR-050)
Decision: the widget does **not** make conversation-delivered follow-ups reach customers. It follows from ADR-057: a widget session is not resumable, so a visitor who comes back gets a new conversation and never sees a follow-up posted into the old one.
Reason: recorded because ADR-050 named the widget as one of the two things that would close this gap, and it does not. The widget delivers the *live* half — a visitor's question is answered in the moment — but not the asynchronous half. Email remains the only channel that reaches a customer unprompted; real push delivery waits for WhatsApp (M10). Making widget sessions resumable would close it, at the cost of a second public endpoint that reads message history back — deliberately not taken on in this milestone.

## ADR-059 — Webhook authenticity: HMAC over the raw body, in constant time (accepted)
Decision: `POST /api/webhooks/whatsapp` reads the **raw request body** and verifies `X-Hub-Signature-256` as HMAC-SHA256 of those exact bytes with the organization's `app_secret`, compared with `timingSafeEqual`. Anything malformed — missing header, wrong prefix, non-hex digest, no stored secret — is a flat 401.
Reason: half of audit finding #13. Two details decide whether this is real: hashing the **raw** bytes (re-serializing parsed JSON changes whitespace and escaping, so the signature would never match — and the usual "fix" is to stop verifying), and a constant-time comparison (a byte-at-a-time compare leaks the expected digest). An unknown phone number, a missing secret and a forged signature all return the same 401, so probing reveals nothing about which businesses are connected.

## ADR-060 — Replay protection is a unique constraint, not a memory (accepted)
Decision: `integration_events` carries `unique (provider, external_event_id)`, and `claim_integration_event()` is an insert-on-conflict-do-nothing returning the new row id. The first delivery of a Meta message id gets an id and does the work; every redelivery gets NULL and returns 200 immediately.
Reason: the other half of finding #13. Meta redelivers after any non-200, so duplicates are ordinary traffic rather than an attack, and they must be cheap and must not produce a second AI reply. Making the constraint the mechanism means a retry arriving *before* the first delivery commits is handled too. Verified with two connections: with worker A's claim uncommitted, worker B **blocked 1202 ms**, then received NULL; one row recorded. Cross-tenant replay of a captured event id is refused by the same constraint.

## ADR-061 — The webhook always answers 200 once it is past the signature (accepted)
Decision: after signature verification, every outcome — duplicate, disabled integration, unsupported message type, a failed model call — returns 200. Failures are recorded on `integration_events.status` and surfaced in the dashboard.
Reason: Meta retries non-2xx responses. Reporting our own internal failure to Meta converts one failure into a retry storm that costs an LLM call each time. The business needs to see the failure; Meta does not.

## ADR-062 — WhatsApp credentials are write-only for the dashboard (accepted)
Decision: `whatsapp_integrations.verify_token`, `app_secret` and `access_token` carry **no SELECT grant** for `authenticated` — only UPDATE. The dashboard reads a view, `whatsapp_integration_status`, which reports `has_app_secret` / `has_access_token` / `has_verify_token` as booleans and re-applies the membership check itself. A blank field in the form means "keep what is stored" and never erases a secret.
Reason: an access token can send messages as that business. Column-level grants make reading one a privilege error rather than a column someone has to remember to leave out of a select list. Proved in `whatsapp_isolation.sql`: selecting `app_secret` as `authenticated` raises `insufficient_privilege`.

## ADR-063 — The webhook is the third service-role exception (accepted, revises ADR-054)
Decision: `app/api/webhooks/whatsapp` uses the service-role client. ADR-054 said the widget was "the second and last" exception; that is now wrong and this ADR revises it. There are three: the automations cron, the widget's AI turn, and this webhook.
Reason: the caller is Meta, which has no Supabase session at all. The safety argument is the same one as ADR-054 and it still holds: **the tenant is resolved by the database, not named by the caller** — the org comes from looking up `value.metadata.phone_number_id` in `whatsapp_integrations`, and every query is filtered by that id explicitly. What has changed is that "and last" was a promise the architecture could not keep; the invariant that matters is the resolution rule, not the count.

## ADR-064 — Typed integration columns instead of the generic `integrations` blob (accepted)
Decision: `whatsapp_integrations` has named columns (`phone_number_id`, `waba_id`, `verify_token`, `app_secret`, `access_token`) rather than `docs/DATABASE.md`'s generic `integrations` table with a `credentials_reference` blob.
Reason: ADR-062 is only possible with named columns — a jsonb blob cannot carry a per-field grant, so "the dashboard may write this and never read it" would have to be enforced in application code. A unique index on `phone_number_id` (the webhook's routing key) likewise needs a real column. Revisit if a second provider arrives and the shapes turn out to be genuinely common.

## ADR-065 — No template messages; out-of-window sends are refused (accepted)
Decision: WhatsApp free-form text is sent only inside Meta's 24-hour customer service window, computed from the conversation's last inbound customer message (`lib/whatsapp/window.ts`). Outside it the delivery provider **refuses and records** rather than attempting the send. No message templates are sent in this milestone.
Reason: templates need per-business Meta approval and are billed separately — that is founder territory and real money (CLAUDE.md's decision boundary), not something to slip in. Refusing deliberately also makes the limit visible in `automation_runs` instead of arriving as an opaque Meta API error. Replying to a customer who just messaged never hits this, because their message is what opens the window.

## ADR-066 — WhatsApp narrows ADR-058's gap to a 24-hour window (accepted, revises ADR-050 and ADR-058)
Decision: an automated follow-up can now reach a customer unprompted, over WhatsApp, **if they messaged within the last 24 hours**. Beyond that, email remains the only channel that reaches them.
Reason: stated as what it is rather than "WhatsApp closes the gap". ADR-050 predicted WhatsApp would close it and ADR-058 recorded that the widget did not; this is the honest third instalment. Closing it fully needs ADR-065's template decision.

## ADR-067 — The integration ships disabled and refuses to be enabled half-configured (accepted)
Decision: `whatsapp_integrations.enabled` defaults to false for every organization, including newly created ones. The webhook drops verified messages for a disabled integration without calling the model, and the dashboard refuses to enable one until the phone number id and all three secrets are present.
Reason: CLAUDE.md makes connecting production WhatsApp a founder decision, so the default must be off and turning it on must be a separate deliberate act rather than a side effect of saving a form. It doubles as the kill switch: one click stops every reply.

## ADR-068 — Non-text messages are acknowledged, not interpreted (accepted)
Decision: images, audio, documents and location messages get a fixed "I can only read text messages" reply, are recorded as a system message in the thread, and the model is never called.
Reason: `tasks/10` says media handling "only if necessary". Guessing at an image's contents is exactly the invent-a-fact failure this product exists to avoid, and calling the model to say "I can't read that" would spend money to produce a constant.

## ADR-069 — Milestone 11 built behind a payment abstraction; ADR-010 stays open (accepted)
Decision: `lib/payments` defines a `PaymentProvider` interface (`createCheckout`, `verifyWebhook`, `parseEvent`) with one implementation, a deterministic **stub**. Everything else in the milestone — the schema, entitlements, limits, the state machine and the webhook — is provider-agnostic. `getPaymentProvider()` throws for any name but `stub`, naming ADR-010 in the error.
Reason: choosing Paystack or Flutterwave changes billing behavior and adds a paid dependency, both of which CLAUDE.md reserves for the founder, and ADR-010 is still PROPOSED. This is the same move Milestone 04 made with embeddings: ship the abstraction and a stub, defer the vendor. The stub is not a toothless mock — it signs and verifies webhooks with the same raw-body HMAC scheme a real provider uses, so the webhook route, idempotency and the state machine are genuinely exercised. Adding the real provider is one file next to `stub.ts` and one `case`. `createCheckout` refuses unless `PAYMENT_PROVIDER=stub` is set explicitly, so the stub cannot quietly stand in for a real provider in production.

## ADR-070 — The dashboard cannot write subscription state at all (accepted)
Decision: `authenticated` holds SELECT on `subscriptions` and has **no INSERT, UPDATE or DELETE grant**. The only writer is the verified payment webhook, through the service-role client.
Reason: `tasks/11` says "never trust client-submitted subscription state", and an absent grant is a stronger statement of that than a careful server action. There is no code path — no form, no action, no future API handler, no bug in one — that can move an organization onto a better plan. Proved in `billing_isolation.sql`: an `update subscriptions set plan = 'pro'` as `authenticated` raises `insufficient_privilege`. `plan_limits` is likewise readable and not writable, so the price list cannot be rewritten either.

## ADR-071 — Plan limits are triggers, not checks at each call site (accepted)
Decision: `enforce_plan_limit()` runs BEFORE INSERT on `products`, `knowledge_documents` and `automations`, reading the allowance from `plan_limits` for the organization's effective plan and raising SQLSTATE `PLIM1` when it is reached. `enforce_whatsapp_plan()` does the same for enabling WhatsApp.
Reason: the other half of `tasks/11` — "plan access is server-enforced". The dashboard is not the only writer: an AI tool captures leads, the cron runner schedules follow-ups, and more paths will exist. A limit re-checked at each call site is correct until someone adds the call site that forgets. As a trigger it holds for every path, including ones not written yet. The raised message is already customer-facing ("Your starter plan allows 100 products. Upgrade to add more."), so `planLimitMessage()` passes it through rather than replacing it with something vaguer.

## ADR-072 — `past_due` keeps access; only `canceled` and `incomplete` remove it (accepted)
Decision: `org_plan()` resolves `trialing`, `active` and `past_due` to the organization's plan, and everything else to `none` — which allows no new data and no widget traffic.
Reason: a failed card is usually an expired card, and a provider's dunning retries run for days. Switching a business's customer service off the moment a charge fails punishes their customers for our billing event, and is how a recoverable payment becomes a cancellation. `canceled` is where access actually stops. Cancellation keeps the plan on the row and only moves the status, so reactivating restores the right tier.

## ADR-073 — Every organization starts on a 14-day Starter trial (accepted)
Decision: the signup trigger creates a subscription with `plan='starter'`, `status='trialing'`, and a period ending 14 days out.
Reason: an organization must never be in a state with no entitlement row at all — every limit lookup would then have to handle null, and the safe default (deny) would lock a new business out of its own dashboard. A trial also means the product can be used before it is paid for, which is what the pricing hypotheses in docs/BILLING.md assume.

## ADR-074 — The widget's daily cap is the lesser of the plan's and the business's (accepted, fixes a Milestone 09 gap)
Decision: `widget_send` now caps at `least(widget_settings.max_messages_per_day, plan_limits.max_widget_messages_per_day)`.
Reason: a real gap found while building this milestone. M09 let a business set their own daily cap up to 100,000, and nothing tied that number to what they pay — so "plan access is server-enforced" was false for the most expensive thing in the product. The plan is now the ceiling and the business's own setting can only lower it; a lapsed subscription caps it at zero, which the visitor sees as the existing `org_limit` refusal. Proved in `billing_isolation.sql`.

## ADR-075 — WhatsApp is a Growth-and-above channel (accepted)
Decision: `plan_limits.whatsapp_enabled` is false for Starter, and a trigger refuses to set `whatsapp_integrations.enabled = true` on a plan without it. Switching off is always allowed, on any plan.
Reason: WhatsApp costs per conversation on Meta's side as well as ours, so it cannot sit in the cheapest tier. Enforcing it on the row rather than in the dashboard action means it holds however the column is written. Allowing "off" unconditionally matters: a downgrade must never leave a business unable to stop messages going out.

## ADR-076 — The payment webhook reuses the WhatsApp webhook's machinery verbatim (accepted)
Decision: `POST /api/webhooks/payments` verifies a raw-body signature before acting (ADR-059), claims the event through `claim_integration_event` on the provider's event id (ADR-060), and answers 200 for every outcome past the signature (ADR-061).
Reason: the threats are identical and the answers generalize — `integration_events` was already provider-agnostic. A forged callback here is the direct route to a free Pro plan, and a retried "subscription renewed" must not extend the period twice. Only fields the provider actually reported are written, so a "payment failed" callback carrying no plan cannot blank the plan.

## ADR-077 — Rate limiting is an atomic database counter (accepted)
Decision: `consume_rate_limit(bucket, limit, window_seconds)` increments and tests in one statement against a fixed window. Sign-in is limited per email and per IP, signup per IP, password reset per email, and the widget per visitor on top of its existing per-organization spend caps.
Reason: `docs/SECURITY.md` has required rate limits since Milestone 00 and there were none — password guessing against `/login` was free, and `/forgot-password` was an open way to send someone a lot of email. A read-then-increment limiter loses exactly the burst it exists to stop, the same lesson as ADR-038 and ADR-052. Fixed windows rather than a sliding log: an attacker gains at most one extra window, which is not worth a row per attempt on a login form. Two limits on sign-in because they stop different attacks — per email stops guessing one password, per IP stops spraying one password across many accounts.

## ADR-078 — Rate-limit and audit subjects are hashed before storage (accepted)
Decision: the bucket key is a SHA-256 of the subject (an email, an IP) with a server-side pepper, computed by the application. `security_events.subject_hash` is the same.
Reason: "log security-relevant events without logging secrets or full PII". A rate-limit table keyed by plaintext email is a list of who uses the product and when they struggled to log in — readable by any operator and present in every backup. Hashed, it still answers "is this subject over the limit?" and "was someone throttled?", which is all it is for. It falls back to an unpeppered hash when `RATE_LIMIT_PEPPER` is unset: weaker against an offline attack on the table, but far better than disabling rate limiting because a variable is missing.

## ADR-079 — The rate limiter fails open, the bucket key fails closed (accepted)
Decision: a database error while consuming a limit allows the request; a malformed or empty bucket key refuses it.
Reason: these look contradictory and are not. If the database is unreachable the application is already broken, and a limiter that denies everything turns a partial outage into a total one — the failure mode is worse than the attack. A malformed key, by contrast, means the caller is wrong, and allowing an unlimited request on a key we cannot compute is how a limiter gets bypassed.

## ADR-080 — Structured JSON logging with two-layer redaction (accepted)
Decision: `lib/observability/logger.ts` emits one JSON object per line. Every field passes through `redact()`, which blanks values whose **key** looks sensitive (including anything ending in `key`) and scrubs **shapes** — emails, phone numbers, long token-like strings — out of free text.
Reason: a human-formatted log string is unsearchable the moment it matters. Both redaction layers are needed: key-based misses a customer's email inside a message body, shape-based misses a short token under a key named `app_secret`. Redaction sits in the logger rather than at call sites, so adding a field to a log call can never be the thing that leaks a credential. It is a `console` call with a shape — no dependency.

## ADR-081 — Sentry and PostHog over HTTP, no SDK (accepted)
Decision: `captureError()` always writes a structured log line, and additionally POSTs to Sentry's store endpoint when `SENTRY_DSN` is set. `trackEvent()` POSTs to PostHog's capture endpoint when configured. Neither SDK is installed.
Reason: `@sentry/nextjs` brings a build plugin, instrumentation files and a large dependency tree for what is one POST, and CLAUDE.md says not to install dependencies without justification. The trade-off is real and stated rather than hidden: no automatic breadcrumbs, no release tracking, no source maps. The log line is the part that always works, so "monitoring captures actionable errors" does not depend on a third party being configured, reachable or within quota. Revisit if beta shows the SDK's extras earn their weight.

## ADR-082 — Analytics properties are dropped, not redacted (accepted)
Decision: `trackEvent()` refuses any property whose key looks sensitive, rather than sending `[redacted]`, and requires an opaque `distinctId` — an organization id, never an email.
Reason: a `[redacted]` value in an analytics funnel is noise that looks like data. PostHog is a third party holding customer behaviour; the less that leaves, the smaller the question of what it holds.

## ADR-083 — Security headers applied centrally, with the widget carved out (accepted)
Decision: `applySecurityHeaders()` sets `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and `X-DNS-Prefetch-Control` everywhere, `frame-ancestors 'none'` plus `X-Frame-Options: DENY` everywhere except the widget, and HSTS in production only.
Reason: each closes a specific hole — sniffing, dashboard URLs (which carry organization and record ids) leaking to every site a user clicks through to, and features the dashboard never needs. The widget is the one page meant to be framed and computes its own `frame-ancestors` from the business's allowed origins (ADR-053), so it is passed `frameDeny: false` rather than excluded from the rest. HSTS is production-only because pinning `localhost` to HTTPS in a developer's browser is painful to undo.

## ADR-084 — NDPR retention is per-business and actually deletes (accepted, closes audit finding #16)
Decision: `business_profiles.retention_days` (30–3650, default 365) is set by the business at `/dashboard/privacy`. `purge_expired_data()` deletes conversations past that period, redacts `integration_events.payload` after 30 days, and clears customers with nothing attached — driven nightly by `/api/cron/retention`.
Reason: the largest open gap in the planning audit. Customer names, phone numbers and full conversations were being stored with no stated limit and no way to remove them. A retention policy that is only written down is not a retention policy; it has to delete things. The payload redaction keeps the `integration_events` row because that row is the replay-protection record (ADR-060) — only the customer's phone number goes.

## ADR-085 — Erasure deletes conversations explicitly, because the cascade does not (accepted)
Decision: `delete_customer_data()` and `purge_organization_customers()` delete leads and conversations **before** the customer row. Both are SECURITY INVOKER, so RLS decides what the caller may erase.
Reason: found during this audit, and it is the trap in the obvious implementation. `conversations.customer_id` and `leads.customer_id` are `ON DELETE SET NULL`, so deleting the customer row **detached** their history rather than removing it: every message they wrote stayed in the database looking anonymous while still being personal data — the exact opposite of what an erasure request asks for. SECURITY INVOKER rather than DEFINER because RLS should be the boundary; the admin check inside is additional, not a substitute, and it means a cross-tenant erasure attempt finds nothing rather than being refused by a check that could be got wrong.

## ADR-086 — The service-role rule replaces the service-role count (accepted, supersedes ADR-054 and ADR-063)
Decision: `lib/supabase/admin.ts` no longer claims a number of exceptions. It states two admissible shapes: background jobs with no session (the two crons), and request handlers whose caller has no account **and whose tenant is resolved by the database rather than named by the caller** (the widget message route and both webhooks).
Reason: ADR-054 said "the second and last"; ADR-063 corrected it to three; there are now five. The count kept moving and the rule never did, so the rule is what the documentation states. A promise the architecture cannot keep is worse than no promise — it stops being checked.

## ADR-087 — The dashboard home is an activation checklist (accepted)
Decision: `/dashboard` shows today's numbers and a six-step setup checklist, with exactly one step marked as the next action. The steps, their order and what counts as done live in a pure module (`lib/onboarding/checklist.ts`), and the signals come from one SQL function so every surface agrees.
Reason: `tasks/13`'s acceptance criterion is that "a new business can onboard without founder intervention", which is really a question about whether the product tells them what to do next. The old dashboard said "Multi-tenancy is in place — next up is the product catalog", which is a note to ourselves. Order is not arbitrary: products before knowledge because a retailer's first customer question is always about a product, the widget before WhatsApp per ADR-002.

## ADR-088 — The next action is never a step the business cannot take (accepted)
Decision: "Your first conversation" and "your first lead" are marked `passive` and can never be the highlighted next action, though they still count toward the six.
Reason: they happen when customers arrive. Highlighting one would be telling a business to go and wait, which reads as the product being broken. `isActivated()` likewise only requires the four steps they control — a business that has done everything it can should not be shown an unfinished checklist.

## ADR-089 — Any member can send feedback, not just admins (accepted)
Decision: the `feedback` insert policy is `is_org_member`, deliberately unlike every other write in the system (ADR-024 gives writes to owner/admin).
Reason: restricting bug reports to admins loses exactly the people who use the product most — the person answering conversations all day is rarely the person who owns the account. The feedback you get otherwise is the feedback from people who already have your phone number, which is a biased sample of your beta. The isolation suite tests this difference explicitly so it is not mistaken for an oversight later.

## ADR-090 — Activation is SECURITY INVOKER, so it cannot be used to probe (accepted)
Decision: `organization_activation(org_id)` is SECURITY INVOKER, so its `EXISTS` checks run under RLS.
Reason: it takes an organization id as an argument, which makes it exactly the shape of a function that leaks — "does organization X have products?" is a question about someone else's business. Under RLS, asking about another organization returns false for everything rather than the truth. Same reasoning as ADR-031 for `match_knowledge_chunks`.

## ADR-091 — The demo business is deliberately awkward (accepted)
Decision: `supabase/seed/demo_business.sql` seeds "Ada's Closet" with one product out of stock, one archived, policies containing real edge cases (a 7-day returns window, final-sale accessories, no Sunday delivery), and a conversation that ends in an escalation rather than a sale.
Reason: a demo where everything is in stock and every question is easy teaches nothing about the product, and worse, it demos the wrong thing. The escalation is the behaviour actually being sold — the AI declining to answer a question about instalments is the feature, not a failure. Knowledge documents are seeded as `pending` rather than `ready` because chunking and embedding happen in the application; a seeded `ready` document with no chunks would be one the AI cannot retrieve.

## ADR-092 — Known issues are published, not tracked privately (accepted)
Decision: `docs/KNOWN_ISSUES.md` lists fifteen items in the repository, separating the four that block beta from eleven documented limitations, each naming the ADR that chose it.
Reason: every limitation here was a deliberate trade — no templates, lexical search, ILIKE, manual lead scores, rate limiting that fails open. Written down, each is a support conversation that starts from "yes, we know, here is why". Undocumented, the same limitation is a lost beta customer and an argument about whether it was a bug.

## ADR-093 — CI runs the SQL suites, not just the TypeScript ones (accepted)
Decision: `.github/workflows/ci.yml` has three jobs — typecheck/lint/test/build, a `database` job that applies every migration to a `pgvector/pgvector:pg16` service container and runs all twelve isolation suites plus the demo seed, and `npm audit --audit-level=high`.
Reason: `docs/SECURITY.md` has required since Milestone 00 that the tenant-isolation, cross-tenant-retrieval and prompt-injection suites be *required checks*, not deferred to hardening. The TypeScript half of that was easy and the SQL half was the reason it never happened — it needs a real PostgreSQL with pgvector. A service container is all that takes. Every security property this project claims — cross-tenant retrieval returning nothing, the takeover race, the follow-up cap, `anon` holding no privileges, replay protection, credentials the dashboard cannot read, erasure actually erasing — lives in those suites. Leaving them out of CI would mean CI checked the half that was never the risk. The audit job fails only on high or critical: blocking every push on a low-severity dev-dependency advisory trains people to ignore the job, which costs more than it saves.

## ADR-094 — CI and local development run the same script (accepted)
Decision: `scripts/db-test.sh` rebuilds a throwaway database, applies every migration and runs every suite. CI calls `npm run test:db`; so does a developer. Migrations and suites are found by **glob**, never listed.
Reason: two lists that must be kept in step will drift, and the failure is silent — a new suite that CI does not know about looks exactly like a passing one. With globs, adding `supabase/tests/foo_isolation.sql` is enough to make CI run it. The shared script also means "it passes on my machine" and "it passes in CI" are the same claim rather than two similar ones. Verified by rehearsing the exact CI path locally (TCP, password auth, non-postgres OS user) and by adding a deliberately failing suite to confirm the script exits non-zero — a CI job that cannot fail is worse than no CI.

## ADR-095 — The demo seed is checked in its own database (accepted)
Decision: with `SEED=1`, the seed is applied twice to a separate database and the organization count asserted, rather than being applied to the database the suites run against.
Reason: found immediately on the first run. The seed leaves a demo organization behind, and several suites assert absolute counts on an empty schema ("expected 2 orgs, saw 3"). Sharing one database made a working seed look like three broken tests. Applying it twice is the check that matters, because the first version of the seed was not idempotent.

Add future decisions here. Do not rewrite history; append revisions.
