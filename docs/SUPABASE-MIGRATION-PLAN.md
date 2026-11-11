# RAW HAIRS — Supabase migration

Target project: `xcipemtyclinuyaadgxy` (organization: Mobile Apps, region: eu-west-1).

## Security model

- Browser uses only the Supabase publishable key.
- Never expose a service-role/secret key in Vite environment variables.
- Owner authorization is based on trusted `auth.users.raw_app_meta_data` / JWT `app_metadata`, not user-editable `user_metadata`.
- All exposed tables must have RLS enabled and least-privilege policies.
- Product catalogue reads may be public; owner writes require the owner app_metadata role.
- Customer and rider access will be scoped to their own records after their role/onboarding flow is implemented.

## Migration stages

1. Supabase client and environment configuration.
2. Owner authentication and protected route integration.
3. PostgreSQL schema, constraints, indexes and RLS.
4. Product image storage policies.
5. Replace localStorage business data with database-backed queries.
6. Orders, 15-minute stock reservations, payment verification, booking and delivery workflows.
7. End-to-end security and build verification.

## Current state

The project is a React/Vite prototype. Its store is still localStorage-backed and Firebase auth scaffolding is present. Do not enable customer checkout or treat localStorage stock as authoritative. Do not deploy this branch to production until the migration and acceptance checks are complete.

## Environment

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in local/Vercel environments. The project URL is public configuration; the publishable key is intended for browser use. Never commit credentials.
