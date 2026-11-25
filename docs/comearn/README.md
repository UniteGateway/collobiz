# COLLABIZ COMEARN — Opportunities to Earn

A core COLLABIZ app (menu: Find & win business → COMEARN; Home tile "COMEARN"). Companies offer commissions; members earn them
individually. Feature flag `FEATURE_COMEARN` (default on). Later it can run as comearn.app on the same backend with single sign-on.

## Status — against the 15-part module structure

| Module | Status |
|---|---|
| Opportunity Marketplace | Built — category, type, search; featured first |
| Post Opportunity | Built — 10 types, percent / fixed / milestone / recurring, trigger, pay-within days, live potential; verified businesses only; regulated sectors need a licence |
| Post Requirement | Built — member posts a customer need; customer identity private; one open requirement per customer |
| Commission Bidding | Built — verified companies submit sealed offers; member compares commission, proposal and track record and selects; creates a private opportunity + engagement with the lead protected |
| AI Opportunity Finder | Rules-based (labelled) — categories you earn in, newest first. AI suggestions need the Claude key |
| AI Sales Assistant | Templates from the record (introduction, proposal cover, follow-up), labelled, never sent automatically. AI-written drafts need the Claude key |
| Team Builder | Built — suggested members per role from capability profiles with match reasons; shares (lead keeps ≥10%); every member accepts; team fixed once payment is verified; allocations owed by the lead, recorded and confirmed |
| Lead Protection | Built — fingerprint (GSTIN / phone / email) per opportunity; certificate + record hash |
| Digital Agreements | Built — generated commission agreement, frozen terms with hash, re-acceptance on change |
| My CRM | Built — "Add to my CRM" creates the customer and a deal in the caller's existing CRM |
| Commission Ledger | Built — server-computed from verified amount; approval; transfer with TDS, TDS certificate number and bank reference; receipt confirmed |
| Payouts | Recorded payments (company → member, lead → team). No money moves through COLLABIZ; bank/payment-gateway payouts are not connected |
| Reputation | Built — from recorded activity only (engagements, conversion, paid, on-time %, disputes); "New on COMEARN" when there is no history |
| Dispute Centre | Built — either side; amounts held; COLLABIZ rules continue / cancel |
| Admin Panel | Built — monitoring, pause, feature / unfeature, disputes, customer requirements, platform fee and regulated sectors |

Also built: home with real figures and the supplied logo, 8-stage tracker, Earnings (COMEARN + team shares + Unite ledger), links from
Venture AI, Franchise, XCHANGE and Trade/UNITE EXIM ("Offer commission in COMEARN", source kept on the opportunity), and native
mobile screens for members (home, explore, opportunity + agreement, tracker, lead, receipt, team share, disputes, my leads,
requirements, offers, earnings).

### Not built — needs a decision, a provider or legal review
- **Paid featured promotion, premium AI subscription, enterprise subscription**: need prices and a payment gateway; featuring is
  currently granted by COLLABIZ admins only.
- **10% platform fee**: an admin setting, off until legal and tax review is confirmed.
- **AI-written suggestions and drafts**: need the Claude key (same as Venture AI).
- **LeadDNA and ADBUZ links**: these are listed Unite businesses without their own COLLABIZ modules yet; the source field accepts them.
- **Company-side posting on mobile**: companies post and record stages on the web.
- **comearn.app as a separate site with single sign-on**: same backend, later.

## Unite review, margin, ratings, guarantee (part 3)

- **Review before publishing**: companies submit; Unite reviews, may send counter-proposals (the company accepts or keeps its
  terms), then sets the **Unite margin** and releases. Members see only the commission after the margin; the company sees its
  offer, the margin and the member rate. Each commission records the member share (`gross_paise`) and the Unite margin
  (`unite_margin_paise`) separately. Editing a released listing sends it back to review; members who already accepted keep
  their frozen terms.
- **Ratings**: after a commission is paid, the member rates the company and the company rates the member (1–5 stars + comment),
  one per side. Averages show on listings, offers and team suggestions. Only real ratings — "No ratings yet" otherwise.
- **Unite Guaranteed**: a super admin can mark live listings, only after the guarantee terms are written in COMEARN settings and
  legal review is confirmed. The badge shows on cards; the terms show on the listing; Explore can filter to guaranteed listings.
  The guarantee is a financial commitment of Unite — the terms must be approved by Unite legal and finance before real use.
- **Sample listings**: Admin → COMEARN → Review → "Load sample listings" creates 25 labelled **Sample** listings across Unite
  businesses and demo companies with illustrative commissions (loaded in the demo database). They are excluded from admin counts.

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

Part 2: `POST/GET comearn/requirements` · `GET comearn/requirements/mine` · `GET comearn/requirements/:id` · `POST comearn/requirements/:id/bids` · `POST comearn/bids/:id/withdraw` ·
`POST comearn/requirements/:id/select` · `POST comearn/requirements/:id/close` · `GET comearn/engagements/:id/team-suggestions` · `POST comearn/engagements/:id/team` ·
`GET comearn/team-invitations` · `POST comearn/team/:id/respond` · `POST comearn/allocations/:id/paid|confirm` · `GET comearn/team-earnings` · `GET comearn/reputation/:orgId` ·
`POST comearn/engagements/:id/crm` · `POST comearn/engagements/:id/assist` · `PUT admin/comearn/opportunities/:id/feature` · `GET admin/comearn/requirements`

Tables `ce_opportunities`, `ce_engagements`, `ce_leads`, `ce_events` (history), `ce_commissions`, `ce_disputes` (migration 0073); `ce_requirements`, `ce_bids`, `ce_team_members`, `ce_allocations` (migration 0074).

## Tests

- Unit: `packages/types/src/comearn.test.ts` (terms validation, commission maths, fingerprints, stages).
- API: `apps/api/test/comearn-plus.e2e.ts` (7 tests: requirements, sealed bids, selection, team pool and allocations, reputation, CRM, drafts, featured, source).
- API: `apps/api/test/comearn.e2e.ts` (7 tests: posting/verification, regulated sector, join/accept/lead protection, stage order and
  commission, dispute hold and ruling, platform fee settings, changed terms).
- Browser: suites "COMEARN · company offers…" and "COMEARN · reverse marketplace…" in `scripts/e2e-suites.mjs`.

## Needs a person

- Legal review of the commission agreement text and of any platform fee, featured promotion or subscription (GST on the fee,
  TDS on commissions).
- Claude key (same as Venture AI) for AI opportunity finder and sales assistant.
