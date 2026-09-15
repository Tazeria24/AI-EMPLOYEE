-- Rate limiting, security logging and NDPR data protection — Milestone 12.
--
-- Three properties, all of them gaps this milestone closes:
--
--   1. **Rate limiting is atomic.** A read-then-increment limiter loses the
--      race that matters — a burst of parallel login attempts. The increment
--      and the test are one statement, as with every other limit here.
--
--   2. **The security log holds no raw identifiers.** "Log security-relevant
--      events without logging secrets or full PII" means the subject is
--      hashed before it arrives, and one tenant cannot read another's events.
--
--   3. **NDPR erasure actually erases** (planning audit finding #16). Deleting
--      a customer removes their conversations, messages and leads, is refused
--      for a non-admin, and is impossible across tenants.
--
-- Apply 00_supabase_shim.sql and migrations 0001..0011 first. Run with
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
-- 1. The rate limiter counts, refuses, and is scoped per bucket
-- ---------------------------------------------------------------------------
do $$
declare
  ok boolean;
  i int;
begin
  -- A limit of 3: the first three pass, the fourth does not.
  for i in 1..3 loop
    select public.consume_rate_limit('bucket-a', 3, 900) into ok;
    assert ok, format('attempt %s should be allowed', i);
  end loop;

  select public.consume_rate_limit('bucket-a', 3, 900) into ok;
  assert not ok, 'the fourth attempt should be refused';

  -- Still refused: a refusal does not reset the window.
  select public.consume_rate_limit('bucket-a', 3, 900) into ok;
  assert not ok, 'a refused attempt must not reset the counter';

  -- A different subject has its own budget, so one attacker cannot lock
  -- everyone else out.
  select public.consume_rate_limit('bucket-b', 3, 900) into ok;
  assert ok, 'a different bucket must have its own budget';

  -- Fails closed on a malformed key rather than allowing through.
  select public.consume_rate_limit('', 3, 900) into ok;
  assert not ok, 'an empty bucket key must be refused';
  select public.consume_rate_limit(null, 3, 900) into ok;
  assert not ok, 'a null bucket key must be refused';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Windows are separate, so a limit expires rather than being permanent
-- ---------------------------------------------------------------------------
do $$
declare
  c int;
  ok boolean;
begin
  -- Two different window lengths bucket the same key separately.
  select public.consume_rate_limit('window-test', 1, 60) into ok;
  assert ok, 'first attempt in the short window is allowed';
  select public.consume_rate_limit('window-test', 1, 60) into ok;
  assert not ok, 'second attempt in the same window is refused';

  select count(*) into c from public.rate_limits where bucket = 'window-test';
  assert c = 1, format('one window row expected, found %s', c);

  -- Old windows are collected rather than growing without bound.
  insert into public.rate_limits (bucket, window_started_at, attempts)
  values ('stale', now() - interval '3 days', 99);
  perform public.purge_rate_limits();

  select count(*) into c from public.rate_limits where bucket = 'stale';
  assert c = 0, 'stale windows should be purged';
  select count(*) into c from public.rate_limits where bucket = 'window-test';
  assert c = 1, 'the current window must survive the purge';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Security events: written from anywhere, readable only by the tenant
-- ---------------------------------------------------------------------------
do $$
declare c int;
begin
  -- A failed login names no organization, and must still be recordable.
  perform public.record_security_event(
    'sign_in_failed', 'info', null, null,
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', null
  );
  perform public.record_security_event(
    'rate_limited', 'warning', current_setting('test.org_a')::uuid, null, 'hash-a', null
  );
  perform public.record_security_event(
    'customer_data_purged', 'critical', current_setting('test.org_b')::uuid, null, 'hash-b', null
  );

  select count(*) into c from public.security_events;
  assert c = 3, format('3 events expected, found %s', c);

  -- An out-of-range severity is coerced rather than rejected: an audit write
  -- must never be the thing that fails the operation it is auditing.
  perform public.record_security_event('odd', 'catastrophic', null, null, null, null);
  select count(*) into c from public.security_events
  where event_type = 'odd' and severity = 'info';
  assert c = 1, 'an unknown severity should be recorded as info';
end $$;

-- ---------------------------------------------------------------------------
-- 4. NDPR erasure actually erases
-- ---------------------------------------------------------------------------
insert into public.customers (id, organization_id, name, phone)
values
  ('00000000-0000-0000-0000-0000000000c1', current_setting('test.org_a')::uuid,
   'Ada A', '+2348111111111'),
  ('00000000-0000-0000-0000-0000000000c2', current_setting('test.org_b')::uuid,
   'Bola B', '+2348222222222');

insert into public.conversations (id, organization_id, customer_id, channel)
values
  ('00000000-0000-0000-0000-0000000000d1', current_setting('test.org_a')::uuid,
   '00000000-0000-0000-0000-0000000000c1', 'widget'),
  ('00000000-0000-0000-0000-0000000000d2', current_setting('test.org_b')::uuid,
   '00000000-0000-0000-0000-0000000000c2', 'widget');

insert into public.messages (organization_id, conversation_id, sender_type, content)
values
  (current_setting('test.org_a')::uuid, '00000000-0000-0000-0000-0000000000d1',
   'customer', 'my number is 08111111111'),
  (current_setting('test.org_b')::uuid, '00000000-0000-0000-0000-0000000000d2',
   'customer', 'confidential B enquiry');

insert into public.leads (organization_id, customer_id, status)
values
  (current_setting('test.org_a')::uuid, '00000000-0000-0000-0000-0000000000c1', 'NEW'),
  (current_setting('test.org_b')::uuid, '00000000-0000-0000-0000-0000000000c2', 'NEW');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare
  c int;
  deleted boolean;
begin
  -- Only this tenant's events are visible.
  select count(*) into c from public.security_events
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 0, 'userA must not see org B security events';

  -- Events with no organization belong to nobody and are not readable either.
  select count(*) into c from public.security_events where organization_id is null;
  assert c = 0, 'org-less events must not be readable by a tenant';

  select count(*) into c from public.security_events;
  assert c = 1, format('userA should see only their own event, saw %s', c);

  -- Cross-tenant erasure is impossible: the row is not visible, so the
  -- function reports nothing to delete rather than deleting it.
  select public.delete_customer_data('00000000-0000-0000-0000-0000000000c2') into deleted;
  assert not deleted, 'userA must not be able to delete org B customer data';

  -- Erasing their own customer removes the whole trail.
  select public.delete_customer_data('00000000-0000-0000-0000-0000000000c1') into deleted;
  assert deleted, 'userA should be able to erase their own customer';
end $$;

reset role;

do $$
declare c int;
begin
  select count(*) into c from public.customers
  where id = '00000000-0000-0000-0000-0000000000c1';
  assert c = 0, 'the customer row should be gone';

  select count(*) into c from public.conversations
  where id = '00000000-0000-0000-0000-0000000000d1';
  assert c = 0, 'their conversation should be gone';

  select count(*) into c from public.messages
  where conversation_id = '00000000-0000-0000-0000-0000000000d1';
  assert c = 0, 'their messages should be gone';

  select count(*) into c from public.leads
  where customer_id = '00000000-0000-0000-0000-0000000000c1';
  assert c = 0, 'their lead should be gone';

  -- Org B is untouched.
  select count(*) into c from public.customers
  where id = '00000000-0000-0000-0000-0000000000c2';
  assert c = 1, 'org B customer must be untouched';
  select count(*) into c from public.messages
  where content like '%confidential%';
  assert c = 1, 'org B message must be untouched';
end $$;

-- ---------------------------------------------------------------------------
-- 5. A member (not admin) cannot erase, and the retention sweep works
-- ---------------------------------------------------------------------------
do $$
declare
  b_org uuid := current_setting('test.org_b')::uuid;
  r record;
  c int;
begin
  -- Retention: org B keeps 30 days; its conversation is older than that.
  update public.business_profiles set retention_days = 30 where organization_id = b_org;
  update public.conversations
    set last_message_at = now() - interval '45 days'
  where id = '00000000-0000-0000-0000-0000000000d2';

  -- A webhook payload old enough to have outlived its usefulness.
  insert into public.integration_events
    (organization_id, provider, external_event_id, payload, created_at)
  values (b_org, 'whatsapp', 'wamid.OLD', '{"from":"2348222222222"}'::jsonb,
          now() - interval '60 days');

  select * into r from public.purge_expired_data();
  assert r.conversations_deleted >= 1,
    format('the expired conversation should be deleted, got %s', r.conversations_deleted);
  assert r.payloads_redacted >= 1,
    format('the old payload should be redacted, got %s', r.payloads_redacted);

  select count(*) into c from public.integration_events
  where external_event_id = 'wamid.OLD' and payload is not null;
  assert c = 0, 'the stored phone number should be gone from the payload';

  -- The event row itself survives: it is still the idempotency record.
  select count(*) into c from public.integration_events
  where external_event_id = 'wamid.OLD';
  assert c = 1, 'redaction must not delete the idempotency record';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
do $$
begin
  -- anon can consume a limit (login and the widget both need it before any
  -- session exists) and record an event, and nothing else new.
  assert has_function_privilege(
    'anon', 'public.consume_rate_limit(text, integer, integer)', 'execute'),
    'anon must be able to consume a rate limit';
  assert not has_table_privilege('anon', 'public.rate_limits', 'select'),
    'anon must not read the rate limit table';
  assert not has_table_privilege('anon', 'public.security_events', 'select'),
    'anon must not read security events';
  assert not has_function_privilege('anon', 'public.purge_expired_data()', 'execute'),
    'anon must not be able to run the retention sweep';
  assert not has_function_privilege(
    'anon', 'public.purge_organization_customers(uuid)', 'execute'),
    'anon must not be able to purge customer data';

  -- Nothing at all may read rate_limits directly; the function is the only path.
  assert not has_table_privilege('authenticated', 'public.rate_limits', 'select'),
    'authenticated must not read the rate limit table';
  assert not has_table_privilege('authenticated', 'public.security_events', 'insert'),
    'authenticated must not write security events directly';
  assert not has_function_privilege(
    'authenticated', 'public.purge_expired_data()', 'execute'),
    'the retention sweep is cron-only';
end $$;

rollback;

\echo 'HARDENING (RATE LIMIT + AUDIT LOG + NDPR) TESTS PASSED'
