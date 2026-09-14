-- Milestone 09 — Website widget
--
-- This is the first surface reachable by the public internet, and every
-- message on it costs money (an LLM call plus an embedding call). Planning
-- audit finding #10: "an attacker scripts the public widget endpoint; each
-- request triggers an LLM call; the API bill explodes overnight."
--
-- Two decisions follow from that:
--
-- 1. The public API surface is a SMALL SET OF SECURITY DEFINER FUNCTIONS, and
--    those are the only things the `anon` role may execute. anon gets no table
--    privileges at all, so a bug in a route handler cannot turn into table
--    access — the functions are the whole attack surface, and each returns
--    only the specific fields a visitor is allowed to see.
--
-- 2. The spend caps are enforced inside those functions, under a row lock, in
--    the same statement that records the usage. An application-level "have we
--    hit the limit?" check loses the race against concurrent requests, which
--    is exactly the shape of the attack.

create table public.widget_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique
    references public.organizations (id) on delete cascade,
  -- Public, non-secret identifier that appears in the embed snippet.
  widget_key text not null unique default encode(gen_random_bytes(16), 'hex'),
  enabled boolean not null default false,
  greeting text not null default 'Hi! Ask me anything about our products.',
  theme_color text not null default '#0F5C63',
  -- Empty means "any origin"; populated means the widget only answers there.
  allowed_origins text[] not null default '{}',
  max_messages_per_session integer not null default 20
    check (max_messages_per_session between 1 and 200),
  max_messages_per_day integer not null default 500
    check (max_messages_per_day between 1 and 100000),
  max_sessions_per_day integer not null default 200
    check (max_sessions_per_day between 1 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index widget_settings_key_idx on public.widget_settings (widget_key);

create table public.widget_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- Bearer token held by the visitor's browser. 256 bits of randomness.
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  message_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index widget_sessions_token_idx on public.widget_sessions (token);
create index widget_sessions_org_created_idx
  on public.widget_sessions (organization_id, created_at desc);

-- Append-only record of billable activity (docs/DATABASE.md).
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_type text not null,
  quantity integer not null default 1,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index usage_events_org_created_idx
  on public.usage_events (organization_id, created_at desc);

-- Counter used for the hard daily cap. Separate from usage_events so the cap
-- is a single indexed row to lock rather than an aggregate over a growing log.
create table public.org_usage_daily (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  usage_date date not null default current_date,
  widget_messages integer not null default 0,
  widget_sessions integer not null default 0,
  primary key (organization_id, usage_date)
);

create trigger widget_settings_set_updated_at before update on public.widget_settings
  for each row execute function public.set_updated_at();

-- Give every organization widget settings automatically.
create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.widget_settings (organization_id) values (new.id);
  return new;
end;
$$;

create trigger on_organization_created
  after insert on public.organizations
  for each row execute function public.handle_new_organization();

insert into public.widget_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------------------
-- Dashboard-side RLS (members read, owner/admin write) — ADR-024
-- ---------------------------------------------------------------------------
alter table public.widget_settings enable row level security;
alter table public.widget_sessions enable row level security;
alter table public.usage_events enable row level security;
alter table public.org_usage_daily enable row level security;

create policy widget_settings_select_member on public.widget_settings
  for select using (public.is_org_member(organization_id));
create policy widget_settings_update_admin on public.widget_settings
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy widget_sessions_select_member on public.widget_sessions
  for select using (public.is_org_member(organization_id));
create policy usage_events_select_member on public.usage_events
  for select using (public.is_org_member(organization_id));
create policy org_usage_daily_select_member on public.org_usage_daily
  for select using (public.is_org_member(organization_id));

grant select, update on public.widget_settings to authenticated;
grant select on public.widget_sessions, public.usage_events, public.org_usage_daily
  to authenticated;

-- ---------------------------------------------------------------------------
-- THE PUBLIC SURFACE
--
-- anon receives EXECUTE on these three functions and nothing else. No table
-- grants, so there is no query a visitor can issue that these functions do not
-- explicitly perform.
-- ---------------------------------------------------------------------------

-- Only the fields a visitor is allowed to see. Deliberately no prices, no
-- knowledge, no counts, and no organization id.
create or replace function public.widget_config(p_key text)
returns table (business_name text, greeting text, theme_color text)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(bp.business_name, o.name) as business_name,
    w.greeting,
    w.theme_color
  from public.widget_settings w
  join public.organizations o on o.id = w.organization_id
  left join public.business_profiles bp on bp.organization_id = w.organization_id
  where w.widget_key = p_key
    and w.enabled = true;
$$;

-- Start an anonymous visitor session. Counts against the daily session cap so
-- session creation itself cannot be used to spam.
--
-- OUT parameters are prefixed `out_` throughout this file. PL/pgSQL resolves
-- unqualified names to variables first, so an OUT parameter named
-- `organization_id` makes every `where organization_id = ...` in the body
-- ambiguous and the function fails at runtime. The prefix removes the whole
-- class of collision.
create or replace function public.widget_start_session(p_key text)
returns table (out_token text, out_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_max_sessions int;
  v_today int;
  v_conversation uuid;
  v_token text;
begin
  select w.organization_id, w.max_sessions_per_day
    into v_org, v_max_sessions
  from public.widget_settings w
  where w.widget_key = p_key and w.enabled = true;

  if not found then
    return query select null::text, 'disabled'::text;
    return;
  end if;

  -- Count the session first, then release it if the cap is exceeded: the
  -- increment and the check are one statement, so concurrent requests cannot
  -- both observe "under the cap" and both proceed.
  insert into public.org_usage_daily as u (organization_id, usage_date, widget_sessions)
  values (v_org, current_date, 1)
  on conflict (organization_id, usage_date) do update
    set widget_sessions = u.widget_sessions + 1
  returning u.widget_sessions into v_today;

  if v_today > v_max_sessions then
    update public.org_usage_daily u
      set widget_sessions = u.widget_sessions - 1
    where u.organization_id = v_org and u.usage_date = current_date;
    return query select null::text, 'rate_limited'::text;
    return;
  end if;

  insert into public.conversations (organization_id, channel, status)
  values (v_org, 'widget', 'AI_ACTIVE')
  returning id into v_conversation;

  insert into public.widget_sessions as s (organization_id, conversation_id)
  values (v_org, v_conversation)
  returning s.token into v_token;

  return query select v_token, 'ok'::text;
end;
$$;

-- Post a visitor message. The spend gate and the insert happen together under
-- a row lock on the session, so concurrent requests cannot slip past the caps.
-- Returns the organization and conversation ONLY when the message was accepted,
-- so the caller learns nothing about a business it failed to reach.
create or replace function public.widget_send(p_token text, p_content text)
returns table (out_status text, out_organization_id uuid, out_conversation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_settings record;
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

  -- Daily spend cap for the whole organization: the backstop that makes
  -- creating fresh sessions pointless as an attack.
  insert into public.org_usage_daily as u (organization_id, usage_date, widget_messages)
  values (v_session.organization_id, current_date, 1)
  on conflict (organization_id, usage_date) do update
    set widget_messages = u.widget_messages + 1
  returning u.widget_messages into v_today;

  if v_today > v_settings.max_messages_per_day then
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

revoke all on function public.widget_config(text) from public;
revoke all on function public.widget_start_session(text) from public;
revoke all on function public.widget_send(text, text) from public;

grant execute on function public.widget_config(text) to anon, authenticated;
grant execute on function public.widget_start_session(text) to anon, authenticated;
grant execute on function public.widget_send(text, text) to anon, authenticated;

-- Which sites may embed this widget. Used to build a frame-ancestors header;
-- returns only the origin list, which is already semi-public (the widget key
-- appears in the embed snippet on those same sites).
create or replace function public.widget_frame_policy(p_key text)
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select allowed_origins
  from public.widget_settings
  where widget_key = p_key and enabled = true;
$$;

revoke all on function public.widget_frame_policy(text) from public;
grant execute on function public.widget_frame_policy(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Close the default EXECUTE grant on everything else.
--
-- PostgreSQL grants EXECUTE on a new function to PUBLIC, which now includes
-- `anon` — and from this milestone on, `anon` is a role the public internet
-- holds a key for. None of these functions would leak data on their own (the
-- SECURITY INVOKER ones hit RLS and anon's empty table privileges, and the
-- SECURITY DEFINER helpers resolve auth.uid() to null), but "the public
-- surface is exactly four functions" should be true by grant, not by argument.
-- ---------------------------------------------------------------------------
revoke execute on function public.match_knowledge_chunks(uuid, vector, integer) from public;
revoke execute on function public.append_ai_message(uuid, text, jsonb) from public;
revoke execute on function public.claim_automation_run(uuid) from public;
revoke execute on function public.is_org_member(uuid) from public;
revoke execute on function public.is_org_admin(uuid) from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_organization() from public;
revoke execute on function public.set_updated_at() from public;

grant execute on function public.match_knowledge_chunks(uuid, vector, integer)
  to authenticated, service_role;
grant execute on function public.append_ai_message(uuid, text, jsonb)
  to authenticated, service_role;
grant execute on function public.claim_automation_run(uuid)
  to authenticated, service_role;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.is_org_admin(uuid) to authenticated, service_role;
