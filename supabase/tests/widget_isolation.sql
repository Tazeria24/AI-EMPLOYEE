-- Tenant isolation + spend-cap tests for Milestone 09 (website widget).
--
-- This is the first surface reachable by the public internet, and every
-- message on it costs money. Planning audit finding #10: "an attacker scripts
-- the public widget endpoint; each request triggers an LLM call; the API bill
-- explodes overnight."
--
-- The properties proved here are the ones the product depends on:
--   1. `anon` has NO table privileges — the four widget functions are the
--      entire public attack surface.
--   2. widget_config leaks nothing: no prices, no knowledge, no organization id.
--   3. The per-session, per-day message and per-day session caps are enforced
--      by the database, and a refused request does not leave the counter
--      inflated (so a refusal cannot itself become a denial of service).
--   4. A disabled widget answers nothing.
--   5. One tenant's dashboard cannot see or change another's widget.
--
-- Apply 00_supabase_shim.sql and migrations 0001..0008 first. Run with
-- ON_ERROR_STOP.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

select set_config('test.org_a',
  (select organization_id::text from public.organization_members
   where user_id = '00000000-0000-0000-0000-00000000000a'::uuid), true);
select set_config('test.org_b',
  (select organization_id::text from public.organization_members
   where user_id = '00000000-0000-0000-0000-00000000000b'::uuid), true);

-- Both businesses have a product; the widget must never expose them.
insert into public.products (organization_id, name, price, stock_quantity)
values
  (current_setting('test.org_a')::uuid, 'A red dress', 25000, 4),
  (current_setting('test.org_b')::uuid, 'B blue shoes', 18000, 2);

update public.widget_settings
  set enabled = true
where organization_id in (
  current_setting('test.org_a')::uuid, current_setting('test.org_b')::uuid
);

select set_config('test.key_a',
  (select widget_key from public.widget_settings
   where organization_id = current_setting('test.org_a')::uuid), true);
select set_config('test.key_b',
  (select widget_key from public.widget_settings
   where organization_id = current_setting('test.org_b')::uuid), true);

-- ---------------------------------------------------------------------------
-- 1. anon holds no table privileges at all
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  p text;
begin
  foreach t in array array[
    'public.widget_settings', 'public.widget_sessions', 'public.org_usage_daily',
    'public.usage_events', 'public.products', 'public.knowledge_chunks',
    'public.knowledge_documents', 'public.conversations', 'public.messages',
    'public.leads', 'public.customers', 'public.organizations',
    'public.business_profiles', 'public.agent_runs'
  ] loop
    foreach p in array array['select', 'insert', 'update', 'delete'] loop
      assert not has_table_privilege('anon', t, p),
        format('anon must not hold %s on %s', p, t);
    end loop;
  end loop;

  -- ...but it can execute exactly the four widget functions.
  assert has_function_privilege('anon', 'public.widget_config(text)', 'execute'),
    'anon must be able to call widget_config';
  assert has_function_privilege('anon', 'public.widget_start_session(text)', 'execute'),
    'anon must be able to call widget_start_session';
  assert has_function_privilege('anon', 'public.widget_send(text, text)', 'execute'),
    'anon must be able to call widget_send';
  assert has_function_privilege('anon', 'public.widget_frame_policy(text)', 'execute'),
    'anon must be able to call widget_frame_policy';

  -- And nothing else that could read business data.
  assert not has_function_privilege('anon', 'public.match_knowledge_chunks(uuid, vector, integer)', 'execute'),
    'anon must not be able to run knowledge retrieval';
  assert not has_function_privilege('anon', 'public.append_ai_message(uuid, text, jsonb)', 'execute'),
    'anon must not be able to post AI messages';
end $$;

-- ---------------------------------------------------------------------------
-- 2. widget_config exposes only the three cosmetic fields
-- ---------------------------------------------------------------------------
do $$
declare cols text;
begin
  select string_agg(p.name, ',' order by p.ord)
    into cols
  from unnest(
    (select proargnames from pg_proc
     where oid = 'public.widget_config(text)'::regprocedure)
  ) with ordinality as p(name, ord)
  where p.name <> 'p_key';

  assert cols = 'business_name,greeting,theme_color',
    format('widget_config must return only cosmetic fields, returns: %s', cols);
end $$;

set local role anon;

do $$
declare
  r record;
  c int;
begin
  select * into r from public.widget_config(current_setting('test.key_a'));
  assert r.business_name is not null, 'widget_config must resolve an enabled widget';

  -- An unknown key is indistinguishable from a disabled one: no rows either way.
  select count(*) into c from public.widget_config('ffffffffffffffffffffffffffffffff');
  assert c = 0, 'an unknown widget key must resolve to nothing';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 3. A disabled widget answers nothing
-- ---------------------------------------------------------------------------
do $$
declare
  s text;
  c int;
  tok text;
begin
  -- Start a session while B is still enabled, then switch the widget off:
  -- an existing token must stop working too, not just new ones.
  select out_token into tok from public.widget_start_session(current_setting('test.key_b'));
  assert tok is not null, 'B session should start while enabled';

  update public.widget_settings set enabled = false
  where organization_id = current_setting('test.org_b')::uuid;

  select out_status into s from public.widget_start_session(current_setting('test.key_b'));
  assert s = 'disabled', format('disabled widget must refuse new sessions, got %s', s);

  select out_status into s from public.widget_send(tok, 'still there?');
  assert s = 'disabled',
    format('disabled widget must refuse an existing session too, got %s', s);

  select count(*) into c from public.widget_config(current_setting('test.key_b'));
  assert c = 0, 'a disabled widget must expose no configuration';
end $$;

update public.widget_settings set enabled = true
where organization_id = current_setting('test.org_b')::uuid;

