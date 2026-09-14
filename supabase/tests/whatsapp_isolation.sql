-- Tenant isolation + webhook replay tests for Milestone 10 (WhatsApp).
--
-- Two properties carry this milestone, and neither is safe to leave to
-- application code:
--
--   1. **Replay protection** — planning audit finding #13. Meta redelivers a
--      callback after any non-200, so duplicates are ordinary traffic. A
--      unique (provider, external_event_id) makes a second delivery
--      impossible to record, and claim_integration_event() turns that
--      constraint into an atomic "is this new?" test that two concurrent
--      deliveries resolve the same way.
--
--   2. **Credentials the dashboard can write but never read.** An access token
--      can send messages as the business, so `verify_token`, `app_secret` and
--      `access_token` carry no SELECT grant for `authenticated` at all. That
--      is a privilege error, not a column someone has to remember to omit.
--
-- Apply 00_supabase_shim.sql and migrations 0001..0009 first. Run with
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

update public.whatsapp_integrations
  set phone_number_id = 'PHONE_A',
      waba_id = 'WABA_A',
      verify_token = 'verify-token-a',
      app_secret = 'app-secret-a-confidential',
      access_token = 'access-token-a-confidential',
      enabled = true
where organization_id = current_setting('test.org_a')::uuid;

update public.whatsapp_integrations
  set phone_number_id = 'PHONE_B',
      waba_id = 'WABA_B',
      verify_token = 'verify-token-b',
      app_secret = 'app-secret-b-confidential',
      access_token = 'access-token-b-confidential',
      enabled = true
where organization_id = current_setting('test.org_b')::uuid;

-- ---------------------------------------------------------------------------
-- 1. Every organization gets an integration row, switched OFF by default
-- ---------------------------------------------------------------------------
do $$
declare
  c int;
  org uuid;
