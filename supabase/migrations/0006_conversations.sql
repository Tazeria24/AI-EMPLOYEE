-- Milestone 06 — Conversations
--
-- The internal inbox: persistent conversations, messages, and the
-- AI_ACTIVE / HUMAN_ACTIVE / CLOSED state machine with human takeover.
--
-- The important part of this migration is append_ai_message(). Checking the
-- conversation state in application code before inserting an AI reply is a
-- race: a human can take over between the check and the insert, and the
-- customer then sees two voices answering at once. The check and the insert
-- happen here instead, under a row lock on the conversation, so takeover and
-- "AI posts a reply" are serialized by the database.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  channel text not null default 'widget'
    check (channel in ('widget', 'whatsapp', 'manual')),
  status text not null default 'AI_ACTIVE'
    check (status in ('AI_ACTIVE', 'HUMAN_ACTIVE', 'CLOSED')),
  assigned_to uuid references auth.users (id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index conversations_organization_recent_idx
  on public.conversations (organization_id, last_message_at desc);
create index conversations_organization_status_idx
  on public.conversations (organization_id, status);
create index conversations_customer_id_idx on public.conversations (customer_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_type text not null
    check (sender_type in ('customer', 'ai', 'human', 'system')),
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index messages_organization_created_idx
  on public.messages (organization_id, created_at desc);

create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

-- Close the foreign key deferred in migration 0005 (ADR-034): conversations
-- did not exist yet when leads was created.
alter table public.leads
  add constraint leads_conversation_id_fkey
  foreign key (conversation_id) references public.conversations (id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- Row Level Security (members read; owner/admin write) — ADR-024
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy conversations_select_member on public.conversations
  for select using (public.is_org_member(organization_id));
create policy conversations_insert_admin on public.conversations
  for insert with check (public.is_org_admin(organization_id));
create policy conversations_update_admin on public.conversations
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy conversations_delete_admin on public.conversations
  for delete using (public.is_org_admin(organization_id));

create policy messages_select_member on public.messages
  for select using (public.is_org_member(organization_id));
create policy messages_insert_admin on public.messages
  for insert with check (public.is_org_admin(organization_id));

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic AI reply (the takeover race fix)
--
-- SECURITY INVOKER so RLS still applies to the caller (ADR-031). Returns the
-- new message id, or NULL when the conversation is no longer AI_ACTIVE — in
-- which case nothing is written and the caller must discard the reply.
-- ---------------------------------------------------------------------------
create or replace function public.append_ai_message(
  p_conversation_id uuid,
  p_content text,
  p_metadata jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_organization_id uuid;
  v_message_id uuid;
begin
  -- Row lock: a concurrent takeover must wait here, and whichever transaction
  -- commits first decides the outcome.
  select status, organization_id
    into v_status, v_organization_id
  from public.conversations
  where id = p_conversation_id
  for update;

  if not found then
    return null;
  end if;

  if v_status is distinct from 'AI_ACTIVE' then
    return null; -- a human owns this conversation, or it is closed
  end if;

  insert into public.messages
    (organization_id, conversation_id, sender_type, content, metadata)
  values
    (v_organization_id, p_conversation_id, 'ai', p_content, p_metadata)
  returning id into v_message_id;

  update public.conversations
  set last_message_at = now()
  where id = p_conversation_id;

  return v_message_id;
end;
$$;

grant execute on function public.append_ai_message(uuid, text, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime. Supabase streams changes through the `supabase_realtime`
-- publication; it does not exist on a plain PostgreSQL instance, so the local
-- isolation suites would fail without this guard.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.messages';
    execute 'alter publication supabase_realtime add table public.conversations';
  end if;
end
$$;
