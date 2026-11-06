# RAW HAIRS

Premium, mobile-first wig boutique storefront. This is the **front-end concept build**: real screens and working interactions, running on **sample data in your browser**. It is not a live shop yet.

## What works now (in the browser only)

- Homepage: product-first wig storefront, mannequin/display imagery, style collections, new arrivals, featured wigs, wig services and mobile navigation
- Demo catalogue: 16 sample wig styles across straight, body wave, water wave, deep wave, loose wave, curly/kinky, bob and colour collections
- Service menu: 8 sample wig-care and styling services
- Shop: search, style filter, sorting, product pages with length options and quantity
- Bag: quantity limits checked against stock, sold-out items cannot be bought, Nigeria / outside-Nigeria choice, international request form (no shipping fee is charged)
- Services: available / temporarily unavailable / hidden states, booking request form
- Account page, policy pages, redesigned owner admin studio (`#/admin`) and mobile-first driver portal (`#/rider`)

## What does NOT exist yet

No live commerce is enabled yet: Paystack checkout/webhooks, WhatsApp delivery, customer order APIs, production catalogue persistence, real driver dispatch and production storage remain incomplete. Firebase authentication now runs through server endpoints using HttpOnly session cookies; the browser no longer initialises the Firebase SDK. The Neon/Vercel API foundation exists in the development branch, but the customer/admin/rider demo screens are not yet fully connected to live commerce APIs. The admin and driver screens still use local sample data. Do not treat this as production-ready.

## Needs real content from RAW HAIRS

Approved logo and brand system, authentic RAW HAIRS product and campaign photographs, confirmed product styles/specifications, prices, services, delivery / returns / privacy / terms wording, contact details and genuine customer reviews. Current external photos and testimonials are illustrative demo assets only. Items in `[SQUARE BRACKETS]` are placeholders.

## Run it

```bash
npm install
npm run dev      # local preview
npm run build    # static files in dist/
```

The build is static and can be hosted on any static host.

## Backend foundation in development

- `api/_lib/` contains Neon and Firebase Admin helpers plus server-side staff authorization.
- `api/admin/cod-eligibility.js` provides owner/manager controls for customer COD approval and revocation.
- `api/admin/delivery-zones.js` provides owner/manager delivery-zone and COD-zone controls.
- `db/migrations/001_initial_schema.sql` is the initial schema; `db/migrations/002_approved_commerce_rules.sql` adds approved staff roles, COD eligibility, 15-minute inventory reservations, delivery proof, 90-day evidence retention metadata, 48-hour returns and promotions.
- Migration 002 has been applied and checked on an isolated Neon test branch only. It has not been applied to production.
- Protected API endpoints verify Firebase ID tokens and look up the active staff role in Neon. Role permissions are checked server-side. The owner has full permissions; manager handles store operations and team controls; operations handles day-to-day catalogue/order/inventory/dispatch work; rider is limited to assigned delivery functions.\n- The current admin and rider dashboards are still local-data prototypes. The staff gate and permission foundation are in place, but order, catalogue, dispatch and rider mutation APIs still need implementation and tests before launch. Do not treat the current screens as production operations software.

## Authentication and secret handling\n\n- Customer email/password registration, login and password reset are handled by server-side Firebase Identity Toolkit calls. The Firebase Web API key is read only from the server environment variable `FIREBASE_WEB_API_KEY`; it is not referenced by Vite or shipped to the browser.\n- Firebase Admin verifies identity tokens and issues seven-day HttpOnly, Secure, SameSite=Lax session cookies. The browser does not store Firebase ID tokens or privileged credentials.\n- CSRF protection uses a same-origin check plus a separate CSRF token cookie/header pair for state-changing authentication and staff requests.\n- Google sign-in uses a server-side OAuth authorization-code flow. Store `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_ORIGIN` and a random `SESSION_SECRET` (at least 32 characters) in Vercel server environment variables. Add `/api/auth/google/callback` as an authorized Google OAuth redirect URI.\n- Server-only Firebase variables: `FIREBASE_WEB_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `DATABASE_URL`. Never prefix these with `VITE_`.\n- Paystack secret keys, webhook secrets, database credentials and service-role credentials must never be placed in browser code, local storage or client-side requests.\n\n## Next steps

Connect the backend to the admin/customer interfaces, implement Paystack and WhatsApp services, add delivery evidence storage and scheduled retention cleanup, and run end-to-end security and checkout tests.

Sample data lives in `src/data.js`. Replace it with approved business data once the backend exists. Temporary mannequin image URLs are defined in `src/components.jsx` and `src/premium.css`; replace them with approved RAW HAIRS image assets before launch.
