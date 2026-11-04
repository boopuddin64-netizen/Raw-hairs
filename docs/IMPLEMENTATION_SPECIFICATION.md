# RAW HAIRS — Implementation Specification

**Status:** Approved architecture and business rules; Phase 1 in progress  
**Repository:** `boopuddin64-netizen/Raw-hairs`  
**Working branch:** `production-readiness/phase-1-2`  
**Production safety:** No production database migration, credential rotation, or live payment activation is authorized by this specification.

## 1. Product and operating decisions

- Customer identity: Firebase accounts and guest checkout are both supported.
- Checkout: registered customers and guests.
- Payments: Paystack online payment and manual bank transfer.
- Manual transfers require explicit administrator verification.
- Online orders require administrator approval after verified payment and before fulfilment.
- Inventory: manual stock adjustments plus automatic sale deductions.
- Stock reservation: 15 minutes for an unpaid checkout; expiry releases reserved stock.
- Delivery: admin-managed assignment and status tracking; no third-party integration in the initial release.
- International orders: request-and-quotation workflow; admin prepares quote, customer accepts, then payment/fulfilment proceeds.
- Currency: NGN only. Store all monetary values as integer kobo.
- Initial staff access: owner and one designated admin. Additional staff creation is controlled by the owner.
- Email notifications: deferred until core workflows are stable. Notification outbox remains the future integration point.
- Backend hosting: Vercel Functions in the existing Vercel project; no separate always-on server for initial release.

## 2. Target architecture

- Existing React + Vite storefront remains the customer interface.
- Vercel Functions provide server-side APIs and own all privileged operations.
- Neon PostgreSQL is the system of record for products, variants, stock, customers, orders, payments, ledger, delivery, audit and notification events.
- Firebase Authentication supplies customer and staff identity tokens.
- Firebase Admin SDK is used only server-side to verify identity tokens and manage privileged identity operations.
- Product image storage is deferred; product image fields remain optional until a storage provider is selected.
- Paystack is accessed only by server-side code. The browser never receives the secret key.
- Vercel environment variables hold server secrets. No secret is committed to Git.

## 3. Authorization model

- Public visitors may read only published product/catalogue data and public content.
- Guest checkout uses a cryptographically random, high-entropy order access token. Store only its hash; reveal the raw token once to the guest.
- Authenticated customers may read their own profile and orders only.
- Staff roles are `owner`, `admin`, and `rider`; roles are stored server-side and are not trusted from client-supplied claims alone.
- Initial staff roster: one owner and one designated admin. The owner grants or revokes staff access.
- Riders can access only assigned delivery jobs and permitted delivery updates.
- All privileged writes pass through backend authorization and validation.
- Neon credentials and Firebase Admin credentials are server-only. Browser bundles contain no privileged secrets.
- RLS is evaluated as defense in depth if any direct database access is introduced. The initial design uses the backend as the only database client.

## 4. Commerce rules

### Orders and checkout
- The server reloads product prices and availability; client-submitted prices/totals are ignored.
- Order totals are computed in kobo and reconciled server-side.
- Each order has immutable item/price snapshots.
- Order status changes follow an explicit transition map and create an event/audit record.
- Guest orders are linked to a hash of a one-time access token.
- Paid online orders enter `paid_awaiting_admin_approval`; admin approval is required before fulfilment.
- Manual transfer orders remain pending until an admin verifies funds against the business bank account.
- A transfer screenshot or customer claim is never proof of payment.

### Inventory
- Stock is tracked per product variant.
- Checkout reserves available stock atomically for 15 minutes.
- Reservation expiry releases stock and expires the associated unpaid checkout/payment attempt.
- Verified payment converts the reservation to a sale exactly once.
- Admin stock adjustments require a reason and actor identity.
- All receipts, reservations, releases, sales, returns and adjustments are recorded as inventory movements.
- Concurrency tests must prove that simultaneous checkouts cannot oversell a variant.

### Payments and ledger
- Paystack initialization, verification and webhook handling are server-side.
- Verify webhook signatures and independently verify transaction reference, amount, currency and status with Paystack before marking paid.
- Enforce idempotency for webhook events, payment references and ledger posting.
- A repeated webhook or verification request must not create duplicate payment or ledger entries.
- Payment state and fulfilment state remain separate.
- Use balanced double-entry journals in integer kobo; posted journals are immutable and corrected with reversing journals.
- Refunds require authorization, provider result verification and corresponding ledger entries.
- Reconciliation reports compare orders, payment attempts, provider events and ledger journals.

### Delivery
- Admin creates/assigns delivery jobs and manages rider assignments.
- Riders authenticate and can access only their assigned jobs.
- Delivery transitions are validated and event-logged.
- Customer delivery confirmation uses a secure, expiring confirmation token.

### International requests
- Customer submits destination and requested items.
- Admin reviews and prepares a NGN quotation with expiry.
- Customer accepts or declines.
- Payment and fulfilment start only after acceptance and payment verification.

## 5. Data and migration policy

