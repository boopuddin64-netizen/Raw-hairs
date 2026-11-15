-- RAW HAIRS Driver Portal: delivery integrity foundation.
-- Supabase migration tooling records this file in migration history; do not insert history manually.
create table if not exists public.rider_otp_controls (
 job_id uuid primary key references public.rider_jobs(id) on delete cascade,
 expires_at timestamptz not null,
 failed_attempts integer not null default 0 check(failed_attempts between 0 and 5),
 locked_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.rider_otp_controls enable row level security;
revoke all on public.rider_otp_controls from public,anon,authenticated;
grant all on public.rider_otp_controls to service_role;
insert into public.rider_otp_controls(job_id,expires_at)
select id,now()+interval '24 hours' from public.rider_jobs
where status in ('assigned','picked_up','in_transit') and delivery_otp_hash is not null
on conflict(job_id) do nothing;

create table if not exists public.verified_delivery_evidence (
 path text primary key check(path ~ '^jobs/[0-9a-f-]{36}/evidence-[0-9]{13}[.](jpg|png|webp)$'),
 job_id uuid not null references public.rider_jobs(id) on delete cascade,
 verified_by uuid not null references auth.users(id) on delete cascade,
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 bytes bigint not null check(bytes>0 and bytes<=8388608),
 verified_at timestamptz not null default now(),
 unique(job_id,path)
);
alter table public.verified_delivery_evidence enable row level security;
revoke all on public.verified_delivery_evidence from public,anon,authenticated;
grant all on public.verified_delivery_evidence to service_role;

create table if not exists public.delivery_evidence (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.rider_jobs(id) on delete cascade,
 storage_path text not null unique,
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 bytes bigint not null check(bytes>0 and bytes<=8388608),
 captured_by uuid not null references auth.users(id),
 verified_at timestamptz not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default(now()+interval '90 days')
);
alter table public.delivery_evidence enable row level security;
revoke all on public.delivery_evidence from public,anon,authenticated;
grant all on public.delivery_evidence to service_role;

create table if not exists public.delivery_exceptions (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.rider_jobs(id) on delete cascade,
 driver_id uuid not null references auth.users(id),
 reason text not null check(reason in ('customer_unavailable','customer_refused','incorrect_address','unable_to_contact','reschedule_requested','other')),
 notes text check(notes is null or length(notes)<=1000),
 status text not null default 'pending' check(status in ('pending','resolved','dismissed')),
 resolution text,
 resolved_by uuid references auth.users(id),
 resolved_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.delivery_exceptions enable row level security;
revoke all on public.delivery_exceptions from public,anon,authenticated;
grant all on public.delivery_exceptions to service_role;

create or replace function public.validate_rider_transition()
returns trigger language plpgsql set search_path=''
as $$
begin
 if coalesce(auth.jwt()->>'role','')='service_role' or current_setting('raw_hairs.allow_rider_workflow',true)='on' then return new; end if;
 if new.id is distinct from old.id or new.order_id is distinct from old.order_id
 or new.rider_id is distinct from old.rider_id or new.delivery_otp_hash is distinct from old.delivery_otp_hash
 or new.delivery_photo_path is distinct from old.delivery_photo_path or new.created_at is distinct from old.created_at then
 raise exception 'Protected delivery fields require trusted workflow'; end if;
 if old.rider_id is distinct from auth.uid() then raise exception 'Not assigned to this driver'; end if;
 if new.status is distinct from old.status and not ((old.status='assigned' and new.status='picked_up') or (old.status='picked_up' and new.status='in_transit')) then
 raise exception 'Invalid delivery transition'; end if;
 new.updated_at:=now(); return new;
end $$;
revoke all on function public.validate_rider_transition() from public,anon,authenticated;

create or replace function public.mark_delivery_photo(p_job_id uuid,p_path text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_job public.rider_jobs; v_evidence public.verified_delivery_evidence;
begin
 select * into v_job from public.rider_jobs where id=p_job_id for update;
 if not found then return jsonb_build_object('ok',false,'error','job_not_found'); end if;
 if v_job.rider_id is distinct from v_user and not (select public.is_raw_hairs_owner()) then return jsonb_build_object('ok',false,'error','not_your_job'); end if;
 if v_job.status<>'in_transit' then return jsonb_build_object('ok',false,'error','invalid_state'); end if;
 if p_path is null or p_path !~ ('^jobs/'||p_job_id::text||'/evidence-[0-9]{13}[.](jpg|png|webp)$') then return jsonb_build_object('ok',false,'error','invalid_path'); end if;
 select * into v_evidence from public.verified_delivery_evidence where job_id=p_job_id and path=p_path and verified_by=v_user and verified_at>=now()-interval '15 minutes' for update;
 if not found then return jsonb_build_object('ok',false,'error','file_not_verified'); end if;
 insert into public.delivery_evidence(job_id,storage_path,sha256,mime_type,bytes,captured_by,verified_at)
 values(p_job_id,p_path,v_evidence.sha256,v_evidence.mime_type,v_evidence.bytes,v_user,v_evidence.verified_at)
 on conflict(storage_path) do nothing;
 perform set_config('raw_hairs.allow_rider_workflow','on',true);
 update public.rider_jobs set delivery_photo_path=p_path,updated_at=now() where id=p_job_id;
 delete from public.verified_delivery_evidence where path=p_path;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.mark_delivery_photo(uuid,text) from public,anon;
grant execute on function public.mark_delivery_photo(uuid,text) to authenticated;

create or replace function public.confirm_delivery_otp(p_job_id uuid,p_otp text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_role text:=coalesce(auth.jwt()->>'role',''); v_job public.rider_jobs; v_control public.rider_otp_controls; v_valid boolean:=false; v_attempts integer;
begin
 select * into v_job from public.rider_jobs where id=p_job_id for update;
 if not found then return jsonb_build_object('ok',false,'error','job_not_found'); end if;
 if v_role<>'service_role' and not (select public.is_raw_hairs_owner()) and v_job.rider_id is distinct from v_user then return jsonb_build_object('ok',false,'error','not_your_job'); end if;
 if v_job.status<>'in_transit' then return jsonb_build_object('ok',false,'error','invalid_state'); end if;
 if v_job.delivery_photo_path is null or not exists(select 1 from public.delivery_evidence e where e.job_id=p_job_id and e.storage_path=v_job.delivery_photo_path and e.expires_at>now()) then return jsonb_build_object('ok',false,'error','photo_required'); end if;
 select * into v_control from public.rider_otp_controls where job_id=p_job_id for update;
 if not found or v_control.expires_at<=now() then return jsonb_build_object('ok',false,'error','otp_expired'); end if;
 if v_control.locked_at is not null or v_control.failed_attempts>=5 then return jsonb_build_object('ok',false,'error','otp_locked'); end if;
 if coalesce(p_otp,'') ~ '^[0-9]{6}$' and v_job.delivery_otp_hash is not null then
  if left(v_job.delivery_otp_hash,4) in ('$2a$','$2b$','$2y$') then v_valid:=extensions.crypt(p_otp,v_job.delivery_otp_hash)=v_job.delivery_otp_hash;
  else v_valid:=encode(extensions.digest(p_otp,'sha256'),'hex')=replace(v_job.delivery_otp_hash,chr(92)||'x',''); end if;
 end if;
 if not v_valid then
  v_attempts:=v_control.failed_attempts+1;
  update public.rider_otp_controls set failed_attempts=v_attempts,locked_at=case when v_attempts>=5 then now() else null end,updated_at=now() where job_id=p_job_id;
  return jsonb_build_object('ok',false,'error',case when v_attempts>=5 then 'otp_locked' else 'wrong_otp' end);
 end if;
 perform set_config('raw_hairs.allow_rider_workflow','on',true);
 update public.rider_jobs set status='delivered',updated_at=now() where id=p_job_id;
 perform set_config('raw_hairs.allow_order_workflow','on',true);
 update public.orders set status='delivered',updated_at=now() where id=v_job.order_id and status in ('processing','dispatched');
 return jsonb_build_object('ok',true,'status','delivered');
end $$;
revoke all on function public.confirm_delivery_otp(uuid,text) from public,anon;
grant execute on function public.confirm_delivery_otp(uuid,text) to authenticated,service_role;

update storage.buckets set file_size_limit=8388608,allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='delivery-evidence';
