# RAW HAIRS

Premium, mobile-first wig boutique storefront. The current frontend is a prototype while the Firebase backend is being introduced on a development branch.

## Current implementation

- React 18 + Vite storefront and product catalogue.
- Demo cart, services, customer account, admin and rider screens.
- Firebase client SDK initialization from Vite environment variables.
- Owner email/password sign-in.
- Owner-only route guard for /admin and /rider.
- Owner authorization checked against the signed Firebase ID token custom claim.
- Firestore rules deny access to every account without the owner claim.
- Firebase Functions scaffold and trusted owner-claim provisioning script.

## Important limitations

The existing product, service, cart, booking, request and rider data still comes from sample data and browser localStorage. The admin controls do not yet write to Firestore. Paystack, order processing, stock reservations, customer accounts, rider accounts, notifications, refunds and image storage are not implemented.

The Firebase project must be created and configured before owner sign-in can work. No Firebase project credentials or service-account keys are stored in this repository.

## Local setup

1. Install Node.js 22 or later.
2. Run `npm install` from the repository root.
3. Copy `.env.example` to `.env.local`.
4. Create a Firebase project and register a web app.
5. Enable Email/Password in Firebase Authentication.
6. Fill in the four `VITE_FIREBASE_*` values in `.env.local`.
7. Install Functions dependencies with `npm install --prefix functions`.
8. Configure Firebase Admin SDK Application Default Credentials in a trusted environment.
9. Create the owner user in Firebase Authentication and assign the owner custom claim using the script in `functions/scripts/set-owner-claim.mjs`.
10. Run `npm run dev`.

The owner-claim script requires `OWNER_UID` and trusted Application Default Credentials for the intended Firebase project. Never expose service-account credentials to the browser or commit them.

## Firebase deployment

- Review `firestore.rules` before deploying.
- Use `firebase deploy --only firestore:rules,functions` only after the Firebase project and environment are verified.
- The Vercel frontend is not deployed by this Firebase command.
- Do not deploy this development branch to production without explicit owner approval.

See [Phase 1 architecture](docs/PHASE-1-ARCHITECTURE.md) for the security model, target data model, setup steps and acceptance criteria.

## Development

```bash
npm install
npm run dev
npm run build
```

The root package lockfile was removed when the Firebase dependency was introduced; the first local `npm install` will generate a fresh lockfile. Commit that generated lockfile after verifying the dependency resolution.

Sample storefront data remains in `src/data.js`.
