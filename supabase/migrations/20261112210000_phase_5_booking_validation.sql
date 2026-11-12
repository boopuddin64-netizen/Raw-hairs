-- RAW HAIRS Phase 5 - booking slot validation
-- Bookings move behind an RPC: service must be active, time must be sane,
-- and the slot must not overlap another pending/confirmed booking for the
-- same service (service duration + 30-minute buffer, symmetric).
-- Direct customer INSERTs on public.bookings are removed; the RPC is the only path.

create or replace function public.create_booking(
  p_service_id uuid,
  p_scheduled_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_notes text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_service public.services;
  v_conflict boolean;
  v_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;
  if p_scheduled_at is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_time');
  end if;
  if p_scheduled_at < now() + interval '1 hour' then
    return jsonb_build_object('ok', false, 'error', 'booking_too_soon');
  end if;
  if p_scheduled_at > now() + interval '90 days' then
    return jsonb_build_object('ok', false, 'error', 'booking_too_far');
  end if;
  if coalesce(trim(p_customer_name), '') = '' or coalesce(trim(p_customer_phone), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_details');
  end if;

  select * into v_service from public.services
   where id = p_service_id and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'service_unavailable');
  end if;

  -- Slot conflict: one booking at a time per service (buffer = duration + 30 min).
  select exists(
    select 1 from public.bookings b
     where b.service_id = p_service_id
       and b.status in ('pending', 'confirmed')
       and b.scheduled_at < p_scheduled_at
             + make_interval(mins => coalesce(v_service.duration_minutes, 60) + 30)
       and b.scheduled_at > p_scheduled_at
             - make_interval(mins => coalesce(v_service.duration_minutes, 60) + 30)
  ) into v_conflict;
  if v_conflict then
    return jsonb_build_object('ok', false, 'error', 'slot_taken');
  end if;

  insert into public.bookings
    (customer_id, service_id, customer_name, customer_phone, scheduled_at, status, notes)
  values
    (v_user, p_service_id, trim(p_customer_name), trim(p_customer_phone),
     p_scheduled_at, 'pending', nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'booking_id', v_id, 'scheduled_at', p_scheduled_at);
end $$;
revoke all on function public.create_booking(uuid, timestamptz, text, text, text) from public;
grant execute on function public.create_booking(uuid, timestamptz, text, text, text) to authenticated;

-- Bookings can now only be created through the RPC (like orders).
drop policy if exists "Customers create own bookings" on public.bookings;
