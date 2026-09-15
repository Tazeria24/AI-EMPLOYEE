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

## Current milestone
11 — Billing (PARTIAL); M05's live evaluation and M10's live round trip still outstanding

## Next action
Three milestones now wait on things only the founder can provide. None of them
block further building, but all three block shipping:

1. **ADR-010 — Paystack or Flutterwave.** Still PROPOSED. M11 is built behind
   the payment abstraction, so this is now one adapter file (`lib/payments/`)
   plus that provider's test keys — not a rebuild. Until it is decided,
   `PAYMENT_PROVIDER=stub` is the only valid setting and no money moves.
2. **API keys + a Supabase project.** ANTHROPIC_API_KEY and VOYAGE_API_KEY with
   EMBEDDING_PROVIDER=voyage, a Supabase project with migrations 0001–0010
   applied and a demo business seeded. This closes M05's 105-case evaluation
   (~$2.05) — the oldest outstanding item — and is also what makes a live
   widget or WhatsApp conversation possible at all.
3. **A Meta test app + test number** for M10's inbound → AI → outbound round
   trip. **Connecting production WhatsApp or messaging real customers remains a
   decision-boundary stop** — the integration ships disabled and refuses to
   turn on half-configured.

Next milestone: 12 — Monitoring & Security Hardening, which needs none of the
above and is where the remaining audit findings land: Sentry and PostHog
(`docs/ARCHITECTURE.md` observability), structured logging without PII, a
webhook security audit across both webhooks, rate limiting on the auth routes,
and finding #16 — the NDPR data-retention and delete-by-organization policy,
which is a genuine gap before any real customer data is stored.

## Rule
Update this file after every completed milestone.
