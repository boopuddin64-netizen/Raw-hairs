-- Recovery + service-role alignment for advance_order_status (2026-11-13).
--
-- Two changes, both already applied to the live database:
--   1. paid -> processing (and paid -> cancelled) transitions, so an order
--      whose payment was recovered outside the normal checkout flow (webhook
--      replay / manual verification) can never be stranded on 'paid'.
--   2. service_role callers are allowed (mirroring assign_rider_job and
--      admin_confirm_bank_transfer) so the server-side admin API can call it.
--
-- This function existed only on the live database before (drift item); this
-- migration brings it into the repo so a rebuild matches production.
create or replace function public.advance_order_status(p_order_id uuid, p_new_status text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_order public.orders;
begin
  if v_role <> 'service_role' and not (select public.is_raw_hairs_owner()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_order from public.orders
   where id = p_order_id and status <> 'cancelled' and status <> 'refunded'
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  if not (
       (v_order.status = 'pending_admin_approval' and p_new_status = 'processing')
    or (v_order.status = 'paid'                and p_new_status = 'processing')
    or (v_order.status = 'processing'          and p_new_status = 'dispatched')
    or (v_order.status = 'dispatched'          and p_new_status = 'delivered')
    or (v_order.status = 'awaiting_payment'    and p_new_status = 'cancelled')
    or (v_order.status = 'pending_admin_approval' and p_new_status = 'cancelled')
    or (v_order.status = 'paid'                and p_new_status = 'cancelled')
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_transition',
                              'from', v_order.status, 'to', p_new_status);
  end if;

  update public.orders
     set status = p_new_status,
         approved_at = case when v_order.status in ('pending_admin_approval', 'paid')
                            and p_new_status = 'processing' then now()
                            else approved_at end,
         cancelled_at = case when p_new_status = 'cancelled' then now() else cancelled_at end,
         cancel_reason = case when p_new_status = 'cancelled' then 'cancelled_by_owner' else cancel_reason end
   where id = p_order_id;

  -- Cancelling an unpaid order releases its reserved stock.
  if p_new_status = 'cancelled' then
    update public.inventory_reservations
       set released_at = now()
     where order_id = p_order_id and released_at is null;
    update public.orders
       set stock_reserved_until = null
     where id = p_order_id;
  end if;

  return jsonb_build_object('ok', true, 'order_id', p_order_id, 'status', p_new_status);
end $$;
