# RAW HAIRS database reconciliation — Phases 1 and 2

**Audit date:** 2026-11-15  
**Production Supabase project:** `xcipemtyclinuyaadgxy`  
**Repository:** `boopuddin64-netizen/Raw-hairs`  
**Repository branch reviewed:** `feature/driver-portal-phases-0-3` (main migration directory also compared)  
**Execution status:** Read-only audit. No production DDL, DML, migration application, or migration-history edits were performed.

## Executive result

Production currently reports 24 applied migrations. The repository migration directory has 22 SQL files on `main` and 23 on the driver-portal feature branch. The two migration sets are not a reliable one-to-one representation of the production migration history.

The live schema contains the core checkout, order, payment, inventory-reservation, notification, and dispatch objects. However, several repository migrations described as source-only or pending are not reflected in production, and the new driver-portal migration is not applied.

Do not run `supabase db push` against production until the migration ledger and canonical SQL have been reconciled.

## Phase 1 — Migration history reconciliation

### 1.1 Production migration ledger

The production migration API returned these 24 versions:

| Version | Production migration name |
|---|---|
| 20261111145644 | restrict_rls_auto_enable_function |
| 20261111145717 | raw_hairs_initial_schema |
| 20261111163251 | public_catalog_product_image_read |
| 20261111212510 | phase_1_foundation_repair |
| 20261112065539 | grok_catalogue_import |
| 20261112102441 | grok_catalogue_import |
| 20261112215733 | phase_1_backend_integrity_corrected |
| 20261112215837 | fix_order_rpc_delivery_fee_null |
| 20261112215902 | security_advisor_fixes |
| 20261112220627 | phase_3_payment_lifecycle |
| 20261112221039 | phase_3_notifications_settings_seed |
| 20261112221115 | fix_notifications_order_fk |
| 20261112231245 | phase_5_booking_validation |
| 20261112231253 | phase_6_delivery_otp |
| 20261112231314 | phase_5_6_rpc_grant_hardening |
| 20261112231925 | fix_notify_order_event_public_grant |
| 20261112233021 | fix_reserve_cart_items_authenticated_grant |
| 20261112233219 | fix_checkout_grants_and_anon_exposure |
| 20261113110935 | guest_tracking_and_fulfillment_automation |
| 20261113111008 | revoke_trigger_function_execute |
| 20261113120118 | admin_confirm_bank_transfer_service_role |
| 20261113134103 | allow_paid_to_processing_transition |
| 20261113134113 | advance_order_status_service_role |
| 20261115060245 | raw_hairs_admin_rate_limit_repair |

### 1.2 Repository mismatches

The repository contains files whose timestamp versions do not appear in the production ledger, including:

- `20261111180000_phase_1_foundation_repair.sql`
- `20261112190000_phase_1_backend_integrity.sql`
- `20261112190010_phase_1_corrected_part1.sql`
- `20261112190012_phase_1_corrected_part1b.sql`
- `20261112190020_phase_1_corrected_part2.sql`
- `20261112190030_phase_1_corrected_part3.sql`
- `20261112210000_phase_5_booking_validation.sql`
- `20261112211000_phase_6_delivery_otp.sql`
- `20261112212500_fix_checkout_grants.sql`
- `20261113110000_customer_order_tracking.sql`
- `20261113130000_guest_tracking_and_fulfillment_automation.sql`
- `20261113140000_admin_confirm_bank_transfer_service_role.sql`
- `20261113140000_phase3_payment_rpcs_drift_repair.sql`
- `20261113143000_advance_order_status_recovery_transitions.sql`
- `20261114173000_security_phase_hardening.sql`
- `20261114180000_db_workflow_and_delivery_photo_guard.sql`
- `20261114181000_limit_client_database_writes.sql`
- `20261114182000_catalog_flexibility.sql`

