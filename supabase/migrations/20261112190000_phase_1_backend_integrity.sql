-- RAW HAIRS Phase 1 backend integrity migration (additive; safe to re-run).
-- 1) Integer-kobo money columns on products/orders/order_items; legacy naira columns kept in sync.
-- 2) Guest-ready orders (customer_id nullable) + checkout/delivery fields + pending_admin_approval status.
-- 3) Atomic 15-minute inventory reservations with expiry release + availability view.
-- 4) payments, return_requests, refund_transactions, notifications, audit_log tables.
-- 5) RLS hardening: customer order inserts revoked (orders created only via RPC), rider
--    transition-restricted updates, public read of store_settings, customer read-own payments/
--    returns/refunds/notifications, owner-only audit read.
-- 6) Audit triggers on privileged table changes (owner and rider actors).

-- 0) Trusted-role helpers ----------------------------------------------------
create or replace function public.is_raw_hairs_owner()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' in ('owner','admin'), false)
     or coalesce((auth.jwt() -> 'app_metadata' -> 'roles') ?| array['owner','admin'], false);
$$;
revoke all on function public.is_raw_hairs_owner() from public;
grant execute on function public.is_raw_hairs_owner() to authenticated, anon;

create or replace function public.is_raw_hairs_rider()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' in ('driver','rider'), false)
     or coalesce((auth.jwt() -> 'app_metadata' -> 'roles') ?| array['driver','rider'], false);
$$;
revoke all on function public.is_raw_hairs_rider() from public;
grant execute on function public.is_raw_hairs_rider() to authenticated;

-- 1) Kobo columns and backfill ----------------------------------------------
alter table public.products
  add column if not exists price_kobo bigint not null default 0 check (price_kobo >= 0);
alter table public.orders
  add column if not exists subtotal_kobo bigint not null default 0 check (subtotal_kobo >= 0),
  add column if not exists delivery_fee_kobo bigint not null default 0 check (delivery_fee_kobo >= 0),
  add column if not exists total_kobo bigint not null default 0 check (total_kobo >= 0);
alter table public.order_items
  add column if not exists unit_price_kobo bigint not null default 0 check (unit_price_kobo >= 0);

do $$
begin
  -- One-shot backfill from legacy naira columns (guarded so re-runs never overwrite kobo).
  update public.products set price_kobo = round(coalesce(price,0) * 100)::bigint
  where price is not null and price_kobo = 0;
  update public.orders set
    subtotal_kobo = round(coalesce(subtotal,0) * 100)::bigint,
    delivery_fee_kobo = round(coalesce(delivery_fee,0) * 100)::bigint,
    total_kobo = round(coalesce(total,0) * 100)::bigint
  where total is not null and total_kobo = 0;
  update public.order_items set unit_price_kobo = round(coalesce(unit_price,0) * 100)::bigint
  where unit_price is not null and unit_price_kobo = 0;
end $$;

-- Going forward kobo is the source of truth; mirror into legacy naira columns.
create or replace function public.sync_naira_from_kobo()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_table_name = 'products' then
    new.price := round(new.price_kobo / 100.0, 2);
  elsif tg_table_name = 'orders' then
    new.subtotal := round(new.subtotal_kobo / 100.0, 2);
    new.delivery_fee := round(new.delivery_fee_kobo / 100.0, 2);
    new.total := round(new.total_kobo / 100.0, 2);
  elsif tg_table_name = 'order_items' then
    new.unit_price := round(new.unit_price_kobo / 100.0, 2);
  end if;
  return new;
end $$;
drop trigger if exists products_kobo_sync on public.products;
create trigger products_kobo_sync before insert or update on public.products
  for each row execute function public.sync_naira_from_kobo();
drop trigger if exists orders_kobo_sync on public.orders;
create trigger orders_kobo_sync before insert or update on public.orders
  for each row execute function public.sync_naira_from_kobo();
drop trigger if exists order_items_kobo_sync on public.order_items;
create trigger order_items_kobo_sync before insert or update on public.order_items
  for each row execute function public.sync_naira_from_kobo();

-- 2) Orders: guests, checkout fields, approval workflow ----------------------
alter table public.orders
  alter column customer_id drop not null,
  add column if not exists guest_email text,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists delivery_address text,
  add column if not exists delivery_state text,
  add column if not exists delivery_city text,
  add column if not exists delivery_instructions text,
  add column if not exists payment_method text not null default 'paystack'
    check (payment_method in ('paystack','bank_transfer')),
  add column if not exists approved_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check check (status in (
    'awaiting_payment','paid','pending_admin_approval','processing','dispatched',
    'delivered','cancelled','refunded'
  ));
