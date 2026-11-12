-- RAW HAIRS Phase 1 - CORRECTED, part 2 of 4
-- Matches live database. Apply after part 1 / 1b.
-- Inventory reservations, expiry release, availability view, and the two
-- checkout RPCs (atomic reservation, server-priced order creation).
--
-- NOTE: this version already incorporates the fix the live database received
-- as migration `fix_order_rpc_delivery_fee_null` (scalar-subquery fee lookup:
-- an empty store_settings row means delivery fee 0, never NULL).

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

-- Atomic cart reservation: per-product FOR UPDATE row lock prevents overselling.
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
       for update;

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

-- Reservation -> order. Prices computed from live products; client never sets amounts.
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
  if p_payment_method not in ('paystack', 'bank_transfer') then
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

  select sum(r.quantity * p.price_kobo) into v_subtotal
    from public.inventory_reservations r
    join public.products p on p.id = r.product_id
   where r.session_token = p_session_token
     and r.released_at is null and r.order_id is null and r.expires_at > now()
     and p.is_active;

  if v_subtotal is null or v_subtotal <= 0 then
    return jsonb_build_object('ok', false, 'error', 'pricing_failed');
  end if;

  -- Scalar subqueries: empty store_settings means fee = 0, never NULL.
  v_fee := coalesce((
    select nullif(s.settings ->> 'delivery_fee_default', '')::bigint
    from public.store_settings s where s.id = 'default'
  ), 0);
  v_free_above := coalesce((
    select nullif(s.settings ->> 'min_order_free_delivery', '')::bigint
    from public.store_settings s where s.id = 'default'
  ), 0);
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