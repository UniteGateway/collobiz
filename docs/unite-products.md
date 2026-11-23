# Unite products: public product pages (/businesses)

There is a public page for every Unite Group business, styled as a product directory.

## Pages
- `/businesses` is the directory.
  - Search, category chips and featured photo cards (including GO EB5).
  - Products are grouped by category.
  - A "Built to work together" band.
- `/businesses/<slug>` is each product's own page.
  - A sticky product menu: Overview, Features, Works with, Contact.
  - A photo hero with the logo.
  - Features and how it works, shown only where brand data exists in `packages/types/src/app-brands.ts`.
  - A "Works with" panel and related products.
  - An enquiry form.
- Photos are royalty-free Pexels images (`apps/web/public/photos/CREDITS.md`), mapped per business in `apps/web/lib/photos.ts`.

## What appears
- Every business that is **not** waiting for regulatory clearance, with its stage:
  - Available
  - Pilot
  - In development
  - Coming soon
- Regulated businesses (banking, payments, digital currency and so on) stay hidden until a super admin records clearance.
- Early-stage products offer "Notify me at launch" rather than a service.

## "Works with" is factual
It lists only connections that exist in this codebase:
- COLLABIZ enquiries (always).
- The partner network (connected only when the business is open to partners).
- The relevant COLLABIZ desk: Unite Solar, Powertek, Property, Green Park energy or Store/BOGO.
- A brand's own integration status, for example BIZO: "Link only — not connected yet".

## Enquiries
- Endpoint: `POST /api/v1/public/products/:slug/enquiries`. It is rate-limited to 5 per minute and has a honeypot field. Explicit consent is required.
- Storage: enquiries go into the existing `enquiries` table, with `venture_id`, `kind` (customer | partner | interest), `phone` and `city`. Migration 0052 only adds columns.
- Notifications:
  - The sender gets a confirmation email with a `BIZ-YYYY-NNNNNN` reference.
  - The business's operating company, or failing that the Unite admins, get an in-app notification.
- Admin: the admin console shows enquiries under **Ventures → business → Website enquiries**, with Mark handled / Reopen. Changes are audited.
- Public reads: `GET /api/v1/public/products` and `GET /api/v1/public/products/:slug`. Internal fields (roles, reward notes, regulated reasons) are stripped.
- Admin link setting: the admin "Public page" link uses `NEXT_PUBLIC_WEB_URL`.

## Tests
- `apps/api/test/ventures.e2e.ts`: listing, regulated hiding, honeypot and consent checks, enquiry to admin, handled status and notification.
- Browser suite "Unite products · …" in `scripts/e2e-suites.mjs`, desktop and mobile.
- `scripts/a11y-scan.mjs` covers `/businesses` and sample product pages.

## Logos and planned features (Unite Master Concept Portfolio, final logos edition)
- **Logos:** the selected logo artwork for every concept is in `apps/web/public/brands/<slug>.png`.
  - The first 12 brands kept their earlier files.
  - SunX uses logo option 01.
  - 99Films and MoveOn.video only have shared brand reference artwork, which is used as the page hero (`<slug>-art.jpg`).
  - The portfolio records no artwork for StartSmart and Unite Biofix, so they keep a lettered mark. No substitute logo was made.
- **Planned features:** for the other 36 businesses, `packages/types/src/app-brands-portfolio.ts` holds each concept's suggested add-ons, shown publicly as **Planned**.
- **Not copied:** internal ratings, validation challenges and revenue notes.

## Integration roadmap: which applications to connect next
Each product page shows its next integration as **Next** in "Works with" (`NEXT_INTEGRATION` in `apps/web/components/Products.tsx`). Nothing marked Next is live.

| Wave | Businesses | COLLABIZ module they plug into | Why first |
|---|---|---|---|
| 1 ✅ | SunX, SUNGATE, SOLCART, Solar Village Mission | Unite Solar desk, Powertek products, Projects, Proof | These modules already exist; leads and orders flow straight into solar sales |
| 1 ✅ | LeadDNA, Digital Seed | Leads & CRM, Commissions | They reuse the existing pipeline and commission ledger |
| 1 ✅ | XPERT, Partimer, ZUPPO | Micro-contracts, Capacity | Scopes, milestones and settlement are already built |
| 2 ✅ | ProDeal, Real Bricks, ROOFZ | Property sales, Green Park | The property and energy marketplaces exist |
| 2 ✅ | Unite Learning, StartSmart, AI Teacher | Learning, Launch | Course and launch flows exist |
| 2 (link only) | SOCPOST, VIDPLAY | AI Growth Desk, Commissions | Campaign approvals and payouts |
| 2 (link only) | iBrain, U meet | ACTION OS, Meetings | Follow-ups and meetings exist |
| 3 | GREEN WALLET, Power Partner, UNITIF, Unite Biofix, 99Films, MoveOn.video | Data room, Contracts, Payment assurance | Need document rooms and rights records per project |
| 3 | EV Saathi, ELWIN, WITHME | Capacity bookings, Store | Availability and booking records |
| 3 | 99OFFERS, FreeTicket, Nano Bazar | Business offers, Store, Business QR | Promotions engine exists; allocation rules need review |
| 3 | Goodtime.live, Help Today, WEEKEND, UGROW, Unite Aqua | Community, Announcements, Launch, Powertek products | Community features exist |
| Blocked | Unite Digital Bank, Bestpe, Universal Trade Coin, Payslip.app, PowerBank and the other regulated concepts | — | Hidden until a super admin records regulatory clearance; no integration before legal review |

