-- Tenant isolation + takeover-race tests for Milestone 06.
--
-- Two things are proved here:
--   1. Organization A cannot read or write Organization B's conversations or
--      messages.
--   2. append_ai_message() refuses to post once a human has taken over. This
--      is the database half of audit finding #12: an application-level status
--      check before an insert is a race, so the check and the insert happen
--      together under a row lock instead.
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

insert into public.conversations (id, organization_id, status)
values
  ('00000000-0000-0000-0000-0000000000f1', current_setting('test.org_a')::uuid, 'AI_ACTIVE'),
  ('00000000-0000-0000-0000-0000000000f2', current_setting('test.org_b')::uuid, 'AI_ACTIVE');

insert into public.messages (organization_id, conversation_id, sender_type, content)
values
  (current_setting('test.org_a')::uuid, '00000000-0000-0000-0000-0000000000f1',
   'customer', 'Hello from A'),
  (current_setting('test.org_b')::uuid, '00000000-0000-0000-0000-0000000000f2',
   'customer', 'Org B confidential enquiry');

-- Act as userA (authenticated).
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- 1. Tenant isolation
-- ---------------------------------------------------------------------------
do $$
declare
  c int;
  b_conversation uuid := '00000000-0000-0000-0000-0000000000f2';
  leaked text;
begin
  select count(*) into c from public.conversations;
  assert c = 1, format('userA should see 1 conversation, saw %s', c);

  select count(*) into c from public.messages;
  assert c = 1, format('userA should see 1 message, saw %s', c);

  select string_agg(content, ' ') into leaked from public.messages;
  assert leaked not like '%confidential%', 'org B message content leaked';

  -- Cannot post into org B's conversation.
  begin
    insert into public.messages
      (organization_id, conversation_id, sender_type, content)
    values (current_setting('test.org_b')::uuid, b_conversation, 'human', 'intruder');
    assert false, 'userA insert into org B messages should have been blocked';
  exception
    when insufficient_privilege then null; -- expected: RLS violation
  end;

  -- Cannot take over org B's conversation (row is invisible).
  with upd as (
    update public.conversations set status = 'HUMAN_ACTIVE'
    where id = b_conversation returning 1
  )
  select count(*) into c from upd;
  assert c = 0, format('userA must not update org B conversation, updated %s', c);

  -- append_ai_message must not reach org B either, even given its id.
  assert public.append_ai_message(b_conversation, 'intruder reply') is null,
    'append_ai_message must not write into another organization';
end $$;

-- ---------------------------------------------------------------------------
-- 2. The takeover gate
-- ---------------------------------------------------------------------------
do $$
declare
  a_conversation uuid := '00000000-0000-0000-0000-0000000000f1';
  message_id uuid;
  c int;
begin
  -- While AI_ACTIVE the AI may post.
  message_id := public.append_ai_message(a_conversation, 'AI reply one');
  assert message_id is not null, 'AI should be able to post while AI_ACTIVE';

  select count(*) into c from public.messages
  where conversation_id = a_conversation and sender_type = 'ai';
  assert c = 1, format('expected 1 AI message, saw %s', c);

  -- A human takes over...
  update public.conversations set status = 'HUMAN_ACTIVE' where id = a_conversation;

  -- ...and an in-flight AI reply must now be refused, writing nothing.
  message_id := public.append_ai_message(a_conversation, 'late AI reply');
  assert message_id is null, 'AI must not post after a human took over';

  select count(*) into c from public.messages
  where conversation_id = a_conversation and sender_type = 'ai';
  assert c = 1, format('no AI message should have been added, saw %s', c);

  select count(*) into c from public.messages where content = 'late AI reply';
  assert c = 0, 'the late AI reply must not exist anywhere';

  -- Closed conversations are refused too.
  update public.conversations set status = 'CLOSED' where id = a_conversation;
  assert public.append_ai_message(a_conversation, 'reply after close') is null,
    'AI must not post to a closed conversation';

  -- Handing back to the AI re-enables it.
  update public.conversations set status = 'AI_ACTIVE' where id = a_conversation;
  message_id := public.append_ai_message(a_conversation, 'AI reply two');
  assert message_id is not null, 'AI should post again after being handed back';

  select count(*) into c from public.messages
  where conversation_id = a_conversation and sender_type = 'ai';
  assert c = 2, format('expected 2 AI messages, saw %s', c);
end $$;

-- A conversation id that does not exist is refused rather than erroring.
do $$
begin
  assert public.append_ai_message(
    '00000000-0000-0000-0000-0000000000ff'::uuid, 'nowhere') is null,
    'append_ai_message on a missing conversation should return null';
end $$;

reset role;

-- Confirm (privileged) org B is untouched.
do $$
declare c int;
begin
  select count(*) into c from public.messages
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 1, format('org B should still have exactly 1 message, has %s', c);

  select status into strict c from (
    select case when status = 'AI_ACTIVE' then 1 else 0 end as status
    from public.conversations where id = '00000000-0000-0000-0000-0000000000f2'
  ) s;
  assert c = 1, 'org B conversation status must be unchanged';
end $$;

rollback;

\echo 'CONVERSATIONS ISOLATION + TAKEOVER TESTS PASSED'
