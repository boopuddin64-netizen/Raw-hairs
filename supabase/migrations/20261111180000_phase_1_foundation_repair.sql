-- RAW HAIRS Phase 1 foundation repair.
-- Align database authorization with trusted app_metadata.role and app_metadata.roles.
create or replace function public.is_raw_hairs_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role' in ('owner', 'admin'), false)
    or coalesce(
      (auth.jwt() -> 'app_metadata' -> 'roles') ?| array['owner', 'admin'],
      false
    );
$$;

revoke all on function public.is_raw_hairs_owner() from public;
grant execute on function public.is_raw_hairs_owner() to authenticated;

create table if not exists public.store_settings (
  id text primary key default 'default' check (id = 'default'),
  settings jsonb not null default '{}'::jsonb,
  rules jsonb not null default '{}'::jsonb,
  goals jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.store_settings enable row level security;
drop policy if exists "Owner manages store settings" on public.store_settings;
create policy "Owner manages store settings"
on public.store_settings for all to authenticated
using ((select public.is_raw_hairs_owner()))
with check ((select public.is_raw_hairs_owner()));

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null default 'Anonymous',
  rating integer not null default 5 check (rating between 1 and 5),
  comment text,
  product_id uuid references public.products(id) on delete set null,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.reviews enable row level security;
drop policy if exists "Owner manages reviews" on public.reviews;
create policy "Owner manages reviews"
on public.reviews for all to authenticated
using ((select public.is_raw_hairs_owner()))
with check ((select public.is_raw_hairs_owner()));

create index if not exists reviews_created_at_idx on public.reviews(created_at desc);
create index if not exists reviews_product_id_idx on public.reviews(product_id);