-- ---------------------------------------------------------------------------
-- 4. The per-session message cap
-- ---------------------------------------------------------------------------
do $$
declare
  tok text;
  s text;
  c int;
begin
  update public.widget_settings set max_messages_per_session = 2
  where organization_id = current_setting('test.org_a')::uuid;

  select out_token into tok from public.widget_start_session(current_setting('test.key_a'));
  assert tok is not null, 'session should start';

  select out_status into s from public.widget_send(tok, 'first');
  assert s = 'ok', format('message 1 should be accepted, got %s', s);
  select out_status into s from public.widget_send(tok, 'second');
  assert s = 'ok', format('message 2 should be accepted, got %s', s);

  select out_status into s from public.widget_send(tok, 'third');
  assert s = 'session_limit', format('message 3 must be refused, got %s', s);

  select count(*) into c from public.messages m
  join public.widget_sessions ws on ws.conversation_id = m.conversation_id
  where ws.token = tok;
  assert c = 2, format('only 2 messages should have been stored, found %s', c);

  -- A refused message must not be billed.
  select widget_messages into c from public.org_usage_daily
  where organization_id = current_setting('test.org_a')::uuid
    and usage_date = current_date;
  assert c = 2, format('daily counter should be 2, is %s', c);

  update public.widget_settings set max_messages_per_session = 20
  where organization_id = current_setting('test.org_a')::uuid;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The per-organization daily message cap, and no counter drift on refusal
-- ---------------------------------------------------------------------------
do $$
declare
  tok text;
  s text;
  before_count int;
  after_count int;
begin
  select widget_messages into before_count from public.org_usage_daily
  where organization_id = current_setting('test.org_a')::uuid
    and usage_date = current_date;

  -- Cap the day at exactly what has already been spent.
  update public.widget_settings set max_messages_per_day = before_count
  where organization_id = current_setting('test.org_a')::uuid;

  select out_token into tok from public.widget_start_session(current_setting('test.key_a'));
  select out_status into s from public.widget_send(tok, 'over the daily cap');
  assert s = 'org_limit', format('message past the daily cap must be refused, got %s', s);

  select widget_messages into after_count from public.org_usage_daily
  where organization_id = current_setting('test.org_a')::uuid
    and usage_date = current_date;
  assert after_count = before_count,
    format('a refused message must not consume quota: %s -> %s', before_count, after_count);

  update public.widget_settings set max_messages_per_day = 500
  where organization_id = current_setting('test.org_a')::uuid;
end $$;

-- ---------------------------------------------------------------------------
-- 6. The daily session cap — so opening fresh sessions is not a way around
--    the per-session limit
-- ---------------------------------------------------------------------------
do $$
declare
  s text;
  used int;
  after_count int;
begin
  select widget_sessions into used from public.org_usage_daily
  where organization_id = current_setting('test.org_a')::uuid
    and usage_date = current_date;

  update public.widget_settings set max_sessions_per_day = used
  where organization_id = current_setting('test.org_a')::uuid;

  select out_status into s from public.widget_start_session(current_setting('test.key_a'));
  assert s = 'rate_limited', format('session past the daily cap must be refused, got %s', s);

  select widget_sessions into after_count from public.org_usage_daily
  where organization_id = current_setting('test.org_a')::uuid
    and usage_date = current_date;
  assert after_count = used,
    format('a refused session must not consume quota: %s -> %s', used, after_count);

  update public.widget_settings set max_sessions_per_day = 200
  where organization_id = current_setting('test.org_a')::uuid;
end $$;

-- ---------------------------------------------------------------------------
-- 7. A token only ever writes into its own tenant
-- ---------------------------------------------------------------------------
do $$
declare
  tok_b text;
  org uuid;
  conv uuid;
  c int;
begin
  select out_token into tok_b from public.widget_start_session(current_setting('test.key_b'));
  select out_organization_id, out_conversation_id into org, conv
  from public.widget_send(tok_b, 'hello from B');

  assert org = current_setting('test.org_b')::uuid,
    'a B token must resolve to org B';

  select count(*) into c from public.messages
  where conversation_id = conv
    and organization_id <> current_setting('test.org_b')::uuid;
  assert c = 0, 'a B message must never be written under another organization';

  -- Guessing another business's key gets you that business's widget, not a way
  -- into it: the token is what carries the tenant, and it is 256 bits.
  select count(*) into c from public.widget_sessions
  where token = tok_b and organization_id = current_setting('test.org_a')::uuid;
  assert c = 0, 'a B session must not be visible as an A session';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Dashboard-side tenant isolation
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare c int;
begin
  select count(*) into c from public.widget_settings;
  assert c = 1, format('userA must see exactly their own widget settings, saw %s', c);

  select count(*) into c from public.widget_settings
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 0, 'userA must not see org B widget settings';

  with upd as (
    update public.widget_settings set enabled = false
    where organization_id = current_setting('test.org_b')::uuid
    returning 1
  )
  select count(*) into c from upd;
  assert c = 0, format('userA must not change org B widget, updated %s', c);

  select count(*) into c from public.widget_sessions
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 0, 'userA must not see org B widget sessions';

  select count(*) into c from public.org_usage_daily
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 0, 'userA must not see org B usage';

  select count(*) into c from public.usage_events
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 0, 'userA must not see org B usage events';
end $$;

reset role;

-- Confirm (privileged) org B is untouched by any of the above.
do $$
declare e boolean;
begin
  select enabled into e from public.widget_settings
  where organization_id = current_setting('test.org_b')::uuid;
  assert e is true, 'org B widget must still be enabled';
end $$;

rollback;

\echo 'WIDGET ISOLATION + SPEND CAP TESTS PASSED'
