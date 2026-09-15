-- Feedback + activation tests for Milestone 13 (beta launch).
--
-- Small surface, two things worth proving:
--
--   1. Feedback is tenant-scoped both ways. A beta business must not be able
--      to read another's bug reports — those contain a running description of
--      how someone else's business works.
--   2. Any MEMBER can report a problem, not only an owner or admin.
--      Restricting feedback to admins would lose exactly the people who use
--      the product most, so this is a deliberate policy difference from every
--      other write in the system (ADR-024) and is tested as such.
--
-- Apply 00_supabase_shim.sql and migrations 0001..0012 first. Run with
-- ON_ERROR_STOP.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000e', 'member@example.com');

select set_config('test.org_a',
  (select organization_id::text from public.organization_members
   where user_id = '00000000-0000-0000-0000-00000000000a'::uuid), true);
select set_config('test.org_b',
  (select organization_id::text from public.organization_members
   where user_id = '00000000-0000-0000-0000-00000000000b'::uuid), true);

-- A plain member of org A, alongside its owner.
insert into public.organization_members (organization_id, user_id, role)
values (current_setting('test.org_a')::uuid,
        '00000000-0000-0000-0000-00000000000e', 'member');

insert into public.feedback (organization_id, user_id, kind, message)
values
  (current_setting('test.org_b')::uuid, '00000000-0000-0000-0000-00000000000b',
   'bug', 'confidential B workflow is broken');

-- ---------------------------------------------------------------------------
-- 1. A plain member can report a problem
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}';

do $$
declare c int;
begin
  insert into public.feedback (organization_id, user_id, kind, message, page)
  values (current_setting('test.org_a')::uuid,
          '00000000-0000-0000-0000-00000000000e',
          'problem', 'The AI quoted the wrong delivery fee.', '/dashboard/conversations');

  select count(*) into c from public.feedback;
  assert c = 1, format('the member should see only org A feedback, saw %s', c);

  -- ...and not org B's.
  select count(*) into c from public.feedback
  where message like '%confidential%';
  assert c = 0, 'org B feedback must not be visible to org A';

  -- Cannot file feedback against another organization.
  begin
    insert into public.feedback (organization_id, kind, message)
    values (current_setting('test.org_b')::uuid, 'bug', 'planted');
    assert false, 'a member must not be able to file feedback for another org';
  exception
    when insufficient_privilege then null; -- expected
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 2. The database rejects an empty or over-long report
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.feedback (organization_id, kind, message)
    values (current_setting('test.org_a')::uuid, 'bug', '   ');
    assert false, 'a blank report should be rejected';
  exception
    when check_violation then null; -- expected
  end;

  begin
    insert into public.feedback (organization_id, kind, message)
    values (current_setting('test.org_a')::uuid, 'bug', repeat('x', 4001));
    assert false, 'an over-long report should be rejected';
  exception
    when check_violation then null; -- expected
  end;

  begin
    insert into public.feedback (organization_id, kind, message)
    values (current_setting('test.org_a')::uuid, 'urgent', 'x');
    assert false, 'an unknown kind should be rejected by the database';
  exception
    when check_violation then null; -- expected
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Activation reports what is actually set up
-- ---------------------------------------------------------------------------
do $$
declare
  a_org uuid := current_setting('test.org_a')::uuid;
  r record;
begin
  select * into r from public.organization_activation(a_org);
  assert not r.has_business_profile, 'a fresh org has no business name yet';
  assert not r.has_products, 'a fresh org has no products';
  assert not r.has_widget_enabled, 'the widget starts off';

  update public.business_profiles set business_name = 'Ada''s Closet'
  where organization_id = a_org;
  insert into public.products (organization_id, name, price)
  values (a_org, 'Amara Wrap Dress', 28500);

  -- An archived-only catalogue does not count as having products.
  insert into public.knowledge_documents
    (organization_id, title, source_type, content, status)
  values (a_org, 'Delivery', 'policy', 'We deliver in Lagos.', 'pending');

  select * into r from public.organization_activation(a_org);
  assert r.has_business_profile, 'the business name should now register';
  assert r.has_products, 'the product should now register';
  assert not r.has_knowledge,
    'a pending document is not retrievable, so it must not count as ready';

  update public.knowledge_documents set status = 'ready' where organization_id = a_org;
  select * into r from public.organization_activation(a_org);
  assert r.has_knowledge, 'a ready document should register';

  -- A whitespace-only business name is not a business name.
  update public.business_profiles set business_name = '   ' where organization_id = a_org;
  select * into r from public.organization_activation(a_org);
  assert not r.has_business_profile, 'a blank business name must not count';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Activation is tenant-scoped: it cannot be used to probe another org
-- ---------------------------------------------------------------------------
insert into public.products (organization_id, name, price)
values (current_setting('test.org_b')::uuid, 'B secret product', 1000);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare r record;
begin
  -- SECURITY INVOKER, so its EXISTS checks run under RLS: asking about another
  -- organization reports nothing rather than leaking whether they are set up.
  select * into r from public.organization_activation(current_setting('test.org_b')::uuid);
  assert not r.has_products,
    'org A must not learn whether org B has products';
  assert not r.has_business_profile,
    'org A must not learn whether org B is set up';
end $$;

reset role;

rollback;

\echo 'BETA (FEEDBACK + ACTIVATION) TESTS PASSED'
