-- RAW HAIRS Phase 5/6 grant hardening (matches live migrations
-- phase_5_6_rpc_grant_hardening and fix_notify_order_event_public_grant).
--
-- Supabase default privileges grant EXECUTE on new functions to anon and
-- authenticated automatically; revoke-all-from-public alone is NOT enough.
-- This closes anonymous access everywhere it is not required, and locks
-- owner-only functions down to the service role (the admin API) alone.

-- Phase 5: booking requires a signed-in customer.
revoke execute on function public.create_booking(uuid, timestamptz, text, text, text) from anon;

-- Phase 6: OTP confirmation + photo are for riders/owner (authenticated) only.
revoke execute on function public.confirm_delivery_otp(uuid, text) from anon;
revoke execute on function public.mark_delivery_photo(uuid, text) from anon;

-- Phase 6: assignment is owner-only; callable ONLY via the service-role admin API.
revoke execute on function public.assign_rider_job(uuid, text) from anon, authenticated;

-- Pre-existing functions that anonymous callers should never touch.
revoke execute on function public.admin_confirm_bank_transfer(uuid, boolean, text) from anon;
-- notify_order_event is a maintenance helper: close it to everyone but service role.
revoke execute on function public.notify_order_event() from public, anon, authenticated;
-- Guests check out without signing in; reserve_cart_items must stay anon-callable
-- and must NOT be granted to authenticated as well (avoid extra surface).
revoke execute on function public.reserve_cart_items(jsonb, integer) from authenticated;
