-- RAW HAIRS security follow-up: make database status workflows authoritative.
-- This migration is source-only in this task and is not applied to production.

-- Admin/staff sessions must use the server's transition RPCs; authenticated
-- clients cannot write order.status directly. Service-role callers are server-only.
create or replace function public.guard_order_status_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or current_setting('raw_hairs.allow_order_workflow', true) = 'on' then
    return new;
  end if;
  raise exception 'Order status must be changed through the approved workflow';
end $$;
revoke all on function public.guard_order_status_update() from public, anon, authenticated;
drop trigger if exists orders_status_workflow_guard on public.orders;
create trigger orders_status_workflow_guard
before update of status on public.orders
for each row execute function public.guard_order_status_update();

-- Riders may advance only their own job from assigned -> picked_up -> in_transit.
-- Assignment, OTP/hash, evidence pointer, and terminal delivery changes are only
-- made by the service role or trusted SECURITY DEFINER workflow functions.
create or replace function public.validate_rider_transition()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if v_role = 'service_role'
     or current_setting('raw_hairs.allow_rider_workflow', true) = 'on' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.order_id is distinct from old.order_id
     or new.rider_id is distinct from old.rider_id
     or new.delivery_otp_hash is distinct from old.delivery_otp_hash
     or new.delivery_photo_path is distinct from old.delivery_photo_path
     or new.created_at is distinct from old.created_at then
    raise exception 'Assignment and delivery verification fields require the trusted workflow';
  end if;
  if old.rider_id is distinct from auth.uid() then
    raise exception 'Only the assigned driver can update this job';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'assigned' and new.status = 'picked_up')
    or (old.status = 'picked_up' and new.status = 'in_transit')
  ) then
    raise exception 'Invalid delivery status transition';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.validate_rider_transition() from public, anon, authenticated;
drop trigger if exists rider_jobs_transition_check on public.rider_jobs;
create trigger rider_jobs_transition_check
before update on public.rider_jobs
for each row execute function public.validate_rider_transition();

-- A driver may attach a photo only after the server has inspected the actual
-- bytes in Storage and written a short-lived private verification record.
create table if not exists public.verified_delivery_evidence (
  path text primary key check (path ~ '^jobs/[0-9a-f-]{36}/evidence-[0-9]{13}[.](jpg|png|webp)$'),
  job_id uuid not null references public.rider_jobs(id) on delete cascade,
  verified_by uuid not null references auth.users(id) on delete cascade,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz not null default now(),
  unique (job_id, path)
);
alter table public.verified_delivery_evidence enable row level security;
revoke all on public.verified_delivery_evidence from public, anon, authenticated, service_role;
grant insert on public.verified_delivery_evidence to service_role;

create or replace function public.mark_delivery_photo(p_job_id uuid, p_path text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_job public.rider_jobs;
  v_evidence public.verified_delivery_evidence;
begin
  select * into v_job from public.rider_jobs where id = p_job_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'job_not_found'); end if;
  if not (select public.is_raw_hairs_owner()) and v_job.rider_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'error', 'not_your_job');
  end if;
  if v_job.status not in ('in_transit', 'delivered') then
    return jsonb_build_object('ok', false, 'error', 'invalid_state');
  end if;
  if p_path is null or p_path !~ ('^jobs/' || p_job_id::text || '/evidence-[0-9]{13}[.](jpg|png|webp)$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_path');
  end if;

  select * into v_evidence from public.verified_delivery_evidence
   where job_id = p_job_id and path = p_path and verified_by = v_user
     and verified_at >= now() - interval '15 minutes'
   for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'file_not_verified'); end if;

  perform set_config('raw_hairs.allow_rider_workflow', 'on', true);
  update public.rider_jobs set delivery_photo_path = p_path, updated_at = now() where id = p_job_id;
  delete from public.verified_delivery_evidence where path = p_path;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.mark_delivery_photo(uuid, text) from public;
grant execute on function public.mark_delivery_photo(uuid, text) to authenticated;

-- Delivery OTP remains the only customer-facing transition to delivered.
-- It also opens a transaction-local guard for the order and rider-job triggers.
create or replace function public.confirm_delivery_otp(p_job_id uuid, p_otp text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_job public.rider_jobs;
  v_control public.rider_otp_controls;
  v_valid boolean := false;
  v_attempts integer;
begin
  select * into v_job from public.rider_jobs where id = p_job_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'job_not_found'); end if;
  if v_role <> 'service_role' and not (select public.is_raw_hairs_owner())
     and v_job.rider_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'error', 'not_your_job');
  end if;
  if v_job.status <> 'in_transit' then return jsonb_build_object('ok', false, 'error', 'invalid_state'); end if;
  select * into v_control from public.rider_otp_controls where job_id = p_job_id for update;
  if not found or v_control.expires_at is null or v_control.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'otp_expired');
  end if;
  if v_control.locked_at is not null or v_control.failed_attempts >= 5 then
    return jsonb_build_object('ok', false, 'error', 'otp_locked');
  end if;

  if coalesce(p_otp, '') ~ '^[0-9]{6}$' and v_job.delivery_otp_hash is not null then
    if left(v_job.delivery_otp_hash, 4) in ('$2a$', '$2b$', '$2y$') then
      v_valid := extensions.crypt(p_otp, v_job.delivery_otp_hash) = v_job.delivery_otp_hash;
    else
      -- Temporary compatibility for SHA-256 hashes, bounded by backfilled expiry.
      v_valid := encode(extensions.digest(p_otp, 'sha256'), 'hex') = v_job.delivery_otp_hash;
    end if;
  end if;
  if not v_valid then
    v_attempts := v_control.failed_attempts + 1;
    update public.rider_otp_controls set failed_attempts = v_attempts,
      locked_at = case when v_attempts >= 5 then now() else null end, updated_at = now()
     where job_id = p_job_id;
    return jsonb_build_object('ok', false, 'error', case when v_attempts >= 5 then 'otp_locked' else 'wrong_otp' end);
  end if;

  perform set_config('raw_hairs.allow_rider_workflow', 'on', true);
  update public.rider_jobs set status = 'delivered', updated_at = now() where id = p_job_id;
  perform set_config('raw_hairs.allow_order_workflow', 'on', true);
  update public.orders set status = 'delivered', updated_at = now()
   where id = v_job.order_id and status in ('processing', 'dispatched');
  insert into public.notifications (user_id, channel, event_type, title, body, related_order)
  select o.customer_id, 'whatsapp', 'order_delivered', 'Order delivered',
         'Your order was delivered. Thank you for shopping with RAW HAIRS.', o.id
    from public.orders o where o.id = v_job.order_id and o.customer_id is not null;
  return jsonb_build_object('ok', true, 'status', 'delivered');
end $$;
revoke all on function public.confirm_delivery_otp(uuid, text) from public;
grant execute on function public.confirm_delivery_otp(uuid, text) to authenticated, service_role;
