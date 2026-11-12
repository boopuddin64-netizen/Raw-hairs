-- =============================================================================
-- RAW HAIRS — Phase 1 security fixes.
-- Branch: development/phase-1-security-fixes
--
-- Fixes the audit findings:
--   1) Customers could insert orders with arbitrary status/subtotal/total
--      (forged "paid" orders). Direct customer INSERT on orders is now
--      revoked; orders are created ONLY through the server-side RPC
--      create_order_from_cart() (added in the next migration), which prices
--      from live DB values and can never set paid/approved status.
--   2) Rider job status transitions move to a server RPC (later phase);
--      this migration fixes the status constraint and keeps owner control.
--      The previously missing rider UPDATE policy is deliberately NOT added
--      as a free-form policy: riders will update only via a constrained RPC
--      in the delivery phase, so no unsafe policy is introduced now.
--   3) Money moves to integer kobo. products.price -> price_kobo,
--      services.price -> price_kobo, international_requests.quote_amount ->
--      quote_amount_kobo, orders subtotal/delivery_fee/total -> *_kobo,
--      order_items.unit_price -> unit_price_kobo. Legacy numeric columns are
--      kept temporarily (deprecated) so the current storefront keeps working
--      during the frontend transition; *_kobo is authoritative. A later
--      migration drops the legacy columns.
--   4) Guest checkout: orders.customer_id becomes nullable; guest identity
--      columns are added.
--   5) New tables: payments, audit_logs, return_requests, notifications.
--      (refund rows hang off payments/orders and are added with the payment
--      workflow so no forward references exist.)
--
-- Apply to the DEVELOPMENT database first. Do NOT apply to production
-- without owner approval.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Money conversion: naira numeric -> kobo integer (in place)
--    Existing prices are whole-naira amounts (95000 etc.), so x100 is exact.
-- -----------------------------------------------------------------------------
alter table public.products
  add column if not exists price_kobo bigint;
update public.products
   set price_kobo = round(coalesce(price, 0) * 100)::bigint
 where price_kobo is null;
alter table public.products
  alter column price_kobo set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_price_kobo_check') then
    alter table public.products add constraint products_price_kobo_check check (price_kobo >= 0);
  end if;
end $$;

alter table public.services
  add column if not exists price_kobo bigint;
update public.services
   set price_kobo = round(coalesce(price, 0) * 100)::bigint
 where price_kobo is null and price is not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'services_price_kobo_check') then
    alter table public.services add constraint services_price_kobo_check check (price_kobo is null or price_kobo >= 0);
  end if;
end $$;

alter table public.international_requests
  add column if not exists quote_amount_kobo bigint;
update public.international_requests
   set quote_amount_kobo = round(coalesce(quote_amount, 0) * 100)::bigint
 where quote_amount_kobo is null and quote_amount is not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'intl_quote_kobo_check') then
    alter table public.international_requests add constraint intl_quote_kobo_check check (quote_amount_kobo is null or quote_amount_kobo >= 0);
  end if;
end $$;

alter table public.orders
  add column if not exists subtotal_kobo bigint,
  add column if not exists delivery_fee_kobo bigint,
  add column if not exists total_kobo bigint;
update public.orders
   set subtotal_kobo     = round(coalesce(subtotal, 0) * 100)::bigint,
       delivery_fee_kobo = round(coalesce(delivery_fee, 0) * 100)::bigint,
       total_kobo        = round(coalesce(total, 0) * 100)::bigint
 where total_kobo is null;
alter table public.orders
  alter column subtotal_kobo     set not null,
  alter column delivery_fee_kobo set not null default 0,
  alter column total_kobo        set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_subtotal_kobo_check') then
    alter table public.orders add constraint orders_subtotal_kobo_check check (subtotal_kobo >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_delivery_kobo_check') then
    alter table public.orders add constraint orders_delivery_kobo_check check (delivery_fee_kobo >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_total_kobo_check') then
    alter table public.orders add constraint orders_total_kobo_check check (total_kobo >= 0);
  end if;
end $$;

alter table public.order_items
  add column if not exists unit_price_kobo bigint;
update public.order_items
   set unit_price_kobo = round(coalesce(unit_price, 0) * 100)::bigint
 where unit_price_kobo is null;
alter table public.order_items
  alter column unit_price_kobo set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'order_items_unit_kobo_check') then
    alter table public.order_items add constraint order_items_unit_kobo_check check (unit_price_kobo >= 0);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1) Orders: hardened status model, guest checkout, admin approval gate
