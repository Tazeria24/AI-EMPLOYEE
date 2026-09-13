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

Add future decisions here. Do not rewrite history; append revisions.
