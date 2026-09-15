-- Tenant isolation + plan enforcement tests for Milestone 11 (billing).
--
-- tasks/11 sets two security requirements, and this suite is what makes them
-- claims about the database rather than about our discipline:
--
--   "Never trust client-submitted subscription state."
--     `authenticated` holds SELECT on `subscriptions` and nothing else. There
--     is no UPDATE grant, so no form, no server action and no bug in one can
--     move an organization onto a better plan. Only the verified payment
--     webhook writes, through the service-role client.
--
--   "Plan access is server-enforced."
--     Limits are TRIGGERS on the tables they govern, so they hold for every
--     write path — dashboard, AI tool, cron, or anything added later.
--
-- Apply 00_supabase_shim.sql and migrations 0001..0010 first. Run with
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

-- ---------------------------------------------------------------------------
-- 1. Every organization starts on a Starter trial
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  select plan, status into r from public.subscriptions
  where organization_id = current_setting('test.org_a')::uuid;

  assert r.plan = 'starter', format('new orgs should start on starter, got %s', r.plan);
  assert r.status = 'trialing', format('new orgs should start trialing, got %s', r.status);

  assert public.org_plan(current_setting('test.org_a')::uuid) = 'starter',
    'a trialing organization is entitled to its plan';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Entitlement follows status, and a lapsed subscription allows nothing
-- ---------------------------------------------------------------------------
do $$
declare
  a_org uuid := current_setting('test.org_a')::uuid;
  s text;
begin
  update public.subscriptions set plan = 'pro', status = 'past_due'
  where organization_id = a_org;
  -- past_due deliberately keeps working: a failed card starts a conversation,
  -- it does not switch a business's customer service off mid-day.
  assert public.org_plan(a_org) = 'pro',
    format('past_due should keep the plan, got %s', public.org_plan(a_org));

  update public.subscriptions set status = 'canceled' where organization_id = a_org;
  select public.org_plan(a_org) into s;
  assert s = 'none', format('canceled should fall back to none, got %s', s);

  update public.subscriptions set status = 'incomplete' where organization_id = a_org;
  select public.org_plan(a_org) into s;
  assert s = 'none', format('incomplete should fall back to none, got %s', s);

  -- A lapsed subscription cannot add anything at all.
  begin
    insert into public.products (organization_id, name, price)
    values (a_org, 'Should not exist', 100);
    assert false, 'a canceled subscription should not be able to add products';
  exception
    when sqlstate 'PLIM1' then null; -- expected
  end;

  update public.subscriptions set plan = 'starter', status = 'trialing'
  where organization_id = a_org;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The plan limit is enforced by the database, on every write path
-- ---------------------------------------------------------------------------
do $$
declare
  a_org uuid := current_setting('test.org_a')::uuid;
  c int;
begin
  -- Shrink the Starter allowance so the test does not have to insert 100 rows.
  update public.plan_limits set max_products = 2 where plan = 'starter';

  insert into public.products (organization_id, name, price) values (a_org, 'One', 100);
  insert into public.products (organization_id, name, price) values (a_org, 'Two', 100);

  begin
    insert into public.products (organization_id, name, price) values (a_org, 'Three', 100);
    assert false, 'the third product should have been refused';
  exception
    when sqlstate 'PLIM1' then null; -- expected
  end;

  select count(*) into c from public.products where organization_id = a_org;
  assert c = 2, format('only 2 products should exist, found %s', c);

  -- Archived products do not fill the quota: a business that retires a line
  -- should get that slot back.
  update public.products set status = 'archived' where name = 'One';
  insert into public.products (organization_id, name, price) values (a_org, 'Three', 100);

  select count(*) into c from public.products
  where organization_id = a_org and status <> 'archived';
  assert c = 2, format('active products should be back at the cap, found %s', c);

  -- Upgrading raises the limit immediately — no other change required.
  update public.subscriptions set plan = 'growth', status = 'active'
  where organization_id = a_org;
  insert into public.products (organization_id, name, price) values (a_org, 'Four', 100);

  update public.plan_limits set max_products = 100 where plan = 'starter';
  update public.subscriptions set plan = 'starter', status = 'trialing'
  where organization_id = a_org;
end $$;

