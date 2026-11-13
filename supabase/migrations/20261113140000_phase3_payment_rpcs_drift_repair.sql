-- RAW HAIRS Phase 3 (checkout) - DRIFT REPAIR.
--
-- The live database received Phase 3 (payment RPCs + payments wiring) directly
-- in 2026-11-12; no migration file was committed. This file reconstructs those
-- objects so a database rebuilt from supabase/migrations/ alone reproduces the
-- production schema. The live DB already has equivalent objects, so every
-- statement is idempotent (or drop-and-recreate safe for functions).
--
-- Reconstructed from verified live behavior:
--   * register_payment_intent(order_id)   -> { ok, payment_id, reference, amount_kobo }
--       called by src/lib/checkout.js; grants to anon + authenticated.
--   * submit_bank_transfer_receipt(...)  -> { ok, payment_id, status }
--       inserts a payments row with status 'awaiting_verification'.
--   * mark_payment_successful(p_reference, p_amount_kobo, p_provider_response)
--       -> { ok, status }; flips order awaiting_payment -> paid; idempotent on
--       repeated webhook/callback calls (same reference).
--   * guest_order_receipt(p_order_id, p_email) -> { ok, order, items, payments }
--       non-enumerable guest lookup: order id AND guest email must match.
--
-- Money is integer kobo everywhere; the client never sends amounts.
-- The payments table and its RLS already ship in
-- 20261112190030_phase_1_corrected_part3.sql; only the RPCs were missing.

-- ---------------------------------------------------------------------------
-- 1) register_payment_intent: create (or reuse) a pending payments row for an
--    order and return a unique Paystack reference.
-- ---------------------------------------------------------------------------
create or replace function public.register_payment_intent(p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_payment public.payments;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_your_order');
  end if;

  -- Ownership: signed-in owners only; guest orders (customer_id is null) are
  -- intentionally allowed so guest checkout works.
  if v_order.customer_id is not null and v_order.customer_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'not_your_order');
  end if;

  if v_order.status <> 'awaiting_payment' then
    return jsonb_build_object('ok', false, 'error', 'order_not_payable');
  end if;

  -- Reuse a still-pending payment for this order; otherwise create one.
  select * into v_payment
    from public.payments
   where order_id = p_order_id and status = 'pending'
   order by created_at desc limit 1;

  if not found then
    insert into public.payments (order_id, payment_method, status, amount_kobo, currency, reference)
    values (
      p_order_id,
      v_order.payment_method,
      'pending',
      v_order.total_kobo,
      'NGN',
      -- Provider-safe unique reference, e.g. RAWHAIRS-<order prefix>-<random>
      'RAWHAIRS-' || substr(replace(p_order_id::text, '-', ''), 1, 12) || '-' ||
        substr(encode(gen_random_bytes(8), 'hex'), 1, 10)
    )
    returning * into v_payment;
  end if;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment.id,
    'reference', v_payment.reference,
    'amount_kobo', v_payment.amount_kobo
  );
