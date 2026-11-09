# COLLABIZ — Development Status

_Last updated: 2026-11-09 · Branch `claude/collabiz-platform-build`_

This file is the single place to see where the build stands. It follows the recovery instruction: **no screen counts as complete until it passes the quality gate** (redesign + real API + permissions + desktop and mobile layouts + automated tests + screenshot review). Evidence is in `docs/audit/`.

## Current phase

| Phase | Scope | Status |
|---|---|---|
| A — Audit | Route/test/native inventory for all 165 screens; findings and corrective plan | Done (`docs/audit/AUDIT_REPORT.md`) |
| B — Design system | White surfaces, navy/green from the logo, Inter/SF type, icon set, refined tables/forms/states, task-based navigation, demo labelling, status-tone fix | Done |
| C — Five priority screens | 001, 023, 031, 036, 137 rebuilt individually on real APIs | **Done — all five passed the gate (2026-11-08)** |
| D — Native mobile | Tab shell, native core partner workflows, native tests | **All 46 required native screens exist and all 46 have automated tests** (67 tests). Tab bar: Home, Discover, Leads, Messages, Account. Leftover screen numbers and raw codes removed from the older screens; their layouts use the shared components but have not had a full visual redesign |
| E — Quality gate | Per-screen evidence | **165 of 165 passed (2026-11-09)** — see “Quality gate” below |
| Stages 13–16 | Messaging, meetings, support; reputation, learning, marketing, AI; international, alliances, regional settings; analytics, content | **Built (2026-11-08)**: API, web, admin and native where required; tests listed below |

## Build coverage (from `scripts/audit-routes.mjs`)

| Measure | Count |
|---|---|
| Registry screens with a working route | **165 of 165** |
| Covered by API tests and a browser journey | **165** |
| Native screens required / built / with tests | 46 / 46 / **46** |
| API tests | 243 passing (28 suites) |
| Browser journeys (desktop + phone) | 82 passing on a fresh database; axe scan clean on all 50 pages (2026-11-09: fixed low-contrast header "Join as partner" button and home-page step numbers) |
| Native tests | 77 passing (16 suites) |
| UI component tests | 30 passing |

## Stages 13–16 (built this round)

| Stage | Screens | Gate rules enforced (tested) |
|---|---|---|
| 13 Messaging & support | 105–112, 147, 150 | Messages encrypted at rest and readable only by members (no admin bypass); unsend within 15 min; blocks; retention purges bodies unless on legal hold; reporting shares one message only; meeting invitees must be verified; mandatory legal/financial email; support SLA auto-escalation; internal notes hidden; account-closure blockers |
| 14 Reputation, learning, marketing, AI | 029, 072, 113–118, 140, 160–165 | Reputation only from certified milestones and reviews on shared certified projects; appeals exclude a review until compliance decides (never the reviewed company); assessments graded on the server; certificates verifiable by code; brochures for verified partners with fixed footer; every AI output a draft with sources and version, never prices, never submitted; super-admin switches, audited |
| 15–16 International, content, analytics | 119–123, 125, 126, 139, 142, 146 | Country partnership decided by Unite staff, never for their own org; exclusive territories can’t overlap; import/export direction must match India and routes to Unite Exim; checklist labelled as guidance, not legal advice; alliances decided only by the receiving company and never binding until signed in Contracts; investor data room off pending regulatory review; display currencies need a dated rate, money stays in INR; policy pages published by super admin only; analytics aggregates only |

## Direct offers (added 2026-11-09, beyond the 165-screen registry)

Unite Group companies send work straight to partners instead of (or as well as) public listings and sealed tenders.

