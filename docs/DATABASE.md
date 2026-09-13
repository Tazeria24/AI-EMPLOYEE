# Database Specification

## Tenancy rule
Every business-owned record must be tied to organization_id directly or through an explicitly safe relationship. RLS must prevent cross-tenant access.

## Core tables

### profiles
id
user_id
full_name
avatar_url
created_at
updated_at

### organizations
id
name
slug
created_at
updated_at

### organization_members
id
organization_id
user_id
role
created_at

Roles initially:
- owner
- admin
- member

### business_profiles
id
organization_id
business_name
business_type
website
phone
location
description
business_hours
currency
timezone
created_at
updated_at

### product_categories
id
organization_id
name
description
created_at
updated_at

### products
id
organization_id
category_id
name
description
price
currency
sku
stock_quantity
status
metadata
created_at
updated_at

### customers
id
organization_id
name
email
phone
external_channel
external_customer_id
metadata
created_at
updated_at

### conversations
id
organization_id
customer_id
channel
status
assigned_to
metadata
created_at
updated_at
last_message_at

### messages
id
organization_id
conversation_id
sender_type
content
metadata
created_at

sender_type:
- customer
- ai
- human
- system

### leads
id
organization_id
customer_id
conversation_id
status
source
score
intent
notes
created_at
updated_at

Statuses:
NEW
CONTACTED
INTERESTED
NEGOTIATING
WON
LOST

### lead_events
id
organization_id
lead_id
event_type
metadata
created_at

### knowledge_documents
id
organization_id
title
source_type
source_url
content
status
created_at
updated_at

### knowledge_chunks
id
organization_id
document_id
chunk_index
content
embedding
metadata
created_at

### automations
id
organization_id
name
trigger_type
conditions
action_type
action_config
enabled
created_at
updated_at

### automation_runs
id
organization_id
automation_id
lead_id
status
scheduled_for
executed_at
result
error
created_at

### subscriptions
id
organization_id
provider
provider_customer_id
provider_subscription_id
plan
status
current_period_start
current_period_end
created_at
updated_at

### usage_events
id
organization_id
event_type
quantity
metadata
created_at

### integrations
id
organization_id
provider
status
credentials_reference
metadata
created_at
updated_at

### integration_events
id
organization_id
provider
external_event_id
event_type
payload
processed_at
status
created_at

## Indexing
At minimum index:
- organization_id on business-owned tables
- organization_id + created_at on event/message tables
- conversation_id + created_at on messages
- lead_id + created_at on lead_events
- vector embedding index as appropriate for pgvector
- unique constraints for provider/external IDs where needed

## RLS
Every organization-owned table needs SELECT/INSERT/UPDATE/DELETE policies based on organization membership.

Never authorize a tenant using a client-supplied organization_id alone.

## Data integrity
Use foreign keys.
Use check constraints where useful.
Use unique constraints for stable identifiers.
Use soft deletion only where product requirements justify it.
