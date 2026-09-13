# Task 02 — Multi-tenancy

## Objective
Implement organizations, memberships, business profiles and tenant isolation.

## Dependencies
Task 01.

## Requirements
- organizations
- organization_members
- business_profiles
- owner/admin/member roles
- onboarding
- RLS policies
- tenant-isolation tests

## Non-goals
No product/catalog features.

## Acceptance criteria
A user can create/access their organization; authorized members can access it; Organization A cannot read/write Organization B data, including through direct API/database attempts.
