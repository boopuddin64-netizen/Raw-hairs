# RAW HAIRS

Premium, mobile-first wig boutique storefront. This is the **front-end concept build**: real screens and working interactions, running on **sample data in your browser**. It is not a live shop yet.

## What works now (in the browser only)

- Homepage: header with search, account and live bag count; hero; shop by style; new arrivals; best sellers; services; testimonials placeholder; Instagram section; trust links; footer; mobile bottom navigation
- Shop: search, style filter, sorting, product pages with length options and quantity
- Bag: quantity limits checked against stock, sold-out items cannot be bought, Nigeria / outside-Nigeria choice, international request form (no shipping fee is charged)
- Services: available / temporarily unavailable / hidden states, booking request form
- Account page, policy pages, owner admin demo (`#/admin`), rider demo (`#/rider`)

## What does NOT exist yet

No payments (Paystack), no sign-in or accounts, no real database, no real stock control or audit log, no emails, no live Instagram feed. Buttons for these show a "not connected yet" message. The admin and rider pages have no login and save changes only in the visitor's browser. Do not treat any of this as production-ready.

## Needs real content from RAW HAIRS

Logo and brand colours (the pink-on-black look is provisional and unverified), authentic photographs (placeholders are shown), the styles actually sold, prices, services, delivery / returns / privacy / terms wording, contact details and genuine customer reviews. Items in `[SQUARE BRACKETS]` are placeholders.

## Run it

```bash
npm install
npm run dev      # local preview
npm run build    # static files in dist/
```

The build is static and can be hosted on any static host.

## Next steps

Approve the architecture, security and cost plan, then build the backend: Postgres, server-side Paystack payments with verified webhooks, accounts, admin and rider roles, and real stock handling.

Sample data lives in `src/data.js`. Replace it with real data once the backend exists.
