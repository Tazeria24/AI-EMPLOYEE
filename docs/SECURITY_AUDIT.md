# Security Audit — Milestone 12

Date: 2026-09-15. Scope: milestones 00–12 on branch
`claude/md-file-github-repo-jx0fhp`.

`tasks/12` asks for six audits. Each section below states what was checked,
what was found, and what was done. **Findings are listed even where they were
fixed in the same pass** — a clean audit with no findings usually means the
audit was not performed.

Evidence for every claim is either a test in `npm test`, a suite in
`supabase/tests/`, or a command reproduced inline.

---

## 1. Authentication audit

**Checked:** session handling, route protection, the reset and verification
flows, and what an unauthenticated caller can reach.

- Identity is always re-derived with `supabase.auth.getUser()`, never trusted
  from a cookie (`lib/supabase/middleware.ts`). ✅
- `/dashboard` and `/onboarding` are guarded in the proxy **and** again in the
  dashboard layout. ✅
- A wrong password and an unknown account return the identical message, so the
  form is not an account-existence oracle. ✅
- Password reset responds identically whether or not the address is
  registered. ✅

**Finding A1 — no rate limiting on any auth route (fixed).**
`docs/SECURITY.md` has required rate limits since Milestone 00 and there were
none: password guessing against `/login` was free, and `/forgot-password` was
an open way to send someone a lot of email. Fixed in migration 0011 and
`lib/security/rate-limit.ts` — per-email and per-IP limits on sign-in, per-IP
on signup, per-email on reset. The counter is atomic
(`consume_rate_limit`), because a read-then-increment limiter loses exactly the
burst it exists to stop. Proved in `supabase/tests/hardening_isolation.sql`.

**Finding A2 — failed logins were not recorded (fixed).** There was no way to
notice an attack in progress. `security_events` now records sign-in failures
and throttling, with the subject **hashed** so the table says someone was
throttled without saying who.

**Accepted risk:** the per-IP limit reads `x-forwarded-for`, which is
attacker-controlled. It is a speed bump, which is why the per-email limit
exists beside it and why nothing is authorized on that value.

---

## 2. RLS / tenant-isolation audit

**Checked:** every organization-owned table has RLS enabled with policies, and
Organization A cannot read or write Organization B.

Eleven SQL suites run against real PostgreSQL 16, all passing:
`tenant`, `products`, `knowledge`, `agent`, `conversations`, `leads`,
`automations`, `widget`, `whatsapp`, `billing`, `hardening`.

Beyond plain isolation, these prove the properties that RLS alone does not:

| Property | Where |
| --- | --- |
| Cross-tenant RAG returns nothing | `knowledge_isolation.sql` |
| A late AI reply is discarded after takeover | `conversations_isolation.sql` |
| A third follow-up is impossible | `automations_isolation.sql` |
| `anon` holds no table privileges at all | `widget_isolation.sql` |
| A replayed webhook cannot be recorded twice | `whatsapp_isolation.sql` |
| The dashboard cannot write its own subscription | `billing_isolation.sql` |
| Erasure actually erases | `hardening_isolation.sql` |

**Finding R1 — the service-role client is now used in five places (documented,
not a defect).** ADR-054 said the widget was "the second and last" exception;
that promise did not survive M10 and M11. The count was never the invariant.
`lib/supabase/admin.ts` now states the rule instead: background jobs with no
session, and request handlers whose **tenant is resolved by the database**
rather than named by the caller. Every such query is filtered by
`organization_id` explicitly.

**Finding R2 — `listProducts` relied on RLS alone (fixed in M10).** Under a
service-role client it would have returned every tenant's products. It and
`listMessages` now throw if given an injected client without an
`organizationId` (ADR-055).

**No known critical tenant-isolation issue remains** — the acceptance criterion
for this milestone.

---

## 3. API / input-validation audit

**Checked:** every public route handler and server action validates its input
before use, and returns a safe error shape.

