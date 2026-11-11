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
VITE_SUPABASE_URL=https://xcipemtyclinuyaadgxy.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key

# Comma-separated allow-lists (bootstrap until app_metadata.role is set)
VITE_ADMIN_EMAILS=you@yourdomain.com
VITE_DRIVER_EMAILS=driver1@example.com,driver2@example.com
```

**Never** put the Supabase service-role key in `VITE_*` variables.

## How admin / driver login works

1. Create the user in **Supabase → Authentication → Users** (email + password).
2. Put that email in `VITE_ADMIN_EMAILS` or `VITE_DRIVER_EMAILS`.
3. Redeploy / restart so Vite picks up the env vars.
4. Sign in at `#/admin/sign-in` or `#/driver/sign-in`.

Optional (stronger, for later): set `app_metadata.role` to `admin` or `driver` in Supabase. That overrides the email lists.

Customer sign-up stays on `#/account` and does **not** grant admin/driver access.

## Local setup

```bash
npm install
cp .env.example .env.local
# fill in keys + admin email
npm run dev
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