create index if not exists orders_guest_email_idx on public.orders(guest_email);

-- 3) Inventory reservations ---------------------------------------------------
create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  session_token uuid not null default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  quantity integer not null check (quantity > 0),
  expires_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reservations_product_active_idx
  on public.inventory_reservations(product_id)
  where released_at is null and order_id is null;
create index if not exists reservations_expiry_idx
  on public.inventory_reservations(expires_at)
  where released_at is null and order_id is null;
alter table public.inventory_reservations enable row level security;

-- Release expired reservations. SECURITY DEFINER with locked search_path.
-- auth.uid() is null for the caller (job context); rows are system rows, not user rows.
create or replace function public.release_expired_reservations()
returns integer language plpgsql security definer set search_path = ''
as $$
declare freed integer;
begin
  update public.inventory_reservations
     set released_at = now()
   where released_at is null and order_id is null and expires_at < now();
  get diagnostics freed = row_count;
  return freed;
end $$;
revoke all on function public.release_expired_reservations() from public;

-- Availability view (physical / reserved / available), public read-only.
create or replace view public.product_availability as
select p.id as product_id,
       p.stock as physical_stock,
       coalesce((
         select sum(r.quantity) from public.inventory_reservations r
         where r.product_id = p.id and r.released_at is null and r.expires_at > now()
       ), 0) as reserved_stock,
       greatest(p.stock - coalesce((
         select sum(r.quantity) from public.inventory_reservations r
         where r.product_id = p.id and r.released_at is null and r.expires_at > now()
       ), 0), 0) as available_stock
from public.products p;
grant select on public.product_availability to anon, authenticated;

