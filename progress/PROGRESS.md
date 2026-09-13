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

## Current milestone
04 — Knowledge Base (next)

## Next action
Read tasks/04-knowledge-base.md. Implement FAQs/policies/documents, chunking,
embeddings, pgvector retrieval, org-scoped retrieval + processing status.
NOTE: this milestone needs the embedding model/provider decision (ADR-009,
still PROPOSED) confirmed before the schema/migration is finalized.

## Rule
Update this file after every completed milestone.
