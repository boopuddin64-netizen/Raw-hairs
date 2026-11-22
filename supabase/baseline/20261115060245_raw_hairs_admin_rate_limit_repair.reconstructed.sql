-- RECONSTRUCTED BASELINE — NOT THE ORIGINAL MIGRATION SOURCE.
--
-- Production's ledger contains 20261115060245_raw_hairs_admin_rate_limit_repair,
-- but no SQL file for it exists in any branch. See
-- docs/database/phase-1-2-reconciliation-2026-11-15.md for the audit trail.
--
-- This file reconstructs the resulting objects from live catalog metadata so a
-- fresh staging database can be bootstrapped. It deliberately lives outside
-- supabase/migrations/:
--
--   * it is not the historical migration, and
--   * adding it to the migrations directory would create a second ledger entry
--     for behaviour production already has.
--
-- Review and apply manually against a disposable/staging database only.

create table if not exists public.api_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null,
  updated_at timestamptz not null default now()
);

create index if not exists api_rate_limits_updated_idx
  on public.api_rate_limits (updated_at);

alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;

-- No RLS policies by design: only the service-role RPCs below touch this table,
-- and they are not granted to client roles.

create or replace function public.consume_api_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_row public.api_rate_limits;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_key_hash');
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_limit');
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    return jsonb_build_object('ok', false, 'error', 'invalid_window');
  end if;

  insert into public.api_rate_limits (key_hash, window_started_at, hit_count, updated_at)
  values (p_key_hash, v_now, 1, v_now)
  on conflict (key_hash) do update
    set hit_count = case
          when public.api_rate_limits.window_started_at
               <= v_now - make_interval(secs => p_window_seconds)
            then 1
          else public.api_rate_limits.hit_count + 1
        end,
        window_started_at = case
          when public.api_rate_limits.window_started_at
               <= v_now - make_interval(secs => p_window_seconds)
            then v_now
          else public.api_rate_limits.window_started_at
        end,
        updated_at = v_now
  returning * into v_row;

  delete from public.api_rate_limits where updated_at < v_now - interval '1 day';

  return jsonb_build_object(
    'allowed', v_row.hit_count <= p_limit,
    'remaining', greatest(p_limit - v_row.hit_count, 0),
    'retry_after', case
      when v_row.hit_count <= p_limit then 0
      else greatest(
        1,
        ceil(extract(epoch from (
          v_row.window_started_at + make_interval(secs => p_window_seconds) - v_now
        )))
      )::integer
    end
  );
end;
$$;

create or replace function public.clear_api_rate_limit(p_key_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  delete from public.api_rate_limits where key_hash = p_key_hash;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.clear_api_rate_limit(text)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer)
  to service_role;
grant execute on function public.clear_api_rate_limit(text)
  to service_role;
