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

Add future decisions here. Do not rewrite history; append revisions.
