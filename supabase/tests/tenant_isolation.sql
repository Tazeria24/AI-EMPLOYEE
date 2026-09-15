-- Tenant-isolation tests for Milestone 02.
--
-- Verifies that Organization A cannot read or write Organization B data, even
-- through direct SQL, when acting as the `authenticated` role with A's JWT.
--
-- Run with ON_ERROR_STOP so any failed ASSERT (or a write that should have been
-- blocked but wasn't) aborts with a non-zero exit code. On plain PostgreSQL,
-- apply 00_supabase_shim.sql and the migrations first (see run instructions in
-- progress/TEST_RESULTS.md).

\set ON_ERROR_STOP on

begin;

-- Seed two users as a privileged role; the signup trigger provisions an
-- organization, owner membership and business profile for each.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- Stash each user's org id in a transaction-local GUC (readable by any role).
select set_config('test.org_a',
  (select o.id::text from public.organizations o
   join public.organization_members m on m.organization_id = o.id
   where m.user_id = '00000000-0000-0000-0000-00000000000a'::uuid), true);
select set_config('test.org_b',
  (select o.id::text from public.organizations o
   join public.organization_members m on m.organization_id = o.id
   where m.user_id = '00000000-0000-0000-0000-00000000000b'::uuid), true);

-- Sanity (privileged): both orgs and profiles exist.
do $$
declare c int;
begin
  select count(*) into c from public.organizations;
  assert c = 2, format('expected 2 orgs seeded, saw %s', c);
  select count(*) into c from public.business_profiles;
  assert c = 2, format('expected 2 business profiles seeded, saw %s', c);
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
begin
  -- Reads: sees only own tenant's rows.
  select count(*) into c from public.organizations;
  assert c = 1, format('userA should see 1 org, saw %s', c);

  select count(*) into c from public.organizations where id = b_org;
  assert c = 0, format('userA must not see org B, saw %s', c);

  select count(*) into c from public.organization_members;
  assert c = 1, format('userA should see only own membership, saw %s', c);

  select count(*) into c from public.business_profiles;
  assert c = 1, format('userA should see only own business profile, saw %s', c);

  -- Write: can update OWN business profile.
  with upd as (
    update public.business_profiles set business_name = 'A Corp'
    where organization_id = a_org returning 1
  )
  select count(*) into c from upd;
  assert c = 1, format('userA should update own business profile, updated %s', c);

  -- Write: cannot update org B (RLS filters the row out; 0 updated).
  with upd as (
    update public.business_profiles set business_name = 'HACKED'
    where organization_id = b_org returning 1
  )
  select count(*) into c from upd;
  assert c = 0, format('userA must not update org B profile, updated %s', c);

  -- Write: cannot insert a membership into org B (RLS insert policy blocks it).
  begin
    insert into public.organization_members (organization_id, user_id, role)
    values (b_org, auth.uid(), 'member');
    assert false, 'userA insert into org B membership should have been blocked';
  exception
    when insufficient_privilege then null; -- expected: RLS violation
  end;
end $$;

reset role;

-- Confirm (privileged) that the malicious update never landed.
do $$
declare bad int;
begin
  select count(*) into bad from public.business_profiles where business_name = 'HACKED';
  assert bad = 0, 'org B business profile must not have been modified';
end $$;

rollback;

\echo 'TENANT ISOLATION TESTS PASSED'
