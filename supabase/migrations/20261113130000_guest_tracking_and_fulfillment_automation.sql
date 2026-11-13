-- Guest order tracking + fulfillment automation (corrected 2026-11-13).
-- Fixes the invalid INSERT ... VALUES ... WHERE from the first version: the
-- guard conditions now live inside the trigger bodies as IF statements.
-- Trigger functions are revoked from public/anon/authenticated so they cannot
-- be invoked directly through the API.

-- 1) Public order tracking lookup (guest or owner): order id AND email must match.
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

-- 2) Claim guest orders into the account (same verified email on sign-in).
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

-- 3) Automation: payment success advances awaiting_payment -> paid -> processing
--    and queues a payment-confirmed notification.
create or replace function public.auto_advance_paid_order()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'awaiting_payment' and new.status = 'paid' then
    new.status := 'processing';
    if new.customer_id is not null or new.guest_email is not null then
      insert into public.notifications (user_id, guest_email, channel, event_type, title, body, related_order)
      values (new.customer_id, new.guest_email, 'email', 'payment_confirmed',
              'Payment confirmed',
              'We received your payment and are preparing your order for dispatch.',
              new.id);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.auto_advance_paid_order() from public, anon, authenticated;

drop trigger if exists orders_auto_advance on public.orders;
create trigger orders_auto_advance before update on public.orders
  for each row execute function public.auto_advance_paid_order();

-- 4) Automation: dispatch auto-creates the rider job (unassigned) and queues
--    a dispatched notification. pg_trigger_depth() guards against recursion.
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
    if new.customer_id is not null or new.guest_email is not null then
      insert into public.notifications (user_id, guest_email, channel, event_type, title, body, related_order)
      values (new.customer_id, new.guest_email, 'email', 'order_dispatched',
              'Order dispatched',
              'Your order has been dispatched for delivery.',
              new.id);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.auto_dispatch_delivery_job() from public, anon, authenticated;

drop trigger if exists orders_auto_dispatch on public.orders;
create trigger orders_auto_dispatch after update on public.orders
  for each row execute function public.auto_dispatch_delivery_job();