| Part | What it does |
|---|---|
| **Send** (admin console → Direct offers) | Choose what is offered (sell products, market services, project work, manpower, local presence/office, partnership), sector and regions. Send to **all verified partners**, **chosen partners** (with their declared office and free manpower shown), or a **group filtered by capacity** — sector, region, business type, has an office, at least N people free, what they are looking for. A live count shows exactly who will receive it. |
| **Price and reward** | **Unite sets the price** (partners accept or decline), **partners quote**, or **either**. Rewards: commission on sales, revenue share, profit share, equity, fixed fee or reseller margin — Unite chooses which ones partners may propose. Requirements: existing office, minimum people, exclusive (one partner) or several places. |
| **Partner side** (web: Opportunities → Offers for you; app: Account → Offers for you; both: Home "Needs your attention") | See the offer and terms; accept Unite's terms or propose own price, reward and commitment (people, office, start date); change the response until the deadline; or decline with a reason. |
| **Capacity** (web: Account → Capacity; app: Account → Your capacity) | Partners declare offices, total and idle manpower, skills of free people, and the work they want. Never shown to other partners. |
| **Select** | Unite compares responses side by side and selects; the agreed terms are frozen with a hash and audited. When the places are filled (one if exclusive) the offer closes and everyone else is told. |

Rules enforced by the API (`apps/api/test/offers.e2e.ts`, 6 tests): only Unite Group admins of the issuing company send and decide; offers reach verified partners only; a partner sees only offers sent to it and never another partner's response; a fixed-terms offer cannot be counter-quoted, a quote offer must carry a price; proposed rewards must be ones the offer allows; office and minimum-manpower requirements are checked; decisions are final and the last place closes the offer. **Profit share and equity are labelled indicative everywhere: they become binding only through an agreement drafted and signed in Contracts.** Commission paid through the existing commission ledger still needs a project and customer payment; direct-offer selection records the agreed terms but does not create ledger entries by itself.