-- Atomic cart reservation: locks each product row (FOR UPDATE) so concurrent
-- buyers cannot reserve the same final unit; rejects duplicates and shortfall.
create or replace function public.reserve_cart_items(
  p_items jsonb,
  p_minutes integer default 15
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
  v_product public.products;
  v_reserved integer;
  v_session uuid := gen_random_uuid();
  v_expires timestamptz := now() + make_interval(mins => greatest(coalesce(p_minutes, 15), 1));
  v_qty integer;
begin
  if jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_items');
  end if;
  -- Reject duplicate product ids (one reservation per product per session).
  if exists (
    select 1
      from jsonb_array_elements(p_items) with ordinality e1(value, ord)
      join jsonb_array_elements(p_items) with ordinality e2(value, ord)
        on e1.value ->> 'product_id' = e2.value ->> 'product_id'
       and e1.ord <> e2.ord
  ) then
    return jsonb_build_object('ok', false, 'error', 'duplicate_product');
  end if;

  for v_item in
    select e.value from jsonb_array_elements(p_items) with ordinality e(value, ord) order by e.ord
  loop
    v_qty := coalesce((v_item ->> 'quantity')::int, 0);
    if v_qty <= 0 then
      return jsonb_build_object('ok', false, 'error', 'invalid_quantity');
    end if;

    select * into v_product
      from public.products
     where id = (v_item ->> 'product_id')::uuid and is_active
       for update;  -- serializes concurrent reservations on the same product

    if not found then
      return jsonb_build_object('ok', false, 'error', 'product_unavailable');
    end if;

    select coalesce(sum(quantity), 0) into v_reserved
      from public.inventory_reservations
     where product_id = v_product.id and released_at is null and expires_at > now();

    if v_product.stock - v_reserved < v_qty then
      return jsonb_build_object('ok', false, 'error', 'insufficient_stock',
                                'available', greatest(v_product.stock - v_reserved, 0));
    end if;

    insert into public.inventory_reservations
      (product_id, session_token, quantity, expires_at, customer_id)
    values (v_product.id, v_session, v_qty, v_expires, auth.uid());
  end loop;

  return jsonb_build_object('ok', true, 'session_token', v_session, 'expires_at', v_expires);
end $$;
revoke all on function public.reserve_cart_items(jsonb, integer) from public;
grant execute on function public.reserve_cart_items(jsonb, integer) to anon, authenticated;

-- Convert an active reservation into an awaiting_payment order.
-- Prices are computed server-side from live products; the client cannot set amounts.
create or replace function public.create_order_from_reservation(
  p_session_token uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_delivery_address text,
  p_delivery_state text,
  p_delivery_city text,
  p_delivery_instructions text,
  p_payment_method text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_subtotal bigint;
  v_fee bigint;
  v_free_above bigint;
  v_order public.orders;
  v_customer uuid := auth.uid();
  v_min_expiry timestamptz;
begin
  if p_payment_method not in ('paystack','bank_transfer') then
    return jsonb_build_object('ok', false, 'error', 'invalid_payment_method');
  end if;
  if coalesce(trim(p_customer_name), '') = '' or coalesce(trim(p_customer_phone), '') = ''
     or coalesce(trim(p_delivery_address), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_checkout_details');
  end if;
  if p_payment_method = 'paystack' and coalesce(trim(p_customer_email), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'email_required_for_paystack');
  end if;
  if not exists (
    select 1 from public.inventory_reservations
     where session_token = p_session_token and released_at is null and order_id is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'reservation_not_found');
  end if;
  if exists (
    select 1 from public.inventory_reservations
     where session_token = p_session_token and released_at is null and order_id is null
       and expires_at < now()
  ) then
    update public.inventory_reservations set released_at = now()
     where session_token = p_session_token and released_at is null and order_id is null;
    return jsonb_build_object('ok', false, 'error', 'reservation_expired');
  end if;

  -- Server-side pricing from live products, row-locked alongside the reservations.
  select sum(r.quantity * p.price_kobo) into v_subtotal
    from public.inventory_reservations r
    join public.products p on p.id = r.product_id and p.is_active
   where r.session_token = p_session_token
     and r.released_at is null and r.order_id is null and r.expires_at > now()
     and exists (
       select 1 from public.products pp
        where pp.id = r.product_id
          and pg_try_advisory_xact_lock(hashtext('rh_price:' || r.product_id::text))
       for update of pp
     );

  if v_subtotal is null or v_subtotal <= 0 then
    return jsonb_build_object('ok', false, 'error', 'pricing_failed');
  end if;

  select coalesce(nullif(settings ->> 'delivery_fee_default', '')::bigint, 0)
    into v_fee
    from public.store_settings where id = 'default';
  select coalesce(nullif(settings ->> 'min_order_free_delivery', '')::bigint, 0)
    into v_free_above
    from public.store_settings where id = 'default';
  if v_free_above > 0 and v_subtotal >= v_free_above then
    v_fee := 0;
  end if;

  select min(expires_at) into v_min_expiry
    from public.inventory_reservations
   where session_token = p_session_token and released_at is null and order_id is null;

  insert into public.orders (
    customer_id, guest_email, customer_name, customer_phone,
    delivery_address, delivery_state, delivery_city, delivery_instructions,
    payment_method, status, currency,
    subtotal_kobo, delivery_fee_kobo, total_kobo, stock_reserved_until
  ) values (
    v_customer,
    case when v_customer is null then lower(trim(p_customer_email)) else null end,
    trim(p_customer_name), trim(p_customer_phone),
    trim(p_delivery_address), nullif(trim(p_delivery_state), ''),
    nullif(trim(p_delivery_city), ''), nullif(trim(p_delivery_instructions), ''),
    p_payment_method, 'awaiting_payment', 'NGN',
    v_subtotal, v_fee, v_subtotal + v_fee, v_min_expiry
  ) returning * into v_order;

  insert into public.order_items (order_id, product_id, product_name, unit_price_kobo, quantity)
  select v_order.id, r.product_id, p.name, p.price_kobo, r.quantity
    from public.inventory_reservations r
    join public.products p on p.id = r.product_id
   where r.session_token = p_session_token
     and r.released_at is null and r.order_id is null;

  update public.inventory_reservations
     set order_id = v_order.id
   where session_token = p_session_token
     and released_at is null and order_id is null;

  return jsonb_build_object(
    'ok', true, 'order_id', v_order.id,
    'total_kobo', v_order.total_kobo,
    'subtotal_kobo', v_order.subtotal_kobo,
    'delivery_fee_kobo', v_order.delivery_fee_kobo
  );
end $$;
revoke all on function public.create_order_from_reservation(uuid, text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_order_from_reservation(uuid, text, text, text, text, text, text, text, text) to anon, authenticated;

-- 4) Payments / returns / refunds / notifications / audit --------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  payment_method text not null check (payment_method in ('paystack','bank_transfer')),
  status text not null default 'pending'
    check (status in ('pending','awaiting_verification','successful','failed','refunded','partially_refunded')),
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
    check (status in ('pending','approved','rejected','returned','refunded','closed')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_notes text
);
create index if not exists returns_order_idx on public.return_requests(order_id);
create index if not exists returns_status_idx on public.return_requests(status);
alter table public.return_requests enable row level security;

create table if not exists public.refund_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  return_request_id uuid references public.return_requests(id),
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'initiated'
    check (status in ('initiated','processing','completed','failed','rejected')),
  channel text,
  provider_reference text,
  initiated_by uuid references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.refund_transactions enable row level security;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  guest_email text,
  channel text not null default 'whatsapp' check (channel in ('whatsapp','email')),
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
create index if not exists notifications_guest_idx on public.notifications(guest_email);
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
create index if not exists audit_record_idx on public.audit_log(table_name, record_id);
alter table public.audit_log enable row level security;

-- Refund amount validation (CHECK cannot contain subqueries): BEFORE INSERT trigger.
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

-- 5) RLS ---------------------------------------------------------------------
-- Orders: customers keep read-own; direct INSERT/UPDATE revoked for customers.
-- Orders can only be created by create_order_from_reservation (SECURITY DEFINER).
drop policy if exists "Customers create own orders" on public.orders;
drop policy if exists "Owner manages orders" on public.orders;
create policy "Owner manages orders" on public.orders
  for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));
