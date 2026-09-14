-- Milestone 08 — Automations
--
-- Controlled lead follow-up. The important part of this migration is that the
-- "at most two automated follow-ups per lead" rule is a database constraint,
-- not an application check.
--
-- Planning audit finding #11: "a bug or misconfig sends repeated follow-ups;
-- the business gets reported for spam." A scheduler that retries, two cron
-- firings overlapping, or a worker crashing mid-run all defeat an application
-- level "have we already sent two?" check — the same class of bug as the
-- takeover race in 0006. So:
--
--   * follow_up_number is constrained to 1 or 2, so there is no valid third
--   * (lead_id, follow_up_number) is unique, so a retry collides instead of
--     sending a second copy
--   * a run may only reach status 'sent' if it carries a number
--
-- Together those make a third follow-up, or a duplicate of an existing one,
-- impossible to record regardless of what the application does.

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  trigger_type text not null default 'lead_inactive'
    check (trigger_type in ('lead_inactive')),
  conditions jsonb not null default '{}'::jsonb,
  action_type text not null default 'ai_followup'
    check (action_type in ('ai_followup')),
  action_config jsonb not null default '{}'::jsonb,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index automations_organization_id_idx on public.automations (organization_id);
create index automations_enabled_idx on public.automations (organization_id, enabled);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  automation_id uuid not null references public.automations (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'running', 'sent', 'failed', 'skipped')),
  -- 1 or 2. There is deliberately no third value.
  follow_up_number smallint
    check (follow_up_number is null or (follow_up_number >= 1 and follow_up_number <= 2)),
  channel text check (channel is null or channel in ('conversation', 'email')),
  scheduled_for timestamptz not null default now(),
  executed_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  -- A run that actually went out must be numbered, so 'sent' rows are always
  -- covered by the unique index below.
  constraint automation_runs_sent_requires_number
    check (status <> 'sent' or follow_up_number is not null)
);

-- The cap and idempotency in one constraint: at most one run per
-- (lead, follow-up number), and only numbers 1 and 2 exist.
create unique index automation_runs_lead_followup_key
  on public.automation_runs (lead_id, follow_up_number)
  where follow_up_number is not null;

create index automation_runs_due_idx
  on public.automation_runs (status, scheduled_for)
  where status = 'scheduled';
create index automation_runs_organization_created_idx
  on public.automation_runs (organization_id, created_at desc);
create index automation_runs_lead_idx on public.automation_runs (lead_id);

create trigger automations_set_updated_at before update on public.automations
  for each row execute function public.set_updated_at();

-- Customers can opt out of automated follow-up. This is a column the
-- eligibility query filters on, not a UI-only courtesy.
alter table public.customers
  add column marketing_opt_out boolean not null default false;

-- ---------------------------------------------------------------------------
-- Row Level Security (members read; owner/admin write) — ADR-024
-- ---------------------------------------------------------------------------
alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;

create policy automations_select_member on public.automations
  for select using (public.is_org_member(organization_id));
create policy automations_insert_admin on public.automations
  for insert with check (public.is_org_admin(organization_id));
create policy automations_update_admin on public.automations
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy automations_delete_admin on public.automations
  for delete using (public.is_org_admin(organization_id));

create policy automation_runs_select_member on public.automation_runs
  for select using (public.is_org_member(organization_id));
create policy automation_runs_insert_admin on public.automation_runs
  for insert with check (public.is_org_admin(organization_id));
create policy automation_runs_update_admin on public.automation_runs
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

grant select, insert, update, delete on public.automations to authenticated;
grant select, insert, update on public.automation_runs to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic run claim.
--
-- A conditional UPDATE is atomic, so of two workers racing for the same
-- scheduled run exactly one gets a row back and the other gets nothing.
-- SECURITY INVOKER so RLS still applies (ADR-031).
-- ---------------------------------------------------------------------------
create or replace function public.claim_automation_run(p_run_id uuid)
returns uuid
language sql
security invoker
set search_path = public
as $$
  update public.automation_runs
  set status = 'running'
  where id = p_run_id
    and status = 'scheduled'
  returning id;
$$;

grant execute on function public.claim_automation_run(uuid) to authenticated;
