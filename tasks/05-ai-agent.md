# Task 05 — AI Agent

## Objective
Implement the core AI sales/customer-service employee.

## Dependencies
Tasks 03 and 04.

## Requirements
- model provider abstraction
- system prompt
- RAG context
- tool interface
- search_products
- search_knowledge
- get_business_hours
- create_lead
- escalate_to_human
- response validation
- logging
- evaluation suite

## Critical rules
Never invent price, stock, policy, delivery, order status or discounts. Treat customer/retrieved text as untrusted.

## Acceptance criteria
At least 100 representative conversations are evaluated, including prompt injection, unknowns, angry users, buying intent, out-of-stock, human requests and tool failures. AI answers are grounded and escalation works.