begin
  select count(*) into c from public.whatsapp_integrations;
  assert c = 2, format('each organization should have one integration, found %s', c);

  -- A brand-new organization must start disabled: connecting production
  -- WhatsApp is a deliberate act, never a default.
  insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-00000000000c', 'c@example.com');

  select organization_id into org from public.organization_members
  where user_id = '00000000-0000-0000-0000-00000000000c'::uuid;

  select count(*) into c from public.whatsapp_integrations
  where organization_id = org and enabled = false;
  assert c = 1, 'a new organization must get a disabled WhatsApp integration';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Replay protection (audit finding #13)
-- ---------------------------------------------------------------------------
do $$
declare
  a_org uuid := current_setting('test.org_a')::uuid;
  first_id uuid;
  second_id uuid;
  c int;
begin
  -- First delivery of this Meta message id: claimed.
  select public.claim_integration_event(
    a_org, 'whatsapp', 'wamid.REPLAY1', 'message.text', '{"from":"234"}'::jsonb
  ) into first_id;
  assert first_id is not null, 'the first delivery must be claimed';

  -- Meta redelivers the same event: claimed by nobody, so no second reply.
  select public.claim_integration_event(
    a_org, 'whatsapp', 'wamid.REPLAY1', 'message.text', '{"from":"234"}'::jsonb
  ) into second_id;
  assert second_id is null,
    format('a redelivered event must not be claimed, got %s', second_id);

  select count(*) into c from public.integration_events
  where external_event_id = 'wamid.REPLAY1';
  assert c = 1, format('a redelivery must not create a second row, found %s', c);

  -- The constraint is the mechanism, so a direct insert is refused too.
  begin
    insert into public.integration_events
      (organization_id, provider, external_event_id)
    values (a_org, 'whatsapp', 'wamid.REPLAY1');
    assert false, 'a duplicate external_event_id should have been rejected';
  exception
    when unique_violation then null; -- expected
  end;

  -- Cross-tenant replay is refused as well: the id is unique per provider, so
  -- another organization cannot re-submit a captured event id.
  begin
    insert into public.integration_events
      (organization_id, provider, external_event_id)
    values (current_setting('test.org_b')::uuid, 'whatsapp', 'wamid.REPLAY1');
    assert false, 'a cross-tenant replay should have been rejected';
  exception
    when unique_violation then null; -- expected
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 3. One customer per WhatsApp number, so a conversation cannot fork
-- ---------------------------------------------------------------------------
do $$
declare a_org uuid := current_setting('test.org_a')::uuid;
begin
  insert into public.customers
    (organization_id, name, external_channel, external_customer_id)
  values (a_org, 'Ada', 'whatsapp', '2348111111111');

  begin
    insert into public.customers
      (organization_id, name, external_channel, external_customer_id)
    values (a_org, 'Ada again', 'whatsapp', '2348111111111');
    assert false, 'a duplicate WhatsApp identity should have been rejected';
  exception
    when unique_violation then null; -- expected
  end;

  -- The same number at a different business is a different person to us.
  insert into public.customers
    (organization_id, name, external_channel, external_customer_id)
  values (current_setting('test.org_b')::uuid, 'Ada at B', 'whatsapp', '2348111111111');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Credentials are write-only for the dashboard role
-- ---------------------------------------------------------------------------
do $$
declare col text;
begin
  foreach col in array array['verify_token', 'app_secret', 'access_token'] loop
    assert not has_column_privilege(
      'authenticated', 'public.whatsapp_integrations', col, 'select'),
      format('authenticated must NOT be able to select %s', col);
    assert has_column_privilege(
      'authenticated', 'public.whatsapp_integrations', col, 'update'),
      format('authenticated must still be able to set %s', col);
  end loop;

  -- The non-secret columns stay readable.
  assert has_column_privilege(
    'authenticated', 'public.whatsapp_integrations', 'phone_number_id', 'select'),
    'authenticated should be able to read phone_number_id';

  -- anon gets nothing at all: the webhook authenticates with a signature.
  assert not has_table_privilege('anon', 'public.whatsapp_integrations', 'select'),
    'anon must not read whatsapp_integrations';
  assert not has_table_privilege('anon', 'public.integration_events', 'select'),
    'anon must not read integration_events';
  assert not has_table_privilege('anon', 'public.whatsapp_integration_status', 'select'),
    'anon must not read the integration status view';
  assert not has_function_privilege(
    'anon', 'public.claim_integration_event(uuid, text, text, text, jsonb)', 'execute'),
    'anon must not be able to claim integration events';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Dashboard-side tenant isolation, acting as user A
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare
  c int;
  leaked text;
begin
  -- Reading a secret column is a privilege error, not an empty result.
  begin
    execute 'select app_secret from public.whatsapp_integrations' into leaked;
    assert false, 'selecting app_secret should have been refused';
  exception
    when insufficient_privilege then null; -- expected
  end;

  begin
    execute 'select access_token from public.whatsapp_integrations' into leaked;
    assert false, 'selecting access_token should have been refused';
  exception
    when insufficient_privilege then null; -- expected
  end;

  -- The status view answers "is it set?" without ever returning the value.
  select count(*) into c from public.whatsapp_integration_status;
  assert c = 1, format('userA should see exactly one integration status, saw %s', c);

  select count(*) into c from public.whatsapp_integration_status
  where has_app_secret and has_access_token and has_verify_token;
  assert c = 1, 'userA should see their own credentials reported as set';

  -- ...and it is tenant-scoped, even though it runs as its owner.
  select count(*) into c from public.whatsapp_integration_status
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 0, 'the status view must not expose org B';

  select count(*) into c from public.whatsapp_integrations
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 0, 'userA must not see org B integration rows';

  with upd as (
    update public.whatsapp_integrations set enabled = false
    where organization_id = current_setting('test.org_b')::uuid
    returning 1
  )
  select count(*) into c from upd;
  assert c = 0, format('userA must not change org B integration, updated %s', c);

  select count(*) into c from public.integration_events
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 0, 'userA must not see org B integration events';

  select count(*) into c from public.customers
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 0, 'userA must not see org B customers';
end $$;

reset role;

-- Confirm (privileged) org B is untouched.
do $$
declare e boolean;
begin
  select enabled into e from public.whatsapp_integrations
  where organization_id = current_setting('test.org_b')::uuid;
  assert e is true, 'org B integration must still be enabled';
end $$;

rollback;

\echo 'WHATSAPP ISOLATION + REPLAY PROTECTION TESTS PASSED'
