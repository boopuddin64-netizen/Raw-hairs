# RAW HAIRS

Premium, mobile-first wig boutique storefront. This is the **front-end concept build**: real screens and working interactions, running on **sample data in your browser**. It is not a live shop yet.

## What works now (in the browser only)

- Homepage: header with search, account and live bag count; hero; shop by style; new arrivals; best sellers; services; illustrative testimonials; Instagram section; trust links; footer; mobile bottom navigation
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
- API endpoints require Firebase ID tokens and a matching active server-side staff role.

## Next steps

Connect the backend to the admin/customer interfaces, implement Paystack and WhatsApp services, add delivery evidence storage and scheduled retention cleanup, and run end-to-end security and checkout tests.

Sample data lives in `src/data.js`. Replace it with approved business data once the backend exists. Demo photography is sourced from Unsplash under the Unsplash License (credits: Dellon Thomas, Mahdi Chaghari, Kamyar Ghalamchi, Ninthgrid and Patrik Velich).
