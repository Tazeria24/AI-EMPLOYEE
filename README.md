# AI Sales Employee

An AI sales and customer-service employee for SMEs (initial ICP: Nigerian
online retailers selling through websites, Instagram and WhatsApp). The AI
answers questions, recommends products, captures and qualifies leads, follows
up, escalates to humans and reports activity — using **verified business data
only**.

Implemented so far: **Milestones 00–11** — application foundation,
authentication, multi-tenancy with RLS, the product catalog, the knowledge base
with pgvector retrieval, the AI agent (implementation complete; live evaluation
still pending — see `progress/PROGRESS.md`), the conversation inbox with human
takeover, the lead pipeline, automated follow-up, the embeddable website
widget, the WhatsApp channel, and subscription billing (the last two are built
and proved deterministically; a live round trip against Meta and a chosen
payment provider are still pending — see `progress/PROGRESS.md`). See
`docs/` for specifications and `progress/` for status, test results and
decisions.

## Tech stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4 + shadcn/ui-style primitives
- Supabase (Postgres, Auth, `@supabase/ssr`) — multi-tenant with RLS
- Vitest for tests
- Deployed on Vercel

## Prerequisites

- Node.js 20+ (developed on Node 22)
- npm 10+
- A Supabase project (for auth/data features in later milestones)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# then fill in the Supabase values in .env.local

