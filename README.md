# RAW HAIRS

Premium, mobile-first wig boutique. Backend: **Supabase**.

## Two deployments, one codebase (Phase A separation)

The public storefront and the staff console build from the same repo into **two
separate Vercel projects**. The storefront bundle contains **zero** admin or
driver code; the console is deployed on its own private origin.

| Deployment | Entry | Build output | URL | Who |
|---|---|---|---|---|
| **Storefront** | `index.html` | `dist` | `rawhairs.vercel.app` | Public customers |
| **Console** | `console.html` (`BUILD_TARGET=console`) | `dist-console` | `raw-hairs-console.vercel.app` (set yours) | Owner + drivers only |

The console additionally sits behind **Vercel Deployment Protection**
(Password Protection or team SSO), so it is not publicly reachable at all.
Its own cookie session (`ADMIN_*` env vars) still gates every admin action on
the server — deployment protection is the outer gate, the cookie is the real
auth.

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
PAYSTACK_SECRET_KEY=

# Console Vercel project ONLY: selects the staff-console build.
BUILD_TARGET=console
```

**Never** put the Supabase service-role key or the Paystack secret key in
`VITE_*` variables.

## Deploying the two projects (Vercel)

1. **Storefront** — the existing Vercel project. Keep Root Directory `/`,
   build command `npm run build`, output `dist`. Unchanged.
2. **Console** — create a **new** Vercel project from this same repo
   (Add New → Project → import `boopuddin64-netizen/Raw-hairs` again):
   - Build Command: `npm run build:console`
   - Output Directory: `dist-console`
   - Environment Variables: copy all storefront vars **plus**
     `BUILD_TARGET=console` (same `ADMIN_*`, `ADMIN_SESSION_SECRET`,
     `SUPABASE_SERVICE_ROLE_KEY`, Supabase + Paystack keys).
   - Settings → Deployment Protection: enable **Password Protection** (or SSO).
   - Rename the generated domain if you like (e.g. `raw-hairs-console.vercel.app`).

After the first console deploy, verify the separation:

```bash
# storefront bundle must contain no admin code:
grep -ri "admin" dist/assets/   # expect zero hits
```

## How driver login works

1. Create the user in **Supabase → Authentication → Users** (email + password).
2. Put that email in `VITE_DRIVER_EMAILS` (or set `app_metadata.role` to `driver`).
3. Redeploy the **console** so Vite picks up the env vars, then sign in on the
   console origin at `#/driver/sign-in`.

The **admin** console uses a separate, server-side login (see "Admin login"
below). Customer sign-up stays on `#/account` and does **not** grant admin or
driver access.

## Local setup

```bash
npm install
cp .env.example .env.local
# fill in keys
npm run dev             # storefront at localhost:5173
npm run build:console   # console build check -> dist-console
# use `vercel dev` to also serve /api locally
```

## What works now

- Live product + service catalogue from Supabase
- Cart synced to live stock/price; 15-minute stock reservation at checkout
- Customer auth, orders, order tracking (guest + signed-in), bookings
- Paystack checkout + bank transfer (server-verified)
- Admin console (products, services, orders, bookings, jobs) on a separate origin
- Driver portal (assigned jobs; admins see all) on the console origin
- Env-based staff allow-lists

## Admin login (server-side, environment configured)

The admin console does not use Supabase Auth or any `VITE_` allow-list.
Credentials live in the Vercel project's environment variables and are checked
by `/api/admin/*` (Vercel functions). A successful login sets a 12-hour
`HttpOnly`, `SameSite=Strict` session cookie scoped to `/api/admin`. All admin
reads and writes go through those functions using the service-role key, so the
browser never holds it.

Set these in Vercel → Project → Settings → Environment Variables (Production) on
**both** projects, then redeploy:

| Variable | Purpose |
| --- | --- |
| `ADMIN_EMAIL` | Admin login email |
| `ADMIN_PASSWORD` | Admin login password (use a long, unique one) |
| `ADMIN_SESSION_SECRET` | 32+ random characters used to sign the session cookie (`openssl rand -base64 48`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API. Server only: never prefix with `VITE_` |

Notes: changing `ADMIN_SESSION_SECRET` signs everyone out. Login is throttled
per IP. The dashboard refreshes by polling every 15 seconds. Driver sign-in
still uses Supabase Auth (`VITE_DRIVER_EMAILS` or `app_metadata.role`).
`vite dev` does not serve `/api`; use `vercel dev` to test admin locally.

## Catalogue and admin product manager

- Products and services live in Supabase. Console → **Products** adds, edits,
  hides and deletes products and uploads photos to the `product-images` bucket;
  the storefront reads the same table.
- `products.image_path` is either a static file (`/catalogue/bone.jpg`, served
  from `public/catalogue/`) or an uploaded object (`products/<uuid>.jpg`).

Apply `supabase/migrations/` in order before deploying; the repo can rebuild
the production database from migrations alone (drift-repaired 2026-11-13).
