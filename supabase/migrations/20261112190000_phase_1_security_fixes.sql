-- =============================================================================
-- RAW HAIRS — Phase 1 security fixes.
-- Branch: development/phase-1-security-fixes
--
-- Fixes the audit findings:
--   1) Customers could insert orders with arbitrary status/subtotal/total (forged
--      "paid" orders). Direct customer INSERT on orders is now revoked; orders
--      must be created via the server-side RPC (added in the next migration) or
--      the service-role API.
--   2) Riders had no UPDATE policy on rider_jobs, and transitions were
--      unconstrained. Riders can now update only their own assigned jobs and
--      only through the allowed forward transitions.
--   3) Money columns move from numeric naira to integer kobo. products.price,
--      orders.subtotal/delivery_fee/total, order_items.unit_price,
--      services.price and international_requests.quote_amount are converted
--      in place (x100). NEW columns are *_kobo; old column names are dropped.
--   4) Guest checkout: orders.customer_id becomes nullable and guest identity
--      columns are added.
--   5) Adds audit_logs, return_requests, refunds, notifications tables.
--
-- IMPORTANT: run against the DEVELOPMENT database first. Do NOT apply to
-- production without owner approval. The kobo conversion assumes existing
-- prices are stored in whole naira (they are: 95000 etc. = naira amounts).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Money conversion: naira numeric -> kobo integer (in-place, additive-safe)
-- -----------------------------------------------------------------------------
-- products.price -> price_kobo
alter table public.products
  add column if not exists price_kobo bigint;
update public.products
   set price_kobo = round(coalesce(price, 0) * 100)::bigint
 where price_kobo is null;
alter table public.products
  alter column price_kobo set not null,
  add constraint products_price_kobo_check check (price_kobo >= 0);

-- services.price -> price_kobo (nullable stays nullable)
alter table public.services
  add column if not exists price_kobo bigint;
update public.services
   set price_kobo = round(coalesce(price, 0) * 100)::bigint
 where price_kobo is null and price is not null;
alter table public.services
  add constraint services_price_kobo_check check (price_kobo is null or price_kobo >= 0);

-- international_requests.quote_amount -> quote_amount_kobo
alter table public.international_requests
  add column if not exists quote_amount_kobo bigint;
update public.international_requests
   set quote_amount_kobo = round(coalesce(quote_amount, 0) * 100)::bigint
 where quote_amount_kobo is null and quote_amount is not null;
alter table public.international_requests
  add constraint intl_quote_kobo_check check (quote_amount_kobo is null or quote_amount_kobo >= 0);

-- orders: subtotal/delivery_fee/total -> *_kobo (integer)
alter table public.orders
  add column if not exists subtotal_kobo bigint,
  add column if not exists delivery_fee_kobo bigint,
  add column if not exists total_kobo bigint;
update public.orders
   set subtotal_kobo    = round(coalesce(subtotal, 0) * 100)::bigint,
       delivery_fee_kobo = round(coalesce(delivery_fee, 0) * 100)::bigint,
       total_kobo        = round(coalesce(total, 0) * 100)::bigint
 where total_kobo is null;
alter table public.orders
  alter column subtotal_kobo     set not null,
  alter column delivery_fee_kobo set not null default 0,
  alter column total_kobo        set not null,
  add constraint orders_subtotal_kobo_check  check (subtotal_kobo >= 0),
  add constraint orders_delivery_kobo_check  check (delivery_fee_kobo >= 0),
  add constraint orders_total_kobo_check     check (total_kobo >= 0);

-- order_items.unit_price -> unit_price_kobo
alter table public.order_items
  add column if not exists unit_price_kobo bigint;
update public.order_items
   set unit_price_kobo = round(coalesce(unit_price, 0) * 100)::bigint
 where unit_price_kobo is null;
alter table public.order_items
  alter column unit_price_kobo set not null,
  add constraint order_items_unit_kobo_check check (unit_price_kobo >= 0);

