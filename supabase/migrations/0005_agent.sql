-- Milestone 05 — tables the AI agent writes to.
--
-- tasks/05 requires a create_lead tool, but leads (and the customers they
-- belong to) are not scheduled until Milestones 06/07. A tool with nowhere to
-- write would have to invent or drop data, so customers + leads + lead_events
-- are created here per docs/DATABASE.md; M06/M07 build the inbox and pipeline
-- UI on top. agent_runs is the logging requirement from tasks/05.
--
-- leads.conversation_id is deliberately an unconstrained uuid for now: the
-- conversations table arrives in M06, which adds the foreign key.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text,
  email text,
  phone text,
  external_channel text,
  external_customer_id text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_organization_id_idx on public.customers (organization_id);
create index customers_organization_created_idx
  on public.customers (organization_id, created_at desc);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  conversation_id uuid, -- FK added in Milestone 06 with the conversations table
  status text not null default 'NEW'
    check (status in ('NEW', 'CONTACTED', 'INTERESTED', 'NEGOTIATING', 'WON', 'LOST')),
  source text,
  score integer check (score is null or (score >= 0 and score <= 100)),
  intent text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_organization_id_idx on public.leads (organization_id);
create index leads_organization_status_idx on public.leads (organization_id, status);
create index leads_customer_id_idx on public.leads (customer_id);

create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  event_type text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index lead_events_lead_created_idx on public.lead_events (lead_id, created_at desc);
create index lead_events_organization_id_idx on public.lead_events (organization_id);

-- Per-turn agent log: what was asked, which tools ran, what it cost, and
-- whether a guardrail blocked the reply.
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  model text not null,
  user_message text not null,
  reply text,
  tool_calls jsonb not null default '[]'::jsonb,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  latency_ms integer not null default 0,
  escalated boolean not null default false,
  blocked_reason text,
  status text not null default 'ok' check (status in ('ok', 'blocked', 'error')),
  created_at timestamptz not null default now()
);

create index agent_runs_organization_created_idx
  on public.agent_runs (organization_id, created_at desc);

create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (members read; owner/admin write) — ADR-024
-- ---------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.agent_runs enable row level security;

create policy customers_select_member on public.customers
  for select using (public.is_org_member(organization_id));
create policy customers_insert_admin on public.customers
  for insert with check (public.is_org_admin(organization_id));
create policy customers_update_admin on public.customers
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy customers_delete_admin on public.customers
  for delete using (public.is_org_admin(organization_id));

create policy leads_select_member on public.leads
  for select using (public.is_org_member(organization_id));
create policy leads_insert_admin on public.leads
  for insert with check (public.is_org_admin(organization_id));
create policy leads_update_admin on public.leads
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy leads_delete_admin on public.leads
  for delete using (public.is_org_admin(organization_id));

create policy lead_events_select_member on public.lead_events
  for select using (public.is_org_member(organization_id));
create policy lead_events_insert_admin on public.lead_events
  for insert with check (public.is_org_admin(organization_id));

create policy agent_runs_select_member on public.agent_runs
  for select using (public.is_org_member(organization_id));
create policy agent_runs_insert_admin on public.agent_runs
  for insert with check (public.is_org_admin(organization_id));

grant select, insert, update, delete
  on public.customers, public.leads
  to authenticated;
grant select, insert on public.lead_events, public.agent_runs to authenticated;