# 3. Run the dev server
npm run dev
```

Open http://localhost:3000. A health check is available at
http://localhost:3000/api/health.

## Environment variables

See `.env.example`. Conventions:

- `NEXT_PUBLIC_*` variables are safe to expose to the browser.
- All other variables are **server-only secrets** and must never reach the
  client. The Supabase service-role key bypasses RLS and is server-only.
- `.env*` files are gitignored; never commit real secrets.

## Scripts

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start the dev server                 |
| `npm run build`     | Production build                     |
| `npm start`         | Run the production build             |
| `npm run lint`      | ESLint                               |
| `npm run typecheck` | TypeScript type checking (`tsc`)     |
| `npm test`          | Run the Vitest suite once            |
| `npm run test:watch`| Run Vitest in watch mode             |
| `npm run eval`      | Live agent evaluation (costs money)  |

## Authentication

Auth uses Supabase with `@supabase/ssr` (cookie-based SSR sessions). Routes:

- `/signup`, `/login`, `/forgot-password`, `/reset-password`
- `/auth/confirm` — handles email verification and password-recovery links
- `/dashboard` — protected; unauthenticated visitors are redirected to `/login`

Sessions are refreshed in `proxy.ts`, and identity is always verified with
`supabase.auth.getUser()` (never trusted from cookies alone). Protected routes
are guarded both in the proxy and in the dashboard layout (defense in depth).

To make email flows work, configure your Supabase project's Auth settings:

- Add your site URL and `${SITE_URL}/auth/confirm` to the allowed redirect URLs.
- Set `NEXT_PUBLIC_SITE_URL` in production (falls back to request headers in dev).

## Database & multi-tenancy

SQL migrations live in `supabase/migrations/`. `organization` is the tenant
boundary: every business-owned table carries `organization_id` and is protected
by Row Level Security (members read; owner/admin write). On signup a trigger
provisions a profile, organization, owner membership and an empty business
profile atomically, so a user is never without an organization.

Apply migrations on a real Supabase project via the Supabase CLI or the SQL
editor. Tenant-isolation tests can run against any PostgreSQL without the
Supabase CLI:

```bash
# against a local Postgres database named "app", as a superuser role:
psql -d app -f supabase/tests/00_supabase_shim.sql      # local-only auth shim
psql -d app -f supabase/migrations/0001_multi_tenancy.sql
psql -d app -f supabase/migrations/0002_products.sql
psql -d app -f supabase/migrations/0003_knowledge.sql   # needs the pgvector extension
psql -d app -f supabase/migrations/0004_embeddings_voyage.sql
psql -d app -f supabase/migrations/0005_agent.sql
psql -d app -f supabase/migrations/0006_conversations.sql
psql -d app -f supabase/migrations/0007_automations.sql
psql -d app -f supabase/migrations/0008_widget.sql
psql -d app -f supabase/migrations/0009_whatsapp.sql
psql -d app -f supabase/migrations/0010_billing.sql
psql -d app -f supabase/tests/tenant_isolation.sql      # prints PASSED on success
psql -d app -f supabase/tests/products_isolation.sql    # prints PASSED on success
psql -d app -f supabase/tests/knowledge_isolation.sql   # prints PASSED on success
psql -d app -f supabase/tests/agent_isolation.sql       # prints PASSED on success
psql -d app -f supabase/tests/conversations_isolation.sql
psql -d app -f supabase/tests/leads_isolation.sql
psql -d app -f supabase/tests/automations_isolation.sql
psql -d app -f supabase/tests/widget_isolation.sql
psql -d app -f supabase/tests/whatsapp_isolation.sql
psql -d app -f supabase/tests/billing_isolation.sql
```

On Supabase the shim is unnecessary — `auth.uid()` and the `authenticated`
role already exist.

## Knowledge base & embeddings

Knowledge documents (FAQs, policies, documents) are chunked, embedded and
stored in `knowledge_chunks` as pgvector `vector(1024)` values with an HNSW
cosine index. Retrieval goes through the `match_knowledge_chunks` RPC, which is
`SECURITY INVOKER` so RLS — not the passed organization id — is the
authorization boundary.

Embeddings go through a provider abstraction (`lib/ai/provider`).
`EMBEDDING_PROVIDER=voyage` uses Voyage AI `voyage-4` (1024 dimensions,
ADR-009) and needs `VOYAGE_API_KEY`. `EMBEDDING_PROVIDER=stub` uses a
deterministic local embedder for tests and offline development: no network
calls, no cost, reproducible — but **lexical, not semantic, so never use it in
production**. Any provider must emit 1024-dimension vectors, or the schema
needs a migration and a full re-embed.

## The AI employee

The agent runs on Claude Sonnet 5 (ADR-008) behind a `ChatProvider` interface,
and is exercised from `/dashboard/assistant`.

Its safety properties are structural, not just prompted:

- **Tools are server-authorized.** Every tool handler receives the
  `organization_id` from the session — never from model output — and RLS
  enforces the same boundary independently.
- **Customer text and retrieved documents are untrusted data**, wrapped in
  `<untrusted>` blocks with delimiter forgery neutralized.
- **Grounding is verified, not assumed.** Before a reply is released, price and
  stock figures in it are matched against that turn's tool results. Anything
  unverified blocks the reply and escalates to a human instead.
- **Spend is bounded**: a hard cap on tool iterations per customer turn.
- **Automated follow-up cannot spam.** At most two follow-ups per lead, with
  that cap and de-duplication enforced by database constraints rather than
  application logic, so a scheduler retry or an overlapping cron firing cannot
  send a third or a duplicate. Quiet hours and customer opt-out are part of
  eligibility, and the cron endpoint requires a constant-time secret.
- **Human takeover always wins.** AI replies are written through
  `append_ai_message()`, which re-checks the conversation state under a row
  lock. If someone took over while the model was still thinking, the reply is
  discarded rather than posted — so a customer never sees the AI and a person
  answering at once.
- **Public spend is capped in the database.** The website widget is a public
  endpoint where every message costs an LLM call, so the per-session and
  per-organization daily limits are checked and recorded together under a row
  lock, before anything paid runs. See "The website widget" below.

```bash
npm test          # deterministic suite — no API key, no network, no cost
npm run eval      # live evaluation: 105 cases, prints a cost estimate first
```

`npm run eval` calls the real model and spends money, so it is deliberately
outside CI and asks for confirmation before running.


## The website widget

The widget is the first surface reachable by the public internet, and every
message on it costs money. That shapes its whole design.

A business pastes one line into their site:

```html
<script async src="https://your-domain.com/api/widget/embed?key=WIDGET_KEY"></script>
```

The loader injects an **iframe pointing back at our own origin**, so the chat
runs in our document, not theirs: the session token, the transcript and the
Supabase key are never readable by the host page, and every request the widget
makes is same-origin. Which sites may embed it is set per business from
`allowed_origins` and served as a `Content-Security-Policy: frame-ancestors`
header; every other route in the app is `frame-ancestors 'none'`.

What an anonymous visitor can actually do is defined by database grants rather
than by application code:

- The public API is **four SECURITY DEFINER functions** — `widget_config`,
  `widget_start_session`, `widget_send`, `widget_frame_policy`. The `anon` role
  holds EXECUTE on those and **no table privileges at all**, so a bug in a
  route handler cannot become table access.
- `widget_config` returns a name, a greeting and a colour. No prices, no
  knowledge, no organization id — and an unknown key looks exactly like a
  disabled one.
- **Spend caps are enforced inside `widget_send`, under a row lock on the
  session**, in the same transaction that records the message: a per-session
  message cap, a per-organization daily message cap, and a per-organization
  daily session cap (so opening fresh sessions is not a way around the first).
  An application-level check would lose the race against concurrent requests;
  this one does not, and a refused message releases the quota it took.
- **The caller never names a tenant.** The visitor holds an opaque 256-bit
  session token; the database resolves it to an organization, and that is what
  the agent runs against.
- The widget ships **switched off**. Turning it on is an owner/admin action,
  and turning it back off stops the whole public surface immediately.

Every widget conversation lands in `/dashboard/conversations`, where a human
can take over at any time — and a takeover mid-turn discards the AI's in-flight
reply rather than posting it.


## WhatsApp

The official Meta WhatsApp Business Platform (never WhatsApp Web scraping). A
business connects their own number from `/dashboard/whatsapp`, and customers
message the AI employee directly — every thread lands in the same inbox, with
the same human takeover.

The webhook is public and costs money per event, so the order of operations at
`POST /api/webhooks/whatsapp` is the security argument:

1. Read the **raw body** — the signature covers those exact bytes, and hashing
   re-serialized JSON would never match.
2. Parse it **only far enough to route**: `phone_number_id` says which
   business's app secret applies. Nothing is acted on yet.
3. Verify `X-Hub-Signature-256` (HMAC-SHA256, constant-time). Fail → 401, with
   nothing written and nothing spent. An unknown number and a forged signature
   are indistinguishable from outside.
4. **Claim the event by its Meta message id.** Meta redelivers after any
   non-200, so duplicates are ordinary traffic; a `unique (provider,
   external_event_id)` constraint means a redelivery costs one no-op INSERT
   instead of a second AI reply — even when the retry arrives before the first
   delivery has committed.
5. Only then: record the customer, the conversation and the message, answer,
   and send.

Everything past step 3 answers 200. Reporting our own failure to Meta would
just multiply retries; failures are recorded on `integration_events` and shown
in the dashboard instead.

Two further properties worth knowing:

- **Credentials are write-only.** `verify_token`, `app_secret` and
  `access_token` carry no SELECT grant for the dashboard role at all — reading
  one is a privilege error. The UI reads a view that reports only whether each
  is set.
- **It ships switched off**, and refuses to be switched on until every
  credential is present. Connecting production WhatsApp is a founder decision
  (`CLAUDE.md`), so it is a deliberate act, and the same switch is the kill
  switch.

Current limits: text only (media is acknowledged, not interpreted), and no
message templates — so an automated follow-up reaches a customer only within
Meta's 24-hour customer service window. Outside it the send is refused and
recorded rather than attempted.


## Plans and billing

Three plans (Starter ₦15,000, Growth ₦35,000, Pro ₦75,000 per month), and every
organization starts on a 14-day Starter trial so it is never without an
entitlement.

`tasks/11` sets two requirements, and both are answered by the database rather
than by application code:

- **"Never trust client-submitted subscription state."** The dashboard role has
  SELECT on `subscriptions` and **no INSERT, UPDATE or DELETE grant at all**.
  There is no form, action or future handler that can move an organization onto
  a better plan — trying raises a privilege error. The only writer is the
  verified payment webhook.
- **"Plan access is server-enforced."** Limits are **triggers** on the tables
  they govern, so they hold for every write path — the dashboard, an AI tool,
  the cron runner, or something added next year — rather than being re-checked
  at each call site until one is missed. Going over raises SQLSTATE `PLIM1`,
  whose message is already written for the customer.

Entitlement follows status: `trialing`, `active` and `past_due` all keep the
plan — a failed card should start a conversation, not switch a business's
customer service off mid-day — while `canceled` and `incomplete` fall back to
`none`, which allows no new data and no widget traffic.

The payment webhook reuses exactly what the WhatsApp one established: raw-body
signature verification before anything is acted on, event claiming by the
provider's event id so a retried renewal cannot extend the period twice, and a
200 for every outcome past the signature.

**No payment provider is chosen yet.** ADR-010 (Paystack vs Flutterwave) is a
founder decision, so this milestone ships a `PaymentProvider` abstraction with a
deterministic stub — the same approach the knowledge base took before the Voyage
decision. The stub signs and verifies webhooks with the same scheme a real
provider uses, so everything above is genuinely exercised; it just does not take
money, and refuses to run unless `PAYMENT_PROVIDER=stub` is set explicitly.
Adding a real provider is one file and one `case`.

## Project structure

```
app/                 App Router routes and layouts
  api/health/        Health-check route handler
  api/widget/        Public widget endpoints (config, session, message, embed)
  api/webhooks/      Signed provider webhooks (WhatsApp, payments)
  widget/[key]/      The embeddable chat, rendered on our own origin
  login, signup, …   Auth pages
  auth/confirm/      Email verification / recovery callback
  dashboard/         Protected area (auth-guarded layout)
