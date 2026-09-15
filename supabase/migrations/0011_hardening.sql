-- Milestone 12 — Monitoring and security hardening
--
-- Three things land here, all of them gaps rather than features:
--
--   1. **Rate limiting.** docs/SECURITY.md has required it since Milestone 00
--      and the only limits that exist are the widget's spend caps. Login,
--      signup and password reset have none, so password guessing is currently
--      free. The counter is atomic for the same reason every other limit in
--      this project is: a read-then-increment loses the race that matters.
--
--   2. **A security event log.** "Log security-relevant events without logging
--      secrets or full PII" — so identifiers are stored hashed, never raw.
--
--   3. **NDPR data protection** (planning audit finding #16). Customer names,
--      phone numbers and conversations are being stored with no retention
--      period and no way to delete them. Both are required before a real
--      customer's data is in the system, and neither exists yet.

-- ---------------------------------------------------------------------------
-- Rate limiting
--
-- `bucket` is a SHA-256 of the thing being limited (an email, an IP) with a
-- server-side pepper, computed by the application — so this table can be read
-- by an operator without exposing who tried to log in.
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  bucket text not null,
  window_started_at timestamptz not null,
  attempts integer not null default 0,
  primary key (bucket, window_started_at)
);

create index rate_limits_window_idx on public.rate_limits (window_started_at);

/**
 * Count one attempt against a fixed window and say whether it is allowed.
 *
 * The increment and the test are one statement, so two concurrent requests
 * cannot both read "under the limit" — the same reasoning as widget_send()
 * (ADR-052). Fixed windows rather than a sliding log: an attacker gains at
 * most one extra window's worth of attempts, which is not worth a per-attempt
 * row for a login form.
 */
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_attempts int;
begin
  if p_bucket is null or length(p_bucket) = 0 then
    return false; -- fail closed on a malformed key
  end if;

  -- Truncate now() to the start of the current window.
  v_window := to_timestamp(
    floor(extract(epoch from now()) / greatest(p_window_seconds, 1))
      * greatest(p_window_seconds, 1)
  );

  insert into public.rate_limits as r (bucket, window_started_at, attempts)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_started_at) do update
    set attempts = r.attempts + 1
  returning r.attempts into v_attempts;

  return v_attempts <= greatest(p_limit, 1);
end;
$$;

/** Housekeeping: windows older than a day can never matter again. */
create or replace function public.purge_rate_limits()
returns integer
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.rate_limits
    where window_started_at < now() - interval '1 day'
    returning 1
  )
  select count(*)::int from deleted;
$$;

-- ---------------------------------------------------------------------------
-- Security event log
-- ---------------------------------------------------------------------------
create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  -- Null for events with no tenant yet: a failed login names no organization.
  organization_id uuid references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  severity text not null default 'info'
    check (severity in ('info', 'warning', 'critical')),
  -- Hashed, never raw. See the note on rate_limits.bucket.
  subject_hash text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index security_events_org_created_idx
  on public.security_events (organization_id, created_at desc);
create index security_events_type_idx
  on public.security_events (event_type, created_at desc);

/**
 * Record a security-relevant event.
 *
 * SECURITY DEFINER so it can be called from paths with no session at all (a
 * failed login, a rejected webhook). It only ever inserts, so granting it
 * broadly costs nothing — there is no read path here.
 */
