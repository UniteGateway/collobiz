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
| API tests | 203 passing (20 suites) |
| Browser journeys (desktop + phone) | 75 passing on a fresh database; axe scan clean on 45 pages |
| Native tests | 72 passing (14 suites) |
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

## Quality gate (2026-11-09)

A screen passes only when **all** of these hold, and `scripts/record-gate.mjs` writes the result per screen:
1. **Sweep** (`scripts/gate-sweep.mjs`): opened at 1440 px and 390 px with an account entitled to it, on a freshly seeded database — no page error, no API error state, an h1, no horizontal scroll on phones, no raw codes (`snake_case`, `undefined`, `NaN`) and no developer labels (“SCREEN 0xx”).
2. **Screenshot review**: every desktop and phone screenshot looked at on contact sheets; defects fixed and re-swept.
3. **API e2e test** that calls the screen's endpoints, and a **browser journey** that opens the screen and checks real content.
4. **Native test** where the screen is native.

**Result: 165 of 165 screens passed (2026-11-09)**, plus the 6 direct-offer pages (X01–X06) swept the same way. Final sweep on a fresh seed: 171 pages, 0 flagged at either width; 75/75 browser journeys; 203/203 API tests; 72/72 native tests; 30/30 UI tests; lint and typecheck clean. Evidence: `docs/audit/screenshots/gate/<id>-desktop.jpg` and `-mobile.jpg` with `sweep.json` (account used, issues found); per-screen record in `docs/audit/quality-gate.json`. The five Phase C screens keep their own evidence in `screenshots/after/`.

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
| — | Production hosting, domains, email/SMS providers, payment rails, KYC providers | Commercial approval and credentials (not requested; nothing has been registered or purchased) |

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
