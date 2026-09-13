-- Tenant-isolation tests for Milestone 03 (products).
--
-- Verifies that Organization A cannot read or write Organization B's products,
-- even through direct SQL, when acting as the `authenticated` role with A's JWT.
--
-- On plain PostgreSQL, apply 00_supabase_shim.sql, 0001_multi_tenancy.sql and
-- 0002_products.sql first. Run with ON_ERROR_STOP so a failed ASSERT aborts
-- with a non-zero exit code.

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

-- Seed one product per org as a privileged role.
insert into public.products (organization_id, name, price, sku)
values
  (current_setting('test.org_a')::uuid, 'A Widget', 100.00, 'A-1'),
  (current_setting('test.org_b')::uuid, 'B Widget', 200.00, 'B-1');

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
  -- Sees only own products.
  select count(*) into c from public.products;
  assert c = 1, format('userA should see 1 product, saw %s', c);

  select count(*) into c from public.products where organization_id = b_org;
  assert c = 0, format('userA must not see org B products, saw %s', c);

  -- Can create a product in own org.
  insert into public.products (organization_id, name, price) values (a_org, 'A Second', 50);

  -- Cannot update org B's product (row invisible: 0 updated).
  with upd as (
    update public.products set name = 'HACKED' where organization_id = b_org returning 1
  )
  select count(*) into c from upd;
  assert c = 0, format('userA must not update org B products, updated %s', c);

  -- Cannot delete org B's product (0 deleted).
  with del as (
    delete from public.products where organization_id = b_org returning 1
  )
  select count(*) into c from del;
  assert c = 0, format('userA must not delete org B products, deleted %s', c);

  -- Cannot insert a product into org B (RLS insert policy blocks it).
  begin
    insert into public.products (organization_id, name, price) values (b_org, 'Intruder', 1);
    assert false, 'userA insert into org B products should have been blocked';
  exception
    when insufficient_privilege then null; -- expected: RLS violation
  end;
end $$;

reset role;

-- Confirm (privileged) that org B's product was untouched.
do $$
declare c int;
begin
  select count(*) into c from public.products where name = 'HACKED';
  assert c = 0, 'org B product must not have been modified';
  select count(*) into c from public.products
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 1, format('org B should still have exactly 1 product, has %s', c);
end $$;

rollback;

\echo 'PRODUCTS ISOLATION TESTS PASSED'
