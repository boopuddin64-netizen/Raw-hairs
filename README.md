# RAW HAIRS

Premium, mobile-first wig boutique storefront. Backend: **Supabase** (Postgres, Auth, RLS, Storage).

## Stack

- React 18 + Vite + React Router
- Supabase Postgres, Auth, Row Level Security and Storage
- NGN pricing
- Owner-only admin and rider dashboards (prototype)

## What works now

- Live product catalogue from Supabase (`is_active = true`)
- Live services list from Supabase
- Cart stored in the browser; lines sync price/stock from live products
- Product detail page with **Add to bag**
- Customer sign-up / sign-in on Account (Supabase Auth)
- Signed-in customers can submit **bookings** and **international requests** (saved to Supabase)
- Owner admin: products, services, orders, bookings, international requests, rider jobs, image upload
- Owner-only `/admin` and `/rider` routes

## Still not production-complete

- Paystack checkout + payment verification webhook
- Atomic stock reservation / decrement on payment
- Product variants (length-based pricing)
- Dedicated rider accounts (owner can preview jobs for now)
- Public product image CDN policy (currently 24h signed URLs)
- Help / policy pages still use placeholder copy

## Supabase project

Project reference: `xcipemtyclinuyaadgxy`

The frontend uses only the Supabase project URL and a **publishable** key. Never place a secret or service-role key in browser code or any `VITE_*` variable.

## Local setup

1. Install Node.js 22 or later.
2. Run `npm install` from the repository root.
3. Copy `.env.example` to `.env.local`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Run `npm run dev`.

## Authentication

- Customers: email/password via Supabase Auth (Account page).
- Owner: email/password; authorized only when `app_metadata.role = 'owner'` (set via trusted admin process, never from the browser).
- Public owner registration is disabled.

## Database

Schema: `supabase/migrations/20261111145717_raw_hairs_initial_schema.sql`

Tables: profiles, products, services, bookings, orders, order_items, international_requests, rider_jobs — all with RLS.

## Development status

Storefront catalogue, cart, customer auth, bookings, and international requests are wired to Supabase.
Checkout / Paystack and stock reservation remain the next phase.

Do not treat this branch as fully production-ready until payment verification and stock control are complete.