components/ui/       Reusable UI primitives (Button, Card, Input, Label)
components/auth/     Auth-specific presentational components
lib/                 Utilities and integrations
  env.ts             Environment access + validation
  site-url.ts        Resolve the site origin for email redirects
  supabase/          Browser, server, proxy and public (anon) Supabase clients
  auth/              Auth server actions + input validation
  organizations/     Org/membership/business-profile service, actions, validation
  products/          Product/category service, actions, validation, types
  knowledge/         Knowledge documents, chunking, indexing, retrieval
  conversations/     Inbox service, actions and the AI/human state machine
  leads/             Pipeline service, actions, status model and validation
  automations/       Follow-up eligibility rules, runner and service
  delivery/          Delivery providers (conversation, Resend email)
  supabase/admin.ts  Service-role client — cron + widget only, bypasses RLS
  leads/             Customer + lead capture service and validation
  ai/provider/       Chat + embedding provider abstractions (Anthropic, Voyage, stub)
  ai/prompts/        System prompt construction
  ai/tools/          The agent's server-authorized tools
  ai/guardrails/     Untrusted-content wrapping + grounded-claim checking
  ai/agent/          The tool loop and its server action
  widget/            Public widget validation, settings, frame policy
  whatsapp/          Signature + handshake, payload parsing, 24h window, client
  billing/           Plans, entitlements, usage, plan-limit errors
  payments/          PaymentProvider abstraction (stub until ADR-010)
evals/               Live evaluation cases (105) and runner
proxy.ts             Session refresh + route protection (Next 16 proxy)
supabase/            SQL migrations and tenant-isolation tests
docs/                Product, architecture, security specifications
progress/            PROGRESS, DECISIONS (ADRs), TEST_RESULTS
tasks/               Milestone task definitions (00–13)
```

## Contributing

Read `CLAUDE.md` before changing code. Every feature is done only when
implementation, types, lint, tests, security review, migrations, UX states and
documentation/state updates are complete.
