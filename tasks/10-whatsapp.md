# Task 10 — WhatsApp

## Objective
Integrate the official WhatsApp Business Platform.

## Dependencies
Task 09.

## Requirements
- integration configuration
- public HTTPS webhook
- webhook verification
- inbound messages
- outbound AI responses
- media handling only if necessary
- human takeover
- integration_events
- external-event idempotency/replay protection

## Critical constraint
Do not scrape WhatsApp Web.

## Decision boundary
Ask before connecting production credentials or sending real customer messages.

## Acceptance criteria
Test environment supports verified inbound -> AI -> outbound flow and duplicate/replayed events do not create duplicate responses.