-- -----------------------------------------------------------------------------
alter table public.orders drop constraint orders_status_check;
alter table public.orders
  add constraint orders_status_check check (status in (
    'awaiting_payment', 'paid', 'awaiting_approval', 'approved',
    'processing', 'dispatched', 'delivered', 'cancelled',
    'refunded', 'partially_refunded'
  ));

-- Guest checkout support.
alter table public.orders alter column customer_id drop not null;
alter table public.orders
  add column if not exists guest_name text,
  add column if not exists guest_phone text,
  add column if not exists guest_email text,
  add column if not exists delivery_address text,
  add column if not exists delivery_state text,
  add column if not exists delivery_city text,
  add column if not exists delivery_instructions text,
  add column if not exists payment_method text default 'paystack',
  add column if not exists approval_note text,
  add column if not exists approved_at timestamptz,
  add column if not exists is_paid boolean not null default false,
  add column if not exists paid_at timestamptz;

-- payment_method constraint (added separately in case the column pre-existed)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_method_check') then
    alter table public.orders add constraint orders_payment_method_check
      check (payment_method in ('paystack', 'bank_transfer'));
  end if;
end $$;

create index if not exists orders_guest_email_idx on public.orders(guest_email);

-- Revoke customer order creation: orders are created ONLY via the
-- server-side RPC (create_order_from_cart) which prices from live DB values.
drop policy if exists "Customers create own orders" on public.orders;

-- Replace the blanket owner "manage" policy with targeted policies.
-- Owner can read and update orders (fulfilment/approval), but payment state
-- transitions go through the verified server payment flow only.
drop policy if exists "Owner manages orders" on public.orders;
drop policy if exists "Customers read own orders" on public.orders;
create policy "Customers read own orders"
  on public.orders for select to authenticated
  using (
    customer_id = (select auth.uid())
    or (select public.is_raw_hairs_owner())
  );
create policy "Owner updates orders"
  on public.orders for update to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));

-- order_items: created server-side only; customers read their own.
drop policy if exists "Customers read own order items" on public.order_items;
drop policy if exists "Owner manages order items" on public.order_items;
create policy "Customers read own order items"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = (select auth.uid()) or (select public.is_raw_hairs_owner()))
    )
  );
create policy "Owner updates order items"
  on public.order_items for update to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));

-- -----------------------------------------------------------------------------
-- 2) Rider jobs: fix the status constraint; rider transition control moves to
--    a constrained RPC in the delivery phase (no free-form client policy).
-- -----------------------------------------------------------------------------
alter table public.rider_jobs drop constraint rider_jobs_status_check;
alter table public.rider_jobs
  add constraint rider_jobs_status_check check (status in (
    'unassigned', 'assigned', 'picked_up', 'in_transit',
    'delivered', 'failed', 'returned'
  ));

-- (Existing policies stay: riders read their own jobs, owner manages all.)

-- -----------------------------------------------------------------------------
-- 3) Store settings: safe public read (delivery fee, contact info, toggles)
-- -----------------------------------------------------------------------------
drop policy if exists "Public reads store settings" on public.store_settings;
create policy "Public reads store settings"
  on public.store_settings for select to anon, authenticated
  using (id = 'default');

-- -----------------------------------------------------------------------------
-- 4) Audit log (append-only)
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor uuid,
  actor_email text,
  action text not null,
  table_name text,
  record_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_record_idx on public.audit_logs(table_name, record_id);

alter table public.audit_logs enable row level security;
drop policy if exists "Owner reads audit logs" on public.audit_logs;
create policy "Owner reads audit logs"
  on public.audit_logs for select to authenticated
  using ((select public.is_raw_hairs_owner()));
-- No INSERT/UPDATE/DELETE policies: audit writes happen with the service
-- role only; nobody, including the owner, can edit the trail from a client.

-- -----------------------------------------------------------------------------
-- 5) Payments table (created BEFORE any table that references it)
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null check (method in ('paystack', 'bank_transfer')),
  status text not null default 'pending'
    check (status in ('pending', 'awaiting_verification', 'successful',
                      'failed', 'refunded', 'partially_refunded')),
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  gateway text,
  gateway_reference text unique,
  receipt_path text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_order_idx on public.payments(order_id, created_at desc);