Tests: 6 API, 5 native (`apps/mobile/test/offers.test.tsx`), a browser journey on desktop and phone (capacity → filtered offer → proposal → selection → partner sees result), and the six new pages (X01–X06) in the gate sweep at both widths. Demo data: two offers from Unite Solar (one with fixed terms to all partners, one exclusive O&M desk asking for quotes, with Deccan's proposal); add them to an existing demo database with `node -r @swc-node/register src/db/seed-offers.ts`.

### Direct offers — agreements, sales and commission (added 2026-11-09)

Selecting a partner now produces the paperwork and the money trail, so a direct offer runs from offer to payout without retyping:

| Step | What happens |
|---|---|
| **Select** | The agreement is drafted in Contracts (work order for project work and manpower, agreement otherwise) from the frozen terms, linked to the offer. For **commission on sales** and **revenue share**, a commission agreement is opened on the ledger at the agreed rate; TDS and clawback follow the active standard introducer policy, GST follows the partner's registration. Fixed fee, profit share and equity get the agreement only (paid or settled under it; profit share and equity need an annex before signature). |
| **Sign** | Normal contract flow: submit → approval by a second person → both sides sign. |
| **Sell** | The selected partner registers buyers under the offer (buyer consent required; the same buyer can't be registered twice under an offer — "Apex Castings Pvt Ltd" and "APEX CASTINGS PRIVATE LIMITED" are the same). Unite moves each sale: in discussion → quoted → won (with the sale value) or lost (with a reason). |
| **Earn** | A won sale creates a projected commission line. Recording the customer payment (UTR) makes it earned — **refused until the agreement is signed by both sides** — and it then goes through the existing finance approval, payout request and settlement. |
| **Track** | Admin: agreements per selected partner, sales list with actions, results per partner (buyers, open, won, won value, paid value, commission). Partner (web and app): agreement status, own buyers with value and commission status. Offer agreements appear in Earnings, the live tracker and the finance approval queue labelled with the offer. |

Ledger change: a commission agreement now belongs to a project **or** an offer, and a ledger line to a milestone **or** an offer sale (database checks enforce one of each); the existing payout guards apply unchanged. Tests: `apps/api/test/offer-sales.e2e.ts` (5), native test for sales, and a browser journey (register buyer → won → projected commission) on desktop and phone. Demo: Volt EPC is selected on DO-2026-100001 with agreement CTR-2026-410001 (draft), commission agreement CA-2026-410001 and two buyers (one quoted, one won with ₹3,55,950 projected commission).

## Unite businesses — every Unite venture, not only solar (added 2026-11-09)

All **47 businesses** from the Unite Master Concept Portfolio (1 Nov 2026) are in the platform — ROOFZ, SUNITE, WAKIN, Nano Bazar, LeadDNA, XPERT, Real Bricks, SOLCART, ELWIN, Unite Powertek, Unite Learning, Unite Biofix and the rest — across energy, property, commerce, jobs, education, media, mobility, social impact, agriculture and finance. Six sectors were added (Education & Training, Media & Entertainment, Jobs & Workforce, Retail & Local Commerce, Social Impact & Community, Financial Services). Descriptions are partner-facing rewrites; the portfolio's internal ratings, history notes and financial assumptions are not stored.

| Part | What it does |
|---|---|
| **Catalogue** (partner web → Unite businesses; app → Account → Unite businesses; public → /businesses) | Each business with sector, stage (early stage / pilot / in development / operating), operating company, and what partners can do (refer customers, sell or supply products, deliver services, bring merchants, bring users/candidates, create content, community programmes). Public site lists only businesses open to partners. |
| **Open / coming soon** (admin → Unite businesses) | Unite admins of the operating company (or super admin) open a business to partners and set its stage. Demo: 14 open, the rest “coming soon”. |
| **Regulatory lock** | 10 finance/investment businesses (UGROW, GREEN WALLET, HNW Club, FreeTicket.app, Payslip.app, Power Partner, PowerBank, Unite Digital Bank, Bestpe, Universal Trade Coin) are hidden from partners and the public, cannot be opened and cannot be used in offers until a super admin records regulatory clearance (licence, legal opinion or regulated-partner reference). |
| **Promoters** | A verified partner asks to promote an open business (roles + regions + plan); Unite approves or declines with a note; approved partners are that business's promoters. |
| **Offers per business** | A direct offer can belong to a business; its audience can be “approved promoters of this business”. Partners see which business each offer is for; agreements, buyer registration and commission then work exactly as for other offers. Admin sees promoters, requests, offers, buyers and won value per business. |

Tests: `apps/api/test/ventures.e2e.ts` (5), `apps/mobile/test/ventures.test.tsx` (2), browser journey (public directory → request → approval → promoter offer → partner sees it), six more pages in the gate sweep. Existing databases get the businesses with `node -r @swc-node/register src/db/seed-offers.ts` (safe to repeat).

## Pilot pack (added 2026-11-09)

Everything needed to run a small, controlled pilot, without buying or registering anything. All of it is in `docs/pilot/`.

| Part | What it is |
|---|---|
| **Go-live checklist** (`docs/pilot/go-live-checklist.md`) | Provider-agnostic, step by step: decisions and accounts needed from Unite; server, DNS and e-mail records; install; first admin; backups and monitoring; legal sign-off; launch day; rollback. Each step is marked [You] or [IT]. |
| **Single-server pilot stack** (`infra/pilot/`) | `docker-compose.pilot.yml` runs PostgreSQL, Redis, API, web, admin and a Caddy HTTPS front door (automatic certificates, security headers, admin restricted to office IPs). Also `pilot.env.example`. The filled-in `pilot.env` is git-ignored. Compose config verified; the Caddyfile could not be validated in the sandbox, so the checklist validates it on the server. |
| **Production bootstrap** (`apps/api/src/db/bootstrap.ts`) | Sets up a clean database without demo data. It creates the platform organization, loads the agreement texts, loads the 47 businesses (all closed), and grants the first super admin to someone who has already registered (audited). It also publishes lawyer-approved agreement texts as new versions and retires the drafts. Before this, a real server could not be set up, because the platform organization and agreements existed only in the demo seed. Safe to repeat. Tests: `test/bootstrap.e2e.ts` (3). |
| **E-mail delivery** (`MAIL_DRIVER=smtp`) | Before this, `smtp` mode only queued messages, so sign-in codes were never sent. E-mail now goes out through any SMTP provider (`SMTP_URL`, `MAIL_FROM`). Failures are retried every minute and marked failed after 5 attempts. Internal routing addresses are skipped. Invitation links are absolute (`WEB_BASE_URL`). Tests: `test/mail-smtp.e2e.ts` (4), using a local test SMTP server, including a real sign-in code request. SMS still has no provider (B-04). |
| **Pilot plan** (`docs/pilot/pilot-plan.md`) | One page: goals, one business (SOLCART recommended, optional non-solar business from week 5), 10–20 partners, 8-week timeline, metrics with targets, go/adjust/stop rule, weekly rhythm, risks, invitation letter. |
| **Legal review pack** (`docs/pilot/legal-review-pack.docx` + `.md`) | Every legal text the app shows or generates, compiled for counsel's tracked-changes markup, with 24 questions and an answer table. It covers partner terms, lead registration, privacy notice, team NDA, the offer agreement and work order, commission terms, the tender contract and LOI, buyer consent, and the regulated businesses. Rebuild it with `scripts/legal-pack/build.mjs`. |
| **Pilot check-in** (web: Help & support → Pilot check-in; app: Account → Pilot check-in) | A two-minute weekly survey: usefulness 1–5, ease 1–5, recommend 0–10, features used, most valuable, blockers, wish, would keep using, may we contact you. One answer per person per 20 hours. |
| **Pilot feedback results** (admin → Pilot feedback) | Check-ins, usefulness, ease, recommendation score (NPS) and would-keep-using against the pilot targets. Also features used, a week-by-week table, comments (contact details only with consent), CSV download, and **Send reminder** (in-app reminder to verified partner contacts who haven't checked in for 6 days; at most once a day). Visible to `analytics.read` roles only. Tests: `test/pilot.e2e.ts` (3), `apps/mobile/test/pilot.test.tsx` (2), browser journey (partner sends a check-in, a second one the same day is held back, Unite reads it). The admin page is checked by the gate sweep (X16, X17). |

## HR, Payroll and Finance through ERPNext (added 2026-11-09)

The open-source **ERPNext + Frappe HR + India Payroll + India Compliance** stack (all GPL-3.0, all on the `version-16` branches, checked with `git ls-remote`) runs as a **separate service** beside COLLABIZ, in `infra/erpnext/`. COLLABIZ talks to it only over its REST API, so no GPL code enters COLLABIZ and existing modules are unchanged.

| Part | What it does |
|---|---|
| **ERPNext service** (`infra/erpnext/`) | Docker Compose stack (MariaDB, Redis, backend, workers, scheduler, websocket, nginx on loopback), `apps.json` for building the image, and a README with build, site creation, app install, Caddy exposure and connecting COLLABIZ. Compose config was verified; the image was not built here (the sandbox cannot run containers). |
| **Connector** (`apps/api/src/modules/erp/`) | Token-authenticated REST client with timeouts and clear "ERPNext unavailable" errors. It never requests personal fields (no PAN, bank, birth date or address). The data source is live ERPNext when `ERPNEXT_URL`/`KEY`/`SECRET` are set; otherwise clearly labelled **sample data** in demo mode only. |
| **Human Resources** (Workspace → HR; Unite admins, super admins) | Headcount, joiners, attendance today, departments by company, employee directory with search, leave approvals (sets the decision and submits it in ERPNext; audited). |
| **Payroll** (finance, super admins only) | Latest submitted pay run: gross, deductions and net; PF, ESI, PT, LWF and TDS totals from salary-slip components; slips by employee and totals by company. |
| **Finance & Accounting** (finance, super admins) | Receivables, payables, sales and purchases this month, and overdue invoices per company. **Commission posting**: finance-approved lines post once each as balanced Journal Entries (commission expense + input GST against partner payable + TDS payable). It needs the CA's accounts configured and is never duplicated: a local record per line, plus a check in ERPNext by reference. Refused on sample data. |

Tests: `apps/api/test/erp.e2e.ts` (7) against a fake Frappe REST server (token, field list, leave PUT→GET→submit, payroll buckets, books, balanced journal entries, idempotency and recovery, ERPNext down). Also a browser journey (leave approval; payroll hidden from Unite admin; finance sees payroll and books, no posting on sample data) and the gate sweep X27–X29.

## Unite Group workspace, Phase A (added 2026-11-09)

A group-wide home inside COLLABIZ (admin → **Workspace**), laid out like the reference screens but in COLLABIZ branding. It uses one sign-in, one database, one permission model and one audit trail across every app. **Every number is computed from records on the platform; nothing is estimated or typed in.**

| Page | What it shows |
|---|---|
| **Home** `/workspace` | Key numbers: group companies and countries, verified partners, live projects and portfolio value, open offers and opportunities, sales won this month and to date, Unite Group people. Business apps; business lines (live projects plus won sales per company); "Waiting for you", which shows only the queues your role can act on; your meetings; recent activity from real records; the COLLABIZ AI box (searches today, answers in words once an AI provider is connected). |
| **Apps** `/workspace/apps` | All 31 business apps by category (business suite, operations, communication, AI & analytics): 19 live, 4 partly live, 8 planned, each with its phase. Integrations panel showing what is connected (e-mail, ERPNext, AI, video, marketing e-mail, e-signature, cloud storage), never secrets. |
| **Companies** `/workspace/companies` | The 15 Unite Group companies (names from the group's company list), each with type, country, parent company and real activity: people, live projects, businesses, products, open offers, won sales. Filters: India, international, manufacturing, businesses. |
| **Meet** `/workspace/meet` | Schedule a meeting and invite colleagues or verified partners, join by link, see upcoming meetings, minutes and action items, and a month calendar. Live video and recordings wait for a video provider. |
| **Search** | One box across companies, partners, Unite businesses, opportunities, projects, direct offers, the lead database (Unite admins only) and Unite Group people. Each result opens in the right app. |

**Protecting existing behaviour:** Unite-first lead routing used to take the first matching company in no fixed order. With more companies that could send solar leads to the wrong one, so each company now has two settings:
- "receives leads": on for Unite Solar, Powertek and Unite Exim; off for the new companies.
- "listed publicly": off for the new companies, until their legal details are confirmed.

Routing also now picks the oldest matching company, so the result is the same every time. All earlier tests pass unchanged.

**ERPNext (HR, payroll, accounts):** `docs/integrations/erpnext.md` describes the connection, the data each side owns, and what is needed (an ERPNext site, an integration user's API key, CA set-up). The settings `ERPNEXT_URL`, `ERPNEXT_API_KEY` and `ERPNEXT_API_SECRET` are ready; the status shows "Not connected".

Tests: `apps/api/test/workspace.e2e.ts` (5), a browser journey (home → search → apps → companies filter → schedule a meeting with a partner), and five pages in the gate sweep (X22–X26).

**Next phases:**
- B: HR and payroll through ERPNext.
- C: Finance and accounting through ERPNext, with commission posting.
- D: Procurement, inventory, manufacturing (Powertek) and logistics.
- E: Franchise, POS, real estate, drive and wiki.

## AI Growth Desk, Phase 1 (added 2026-11-09)

AI campaign agents, one per Unite product or service. They look through a lawful lead database, score who fits, explain why, and draft personal outreach. **A person approves every message, and nothing is sent until a separate marketing e-mail service is configured.** Admin → Growth Desk (Unite admins and super admins).

| Part | What it does |
|---|---|
| **Agents** | Each agent has a product or service, an optional Unite business, an audience (customers, new partners, associations, export/import buyers, opt-in investors), sectors, countries and states, an approved pitch and call to action, a schedule (manual, daily or weekly), a minimum score, leads per run and a daily send limit. **"Agent for every open business"** creates a draft agent for each open Unite business in one click (never for the locked finance businesses). Runs on schedule (checked hourly) or by hand. |
| **Lead database** | Companies, associations, institutions and investors. Each one records **where it came from** and the **lawful basis** for contacting it. Contacts with no basis are kept but never used. Duplicates are refused regardless of case. CSV import gives one source and basis per batch, and reports added, duplicate, opted-out and invalid rows. Scraping and social-network copying are not offered as sources. |
| **Scoring** | Hard rules first: opted out, no lawful basis, wrong country or sector, wrong kind of organisation, investor without consent. Then an explainable 0–100 score (sector, target state, warmth of source, named person, e-mail, import/export activity, a verified partner nearby). The reasons are shown next to each lead, and every run records what it skipped and why. A verified partner covering the area is suggested for follow-up, preferring approved promoters of that business. |
| **Drafts** | Written by the built-in rules engine (`growth-rules-v1`) from the approved pitch only: no invented prices or claims. Each draft records its provider, prompt version and sources. Every draft ends with why the person received it and an unsubscribe link. |
| **Safety** | Blocked wording ("guaranteed", "assured returns", "risk-free", "double your money", …) is refused in pitches and blocks drafts. Edited drafts are re-checked and must keep the unsubscribe link. Investor agents need a super admin's clearance note and reach only investors who opted in. All actions are audited. |
| **Approval and sending** | Approve, edit, reject or mark "not a fit". Lead stages run from to review → approved → contacted → replied → meeting → won/lost. Sending (off by default, `GROWTH_SENDING_ENABLED`) respects the daily limit, re-checks opt-outs at send time and marks leads contacted. |
| **Unsubscribe** | Public page `/unsubscribe?token=…`, no sign-in needed. It suppresses the address for every Unite business and campaign and blocks unsent drafts. |

Tests: `apps/api/test/growth-desk.e2e.ts` (8), browser journey (blocked wording caught, fixed, approved; contact added with consent evidence; public unsubscribe), and four admin pages in the gate sweep (X18–X21). Demo: 30 fictional contacts (example domains) and 7 agents, of which 6 are active and the investor agent awaits clearance.

**Next phases (need accounts):**
- Phase 2: a Claude API key, for real AI research and more personal drafts behind the same writer interface.
- Phase 3: a separate marketing domain and bulk e-mail service (SES, Brevo or similar), for sending and tracking replies and bounces.
- Phase 4: ad-copy export, licensed trade-data connectors, and handing leads to partners.

**Legal:** questions 22–24 in the legal review pack. India's DPDP Act has no general "legitimate interest" ground, so counsel must confirm which contacts may be e-mailed before anything is sent.

## Quality gate (2026-11-09)

A screen passes only when **all** of these hold, and `scripts/record-gate.mjs` writes the result per screen:
1. **Sweep** (`scripts/gate-sweep.mjs`): opened at 1440 px and 390 px with an account entitled to it, on a freshly seeded database — no page error, no API error state, an h1, no horizontal scroll on phones, no raw codes (`snake_case`, `undefined`, `NaN`) and no developer labels (“SCREEN 0xx”).
2. **Screenshot review**: every desktop and phone screenshot looked at on contact sheets; defects fixed and re-swept.
3. **API e2e test** that calls the screen's endpoints, and a **browser journey** that opens the screen and checks real content.
4. **Native test** where the screen is native.

**Result: 165 of 165 screens passed (2026-11-09)**, plus 15 later pages (X01–X15: direct offers and Unite businesses) swept the same way. Final sweep on a fresh seed: 180 pages, 0 flagged at either width; 78/78 browser journeys; 213/213 API tests; 75/75 native tests; 30/30 UI tests; lint and typecheck clean. Evidence: `docs/audit/screenshots/gate/<id>-desktop.jpg` and `-mobile.jpg` with `sweep.json` (account used, issues found); per-screen record in `docs/audit/quality-gate.json`. The five Phase C screens keep their own evidence in `screenshots/after/`.

To close the gaps the gate found, these were added: `apps/api/test/gate.e2e.ts` (withdraw an application, owner pauses/resumes a project, commission policies, team tasks) and three “Gate ·” browser journeys covering 30 screens that no stage journey opened (each asserts real content and performs the screen's action where it has one).

What the gate does *not* prove: on-device native runs (B-06), load and penetration testing, accessibility beyond the automated axe scan of 45 pages, and real-world behaviour of providers that are not connected (video, AI language model, email/SMS, payments, KYC).

### Found and fixed during the gate
- **Regression from Stage 14:** the public page that verifies *lead registration certificates* had been replaced by the training-certificate checker, so CZL- certificates could no longer be verified. Restored; one page now verifies both (CZL- and CZC-).
- **Browser journeys had drifted:** 11 of 68 journeys were failing because they had only been run per stage since Phase B (card headings moved, a second “Documents” link in the sidebar, a weekday-dependent task check, a step that needed data from an earlier run). All fixed; the full suite passes on a fresh database.
- **Content editor (142)** could lose the page's address and title if an editor typed straight after picking a page (the form was filled after the click and rebuilt from a stale copy). Found by an intermittent journey failure; the form is now filled in the same step as the selection.
- **Partner Home (023)** threw a hydration error on any day after the build (date and greeting rendered at build time). Now set in the browser.
- **Tasks (028)** showed only the current week, so on a Sunday a task due tomorrow was invisible. Added “Next 14 days”, a seven-day grid that fits on desktop and stacks on phones.
- **Shipping (092)**: tracking heading collided with the details list; receipt lines restructured; file pickers styled across all 7 upload screens. A shipped demo order was added so the screen can be opened.
- **Plain language everywhere:** membership levels, business types, team and project roles, pipeline stages, tender eligibility, CRM activity, consent provenance, certificate dates (Indian format, IST) and certification names now read in words; 35 date formats that followed the device default now use en-IN. Acronyms stay in capitals (“NDA signed”).
- **Native:** leftover screen numbers removed (“Customer (044)”, “Screen 158 — …”), raw codes humanised on profile, pipeline, lead status, collaboration, projects and earnings history.


## Priority screens

| Screen | What changed | API | Tests | Evidence |
|---|---|---|---|---|
| 001 Homepage | Live featured listing and figures (`/public/stats`), four steps, five capabilities, routes A–D, sectors, companies; product preview without overlap | `/public/stats`, `/public/opportunities`, `/public/group-companies` | stage05 API; Stage 05 public journey; a11y scan | `docs/audit/screenshots/after/001-*` |
| 023 Partner Home | "Needs your attention" actions across modules, earnings, linked KPIs, explainable recommendations, pipeline by stage, plain-language activity | `GET /me/home` (new, org-scoped) | `recovery.e2e.ts` (shape, org scoping, readable activity) | `after/023-*` |
| 031 Marketplace | Search, source segments with live counts, sector/location/type/value filters, removable filter chips, sort, result count, scannable rows with match score and closing urgency, pagination | `GET /opportunities?paged=true` (new: total, counts, sort, offset) | `recovery.e2e.ts`; journeys "Recovery · 031" and "Stage 05 · 031/036/041/042" | `after/031-*` |
| 036 Opportunity detail | Hero, key-figure strip, scope, requirements, route explainer, history; decision panel that adapts (eligible / not eligible with reasons / applied with progress and withdraw / owner with applicant review) | `/opportunities/:id`, `/eligibility`, `/applications`, withdraw | `recovery.e2e.ts` (human-readable eligibility); Stage 05 journeys (ineligible explains, eligible applies) | `after/036-*` |
| 137 Tender administration | KPI strip, integrity exceptions, search, stage segments, refined register, pagination, inspector sheet (panel, sealed-bid metadata with seal hashes, humanised audit trail) — never bid content | `GET /admin/tenders?paged=true` (new: search, stages, summary, exceptions) | `recovery.e2e.ts` (platform-only, search, stages); `stage09.e2e.ts`; Stage 09 journey | `after/137-*` |

Quality-gate status per screen is recorded in `docs/audit/quality-gate.json` and summarised in `AUDIT_REPORT.md`. A screen is entered there only after its journeys pass and its screenshots have been reviewed.

## Fixes found while building Stages 13–16
- `/meta/features` had lost its `@Public()` decorator in Phase B (an endpoint was inserted between the decorator and its route). Two Stage 01/12 tests had been failing since; restored and re-verified.
- A Stage 06 test only passed on weekdays (it paused a review for two days, which can contain no business hours). It now pauses for seven days.
- Builds failed intermittently with “Cannot read properties of null (reading 'useState')”. Cause: sourcing `.env` (which sets `NODE_ENV=development`) into the shell before `next build`. Build in a clean shell; the scripts in this repo don’t source `.env` for builds.
- Matching explanations showed raw codes (“Covers IN-MH”, “construction_epc”); they now read in words, and AI matches use the partner’s verified reputation.

## Test-infrastructure fix found during the gate
- Browser journeys that change data directly with SQL (e.g. moving a tender's closing time) were writing to the **demo** database while the servers ran on the disposable e2e database, so the Stage 09 lifecycle journey timed out. `scripts/e2e-run.sh` now gives the journeys the e2e database. No demo data was altered (the update matched no rows there).

## Shell fixes found during Phase C
- Phones: the top bar overflowed by 31 px on every partner page (sign-out button). Sign-out moved into the menu drawer; menu button is icon-only below 720 px. Verified 390 px with no horizontal scroll on Home, Opportunities, Projects and Earnings.
- Off-canvas drawer cast a shadow into the page while closed. Fixed.
- Duplicate controls: the Opportunities module tabs repeated the source filter. Tabs now: Browse · Recommended · My applications · Saved & alerts · Categories · Map.

## Known gaps (honest list)
- **Native mobile:** all 46 exist and are tested with React Native Testing Library; visual evidence is rendered through react-native-web. No on-device runs and no app-store builds (B-06). The older native screens work and read in plain language but have not had the full visual redesign the five priority screens received.
- **Gate scope:** the gate is automated evidence plus screenshot review on demo data. It is not a substitute for user testing with real partners, a professional accessibility audit, or a security penetration test before launch.
- **Video meetings:** scheduling, attendance and minutes work; live audio/video needs a provider (Jitsi or similar) to be chosen and configured.
- **AI:** runs on the built-in rules engine. A language-model provider can be switched on later (`AI_PROVIDER`), which needs an API key and a data-processing review.
- **Languages:** English only. Hindi, Arabic and French are listed as “coming soon”; translations need to be commissioned.
- **Investor data room (125):** deliberately switched off until regulatory review (B-09).
- **Demo data depth:** one tender in the curated demo, so the 137 dashboard shows little volume.

## Blockers needing a person
| ID | Blocker | Needed |
|---|---|---|
| B-06 | No native binaries: Android SDK download blocked, no Xcode/EAS here | EAS account or a build machine; approval to register |
| B-09 | Investor data room and finance introductions are regulated activities | Regulatory/legal review before switching on |
| — | Video provider for meeting rooms; language-model provider for AI drafts | Choice of provider, credentials, data-processing review |
| — | Pilot: hosting server, two DNS names, SMTP e-mail account, operating legal entity (B-01), approved commission rates (B-10), legal review of the pack, pilot partner list | Unite Group decisions and accounts. Everything else is ready (`docs/pilot/go-live-checklist.md` §1). Nothing has been registered or purchased. |
| — | ERPNext: a server or Frappe Cloud site running `infra/erpnext`, integration user API key and secret, CA set-up of chart of accounts, GST/TDS, salary structures and commission accounts, one parallel payroll month; legal names and codes for the 12 newly listed group companies | Unite Group decisions and accounts |
| — | Growth Desk: Claude API key (Phase 2), separate marketing e-mail domain and service (Phase 3), licences for any trade-data sources, legal answers to Q22–24 | Unite Group decisions and accounts |
| — | Full launch: managed database, S3 storage (B-03), SMS with DLT (B-04), e-signature provider (B-08), payment rails, KYC providers | Commercial approval and credentials |

## How to verify locally
```
pnpm lint && pnpm typecheck
(cd apps/api && npx jest --runInBand)                 # API on collabiz_test
scripts/e2e-run.sh                                    # all browser journeys on a disposable collabiz_e2e database (SUITE="Gate" for a subset)
DATABASE_URL=…/collabiz_e2e node scripts/gate-sweep.mjs <dir>   # quality-gate sweep (freshly seeded database)
REVIEWED=1 node scripts/record-gate.mjs docs/audit/screenshots/gate   # after reviewing the screenshots
(cd apps/mobile && npx jest)                           # native screens (RNTL)
bash scripts/up.sh                                    # after a machine restart: Postgres, Redis, API, web, admin
node scripts/capture-screens.mjs docs/audit/screenshots/after   # evidence screenshots (demo database)
```