This list means “no matching timestamp version in the live migration ledger”; it does **not** prove the SQL was never applied manually or through a differently timestamped migration.

Production versions without a same-version SQL file in the repository include:

- `20261111145644` — restrict RLS auto-enable function
- `20261111212510` — phase 1 foundation repair
- `20261112215733` — corrected phase 1 backend integrity
- `20261112215837` — NULL-safe delivery-fee RPC fix
- `20261112215902` — security advisor fixes
- `20261112220627`, `20261112221039`, `20261112221115` — payment lifecycle and notification changes
- `20261112231245`, `20261112231253`, `20261112231314`, `20261112231925`, `20261112233021`, `20261112233219` — booking, OTP, and RPC grant hardening
- `20261113110935`, `20261113111008` — guest tracking/fulfillment and trigger-function execute revocation
- `20261113120118`, `20261113134103`, `20261113134113` — bank-transfer and order-transition changes
- `20261115060245` — admin rate-limit repair

Some repository SQL explicitly documents that it corresponds to a differently named/versioned production migration. For example, the corrected Phase 1 files describe the live migration `phase_1_backend_integrity_corrected`; the Phase 1 parent file `20261112190000_phase_1_backend_integrity.sql` is intentionally inert/superseded. These files must not be treated as independent pending migrations.

### 1.3 Duplicate repository version

Two repository files share version prefix `20261113140000`:

- `20261113140000_admin_confirm_bank_transfer_service_role.sql`
- `20261113140000_phase3_payment_rpcs_drift_repair.sql`

Resolve the duplicate version before relying on timestamp ordering in a clean migration replay. Do not rename or insert history rows in production as a quick fix; first determine the canonical SQL and whether each change is already present in the live schema.

### 1.4 Production-only migration

The live ledger contains `20261115060245_raw_hairs_admin_rate_limit_repair`, but no corresponding SQL file was found in the reviewed repository migration directory. Recover its exact SQL from the original deployment/commit or reconstruct it from verified live definitions before declaring the repository canonical.

### 1.5 Recommended Phase 1 disposition

1. Freeze production migration application while reconciling.
2. Recover SQL for every production-only ledger entry.
3. Map differently timestamped source migrations to the production ledger by SQL content and resulting schema, not by filename alone.
4. Mark inert/superseded source files clearly; exclude them from a fresh baseline replay or retain them only as historical documentation.
5. Resolve the duplicate `20261113140000` version.
6. Generate and test a canonical baseline/replay against a disposable database.
7. Do not manually insert or delete rows in `supabase_migrations.schema_migrations` merely to make the lists look aligned.

## Phase 2 — Live schema and function reconciliation

### 2.1 Confirmed production objects

The following objects exist in production:

- Core: `profiles`, `products`, `services`, `bookings`, `orders`, `order_items`
- Commerce: `inventory_reservations`, `product_availability`, `payments`, `return_requests`, `refund_transactions`
- Operations: `rider_jobs`, `notifications`, `audit_log`, `store_settings`, `reviews`, `api_rate_limits`

The live `orders` schema supports guest checkout (nullable `customer_id` plus guest/customer contact and delivery fields), NGN/kobo monetary columns, payment method, and reservation expiry. The live `rider_jobs` table uses text OTP hashes and contains the existing assignment/status/photo columns.

### 2.2 Catalog flexibility migration is not live

The repository migration `20261114182000_catalog_flexibility.sql` is not represented in production history, and the live database confirms these objects are absent:

- `catalog_product_types`
- `catalog_categories`
- `catalog_attribute_definitions`

The live `products` table also lacks the migration's expected `product_type_id`, `category_id`, `attributes`, and `gallery_paths` columns. It still has the legacy `category` text field and hair-specific columns.

**Impact:** Any application code that assumes the flexible catalog schema exists will fail against production. Keep catalog UI/API usage on the legacy schema until a reviewed catalog migration is staged and applied.

### 2.3 Driver portal integrity objects are not live

