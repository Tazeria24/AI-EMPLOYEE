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

## Current milestone
09 — Website Widget (complete); Milestone 05's live evaluation still outstanding

## Next action
Milestone 05's acceptance criterion ("at least 100 representative
conversations are evaluated") is still NOT met: no live model run has happened,
because this environment has no API keys and no Supabase project. To close it
out:
1. Provide ANTHROPIC_API_KEY and VOYAGE_API_KEY, and set EMBEDDING_PROVIDER=voyage.
2. Create a Supabase project, apply migrations 0001–0008, seed a demo business
   with products + knowledge.
3. Wire evals/run.mjs to that org (currently it estimates cost and stops), then
   run `npm run eval` (~$2.05 for 105 cases before caching) and record results
   in progress/TEST_RESULTS.md.
That same setup is now also what stands between the widget and a real visitor
conversation: everything up to the model call is proved (see M09 in
TEST_RESULTS.md), but no live chat has run end to end.

Next milestone: 10 — WhatsApp. Two things it must carry: connecting production
WhatsApp is a decision-boundary stop that needs the founder's approval before
anything touches Meta's production credentials, and the webhook work is where
audit finding #13 lands (signature verification, an `external_event_id` unique
constraint for idempotency, replay rejection). Milestone 11 (Billing) is still
blocked on ADR-010 — Paystack vs Flutterwave — which remains PROPOSED.

## Rule
Update this file after every completed milestone.
