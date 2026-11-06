# Database migration 001 — application and review notes

File: `db/migrations/001_initial_schema.sql`

## Purpose
Creates the first PostgreSQL commerce schema for RAW HAIRS: catalogue variants, stock balances and movement history, customers/staff, orders, delivery, Paystack/manual-transfer records, refunds, a balanced append-only ledger, international enquiries, notifications and audit events.

## Safety properties
- NGN amounts use integer kobo.
- Order line prices are immutable snapshots.
- Variant stock is separate from product identity.
- Four active owner/admin seats are enforced in the database.
- Payment references and provider event IDs are unique.
- Ledger entries must balance at transaction commit.
- Historical records are protected with restrictive foreign keys.
- Delivery, payment and fulfilment have separate state fields.

## Before applying
1. Select and create a dedicated development PostgreSQL database.
2. Confirm the database is not production and contains no existing customer data.
3. Review the SQL with the selected provider's PostgreSQL version.
4. Apply using a migration runner or SQL console.
5. Verify all tables, constraints and indexes.
6. Test the seat cap, duplicate payment event, stock reservation concurrency and balanced-ledger constraint.
7. Back up the empty development database and test restore.

## Important limitation
This migration has not been applied to any database. No PostgreSQL provider has yet been selected or provisioned. Do not apply it to production without review, migration tooling, backups and an approved release window.

## Follow-up migrations required before live commerce
- Atomic stock reserve/release/sale functions with concurrency control.
- Append-only enforcement and privileged database roles for ledger/audit tables.
- Customer/staff access policies if a browser-accessible database API is selected.
- Order/payment state transition functions.
- Provider settlement, fee and refund reconciliation structures.
- Data retention and deletion/anonymization rules.
