# RAW HAIRS

Premium, mobile-first wig boutique storefront. This is the **front-end concept build**: real screens and working interactions, running on **sample data in your browser**. It is not a live shop yet.

## What works now (in the browser only)

- Homepage: header with search, account and live bag count; hero; shop by style; new arrivals; best sellers; services; illustrative testimonials; Instagram section; trust links; footer; mobile bottom navigation
- Shop: search, style filter, sorting, product pages with length options and quantity
- Bag: quantity limits checked against stock, sold-out items cannot be bought, Nigeria / outside-Nigeria choice, international request form (no shipping fee is charged)
- Services: available / temporarily unavailable / hidden states, booking request form
- Account page, policy pages, redesigned owner admin studio (`#/admin`) and mobile-first driver portal (`#/rider`)

## What does NOT exist yet

No production payments (Paystack), no production authentication, no backend database, no real stock control or audit log, no real email delivery, no live Instagram feed, no live map routing or dispatch. Admin and driver screens are demonstration interfaces; changes are local to this browser. Do not treat this as production-ready.

## Needs real content from RAW HAIRS

Approved logo and brand system, authentic RAW HAIRS product and campaign photographs, confirmed product styles/specifications, prices, services, delivery / returns / privacy / terms wording, contact details and genuine customer reviews. Current external photos and testimonials are illustrative demo assets only. Items in `[SQUARE BRACKETS]` are placeholders.

## Run it

```bash
npm install
npm run dev      # local preview
npm run build    # static files in dist/
```

The build is static and can be hosted on any static host.

## Next steps

Approve the architecture, security and cost plan, then build the backend: Postgres, server-side Paystack payments with verified webhooks, accounts, admin and rider roles, and real stock handling.

Sample data lives in `src/data.js`. Replace it with approved business data once the backend exists. Demo photography is sourced from Unsplash under the Unsplash License (credits: Dellon Thomas, Mahdi Chaghari, Kamyar Ghalamchi, Ninthgrid and Patrik Velich).
