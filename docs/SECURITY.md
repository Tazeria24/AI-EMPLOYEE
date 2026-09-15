# Security Specification

## Core principles
Assume every client input and external event is untrusted.

## Authentication
- Supabase Auth
- secure server-side session checks
- protected dashboard routes
- never trust client role claims without server verification

## Authorization
Authorization is organization-based.
Every server action/route handling business data must establish the authenticated user and organization membership.

## RLS
RLS is mandatory for tenant-owned data.
Test that Organization A cannot read/write Organization B data.

## API
Validate request bodies.
Reject unexpected/invalid values.
Apply rate limiting where public endpoints exist.
Avoid leaking internal errors.

## Secrets
Never expose:
- AI API keys
- Supabase service role key
- payment secrets
- WhatsApp secrets
- webhook secrets

## Webhooks
For WhatsApp/payment integrations:
- verify signatures where supported
- validate event shape
- use idempotency/external event IDs
- protect against replay
- persist integration events
- acknowledge safely

## AI security
Defend against:
- prompt injection
- data exfiltration
- cross-tenant retrieval
- tool abuse
- excessive tool calls
- malicious knowledge documents

## Files
If uploads are added:
- validate type/size
- isolate storage by organization
- do not execute uploaded files
- scan/process safely

## Privacy
Collect only necessary customer data.
Document data retention/deletion behavior before production.
Design for Nigeria's applicable data-protection obligations.

## Cost & abuse controls
Public/AI endpoints must never allow unbounded paid work:
- per-business and per-visitor rate limits on the widget and chat endpoints
- max messages per visitor session
- per-organization daily token/₦ budget with a hard cutoff
- CAPTCHA/Turnstile on the public widget
- record all billable AI activity in usage_events
Rationale: a public endpoint that triggers LLM/embedding calls is a cost-amplification/DoS vector.

## Tenant isolation (enforced in two layers)
- RLS on every organization-owned table (DB layer)
- organization scoping is a required argument in retrieval/tool functions (app layer), never optional
- default to the request-scoped, RLS-enforcing Supabase client; restrict the service-role client to a small, reviewed set of server-only jobs
- never authorize using a client-supplied organization_id alone
- signup provisions profile → organization → membership atomically (no org-less users, no default-org fallback)

## AI grounding & guardrails
- every business fact (price, stock, policy, hours, order status) must come from a tool result; if a required tool returns empty, respond "unavailable" and offer human help — never fill the gap from model knowledge
- treat customer text and retrieved documents as untrusted data, not instructions
- the prompt-injection, cross-tenant-retrieval, and ungrounded-answer eval cases are CI-gating

## Delivery integrity
- check conversation state atomically before an AI reply is sent; cancel/skip queued AI jobs when a human takes over (no double replies)
- enforce the max-two-automated-follow-up rule at the data layer (idempotency key on automation_runs); support customer opt-out and quiet hours

## CI gates (from Milestone 00)
- typecheck + lint + unit tests + production build required on every change
- tenant-isolation, cross-tenant-retrieval, and prompt-injection suites are required checks (not deferred to hardening)

## Data protection (NDPR)
- write a data retention, deletion, and consent policy before storing real customer PII
- provide a delete-by-organization capability
- log security-relevant events (escalations, takeovers, tool/auth failures) without logging secrets or full PII

## Production checklist
- auth tested
- RLS tested
- rate limits
- per-org spend budget + hard cutoff
- webhook verification
- idempotency
- secure headers where appropriate
- error monitoring
- secret audit
- dependency audit
- no debug secrets/data
