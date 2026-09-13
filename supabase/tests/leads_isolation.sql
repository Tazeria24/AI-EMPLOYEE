-- Tenant-isolation tests for Milestone 07 (the lead pipeline).
--
-- M05's agent suite covers the raw leads tables. This one covers the pipeline
-- operations the dashboard performs: moving a lead through statuses, editing
-- score/intent/notes, and writing the activity timeline — each of which must be
-- impossible to perform against another organization's lead.
--
-- Apply 00_supabase_shim.sql and migrations 0001..0006 first. Run with
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

insert into public.customers (id, organization_id, name, phone)
values
  ('00000000-0000-0000-0000-0000000000c1', current_setting('test.org_a')::uuid, 'Ada A', '0800000001'),
  ('00000000-0000-0000-0000-0000000000c2', current_setting('test.org_b')::uuid, 'Bola B', '0800000002');

insert into public.leads (id, organization_id, customer_id, status, intent, source, score)
values
  ('00000000-0000-0000-0000-0000000000e1', current_setting('test.org_a')::uuid,
   '00000000-0000-0000-0000-0000000000c1', 'NEW', 'red dress size 12', 'ai_agent', null),
  ('00000000-0000-0000-0000-0000000000e2', current_setting('test.org_b')::uuid,
   '00000000-0000-0000-0000-0000000000c2', 'NEGOTIATING', 'B wholesale deal', 'ai_agent', 80);

insert into public.lead_events (organization_id, lead_id, event_type, metadata)
values
  (current_setting('test.org_a')::uuid, '00000000-0000-0000-0000-0000000000e1',
   'created', '{"source":"ai_agent"}'::jsonb),
  (current_setting('test.org_b')::uuid, '00000000-0000-0000-0000-0000000000e2',
   'created', '{"source":"ai_agent"}'::jsonb);

-- Act as userA (authenticated).
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare
  c int;
  a_lead uuid := '00000000-0000-0000-0000-0000000000e1';
  b_lead uuid := '00000000-0000-0000-0000-0000000000e2';
  leaked text;
begin
  -- Reads: only own tenant's pipeline.
  select count(*) into c from public.leads;
  assert c = 1, format('userA should see 1 lead, saw %s', c);

  select count(*) into c from public.lead_events;
  assert c = 1, format('userA should see 1 lead event, saw %s', c);

  select string_agg(intent, ' ') into leaked from public.leads;
  assert leaked not like '%wholesale%', 'org B lead intent leaked';

  -- Pipeline: can move own lead and record the event.
  update public.leads set status = 'INTERESTED' where id = a_lead;
  select status into leaked from public.leads where id = a_lead;
  assert leaked = 'INTERESTED', 'userA should be able to move own lead';

  insert into public.lead_events (organization_id, lead_id, event_type, metadata)
  values (current_setting('test.org_a')::uuid, a_lead, 'status_changed',
          '{"from":"NEW","to":"INTERESTED"}'::jsonb);

  -- Can set score/intent/notes on own lead.
  update public.leads set score = 60, notes = 'called back' where id = a_lead;
  select count(*) into c from public.leads where id = a_lead and score = 60;
  assert c = 1, 'userA should be able to score own lead';

  -- Cannot move org B's lead through the pipeline.
  with upd as (
    update public.leads set status = 'WON' where id = b_lead returning 1
  )
  select count(*) into c from upd;
  assert c = 0, format('userA must not move org B lead, updated %s', c);

  -- Cannot rewrite org B's score/notes.
  with upd as (
    update public.leads set score = 0, notes = 'HACKED'
    where organization_id = current_setting('test.org_b')::uuid returning 1
  )
  select count(*) into c from upd;
  assert c = 0, format('userA must not edit org B leads, updated %s', c);

  -- Cannot write to org B's activity timeline.
  begin
    insert into public.lead_events (organization_id, lead_id, event_type)
    values (current_setting('test.org_b')::uuid, b_lead, 'status_changed');
    assert false, 'userA insert into org B lead_events should have been blocked';
  exception
    when insufficient_privilege then null; -- expected: RLS violation
  end;

  -- Cannot delete org B's lead.
  with del as (
    delete from public.leads where id = b_lead returning 1
  )
  select count(*) into c from del;
  assert c = 0, format('userA must not delete org B lead, deleted %s', c);
end $$;

reset role;

-- Confirm (privileged) org B's pipeline is untouched.
do $$
declare
  c int;
  s text;
begin
  select status, score into s, c from public.leads
  where id = '00000000-0000-0000-0000-0000000000e2';
  assert s = 'NEGOTIATING', format('org B lead status must be unchanged, is %s', s);
  assert c = 80, format('org B lead score must be unchanged, is %s', c);

  select count(*) into c from public.leads where notes = 'HACKED';
  assert c = 0, 'org B lead notes must not have been modified';

  select count(*) into c from public.lead_events
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 1, format('org B should still have exactly 1 lead event, has %s', c);
end $$;

rollback;

\echo 'LEADS ISOLATION TESTS PASSED'
