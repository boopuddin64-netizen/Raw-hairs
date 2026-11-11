-- Optional tables for RAW HAIRS admin settings & ratings
-- Run in Supabase SQL editor

create table if not exists public.store_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.store_settings enable row level security;

create policy "staff read settings" on public.store_settings
  for select to authenticated using (true);

create policy "staff write settings" on public.store_settings
  for all to authenticated using (true) with check (true);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('product', 'service')),
  target_id uuid,
  customer_name text,
  rating int not null check (rating between 1 and 5),
  comment text,
  is_published boolean default true,
  created_at timestamptz default now()
);

alter table public.reviews enable row level security;

create policy "public read published reviews" on public.reviews
  for select using (is_published = true);

create policy "authenticated manage reviews" on public.reviews
  for all to authenticated using (true) with check (true);
