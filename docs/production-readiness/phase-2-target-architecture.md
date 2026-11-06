# RAW HAIRS — Phase 2 Target Architecture

**Status:** Proposed implementation baseline, derived from confirmed business decisions.  
**Hosting:** Existing Vercel project `raw_hairs` linked to this GitHub repository.  
**Architecture principle:** One authoritative transactional database; identity and media services are separated from commerce and financial truth.

## 1. System context

```text
Customer browser / staff portal / rider portal
                 |
                 v
          Vercel web application
                 |
                 v
       Trusted server-side API layer
          |        |         |
          v        v         v
     PostgreSQL  Firebase  External services
     commerce    Auth      Paystack / delivery
     + ledger    + Storage providers / email
```

The browser is an untrusted client. It may display estimates, but the backend recalculates and validates all prices, stock, delivery charges, permissions and payment states.

## 2. Responsibility boundaries

### Vercel
- Host the existing React storefront and server-side API/functions.
- Deploy production only from the agreed production branch.
- Create preview deployments from the isolated readiness branch.
- Keep environment variables separated by Preview and Production.

### Firebase Authentication
- Google and email sign-in for customers.
- Staff sign-in with stronger account protection and MFA policy.
- Firebase ID tokens verified by the backend using the Admin SDK.
- Guest checkout uses a server-issued, high-entropy guest access token scoped to the guest order; never trust a customer-supplied user ID.

### PostgreSQL
Authoritative source for:
- Product catalogue, sellable variants, prices and stock.
- Customers and staff-role mappings.
- Carts or checkout snapshots where persistence is needed.
- Orders and order-item snapshots.
- Payment attempts, verified transactions, refunds and settlement records.
- Append-only financial ledger.
- Delivery quotes, assignments, rider acceptance and proof-of-delivery events.
- International order enquiries.
- Notification outbox and security/audit events.

### Firebase Storage
- Product and service media.
- Private customer-submitted evidence only if the business decides it is needed.
- Upload authorization, file type/size limits and public/private bucket separation.
- Do not store payment secrets or sensitive financial credentials in object metadata.

## 3. Core domain model

- `products`: product identity and public description.
- `product_variants`: SKU, length/size/colour/configuration, price in kobo, currency, availability.
- `inventory_balances`: current on-hand and reserved quantity per variant.
- `inventory_movements`: append-only stock movements with reason and actor.
- `customers`: customer profile and linked Firebase UID when registered.
- `staff_users`: Firebase UID, role, active status; maximum four active owner/admin seats.
- `orders`: customer/guest reference, currency, state, totals and approval state.
- `order_items`: immutable snapshot of product name, variant, unit price and quantity.
- `delivery_quotes`: provider, route, quote amount, expiry and quote reference.
- `payment_attempts`: provider, unique reference, expected amount and status.
- `payment_events`: idempotently recorded verified provider events.
- `ledger_accounts`, `ledger_transactions`, `ledger_entries`: append-only double-entry accounting.
- `refunds`: requested/approved/processed refund state and provider reference.
- `delivery_jobs`, `delivery_events`: assignment, rider acceptance, milestones and customer confirmation.
- `international_requests`: admin review, quote, WhatsApp contact and acceptance state.
- `notification_outbox`: reliable queued notifications and retries.
- `audit_events`: staff/system action history.

## 4. Pricing and money rules

- Currency for initial launch: NGN, stored as integer kobo.
- Never use floating-point arithmetic for money.
- Product variant price is authoritative; a selected length is a variant, not a client-side surcharge.
- At order creation, persist a complete immutable price snapshot.
- Delivery charge is a separately identified amount and is not silently folded into product price.
- Discounts, fees, tax (if applicable), delivery and refunds must be explicit line items with defined rounding.
- The backend calculates totals and validates that each amount is non-negative and within configured limits.
- Do not infer or hard-code Paystack fee allocation until the merchant settlement configuration and business fee policy are approved.

## 5. Order and payment state model

Order fulfilment state and payment state are separate dimensions.

Suggested payment states:
`unpaid → pending → verified_paid`; also `failed`, `expired`, `partially_refunded`, `refunded`, `review_required`.

Suggested fulfilment states:
`awaiting_payment → paid_awaiting_admin_approval → approved_for_fulfilment → processing → ready_for_dispatch → assigned → accepted_by_rider → in_transit → delivered_pending_customer_confirmation → completed`.

International request states:
`submitted → admin_review → quote_prepared → quote_sent → customer_accepted → payment_pending → paid → fulfilment`; allow explicit declined/expired/cancelled states.

### Paystack
1. API creates payment attempt and reference server-side.
2. API initializes Paystack with exact amount and customer details.
3. Browser redirects/opens provider checkout.
4. Browser callback is informational only.
5. Backend verifies transaction directly with Paystack and checks reference, amount, currency and successful status.
6. Signed webhook is verified using the configured secret and processed idempotently.
7. Unique provider event/reference constraints prevent duplicate crediting.
8. Payment verification and ledger posting occur in a database transaction.
9. Reconciliation checks provider transactions and settlements against local records.

