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

- **Milestone 05 — AI Agent** (PARTIAL — see below): Claude Sonnet 5 behind a
  ChatProvider abstraction, Voyage `voyage-4` embeddings (1024d), system prompt,
  5 MVP tools bound to the server-derived org, untrusted-content wrapping,
  deterministic grounding guardrail, manual tool loop with an iteration cap,
  agent_runs logging, assistant playground, 105-case eval suite

- **Milestone 06 — Conversations** (conversations + messages with RLS, the
  AI_ACTIVE/HUMAN_ACTIVE/CLOSED state machine, human takeover/release/close,
  inbox with search + filter, message thread, realtime + polling refresh,
  conversation-aware agent replies; takeover race fixed in the database and
  proved with two concurrent connections)

- **Milestone 07 — Leads** (pipeline list with per-status counts + search, lead
  detail with contact info, status moves, score/intent/notes editing, full
  activity timeline from lead_events, conversation-to-lead creation, AI-captured
  leads linked to their conversation)

- **Milestone 08 — Automations** (automations + automation_runs, inactive-lead
  trigger, AI-drafted follow-ups through the grounding guardrail, delivery
  abstraction (conversation + Resend email), Vercel Cron endpoint with a
  constant-time secret check, quiet hours + opt-out; the two-follow-up cap and
  run de-duplication enforced by database constraints, and atomic run claiming
  proved with two concurrent connections)

- **Milestone 09 — Website Widget** (widget_settings + widget_sessions +
  usage_events + org_usage_daily, an embeddable chat that runs in an iframe on
  our own origin, four public SECURITY DEFINER functions with `anon` holding no
  table privileges at all, per-session and per-organization daily spend caps
  enforced under a row lock, per-business embedding control via CSP
  frame-ancestors, a dashboard with the embed snippet, kill switch, usage and
  conversion figures; widget isolation + spend-cap tests passing on real
  Postgres, and the cap proved under two concurrent connections)

- **Milestone 10 — WhatsApp** (PARTIAL — see below): whatsapp_integrations +
  integration_events, a signed webhook (raw-body HMAC + constant-time compare),
  replay protection as a unique constraint with atomic event claiming, inbound
  → AI → outbound wiring through the existing agent and takeover path, a
  WhatsApp delivery provider gated on Meta's 24-hour window, write-only
  credentials enforced by column-level grants, and a dashboard that ships the
  integration switched off; whatsapp isolation + replay tests passing on real
  Postgres, and the replay case proved under two concurrent connections

- **Milestone 11 — Billing** (PARTIAL — see below): subscriptions + plan_limits,
  a PaymentProvider abstraction with a deterministic stub (ADR-010 still open),
  plan limits enforced by database triggers on every write path, entitlement
  that survives a failed card but not a cancellation, a signed idempotent
  payment webhook reusing the M10 machinery, a plan/usage dashboard, and the
  widget's daily cap now bounded by the plan; billing isolation + plan
  enforcement tests passing on real Postgres

- **Milestone 12 — Monitoring & Security Hardening** (rate limiting on the auth
  routes and the widget as an atomic database counter, hashed rate-limit and
  audit subjects, a security event log, structured JSON logging with two-layer
  PII redaction, Sentry/PostHog over HTTP with no SDK, security headers across
  the app with the widget carved out, NDPR retention + erasure with a nightly
  sweep, a CI-gating prompt-injection suite, and all six audits written up in
  docs/SECURITY_AUDIT.md; hardening tests passing on real Postgres)

- **Milestone 13 — Beta Launch** (PARTIAL — see below): the dashboard home
  rebuilt as a six-step activation checklist that names one next action,
  in-product feedback capture open to any member, an idempotent "Ada's Closet"
  demo seed, a rewritten landing page, and the launch documentation — install
  guide, internal QA script, release-candidate checklist and fifteen published
  known issues; beta isolation tests passing on real Postgres

## Current milestone
13 — Beta Launch (PARTIAL). **All twelve milestones are built. What remains is
not code.**

## Next action
The build is done. Every remaining item needs something only the founder can
supply, and they are listed in priority order in `docs/RELEASE_CHECKLIST.md`
with the reasoning in `docs/KNOWN_ISSUES.md` (items 1-4 block beta).

1. **API keys + a Supabase project.** `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`,
   `EMBEDDING_PROVIDER=voyage`, migrations 0001-0012. Then run `npm run eval`
   (105 cases, ≈$2.05) and record the results. This is the oldest outstanding
   item in the project — M05 has been built and unevaluated since it shipped,
   and **no evidence exists about how the model actually behaves** with real
   customers. Nothing else should go live before it.
2. **ADR-010 — Paystack or Flutterwave**, plus test keys. One adapter file.
3. **A privacy notice and consent record.** Legal copy. The retention and
   erasure machinery is built; the document a customer is shown is not, and it
   is required before real PII is stored.
4. **A Meta test app + number** for WhatsApp's first round trip.
5. Then work `docs/QA.md` end to end on the deployed instance before inviting
   anyone.

Deploying to production, connecting production WhatsApp, sending real customer
messages and charging a real card are all decision-boundary stops needing
explicit approval.

**CI is now set up** (`.github/workflows/ci.yml`): typecheck, lint, 340 unit
tests, the production build, all twelve SQL isolation suites against a
pgvector service container, the demo seed, and `npm audit` — on every push and
pull request. One step remains and it is a repository setting, not code:
**turn on branch protection** so those checks are required before a merge.
GitHub → Settings → Branches → add a rule for the default branch requiring
`Types, lint, tests, build`, `Migrations and isolation suites` and
`Dependency audit`. Until then CI reports; it does not block.

## Rule
Update this file after every completed milestone.
