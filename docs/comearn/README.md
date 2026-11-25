# COLLABIZ COMEARN — Opportunities to Earn

A core COLLABIZ app (menu: Find & win business → COMEARN; Home tile "COMEARN"). Companies offer commissions; members earn them
individually. Feature flag `FEATURE_COMEARN` (default on). Later it can run as comearn.app on the same backend with single sign-on.

## Status

| Part (from the functional design) | Status |
|---|---|
| Home — earnings, pending, potential (estimate), active opportunities, Earn / Offer entry, categories, tracker | Built — real figures only, ₹0 until earned |
| Opportunity marketplace (Explore) — category, type and text filters | Built |
| Post opportunity (Offer commissions) — 10 types, 8 categories, percent / fixed / milestone / recurring, payment trigger, pay-within days, live potential commission | Built |
| Only verified businesses publish; regulated sectors need a licence number | Built |
| Digital agreement — member accepts a generated commission agreement; terms frozen with a fingerprint; changed terms need re-acceptance | Built |
| Lead protection — first registration of a customer (GSTIN / phone / email fingerprint) per opportunity owns the introduction; certificate code and record hash | Built |
| 8-stage commission tracker | Built |
| Commission ledger — computed by the server from the verified amount; approval; transfer with TDS and bank reference; member confirms receipt | Built |
| Earnings — COMEARN commissions next to the existing Unite commission ledger | Built |
| Dispute centre — either side raises; amounts on hold; COLLABIZ rules (continue / cancel) | Built |
| Admin — monitoring, pause listings, disputes, platform fee and regulated sectors | Built |
| AI earning assistant | Rules-based (categories you earn in, newest first), labelled; AI suggestions need the Claude key |
| Post requirement + commission bidding (reverse marketplace) | Next increment |
| AI team formation + commission pool split agreed by all | Next increment |
| AI sales assistant, CRM hand-off, reputation scores, featured promotion, premium subscription | Later |
| Links from Franchise, XCHANGE, Venture AI, UNITE EXIM, LeadDNA, ADBUZ | Later |
| Mobile screens | Later |

## Money rules

- Commission is paid by the **posting company directly to the member**. COMEARN records it; COLLABIZ does not hold the money.
- The server calculates every commission from the opportunity's accepted terms and the amount the company verified with a
  reference. "Potential" figures are estimates and are labelled so.
- Tax deducted at source is entered by the paying company at transfer (with certificate); net = commission − TDS
  (− platform fee only if the admin set the member as fee payer).
- **Platform fee** (`site_settings.comearn.platformFeeBps`) is 0 by default. Only a super admin can set it, and only after
  confirming legal and tax review. It applies to commissions verified after the change and is recorded on each commission.
- Regulated sectors (default: Real Estate) require a licence/registration number before publishing. Investment-related
  referral fees are not offered.

## Who does what

| Stage | Recorded by |
|---|---|
| Opportunity selected, agreement accepted, lead registered | Member (owner/admin of the member business accepts) |
| Quotation, order (with value), customer payment verified (amount + reference) | Company owner/admin |
| Commission approved, commission transferred (TDS + bank reference) | Company owner/admin |
| Receipt confirmed | Member |
| Dispute ruling | Unite admin / super admin |

## API

`GET comearn/home` · `GET comearn/opportunities` · `GET comearn/opportunities/:id` · `POST comearn/opportunities` · `PUT comearn/opportunities/:id` ·
`POST comearn/opportunities/:id/status` · `GET comearn/offer` · `POST comearn/opportunities/:id/join` · `GET comearn/my` ·
`POST comearn/engagements/:id/accept` · `POST comearn/engagements/:id/lead` · `GET comearn/engagements/:id` · `POST comearn/engagements/:id/stage` ·
`POST comearn/commissions/:id/received` · `POST comearn/engagements/:id/dispute` · `GET comearn/earnings` ·
`GET admin/comearn/overview` · `PUT admin/comearn/settings` · `POST admin/comearn/opportunities/:id/pause` · `POST admin/comearn/disputes/:id/rule`

Tables `ce_opportunities`, `ce_engagements`, `ce_leads`, `ce_events` (history), `ce_commissions`, `ce_disputes` — migration 0073.

## Tests

- Unit: `packages/types/src/comearn.test.ts` (terms validation, commission maths, fingerprints, stages).
- API: `apps/api/test/comearn.e2e.ts` (7 tests: posting/verification, regulated sector, join/accept/lead protection, stage order and
  commission, dispute hold and ruling, platform fee settings, changed terms).
- Browser: suite "COMEARN" in `scripts/e2e-suites.mjs`.

## Needs a person

- Legal review of the commission agreement text and of any platform fee, featured promotion or subscription (GST on the fee,
  TDS on commissions).
- Claude key (same as Venture AI) for AI opportunity finder and sales assistant.
