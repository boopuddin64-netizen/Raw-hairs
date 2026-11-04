# RAW HAIRS backend foundation

This phase adds a minimal Vercel Functions API without changing the storefront or production environment.

## Endpoints

- `GET /api/health`: returns service status and boolean configuration flags only. It never returns secret values.
- `GET /api/me`: verifies a Firebase ID token with Firebase Admin, then creates/updates and returns only the matching customer profile.
- `POST /api/me`: same identity sync behavior; request-body identity fields are deliberately ignored.

## Required Preview environment variables

- `DATABASE_URL`: least-privilege connection to the isolated Neon schema-test branch.
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`: service-account private key. Store only in Vercel encrypted environment variables; preserve PEM newlines or use escaped `\\n`.

Never create these variables in Production during this phase.

## Security properties

- Firebase ID tokens are verified server-side, including revocation checking.
- Customer identity is derived from the verified token, never from request parameters.
- SQL values are parameterized by the Neon query tag.
- Database credentials and Firebase Admin credentials are server-only.
- API errors do not expose database or credential details.
- Staff role checks are intentionally not exposed until the staff provisioning flow is implemented.

## Smoke test

1. Open `/api/health` on a Preview deployment. Confirm `database: true` and `firebaseAdmin: true` after environment setup.
2. Sign in on the same Preview deployment.
3. Send the Firebase ID token as `Authorization: Bearer <token>` to `GET /api/me`.
4. Confirm only the signed-in customer's profile is returned.
5. Confirm an absent/invalid token returns 401 and does not create a customer row.

This is a foundation, not a complete production-ready commerce API. It does not yet implement staff role provisioning, catalogue, orders, checkout, payments, stock reservation, delivery, rate limiting, or CSRF-sensitive browser mutation flows.
