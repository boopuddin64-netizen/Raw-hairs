# RAW HAIRS

Premium, mobile-first wig boutique storefront. The active backend migration is Supabase.

## Stack

- React 18 + Vite.
- Supabase Postgres, Auth, Row Level Security and Storage.
- NGN pricing.
- Owner-only access to the admin and rider dashboards during the prototype phase.

## Supabase project

Project reference: `xcipemtyclinuyaadgxy`

The frontend uses only the Supabase project URL and a publishable key. Never place a Supabase secret or service-role key in browser code or any `VITE_*` variable.

## Local setup

1. Install Node.js 22 or later.
2. Run `npm install` from the repository root.
3. Copy `.env.example` to `.env.local`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Run `npm run dev`.

## Authentication and authorization

- Customers authenticate through Supabase Auth.
- Owner sign-in uses email/password.
- Owner authorization is checked using trusted `app_metadata.role = 'owner'`.
- Never use user-editable `user_metadata` for authorization.
- Public owner registration is disabled. Provision the owner role only through a trusted Supabase administrator process.
- The current prototype intentionally keeps the admin and rider routes owner-only. Rider-specific accounts and restricted rider permissions are a later phase.

## Database

The initial schema is in `supabase/migrations/20261111145717_raw_hairs_initial_schema.sql`. It defines profiles, products, services, bookings, orders, order items, international requests and rider jobs with RLS enabled.

The database foundation is not the completed commerce workflow. Checkout pricing, Paystack verification, transactional stock reservation (15 minutes), refund handling, delivery OTP verification, notifications and admin/rider operational workflows still require implementation and tests.

## Storage

The initial migration creates a private `product-images` bucket. Product image access is owner-restricted until the storefront image delivery policy is finalized.

## Development status

- Supabase client foundation: present.
- Owner sign-in migration: in progress.
- Storefront and admin data access: still uses demo/local browser state and must be migrated screen by screen.
- Production deployment: not authorized by this development branch.

Do not deploy this branch to production without explicit approval.
