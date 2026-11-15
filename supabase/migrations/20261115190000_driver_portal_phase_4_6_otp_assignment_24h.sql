-- Phase 4: restore the approved 24-hour validity for newly assigned delivery OTPs.
-- Manual reissue intentionally remains 30 minutes.
-- This is a forward migration; do not rerun the Phase 0–3 migration.
create or replace function public.assign_rider_job(p_job_id uuid,p_rider_email text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_role text:=coalesce(auth.jwt()->>'role','');
 v_rider uuid;
 v_job public.rider_jobs;
 v_otp text;
 v_hash text;
begin
 if v_role<>'service_role' and not (select public.is_raw_hairs_owner()) then
  return jsonb_build_object('ok',false,'error','owner_only');
 end if;
 if nullif(trim(p_rider_email),'') is null then
  return jsonb_build_object('ok',false,'error','rider_not_found');
 end if;
 select id into v_rider from auth.users
 where lower(email)=lower(trim(p_rider_email)) and deleted_at is null;
 if v_rider is null then
  return jsonb_build_object('ok',false,'error','rider_not_found');
 end if;
 select * into v_job from public.rider_jobs where id=p_job_id for update;
 if not found then
  return jsonb_build_object('ok',false,'error','job_not_found');
 end if;
 if v_job.status not in ('unassigned','assigned') then
  return jsonb_build_object('ok',false,'error','job_in_progress');
 end if;
 v_otp:=lpad((('x'||substr(encode(extensions.gen_random_bytes(3),'hex'),1,6))::bit(24)::bigint % 1000000)::text,6,'0');
 v_hash:=encode(extensions.digest(v_otp,'sha256'),'hex');
 update public.rider_jobs set rider_id=v_rider,status='assigned',
  delivery_otp_hash=v_hash,delivery_photo_path=null,updated_at=now()
 where id=p_job_id;
 insert into public.rider_otp_controls(job_id,expires_at,failed_attempts,locked_at,updated_at)
 values(p_job_id,now()+interval '24 hours',0,null,now())
 on conflict(job_id) do update set expires_at=excluded.expires_at,
  failed_attempts=0,locked_at=null,updated_at=now();
 return jsonb_build_object('ok',true,'job_id',p_job_id,'rider_id',v_rider,'otp',v_otp);
end $$;
revoke all on function public.assign_rider_job(uuid,text) from public,anon,authenticated;
grant execute on function public.assign_rider_job(uuid,text) to service_role;

