-- Milestone 11 — Subscription billing
--
-- tasks/11 sets two security requirements, and both are answered structurally
-- rather than in application code:
--
--   "Never trust client-submitted subscription state."
--     The dashboard role has SELECT on `subscriptions` and nothing else. There
--     is no UPDATE grant, so no server action, no form, and no bug in one can
--     move an organization onto a better plan. Only the verified payment
--     webhook writes, through the service-role client.
--
--   "Plan access is server-enforced."
--     Limits are enforced by TRIGGERS on the tables they govern, so they hold
--     for every write path — the dashboard, an AI tool, the cron runner, or
--     anything added later — instead of being re-checked correctly at each
--     call site and eventually missed at one.

-- ---------------------------------------------------------------------------
-- What each plan allows. A table rather than a constant so the limits are
-- visible in the database that enforces them.
-- ---------------------------------------------------------------------------
create table public.plan_limits (
  plan text primary key,
  -- `none` is the entitlement of an organization whose subscription lapsed.
  price_ngn integer not null default 0,
  max_products integer,
  max_knowledge_documents integer,
  max_automations integer,
  max_widget_messages_per_day integer not null default 0,
  whatsapp_enabled boolean not null default false,
  sort_order smallint not null default 0
);

-- Launch hypotheses from docs/BILLING.md. Prices are in naira per month.
insert into public.plan_limits (
  plan, price_ngn, max_products, max_knowledge_documents, max_automations,
  max_widget_messages_per_day, whatsapp_enabled, sort_order
) values
  ('none',      0,    0,    0,   0,    0, false, 0),
  ('starter',   15000, 100,  20,  1,  500, false, 1),
  ('growth',    35000, 1000, 100, 5, 2000, true,  2),
  ('pro',       75000, 10000,500, 25,10000, true,  3);

-- ---------------------------------------------------------------------------
-- subscriptions — docs/DATABASE.md:186
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique
    references public.organizations (id) on delete cascade,

  provider text not null default 'stub',
  provider_customer_id text,
  provider_subscription_id text,

  plan text not null default 'starter' references public.plan_limits (plan),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),

  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '14 days'),
  cancel_at_period_end boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index subscriptions_provider_subscription_idx
  on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Every organization gets a subscription: a 14-day trial on the Starter plan,
-- so a new business can use the product before paying and is never in a state
-- with no entitlement at all.
create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.widget_settings (organization_id) values (new.id);
  insert into public.whatsapp_integrations (organization_id) values (new.id);
  insert into public.subscriptions (organization_id) values (new.id);
  return new;
end;
$$;

