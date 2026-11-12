-- =============================================================================
-- RAW HAIRS — Atomic inventory reservation + server-side order creation.
-- Branch: development/phase-1-security-fixes
--
-- Adds:
--   1) Reserved-stock model: products gets reserved_qty; available stock is
--      (stock - reserved_qty). Physical stock is never modified by checkout.
--   2) inventory_reservations table with a 15-minute expiry.
--   3) reserve_inventory() — atomic, concurrency-safe (locked-row update).
--   4) create_order_from_cart() — SECURITY DEFINER RPC that:
--        - prices every line from live DB prices (client prices ignored),
--        - verifies product active + available stock,
--        - creates reservation + order + order_items in one transaction,
--        - accepts guest or signed-in customer identity,
--        - CANNOT set paid/approved status (always awaiting_payment).
--   5) release_expired_reservations() — releases expired stock; callable by
--      pg_cron (configure later) or the API.
--
-- All monetary values are integer kobo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Reserved-stock columns + reservations table
-- -----------------------------------------------------------------------------
alter table public.products
  add column if not exists reserved_qty integer not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_reserved_qty_check') then
    alter table public.products add constraint products_reserved_qty_check check (reserved_qty >= 0);
  end if;
end $$;

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  selected_length text,
  quantity integer not null check (quantity > 0),
  status text not null default 'active'
    check (status in ('active', 'consumed', 'released')),
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists reservations_active_idx
  on public.inventory_reservations(status, expires_at);
create index if not exists reservations_product_idx
  on public.inventory_reservations(product_id, status);

alter table public.inventory_reservations enable row level security;
-- No client write policies: reservations are created/consumed/released only
-- by the SECURITY DEFINER functions below. Owner may inspect via admin API.
create policy "Owner reads reservations"
  on public.inventory_reservations for select to authenticated
  using ((select public.is_raw_hairs_owner()));

-- -----------------------------------------------------------------------------
-- 2) Reservation window (15 minutes, server-controlled)
-- -----------------------------------------------------------------------------
create or replace function public.reservation_window_minutes()
returns integer language sql stable set search_path = '' as $$
  select 15;
$$;
revoke all on function public.reservation_window_minutes() from public;
grant execute on function public.reservation_window_minutes() to authenticated;

-- -----------------------------------------------------------------------------
-- 3) release_expired_reservations() — return expired stock to available
-- -----------------------------------------------------------------------------
create or replace function public.release_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  released integer := 0;
begin
  update public.products p
     set reserved_qty = greatest(0, p.reserved_qty - x.qty)
  from (
    select product_id, sum(quantity) as qty
    from public.inventory_reservations
    where status = 'active' and expires_at < now()
    group by product_id
  ) x
  where p.id = x.product_id;

  get diagnostics released = row_count;

  update public.inventory_reservations
     set status = 'released'
   where status = 'active' and expires_at < now();

  return released;
end;
$$;
revoke all on function public.release_expired_reservations() from public;
grant execute on function public.release_expired_reservations() to authenticated;