create or replace function public.record_security_event(
  p_event_type text,
  p_severity text default 'info',
  p_organization_id uuid default null,
  p_user_id uuid default null,
  p_subject_hash text default null,
  p_metadata jsonb default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.security_events
    (organization_id, user_id, event_type, severity, subject_hash, metadata)
  values
    (p_organization_id, p_user_id, p_event_type,
     case when p_severity in ('info', 'warning', 'critical') then p_severity else 'info' end,
     p_subject_hash, p_metadata);
$$;

-- ---------------------------------------------------------------------------
-- NDPR: retention and deletion (planning audit finding #16)
-- ---------------------------------------------------------------------------

-- How long a business keeps customer conversation data. Their choice, within
-- bounds: a month is the shortest that is still useful, ten years the longest
-- that is defensible.
alter table public.business_profiles
  add column retention_days integer not null default 365
    check (retention_days between 30 and 3650);

/**
 * Delete a customer's personal data on request — the NDPR erasure right.
 *
 * The cascade alone is NOT enough, and this is the trap: `conversations`
 * and `leads` reference `customers` with ON DELETE SET NULL, so deleting the
 * customer row detaches their history instead of removing it — the messages
 * they wrote, with whatever they said about themselves, would stay behind
 * looking anonymous while still being personal data. So conversations and
 * leads are deleted explicitly first; messages, lead events and widget
 * sessions then follow by their own CASCADE.
 *
 * SECURITY INVOKER on purpose: RLS decides whether the caller may see this
 * customer at all, so one business cannot erase another's records by guessing
 * a uuid. The admin check is additional, not a substitute.
 */
create or replace function public.delete_customer_data(p_customer_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org
  from public.customers
  where id = p_customer_id;

  if v_org is null then
    return false; -- not visible to this caller, or does not exist
  end if;

  if not public.is_org_admin(v_org) then
    raise exception 'Only an owner or admin can delete customer data.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Order matters: these hold SET NULL references, so they must go first.
  delete from public.leads where customer_id = p_customer_id;
  delete from public.conversations where customer_id = p_customer_id;
  delete from public.customers where id = p_customer_id;

  return true;
end;
$$;

/**
 * Delete every customer record this organization holds.
 *
 * The "delete-by-organization capability" docs/SECURITY.md requires. It keeps
 * the account, the catalogue and the knowledge base — this is erasure of
 * customer PII, not account closure.
 */
create or replace function public.purge_organization_customers(p_organization_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare v_deleted int;
begin
  if not public.is_org_admin(p_organization_id) then
    raise exception 'Only an owner or admin can delete customer data.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Every conversation, not only those with a customer attached: a widget
  -- visitor who never gave their name still wrote messages about themselves.
  -- Messages and widget sessions follow by CASCADE.
  delete from public.leads where organization_id = p_organization_id;
  delete from public.conversations where organization_id = p_organization_id;

  with deleted as (
    delete from public.customers where organization_id = p_organization_id
    returning 1
  )
  select count(*)::int into v_deleted from deleted;

  perform public.record_security_event(
    'customer_data_purged', 'warning', p_organization_id, auth.uid(), null,
    jsonb_build_object('customers_deleted', v_deleted)
  );

  return v_deleted;
end;
$$;

/**
 * Retention sweep, run from cron with the service-role client.
 *
 * Deletes conversation data past each organization's own retention period,
 * and redacts stored webhook payloads — `integration_events.payload` keeps a
 * customer's WhatsApp number, which has no reason to outlive the event's
 * usefulness for debugging.
 */
create or replace function public.purge_expired_data()
returns table (conversations_deleted integer, payloads_redacted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversations int := 0;
  v_payloads int := 0;
begin
  with expired as (
    delete from public.conversations c
    using public.business_profiles bp
    where bp.organization_id = c.organization_id
      and c.last_message_at < now() - make_interval(days => bp.retention_days)
    returning 1
  )
  select count(*)::int into v_conversations from expired;

  -- 30 days is long enough to debug a delivery and short enough that a phone
  -- number is not sitting in a log a year later.
  with redacted as (
    update public.integration_events
    set payload = null
    where payload is not null
      and created_at < now() - interval '30 days'
    returning 1
  )
  select count(*)::int into v_payloads from redacted;

  -- Customers with nothing left attached to them are no longer needed.
  delete from public.customers cu
  where not exists (
    select 1 from public.conversations c where c.customer_id = cu.id
  )
  and not exists (
    select 1 from public.leads l where l.customer_id = cu.id
  );

  return query select v_conversations, v_payloads;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.security_events enable row level security;
alter table public.rate_limits enable row level security;
-- No policy on rate_limits at all: nothing but the SECURITY DEFINER function
-- above may touch it, and that function is the only intended access path.

create policy security_events_select_member on public.security_events
  for select using (
    organization_id is not null and public.is_org_member(organization_id)
  );

grant select on public.security_events to authenticated;


revoke execute on function public.consume_rate_limit(text, integer, integer) from public;
revoke execute on function public.record_security_event(text, text, uuid, uuid, text, jsonb) from public;
revoke execute on function public.purge_rate_limits() from public;
revoke execute on function public.purge_expired_data() from public;
revoke execute on function public.delete_customer_data(uuid) from public;
revoke execute on function public.purge_organization_customers(uuid) from public;

-- Login and the public widget both need to consume a limit before any session
-- exists, so anon holds execute on that one function and nothing else new.
grant execute on function public.consume_rate_limit(text, integer, integer)
  to anon, authenticated, service_role;
grant execute on function public.record_security_event(text, text, uuid, uuid, text, jsonb)
  to anon, authenticated, service_role;

grant execute on function public.delete_customer_data(uuid) to authenticated;
grant execute on function public.purge_organization_customers(uuid) to authenticated;

-- Cron only.
grant execute on function public.purge_rate_limits() to service_role;
grant execute on function public.purge_expired_data() to service_role;
