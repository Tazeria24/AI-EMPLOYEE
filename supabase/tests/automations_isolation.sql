-- Tenant isolation + follow-up cap tests for Milestone 08.
--
-- The headline property: the "at most two automated follow-ups per lead" rule
-- is enforced by the database, so a buggy scheduler, an overlapping cron
-- firing, or a retry cannot spam a customer (planning audit finding #11).
--
-- Apply 00_supabase_shim.sql and migrations 0001..0007 first. Run with
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

insert into public.customers (id, organization_id, name)
values
  ('00000000-0000-0000-0000-0000000000c1', current_setting('test.org_a')::uuid, 'Ada A'),
  ('00000000-0000-0000-0000-0000000000c2', current_setting('test.org_b')::uuid, 'Bola B');

insert into public.leads (id, organization_id, customer_id, status, intent)
values
  ('00000000-0000-0000-0000-0000000000e1', current_setting('test.org_a')::uuid,
   '00000000-0000-0000-0000-0000000000c1', 'CONTACTED', 'red dress'),
  ('00000000-0000-0000-0000-0000000000e2', current_setting('test.org_b')::uuid,
   '00000000-0000-0000-0000-0000000000c2', 'CONTACTED', 'B wholesale');

insert into public.automations (id, organization_id, name, enabled)
values
  ('00000000-0000-0000-0000-0000000000a1', current_setting('test.org_a')::uuid, 'A follow-up', true),
  ('00000000-0000-0000-0000-0000000000a2', current_setting('test.org_b')::uuid, 'B follow-up', true);

-- ---------------------------------------------------------------------------
-- 1. The follow-up cap, enforced by the database
-- ---------------------------------------------------------------------------
do $$
declare
  a_org uuid := current_setting('test.org_a')::uuid;
  a_lead uuid := '00000000-0000-0000-0000-0000000000e1';
  a_auto uuid := '00000000-0000-0000-0000-0000000000a1';
  c int;
begin
  -- Follow-ups #1 and #2 are fine.
  insert into public.automation_runs
    (organization_id, automation_id, lead_id, status, follow_up_number)
  values (a_org, a_auto, a_lead, 'sent', 1);

  insert into public.automation_runs
    (organization_id, automation_id, lead_id, status, follow_up_number)
  values (a_org, a_auto, a_lead, 'sent', 2);

  -- A THIRD follow-up is impossible: there is no valid third number.
  begin
    insert into public.automation_runs
      (organization_id, automation_id, lead_id, status, follow_up_number)
    values (a_org, a_auto, a_lead, 'sent', 3);
    assert false, 'a third follow-up must be rejected by the database';
  exception
    when check_violation then null; -- expected
  end;

  -- A RETRY of follow-up #1 is impossible: the unique index catches it. This
  -- is what makes a scheduler retry safe.
  begin
    insert into public.automation_runs
      (organization_id, automation_id, lead_id, status, follow_up_number)
    values (a_org, a_auto, a_lead, 'scheduled', 1);
    assert false, 'a duplicate follow-up #1 must be rejected';
  exception
    when unique_violation then null; -- expected
  end;

  -- A run cannot be marked 'sent' without a number, which would dodge the cap.
  begin
    insert into public.automation_runs
      (organization_id, automation_id, lead_id, status, follow_up_number)
    values (a_org, a_auto, a_lead, 'sent', null);
    assert false, 'a sent run without a follow-up number must be rejected';
  exception
    when check_violation then null; -- expected
  end;

  select count(*) into c from public.automation_runs where lead_id = a_lead;
  assert c = 2, format('exactly 2 runs should exist for the lead, saw %s', c);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Atomic claim: a run can only be claimed once
-- ---------------------------------------------------------------------------
do $$
declare
  a_org uuid := current_setting('test.org_a')::uuid;
  run_id uuid;
  first_claim uuid;
  second_claim uuid;
begin
  insert into public.automation_runs
    (organization_id, automation_id, lead_id, status, follow_up_number)
  values (a_org, '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-0000000000e2', 'scheduled', 1)
  returning id into run_id;

  first_claim := public.claim_automation_run(run_id);
  assert first_claim is not null, 'the first claim should succeed';

  second_claim := public.claim_automation_run(run_id);
  assert second_claim is null, 'the second claim must return nothing';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Tenant isolation
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare
  c int;
  b_org uuid := current_setting('test.org_b')::uuid;
  b_auto uuid := '00000000-0000-0000-0000-0000000000a2';
  leaked text;
begin
  select count(*) into c from public.automations;
  assert c = 1, format('userA should see 1 automation, saw %s', c);

  select string_agg(name, ' ') into leaked from public.automations;
  assert leaked not like '%B follow-up%', 'org B automation leaked';

  -- Cannot enable/disable org B's automation.
  with upd as (
    update public.automations set enabled = false where id = b_auto returning 1
  )
  select count(*) into c from upd;
  assert c = 0, format('userA must not change org B automation, updated %s', c);

  -- Cannot schedule a run against org B.
  begin
    insert into public.automation_runs
      (organization_id, automation_id, lead_id, status, follow_up_number)
    values (b_org, b_auto, '00000000-0000-0000-0000-0000000000e2', 'scheduled', 2);
    assert false, 'userA insert into org B automation_runs should have been blocked';
  exception
    when insufficient_privilege then null; -- expected: RLS violation
  end;

  -- Cannot claim org B's run (invisible, so the update matches nothing).
  select count(*) into c from public.automation_runs
  where organization_id = b_org;
  assert c = 0, format('userA must not see org B runs, saw %s', c);
end $$;

reset role;

-- Confirm (privileged) org B is untouched.
do $$
declare c int; e boolean;
begin
  select enabled into e from public.automations
  where id = '00000000-0000-0000-0000-0000000000a2';
  assert e is true, 'org B automation must still be enabled';

  select count(*) into c from public.automation_runs
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 0, format('org B should have no runs, has %s', c);
end $$;

rollback;

\echo 'AUTOMATIONS ISOLATION + FOLLOW-UP CAP TESTS PASSED'
