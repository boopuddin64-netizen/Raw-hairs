# RAW HAIRS — Data Model and API Contract

This document translates the Phase 2 architecture into an implementation contract. It is not a claim that these tables or endpoints are deployed.

## Data conventions

- PostgreSQL UUID primary keys.
- UTC timestamps stored as `timestamptz`.
- NGN amounts stored as `bigint` kobo.
- Quantities are positive integers.
- All externally retried commands carry an idempotency key.
- Soft deletion is preferred for catalogue records referenced by orders.
- Order item descriptions and prices are immutable snapshots.

## Logical relational model

### Catalogue and inventory
- `products(id, slug, name, description, category_id, status, created_at, updated_at)`
- `product_variants(id, product_id, sku, length_inches, texture, lace_type, density, colour, cap_size, price_kobo, currency, is_active, created_at, updated_at)`
- `inventory_balances(variant_id, on_hand, reserved, updated_at)`
- `inventory_movements(id, variant_id, movement_type, quantity_delta, reference_type, reference_id, reason, actor_uid, created_at)`

Constraint: unique SKU; unique variant identity within a product; `on_hand >= 0`, `reserved >= 0`, `reserved <= on_hand`.

### Identity
- `customers(id, firebase_uid nullable unique, email nullable, phone nullable, display_name, created_at)`
- `staff_users(id, firebase_uid unique, role, is_active, created_at, updated_at)`
- `staff_users.role` is constrained to owner/admin/rider.
- Active owner/admin seats are capped at four through a transactional service-level check plus database-safe enforcement.

### Orders
- `orders(id, order_number unique, customer_id nullable, guest_token_hash nullable, currency, payment_status, fulfilment_status, subtotal_kobo, delivery_kobo, discount_kobo, total_kobo, admin_approved_by nullable, admin_approved_at nullable, created_at, updated_at)`
- `order_items(id, order_id, variant_id, product_name_snapshot, variant_snapshot jsonb, sku_snapshot, unit_price_kobo, quantity, line_total_kobo)`
- `order_status_events(id, order_id, from_status, to_status, actor_type, actor_id, reason, created_at)`

### Delivery
- `delivery_zones(id, name, country_code, state_code nullable, city nullable, active)`
- `delivery_quotes(id, order_id, delivery_mode, provider_code nullable, provider_quote_ref nullable, amount_kobo, currency, expires_at, status, raw_response_redacted jsonb, created_at)`
- `delivery_jobs(id, order_id, delivery_mode, provider_code nullable, provider_job_ref nullable, rider_staff_id nullable, status, customer_confirmation_hash nullable, assigned_at nullable, accepted_at nullable, delivered_at nullable, confirmed_at nullable)`
- `delivery_events(id, delivery_job_id, event_type, actor_type, actor_id, metadata jsonb, created_at)`

### Payments and accounting
- `payment_attempts(id, order_id, provider, provider_reference unique, method, amount_kobo, currency, status, initialized_at, verified_at nullable, created_at)`
- `payment_events(id, provider, provider_event_id, provider_reference, event_type, payload_hash, verified_at, processed_at, UNIQUE(provider, provider_event_id))`
- `refunds(id, payment_attempt_id, amount_kobo, reason, status, provider_ref nullable, requested_by, approved_by nullable, processed_at nullable, created_at)`
- `ledger_accounts(id, code unique, name, account_type)`
- `ledger_transactions(id, source_type, source_id, idempotency_key unique, description, posted_at, created_at)`
- `ledger_entries(id, transaction_id, account_id, debit_kobo, credit_kobo, currency, created_at)`
- Ledger transaction invariant: for each transaction and currency, total debits equal total credits; entries are immutable after posting. Corrections use reversing transactions.

### International requests, notifications and audit
- `international_requests(id, customer_name, email nullable, whatsapp, destination_country, address, requested_items jsonb, status, quote_kobo nullable, currency, quote_expires_at nullable, admin_owner_id nullable, created_at, updated_at)`
- `notification_outbox(id, event_type, recipient, channel, payload jsonb, status, attempts, next_attempt_at, provider_message_id nullable, last_error nullable, created_at, sent_at nullable)`
- `audit_events(id, actor_type, actor_id, action, target_type, target_id, before_state jsonb, after_state jsonb, request_id, ip_hash nullable, created_at)`

