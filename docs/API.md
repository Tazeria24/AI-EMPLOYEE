# API Contract

## Conventions
Use typed request/response contracts.
Validate inputs server-side.
Return safe errors.
Require authentication for dashboard APIs.
Require organization authorization for tenant data.

## Initial routes

POST /api/chat
POST /api/ai/respond

Products:
GET /api/products
POST /api/products
PATCH /api/products/:id
DELETE /api/products/:id

Knowledge:
GET /api/knowledge
POST /api/knowledge
PATCH /api/knowledge/:id
DELETE /api/knowledge/:id

Conversations:
GET /api/conversations
GET /api/conversations/:id
POST /api/conversations/:id/messages
POST /api/conversations/:id/takeover
POST /api/conversations/:id/release

Leads:
GET /api/leads
GET /api/leads/:id
POST /api/leads
PATCH /api/leads/:id
POST /api/leads/:id/followup

Automations:
GET /api/automations
POST /api/automations
PATCH /api/automations/:id
POST /api/automations/:id/test

Widget:
GET /api/widget/config
POST /api/widget/session

Webhooks:
POST /api/webhooks/whatsapp
POST /api/webhooks/payments

Billing:
GET /api/billing
POST /api/billing/checkout
POST /api/billing/portal

## Public endpoints
Public widget endpoints must use a non-secret business identifier and strict validation/rate limits. Never expose private tenant data.

## Error shape
Use a consistent safe shape such as:
{
  "error": {
    "code": "SAFE_MACHINE_CODE",
    "message": "Human-readable safe message"
  }
}

Do not return stack traces or secrets.
