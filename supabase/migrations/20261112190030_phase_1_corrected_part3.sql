-- RAW HAIRS Phase 1 - CORRECTED, part 3 of 3 (complete)
-- Matches live database. Apply after parts 1, 1b, 2.
-- Payments, returns, refunds, notifications, audit log tables; RLS hardening;
-- rider transition enforcement; audit triggers. (Content of the originally
-- planned part 4 is folded in here so the migration set fits existing files.)

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  payment_method text not null check (payment_method in ('paystack', 'bank_transfer')),
  status text not null default 'pending'
    check (status in ('pending', 'awaiting_verification', 'successful', 'failed', 'refunded', 'partially_refunded')),
  amount_kobo bigint not null check (amount_kobo >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  reference text unique,
  provider text,
  provider_response jsonb,
  failure_reason text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_order_idx on public.payments(order_id);
create index if not exists payments_status_idx on public.payments(status);
alter table public.payments enable row level security;

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  requested_by uuid references auth.users(id),
  requester_email text,
  product_id uuid references public.products(id),
  product_name text,
  reason text not null,
  description text,
  evidence_path text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'returned', 'refunded', 'closed')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_notes text
);
create index if not exists returns_order_idx on public.return_requests(order_id);
alter table public.return_requests enable row level security;

create table if not exists public.refund_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  return_request_id uuid references public.return_requests(id),
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'initiated'
    check (status in ('initiated', 'processing', 'completed', 'failed', 'rejected')),
  channel text,
  provider_reference text,
  initiated_by uuid references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.refund_transactions enable row level security;

create or replace function public.validate_refund_amount()
returns trigger language plpgsql set search_path = ''
as $$
declare v_paid bigint;
begin
  select amount_kobo into v_paid from public.payments where id = new.payment_id;
  if coalesce(v_paid, 0) <= 0 or new.amount_kobo > v_paid then
    raise exception 'Refund amount exceeds the original successful payment';
  end if;
  return new;
end $$;
drop trigger if exists refund_amount_check on public.refund_transactions;
create trigger refund_amount_check before insert on public.refund_transactions
  for each row execute function public.validate_refund_amount();

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  guest_email text,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'email')),
  event_type text not null,
  title text not null,
  body text,
  related_order uuid references public.orders(id),
  related_booking uuid references public.bookings(id),
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  actor_email text,
  action text not null,
  table_name text,
  record_id text,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_created_idx on public.audit_log(created_at desc);
alter table public.audit_log enable row level security;

-- 5) RLS hardening -----------------------------------------------------------
-- Orders: revoke customer inserts; orders exist only via the RPC in part 2.
drop policy if exists "Customers create own orders" on public.orders;
drop policy if exists "Owner manages orders" on public.orders;
create policy "Owner manages orders" on public.orders
  for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));

drop policy if exists "Owner manages order items" on public.order_items;
create policy "Owner updates order items" on public.order_items
  for update to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));

-- Riders: simple ownership policy; transitions enforced by trigger below.
drop policy if exists "Riders update assigned jobs" on public.rider_jobs;
create policy "Riders update assigned jobs" on public.rider_jobs
  for update to authenticated
  using (rider_id = (select auth.uid()))
  with check (rider_id = (select auth.uid()));

drop policy if exists "Customers read own reservations" on public.inventory_reservations;
create policy "Customers read own reservations" on public.inventory_reservations
  for select to authenticated
  using (customer_id = (select auth.uid()));
drop policy if exists "Owner manages reservations" on public.inventory_reservations;
create policy "Owner manages reservations" on public.inventory_reservations
  for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));

drop policy if exists "Owner manages payments" on public.payments;
create policy "Owner manages payments" on public.payments
  for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));
drop policy if exists "Customers read own payments" on public.payments;
create policy "Customers read own payments" on public.payments
  for select to authenticated
  using (exists (select 1 from public.orders o
                  where o.id = order_id and o.customer_id = (select auth.uid())));

drop policy if exists "Owner manages return requests" on public.return_requests;
create policy "Owner manages return requests" on public.return_requests
  for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));
drop policy if exists "Customers read own return requests" on public.return_requests;
create policy "Customers read own return requests" on public.return_requests
  for select to authenticated
  using (requested_by = (select auth.uid())
     or exists (select 1 from public.orders o
                 where o.id = order_id and o.customer_id = (select auth.uid())));

drop policy if exists "Owner manages refunds" on public.refund_transactions;
create policy "Owner manages refunds" on public.refund_transactions
  for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));
drop policy if exists "Customers read own refunds" on public.refund_transactions;
create policy "Customers read own refunds" on public.refund_transactions
  for select to authenticated
  using (exists (select 1 from public.payments p
                  where p.id = payment_id
                    and exists (select 1 from public.orders o
                                 where o.id = p.order_id
                                   and o.customer_id = (select auth.uid()))));

drop policy if exists "Owner manages notifications" on public.notifications;
create policy "Owner manages notifications" on public.notifications
  for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));
create policy "Customers read own notifications" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Owner reads audit log" on public.audit_log;
create policy "Owner reads audit log" on public.audit_log
  for select to authenticated
  using ((select public.is_raw_hairs_owner()));

drop policy if exists "Owner manages store settings" on public.store_settings;
create policy "Owner manages store settings" on public.store_settings
  for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));
drop policy if exists "Public reads store settings" on public.store_settings;
create policy "Public reads store settings" on public.store_settings
  for select to anon, authenticated
  using (id = 'default');

-- 6) Rider transition enforcement (trigger: policies cannot use NEW/OLD) -----
create or replace function public.validate_rider_transition()
returns trigger language plpgsql set search_path = ''
as $$
begin
  -- Service role (admin API) and owner bypass rider restrictions.
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or (select public.is_raw_hairs_owner()) then
    return new;
  end if;
  if new.rider_id is distinct from old.rider_id
     or new.order_id is distinct from old.order_id
     or new.delivery_otp_hash is distinct from old.delivery_otp_hash
     or new.delivery_photo_path is distinct from old.delivery_photo_path then
    raise exception 'Riders cannot change assignment or delivery verification fields';
  end if;
  if not (
       (old.status = 'assigned'   and new.status = 'picked_up')
    or (old.status = 'picked_up'  and new.status = 'in_transit')
    or (old.status = 'in_transit' and new.status in ('delivered', 'failed'))
    or (new.status = old.status)
  ) then
    raise exception 'Invalid delivery status transition';
  end if;
  return new;
end $$;
drop trigger if exists rider_jobs_transition_check on public.rider_jobs;
create trigger rider_jobs_transition_check before update on public.rider_jobs
  for each row execute function public.validate_rider_transition();

-- 7) Audit triggers (owner/rider actions only) -------------------------------
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not ((select public.is_raw_hairs_owner()) or (select public.is_raw_hairs_rider())) then
    return coalesce(new, old);
  end if;
  insert into public.audit_log (actor, action, table_name, record_id, old_value, new_value)
  values (v_actor, lower(tg_op), tg_table_name,
          coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'), ''),
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['products','services','orders','payments','return_requests',
                           'refund_transactions','rider_jobs','store_settings','bookings',
                           'international_requests']
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_row_change()', t);
  end loop;
end $$;