-- Milestone 03 — Products
-- Product categories and products, scoped to an organization and protected by
-- RLS with the same role model as multi-tenancy (members read; owner/admin
-- write). Reuses public.set_updated_at(), is_org_member() and is_org_admin()
-- from 0001_multi_tenancy.sql.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index product_categories_organization_id_idx
  on public.product_categories (organization_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid references public.product_categories (id) on delete set null,
  name text not null,
  description text,
  price numeric(12, 2) not null default 0 check (price >= 0),
  currency text not null default 'NGN',
  sku text,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_organization_id_idx
  on public.products (organization_id);
create index products_organization_status_idx
  on public.products (organization_id, status);
create index products_organization_category_idx
  on public.products (organization_id, category_id);
-- SKU is unique within an organization when present.
create unique index products_organization_sku_key
  on public.products (organization_id, sku)
  where sku is not null;

create trigger product_categories_set_updated_at before update on public.product_categories
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (members read; owner/admin write)
-- ---------------------------------------------------------------------------
alter table public.product_categories enable row level security;
alter table public.products enable row level security;

create policy product_categories_select_member on public.product_categories
  for select using (public.is_org_member(organization_id));
create policy product_categories_insert_admin on public.product_categories
  for insert with check (public.is_org_admin(organization_id));
create policy product_categories_update_admin on public.product_categories
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy product_categories_delete_admin on public.product_categories
  for delete using (public.is_org_admin(organization_id));

create policy products_select_member on public.products
  for select using (public.is_org_member(organization_id));
create policy products_insert_admin on public.products
  for insert with check (public.is_org_admin(organization_id));
create policy products_update_admin on public.products
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy products_delete_admin on public.products
  for delete using (public.is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- Grants (rows still gated by RLS; anon gets no access)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete
  on public.product_categories, public.products
  to authenticated;
