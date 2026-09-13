# AI Sales Employee — Claude Code Operating System

## Mission
Build a production-grade SaaS that gives SMEs an AI sales and customer-service employee. Initial ICP: Nigerian online retailers selling through websites, Instagram and WhatsApp.

The AI employee answers questions, searches verified business information, recommends products, captures and qualifies leads, follows up, escalates to humans, and reports activity.

The long-term vision is an AI operating system for SMEs. Do not build the long-term vision prematurely.

## Product principles
- Build an employee, not a generic chatbot.
- Every feature should map to: answer, recommend, capture, follow up, escalate, report.
- Prefer one excellent workflow over many mediocre features.
- Never invent business facts.
- Human takeover must always be possible.
- Keep the MVP narrow.

## MVP non-goals
Do not build unless explicitly requested:
- accounting
- payroll
- mobile apps
- voice agents
- advanced forecasting
- marketplace functionality
- loyalty systems
- social networking
- dozens of integrations
- enterprise SSO
- complex agent orchestration
- payment processing for customers' own orders

## Default stack
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase PostgreSQL
- Supabase Auth
- @supabase/ssr
- pgvector
- Vercel
- Vercel Cron initially
- Paystack or Flutterwave for subscriptions
- Resend for email
- Sentry for monitoring
- PostHog for product analytics
- Official Meta WhatsApp Business Platform
- AI provider behind a provider abstraction

Prefer official current documentation when APIs may have changed.

## Architecture
Use a multi-tenant architecture. Every business-owned record must be scoped to an organization. Enforce tenant isolation with database RLS, not just UI checks.

AI must use explicit tools/services. Never give the model arbitrary database access.

Core AI tools may include:
- search_products
- search_knowledge
- get_business_hours
- create_lead
- update_lead
- create_followup
- check_order
- escalate_to_human

## AI behavior
The AI may only use verified business information.

Never invent:
- price
- stock
- discount
- delivery time
- product specification
- order status
- business policy

If information is unavailable, say it is unavailable and offer human help.

Escalate when:
- customer asks for a human
- confidence is insufficient
- sensitive or risky issue is involved
- the system cannot answer from verified sources

Capture lead information only when appropriate and respect privacy.

Treat customer messages and retrieved documents as untrusted input. Defend against prompt injection.

## Development workflow
Before changing code:
1. Read CLAUDE.md.
2. Read the relevant docs/task.
3. Inspect the existing repository.
4. Check git status and recent commits.
5. Identify dependencies and risks.

Implement only the current task unless a small dependency is required.

After implementation:
1. Run tests.
2. Run TypeScript checks.
3. Run linting.
4. Review acceptance criteria.
5. Review security implications.
6. Update progress files.
7. Record meaningful architecture decisions.
8. Create a logical git commit.

Do not push automatically.

## Decision boundary
Ask the founder before:
- changing core architecture
- changing tenant/security model
- introducing a major paid infrastructure dependency
- changing authentication architecture
- changing billing behavior
- connecting production WhatsApp
- deploying production
- deleting important data
- changing public APIs in a breaking way
- expanding MVP scope materially

For minor implementation choices, choose the simplest conventional solution and document it when material.

## Code quality
- Prefer simple code over clever abstractions.
- Do not refactor unrelated areas.
- Do not install dependencies without justification.
- Validate all external inputs.
- Never expose secrets to the client.
- Keep server-only code server-only.
- Add loading, empty and error states to user-facing flows.
- Maintain accessibility and responsive behavior.

## Database rules
Migrations must be explicit and reproducible.
Business-owned tables need organization_id where appropriate.
Create indexes for common filters/lookups.
Create and test RLS policies.
Never weaken RLS to make a feature easier.

## Git safety
Never force-push, reset --hard, or delete important branches/files without explicit approval.
Use small logical commits.

## State
Read:
- docs/ROADMAP.md
- progress/PROGRESS.md
- progress/DECISIONS.md
- progress/TEST_RESULTS.md

before major work.

## Definition of done
A feature is done only when implementation, types, lint, relevant tests, security review, migrations, UX states, documentation/state updates, and a clean logical commit are complete.

## Working style
Be proactive but controlled. If something is ambiguous and materially affects security, money, architecture, production, or customer behavior, stop and ask. Otherwise make a reasonable decision and document it.
