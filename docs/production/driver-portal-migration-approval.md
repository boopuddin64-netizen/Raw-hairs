# Production migration approval — RAW HAIRS Driver Portal

## Status
**PRODUCTION DATABASE MIGRATION APPLIED — DRIVER APP RELEASE STILL GATED.** The migration was applied to Supabase production project `xcipemtyclinuyaadgxy` on 2026-11-15. Post-apply checks confirmed all four tables, the three assignment lifecycle RPCs, execute grants, the private bucket restrictions, and zero active OTP-bearing jobs missing a control row. The driver API/UI is not yet released; do not merge/deploy until production-safe lifecycle verification and rollout checks are complete.

Migration:
`supabase/migrations/20261115100000_driver_portal_integrity_phase_0_3.sql`

## Production target
Supabase project: `xcipemtyclinuyaadgxy`

## Verified live facts
- `rider_jobs.id`, `rider_jobs.order_id`, `rider_jobs.rider_id` are UUID.
- `rider_jobs.delivery_otp_hash` and `delivery_photo_path` are text.
- Existing `rider_jobs_transition_check` trigger is already attached to `validate_rider_transition()`; replacing the function body changes the active guard without adding a duplicate trigger.
- `orders_notify_change` already inserts the customer notification when order status changes. The new OTP confirmation deliberately relies on that trigger and does not insert a second notification.
- Existing assignment stores the SHA-256 digest in the text column using PostgreSQL bytea text representation (a leading `\\x` followed by hex). The new confirmation supports that legacy representation and new lowercase hex hashes.
- `notifications` has the fields used by the existing order notification trigger.
- `delivery-evidence` is a private bucket. Current storage policies already scope upload/read access to the assigned rider or owner.

## Production application record
- Applied through Supabase migration tooling as `driver_portal_integrity_phase_0_3`.
- Production migration ledger version: `20261115180458`.
- Application result: success.
- Post-apply verification: all four new tables present; assignment/reissue/unassign RPCs present; no anon/authenticated execute grant on those three admin RPCs; private `delivery-evidence` bucket restricted to JPG/PNG/WebP and 8 MiB; zero active OTP-bearing jobs missing an OTP-control row.
- No test assignment, OTP reissue, unassignment, delivery completion, or customer notification was triggered against a real order during verification.

## What the migration changes
1. Creates `rider_otp_controls` with expiry, failed-attempt counter and lock timestamp; backfills currently active OTP jobs with a one-time 24-hour grace window.
2. Creates transient `verified_delivery_evidence` and durable `delivery_evidence` metadata tables.
3. Creates `delivery_exceptions` for driver-reported delivery problems.
4. Defines `assign_rider_job(uuid,text)`, `reissue_delivery_otp(uuid)`, and `unassign_rider_job(uuid)`. Assignment/reissue atomically update the OTP hash and control row; unassignment clears both. These functions are restricted to service_role execution (with owner checks inside the function for explicitly owner-authorized calls).
5. Replaces the existing rider transition trigger function with a narrower driver state machine.
6. Replaces `mark_delivery_photo` so only server-verified image evidence can be attached.
7. Replaces `confirm_delivery_otp` so completion requires both a registered verified photo and an unexpired valid six-digit OTP; five failed attempts lock the code.
8. Restricts the bucket to JPG, PNG and WebP, with an 8 MB maximum.

## Approval risks / limitations to resolve
- The migration was applied directly to production at the owner's instruction, without a paid development branch. A full staging replay and integration test were therefore not performed. The OTP generator expression was separately exercised as a read-only production SELECT and returned a six-digit value; this is not a substitute for lifecycle testing.
- The source definitions for assignment/reissue/unassign have now been added. They still require disposable staging execution and tests for assignment, reassignment, reissue, unassignment and OTP invalidation before approval.
- The new RPCs atomically create/reset OTP controls with the hash. Verify that reassignment rotates the OTP, and unassignment removes the control and clears the prior hash.
- The 90-day `expires_at` value is metadata only. A scheduled process to delete expired Storage objects and evidence rows is NOT included in this migration. Do not describe evidence as automatically deleted after 90 days until that cleanup is implemented and verified.
- Existing active OTPs are granted a 24-hour grace period from migration time. This is a deliberate one-time transition policy; the owner should be aware that currently issued codes remain valid for that period.
- The new `delivery_exceptions` table stores reports, but admin resolution UI/API is a later integration task.
- Production deployment of the driver UI/API must follow migration verification. The frontend expects the new tables and RPC behavior.
- Review the OTP generation expression using `extensions.gen_random_bytes`; pgcrypto is already implied by existing use of `extensions.digest`, but confirm the function is present in the production extensions schema immediately before execution.

## Pre-apply checks
Run these read-only checks immediately before approval:
```sql
select to_regprocedure('extensions.gen_random_bytes(integer)') as secure_random,
       to_regprocedure('extensions.digest(bytea,text)') as digest_fn,
       to_regprocedure('public.is_raw_hairs_owner()') as owner_check,
       to_regprocedure('public.is_raw_hairs_rider()') as rider_check;

select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid='public.rider_jobs'::regclass and not tgisinternal;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets where id='delivery-evidence';

select status, count(*) from public.rider_jobs group by status;
```

## Apply procedure — completed; do not repeat
The migration has already been applied. Do not re-run it. The remaining release procedure is limited to application rollout and lifecycle verification; do not merge/deploy the driver app until the tests below pass.

1. Completed: the migration was applied through Supabase migration tooling. Do not execute it again.
2. Completed: target was `xcipemtyclinuyaadgxy`.
3. Completed: migration ledger entry `20261115180458` records the application.
4. Completed: verified tables, RPCs/grants, and bucket restrictions.
5. Pending: test admin dispatch GET and assignment/reissue with a designated test order and driver.
6. Pending: test wrong OTP attempts, fifth-attempt lockout, expiry, photo-only rejection, OTP-only rejection and valid photo+OTP completion.
7. Pending: confirm one customer notification is generated by `orders_notify_change` after a test delivery.
8. Only after those checks, approve/merge and deploy the matching API/UI changes.

## Rollback
Do not run a blind DROP-based rollback. The migration replaces production functions and creates tables that may contain real evidence or exception records after deployment. If a problem occurs, stop new driver assignments, preserve evidence, restore the prior function definitions from the pre-apply backup, and perform a reviewed forward-fix. A full database restore should be a last resort and must account for orders created after the backup.
