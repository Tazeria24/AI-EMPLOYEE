# Task 12 — Monitoring + Security Hardening

## Objective
Prepare the MVP for real beta users.

## Dependencies
Tasks 05–11.

## Requirements
- Sentry
- PostHog
- structured logging
- rate limiting
- auth audit
- RLS audit
- API validation audit
- webhook security audit
- prompt injection suite
- dependency/security audit
- production secret audit

## Acceptance criteria
No known critical tenant-isolation issue; core endpoints validate inputs; webhook verification/idempotency is tested; monitoring captures actionable errors.
