-- Restore signed-in customer checkout (regression from grant hardening).
-- The live database was already fixed by hand; this file keeps fresh
-- environments (Supabase CLI, preview branches, CI) consistent with it.
grant execute on function public.reserve_cart_items(jsonb, integer) to authenticated;

-- Close remaining anon exposure found by the security advisor.
revoke execute on function public.advance_order_status(uuid, text) from anon;
revoke execute on function public.cancel_own_order(uuid) from anon;