end $$;
revoke all on function public.register_payment_intent(uuid) from public;
grant execute on function public.register_payment_intent(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) submit_bank_transfer_receipt: customer submits transfer details; the
--    payment moves to awaiting_verification and the OWNER verifies it in the
--    console (never auto-verified).
-- ---------------------------------------------------------------------------
create or replace function public.submit_bank_transfer_receipt(
  p_order_id uuid,
  p_sender_name text,
  p_bank text,
  p_transfer_reference text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_payment public.payments;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_your_order');
  end if;
  if v_order.customer_id is not null and v_order.customer_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'not_your_order');
  end if;
  if v_order.status <> 'awaiting_payment' then
    return jsonb_build_object('ok', false, 'error', 'order_not_payable');
  end if;
  if v_order.payment_method <> 'bank_transfer' then
    return jsonb_build_object('ok', false, 'error', 'order_not_bank_transfer');
  end if;
  if coalesce(trim(p_sender_name), '') = '' or coalesce(trim(p_bank), '') = ''
     or coalesce(trim(p_transfer_reference), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_checkout_details');
  end if;

  select * into v_payment
    from public.payments
   where order_id = p_order_id and status = 'pending'
   order by created_at desc limit 1;

  if not found then
    insert into public.payments (order_id, payment_method, status, amount_kobo, currency, reference)
    values (p_order_id, 'bank_transfer', 'pending', v_order.total_kobo, 'NGN',
            'BANK-' || substr(replace(p_order_id::text, '-', ''), 1, 12) || '-' ||
              substr(encode(gen_random_bytes(8), 'hex'), 1, 10))
    returning * into v_payment;
  end if;

  update public.payments
     set status = 'awaiting_verification',
         provider = p_bank,
         failure_reason = null,
         provider_response = jsonb_build_object(
           'sender_name', trim(p_sender_name),
           'bank', trim(p_bank),
           'transfer_reference', trim(p_transfer_reference),
           'submitted_at', now()
         ),
         updated_at = now()
   where id = v_payment.id;

  return jsonb_build_object('ok', true, 'payment_id', v_payment.id, 'status', 'awaiting_verification');
end $$;
revoke all on function public.submit_bank_transfer_receipt(uuid, text, text, text) from public;
grant execute on function public.submit_bank_transfer_receipt(uuid, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) mark_payment_successful: the ONLY way an order flips to paid. Called by
--    the server (service role) from the webhook and the customer callback;
--    idempotent — repeating with the same reference is a no-op.
-- ---------------------------------------------------------------------------
create or replace function public.mark_payment_successful(
  p_reference text,
  p_amount_kobo bigint,
  p_provider_response jsonb default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where reference = p_reference;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'payment_not_found');
  end if;

  -- Idempotency: an already-processed reference returns success unchanged.
  if v_payment.status = 'successful' then
    return jsonb_build_object('ok', true, 'status', 'successful');
  end if;

  if v_payment.status = 'failed' then
    return jsonb_build_object('ok', false, 'error', 'payment_previously_failed');
  end if;

  -- Amount must match the recorded intent (verified server-side against
  -- Paystack before this call).
  if p_amount_kobo is distinct from v_payment.amount_kobo then
    return jsonb_build_object('ok', false, 'error', 'amount_mismatch');
  end if;

  update public.payments
     set status = 'successful',
         provider_response = coalesce(p_provider_response, provider_response),
         verified_at = now(),
         updated_at = now()
   where id = v_payment.id;

  update public.orders
     set status = 'paid', updated_at = now()
   where id = v_payment.order_id
     and status = 'awaiting_payment';

  return jsonb_build_object('ok', true, 'status', 'successful');
end $$;
revoke all on function public.mark_payment_successful(text, bigint, jsonb) from public;
-- Executed only through the server (service role) via the admin/payment API;
-- NOT granted to anon or authenticated.

-- ---------------------------------------------------------------------------
-- 4) guest_order_receipt: order id + guest email must BOTH match (WooCommerce /
--    StockX non-enumerable lookup pattern). Returns order + items + payment
--    status only — no rider data, no other customers' rows.
-- ---------------------------------------------------------------------------
create or replace function public.guest_order_receipt(
  p_order_id uuid,
  p_email text
)
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

  -- Guest orders only, and the supplied email must match guest_email exactly
  -- (case-insensitive). Signed-in customers use their RLS-scoped Account page.
  if v_order.customer_id is not null
     or v_order.guest_email is null
     or lower(v_order.guest_email) <> lower(trim(p_email)) then
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
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('status', p2.status, 'reference', p2.reference))
      from public.payments p2
      where p2.order_id = p_order_id
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.guest_order_receipt(uuid, text) from public;
grant execute on function public.guest_order_receipt(uuid, text) to anon, authenticated;
