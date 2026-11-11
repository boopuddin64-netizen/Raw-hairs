-- Optional store settings + reviews for admin
-- Run this in Supabase SQL Editor if you want cloud-backed settings/reviews

create table if not exists public.store_settings (
  id text primary key default 'default',
  settings jsonb not null default '{}'::jsonb,
  rules jsonb not null default '{}'::jsonb,
  goals jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.store_settings enable row level security;

create policy "Anyone can read store_settings"
  on public.store_settings for select using (true);

create policy "Authenticated can upsert store_settings"
  on public.store_settings for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id text,
  service_id text,
  customer_name text,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;

create policy "Anyone can read reviews"
  on public.reviews for select using (true);

create policy "Authenticated can insert reviews"
  on public.reviews for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated can update/delete reviews"
  on public.reviews for all
  using (auth.role() = 'authenticated');