create policy "Guests track own orders by email" on public.orders
  for select to anon, authenticated
  using (customer_id is null and guest_email = lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'guest_email', '')));

drop policy if exists "Customers create own order items" on public.order_items;
drop policy if exists "Customers read own order items" on public.order_items;
create policy "Customers read own order items" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o
                  where o.id = order_id and o.customer_id = (select auth.uid())));

-- Riders: transition-restricted updates on assigned jobs only (immutable fields preserved).
drop policy if exists "Rider updates assigned jobs" on public.rider_jobs;
create policy "Rider updates assigned jobs" on public.rider_jobs
  for update to authenticated
  using (rider_id = (select auth.uid()))
  with check (
    rider_id = (select auth.uid())
    and new.rider_id = rider_id
    and new.order_id = order_id
    and new.delivery_otp_hash = delivery_otp_hash
    and new.created_at = created_at
    and (
      (status = 'assigned'   and new.status in ('picked_up','in_transit','delivered','failed'))
      or (status = 'picked_up' and new.status in ('in_transit','delivered','failed'))
      or (status = 'in_transit' and new.status in ('delivered','failed'))
      or new.status = status
    )
  );

-- Reservations: system-managed; customers read their own, owner full.
drop policy if exists "Customers read own reservations" on public.inventory_reservations;
create policy "Customers read own reservations" on public.inventory_reservations
  for select to authenticated
  using (customer_id = (select auth.uid()));
drop policy if exists "Owner manages reservations" on public.inventory_reservations;
create policy "Owner manages reservations" on public.inventory_reservations
  for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));

-- Payments / returns / refunds / notifications: owner full, customer read-own.
create policy "Owner manages payments" on public.payments
  for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));
create policy "Customers read own payments" on public.payments
  for select to authenticated
  using (exists (select 1 from public.orders o
                  where o.id = order_id and o.customer_id = (select auth.uid())));

create policy "Owner manages return requests" on public.return_requests
  for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));
create policy "Customers read own return requests" on public.return_requests
  for select to authenticated
  using (requested_by = (select auth.uid())
     or exists (select 1 from public.orders o
                 where o.id = order_id and o.customer_id = (select auth.uid())));

create policy "Owner manages refunds" on public.refund_transactions
  for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));
create policy "Customers read own refunds" on public.refund_transactions
  for select to authenticated
  using (exists (select 1 from public.payments p
                  where p.id = payment_id
                    and exists (select 1 from public.orders o
                                 where o.id = p.order_id
                                   and o.customer_id = (select auth.uid()))));

create policy "Owner manages notifications" on public.notifications
  for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));
create policy "Customers read own notifications" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owner reads audit log" on public.audit_log
  for select to authenticated
  using ((select public.is_raw_hairs_owner()));

-- store_settings: public read of the default row (fees/contact), owner write.
drop policy if exists "Owner manages store settings" on public.store_settings;
create policy "Owner manages store settings" on public.store_settings
  for all to authenticated
  using ((select public.is_raw_hairs_owner()))
  with check ((select public.is_raw_hairs_owner()));
create policy "Public reads store settings" on public.store_settings
  for select to anon, authenticated
  using (id = 'default');

-- 6) Audit triggers (owner and rider actors; customer self-service not audited) --
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_is_owner boolean := (select public.is_raw_hairs_owner());
  v_is_rider boolean := (select public.is_raw_hairs_rider());
begin
  if not (v_is_owner or v_is_rider) then
    return coalesce(new, old);
  end if;
  insert into public.audit_log (actor, action, table_name, record_id, old_value, new_value)
  values (v_actor, lower(tg_op), tg_table_name,
          coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'), ''),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['products','services','orders','payments','return_requests','refund_transactions','rider_jobs','store_settings','bookings','international_requests']
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_row_change()', t);
  end loop;
end $$;