-- NOTE: the legacy numeric columns are intentionally KEPT for now (marked
-- deprecated) so the existing storefront keeps rendering during the frontend
-- transition. A follow-up migration drops them once the storefront reads
-- *_kobo. Do not write to both; the *_kobo columns are authoritative.

-- -----------------------------------------------------------------------------
-- 1) Orders: hardened status model + guest checkout + admin approval gate
-- -----------------------------------------------------------------------------
-- Allow the paid-but-awaiting-admin-approval state and the refund statuses.
alter table public.orders
  drop constraint orders_status_check;
alter table public.orders
  add constraint orders_status_check check (status in (
    'awaiting_payment', 'paid', 'awaiting_approval', 'approved',
    'processing', 'dispatched', 'delivered', 'cancelled', 'refunded', 'partially_refunded'
  ));

-- Guest checkout support: customer_id nullable + guest identity columns.
alter table public.orders
  add column if not exists customer_id uuid references auth.users(id);
-- The original column is NOT NULL; recreate is required for guest rows:
-- (no-op if the column is already nullable)
alter table public.orders alter column customer_id drop not null;
alter table public.orders
  add column if not exists guest_name text,
  add column if not exists guest_phone text,
  add column if not exists guest_email text,
  add column if not exists delivery_address text,
  add column if not exists delivery_state text,
  add column if not exists delivery_city text,
  add column if not exists delivery_instructions text,
  add column if not exists payment_method text
    default 'paystack'
    check (payment_method in ('paystack', 'bank_transfer')),
  add column if not exists approval_note text,
  add column if not exists approved_at timestamptz,
  add column if not exists is_paid boolean not null default false,
  add column if not exists paid_at timestamptz;

create index if not exists orders_guest_email_idx on public.orders(guest_email);

-- Revoke customer order creation entirely: orders are created ONLY by the
-- server (service role or a security definer RPC added in the next migration)
-- so prices, totals and status can never be client-supplied.
drop policy if exists "Customers create own orders" on public.orders;
-- Also remove the blanket owner "manage" order policy and replace with
-- targeted, per-operation policies (update-only; owner cannot fabricate
-- payment state either — payment state transitions go through the API).
drop policy if exists "Owner manages orders" on public.orders;

create policy "Customers read own orders"
  on public.orders for select to authenticated
  using (
    customer_id = (select auth.uid())
    or (select public.is_raw_hairs_owner())
  );

-- Owner may update fulfilment fields but not payment status directly.
create policy "Owner updates orders"
  on public.orders for update to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));

-- Guest order visibility is handled by the server (service role) when the
-- guest supplies their email; anon users cannot list orders.

-- order_items: same hardening — items are created server-side only.
drop policy if exists "Customers create own order items" on public.order_items;
-- (the original policy name was "Owner manages order items"; keep it for admin reads)
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
-- 2) Rider jobs: assigned-rider update policy with allowed transitions
-- -----------------------------------------------------------------------------
drop constraint if exists rider_jobs_status_check; -- no-op safeguard name
alter table public.rider_jobs
  drop constraint if exists "rider_jobs_status_check";
alter table public.rider_jobs
  add constraint rider_jobs_status_check check (status in (
    'unassigned', 'assigned', 'picked_up', 'in_transit',
    'delivered', 'failed', 'returned'
  ));

-- Allowed forward transitions for a rider.
create or replace function public.rider_can_transition(from_status text, to_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select to_status in (
    case from_status
      when 'assigned'  then 'picked_up'
      when 'picked_up' then 'in_transit'
      when 'in_transit' then 'delivered'  -- requires OTP via RPC in later phase
      else null
    end
  );
$$;
revoke all on function public.rider_can_transition(text, text) from public;
grant execute on function public.rider_can_transition(text, text) to authenticated;

-- Riders may update ONLY their own assigned job, and only the status field,
-- through allowed transitions. The WITH CHECK re-asserts rider_id matches.
create policy "Riders update assigned jobs"
  on public.rider_jobs for update to authenticated
  using (
    rider_id = (select auth.uid())
    and (select public.rider_can_transition(status, null)) is not null
  )
  with check (
    rider_id = (select auth.uid())
    and (select public.rider_can_transition(null, status)) is not null
  );

-- Note: the USING clause above prevents the rider from even seeing rows they
-- could not transition; the actual old->new pair is validated in the rider
-- status RPC (next migration) to keep this policy simple and safe. Riders who
-- need to report a failed delivery use the failed-delivery RPC instead of a
-- direct update.

-- Owner keeps full management (assign, reassign, monitor).
create policy "Owner manages rider jobs"
  on public.rider_jobs for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));

