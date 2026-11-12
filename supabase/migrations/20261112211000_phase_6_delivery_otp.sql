-- RAW HAIRS Phase 6 - rider assignment, delivery OTP, photo evidence
-- Owner assigns a rider job; a 6-digit OTP is generated ONCE and returned to
-- the owner (to share with the customer). Only its SHA-256 hash is stored.
-- The rider marks delivery with the OTP; the photo evidence goes to a
-- dedicated storage bucket whose RLS scopes each rider to their own jobs.

-- 1) Assignment (owner-only, or service role via the admin API).
create or replace function public.assign_rider_job(
  p_job_id uuid,
  p_rider_email text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_rider uuid;
  v_job public.rider_jobs;
  v_otp text;
  v_hash text;
begin
  if v_role <> 'service_role' and not (select public.is_raw_hairs_owner()) then
    return jsonb_build_object('ok', false, 'error', 'owner_only');
  end if;

  select id into v_rider from auth.users
   where lower(email) = lower(trim(p_rider_email));
  if v_rider is null then
    return jsonb_build_object('ok', false, 'error', 'rider_not_found');
  end if;

  select * into v_job from public.rider_jobs where id = p_job_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'job_not_found');
  end if;
  if v_job.status not in ('unassigned', 'assigned') then
    return jsonb_build_object('ok', false, 'error', 'job_in_progress');
  end if;

  v_otp := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_hash := encode(digest(v_otp, 'sha256'), 'hex');

  update public.rider_jobs
     set rider_id = v_rider,
         status = 'assigned',
         delivery_otp_hash = v_hash,
         updated_at = now()
   where id = p_job_id;

  return jsonb_build_object('ok', true, 'job_id', p_job_id, 'rider_id', v_rider, 'otp', v_otp);
end $$;
revoke all on function public.assign_rider_job(uuid, text) from public;
-- Executed only through the owner-session admin API (service role).

-- 2) Delivery confirmation: rider (or owner) submits the OTP.
create or replace function public.confirm_delivery_otp(
  p_job_id uuid,
  p_otp text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_job public.rider_jobs;
begin
  select * into v_job from public.rider_jobs where id = p_job_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'job_not_found');
  end if;
  if v_role <> 'service_role' and not (select public.is_raw_hairs_owner())
     and v_job.rider_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'error', 'not_your_job');
  end if;
  if v_job.status <> 'in_transit' then
    return jsonb_build_object('ok', false, 'error', 'invalid_state');
  end if;
  if coalesce(p_otp, '') = '' or v_job.delivery_otp_hash is null
     or encode(digest(p_otp, 'sha256'), 'hex') <> v_job.delivery_otp_hash then
    return jsonb_build_object('ok', false, 'error', 'wrong_otp');
  end if;

  update public.rider_jobs
     set status = 'delivered', updated_at = now()
   where id = p_job_id;

  update public.orders
     set status = 'delivered', updated_at = now()
   where id = v_job.order_id and status in ('processing', 'dispatched');

  insert into public.notifications (user_id, channel, event_type, title, body, related_order)
  select o.customer_id, 'whatsapp', 'order_delivered', 'Order delivered',
         'Your order was delivered. Thank you for shopping with RAW HAIRS.', o.id
    from public.orders o where o.id = v_job.order_id and o.customer_id is not null;

  return jsonb_build_object('ok', true, 'status', 'delivered');
end $$;
revoke all on function public.confirm_delivery_otp(uuid, text) from public;
grant execute on function public.confirm_delivery_otp(uuid, text) to authenticated;

-- 3) Photo evidence pointer (rider attaches path after uploading to storage).
create or replace function public.mark_delivery_photo(
  p_job_id uuid,
  p_path text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_job public.rider_jobs;
begin
  select * into v_job from public.rider_jobs where id = p_job_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'job_not_found');
  end if;
  if not (select public.is_raw_hairs_owner()) and v_job.rider_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'error', 'not_your_job');
  end if;
  if v_job.status not in ('in_transit', 'delivered') then
    return jsonb_build_object('ok', false, 'error', 'invalid_state');
  end if;
  if p_path is null or p_path !~ ('^jobs/' || p_job_id::text || '/[A-Za-z0-9._-]+$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_path');
  end if;

  update public.rider_jobs
     set delivery_photo_path = p_path, updated_at = now()
   where id = p_job_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.mark_delivery_photo(uuid, text) from public;
grant execute on function public.mark_delivery_photo(uuid, text) to authenticated;

-- 4) Evidence bucket + storage RLS: a rider can only write/read objects
--    inside the folder of a job assigned to them; the owner can read all.
insert into storage.buckets (id, name, public)
values ('delivery-evidence', 'delivery-evidence', false)
on conflict (id) do nothing;

drop policy if exists "Riders upload own delivery evidence" on storage.objects;
create policy "Riders upload own delivery evidence" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'delivery-evidence'
    and (storage.foldername(name))[1] = 'jobs'
    and exists (
      select 1 from public.rider_jobs j
       where j.id::text = (storage.foldername(name))[2]
         and j.rider_id = (select auth.uid())
    )
  );

drop policy if exists "Riders read own delivery evidence" on storage.objects;
create policy "Riders read own delivery evidence" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'delivery-evidence'
    and (
      exists (
        select 1 from public.rider_jobs j
         where j.id::text = (storage.foldername(name))[2]
           and j.rider_id = (select auth.uid())
      )
      or (select public.is_raw_hairs_owner())
    )
  );