## API contract (initial)

All mutation endpoints require validation, authorization and idempotency where applicable. Responses must not expose secrets or provider credentials.

### Public catalogue
- `GET /api/v1/products` — published products and available variant choices; no exact stock quantity.
- `GET /api/v1/products/:slug` — product details and variant-specific prices/status.
- `GET /api/v1/services` — published service catalogue.

### Cart and checkout
- `POST /api/v1/checkout/quote` — validate variant IDs/quantities, recalculate subtotal and delivery quote; return expiry.
- `POST /api/v1/orders` — create order and reserve stock atomically; require idempotency key.
- `GET /api/v1/orders/:orderNumber` — authenticated owner or valid guest token only.

### Payments
- `POST /api/v1/payments/paystack/initialize` — create Paystack attempt server-side for a pending order.
- `POST /api/v1/payments/paystack/webhook` — verify signature, persist event idempotently, verify transaction and post ledger.
- `POST /api/v1/payments/:id/verify` — server-side provider verification; never accept client-supplied paid status.
- `POST /api/v1/payments/manual-transfer` — create transfer instruction / pending payment record.
- `POST /api/v1/admin/payments/:id/confirm-transfer` — staff permission required; actual bank credit must be checked before confirmation.
- `POST /api/v1/admin/refunds` — permission, approval and ledger/reconciliation controls required.

### Admin and catalogue
- `POST /api/v1/admin/products`, `PATCH /api/v1/admin/products/:id`
- `POST /api/v1/admin/products/:id/variants`, `PATCH /api/v1/admin/variants/:id`
- `POST /api/v1/admin/inventory/adjustments` — mandatory reason and audit event.
- `POST /api/v1/admin/orders/:id/approve-fulfilment`
- `GET /api/v1/admin/international-requests`
- `POST /api/v1/admin/international-requests/:id/quote`

### Delivery
- `POST /api/v1/admin/delivery/:orderId/assign-rider`
- `POST /api/v1/rider/jobs/:id/accept`
- `POST /api/v1/rider/jobs/:id/events`
- `POST /api/v1/delivery/:id/customer-confirmation`
- `POST /api/v1/admin/delivery/:orderId/request-provider-quote`

### Identity and staff
- `GET /api/v1/me` — resolve Firebase identity and server-side role.
- `POST /api/v1/admin/staff/invitations` — owner/admin permission and four-seat cap.
- `PATCH /api/v1/admin/staff/:id/role` — owner-only, audit required.

## Authorization matrix

| Capability | Customer | Guest | Rider | Admin | Owner |
|---|---:|---:|---:|---:|---:|
| Browse public catalogue | Yes | Yes | Yes | Yes | Yes |
| View own order | Yes | Scoped token | No | Operational | Yes |
| Create order | Yes | Yes | No | No | No |
| View assigned delivery | No | No | Yes | Yes | Yes |
| Accept rider job | No | No | Yes | No | No |
| Manage catalogue | No | No | No | Yes | Yes |
| Adjust stock | No | No | No | Scoped | Yes |
| Confirm manual transfer | No | No | No | Scoped | Yes |
| Approve refunds | No | No | No | Configurable | Yes |
| View ledger/reconciliation | No | No | No | Explicit finance permission | Yes |
| Manage staff roles | No | No | No | No | Yes |

## Mandatory invariants

1. A payment cannot be marked verified from browser input.
2. A payment reference can credit an order only once.
3. Ledger transactions balance per currency.
4. Order totals equal the sum of immutable item, discount, delivery and applicable tax/fee snapshots.
5. Stock cannot be oversold under concurrent checkout.
6. A reservation is released after expiry/failure and consumed only on the defined paid-order transition.
7. A rider can read only assigned jobs.
8. Guest access is limited to one order and uses a hashed, high-entropy token.
9. Customer confirmation of delivery is distinct from rider marking a parcel delivered.
10. International shipping is not charged until the customer accepts the admin-approved quote.
11. Staff financial actions are auditable.
12. Secrets and full payment credentials never enter logs, browser storage or source control.
