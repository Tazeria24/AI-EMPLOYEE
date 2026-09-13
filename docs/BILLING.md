# Billing Specification

## Plans
Starter: ₦15,000/month
Growth: ₦35,000/month
Pro: ₦75,000/month

These are launch hypotheses and can change after customer validation.

## Billing model
Subscription belongs to organization.
Payment provider customer/subscription IDs are stored.
Webhook events are idempotent.
Subscription status controls feature access.

## Usage
Track:
- AI conversations/messages as appropriate
- active contacts/leads if relevant
- automation executions
- channel usage

Do not implement complicated metering until actual pricing requires it.

## States
trialing
active
past_due
canceled
incomplete

## Security
Payment secrets remain server-side.
Never trust client-submitted plan/status.
Webhook status is authoritative after verification.

## MVP
Implement only the minimum needed to charge subscriptions and enforce basic limits.
