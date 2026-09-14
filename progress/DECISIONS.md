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

Add future decisions here. Do not rewrite history; append revisions.
