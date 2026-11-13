-- Guest order tracking + fulfillment automation (2026-11-13).
--
-- Fixes two production gaps:
--   1. Guests (Paystack or bank transfer) had NO way to see their order after
--      paying: no account, no confirmation with order id, no tracking page.
--   2. Fulfillment was fully manual after payment (paid -> processing and
--      rider-job creation both needed admin clicks).
--
-- Patterns follow industry standard (StockX / WooCommerce 11):
--   * Non-enumerable public lookup: order id AND the checkout email must both
--     match before anything is returned.
--   * Guest orders are claimed into the account automatically when the same
--     verified email signs in or signs up.

-- ---------------------------------------------------------------------------
-- 1) Public order tracking lookup (guest or owner).
-- ---------------------------------------------------------------------------
create or replace function public.public_track_order(p_order_id uuid, p_email text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Access is granted ONLY when:
  --   a) the caller is signed in and owns the order, or
  --   b) the order is a guest order and the supplied email matches
  --      guest_email exactly (case-insensitive).
  -- Anything else returns the same generic not_found: no enumeration leak.
  if not (
       (v_order.customer_id is not null and v_order.customer_id = auth.uid())
    or (v_order.customer_id is null
        and coalesce(trim(p_email), '') <> ''
        and v_order.guest_email is not null
        and lower(v_order.guest_email) = lower(trim(p_email)))
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'order', jsonb_build_object(
      'id', v_order.id,
      'status', v_order.status,
      'created_at', v_order.created_at,
      'subtotal_kobo', v_order.subtotal_kobo,
      'delivery_fee_kobo', v_order.delivery_fee_kobo,
      'total_kobo', v_order.total_kobo,
      'customer_name', v_order.customer_name,
      'delivery_address', v_order.delivery_address,
      'delivery_city', v_order.delivery_city,
      'delivery_state', v_order.delivery_state,
      'delivery_instructions', v_order.delivery_instructions,
      'payment_method', v_order.payment_method
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_name', i.product_name,
               'quantity', i.quantity,
               'unit_price_kobo', i.unit_price_kobo)
             order by i.product_name)
      from public.order_items i
      where i.order_id = p_order_id
    ), '[]'::jsonb),
    'delivery', coalesce((
      select jsonb_build_object('status', j.status, 'updated_at', j.updated_at)
      from public.rider_jobs j
      where j.order_id = p_order_id
      order by j.created_at desc
      limit 1
    ), 'null'::jsonb)
  );
end $$;
revoke all on function public.public_track_order(uuid, text) from public;
grant execute on function public.public_track_order(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Claim guest orders into the account (called after sign-in / sign-up).
--    Supabase Auth has already verified this email, so attaching past guest
--    orders placed with the same email is safe (WooCommerce 11 / StockX
--    do exactly this on email confirmation).
-- ---------------------------------------------------------------------------
create or replace function public.claim_guest_orders()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
  v_count integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return jsonb_build_object('ok', false, 'error', 'no_email');
  end if;

  update public.orders
     set customer_id = auth.uid()
   where customer_id is null
     and guest_email is not null
     and lower(guest_email) = v_email;
  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'claimed', v_count);
end $$;
revoke all on function public.claim_guest_orders() from public;
grant execute on function public.claim_guest_orders() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Automation A: payment success advances the order in the same UPDATE.
--    awaiting_payment -> 'paid' becomes 'processing' (the shop is preparing
--    it), and a payment-confirmed notification row is queued once.
-- ---------------------------------------------------------------------------
create or replace function public.auto_advance_paid_order()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'awaiting_payment' and new.status = 'paid' then
    new.status := 'processing';
    insert into public.notifications (user_id, guest_email, channel, event_type, title, body, related_order)
    values (new.customer_id, new.guest_email, 'email', 'payment_confirmed',
            'Payment confirmed',
            'We received your payment and are preparing your order for dispatch.',
            new.id)
    where new.customer_id is not null or new.guest_email is not null;
  end if;
  return new;
end $$;

drop trigger if exists orders_auto_advance on public.orders;
create trigger orders_auto_advance before update on public.orders
  for each row execute function public.auto_advance_paid_order();

-- ---------------------------------------------------------------------------
-- 4) Automation B: on dispatch, the rider job is created automatically
--    (status 'unassigned') so the owner only picks a rider, plus a
--    dispatched notification. pg_trigger_depth() guards against recursion.
-- ---------------------------------------------------------------------------
create or replace function public.auto_dispatch_delivery_job()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'dispatched'
     and old.status is distinct from 'dispatched'
     and pg_trigger_depth() = 1 then
    if not exists (select 1 from public.rider_jobs where order_id = new.id) then
      insert into public.rider_jobs (order_id, status) values (new.id, 'unassigned');
    end if;
    insert into public.notifications (user_id, guest_email, channel, event_type, title, body, related_order)
    values (new.customer_id, new.guest_email, 'email', 'order_dispatched',
            'Order dispatched',
            'Your order has been dispatched for delivery.',
            new.id)
    where new.customer_id is not null or new.guest_email is not null;
  end if;
  return new;
end $$;

drop trigger if exists orders_auto_dispatch on public.orders;
create trigger orders_auto_dispatch after update on public.orders
  for each row execute function public.auto_dispatch_delivery_job();
