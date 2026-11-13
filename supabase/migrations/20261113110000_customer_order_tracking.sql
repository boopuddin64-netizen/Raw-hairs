-- Customer order tracking support.
--
-- 1. Publish the orders table to the realtime publication so the customer
--    tracking page can subscribe to status changes (RLS still applies:
--    a customer only receives changes to their own rows).
-- 2. Expose the delivery status of the customer's OWN order. Customers cannot
--    read public.rider_jobs directly (riders/owner only, by RLS), so a
--    security-definer RPC returns just the job status after verifying the
--    caller owns the order. No rider identity is ever exposed.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.orders;
    exception when duplicate_object then null; -- already published
    end;
  end if;
end $$;

create or replace function public.customer_order_delivery(p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_job public.rider_jobs;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.customer_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select status, updated_at into v_job
    from public.rider_jobs
   where order_id = p_order_id
   order by created_at desc
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'job', jsonb_build_object('status', v_job.status, 'updated_at', v_job.updated_at)
  );
end $$;
revoke all on function public.customer_order_delivery(uuid) from public;
grant execute on function public.customer_order_delivery(uuid) to authenticated;
