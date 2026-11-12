# RAW HAIRS

Premium, mobile-first wig boutique. Backend: **Supabase**.

## Three portals

| Portal | URL | Who |
|--------|-----|-----|
| **Customer** | `/` `#/shop` `#/account` | Public storefront + customer accounts |
| **Admin** | `#/admin` · sign-in `#/admin/sign-in` | Owner — catalogue, orders, bookings |
| **Driver** | `#/driver` · sign-in `#/driver/sign-in` | Delivery staff — assigned jobs only |

## Environment variables

Copy `.env.example` → `.env.local` (and set the same keys in Vercel):

```bash
# Public browser config
VITE_SUPABASE_URL=https://xcipemtyclinuyaadgxy.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key

# Drivers only (comma-separated, bootstrap until app_metadata.role is set)
VITE_DRIVER_EMAILS=driver1@example.com,driver2@example.com

# Server-only (no VITE_ prefix): admin login. See "Admin login" below.
ADMIN_EMAIL=
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
SUPABASE_SERVICE_ROLE_KEY=
```

**Never** put the Supabase service-role key in `VITE_*` variables.

## How driver login works

1. Create the user in **Supabase → Authentication → Users** (email + password).
2. Put that email in `VITE_DRIVER_EMAILS` (or set `app_metadata.role` to `driver`).
3. Redeploy so Vite picks up the env vars, then sign in at `#/driver/sign-in`.

The **admin** console uses a separate, server-side login (see "Admin login" below).
Customer sign-up stays on `#/account` and does **not** grant admin/driver access.

## Local setup

```bash
npm install
cp .env.example .env.local
# fill in keys
npm run dev   # storefront only; use `vercel dev` to also serve /api (admin)
```

## What works now

- Live product + service catalogue from Supabase
- Cart synced to live stock/price
- Customer auth, bookings, international requests
- Admin portal (products, services, orders, bookings, jobs)
- Driver portal (assigned jobs; admins see all)
- Env-based staff allow-lists

## Still next

- Paystack checkout + stock reservation
- Product length variants
- Real policy/contact copy
- `app_metadata.role` provisioning script (optional)

## Catalogue and admin product manager

- Products and services live in Supabase. Admin → **Products** adds, edits, hides and deletes products and uploads photos to the `product-images` bucket; the storefront reads the same table.
- `products.image_path` is either a static file (`/catalogue/bone.jpg`, served from `public/catalogue/`) or an uploaded object (`products/<uuid>.jpg`).

## Admin login (server-side, environment configured)

The admin console does not use Supabase Auth or any `VITE_` allow-list. Credentials live in the Vercel project's environment variables and are checked by `/api/admin/*` (Vercel functions). A successful login sets a 12-hour `HttpOnly`, `SameSite=Strict` session cookie scoped to `/api/admin`. All admin reads and writes go through those functions using the service-role key, so the browser never holds it.

Set these in Vercel → Project → Settings → Environment Variables (Production), then redeploy:

| Variable | Purpose |
| --- | --- |
| `ADMIN_EMAIL` | Admin login email |
| `ADMIN_PASSWORD` | Admin login password (use a long, unique one) |
| `ADMIN_SESSION_SECRET` | 32+ random characters used to sign the session cookie (`openssl rand -base64 48`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API. Server only: never prefix with `VITE_` |

Notes: changing `ADMIN_SESSION_SECRET` signs everyone out. Login is throttled per IP. The dashboard refreshes by polling every 15 seconds. Driver sign-in still uses Supabase Auth (`VITE_DRIVER_EMAILS` or `app_metadata.role`). `vite dev` does not serve `/api`; use `vercel dev` to test the admin locally.

Apply `supabase/migrations/20261112065539_grok_catalogue_import.sql` before deploying (already applied to the production project): it adds the catalogue columns and seeds the 22 products and 6 services.
