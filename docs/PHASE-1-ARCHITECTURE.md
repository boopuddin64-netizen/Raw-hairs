# RAW HAIRS — Phase 1 Firebase Foundation

## Approved scope

- Backend: Firebase
- Initial privileged access: one owner account only
- Product image storage: deferred
- Development branch: development/phase-1-firebase-foundation
- Production deployment: prohibited until the owner explicitly approves it

## Architecture

- React/Vite remains the storefront and admin UI.
- Firebase Authentication provides owner email/password sign-in.
- Firebase custom claims identify the owner (owner: true).
- Cloud Firestore stores business records after the data migration phase.
- Firestore Security Rules enforce the owner claim on every client request.
- Cloud Functions use the Admin SDK for trusted server-side operations.
- Product image storage is deliberately not configured in this phase.
- Vercel remains the frontend hosting target; Firebase Hosting is not enabled.

## Owner provisioning

1. Create the Firebase project and enable Email/Password Authentication.
2. Create the owner's user in Firebase Authentication using the trusted Firebase console.
3. Obtain the owner's Firebase Authentication UID.
4. In a trusted environment, install the Functions dependencies and authenticate the Firebase Admin SDK using Application Default Credentials for the correct project.
5. Run OWNER_UID=<owner-auth-uid> npm run set-owner-claim.
6. The script preserves existing custom claims, adds owner: true, and revokes existing refresh tokens.
7. The owner signs in again. The frontend checks the signed ID token claim; Firestore rules independently enforce it.

Never put service-account credentials, Admin SDK credentials, or owner provisioning secrets in Vite variables or browser code.

## Environment configuration

Copy .env.example to .env.local and fill in the Firebase web app configuration. These values identify the Firebase web app; they are not substitutes for Firestore Rules or custom claims.

Configure the same VITE_FIREBASE_* values as environment variables in the Vercel Preview environment only when preview deployment is explicitly approved. Do not add them to Production without approval.

## Firestore security posture

firestore.rules is intentionally deny-by-default for every non-owner. The current owner claim grants owner read/write access to the database. This is an interim Phase 1 policy, not the final least-privilege ruleset. Before customer authentication, public catalogue reads, or operational staff/rider access are enabled, replace the broad owner rule with collection-specific validation and role-specific rules.

Admin SDK operations bypass Firestore Security Rules. Every Cloud Function that changes business data must verify authentication, authorization, input shape, ownership and allowed state transitions itself.

## Data model target

- users/{uid} — user profile metadata; authorization remains in custom claims.
- products/{productId} — product catalogue records.
- products/{productId}/variants/{variantId} — length/price/SKU options.
- inventoryMovements/{movementId} — immutable stock movement ledger.
- orders/{orderId} and orders/{orderId}/items/{itemId} — order snapshots.
- payments/{paymentId} — gateway references and verified payment state.
- refunds/{refundId} — refund workflow.
- serviceBookings/{bookingId} — service booking requests.
- internationalRequests/{requestId} — quotation requests.
- deliveries/{deliveryId} and deliveryEvents/{eventId} — delivery assignments and events.
- auditLogs/{eventId} — append-only administrative event records.
- settings/{documentId} — controlled business configuration.

This is the target model. Phase 1 does not yet migrate demo localStorage records into Firestore.

## Phase 1 acceptance criteria

- [ ] Firebase project exists and is owned by the business.
- [ ] Email/password provider enabled.
- [ ] Owner account created and custom claim provisioned through Admin SDK.
- [ ] Missing Firebase environment configuration fails closed.
- [ ] /admin requires an authenticated owner claim.
- [ ] /rider is not exposed to unauthenticated visitors; rider accounts are not enabled in Phase 1.
- [ ] Firestore rules deny all non-owner access.
- [ ] Functions verify owner claims before privileged work.
- [ ] No service-account key or secret is committed.
- [ ] Production deployment remains untouched.
- [ ] Build and security tests pass after project configuration.

## Known limitations at this stage

The existing admin screens still use demo data from browser localStorage. Owner authentication protects entry to the screens, but does not turn those demo mutations into durable Firestore operations. That data migration and server-side business logic are separate implementation work and must be completed before real operations.

The frontend can be built without Firebase credentials, but owner sign-in remains disabled until the environment variables and Firebase project are configured.
