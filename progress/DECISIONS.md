# Architecture Decisions

## ADR-001 — Start with Nigerian online retailers
Reason: repetitive catalog/customer questions, strong WhatsApp/Instagram usage, clear sales workflow.

## ADR-002 — Website widget before WhatsApp
Reason: allows the core AI/conversation engine to stabilize before external-channel complexity.

## ADR-003 — Multi-tenant from the beginning
Reason: tenant isolation is difficult and risky to retrofit.

## ADR-004 — Tool-based AI
Reason: business actions/data access must be constrained and auditable.

## ADR-005 — Vercel Cron initially
Reason: simplest low-cost scheduler for MVP. Replace only when scale requires a dedicated queue/job system.

## ADR-006 — Provider abstraction
Reason: avoid locking product architecture to one AI model/provider.

Add future decisions here. Do not rewrite history; append revisions.