The following objects are absent in production:

- `rider_otp_controls`
- `verified_delivery_evidence`
- `delivery_evidence`
- `delivery_exceptions`

The live `delivery-evidence` storage bucket exists but has no configured file-size limit or allowed MIME-type list. The live assignment RPC still generates OTP using `random()`, stores a SHA-256 digest, and does not create the proposed OTP control row. The live `confirm_delivery_otp(uuid,text)` still checks the OTP alone and has no photo-evidence requirement or attempt lockout.

**Impact:** The new driver portal flow must not be deployed as if the database were ready. Its migration needs to be corrected, tested, and applied before enabling the dependent UI/API behavior.

### 2.4 Workflow guard migration is not live

The repository's `20261114180000_db_workflow_and_delivery_photo_guard.sql` explicitly labels itself source-only/not applied. Production does not have the `orders_status_workflow_guard` trigger. The live rider transition trigger exists, but its current function body allows service-role/owner bypass and otherwise validates rider-owned transitions; it does not implement the newer transaction-local workflow guard from the source-only file.

**Impact:** Do not assume the newer order-status or delivery-photo database guardrails are active in production.

### 2.5 Client-write restriction migration is not live

The repository's `20261114181000_limit_client_database_writes.sql` explicitly labels itself source-only/not applied. Production still has broad owner-manage policies for multiple tables, and the current rider assignment/transition path depends on the service-role API and existing grants/policies.

**Impact:** Application security assumptions must be checked against actual production grants and policies. Do not deploy frontend changes that rely on the proposed restriction migration until it has been staged and applied.

### 2.6 Trigger and notification dependencies

Production currently has these relevant triggers:

- `orders_auto_advance`
- `orders_auto_dispatch`
- `orders_notify_change`
- `orders_money_sync`
- `order_items_money_sync`
- `rider_jobs_transition_check`
- `audit_rider_jobs`

Preserve the automatic dispatch-job creation and customer notification trigger behavior. Avoid adding a second delivery notification insert in the delivery RPC if the order status update already fires `orders_notify_change`.

### 2.7 Other observed schema/security notes

- All inspected public application tables have RLS enabled; `api_rate_limits` has no RLS policy (advisor INFO finding). This may be intentional for service-role-only access, but verify its grants.
- The security advisor reports 8 SECURITY DEFINER functions executable by anon and 14 executable by authenticated. Review each function's internal authorization before changing grants; guest checkout/tracking may intentionally be public.
- The live `assign_rider_job(uuid,text)` has EXECUTE granted to service_role only, while its function body still uses non-cryptographic `random()` OTP generation.
- `delivery-evidence` is private, but current bucket constraints are unset.
- The advisor reports 16 foreign keys without covering indexes, including `rider_jobs.order_id`; prioritize indexes based on query patterns and table growth rather than applying all blindly.

## Phase 2 — Required application/schema compatibility checks

Before the next deployment, search all application code and serverless endpoints for references to:

1. Catalog-flexibility columns/tables absent from production.
2. Driver evidence/OTP tables absent from production.
3. RPC signatures and arguments that differ from production definitions.
4. Order/rider status transitions and their trigger guard assumptions.
5. Any direct browser writes blocked only by the unapplied client-write restriction migration.

Build and integration tests should be run against a staging database created from the reconciled canonical migration set.

## Change log / safety

- Read production migration history and schema metadata.
- Read repository migration files on `main` and `feature/driver-portal-phases-0-3`.
- Queried live columns, constraints, triggers, functions, function grants, RLS state, storage bucket settings, and Supabase advisors.
- **No production data or schema was changed.**
- No migration was applied, and no migration-history row was inserted or deleted.

## Remaining work

This report establishes the reconciliation findings. It does not yet constitute a complete application-code reference scan or a clean-room migration replay. Those are required before declaring Phase 1 and Phase 2 complete.