| Surface | Validation | Errors |
| --- | --- | --- |
| `/api/widget/config` | key shape (32 hex) | 404, opaque |
| `/api/widget/session` | key shape, rate limit | 404 / 429 |
| `/api/widget/message` | token shape (64 hex), 2 000-char cap, rate limit | 400 / 403 / 404 / 429 |
| `/api/widget/embed` | key shape before templating | 400 |
| `/api/webhooks/whatsapp` | signature, then defensive payload parsing | 401, else 200 |
| `/api/webhooks/payments` | signature, then shape check | 401, else 200 |
| `/api/cron/*` | constant-time bearer | 401 |
| Server actions | pure `parse*` per domain, unit-tested | redirect with a safe message |

- `ILIKE` search escapes `%` and `_` in user input (`lib/products/service.ts`). ✅
- The widget theme colour is re-checked against a hex literal before it reaches
  a style attribute. ✅
- Allowed embed origins are validated against a strict `scheme://host[:port]`
  shape before reaching a CSP header; `"; script-src *"` and `'unsafe-inline'`
  are rejected (unit-tested). ✅
- No handler returns a stack trace or a provider error body. ✅

**Finding I1 — no structured logging, so errors were unactionable (fixed).**
`lib/observability/` adds JSON logging with two-layer redaction: by key
(anything named like a secret) and by shape (emails, phone numbers,
token-shaped strings in free text). Unit-tested, including circular structures
and depth limits — a logger that throws while logging an error is worse than
none.

---

## 4. Webhook security audit

Both webhooks were reviewed against the `docs/SECURITY.md` checklist.

| Requirement | WhatsApp | Payments |
| --- | --- | --- |
| Verify signature | HMAC-SHA256 over the **raw** body, constant-time | same scheme, provider-supplied |
| Validate event shape | defensive parser, 8 malformed-body tests | shape check, unknown plan/status dropped |
| Idempotency by external id | `unique (provider, external_event_id)` | same table, same constraint |
| Replay protection | proved, including under two concurrent connections | same mechanism |
| Persist integration events | `integration_events` | `integration_events` |
| Acknowledge safely | 200 for everything past the signature | same |

Two details that decide whether signature checking is real rather than
decorative, both unit-tested:

1. **The raw body is hashed**, not re-serialized JSON. A test signs a
   pretty-printed body and asserts the reparsed equivalent fails.
2. **Comparison is constant-time**, with a length pre-check so a mismatched
   length returns false instead of throwing.

**Finding W1 — parsing happens before verification (reviewed, accepted).** The
body must be parsed to read `phone_number_id` and find the right app secret.
Nothing is written, sent or spent before the signature passes, and the parser
is pure and tested against malformed input, so it is not itself a vector.

**Finding W2 — webhook payloads were stored indefinitely (fixed).**
`integration_events.payload` keeps a customer's WhatsApp number. The retention
sweep now redacts payloads after 30 days while keeping the row, because the row
is the idempotency record.

---

## 5. Prompt-injection and AI-security audit

**Checked:** the defences that do not depend on the model choosing to behave.

- Customer text and retrieved documents are wrapped as untrusted **data**, with
  delimiter forgery neutralized. `lib/ai/guardrails/injection.test.ts` runs
  eight real payloads — direct override, delimiter forgery in both cases,
  attribute-stuffed delimiters, cross-tenant requests, exfiltration, role-play
  and a poisoned knowledge document — and asserts exactly one block survives. ✅
- Grounding is verified, not prompted: a price or stock figure absent from this
  turn's tool results blocks the reply and escalates. The injection suite
  asserts this holds *even when the injection succeeds* — the payoff of a
  successful injection is a wrong price, and this is the layer that stops it. ✅
- Tools receive `organizationId` from the server, never from model output. ✅
- Retrieval filters `organization_id` inside the SQL function, so it stays
  scoped under a service-role client. ✅
- A hard cap of 4 tool iterations per turn bounds runaway spend. ✅