### Manual bank transfer
- Create a pending transfer instruction with unique order reference.
- Customer-submitted receipt is supporting evidence only.
- An authorized staff member verifies actual bank credit, amount, payer/reference and destination account.
- Record verifier, timestamp and evidence reference.
- Post the ledger transaction only after verification.
- A second staff approval can be enabled above a configurable amount.

### No cash on delivery
Cash on delivery is not offered or represented in the checkout UI.

## 6. Inventory reservation and concurrency

- Check and reserve stock atomically inside a database transaction.
- Use row-level locking or an equivalent conditional update to prevent overselling.
- Reservations have expiry timestamps.
- Successful payment converts reservation to sale.
- Failed/expired payment releases reservation.
- Every stock change writes an inventory movement with actor, reason and reference.
- Public storefront returns availability labels only, not exact stock quantities.

## 7. Hybrid delivery

- Configure service zones and in-house rider eligibility.
- For eligible routes, create an internal delivery job and offer it to an assigned rider.
- For external routes, request quotes from configured providers and store provider quote IDs and expiry.
- Admin can select/override the delivery method with an audit reason.
- Rider must accept before the job becomes active.
- Customer delivery confirmation is a distinct event, not simply a rider status toggle.
- Proof can include a one-time customer PIN and timestamp; photo is optional and subject to privacy/retention policy.
- Provider webhook events must be authenticated and idempotent.

Provider choice and geographic coverage remain implementation inputs; no specific provider is assumed.

## 8. Roles and authorization

- Owner: full business and financial administration.
- Admin: operational management, orders, catalogue and delivery; financial permissions are explicitly scoped.
- Rider: only assigned jobs and minimum necessary delivery information.
- Customer: own profile and own orders only.
- Guest: access only to the order associated with a server-issued guest token.
- Maximum four active owner/admin staff seats combined.
- Enforce permissions in the API/database layer, not merely by hiding UI routes.
- Log staff invitations, role changes, payment verification, refunds, price changes and stock adjustments.

## 9. International orders

- Customer submits requested items, destination country and contact details.
- Request appears in the admin queue and triggers a notification.
- Admin reviews feasibility and obtains a shipping quote.
- Customer is contacted through the chosen channel, including WhatsApp.
- No international shipping amount is charged before quote acceptance.
- Convert accepted request into a normal order/payment flow with a stored quote and expiry.
- Never expose an unverified delivery estimate as a confirmed price.

## 10. Notifications and reliability

Use a transactional outbox: business transaction and notification record commit together. A worker sends email/WhatsApp/SMS and records attempts, provider IDs and failures. Retry transient failures with backoff; do not duplicate customer messages on webhook retries.

Initial channels:
- Email for transactional order and staff notifications.
- WhatsApp deep links for direct customer/admin conversations.
- Automated WhatsApp only after an approved provider, template and opt-in policy are selected.

## 11. Security baseline

- Secrets only in Vercel environment variables or approved secret manager; never in source control or browser bundles.
- Separate Preview and Production credentials and databases.
- Firebase ID token verification and server-side role lookup.
- Rate limiting for authentication-adjacent, checkout, quote and guest-order endpoints.
- CSRF/origin protections appropriate to the chosen session strategy.
- Input validation, output encoding, secure headers and dependency scanning.
- Webhook signature verification and replay/idempotency controls.
- Least-privilege database credentials and storage rules.
- Encrypted backups and a tested restore procedure.
- Audit logs for privileged and financial actions.
- Avoid storing full card data; Paystack handles payment details.

## 12. Deployment topology

- Existing Vercel project: `raw_hairs`.
- Production branch remains unchanged during this phase.
- Feature work happens on `production-readiness/phase-1-2`.
- Preview deployments must use non-production credentials and isolated test data.
- Production deploy only after explicit review, test evidence and approval.
- Database migrations are versioned and applied in a controlled release step.
- Rollback plan includes application rollback and forward-compatible database migrations.

## 13. Cost and provider decision gates

The repository is linked to a Vercel Hobby team. Before introducing any paid service, compare:
- PostgreSQL free-tier limits, backups, connection pooling, region and sleeping/compute constraints.
- Firebase Authentication and Storage quotas, egress and image delivery costs.
- Vercel Functions limits and database connection behavior.
- Email provider free tier and deliverability.
- Delivery provider API fees and coverage.

Do not use two databases for the same transactional data. PostgreSQL remains the sole source of truth for commerce and money.

## 14. Implementation sequence

1. Approve schema, state machines, role matrix and provider choices.
2. Provision isolated development PostgreSQL and Firebase projects.
3. Implement API foundation, validation, authentication and authorization.
4. Implement product variants and inventory transactions.
5. Implement cart, checkout, delivery quote and order creation.
6. Implement Paystack and manual transfer verification.
7. Implement ledger and reconciliation.
8. Implement admin approval, riders and delivery confirmation.
9. Implement international request workflow and notifications.
10. Run security, concurrency, payment replay, refund, backup/restore and mobile UX tests.
11. Launch only after business content and legal policy approval.

## Decisions still required before production payment launch

- PostgreSQL provider and region.
- Actual in-house rider service zones and dispatch coverage.
- Third-party delivery provider(s) and quote API availability.
- Manual transfer verification account and staff authorization.
- Paystack verification completion.
- Email/WhatsApp notification provider.
- Final product catalogue, prices, policy wording and customer support details.
