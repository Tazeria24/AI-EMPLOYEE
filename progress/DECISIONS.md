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

Add future decisions here. Do not rewrite history; append revisions.