## Wave 1 integrations (built)
| Business | Connection | How it works |
|---|---|---|
| **SunX, SUNGATE, Solar Village Mission, SOLCART** | Unite Solar referrals | The page shows a "Get a solar quote" form (optional bill and roof photo, consent required). `POST /api/v1/public/solar/leads` (multipart, 5 per minute, honeypot) creates a `solar_referrals` row with `source`, `details.siteType`, the bill and photo ids, and `consent_at`.<br>• Duplicate phone numbers are refused.<br>• Numbers are read from PDF bills only. Files follow the 90-day bill retention.<br>• Without a partner link the lead is filed under the product's house code (SUNX, SUNGATE, SOLARVM, SOLCART). House codes never earn a referral reward. |
| **Digital Seed** | Partner links | Every partner has one personal code. The partner business page shows "Your partner link" (`/businesses/<slug>?ref=CODE`) with counts.<br>• Enquiries and solar requests through the link are recorded as introduced by that partner (`enquiries.referral_code_id`), and the partner is notified.<br>• Rewards follow the partner's signed agreement; nothing is paid automatically. |
| **LeadDNA** | CRM hand-off | In the admin console, Ventures → business → Website enquiries, the **Add to CRM pipeline** button creates a customer and a `new` deal in the operating company's CRM.<br>• The deal's activity history records the enquiry reference, the message and the introducer.<br>• It is refused if the business has no operating company or the enquiry was already converted. The conversion is audited. |
| **XPERT, Partimer, ZUPPO** | Micro-contracts | "Post a job" opens `/micro/new?source=<slug>`. The job is a normal micro-contract tagged with `source`. The public page shows only counts (open and completed). Posting needs a verified business account. |

Migrations 0053–0055 only add columns. Tests:
- `apps/api/test/ventures.e2e.ts`: Wave 1 case.
- `solar.e2e.ts` and `collab-ops.e2e.ts`: still pass.
- Browser suite "Wave 1 · …": partner link → SunX quote → enquiry → CRM → solar desk → XPERT job.

## Wave 2 integrations (built)
| Business | Connection | How it works |
|---|---|---|
| **ProDeal, Real Bricks, UNITIF** | Unite property projects | The page lists projects that are open to partners and selling, live from the property desk. It shows name, type, city, RERA number, units available and price range; commission and buyer data are never shown.<br>**Book a site visit** pre-selects the project in the enquiry form and adds a visit date within 90 days. The project and date are validated and stored in `enquiries.details`.<br>Admins see a "Site visit" badge, and the CRM hand-off notes include the project and date. |
| **ROOFZ** | Unite Solar desk | The roof form offers "Lease my roof for solar" or "Solar for my building", with roof area, bill and photo. It creates a solar referral under the ROOFZ house code with `details.intent` and `roofAreaSqft`. Any lease or PPA terms are agreed in writing later. |
| **Unite Learning, StartSmart, AI Teacher** | COLLABIZ learning | The page lists published COLLABIZ courses (title, level, modules, minutes; never the assessment answers). **Start learning** opens the course, which needs a COLLABIZ account; the certificate is issued there. |
| **SOCPOST, VIDPLAY, iBrain, U meet and 18 others** | Member links (`MEMBER_LINKS`) | "Works with" shows **Link only** with "Open in COLLABIZ (members)". Partner business pages show an **Open \<module\>** button. No data is exchanged yet; deeper integration stays marked **Next**. |

Migration 0056 adds `enquiries.details` only. Tests:
- `ventures.e2e.ts`: Wave 2 case (8/8 total).
- `solar.e2e.ts`: 7/7.
- Browser suite "Wave 2 · …".
- Accessibility check on the changed pages.

## Wave 3 — the 17 link-only businesses are connected (23 Nov 2026)

Each page now shows **live data from its COLLABIZ module**, and visitors' requests reach the right people. The definitions are in `packages/types/src/connectors.ts`, and the server side is in `apps/api/src/modules/ventures/connectors.ts`.

**Businesses whose pages list items a visitor can ask about.** The visitor picks a listing and the request is stored with it. The listing's owner is told that a visitor asked, with the city and reference, but never the visitor's contact details. The business team makes the introduction.

| Business | Module | What the page shows |
|---|---|---|
| EV Saathi | Capacity calendar | Open vehicle and driver listings |
| ELWIN | Capacity calendar | Vehicles and charging or service equipment |
| SOCPOST | Business offers | Live member offers to promote |
| PRIZO | Business offers | Live deals |
| Unite Biofix | Energy · Green Park | Live projects and buyers that are not marked confidential |
| Unite Aqua | Powertek products | Matching public catalogue items |

**Businesses that post work as micro-contracts.** Work posted through these pages becomes a real micro-contract tagged with the business as its source. The page shows how many jobs are open and how many are completed.

| Business | Work posted |
|---|---|
| WAKIN | Jobs |
| VIDPLAY | Creator campaigns |
| 99Films | Film crew and post-production work |
| MoveOn.video | Video work |

**Businesses whose pages show live counts only.** Members act directly in the module.

| Business | Module | Count shown |
|---|---|---|
| Help Today | Community | Questions and general posts |
| Goodtime.live | Community | Events |
| WITHME | Community | Events and general posts |
| WEEKEND | Announcements | Announcements published |
| iBrain | ACTION OS | Follow-ups completed |
| U meet | Meetings | Meetings |
| Nano Bazar | Business QR | Live Business QR pages |

**Unite admins** see which listing a visitor asked about on the business's enquiries.

**Status now:**
- 37 businesses connected (20 earlier plus these 17).
- **BIZO** is waiting for its API documentation and credentials.
- **10 regulated businesses** stay locked until their clearances are recorded.

Tests: `apps/api/test/connectors.e2e.ts` and the browser suite "Wave 3".
