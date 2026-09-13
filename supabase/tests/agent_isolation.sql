-- Tenant-isolation tests for Milestone 05 (customers, leads, lead_events,
-- agent_runs) — the tables the AI agent's tools write to.
--
-- The agent runs with an organization id derived from the session, but a bug
-- (or a prompt injection that convinced the model to pass a different id) must
-- still not be able to reach another tenant. These tests prove the database
-- refuses, independently of any application check.
--
-- Apply 00_supabase_shim.sql and migrations 0001..0005 first. Run with
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

-- Seed a customer + lead + agent run for each org as a privileged role.
insert into public.customers (id, organization_id, name, phone)
values
  ('00000000-0000-0000-0000-0000000000c1', current_setting('test.org_a')::uuid, 'Ada A', '0800000001'),
  ('00000000-0000-0000-0000-0000000000c2', current_setting('test.org_b')::uuid, 'Bola B', '0800000002');

insert into public.leads (id, organization_id, customer_id, intent, source)
values
  ('00000000-0000-0000-0000-0000000000e1', current_setting('test.org_a')::uuid,
   '00000000-0000-0000-0000-0000000000c1', 'red dress size 12', 'ai_agent'),
  ('00000000-0000-0000-0000-0000000000e2', current_setting('test.org_b')::uuid,
   '00000000-0000-0000-0000-0000000000c2', 'B secret wholesale deal', 'ai_agent');

insert into public.agent_runs (organization_id, model, user_message, reply)
values
  (current_setting('test.org_a')::uuid, 'test', 'hello from A', 'hi A'),
  (current_setting('test.org_b')::uuid, 'test', 'hello from B', 'hi B');

do $$
declare c int;
begin
  select count(*) into c from public.leads;
  assert c = 2, format('expected 2 seeded leads, saw %s', c);
end $$;

-- Act as userA (authenticated).
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare
  c int;
  a_org uuid := current_setting('test.org_a')::uuid;
  b_org uuid := current_setting('test.org_b')::uuid;
  leaked text;
begin
  -- Reads: only own tenant's rows.
  select count(*) into c from public.customers;
  assert c = 1, format('userA should see 1 customer, saw %s', c);

  select count(*) into c from public.leads;
  assert c = 1, format('userA should see 1 lead, saw %s', c);

  select count(*) into c from public.agent_runs;
  assert c = 1, format('userA should see 1 agent run, saw %s', c);

  select count(*) into c from public.lead_events;
  assert c = 0, format('userA should see 0 lead events, saw %s', c);

  -- Org B's lead intent must never surface.
  select string_agg(intent, ' ') into leaked from public.leads;
  assert leaked not like '%secret wholesale%', 'org B lead intent leaked';

  -- Writes: can create in own org.
  insert into public.leads (organization_id, intent, source)
  values (a_org, 'own new lead', 'ai_agent');

  -- Writes: cannot create a lead in org B (this is the shape an injected or
  -- buggy organization id would take).
  begin
    insert into public.leads (organization_id, intent, source)
    values (b_org, 'intruder', 'ai_agent');
    assert false, 'userA insert into org B leads should have been blocked';
  exception
    when insufficient_privilege then null; -- expected: RLS violation
  end;

  -- Writes: cannot log an agent run against org B.
  begin
    insert into public.agent_runs (organization_id, model, user_message)
    values (b_org, 'test', 'intruder');
    assert false, 'userA insert into org B agent_runs should have been blocked';
  exception
    when insufficient_privilege then null;
  end;

  -- Writes: cannot modify or delete org B's lead (rows are invisible).
  with upd as (
    update public.leads set intent = 'HACKED' where organization_id = b_org returning 1
  )
  select count(*) into c from upd;
  assert c = 0, format('userA must not update org B leads, updated %s', c);

  with del as (
    delete from public.customers where organization_id = b_org returning 1
  )
  select count(*) into c from del;
  assert c = 0, format('userA must not delete org B customers, deleted %s', c);
end $$;

reset role;

-- Confirm (privileged) org B is untouched.
do $$
declare c int;
begin
  select count(*) into c from public.leads where intent = 'HACKED';
  assert c = 0, 'org B lead must not have been modified';
  select count(*) into c from public.customers
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 1, format('org B should still have 1 customer, has %s', c);
  select count(*) into c from public.leads
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 1, format('org B should still have 1 lead, has %s', c);
end $$;

rollback;

\echo 'AGENT ISOLATION TESTS PASSED'
