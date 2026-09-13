# Progress

Status: IN PROGRESS

## Completed
- Product concept defined
- Initial ICP selected
- MVP scope defined
- Architecture defined
- Database model defined
- 60-day roadmap defined
- Planning-phase audit + ADRs 007–013 recorded
- **Milestone 00 — Foundation** (Next.js App Router + TS, Tailwind v4,
  shadcn/ui-style primitives, Supabase client/server modules, env conventions,
  health check, lint + Vitest, README)
- **Milestone 01 — Authentication** (signup, login, logout, password reset,
  email verification, protected /dashboard, SSR sessions via @supabase/ssr;
  route protection in proxy + server-side guard)
- **Milestone 02 — Multi-tenancy** (organizations, organization_members,
  business_profiles, owner/admin/member roles, atomic org provisioning on
  signup, onboarding flow, RLS policies; tenant-isolation tests passing on
  real Postgres)
- **Milestone 03 — Products** (product_categories + products with RLS,
  price/currency/SKU/stock/status, search + status filter, CRUD + archive,
  dashboard UI with loading/empty/error states; products isolation tests
  passing on real Postgres)

- **Milestone 04 — Knowledge Base** (knowledge_documents + knowledge_chunks
  with pgvector/HNSW, chunking, embedding provider abstraction with a
  deterministic stub embedder, org-scoped retrieval RPC, processing status +
  error/reindex, knowledge UI with retrieval test box; knowledge isolation
  tests passing on real Postgres incl. cross-tenant retrieval)

## Current milestone
05 — AI Agent (next)

## Next action
Read tasks/05-ai-agent.md. Implement the provider abstraction for chat, system
prompt, RAG context, tools (search_products, search_knowledge,
get_business_hours, create_lead, escalate_to_human per ADR-007), response
validation, logging and the evaluation suite.
BLOCKER: Milestone 05 needs a real model provider (ADR-008, still PROPOSED)
confirmed by the founder. Embeddings currently run on the local stub
(ADR-029); a production embedding model (ADR-009) must emit 1536-dim vectors
or the knowledge schema needs a migration + re-embed.

## Rule
Update this file after every completed milestone.