- Neon project: `Raw-hairs`, PostgreSQL 18, region `aws-us-east-2`.
- Production branch remains `production`.
- Existing isolated schema test branch: `raw-hairs-schema-test`.
- Existing migration `001_initial_schema.sql` has been executed successfully on the isolated branch only.
- Do not apply the migration to production until application-level security, workflow tests, backup/recovery checks and explicit production approval are complete.
- Future schema changes are versioned, reviewed, tested on a disposable/development branch, then promoted only after approval.
- Never use the production database for destructive tests.

## 6. Phase plan

### Phase 1 — Infrastructure and security
1. Create a dedicated Firebase project for RAW HAIRS.
2. Configure Firebase Authentication providers and authorized domains.
3. Defer product image storage; do not enable Firebase Storage or upgrade the Firebase billing plan for this phase.
4. Configure Firebase Admin SDK credentials as Vercel server-side environment variables.
5. Establish Neon development/production separation and restricted application database roles.
6. Establish Vercel Preview and Production environment separation.
7. Add server-only environment variable names and deployment checks; do not commit values.
8. Configure backup/recovery policy, logging, rate limits and secret rotation procedures.
9. Protect production branches/repository deployment paths where plan capabilities permit.

### Phase 1A — Customer authentication implementation\n- Firebase Web SDK is installed in the React/Vite frontend.\n- Customer email/password registration, sign-in, password reset, Google redirect sign-in and sign-out are implemented in the account page.\n- Browser Firebase configuration is supplied only through `VITE_FIREBASE_*` environment variables.\n- Staff authorization and customer order access remain unavailable until server-side token verification and role-protected APIs are implemented.\n- Vercel environment variables and end-to-end sign-in tests must be completed before this integration is considered verified.\n\n### Phase 2 — Backend foundation
- Add TypeScript Vercel Functions, API validation, Firebase token verification, role authorization, Neon pool, error handling, audit logging and rate limiting.

### Phase 3 — Catalogue and inventory
- Product/variant CRUD, image storage, inventory adjustment, reservations, expiry and concurrency-safe sale deductions.

### Phase 4 — Identity and orders
- Guest/account checkout, order snapshots, tracking, order transitions and admin approval.

### Phase 5 — Payments and finance
- Paystack integration, manual transfer verification, webhook idempotency, refunds, ledger posting and reconciliation.

### Phase 6 — Delivery and international requests
- Admin assignment, rider access, delivery events, customer confirmation and quotation workflow.

### Phase 7 — Verification and launch
- Security tests, end-to-end tests, payment sandbox, concurrency tests, operational monitoring, backup restore drill and controlled production release.

## 7. Required environment variable names

Server-only:
- `DATABASE_URL`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_WEBHOOK_SECRET`

Browser-safe, only if required:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_APP_ID`
- `VITE_PAYSTACK_PUBLIC_KEY`

Never prefix secrets with `VITE_`. Keep development and production values separate. Do not place actual secret values in this document or GitHub.

## 8. Phase 1 acceptance criteria

- Firebase project exists and its owner/recovery controls are confirmed.
- Auth providers and authorized domains are configured.
- Storage rules deny unauthorized writes.
- Vercel Preview and Production environment scopes are understood and separated.
- Server-only secrets are stored in Vercel, not source control.
- Neon application role is least-privilege and is not the database owner.
- Production database remains unchanged until approved.
- Backup/restore procedure and operational access are documented.

## 9. Explicit exclusions for initial release

- No multi-currency checkout.
- No automated third-party delivery integration.
- No automatic email sending until the email phase is approved.
- No direct browser-to-Neon connections.
- No production data migration or live Paystack activation without a separate approval.
## 10. Phase 1 execution log (2026-11-04)

- Specification committed to `docs/IMPLEMENTATION_SPECIFICATION.md` on the working branch.
- Added `.env.example` containing variable names only; no credentials or secret values are stored in Git.
- Updated `.gitignore` to continue ignoring all real `.env*` files while allowing the safe `.env.example` template.
- Audited Vercel project `raw_hairs`: framework is Vite; no project environment variables were present at audit time; SSO deployment protection is enabled for deployments other than custom domains; no custom production domain was listed.
- Audited Neon project: PostgreSQL 18 in `aws-us-east-2`; only the owner role exists on the production branch; public connections are currently allowed; no IP allowlist is configured.
- Attempted to enable Neon production-branch protection, but the current Neon plan rejected the operation because the protected-branch quota is exhausted/unsupported. No project or branch protection setting was changed.
- Firebase project creation is pending connection of the Firebase integration and owner confirmation of project identity/billing region. No Firebase project or credentials have been created.
- No Vercel environment variables were created because actual Firebase/Neon/Paystack credentials are not yet available.
- Production database schema remains untouched. All schema tests remain isolated to `raw-hairs-schema-test`.

### Phase 1 blockers / owner actions

1. Connect the Firebase integration and create the dedicated RAW HAIRS Firebase project.
2. Confirm the Firebase project ID and select the preferred project location for Storage (location choice can be difficult or impossible to change later).
3. Review Neon plan limits and decide whether branch protection is needed via plan upgrade or rely on repository/deployment safeguards for now.
4. Supply credentials only through the relevant provider dashboards and Vercel encrypted environment variables; never paste private keys into GitHub or public chat.