insert into public.subscriptions (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------------------
-- The entitlement rule, in one place.
--
-- `trialing`, `active` and `past_due` all entitle the organization to its
-- plan; `past_due` deliberately keeps working, because cutting a business off
-- the moment a card fails loses their customers, not just ours. `canceled` and
-- `incomplete` fall back to `none`, which allows no new data and no widget.
-- ---------------------------------------------------------------------------
create or replace function public.org_plan(p_organization_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    when s.status in ('trialing', 'active', 'past_due') then s.plan
    else 'none'
  end
  from public.subscriptions s
  where s.organization_id = p_organization_id;
$$;

/**
 * Refuse a write that would take an organization past its plan's limit.
 *
 * TG_ARGV[0] is the plan_limits column to read; TG_ARGV[1] is an optional SQL
 * predicate narrowing what counts (archived products should not fill the
 * catalogue quota). Both are written here, never supplied by a caller.
 */
create or replace function public.enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limit int;
  v_count int;
  v_filter text := coalesce(nullif(TG_ARGV[1], ''), 'true');
begin
  v_plan := public.org_plan(new.organization_id);
  if v_plan is null then
    return new; -- no subscription row yet (only possible mid-migration)
  end if;

  execute format('select %I from public.plan_limits where plan = $1', TG_ARGV[0])
    into v_limit
    using v_plan;

  if v_limit is null then
    return new; -- unlimited on this plan
  end if;

  execute format(
    'select count(*) from public.%I where organization_id = $1 and %s',
    TG_TABLE_NAME, v_filter
  )
    into v_count
    using new.organization_id;

  if v_count >= v_limit then
    raise exception
      'Your % plan allows % %. Upgrade to add more.',
      v_plan, v_limit, replace(TG_ARGV[0], 'max_', '')
      using errcode = 'PLIM1';
  end if;

  return new;
end;
$$;

create trigger products_enforce_plan_limit
  before insert on public.products
  for each row execute function public.enforce_plan_limit(
    'max_products', 'status <> ''archived'''
  );

create trigger knowledge_documents_enforce_plan_limit
  before insert on public.knowledge_documents
  for each row execute function public.enforce_plan_limit('max_knowledge_documents');

create trigger automations_enforce_plan_limit
  before insert on public.automations
  for each row execute function public.enforce_plan_limit('max_automations');

-- WhatsApp is a paid-tier channel. Enforced on the row, so turning it on from
-- any path — dashboard, script, future API — is refused on a plan without it.
create or replace function public.enforce_whatsapp_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare allowed boolean;
begin
  if new.enabled is not true then
    return new; -- switching off is always allowed
  end if;

  select l.whatsapp_enabled into allowed
  from public.plan_limits l
  where l.plan = public.org_plan(new.organization_id);

  if allowed is not true then
    raise exception 'WhatsApp is available on the Growth and Pro plans.'
      using errcode = 'PLIM1';
  end if;

  return new;
end;
$$;

create trigger whatsapp_integrations_enforce_plan
  before insert or update on public.whatsapp_integrations
  for each row execute function public.enforce_whatsapp_plan();

-- ---------------------------------------------------------------------------
-- The widget's daily cap is now bounded by the plan as well as by the
-- business's own setting.
--
-- Before this, a business could raise max_messages_per_day to 100,000 on any
-- plan — the setting was theirs to choose and nothing tied it to what they
-- pay. `least()` of the two means the plan is the ceiling and their own
-- setting can only lower it.
-- ---------------------------------------------------------------------------
create or replace function public.widget_send(p_token text, p_content text)
returns table (out_status text, out_organization_id uuid, out_conversation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_settings record;
  v_plan_cap int;
  v_cap int;
  v_today int;
  v_content text;
begin
  v_content := left(btrim(p_content), 2000);
  if v_content = '' then
    return query select 'empty'::text, null::uuid, null::uuid;
    return;
  end if;

  -- The row lock is the gate: every concurrent message on this session
  -- serializes here, so the count below is never read stale.
  select s.id, s.organization_id, s.conversation_id, s.message_count
    into v_session
  from public.widget_sessions s
  where s.token = p_token
  for update;

  if not found then
    return query select 'unknown_session'::text, null::uuid, null::uuid;
    return;
  end if;

  select w.enabled, w.max_messages_per_session, w.max_messages_per_day
    into v_settings
  from public.widget_settings w
  where w.organization_id = v_session.organization_id;

  if not found or not v_settings.enabled then
    return query select 'disabled'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_session.message_count >= v_settings.max_messages_per_session then
    return query select 'session_limit'::text, null::uuid, null::uuid;
    return;
  end if;

  select l.max_widget_messages_per_day into v_plan_cap
  from public.plan_limits l
  where l.plan = public.org_plan(v_session.organization_id);

  -- A lapsed subscription caps the widget at zero, which reads as org_limit.
  v_cap := least(v_settings.max_messages_per_day, coalesce(v_plan_cap, 0));

  insert into public.org_usage_daily as u (organization_id, usage_date, widget_messages)
  values (v_session.organization_id, current_date, 1)
  on conflict (organization_id, usage_date) do update
    set widget_messages = u.widget_messages + 1
  returning u.widget_messages into v_today;

  if v_today > v_cap then
    update public.org_usage_daily u
      set widget_messages = u.widget_messages - 1
    where u.organization_id = v_session.organization_id
      and u.usage_date = current_date;
    return query select 'org_limit'::text, null::uuid, null::uuid;
    return;
  end if;

  insert into public.messages
    (organization_id, conversation_id, sender_type, content)
  values
    (v_session.organization_id, v_session.conversation_id, 'customer', v_content);

  update public.widget_sessions s
    set message_count = s.message_count + 1, last_seen_at = now()
  where s.id = v_session.id;

  update public.conversations c
    set last_message_at = now()
  where c.id = v_session.conversation_id;

  insert into public.usage_events (organization_id, event_type, quantity, metadata)
  values (v_session.organization_id, 'widget_message', 1,
          jsonb_build_object('conversation_id', v_session.conversation_id));

  return query select 'ok'::text, v_session.organization_id, v_session.conversation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Note what is NOT granted: the dashboard role gets SELECT on subscriptions
-- and no INSERT, UPDATE or DELETE at all. Subscription state is written only
-- by the verified payment webhook (service-role). That is the whole answer to
-- "never trust client-submitted subscription state".
-- ---------------------------------------------------------------------------
alter table public.subscriptions enable row level security;
alter table public.plan_limits enable row level security;

create policy subscriptions_select_member on public.subscriptions
  for select using (public.is_org_member(organization_id));

-- The price list is the same for everyone and is not tenant data.
create policy plan_limits_select_all on public.plan_limits
  for select to authenticated using (true);

grant select on public.subscriptions to authenticated;
grant select on public.plan_limits to authenticated;

revoke execute on function public.org_plan(uuid) from public;
grant execute on function public.org_plan(uuid) to authenticated, service_role;
