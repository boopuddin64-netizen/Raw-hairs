# RAW HAIRS — Supabase foundation

Target project: `xcipemtyclinuyaadgxy` (organization: Mobile Apps, region: eu-west-1).

## Client configuration

The frontend uses the Vite variables below. The publishable key is intended for browser use; never place a Supabase secret/service_role key in Vite variables or commit it.

- `VITE_SUPABASE_URL=https://xcipemtyclinuyaadgxy.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<project publishable key>`

## Security baseline

- Public schema starts empty; no application tables or migrations were present at audit time.
- RLS must be enabled on every exposed application table, with policies designed per role and row ownership.
- Owner authorization must use trusted server-managed `app_metadata` or a dedicated role mapping, never user-editable `user_metadata`.
- Never expose secret/service_role keys in the browser.
- Existing `public.rls_auto_enable()` is a SECURITY DEFINER event-trigger function. EXECUTE has been revoked from PUBLIC, anon and authenticated; postgres retains execution privilege. Supabase security advisor returned no findings after verification.

## Migration plan

1. Configure Supabase Auth and verify owner identity.
2. Implement profiles/roles and least-privilege RLS.
3. Add catalog, variants, inventory, services, bookings, orders, payment records and rider assignment schema.
4. Add private product/media storage with Storage policies.
5. Replace localStorage business persistence with Supabase queries and transactions/RPC where atomicity is required.
6. Add payment verification and privileged operations through Edge Functions; never trust browser payment callbacks.

Do not switch production traffic until schema, RLS, auth, storage and end-to-end checkout tests pass.
