-- Milestone 05 — switch embeddings to Voyage AI `voyage-4` (ADR-009).
--
-- Anthropic does not offer a first-party embedding model and recommends Voyage
-- AI. voyage-4 emits 1024-dimension vectors (default), not the 1536 pinned by
-- ADR-029, so the column must change and every chunk must be re-embedded.
--
-- Voyage vectors are unit-normalized, so cosine distance and dot product agree:
-- the HNSW cosine index and match_knowledge_chunks are unchanged apart from the
-- dimension, and the RPC stays SECURITY INVOKER (ADR-031).
--
-- Vectors produced by a different model are meaningless under the new one, so
-- existing chunks are discarded and their documents are reset to 'pending' for
-- re-indexing. Safe now: there is no production data.

delete from public.knowledge_chunks;

update public.knowledge_documents
set status = 'pending', error = null
where status <> 'pending';

drop index if exists public.knowledge_chunks_embedding_idx;

alter table public.knowledge_chunks
  alter column embedding type vector(1024);

create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);

create or replace function public.match_knowledge_chunks(
  p_organization_id uuid,
  p_query_embedding vector(1024),
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

grant execute on function public.match_knowledge_chunks(uuid, vector, integer)
  to authenticated;
