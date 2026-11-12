# Migration guide — supabase/migrations

Apply in order using the Supabase SQL editor or `supabase db push`, against the
**development/staging project first**. Never re-edit an applied migration; add a
new one instead. All migrations in this repo are written to be safe to re-run
(idempotent), but always verify on staging before production.

## Order

| # | File | Purpose |
|---|------|---------|
| 1 | `20261111145717_raw_hairs_initial_schema.sql` | Initial tables, owner role function, RLS, product-images bucket |
| 2 | `20261111163251_public_catalog_product_image_read.sql` | Public read of product images |
| 3 | `20261111180000_phase_1_foundation_repair.sql` | `store_settings`, `reviews`, `app_metadata.roles` support |
| 4 | `20261112065539_grok_catalogue_import.sql` | Catalogue fields (length/lace/weight) + 22 products + 6 services |
| 5 | `20261112102441_grok_catalogue_import_reapply.sql` | Re-apply guard for #4 |
| 6 | `20261112190000_phase_1_backend_integrity.sql` | **Phase 1 fixes** — see below |

## Migration 6 — Phase 1 backend integrity (2026-11-12)

What it adds/changes:

1. **Kobo money storage.** New integer columns `products.price_kobo`,
   `orders.subtotal_kobo / delivery_fee_kobo / total_kobo`,
   `order_items.unit_price_kobo`. Existing naira values backfilled ×100 once.
   Kobo is now the source of truth; `sync_naira_from_kobo()` triggers keep the
   legacy numeric columns in sync for backward compatibility of old reads.
   Note: the admin API converts naira input to kobo itself, so admin edits of
   the legacy `price` field are translated to `price_kobo` server-side.
2. **Guest-ready orders.** `orders.customer_id` is now nullable; guest identity
   lives in `guest_email` plus `customer_name` / `customer_phone` / delivery
   fields added to the order row. New status `pending_admin_approval` (a paid
   order is not automatically an approved order).
3. **Atomic 15-minute inventory reservations.** `inventory_reservations` table +
   `reserve_cart_items()` RPC (row-locks each product, rejects duplicates and
   shortfalls, concurrency-safe) + `release_expired_reservations()` +
   `product_availability` view (physical / reserved / available stock).
   `create_order_from_reservation()` converts a reservation into an
   `awaiting_payment` order with **server-computed prices** — the client can
   never set amounts, status or totals.
4. **Financial/compliance tables.** `payments` (with unique Paystack reference
   and status checks), `return_requests`, `refund_transactions` (refund amount
   validated against the original payment by trigger — CHECK constraints cannot
   hold subqueries in Postgres), `notifications`, `audit_log` (append-only,
   owner-read).
5. **RLS hardening.**
   - Customer direct INSERT/UPDATE on `orders` and `order_items` revoked —
     orders exist only via `create_order_from_reservation()`.
   - Riders: new `rider_jobs` UPDATE policy restricted to the assigned rider,
     forward-only transitions (`assigned → picked_up → in_transit →
     delivered|failed`), immutable `rider_id` / `order_id` / `delivery_otp_hash`.
   - `store_settings` default row is publicly readable (fees, support
     contacts) while owner-only writable.
   - Customers get read-own policies on `payments`, `return_requests`,
     `refund_transactions`, `notifications`, `inventory_reservations`.
6. **Audit trail.** AFTER INSERT/UPDATE/DELETE triggers on products, services,
   orders, payments, return_requests, refund_transactions, rider_jobs,
   store_settings, bookings and international_requests record owner and rider
   actions (actor, action, table, record, old/new values, timestamp). Admin
   service-role writes bypass RLS but auth.uid() is null in that context, so
   admin-API writes are not currently captured per-row — the API's own allow-list
   and logs remain the control for those. Capturing admin-API writes with an
   explicit actor is planned for Phase 2.

## Environment variables added in this phase

No new variables are required by migration 6 itself. `.env.example` now also
documents the Paystack placeholders for Phase 3:

- `VITE_PAYSTACK_PUBLIC_KEY` (browser-safe)
- `PAYSTACK_SECRET_KEY` (server-only, Vercel env — never a `VITE_` variable)

## Owner claims reminder

Owner privileges come only from `auth.users.app_metadata.role` (or `roles`)
containing `owner`/`admin`, set via the Supabase dashboard or Admin API — never
from `user_metadata`, which users can edit themselves.