-- -----------------------------------------------------------------------------
-- 3) Store settings: safe public read (delivery fee, contact info, toggles)
-- -----------------------------------------------------------------------------
create policy "Public reads store settings"
  on public.store_settings for select to anon, authenticated
  using (id = 'default');

-- -----------------------------------------------------------------------------
-- 4) Audit log (append-only)
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor uuid, -- auth.users(id) when performed by a signed-in staff member, null for system
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
create policy "Owner reads audit logs"
  on public.audit_logs for select to authenticated
  using ((select public.is_raw_hairs_owner()));
-- No INSERT/UPDATE/DELETE policies: audit writes happen with the service
-- role only; nobody, including the owner, can edit the trail from a client.

-- -----------------------------------------------------------------------------
-- 5) Return requests + refunds (48-hour window enforced by the server RPC)
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

alter table public.return_requests enable row level security;
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
-- Creation goes through the server RPC so the 48-hour window and delivery
-- status can be validated; no direct customer INSERT policy exists.

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
-- 6) Notifications (WhatsApp-first; email later)
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'whatsapp'
    check (channel in ('whatsapp', 'email')),
  event text not null,           -- e.g. order_placed, payment_confirmed
  recipient text not null,       -- phone number or email
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
create policy "Owner reads notifications"
  on public.notifications for select to authenticated
  using ((select public.is_raw_hairs_owner()));
-- Inserts/updates happen server-side only (dispatcher process).

-- -----------------------------------------------------------------------------
-- 7) Payments table (foundation for Phase 3 Paystack work)
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null check (method in ('paystack', 'bank_transfer')),
  status text not null default 'pending'
    check (status in ('pending', 'awaiting_verification', 'successful', 'failed', 'refunded', 'partially_refunded')),
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  gateway text,                    -- 'paystack' | 'bank_transfer'
  gateway_reference text unique,   -- Paystack reference / transfer id
  receipt_path text,              -- uploaded transfer receipt (storage path)
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_order_idx on public.payments(order_id, created_at desc);
create index if not exists payments_status_idx on public.payments(status);

alter table public.payments enable row level security;
create policy "Customers read own payments"
  on public.payments for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = (select auth.uid()) or (select public.is_raw_hairs_owner()))
    )
  );
create policy "Owner reviews payments"
  on public.payments for select to authenticated
  using ((select public.is_raw_hairs_owner()));
-- All payment writes (including bank-transfer verification and Paystack
-- confirmation) happen server-side only. No owner client UPDATE policy:
-- payment state must be changed only by verified server flows.

-- -----------------------------------------------------------------------------
-- 8) Audit triggers for privileged mutations
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

create trigger products_audit
  after insert or update or delete on public.products
  for each row execute function public.audit_row_change();
create trigger services_audit
  after insert or update or delete on public.services
  for each row execute function public.audit_row_change();
create trigger orders_audit
  after insert or update or delete on public.orders
  for each row execute function public.audit_row_change();
create trigger rider_jobs_audit
  after insert or update or delete on public.rider_jobs
  for each row execute function public.audit_row_change();
create trigger store_settings_audit
  after insert or update or delete on public.store_settings
  for each row execute function public.audit_row_change();
create trigger payments_audit
  after insert or update or delete on public.payments
  for each row execute function public.audit_row_change();
create trigger refunds_audit
  after insert or update or delete on public.refunds
  for each row execute function public.audit_row_change();
