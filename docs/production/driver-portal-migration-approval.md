# Production migration approval — RAW HAIRS Driver Portal

## Status
**NOT APPROVED — BLOCKED BY SOURCE DEFECTS.** This document and the migration have NOT been executed against production. The current SQL is incomplete and must not be applied to production or used to release the matching driver API/UI.

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

## What the migration changes
1. Creates `rider_otp_controls` with expiry, failed-attempt counter and lock timestamp; backfills currently active OTP jobs with a one-time 24-hour grace window.
2. Creates transient `verified_delivery_evidence` and durable `delivery_evidence` metadata tables.
3. Creates `delivery_exceptions` for driver-reported delivery problems.
4. **Does not currently replace `assign_rider_job` or define `reissue_delivery_otp`.** The existing production assignment RPC therefore will not create the new OTP control row. `unassign_delivery_job` is also not defined, although the admin dispatch API calls `unassign_rider_job(uuid)`. These missing RPCs are release blockers.
5. Replaces the existing rider transition trigger function with a narrower driver state machine.
6. Replaces `mark_delivery_photo` so only server-verified image evidence can be attached.
7. Replaces `confirm_delivery_otp` so completion requires both a registered verified photo and an unexpired valid six-digit OTP; five failed attempts lock the code.
8. Restricts the bucket to JPG, PNG and WebP, with an 8 MB maximum.

## Approval risks / limitations to resolve
- The migration has not been executed on a staging database. A SQL syntax and integration test is still required before production execution.
- The source currently omits `assign_rider_job`, `reissue_delivery_otp`, and `unassign_rider_job`. The previous version of this approval document incorrectly claimed that assignment/reissue RPCs were implemented. That claim has been withdrawn; do not approve until the SQL is corrected and the admin dispatch API dependencies are satisfied.
- Assignment/reissue must atomically create or reset the OTP control row together with the OTP hash. Unassignment/reassignment must invalidate any previously issued OTP.
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

## Apply procedure — disabled until blockers are cleared
Do not execute the following procedure until the missing RPCs are implemented, the source and this document are re-reviewed, and staging tests pass.

1. Take a fresh database backup / confirm point-in-time recovery availability.
2. Confirm the target project is `xcipemtyclinuyaadgxy`.
3. Apply this migration exactly once through the approved Supabase migration workflow. Do not paste partial fragments or manually insert migration-history rows.
4. Verify the four new tables, updated function definitions, existing trigger attachment and bucket restrictions.
5. Verify admin dispatch GET and test assignment/reissue using a designated test order and driver.
6. Test wrong OTP attempts, fifth-attempt lockout, expiry, photo-only rejection, OTP-only rejection and valid photo+OTP completion.
7. Confirm the order notification is generated once by `orders_notify_change`.
8. Only then approve/merge and deploy the matching API/UI changes.

## Rollback
Do not run a blind DROP-based rollback. The migration replaces production functions and creates tables that may contain real evidence or exception records after deployment. If a problem occurs, stop new driver assignments, preserve evidence, restore the prior function definitions from the pre-apply backup, and perform a reviewed forward-fix. A full database restore should be a last resort and must account for orders created after the backup.
