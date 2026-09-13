# Task 01 — Authentication

## Objective
Implement Supabase authentication.

## Dependencies
Task 00.

## Requirements
- signup
- login
- logout
- password reset
- email verification
- protected dashboard route
- SSR session handling with @supabase/ssr

## Security
Server-side session verification. No secrets in client.

## Non-goals
No organizations or billing.

## Acceptance criteria
Unauthorized users cannot access protected pages; sessions persist across refresh; auth errors are handled safely; tests/typecheck/lint pass.
