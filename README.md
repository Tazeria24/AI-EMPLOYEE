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

## Project structure

```
app/                 App Router routes and layouts
  api/health/        Health-check route handler
components/ui/       Reusable UI primitives (Button, Card)
lib/                 Utilities and integrations
  env.ts             Environment access + validation
  supabase/          Browser and server Supabase clients
docs/                Product, architecture, security specifications
progress/            PROGRESS, DECISIONS (ADRs), TEST_RESULTS
tasks/               Milestone task definitions (00–13)
```

## Contributing

Read `CLAUDE.md` before changing code. Every feature is done only when
implementation, types, lint, tests, security review, migrations, UX states and
documentation/state updates are complete.
