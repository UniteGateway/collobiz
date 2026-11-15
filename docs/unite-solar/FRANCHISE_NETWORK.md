# Unite Solar — Franchise & Store Partner Module

Built inside COLLABIZ (no separate app). Partner screens are under **Unite Solar** in the partner app (`/unite-solar/*`);
the Admin Control Centre is the **Unite Solar Network** app in the admin workspace (`/workspace/network/*`).

## What reuses what

| Need | Reused | New |
|---|---|---|
| Application / partner record | `franchise_units` (+ package, version, pricing, territory, payment columns) | — |
| Agreement and e-signature | Contracts (franchise agreement drafted from Franchise Management, second-person review, both sign) | — |
| Orders | `franchise_orders` (+ fulfilment, fulfilment status, payment verified, PIN) | — |
| Referral QR and attribution | `solar_referral_codes` / `solar_referrals`, public `/refer/[code]` page | — |
| Marketing material, training, support | `marketing_assets`, Learning (`/learning`), support tickets | — |
| Plans, territories, entitlements, products, stock, ledger | — | migration `0038_unite_solar_network` (12 tables) |

Rules live in `packages/types/src/unite-solar.ts` (unit tests in `unite-solar.test.ts`); the API module is
`apps/api/src/modules/unite-network/`; the end-to-end test is `apps/api/test/unite-network.e2e.ts`.

## Plans (administrator-configurable, versioned)

| Plan | Price (excl. GST) | LeadDNA | Territory |
|---|---|---|---|
| Basic Franchise | ₹2,00,000 | optional ₹5,00,000 → ₹7,00,000 | mandal, exclusive |
| Master Franchise | ₹5,00,000 | optional ₹5,00,000 → ₹10,00,000 | city, exclusive |
| District Franchise | ₹10,00,000 | included | district, exclusive; 25% of eligible district net profit |
| Store — with stock | ₹5,00,000 = ₹4,00,000 stock at partner price + ₹1,00,000 store package | — | PIN catchment, not exclusive |
| Store — without stock | ₹1,50,000 | — | PIN catchment, not exclusive |

GST is added at 18% by default; finance can switch a plan to GST-inclusive. Editing a plan creates a new version;
an application keeps the version it was priced with. Prices are always computed on the server.

## Lifecycle

draft → submitted (business verification required) → Unite review (approve reserves the territory / return for changes / reject)
→ agreement drafted, reviewed and signed by both parties → partner records payment → **finance verifies** → (stock stores:
stock allocated at partner price within ₹4 lakh, invoiced, received by the store) → activation. Activation allocates the
territory with an expiry, grants LeadDNA (District plan, or verified add-on) and opens sales. Recording a payment never
activates anything.

## Earnings (five streams, one ledger)

| Stream | Base | Rate | Releases when |
|---|---|---|---|
| Product / kit | sale value excl. GST of Unite-fulfilled lines | product rate, capped by plan and 10% | customer payment verified **and** customer accepted |
| District profit share | revenue − direct costs − approved expenses | 25% | admin enters period; second admin approves |
| Inter-franchise | eligible pool set by Unite (not turnover) | 12.5% | project payment verified |
| Solar park | approved eligible project value | ≤ 2% pool, split across named contributors | admin approval |
| Investment facilitation | realised (received) investment | ≤ 2% | compliance clears; blocked if legally restricted |

Statuses: pending → qualified → approved → payable (settlement) → paid; reversal before settlement; blocked (compliance).
Sales from a store's own stock earn the resale margin instead — never margin and commission on the same line. One entry per
(stream, source, partner) is enforced by a unique index. Approval is maker-checker; a payout is recorded by a different finance
user from the one who prepared the settlement. Every step is in the audit log.

## Controls

- RBAC: partners see only their own records; Unite admins run reviews, territories, catalogue and approvals; finance verifies
  payments and settles; compliance clears investment entries.
- Territory conflicts: exclusive grants that share a PIN code or sit in the same district as a district grant cannot be
  reserved or drawn; reservation and approval run under an advisory lock.
- Inventory: row-locked updates, `qty >= 0` database constraint, append-only movement journal; reconciliation checks the
  journal against on-hand stock per product. Non-stock stores have no inventory at all.
- Idempotency keys on payments, stock, sales and settlements.

## Not connected yet (honest limits)

- **LeadDNA**: entitlement and gating are live; the LeadDNA API contract has not been provided, so opening LeadDNA returns
  "connection not configured". Configure `LEADDNA_API_URL` / `LEADDNA_API_KEY` server-side when the contract is available.
- **Payment gateway**: payments are recorded by the partner and verified manually by finance against the bank statement.
  No gateway webhook exists yet; when one is added, it must verify the signature before marking a payment verified.
- **Catalogue prices** in the demo database are sample entries and must be replaced with Unite's approved price list.
- The franchise agreement template is a draft for counsel (legal review pack Q25). GST/TDS treatment of commissions and the
  plan GST mode need CA confirmation.

## Demo data

Seeded plans (Unite's configuration), six territories in Telangana / Andhra Pradesh / Karnataka, 14 sample products (one per
category), six demo materials, and one live stock store (Deccan Distributors, Peenya) with its opening stock received and one
sale from stock. Log in as `deepak@deccan.example` to see a live store.
