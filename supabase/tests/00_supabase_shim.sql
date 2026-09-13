-- LOCAL TEST SHIM ONLY.
-- Do NOT run this against a Supabase database — Supabase already provides the
-- auth schema, auth.users, auth.uid(), and the anon/authenticated/service_role
-- roles. This file emulates just enough of that surface to apply the migrations
-- and run tenant-isolation tests on a plain PostgreSQL instance.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- auth.uid() / auth.role() read the current request's JWT claims, set per
-- statement with `SET LOCAL request.jwt.claims = '{...}'`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'sub',
    ''
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'role',
    'anon'
  );
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
