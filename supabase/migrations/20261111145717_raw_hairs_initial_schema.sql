-- RAW HAIRS initial Supabase schema.
-- Owner privileges are granted only through trusted app_metadata.role = 'owner'.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.is_raw_hairs_owner()
returns boolean language sql stable security invoker set search_path = ''
as $$ select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner', false); $$;
revoke all on function public.is_raw_hairs_owner() from public;
grant execute on function public.is_raw_hairs_owner() to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text, phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text not null unique, description text, category text,
  price numeric(12,2) not null default 0 check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  image_path text, is_active boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.services (
  id uuid primary key default gen_random_uuid(), name text not null, description text,
  price numeric(12,2) check (price is null or price >= 0),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id),
  service_id uuid references public.services(id) on delete set null,
  customer_name text not null, customer_phone text not null, scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','confirmed','completed','cancelled')),
  notes text, created_at timestamptz not null default now()
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','paid','processing','dispatched','delivered','cancelled','refunded')),
  currency text not null default 'NGN' check (currency = 'NGN'),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total numeric(12,2) not null check (total >= 0), stock_reserved_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null, unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0), selected_length text
);
create table public.international_requests (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id),
  customer_name text not null, customer_email text not null, destination_country text not null,
  request_details text,
  status text not null default 'pending' check (status in ('pending','quoted','approved','declined','converted')),
  quote_amount numeric(12,2) check (quote_amount is null or quote_amount >= 0),
  created_at timestamptz not null default now()
);
create table public.rider_jobs (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  rider_id uuid references auth.users(id),
  status text not null default 'unassigned' check (status in ('unassigned','assigned','picked_up','in_transit','delivered','failed')),
  delivery_otp_hash text, delivery_photo_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index bookings_customer_created_idx on public.bookings(customer_id, created_at desc);
create index orders_customer_created_idx on public.orders(customer_id, created_at desc);
create index orders_status_created_idx on public.orders(status, created_at desc);
create index rider_jobs_rider_status_idx on public.rider_jobs(rider_id, status);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.services enable row level security;
alter table public.bookings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.international_requests enable row level security;
alter table public.rider_jobs enable row level security;

create policy "Profiles readable by owner or self" on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_raw_hairs_owner()));
create policy "Customers create own profile" on public.profiles for insert to authenticated
with check (id = (select auth.uid()));
create policy "Customers update own profile" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "Owner manages profiles" on public.profiles for all to authenticated
using ((select public.is_raw_hairs_owner())) with check ((select public.is_raw_hairs_owner()));

create policy "Public reads active products" on public.products for select to anon, authenticated
using (is_active or (select public.is_raw_hairs_owner()));
create policy "Owner manages products" on public.products for all to authenticated
using ((select public.is_raw_hairs_owner())) with check ((select public.is_raw_hairs_owner()));
create policy "Public reads active services" on public.services for select to anon, authenticated
using (is_active or (select public.is_raw_hairs_owner()));
create policy "Owner manages services" on public.services for all to authenticated
using ((select public.is_raw_hairs_owner())) with check ((select public.is_raw_hairs_owner()));

create policy "Customers read own bookings" on public.bookings for select to authenticated
using (customer_id = (select auth.uid()) or (select public.is_raw_hairs_owner()));
create policy "Customers create own bookings" on public.bookings for insert to authenticated
with check (customer_id = (select auth.uid()));
create policy "Owner manages bookings" on public.bookings for all to authenticated
using ((select public.is_raw_hairs_owner())) with check ((select public.is_raw_hairs_owner()));

create policy "Customers read own orders" on public.orders for select to authenticated
using (customer_id = (select auth.uid()) or (select public.is_raw_hairs_owner()));
create policy "Customers create own orders" on public.orders for insert to authenticated
with check (customer_id = (select auth.uid()));
create policy "Owner manages orders" on public.orders for all to authenticated
using ((select public.is_raw_hairs_owner())) with check ((select public.is_raw_hairs_owner()));
create policy "Customers read own order items" on public.order_items for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid()))
or (select public.is_raw_hairs_owner()));
create policy "Owner manages order items" on public.order_items for all to authenticated
using ((select public.is_raw_hairs_owner())) with check ((select public.is_raw_hairs_owner()));

create policy "Customers read own international requests" on public.international_requests for select to authenticated
using (customer_id = (select auth.uid()) or (select public.is_raw_hairs_owner()));
create policy "Customers create own international requests" on public.international_requests for insert to authenticated
with check (customer_id = (select auth.uid()));
create policy "Owner manages international requests" on public.international_requests for all to authenticated
using ((select public.is_raw_hairs_owner())) with check ((select public.is_raw_hairs_owner()));

create policy "Riders read assigned jobs" on public.rider_jobs for select to authenticated
using (rider_id = (select auth.uid()) or (select public.is_raw_hairs_owner()));
create policy "Owner manages rider jobs" on public.rider_jobs for all to authenticated
using ((select public.is_raw_hairs_owner())) with check ((select public.is_raw_hairs_owner()));

insert into storage.buckets (id, name, public) values ('product-images', 'product-images', false)
on conflict (id) do nothing;
create policy "Owner manages product images" on storage.objects for all to authenticated
using (bucket_id = 'product-images' and (select public.is_raw_hairs_owner()))
with check (bucket_id = 'product-images' and (select public.is_raw_hairs_owner()));
