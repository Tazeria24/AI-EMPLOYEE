# AI Sales Employee

An AI sales and customer-service employee for SMEs (initial ICP: Nigerian
online retailers selling through websites, Instagram and WhatsApp). The AI
answers questions, recommends products, captures and qualifies leads, follows
up, escalates to humans and reports activity — using **verified business data
only**.

This repository currently contains **Milestone 00 — Foundation**: the
application shell. See `docs/` for specifications and `progress/` for status
and decisions.

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
proxy.ts             Session refresh + route protection (Next 16 proxy)
docs/                Product, architecture, security specifications
progress/            PROGRESS, DECISIONS (ADRs), TEST_RESULTS
tasks/               Milestone task definitions (00–13)
```

## Contributing

Read `CLAUDE.md` before changing code. Every feature is done only when
implementation, types, lint, tests, security review, migrations, UX states and
documentation/state updates are complete.
