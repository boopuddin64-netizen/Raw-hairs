# RAW HAIRS — Phase 1 Security Fixes

Branch: `development/phase-1-security-fixes`
Status: **Not applied to any database yet.** Apply to the development database
first, run the verification checklist below, then request owner approval
before production. This repo is public — never commit real keys.

## What this fixes

| # | Finding (from the audit) | Fix |
|---|---|---|
| 1 | Any signed-in customer could insert an order with arbitrary `status`, `subtotal`, `total` (a forged "paid" order) | Customer INSERT policy on `orders` and `order_items` removed. Orders can only be created via the `create_order_from_cart()` RPC, which prices every line from live `products.price_kobo`, computes totals itself, and always creates `awaiting_payment` / `is_paid = false` |
| 2 | Money was `numeric(12,2)` naira | New authoritative integer-kobo columns: `products.price_kobo`, `services.price_kobo`, `orders.subtotal_kobo/delivery_fee_kobo/total_kobo`, `order_items.unit_price_kobo`, `international_requests.quote_amount_kobo`. Legacy numeric columns are kept (deprecated) until the storefront is migrated, then dropped by a later migration |
| 3 | Guest checkout was impossible (`orders.customer_id` NOT NULL) | `customer_id` is now nullable; `guest_name/phone/email` and full delivery fields added |
| 4 | No inventory reservation / overselling possible | `inventory_reservations` table + `products.reserved_qty`; atomic `reserve_inventory()` (conditional locked UPDATE prevents two buyers taking the last unit); 15-minute expiry; `release_expired_reservations()`; `consume_reservation_on_payment()` deducts physical stock exactly once on verified payment |
| 5 | Paid orders could skip owner approval | New statuses `awaiting_approval`, `approved`, `partially_refunded`; `consume_reservation_on_payment()` moves a verified payment to `awaiting_approval` — paid ≠ approved, the owner approves separately |
| 6 | `payments` table missing (no audit trail for Paystack/bank transfer) | `payments` table with method/status/amount_kobo/reference/verified_by; **no client UPDATE policy** — payment state changes only through verified server flows |
| 7 | No refunds / returns / notifications / audit tables | `refunds`, `return_requests` (48-hour window validated at creation server-side), `notifications` (WhatsApp-first, email later), `audit_logs` (append-only; owner can read, nobody can edit from a client) + row-level audit triggers on products, services, orders, rider_jobs, store_settings, payments, refunds |
| 8 | Rider status updates were broken/unconstrained | `rider_jobs` status constraint fixed (`returned` added). A constrained rider transition RPC lands with the delivery phase; no free-form rider UPDATE policy is introduced now |
| 9 | `store_settings` unreadable by customers (delivery fee/contact info) | Safe public SELECT policy for the `default` row |
| 10 | `.env.example` contained the real admin email on a public repo | Default removed; new `PAYSTACK_SECRET_KEY` / `PAYSTACK_WEBHOOK_IPS` documented (server-only) |

## Migrations in this PR (apply in order)

1. `20261112190000_phase_1_security_fixes.sql`
   - Kobo conversion (one-time, exact: current prices are whole naira)
   - Hardened order status model, guest columns, approval gate
   - RLS hardening (revoke customer order inserts, targeted owner policies)
   - `payments` → `refunds` → `return_requests` → `notifications` → `audit_logs`
   - Audit triggers
2. `20261112190100_reservation_order_rpcs.sql`
   - `inventory_reservations` + `products.reserved_qty`
   - `reservation_window_minutes()` (15)
   - `release_expired_reservations()` — schedule with pg_cron (`select cron.schedule('release-expired', '*/5 * * * *', 'select public.release_expired_reservations()')`) or call from the API
   - `reserve_inventory()` (atomic)
   - `create_order_from_cart()` (guest + signed-in; DB-priced)
   - `consume_reservation_on_payment()` (service-role only)
   - `release_order_reservation()`
   - `guest_order_receipt()` (safe guest lookup by order id + email)

## How to apply (development first)

```bash
# Supabase SQL editor or supabase CLI against the DEV project:
supabase db push --db-url "$DEV_DB_URL"
# or paste the two files in order into the Supabase SQL editor.
```

Record both filenames in the migration history table/journal after applying.

## Verification checklist (after applying to DEV)

- [ ] All previously seeded 22 products have `price_kobo = price * 100` (e.g. 95000 naira → 9500000 kobo)
- [ ] Direct `insert into orders` as an authenticated customer is rejected by RLS
- [ ] `select create_order_from_cart(...)` as a guest (anon) creates order `awaiting_payment`, `is_paid = false`, correct kobo totals, and an active 15-minute reservation
- [ ] Two concurrent `create_order_from_cart` calls for the last unit: exactly one succeeds, the other raises `INSUFFICIENT_STOCK`
- [ ] `select release_expired_reservations()` after expiry returns stock (reserved_qty decreases, reservation rows `released`)
- [ ] `consume_reservation_on_payment(order_id)` called by a customer session is **refused** (service-role only); as service role it sets `is_paid = true`, status `awaiting_approval`, deducts stock once
- [ ] Owner can read `audit_logs`; owner UPDATE/DELETE on `audit_logs` is refused
- [ ] `store_settings` row `default` is readable by anon (delivery fee, contact info) but not writable by anon
- [ ] Security advisor in Supabase reports no new warnings; RLS is enabled on every new table
- [ ] Storefront still renders prices correctly (legacy numeric columns still present until the frontend transition)

## Known follow-ups (later migrations, not this PR)

- Rider job transition RPC + OTP delivery confirmation (delivery phase)
- Booking slot/conflict validation RPC (services phase)
- `return_requests` creation RPC with the 48-hour window check (refunds phase)
- International quotation accept/decline flow
- Dropping the deprecated naira numeric columns after the storefront reads kobo
- `categories` table to replace the free-text `category` column
- Paystack initialize/verify endpoints + webhook (checkout phase)
