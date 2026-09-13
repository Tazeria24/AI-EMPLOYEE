# Architecture

## High-level
Browser
  -> Next.js App Router
  -> application services
  -> Supabase PostgreSQL / pgvector
  -> AI provider abstraction
  -> external channels/integrations

## Frontend
Next.js App Router + TypeScript + Tailwind + shadcn/ui.

Primary surfaces:
- marketing site
- onboarding
- dashboard
- conversations
- customers
- leads
- products
- knowledge
- automations
- analytics
- settings
- billing
- widget

## Backend
Use Next.js Route Handlers and Server Actions initially.
Business logic belongs in service modules rather than being duplicated across routes/components.

Suggested services:
- conversations
- leads
- knowledge
- products
- automations
- billing
- integrations

## Authentication
Supabase Auth + @supabase/ssr.
Server-side session handling for protected routes.

## Multi-tenancy
Organization is the tenant boundary.
organization_members maps users to organizations and roles.
Business-owned tables reference organization_id.
Supabase RLS enforces access.

## AI layer
Use a provider interface so the model can change without rewriting product logic.

Suggested layers:
- ai/provider
- ai/prompts
- ai/agent
- ai/tools
- ai/retrieval
- ai/guardrails

Flow:
customer message
-> conversation service
-> retrieval/tool selection
-> verified context
-> model
-> structured tool calls if needed
-> response validation
-> message persistence
-> channel delivery

## RAG
Store source documents and chunks with organization_id.
Generate embeddings.
Retrieve only chunks belonging to the current organization.
Return source metadata to the AI layer.
Never allow cross-tenant retrieval.

## Tools
Tools should have narrow contracts and server-side authorization.
Examples:
search_products(query, filters)
search_knowledge(query)
get_business_hours()
create_lead(data)
update_lead(id, data)
create_followup(lead_id, scheduled_at, message)
escalate_to_human(conversation_id, reason)

## Conversation states
AI_ACTIVE
HUMAN_ACTIVE
CLOSED

When HUMAN_ACTIVE, automated AI replies must stop unless explicitly reactivated.

## Automations
Start with scheduled jobs.
Example:
lead inactive for 24h -> generate follow-up -> send -> record automation_run.
Maximum two automated follow-ups initially.

## Channels
Phase 1: website widget.
Phase 2: official WhatsApp Business Platform.
Do not scrape WhatsApp Web.

## Billing
Subscription state belongs to organization.
Usage events record billable/limit-relevant activity.
Payment provider is abstracted.

## Observability
- Sentry for errors
- PostHog for product events
- structured server logs
- integration event records for external webhooks

## Deployment
Vercel for application.
Supabase for database/auth/storage.
Production secrets only in deployment environment.
