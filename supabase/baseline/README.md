# Supabase migration ledger

This directory is **not** part of `supabase/migrations/` on purpose. It holds
reconstructed and reconciliation material that must not create a new entry in
production's migration ledger.

## What is fixed in `supabase/migrations/`

Two repository files used to share version `20261113140000`:

- `20261113140000_phase3_payment_rpcs_drift_repair.sql`
- `20261113140001_admin_confirm_bank_transfer_service_role.sql` (renamed from
  `20261113140000_...`)

The rename only resolves timestamp ordering for a clean replay. Neither version
appears in production's ledger, so this does not change what production has
applied.

## What is reconstructed here

`20261115060245_raw_hairs_admin_rate_limit_repair.reconstructed.sql` rebuilds
the rate-limit table and RPCs from live catalog metadata. Production's ledger
has that version, but the original SQL file was never committed on any branch.

Do **not** copy it into `supabase/migrations/`. Review it and apply it manually
when bootstrapping a disposable or staging database.

## What still blocks `supabase db push`

Resolving the duplicate version and documenting the rate-limit baseline does not
make the repository ledger match production. Many source files use different
timestamps than the applied production migrations, and production has entries
with no source file. `supabase db push` would therefore treat already-applied
changes as pending.

The authoritative mapping and disposition are in
`docs/database/phase-1-2-reconciliation-2026-11-15.md` (§1.1–1.5). Do not run
`supabase db push` against production until each production ledger entry is
mapped to canonical SQL (or explicitly classified as reconstructed) and a
clean-room replay has passed on a disposable database.
