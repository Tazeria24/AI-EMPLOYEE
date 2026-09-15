-- Milestone 10 — WhatsApp Business Platform
--
-- Two things make this different from every surface so far.
--
-- 1. It is a webhook. The caller is Meta, not a browser, and it authenticates
--    with an HMAC signature rather than a Supabase role. Planning audit
--    finding #13: "a replayed or forged webhook creates duplicate messages."
--    Forgery is answered by the signature; replay is answered here, by a
--    unique constraint on the external event id. Meta retries deliveries, so
--    duplicates are normal traffic, not an attack — they must be cheap and
--    they must not produce a second AI reply.
--
-- 2. It stores third-party credentials. An access token for a business's
--    WhatsApp number can send messages as that business, so the dashboard is
--    allowed to WRITE these columns and never to READ them back. That is
--    enforced with column-level grants, not by remembering to omit them from
--    a select list.

-- ---------------------------------------------------------------------------
-- Per-organization WhatsApp connection
--
-- docs/DATABASE.md specs a generic `integrations` table with a
-- `credentials_reference` blob. This is the typed version for the one provider
-- that exists: named columns can carry their own grants and constraints, which
-- an opaque jsonb blob cannot. See the ADR.
-- ---------------------------------------------------------------------------
create table public.whatsapp_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique
    references public.organizations (id) on delete cascade,

  -- Non-secret identifiers. Safe for the dashboard to read back.
  phone_number_id text,
  waba_id text,
  display_phone_number text,

  -- Secrets. Write-only from the dashboard's point of view (see grants below).
  verify_token text,
  app_secret text,
  access_token text,

  -- Ships OFF. Connecting production WhatsApp is a founder decision
  -- (CLAUDE.md); nothing can be sent until someone turns this on deliberately.
  enabled boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The webhook resolves the tenant from this, so it must be a fast unique
-- lookup and two organizations can never claim the same number.
create unique index whatsapp_integrations_phone_number_id_idx
  on public.whatsapp_integrations (phone_number_id)
  where phone_number_id is not null;

create trigger whatsapp_integrations_set_updated_at
  before update on public.whatsapp_integrations
  for each row execute function public.set_updated_at();

-- Give every organization a row, so the dashboard always has something to edit.
create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.widget_settings (organization_id) values (new.id);
  insert into public.whatsapp_integrations (organization_id) values (new.id);
  return new;
end;
$$;

insert into public.whatsapp_integrations (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------------------
-- integration_events — docs/DATABASE.md:217
--
-- The replay defence. `unique (provider, external_event_id)` means a redelivered
-- Meta callback cannot be recorded twice, and claim_integration_event() turns
-- that constraint into an atomic "is this new?" test.
-- ---------------------------------------------------------------------------
create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null,
  external_event_id text not null,
  event_type text,
  payload jsonb,
  status text not null default 'received'
    check (status in ('received', 'processed', 'skipped', 'failed')),
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),

  unique (provider, external_event_id)
);

create index integration_events_org_created_idx
  on public.integration_events (organization_id, created_at desc);
create index integration_events_status_idx
  on public.integration_events (organization_id, status);

-- ---------------------------------------------------------------------------
-- Customer identity on an external channel
--
-- The webhook looks a customer up by their WhatsApp number. Without this
-- constraint two concurrent deliveries from the same person would each create
-- a customer, and the conversation would fork.
-- ---------------------------------------------------------------------------
create unique index customers_external_identity_idx
  on public.customers (organization_id, external_channel, external_customer_id)
  where external_customer_id is not null;

-- ---------------------------------------------------------------------------
-- Atomic event claim.
--
-- Insert-or-nothing: the unique constraint decides. The first delivery gets an
-- id back and does the work; every redelivery gets NULL and does nothing. Two
-- deliveries racing each other resolve the same way, because the constraint is
-- checked by the database rather than by the caller (same pattern as
-- claim_automation_run, ADR-046).
-- ---------------------------------------------------------------------------
create or replace function public.claim_integration_event(
  p_organization_id uuid,
  p_provider text,
  p_external_event_id text,
  p_event_type text default null,
  p_payload jsonb default null
)
returns uuid
language sql
security invoker
set search_path = public
as $$
  insert into public.integration_events
    (organization_id, provider, external_event_id, event_type, payload)
  values
    (p_organization_id, p_provider, p_external_event_id, p_event_type, p_payload)
  on conflict (provider, external_event_id) do nothing
  returning id;
$$;

-- ---------------------------------------------------------------------------
-- RLS — ADR-024 (members read, owner/admin write). No anon anywhere: the
-- webhook authenticates with a signature, not a Supabase role.
-- ---------------------------------------------------------------------------
alter table public.whatsapp_integrations enable row level security;
alter table public.integration_events enable row level security;

create policy whatsapp_integrations_select_member on public.whatsapp_integrations
  for select using (public.is_org_member(organization_id));
create policy whatsapp_integrations_update_admin on public.whatsapp_integrations
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy integration_events_select_member on public.integration_events
  for select using (public.is_org_member(organization_id));

-- Column-level grants: the dashboard may READ only the non-secret columns.
-- `verify_token`, `app_secret` and `access_token` are deliberately absent, so
-- selecting them is a privilege error rather than a leak waiting for someone
-- to forget a column list.
grant select (
  id, organization_id, phone_number_id, waba_id, display_phone_number,
  enabled, created_at, updated_at
) on public.whatsapp_integrations to authenticated;

-- ...but it may WRITE them, so credentials can be set and rotated.
grant update (
  phone_number_id, waba_id, display_phone_number,
  verify_token, app_secret, access_token, enabled
) on public.whatsapp_integrations to authenticated;

grant select on public.integration_events to authenticated;

-- The dashboard still needs to show whether a credential is set. A boolean is
-- all it gets. The view runs as its owner (so it can read the secret columns)
-- and re-applies the membership check itself, so it is not a way around RLS.
create view public.whatsapp_integration_status
with (security_invoker = false) as
  select
    w.organization_id,
    w.phone_number_id,
    w.waba_id,
    w.display_phone_number,
    w.enabled,
    w.verify_token is not null and w.verify_token <> '' as has_verify_token,
    w.app_secret   is not null and w.app_secret   <> '' as has_app_secret,
    w.access_token is not null and w.access_token <> '' as has_access_token,
    w.updated_at
  from public.whatsapp_integrations w
  where public.is_org_member(w.organization_id);

grant select on public.whatsapp_integration_status to authenticated;

-- The webhook runs with the service-role client (no user session exists).
revoke execute on function
  public.claim_integration_event(uuid, text, text, text, jsonb) from public;
grant execute on function
  public.claim_integration_event(uuid, text, text, text, jsonb) to service_role;
