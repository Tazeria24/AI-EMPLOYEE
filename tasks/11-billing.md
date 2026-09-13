# Task 11 — Billing

## Objective
Add subscription billing.

## Dependencies
Task 09.

## Requirements
- pricing UI
- checkout
- subscriptions
- payment provider abstraction
- verified webhooks
- basic usage events
- feature limits

## Security
Never trust client-submitted subscription state.

## Acceptance criteria
Test payment can create/update/cancel a subscription; webhook handling is idempotent; plan access is server-enforced.
