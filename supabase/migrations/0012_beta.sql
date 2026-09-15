-- Milestone 13 — Beta launch
--
-- Two small additions, both from tasks/13:
--
--   - **feedback capture**, so a beta business can report a problem from
--     inside the product rather than having to find the founder. Without this,
--     the feedback you get is the feedback from people who already have your
--     phone number, which is a biased sample of your beta.
--
--   - **an activation record**, so "can a business onboard without founder
--     intervention?" is a question the data answers rather than one the
--     founder has to ask each of them.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null default 'general'
    check (kind in ('general', 'bug', 'idea', 'problem')),
  message text not null check (length(btrim(message)) between 1 and 4000),
  -- Which page they were on. Useful context, and not personal data.
  page text,
  status text not null default 'new'
    check (status in ('new', 'seen', 'resolved')),
  created_at timestamptz not null default now()
);

create index feedback_org_created_idx
  on public.feedback (organization_id, created_at desc);
create index feedback_status_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

-- Any member may report a problem — restricting feedback to admins would lose
-- exactly the people who use the product most.
create policy feedback_insert_member on public.feedback
  for insert with check (public.is_org_member(organization_id));
create policy feedback_select_member on public.feedback
  for select using (public.is_org_member(organization_id));

grant select, insert on public.feedback to authenticated;

-- ---------------------------------------------------------------------------
-- Activation
--
-- A single function rather than six counts in the application, so the
-- dashboard, a future admin view and any reporting all agree on what "set up"
-- means.
-- ---------------------------------------------------------------------------
create or replace function public.organization_activation(p_organization_id uuid)
returns table (
  has_business_profile boolean,
  has_products boolean,
  has_knowledge boolean,
  has_widget_enabled boolean,
  has_conversation boolean,
  has_lead boolean
)
language sql
security invoker
set search_path = public
stable
as $$
  select
    exists (
      select 1 from public.business_profiles bp
      where bp.organization_id = p_organization_id
        and coalesce(btrim(bp.business_name), '') <> ''
    ),
    exists (
      select 1 from public.products p
      where p.organization_id = p_organization_id and p.status = 'active'
    ),
    exists (
      select 1 from public.knowledge_documents k
      where k.organization_id = p_organization_id and k.status = 'ready'
    ),
    exists (
      select 1 from public.widget_settings w
      where w.organization_id = p_organization_id and w.enabled
    ),
    exists (
      select 1 from public.conversations c
      where c.organization_id = p_organization_id
    ),
    exists (
      select 1 from public.leads l
      where l.organization_id = p_organization_id
    );
$$;

revoke execute on function public.organization_activation(uuid) from public;
grant execute on function public.organization_activation(uuid) to authenticated;
