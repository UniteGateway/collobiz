# Powertek products — sold by anyone on COLLABIZ

Every published Unite Powertek product (the 360-product catalogue imported from www.unitepowertek.com on 9 Nov 2026, in 15
product lines) can be sold by any COLLABIZ account: franchises, store partners, partner companies and agents / individuals.

| Where | What |
|---|---|
| Partner web | **Powertek products** in the menu: `/powertek` (catalogue, search, product-line filter, enquiry basket), `/powertek/enquiries` |
| Mobile app | Account → Powertek products: catalogue with enquiry form, My enquiries |
| Admin | Workspace → **Powertek Sales Desk** (`/workspace/product-sales`): pipeline, reports by channel / state / product line, commission rates |
| API | `apps/api/src/modules/product-sales/` (`/v1/product-sales/powertek/...`); rules in `packages/types/src/product-sales.ts` |
| Tests | `apps/api/test/product-sales.e2e.ts`, `packages/types/src/product-sales.test.ts`, `apps/mobile/test/powertek.test.tsx`, browser journey in `scripts/e2e-suites.mjs` |

## Flow

1. **Seller registers an enquiry**: customer, location, products and quantities, requirement, and confirmation that the
   customer agreed to be contacted. The seller's channel (franchise / store / partner / agent) is worked out by the server.
2. **Attribution**: the first seller to register a customer (same name ignoring "Pvt Ltd" etc. + PIN code) keeps it for
   90 days; a second registration is refused without revealing who holds it. Lost or withdrawn enquiries free the customer.
3. **Powertek sales desk** (Unite admins or members of Powertek): in discussion → quoted (value) → won (order value excl.
   GST + order/invoice number) or lost.
4. **Won** freezes the commission rate and opens a commission agreement with a projected line in the seller's Earnings
   (the same ledger as projects, offers and the solar desk — finance approval, TDS and payout unchanged).
5. **Finance records the customer payment** → commission earned. If the seller's business is not yet verified the line goes
   on hold until KYC / PAN is complete. A won order that is lost before payment reverses the projected commission.

## Commission rates

Set by Unite admins in the sales desk, at most 10%: a default, per product line, or per product line + category. The most
specific active rate applies; a mixed order earns the lowest rate among its products. Rates are frozen when the order is won.
The demo database has a 2% default marked "Demo default rate — Unite to confirm"; **production starts with no rate** and
shows "commission rate to be confirmed" until Unite sets one.

## Prices

The Powertek website lists products as "available on request", so the catalogue shows no prices. Values come only from the
sales desk's quote and order. To refresh the catalogue from the website: `node dist/db/import-catalogue.js powertek`
(updates in place by SKU; nothing is deleted). The website could not be reached from the build environment on 15 Nov 2026,
so the 9 Nov import is what is loaded.
