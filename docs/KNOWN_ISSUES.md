# Known issues and limitations

As of Milestone 13, before beta. Written so a support conversation starts from
"yes, we know" rather than from a surprise.

## Blocking beta — must be resolved before inviting anyone

### 1. The agent has never been evaluated against a live model
`evals/` holds 105 cases across the 15 categories in `docs/AI_AGENT.md`. None
have run: this environment has no `ANTHROPIC_API_KEY`. Everything
deterministic is proved — grounding, tool authorization, the injection suite,
the iteration cap — but **no evidence exists about how the model actually
behaves** on real customer questions. Milestone 05's acceptance criterion is
not met.
**Resolution:** API keys + a Supabase project, then `npm run eval` (≈$2.05).

### 2. No payment provider
ADR-010 (Paystack vs Flutterwave) is undecided, so no business can be charged.
`PAYMENT_PROVIDER=stub` takes no money. Plans, limits and entitlement are all
enforced and tested — a beta business is simply on an unbilled plan.
**Resolution:** the founder decides; then one adapter file.

### 3. No privacy notice or consent record
The machinery exists (retention periods, erasure, the privacy page). The
document a customer is shown, and the record that they agreed to it, do not.
This is legal copy, not code.
**Resolution:** write it before any real customer PII is stored.

### 4. WhatsApp has never completed a round trip
Signature verification, replay protection and the state machine are proved
against constructed payloads and in SQL. No message has ever gone to or come
from Meta — `developers.facebook.com` is blocked from the build environment
and there are no test credentials.
**Resolution:** a Meta test app and number; then step D of `docs/QA.md`.

## Known limitations — documented, not blocking

### 5. Follow-ups only reach customers by email, or within WhatsApp's 24-hour window
A follow-up posted into a widget conversation is **never seen**: widget
sessions are not resumable, so a returning visitor gets a new conversation
(ADR-058). WhatsApp can reach someone unprompted only within 24 hours of their
last message, because message templates are not implemented (ADR-065).
Email is the only channel that reliably reaches a customer who has left.

### 6. The knowledge base is lexical unless Voyage is configured
`EMBEDDING_PROVIDER=stub` retrieves by word overlap, not meaning. It will
appear to work and quietly return the wrong documents. Production **must** set
`EMBEDDING_PROVIDER=voyage`.

### 7. Search is `ILIKE`, not full-text
Products and conversations are searched with escaped `ILIKE`. Fine at a few
hundred products; it will not rank, stem or tolerate typos. Revisit when a
business complains, not before (ADR-027).

### 8. No media handling on WhatsApp
Images, audio and documents get "I can only read text messages". Deliberate:
guessing at an image's contents is the invent-a-fact failure this product
exists to avoid (ADR-068).

### 9. Lead scores are entered by hand
There is no conversion history to calibrate against, so any generated score
would be arbitrary while looking authoritative (ADR-042).

### 10. Sentry has no source maps or breadcrumbs
Errors are reported over HTTP rather than through `@sentry/nextjs`, to avoid a
build plugin and a large dependency tree for one POST (ADR-081). Stack traces
arrive unmapped. The structured JSON log line is always written regardless.

### 11. Rate limiting fails open
If the database is unreachable, rate limits allow requests rather than denying
them (ADR-079). Deliberate — a limiter that denies everything turns a partial
outage into a total one — but it does mean a database outage is also a window
with no rate limiting.

### 12. The per-IP limit trusts a proxy header
`x-forwarded-for` is attacker-controlled, so the per-IP limit is a speed bump.
The per-email limit is the real defence, and nothing is authorized on the IP.

### 13. No CAPTCHA on the widget
`docs/SECURITY.md` lists Turnstile as a cost control. Not implemented: the
per-session, per-org-daily and per-visitor limits bound spend already, and a
CAPTCHA costs conversions. Revisit if abuse actually appears.

### 14. Single organization per user
A user belongs to the first organization they were added to. No switcher, no
multi-business accounts. Fine for the ICP; a real gap for an agency.

### 15. No CI pipeline
`docs/SECURITY.md` calls for typecheck, lint, tests and the isolation suites to
be required checks. They all pass and are run by hand every milestone, but
nothing enforces them on a push. The SQL suites need a PostgreSQL service
container.
