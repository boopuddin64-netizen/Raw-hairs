# RAW HAIRS Driver Portal — Phases 4–6

## Branch and production boundary

- Work branch: feature/driver-portal-phases-4-6
- Parent: Phase 0–3 work at 0ecd584bec96b79e7045ecbc017f193f8ed5c6da
- Production Supabase project: xcipemtyclinuyaadgxy
- Phase 0–3 migration is already applied in production (ledger version 20261115180458). Never rerun it.
- No paid staging branch is to be created.
- Do not merge or deploy until the release gates in Phase 6 pass.
- Do not use existing customer orders, live delivery jobs, or real customer OTPs as test fixtures.

## Preserved business rules

These rules were established in prior project decisions and must not be silently changed:

- Delivery completion requires both customer OTP and verified photo evidence.
- OTP is six digits.
- New assignment OTP validity: 24 hours.
- Manual OTP reissue validity: 30 minutes.
- Five failed OTP attempts lock the code; owner/admin reissue resets the counter and issues a new code.
- Unassignment clears the assigned driver, prior OTP hash and OTP-control row.
- Evidence retention target: 90 days.
- Delivery evidence bucket remains private; JPG, PNG and WebP only; maximum 8 MiB.
- Driver may report delivery exceptions; owner/admin resolves or dismisses them.
- Do not send duplicate customer delivery notifications. Existing orders_notify_change trigger owns the order-status notification.

## Phase 4 — Delivery lifecycle verification and integrity

### 4.1 Correct OTP contract
- Preserve 24-hour validity for initial assignment.
- Preserve 30-minute validity for manual reissue.
- Correct the dispatch UI copy: assignment and reissue must display their respective actual expiry durations.
- Add server-side/API tests asserting both expiry contracts, six-digit code format, hash-only persistence, reset-on-reissue, and invalidation on unassignment.
- Never return an OTP in GET responses or persist plaintext OTP.

### 4.2 Safe lifecycle test harness
- Add isolated automated tests using mocked Supabase clients and deterministic fixtures; do not mutate production records.
- Cover assignment, reassignment/OTP rotation, reissue, unassignment, pickup, in-transit, photo verification, photo-only rejection, OTP-only rejection, wrong OTP, fifth-attempt lockout, expiry, valid photo+OTP completion, and duplicate completion.
- Assert that only one order status transition occurs and the existing notification trigger is relied upon exactly once.
- Add explicit tests for pending_admin_approval: a delivery must not become completed while the order is awaiting approval.
- Add race tests for two dispatchers attempting the same assignment and duplicate driver transition submissions.

### 4.3 Authorization and API hardening
- Verify every driver endpoint scopes reads and writes to the authenticated driver's own jobs.
- Verify owner-only dispatch operations, same-origin mutation checks, no-store responses and role checks.
- Ensure uploaded evidence cannot be attached to a different job, by another driver, or after the job leaves in-transit.
- Confirm all OTP and evidence control tables remain inaccessible to anon/authenticated direct table access; service-role use stays server-only.
- Validate that failed uploads are cleaned up and that cleanup failures are observable without leaking storage paths or credentials.

### 4.4 Lifecycle completion gate
Phase 4 is complete only when automated tests cover the above and a designated disposable test order/driver can pass the full workflow without customer notifications or production customer data being touched. If a safe disposable production fixture cannot be created, mark the live integration gate blocked rather than using a real order.

## Phase 5 — Operations, exceptions and evidence retention

### 5.1 Admin exception management
- Add an owner/admin-only API to list pending/resolved/dismissed exceptions with pagination and safe order/job context.
- Add resolve and dismiss actions with required resolution notes, actor ID and timestamps.
- Enforce valid state transitions and optimistic concurrency; repeated resolution must return a conflict rather than overwrite an earlier decision.
- Add an admin dispatch UI panel for pending exceptions, details, resolution/dismissal and refresh.
- Do not allow a driver to resolve their own exception or modify exception status directly.
- Add tests for role denial, invalid status, missing resolution note, concurrent resolution, and audit fields.

### 5.2 Evidence retention and cleanup
- Implement a server-only scheduled cleanup job for expired evidence, with dry-run support, bounded batches, idempotency and structured counts.
- For each expired evidence record, delete the corresponding object from the private Storage bucket and then delete the metadata row only after Storage deletion succeeds (or confirmed object absence).
- Handle partial failures safely: retain metadata when object deletion fails; retry on a later run.
- Clean stale unconsumed verified_delivery_evidence records and their associated uploaded objects using an explicit short TTL.
- Protect cleanup endpoint with a strong server-only secret/cron authorization; never expose it to browser clients.
- Add tests for expiry boundaries, missing objects, Storage failures, partial batches, idempotency and authorization.
- Do not claim 90-day automatic deletion until the scheduled job is deployed and observed completing successfully.

### 5.3 Operations visibility
- Add structured logs for assignment, reissue, unassignment, exception resolution, evidence verification, cleanup outcomes and delivery completion.
- Redact OTP values, bearer tokens, customer phone numbers and image contents.
- Add useful admin-visible error states without exposing raw database errors.

## Phase 6 — Regression, security and controlled release

### 6.1 Automated quality gates
- Run full unit/API tests, lint/type checks if configured, frontend production build, server-function syntax checks and migration SQL static checks.
- Add regression coverage for the existing customer shop, checkout/payment, admin auth, dispatch and driver portal.
- Verify no service-role key, admin secret, cron secret or OTP is included in the client bundle or logs.
- Check dependency/audit output and document any accepted findings.

### 6.2 Release checks
- Confirm Vercel production environment variables and server-only secrets are present; do not print secret values.
- Confirm Supabase production migration ledger and schema match the expected state using read-only checks.
- Confirm scheduled cleanup configuration and cron authorization before enabling automatic deletion.
- Verify mobile driver sign-in, assigned job refresh, phone links, directions, photo upload and OTP completion.
- Verify admin dispatch, exception queue, audit history and recovery actions.
- Confirm customer notification behavior is exactly once.
- Prepare rollback as a forward-fix/feature-disable plan; do not run destructive DROP-based rollback.

### 6.3 Rollout sequence
1. Complete code review and CI on this branch.
2. Run isolated automated tests.
3. Run a controlled disposable test workflow only if it can be isolated from customer orders and notifications.
4. Deploy preview and complete manual UI checks.
5. Obtain explicit release approval before merging or deploying production.
6. Monitor errors and cleanup outcomes after release.

## Current known defects to address first

1. The production Phase 0–3 SQL currently sets initial assignment expiry to 30 minutes, although the agreed initial assignment policy is 24 hours.
2. The dispatch UI currently tells the owner that reissued OTPs expire in 24 hours, although the agreed reissue policy is 30 minutes.
3. Evidence expiry is currently metadata only; no scheduled deletion process exists.
4. Exception reporting exists, but owner/admin resolution UI/API is not implemented.
5. The Phase 0–3 approval document still lists end-to-end lifecycle integration checks as pending.

## Explicit non-goals

- Do not create or pay for a Supabase staging branch.
- Do not rerun the Phase 0–3 production migration.
- Do not merge or deploy automatically.
- Do not test by assigning, reissuing, unassigning or completing an existing customer delivery.
- Do not delete delivery evidence until the retention job is reviewed, tested and explicitly enabled.
