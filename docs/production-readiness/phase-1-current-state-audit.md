# RAW HAIRS — Phase 1 Current-State Audit

**Repository:** boopuddin64-netizen/Raw-hairs  
**Audit baseline:** main branch at audit time  
**Status:** Assessment only; no production behavior changed by this document.

## Executive finding

The repository is a React 18 + Vite storefront prototype. Its current state is explicitly documented as a front-end concept build. It is not safe to process real orders, customer accounts, stock, or payments.

## Existing implementation

- React 18, React Router 6 and Vite 5.
- Client-side routes for home, shop, product, cart, services, account, help, admin demo and rider demo.
- Sample catalogue and service records in `src/data.js`.
- A browser-local store in `src/store.jsx`, persisted in localStorage.
- Existing responsive storefront structure and dark editorial visual direction.
- International request form exists, but writes only to browser-local demo state.
- Admin and rider screens exist as visual prototypes only.

## Critical gaps and risks

| Area | Observed implementation | Production requirement |
|---|---|---|
| Authentication | Account form is a placeholder; admin/rider routes are public | Firebase Auth; server-verified identity and role claims |
| Authorization | No role checks or protected API | Owner/admin/rider/customer authorization enforced server-side |
| Products | Sample data; placeholder values | Database-backed catalogue and validated product variants |
| Variant pricing | Product has one `price`; length is a simple array | Each sellable length/variant has its own price and SKU |
| Inventory | One product-level stock count | Variant-level stock, reservation and movement history |
| Cart | Browser state; subtotal uses product-level price | Server re-prices cart from authoritative catalogue |
| Orders | Demo objects only | Persistent order lifecycle and immutable order-item snapshots |
| Payments | No Paystack integration | Server-side Paystack initialization, verification and signed webhook processing |
| Manual transfers | No verified bank-credit workflow | Pending until staff verifies actual account credit; receipt alone is not proof |
| Ledger | No financial ledger | Append-only double-entry ledger with reconciliation |
| Delivery | No provider integration or dispatch workflow | Hybrid in-house rider and third-party provider orchestration |
| International | Browser-only request | Persistent admin queue; quote and approval before payment/shipping |
| Notifications | Demo notices only | Durable notification/outbox processing and delivery status |
| Audit trail | None | Staff and system event history |
| Policies | Placeholder legal text | Owner-approved policies before public launch |
| Content | Placeholder photography, reviews and contact details | Owner-supplied verified content |

## Defects requiring explicit remediation

1. `src/store.jsx` treats localStorage as the application store. This is not authoritative and can be edited by customers.
2. `src/data.js` models lengths as numbers without independent variation IDs, prices or stock.
3. `src/pages/Cart.jsx` calculates subtotal from `p.price * quantity`, ignoring selected-length price differences.
4. `src/pages/Product.jsx` reports product-level stock and price regardless of selected length.
5. `src/components.jsx` product cards use a default length and product-level stock.
6. The public navigation exposes demo admin and rider links. They must be removed from public navigation when real protected portals are introduced.
7. `src/pages/Admin.jsx` and `src/pages/Rider.jsx` mutate local demo state and must not be upgraded by merely hiding their routes; server authorization is mandatory.
8. `src/pages/Help.jsx` contains policy placeholders. They must not be represented as final legal terms.

## Confirmed business requirements

- Product and service commerce, including customised orders and other confirmed hair products.
- Product-dependent pricing; length variants can have different prices.
- Inventory tracked separately per sellable product variation.
- Customer-facing availability without exposing exact stock quantities.
- Customer sign-in via Google/email and guest checkout.
- Paystack card, bank transfer and USSD where supported; manual bank transfer is also accepted.
- Cash on delivery is excluded.
- Online payments must be verified server-side. Manual transfers require staff verification against actual bank credit.
- Payment confirmation is automatic after verification; admin separately approves fulfilment.
- Hybrid delivery: in-house riders in selected locations and third-party providers elsewhere.
- Riders accept assigned jobs and delivery completion requires customer confirmation.
- International orders enter an admin-first quote workflow; customers may be directed to WhatsApp.
- Owner/admin access, maximum four staff accounts in total.
- Vercel hosting; Firebase Authentication; PostgreSQL; Firebase Storage.
- Paystack account verification is incomplete. Live payment activation is blocked until verification and secure credential configuration.
- Architecture should scale without unnecessary fixed operating costs.

## Release blockers

- Approved real catalogue, variant prices and inventory.
- Approved business contact details and operating/delivery locations.
- Owner-approved returns, refund, privacy, terms and delivery policies.
- Chosen PostgreSQL provider and verified backup/restore procedure.
- Firebase project and authorized domains.
- Paystack account verification and test/live credential separation.
- Delivery provider(s), coverage and pricing method.
- Staff identities and role assignments.
- Security, payment, inventory and recovery tests passing.

## Audit conclusion

Preserve the existing storefront layout and component hierarchy. Replace demo data access behind the existing UI with typed API/service boundaries in stages. Do not expose production payment, inventory or staff actions until the server-side controls are in place.
