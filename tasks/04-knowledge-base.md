# Task 04 — Knowledge Base

## Objective
Create the verified business knowledge system and retrieval layer.

## Dependencies
Task 02 and Task 03.

## Requirements
- FAQs
- policies
- document records
- chunking
- embeddings
- pgvector retrieval
- organization-scoped retrieval
- processing status/error handling

## Security
Retrieved content must never cross tenants.

## Acceptance criteria
Business can add knowledge; chunks are created; semantic retrieval returns relevant tenant-owned content; failures are visible and recoverable.