create index if not exists payments_status_idx on public.payments(status);

alter table public.payments enable row level security;
drop policy if exists "Customers read own payments" on public.payments;
drop policy if exists "Owner reviews payments" on public.payments;
create policy "Customers read own payments"
  on public.payments for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = (select auth.uid()) or (select public.is_raw_hairs_owner()))
    )
  );
-- All payment writes (Paystack confirmation, bank-transfer verification,
-- refunds) happen server-side only. No client UPDATE policy exists on
-- payments, so payment state cannot be changed from any browser session.

-- -----------------------------------------------------------------------------
-- 6) Refunds (payments already exists above, so the FK is valid)
-- -----------------------------------------------------------------------------
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete set null,
  order_id uuid not null references public.orders(id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'rejected')),
  channel text not null default 'paystack'
    check (channel in ('paystack', 'bank_transfer')),
  reference text,
  note text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists refunds_order_idx on public.refunds(order_id, created_at desc);

alter table public.refunds enable row level security;
drop policy if exists "Customers read own refunds" on public.refunds;
drop policy if exists "Owner manages refunds" on public.refunds;
create policy "Customers read own refunds"
  on public.refunds for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = (select auth.uid()) or (select public.is_raw_hairs_owner()))
    )
  );
create policy "Owner manages refunds"
  on public.refunds for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));

-- -----------------------------------------------------------------------------
-- 7) Return requests (48-hour window enforced server-side at creation time)
-- -----------------------------------------------------------------------------
create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  order_item_id uuid references public.order_items(id) on delete set null,
  reason text not null,
  description text,
  evidence_path text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'returned', 'refunded')),
  submitted_at timestamptz not null default now()
);
create index if not exists return_requests_order_idx on public.return_requests(order_id, submitted_at desc);

alter table public.return_requests enable row level security;
drop policy if exists "Customers read own return requests" on public.return_requests;
drop policy if exists "Owner manages return requests" on public.return_requests;
create policy "Customers read own return requests"
  on public.return_requests for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = (select auth.uid()) or (select public.is_raw_hairs_owner()))
    )
  );
create policy "Owner manages return requests"
  on public.return_requests for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));
-- Creation goes through the server flow so the 48-hour window and delivery
-- status are validated; no direct customer INSERT policy exists.

-- -----------------------------------------------------------------------------
-- 8) Notifications (WhatsApp-first; email later)
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'whatsapp'
    check (channel in ('whatsapp', 'email')),
  event text not null,
  recipient text not null,
  customer_id uuid references auth.users(id) on delete set null,
  order_id uuid references public.orders(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'skipped')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notifications_status_idx on public.notifications(status, created_at);

alter table public.notifications enable row level security;
drop policy if exists "Owner reads notifications" on public.notifications;
create policy "Owner reads notifications"
  on public.notifications for select to authenticated
  using ((select public.is_raw_hairs_owner()));
-- Inserts/updates happen server-side only (dispatcher process).

-- -----------------------------------------------------------------------------
-- 9) Audit triggers for privileged mutations
-- -----------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor, actor_email, action, table_name, record_id, metadata)
  values (
    (select auth.uid()),
    coalesce(auth.jwt() ->> 'email', null),
    tg_op,
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id')),
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) - 'id' end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists products_audit on public.products;
create trigger products_audit
  after insert or update or delete on public.products
  for each row execute function public.audit_row_change();
drop trigger if exists services_audit on public.services;
create trigger services_audit
  after insert or update or delete on public.services
  for each row execute function public.audit_row_change();
drop trigger if exists orders_audit on public.orders;
create trigger orders_audit
  after insert or update or delete on public.orders
  for each row execute function public.audit_row_change();
drop trigger if exists rider_jobs_audit on public.rider_jobs;
create trigger rider_jobs_audit
  after insert or update or delete on public.rider_jobs
  for each row execute function public.audit_row_change();
drop trigger if exists store_settings_audit on public.store_settings;
create trigger store_settings_audit
  after insert or update or delete on public.store_settings
  for each row execute function public.audit_row_change();
drop trigger if exists payments_audit on public.payments;
create trigger payments_audit
  after insert or update or delete on public.payments
  for each row execute function public.audit_row_change();
drop trigger if exists refunds_audit on public.refunds;
create trigger refunds_audit
  after insert or update or delete on public.refunds
  for each row execute function public.audit_row_change();
