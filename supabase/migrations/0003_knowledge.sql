-- Milestone 04 — Knowledge Base
-- Verified business knowledge (FAQs, policies, documents), chunked and
-- embedded for pgvector retrieval. Organization-scoped and protected by RLS
-- with the same role model as the rest of the app (members read; owner/admin
-- write). Reuses set_updated_at(), is_org_member() and is_org_admin().
--
-- Embedding dimensions are pinned at 1536 (see ADR-029). Changing the
-- embedding provider to one with different dimensions requires a migration
-- that alters this column and re-embeds all chunks.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  source_type text not null default 'document'
    check (source_type in ('faq', 'policy', 'document')),
  source_url text,
  content text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'error')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_documents_organization_id_idx
  on public.knowledge_documents (organization_id);
create index knowledge_documents_organization_status_idx
  on public.knowledge_documents (organization_id, status);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_id uuid not null references public.knowledge_documents (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index knowledge_chunks_organization_id_idx
  on public.knowledge_chunks (organization_id);
create index knowledge_chunks_document_id_idx
  on public.knowledge_chunks (document_id);
-- Approximate nearest-neighbour index for cosine similarity.
create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);

create trigger knowledge_documents_set_updated_at before update on public.knowledge_documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (members read; owner/admin write)
-- ---------------------------------------------------------------------------
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;

create policy knowledge_documents_select_member on public.knowledge_documents
  for select using (public.is_org_member(organization_id));
create policy knowledge_documents_insert_admin on public.knowledge_documents
  for insert with check (public.is_org_admin(organization_id));
create policy knowledge_documents_update_admin on public.knowledge_documents
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy knowledge_documents_delete_admin on public.knowledge_documents
  for delete using (public.is_org_admin(organization_id));

create policy knowledge_chunks_select_member on public.knowledge_chunks
  for select using (public.is_org_member(organization_id));
create policy knowledge_chunks_insert_admin on public.knowledge_chunks
  for insert with check (public.is_org_admin(organization_id));
create policy knowledge_chunks_update_admin on public.knowledge_chunks
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy knowledge_chunks_delete_admin on public.knowledge_chunks
  for delete using (public.is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- Retrieval
--
-- SECURITY INVOKER is deliberate: RLS on knowledge_chunks is evaluated as the
-- caller, so passing another organization's id returns nothing. The org id is
-- an index/scoping hint, never the authorization boundary.
-- ---------------------------------------------------------------------------
create or replace function public.match_knowledge_chunks(
  p_organization_id uuid,
  p_query_embedding vector(1536),
  p_match_count integer default 5
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index integer,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.document_id,
    c.chunk_index,
    c.content,
    (1 - (c.embedding <=> p_query_embedding))::double precision as similarity
  from public.knowledge_chunks c
  where c.organization_id = p_organization_id
    and c.embedding is not null
  order by c.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 5), 20));
$$;

-- ---------------------------------------------------------------------------
-- Grants (rows still gated by RLS; anon gets no access)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete
  on public.knowledge_documents, public.knowledge_chunks
  to authenticated;
grant execute on function public.match_knowledge_chunks(uuid, vector, integer)
  to authenticated;