-- -----------------------------------------------------------------------------
-- 4) reserve_inventory() — atomic stock reservation (single locked UPDATE)
--    The conditional UPDATE (stock - reserved - qty >= 0) is the concurrency
--    guard: two concurrent buyers cannot both take the last unit.
-- -----------------------------------------------------------------------------
create or replace function public.reserve_inventory(
  p_product_id uuid,
  p_quantity integer,
  p_selected_length text default null,
  p_order_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_expires timestamptz := now() + (public.reservation_window_minutes() || ' minutes')::interval;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  -- Reserve first (in the same transaction), then flip products.reserved_qty
  -- conditionally. If the update affects no row, another buyer won the race
  -- and the whole transaction rolls back (reservation included) — no partial
  -- state, no overselling.
  insert into public.inventory_reservations (product_id, quantity, selected_length, order_id, expires_at)
  values (p_product_id, p_quantity, p_selected_length, p_order_id, v_expires)
  returning id into v_id;

  update public.products p
     set reserved_qty = p.reserved_qty + p_quantity
   where p.id = p_product_id
     and p.is_active
     and (p.stock - p.reserved_qty - p_quantity) >= 0;

  if not found then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  return v_id;
end;
$$;
revoke all on function public.reserve_inventory(uuid, integer, text, uuid) from public;
grant execute on function public.reserve_inventory(uuid, integer, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5) create_order_from_cart() — the ONLY way customers/guests create orders.
--    Client-supplied prices are ignored: every line is priced from the live
--    products.price_kobo. Status is always awaiting_payment; is_paid stays
--    false. Delivery fee is provided by the server checkout API (validated
--    against store_settings in Phase 3; direct callers may only pass 0+).
-- -----------------------------------------------------------------------------
create type if not exists public.cart_item_input as (
  product_id uuid,
  quantity integer,
  selected_length text
);

create or replace function public.create_order_from_cart(
  p_items public.cart_item_input[],
  p_name text,
  p_phone text,
  p_email text default null,
  p_address text default null,
  p_state text default null,
  p_city text default null,
  p_instructions text default null,
  p_payment_method text default 'paystack',
  p_delivery_fee_kobo bigint default 0
)
returns table (order_id uuid, total_kobo bigint, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid := (select auth.uid());
  v_order uuid;
  v_subtotal bigint := 0;
  v_total bigint;
  v_delivery bigint := greatest(coalesce(p_delivery_fee_kobo, 0), 0);
  v_method text := coalesce(nullif(p_payment_method, ''), 'paystack');
  v_expires timestamptz;
  v_lines integer := 0;
begin
  -- ---- validation ----------------------------------------------------------
  if v_method not in ('paystack', 'bank_transfer') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;
  if coalesce(array_length(p_items, 1), 0) = 0 then
    raise exception 'EMPTY_CART';
  end if;
  if array_length(p_items, 1) > 20 then
    raise exception 'TOO_MANY_ITEMS';
  end if;
  if coalesce(nullif(trim(p_name), ''), '') = '' or coalesce(nullif(trim(p_phone), ''), '') = '' then
    raise exception 'MISSING_CONTACT';
  end if;
  if v_customer is null and coalesce(nullif(trim(p_email), ''), '') = '' then
    raise exception 'GUEST_EMAIL_REQUIRED';
  end if;

  -- ---- create the order shell (never paid, never approved) ----------------
  insert into public.orders (
    customer_id, guest_name, guest_phone, guest_email,
    delivery_address, delivery_state, delivery_city, delivery_instructions,
    payment_method, status,
    subtotal_kobo, delivery_fee_kobo, total_kobo,
    stock_reserved_until
  ) values (
    v_customer,
    nullif(trim(coalesce(p_name, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_state, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_instructions, '')), ''),
    v_method, 'awaiting_payment',
    0, v_delivery, 0,
    now() + (public.reservation_window_minutes() || ' minutes')::interval
  )
  returning id, stock_reserved_until into v_order, v_expires;

  -- ---- snapshot lines with LIVE prices, then reserve stock ----------------
  -- Aggregate duplicate product lines so each product is reserved once.
  with merged as (
    select product_id,
           sum(quantity)::int as quantity,
           min(selected_length) as selected_length
    from unnest(p_items)
    group by product_id
  )
  insert into public.order_items (order_id, product_id, product_name, selected_length, quantity, unit_price_kobo)
  select
    v_order, m.product_id, p.name, m.selected_length, m.quantity, p.price_kobo
  from merged m
  join public.products p on p.id = m.product_id
  where p.is_active;

  get diagnostics v_lines = row_count;
  if v_lines <> (select count(distinct product_id) from unnest(p_items)) then
    raise exception 'PRODUCT_UNAVAILABLE';
  end if;

  perform public.reserve_inventory(
    m.product_id, m.quantity, m.selected_length, v_order
  )
  from (
    select product_id, sum(quantity)::int as quantity, min(selected_length) as selected_length
    from unnest(p_items) group by product_id
  ) m;

  -- ---- compute totals from the inserted items ------------------------------
  select coalesce(sum(unit_price_kobo * quantity), 0) into v_subtotal
    from public.order_items where order_id = v_order;

  v_total := v_subtotal + v_delivery;

  update public.orders
     set subtotal_kobo = v_subtotal,
         delivery_fee_kobo = v_delivery,
         total_kobo = v_total,
         updated_at = now()
   where id = v_order;

  return query select v_order, v_total, v_expires;
end;
$$;
revoke all on function public.create_order_from_cart(public.cart_item_input[], text, text, text, text, text, text, text, text, bigint) from public;
grant execute on function public.create_order_from_cart(public.cart_item_input[], text, text, text, text, text, text, text, text, bigint) to authenticated, anon;

-- -----------------------------------------------------------------------------
-- 6) consume_reservation_on_payment() — reserved -> sold on VERIFIED payment.
--    Called server-side (service role) after Paystack verification or admin
--    bank-transfer verification. Physical stock deducted exactly once, order
--    moves to awaiting_approval (paid ≠ approved; admin approval comes next).
-- -----------------------------------------------------------------------------
create or replace function public.consume_reservation_on_payment(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products p
     set stock = greatest(0, p.stock - r.qty),
         reserved_qty = greatest(0, p.reserved_qty - r.qty)
  from (
    select product_id, sum(quantity) as qty
    from public.inventory_reservations
    where order_id = p_order_id and status = 'active'
    group by product_id
  ) r
  where p.id = r.product_id;

  update public.inventory_reservations
     set status = 'consumed'
   where order_id = p_order_id and status = 'active';

  update public.orders
     set is_paid = true,
         paid_at = now(),
         status = 'awaiting_approval',
         stock_reserved_until = null,
         updated_at = now()
   where id = p_order_id
     and status = 'awaiting_payment';
end;
$$;
revoke all on function public.consume_reservation_on_payment(uuid) from public;
-- Service role only: never granted to anon/authenticated.

-- -----------------------------------------------------------------------------
-- 7) release_order_reservation() — cancel/expiry cleanup
-- -----------------------------------------------------------------------------
create or replace function public.release_order_reservation(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products p
     set reserved_qty = greatest(0, p.reserved_qty - r.qty)
  from (
    select product_id, sum(quantity) as qty
    from public.inventory_reservations
    where order_id = p_order_id and status = 'active'
    group by product_id
  ) r
  where p.id = r.product_id;

  update public.inventory_reservations
     set status = 'released'
   where order_id = p_order_id and status = 'active';

  update public.orders
     set stock_reserved_until = null, updated_at = now()
   where id = p_order_id and status = 'awaiting_payment';
end;
$$;
revoke all on function public.release_order_reservation(uuid) from public;
grant execute on function public.release_order_reservation(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8) Guest receipt lookup (safe, non-enumerable)
-- -----------------------------------------------------------------------------
create or replace function public.guest_order_receipt(
  p_order_id uuid,
  p_email text
)
returns table (id uuid, status text, total_kobo bigint, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select o.id, o.status, o.total_kobo, o.created_at
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
    and lower(o.guest_email) = lower(trim(p_email));
end;
$$;
revoke all on function public.guest_order_receipt(uuid, text) from public;
grant execute on function public.guest_order_receipt(uuid, text) to anon, authenticated;
