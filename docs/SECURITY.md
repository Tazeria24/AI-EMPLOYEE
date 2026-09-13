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

## Production checklist
- auth tested
- RLS tested
- rate limits
- webhook verification
- idempotency
- secure headers where appropriate
- error monitoring
- secret audit
- dependency audit
- no debug secrets/data
