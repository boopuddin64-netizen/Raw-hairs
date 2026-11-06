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

No live commerce is enabled yet: Paystack checkout/webhooks, WhatsApp delivery, customer order APIs, production catalogue persistence, real driver dispatch and production storage remain incomplete. Firebase customer authentication and the Neon/Vercel API foundation exist in the development branch, but are not yet fully wired into these demo screens. The admin and driver screens still use local sample data. Do not treat this as production-ready.

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

## Frontend configuration and secret handling\n\n- The browser bundle must contain no database URL, Firebase Admin private key, Paystack secret key, webhook secret, service-role credential or other privileged token. Keep these in deployment server environment variables only; never prefix them with `VITE_`.\n- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID` are Firebase Web SDK configuration. The Firebase Web API key is public by design and is visible in the browser; it is not an admin credential. Restrict it to the approved website domains and required Firebase APIs in Google Cloud. If the requirement is literally zero API-key material in the browser, Firebase client authentication must be replaced with a server-managed authentication/session flow before launch.\n- Do not place secrets in source files, local storage, frontend environment variables or client-side requests.\n\n## Next steps

Connect the backend to the admin/customer interfaces, implement Paystack and WhatsApp services, add delivery evidence storage and scheduled retention cleanup, and run end-to-end security and checkout tests.

Sample data lives in `src/data.js`. Replace it with approved business data once the backend exists. Temporary mannequin image URLs are defined in `src/components.jsx` and `src/premium.css`; replace them with approved RAW HAIRS image assets before launch.