-- ---------------------------------------------------------------------------
-- 4. WhatsApp is a paid-tier channel, enforced on the row
-- ---------------------------------------------------------------------------
do $$
declare a_org uuid := current_setting('test.org_a')::uuid;
begin
  begin
    update public.whatsapp_integrations set enabled = true where organization_id = a_org;
    assert false, 'Starter should not be able to enable WhatsApp';
  exception
    when sqlstate 'PLIM1' then null; -- expected
  end;

  update public.subscriptions set plan = 'growth', status = 'active'
  where organization_id = a_org;
  update public.whatsapp_integrations set enabled = true where organization_id = a_org;

  -- Switching off is always allowed, whatever the plan.
  update public.subscriptions set plan = 'starter', status = 'trialing'
  where organization_id = a_org;
  update public.whatsapp_integrations set enabled = false where organization_id = a_org;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The widget's daily cap is bounded by the plan, not only by the business's
--    own setting
-- ---------------------------------------------------------------------------
do $$
declare
  a_org uuid := current_setting('test.org_a')::uuid;
  v_key text;
  v_tok text;
  s text;
  i int;
begin
  -- The business asks for far more than Starter includes.
  update public.plan_limits set max_widget_messages_per_day = 2 where plan = 'starter';
  update public.widget_settings
    set enabled = true, max_messages_per_day = 100000, max_messages_per_session = 100
  where organization_id = a_org;

  select widget_key into v_key from public.widget_settings where organization_id = a_org;
  select out_token into v_tok from public.widget_start_session(v_key);

  for i in 1..2 loop
    select out_status into s from public.widget_send(v_tok, 'hello');
    assert s = 'ok', format('message %s should be accepted, got %s', i, s);
  end loop;

  -- The plan is the ceiling; their own setting can only lower it.
  select out_status into s from public.widget_send(v_tok, 'one too many');
  assert s = 'org_limit',
    format('the plan cap should stop message 3, got %s', s);

  -- A lapsed subscription caps the widget at zero.
  update public.subscriptions set status = 'canceled' where organization_id = a_org;
  select out_token into v_tok from public.widget_start_session(v_key);
  select out_status into s from public.widget_send(v_tok, 'after cancellation');
  assert s = 'org_limit',
    format('a canceled subscription should allow no widget messages, got %s', s);

  update public.plan_limits set max_widget_messages_per_day = 500 where plan = 'starter';
  update public.subscriptions set status = 'trialing' where organization_id = a_org;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Grants: the dashboard role can read its plan and change nothing
-- ---------------------------------------------------------------------------
do $$
begin
  assert has_table_privilege('authenticated', 'public.subscriptions', 'select'),
    'authenticated should be able to read its own subscription';

  -- The whole "never trust client-submitted subscription state" requirement,
  -- expressed as three absent grants.
  assert not has_table_privilege('authenticated', 'public.subscriptions', 'insert'),
    'authenticated must NOT be able to insert a subscription';
  assert not has_table_privilege('authenticated', 'public.subscriptions', 'update'),
    'authenticated must NOT be able to update a subscription';
  assert not has_table_privilege('authenticated', 'public.subscriptions', 'delete'),
    'authenticated must NOT be able to delete a subscription';

  -- The price list is not tenant data, but it is not writable either.
  assert has_table_privilege('authenticated', 'public.plan_limits', 'select'),
    'authenticated should be able to read the price list';
  assert not has_table_privilege('authenticated', 'public.plan_limits', 'update'),
    'authenticated must NOT be able to rewrite the price list';

  -- anon sees no billing at all.
  assert not has_table_privilege('anon', 'public.subscriptions', 'select'),
    'anon must not read subscriptions';
  assert not has_table_privilege('anon', 'public.plan_limits', 'select'),
    'anon must not read the price list';
  assert not has_function_privilege('anon', 'public.org_plan(uuid)', 'execute'),
    'anon must not be able to resolve an org plan';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Dashboard-side tenant isolation
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare c int;
begin
  select count(*) into c from public.subscriptions;
  assert c = 1, format('userA should see exactly their own subscription, saw %s', c);

  select count(*) into c from public.subscriptions
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 0, 'userA must not see org B subscription';

  -- The upgrade-yourself-for-free attempt, refused by grant rather than policy.
  begin
    execute 'update public.subscriptions set plan = ''pro'', status = ''active''';
    assert false, 'userA should not be able to change their own plan';
  exception
    when insufficient_privilege then null; -- expected
  end;

  begin
    execute 'update public.plan_limits set max_products = 999999';
    assert false, 'userA should not be able to rewrite the price list';
  exception
    when insufficient_privilege then null; -- expected
  end;
end $$;

reset role;

-- Confirm (privileged) nothing above changed org A's plan.
do $$
declare p text;
begin
  select plan into p from public.subscriptions
  where organization_id = current_setting('test.org_a')::uuid;
  assert p = 'starter', format('org A should still be on starter, is %s', p);
end $$;

rollback;

\echo 'BILLING ISOLATION + PLAN ENFORCEMENT TESTS PASSED'
