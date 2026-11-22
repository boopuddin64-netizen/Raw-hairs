-- Allow the server (service role) to confirm/reject bank-transfer payments
-- through /api/admin/confirm-transfer, mirroring assign_rider_job. Browser
-- callers are unchanged: anon cannot execute, and authenticated callers still
-- need is_raw_hairs_owner() inside the function.
--
-- NOTE: this function already existed on the live database (applied directly
-- on 2026-11-12, drift item) but only allowed JWT-owner callers, which the
-- cookie-session admin API cannot satisfy. This migration aligns the repo
-- with the live database.
create or replace function public.admin_confirm_bank_transfer(p_payment_id uuid, p_confirmed boolean, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_payment public.payments;
  v_order public.orders;
begin
  if v_role <> 'service_role' and not (select public.is_raw_hairs_owner()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_payment from public.payments
   where id = p_payment_id and payment_method = 'bank_transfer'
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'payment_not_found');
  end if;
  if v_payment.status <> 'awaiting_verification' then
    return jsonb_build_object('ok', false, 'error', 'payment_not_pending_verification');
  end if;

  select * into v_order from public.orders
   where id = v_payment.order_id and status = 'awaiting_payment'
   for update;
  if not found then
    update public.payments
       set status = 'failed', failure_reason = 'order_not_awaiting_payment'
     where id = v_payment.id;
    return jsonb_build_object('ok', false, 'error', 'order_not_awaiting_payment');
  end if;

  if p_confirmed then
    update public.payments
       set status = 'successful',
           verified_by = auth.uid(),
           verified_at = now(),
           provider_response = provider_response || jsonb_build_object('admin_note', p_note)
     where id = p_payment_id;

    update public.products p
       set stock = greatest(0, p.stock - r.qty)
      from (
        select product_id, sum(quantity) as qty
        from public.inventory_reservations
        where order_id = v_order.id and released_at is null
        group by product_id
      ) r
     where p.id = r.product_id;

    update public.inventory_reservations
       set released_at = now()
     where order_id = v_order.id and released_at is null;

    update public.orders
       set status = 'pending_admin_approval', stock_reserved_until = null
     where id = v_order.id;

    return jsonb_build_object('ok', true, 'result', 'confirmed', 'order_id', v_order.id);
  else
    update public.payments
       set status = 'failed',
           failure_reason = coalesce(p_note, 'rejected_by_admin'),
           verified_by = auth.uid(), verified_at = now()
     where id = p_payment_id;
    return jsonb_build_object('ok', true, 'result', 'rejected', 'order_id', v_order.id);
  end if;
end $$;
