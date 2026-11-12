-- RAW HAIRS Phase 1 - CORRECTED, part 1 of 3
-- Matches live database migration `phase_1_backend_integrity_corrected` (2026-11-12).
-- Trusted-role helpers: app_metadata-based role checks used by RLS policies.

create or replace function public.is_raw_hairs_owner()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' in ('owner','admin'), false)
     or coalesce((auth.jwt() -> 'app_metadata' -> 'roles') ?| array['owner','admin'], false);
$$;
revoke all on function public.is_raw_hairs_owner() from public;
grant execute on function public.is_raw_hairs_owner() to authenticated, anon;

create or replace function public.is_raw_hairs_rider()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' in ('driver','rider'), false)
     or coalesce((auth.jwt() -> 'app_metadata' -> 'roles') ?| array['driver','rider'], false);
$$;
revoke all on function public.is_raw_hairs_rider() from public;
grant execute on function public.is_raw_hairs_rider() to authenticated;