# AI Sales Employee

An AI sales and customer-service employee for SMEs (initial ICP: Nigerian
online retailers selling through websites, Instagram and WhatsApp). The AI
answers questions, recommends products, captures and qualifies leads, follows
up, escalates to humans and reports activity — using **verified business data
only**.

Implemented so far: **Milestones 00–06** — application foundation,
authentication, multi-tenancy with RLS, the product catalog, the knowledge base
with pgvector retrieval, the AI agent (implementation complete; live evaluation
still pending — see `progress/PROGRESS.md`), and the conversation inbox with
human takeover. See `docs/` for specifications and `progress/`
for status, test results and decisions.

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
psql -d app -f supabase/tests/tenant_isolation.sql      # prints PASSED on success
psql -d app -f supabase/tests/products_isolation.sql    # prints PASSED on success
psql -d app -f supabase/tests/knowledge_isolation.sql   # prints PASSED on success
psql -d app -f supabase/tests/agent_isolation.sql       # prints PASSED on success
psql -d app -f supabase/tests/conversations_isolation.sql
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
- **Human takeover always wins.** AI replies are written through
  `append_ai_message()`, which re-checks the conversation state under a row
  lock. If someone took over while the model was still thinking, the reply is
  discarded rather than posted — so a customer never sees the AI and a person
  answering at once.

```bash
npm test          # deterministic suite — no API key, no network, no cost
npm run eval      # live evaluation: 105 cases, prints a cost estimate first
```

`npm run eval` calls the real model and spends money, so it is deliberately
outside CI and asks for confirmation before running.

## Project structure

```
app/                 App Router routes and layouts
  api/health/        Health-check route handler
  login, signup, …   Auth pages
  auth/confirm/      Email verification / recovery callback
  dashboard/         Protected area (auth-guarded layout)
components/ui/       Reusable UI primitives (Button, Card, Input, Label)
components/auth/     Auth-specific presentational components
lib/                 Utilities and integrations
  env.ts             Environment access + validation
  site-url.ts        Resolve the site origin for email redirects
  supabase/          Browser, server and proxy Supabase clients
  auth/              Auth server actions + input validation
  organizations/     Org/membership/business-profile service, actions, validation
  products/          Product/category service, actions, validation, types
  knowledge/         Knowledge documents, chunking, indexing, retrieval
  conversations/     Inbox service, actions and the AI/human state machine
  leads/             Customer + lead capture service and validation
  ai/provider/       Chat + embedding provider abstractions (Anthropic, Voyage, stub)
  ai/prompts/        System prompt construction
  ai/tools/          The agent's server-authorized tools
  ai/guardrails/     Untrusted-content wrapping + grounded-claim checking
  ai/agent/          The tool loop and its server action
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
