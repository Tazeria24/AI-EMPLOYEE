-- Milestone 02 — Multi-tenancy
-- Organizations, memberships and business profiles, with tenant isolation
-- enforced by Row Level Security. See docs/DATABASE.md and docs/SECURITY.md.
--
-- Assumes a Supabase database: the `auth` schema, `auth.users`, `auth.uid()`
-- and the `anon` / `authenticated` roles already exist. For local testing on
-- plain PostgreSQL, apply supabase/tests/00_supabase_shim.sql first.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_id_idx
  on public.organization_members (user_id);
create index organization_members_organization_id_idx
  on public.organization_members (organization_id);

create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique
    references public.organizations (id) on delete cascade,
  business_name text,
  business_type text,
  website text,
  phone text,
  location text,
  description text,
  business_hours jsonb,
  currency text not null default 'NGN',
  timezone text not null default 'Africa/Lagos',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger business_profiles_set_updated_at before update on public.business_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER so policies on organization_members do
-- not recurse into themselves).
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(org uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.business_profiles enable row level security;

-- profiles: a user can read and update only their own row.
create policy profiles_select_own on public.profiles
  for select using (user_id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- organizations: members read; admins/owners update. No client insert (orgs are
-- provisioned by the signup trigger).
create policy organizations_select_member on public.organizations
  for select using (public.is_org_member(id));
create policy organizations_update_admin on public.organizations
  for update using (public.is_org_admin(id)) with check (public.is_org_admin(id));

-- organization_members: members see co-members; admins/owners manage.
create policy members_select_same_org on public.organization_members
  for select using (public.is_org_member(organization_id));
create policy members_insert_admin on public.organization_members
  for insert with check (public.is_org_admin(organization_id));
create policy members_update_admin on public.organization_members
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy members_delete_admin on public.organization_members
  for delete using (public.is_org_admin(organization_id));

-- business_profiles: members read; admins/owners write.
create policy business_profiles_select_member on public.business_profiles
  for select using (public.is_org_member(organization_id));
create policy business_profiles_insert_admin on public.business_profiles
  for insert with check (public.is_org_admin(organization_id));
create policy business_profiles_update_admin on public.business_profiles
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- Grants: authenticated users get DML (rows still gated by RLS). anon is not
-- granted access to tenant tables at all.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.profiles,
     public.organizations,
     public.organization_members,
     public.business_profiles
  to authenticated;

-- ---------------------------------------------------------------------------
-- Provision a profile, organization, owner membership and empty business
-- profile atomically when a new auth user is created (ADR-012).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
  base_slug text;
  final_slug text;
  suffix int := 0;
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');

  base_slug := trim(both '-' from
    regexp_replace(lower(split_part(coalesce(new.email, 'org'), '@', 1)),
                   '[^a-z0-9]+', '-', 'g'));
  if base_slug = '' then
    base_slug := 'org';
  end if;

  final_slug := base_slug;
  while exists (select 1 from public.organizations o where o.slug = final_slug) loop
    suffix := suffix + 1;
    final_slug := base_slug || '-' || suffix::text;
  end loop;

  insert into public.organizations (name, slug)
  values (initcap(replace(base_slug, '-', ' ')) || '''s workspace', final_slug)
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  insert into public.business_profiles (organization_id)
  values (new_org_id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
