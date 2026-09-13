# Task 08 — Automations

## Objective
Implement controlled lead follow-up.

## Dependencies
Task 07.

## Requirements
- automations
- automation_runs
- scheduler
- inactive-lead trigger
- AI-generated follow-up
- notification/delivery abstraction
- max two automated follow-ups per lead
- idempotency

## Acceptance criteria
A qualifying inactive lead can enter a scheduled follow-up, execution is recorded, duplicate runs are prevented, and the two-follow-up limit is enforced.
