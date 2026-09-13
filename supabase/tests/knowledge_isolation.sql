-- Tenant-isolation tests for Milestone 04 (knowledge base + retrieval).
--
-- The top risk in this milestone is cross-tenant RAG leakage: retrieval that
-- returns another organization's chunks. These tests prove that
-- match_knowledge_chunks cannot be abused, even when called with a FOREIGN
-- organization id, because it is SECURITY INVOKER and RLS gates the rows.
--
-- On plain PostgreSQL, apply 00_supabase_shim.sql and migrations 0001..0004
-- first. Run with ON_ERROR_STOP.

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

-- Seed one document + one chunk per org as a privileged role.
-- Embeddings: org A leans on dimension 0, org B on dimension 1.
insert into public.knowledge_documents (id, organization_id, title, content, status)
values
  ('00000000-0000-0000-0000-0000000000d1', current_setting('test.org_a')::uuid,
   'A policy', 'Org A delivers within Lagos in two days.', 'ready'),
  ('00000000-0000-0000-0000-0000000000d2', current_setting('test.org_b')::uuid,
   'B policy', 'Org B secret pricing for wholesale partners.', 'ready');

insert into public.knowledge_chunks
  (organization_id, document_id, chunk_index, content, embedding)
values
  (current_setting('test.org_a')::uuid,
   '00000000-0000-0000-0000-0000000000d1', 0,
   'Org A delivers within Lagos in two days.',
   (select ('[' || '1' || repeat(',0', 1023) || ']')::vector)),
  (current_setting('test.org_b')::uuid,
   '00000000-0000-0000-0000-0000000000d2', 0,
   'Org B secret pricing for wholesale partners.',
   (select ('[0,1' || repeat(',0', 1022) || ']')::vector));

-- Sanity (privileged): both chunks exist.
do $$
declare c int;
begin
  select count(*) into c from public.knowledge_chunks;
  assert c = 2, format('expected 2 seeded chunks, saw %s', c);
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
  -- A query vector pointing at org B's chunk.
  b_query vector := ('[0,1' || repeat(',0', 1022) || ']')::vector;
  leaked text;
begin
  -- Reads: sees only own documents/chunks.
  select count(*) into c from public.knowledge_documents;
  assert c = 1, format('userA should see 1 document, saw %s', c);

  select count(*) into c from public.knowledge_chunks;
  assert c = 1, format('userA should see 1 chunk, saw %s', c);

  select count(*) into c from public.knowledge_chunks where organization_id = b_org;
  assert c = 0, format('userA must not see org B chunks, saw %s', c);

  -- Retrieval scoped to own org works.
  select count(*) into c from public.match_knowledge_chunks(a_org, b_query, 5);
  assert c = 1, format('retrieval in own org should return 1 row, got %s', c);

  -- CRITICAL: calling retrieval with org B's id must return nothing,
  -- even though the query vector is an exact match for org B's chunk.
  select count(*) into c from public.match_knowledge_chunks(b_org, b_query, 5);
  assert c = 0, format('cross-tenant retrieval must return 0 rows, got %s', c);

  -- And nothing returned anywhere contains org B's content.
  select string_agg(content, ' ') into leaked
  from public.match_knowledge_chunks(a_org, b_query, 20);
  assert leaked is null or leaked not like '%secret pricing%',
    'org B content leaked through retrieval';

  -- Writes: cannot insert a chunk into org B.
  begin
    insert into public.knowledge_chunks
      (organization_id, document_id, chunk_index, content)
    values (b_org, '00000000-0000-0000-0000-0000000000d2', 99, 'intruder');
    assert false, 'userA insert into org B chunks should have been blocked';
  exception
    when insufficient_privilege then null; -- expected: RLS violation
  end;

  -- Writes: cannot update or delete org B's document.
  with upd as (
    update public.knowledge_documents set title = 'HACKED'
    where organization_id = b_org returning 1
  )
  select count(*) into c from upd;
  assert c = 0, format('userA must not update org B documents, updated %s', c);
end $$;

reset role;

-- Confirm (privileged) org B's data is intact.
do $$
declare c int;
begin
  select count(*) into c from public.knowledge_documents where title = 'HACKED';
  assert c = 0, 'org B document must not have been modified';
  select count(*) into c from public.knowledge_chunks
  where organization_id = current_setting('test.org_b')::uuid;
  assert c = 1, format('org B should still have exactly 1 chunk, has %s', c);
end $$;

rollback;

\echo 'KNOWLEDGE ISOLATION TESTS PASSED'