**Gap (not closable here):** live behavioural evaluation. The 105-case suite in
`evals/` has never run — no `ANTHROPIC_API_KEY`. The deterministic layer above
is CI-gating; the behavioural layer is not yet evidence.

---

## 6. Dependency and secret audit

```
$ npm audit
found 0 vulnerabilities
```

Nine runtime dependencies, all first-order and justified: Next, React,
Tailwind's utilities (`clsx`, `tailwind-merge`, `class-variance-authority`),
Supabase (`supabase-js`, `ssr`) and `@anthropic-ai/sdk`. Voyage, Resend,
PostHog, Sentry and the WhatsApp Cloud API are reached over `fetch` rather than
by adding an SDK.

**Secrets:**

- `git ls-files | xargs grep` for Anthropic keys, JWT-shaped strings, private
  key blocks and inline service-role assignments returns nothing. ✅
- `.env*` is gitignored with `!.env.example` negated; `.env.example` holds
  names and comments only. ✅
- No file reading a non-`NEXT_PUBLIC_` variable is a `"use client"` component
  (checked mechanically). ✅
- WhatsApp credentials carry **no SELECT grant** for the dashboard role, so
  they cannot leak through a forgotten column list. ✅

**Finding S1 — Sentry reached by HTTP rather than SDK (accepted trade-off).**
`@sentry/nextjs` brings a build plugin, instrumentation files and a large
dependency tree for what is one POST. The cost is real and worth stating: no
automatic breadcrumbs, no release tracking, no source maps. The structured log
line is always written regardless, so monitoring does not depend on a third
party being configured or within quota. Revisit if beta shows the SDK's extras
matter.

---

## 7. Data protection (NDPR) — planning audit finding #16

This was the largest open gap: customer names, phone numbers and full
conversations were being stored with **no retention period and no way to delete
them**.

- `business_profiles.retention_days` (30–3650, default 365), set by the
  business at `/dashboard/privacy`.
- `purge_expired_data()` deletes conversations past each organization's own
  period, redacts stored webhook payloads after 30 days, and clears customers
  with nothing left attached. Driven by `/api/cron/retention`.
- `delete_customer_data(customer_id)` — the erasure right, for one customer.
- `purge_organization_customers(org_id)` — the delete-by-organization
  capability `docs/SECURITY.md` requires.
- `/dashboard/privacy` shows what is held, for how long, and offers deletion
  behind a typed confirmation.

**Finding P1 — the obvious implementation of erasure does not erase (found and
fixed during this audit).** `conversations.customer_id` and `leads.customer_id`
are `ON DELETE SET NULL`. Deleting the customer row therefore **detached** their
history instead of removing it: every message they wrote stayed in the database
looking anonymous while still being personal data. Both functions now delete
leads and conversations explicitly first; messages, lead events and widget
sessions follow by their own CASCADE. `hardening_isolation.sql` asserts the
customer, their conversation, their messages and their lead are all gone, and
that another tenant's are untouched.

**Still outstanding (not code):** a written privacy notice and a consent record
for customers whose messages are processed. That is a legal document, not a
migration, and it is needed before beta.

---

## Production checklist status

| Item | Status |
| --- | --- |
| auth tested | ✅ unit + isolation suites |
| RLS tested | ✅ eleven suites, real PostgreSQL |
| rate limits | ✅ auth routes + widget, atomic |
| per-org spend budget + cutoff | ✅ widget caps, now plan-bounded |
| webhook verification | ✅ both webhooks |
| idempotency | ✅ unique constraint, proved under concurrency |
| secure headers | ✅ nosniff, Referrer-Policy, Permissions-Policy, frame-ancestors, HSTS in production |
| error monitoring | ✅ structured logs always; Sentry when configured |
| secret audit | ✅ no committed secrets, no client-side server env |
| dependency audit | ✅ 0 vulnerabilities |
| no debug secrets/data | ✅ |
| **live agent evaluation** | ❌ needs `ANTHROPIC_API_KEY` |
| **privacy notice + consent record** | ❌ legal copy, needed before beta |
