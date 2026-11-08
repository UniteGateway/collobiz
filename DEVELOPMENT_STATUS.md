# COLLABIZ — Development Status

_Last updated: 2026-11-08 · Branch `claude/collabiz-platform-build`_

This file is the single place to see where the build stands. It follows the recovery instruction: **no screen counts as complete until it passes the quality gate** (redesign + real API + permissions + desktop and mobile layouts + automated tests + screenshot review). Evidence is in `docs/audit/`.

## Current phase

| Phase | Scope | Status |
|---|---|---|
| A — Audit | Route/test/native inventory for all 165 screens; findings and corrective plan | Done (`docs/audit/AUDIT_REPORT.md`) |
| B — Design system | White surfaces, navy/green from the logo, Inter/SF type, icon set, refined tables/forms/states, task-based navigation, demo labelling, status-tone fix | Done |
| C — Five priority screens | 001, 023, 031, 036, 137 rebuilt individually on real APIs | **Done — all five passed the gate (2026-11-08)** |
| D — Native mobile | Tab shell, native core partner workflows, native tests | **All 46 required native screens exist.** Tab bar: Home, Discover, Leads, Messages, Account. 17 of 46 have automated tests. Older native screens use the new components but their content has not been redesigned |
| E — Quality gate | Per-screen evidence | 5 of 165 formally passed (`docs/audit/quality-gate.json`). Stages 13–16 screens were built in the new design system with API tests and browser journeys, but are not yet entered in the gate |
| Stages 13–16 | Messaging, meetings, support; reputation, learning, marketing, AI; international, alliances, regional settings; analytics, content | **Built (2026-11-08)**: API, web, admin and native where required; tests listed below |

## Build coverage (from `scripts/audit-routes.mjs`)

| Measure | Count |
|---|---|
| Registry screens with a working route | **165 of 165** |
| Covered by API tests and a browser journey | 116 |
| Covered by API tests only | 23 |
| Native screens required / built / with tests | 46 / 46 / 17 |
| API tests | 193 passing (18 suites) |
| Native tests | 32 passing |

## Stages 13–16 (built this round)

| Stage | Screens | Gate rules enforced (tested) |
|---|---|---|
| 13 Messaging & support | 105–112, 147, 150 | Messages encrypted at rest and readable only by members (no admin bypass); unsend within 15 min; blocks; retention purges bodies unless on legal hold; reporting shares one message only; meeting invitees must be verified; mandatory legal/financial email; support SLA auto-escalation; internal notes hidden; account-closure blockers |
| 14 Reputation, learning, marketing, AI | 029, 072, 113–118, 140, 160–165 | Reputation only from certified milestones and reviews on shared certified projects; appeals exclude a review until compliance decides (never the reviewed company); assessments graded on the server; certificates verifiable by code; brochures for verified partners with fixed footer; every AI output a draft with sources and version, never prices, never submitted; super-admin switches, audited |
| 15–16 International, content, analytics | 119–123, 125, 126, 139, 142, 146 | Country partnership decided by Unite staff, never for their own org; exclusive territories can’t overlap; import/export direction must match India and routes to Unite Exim; checklist labelled as guidance, not legal advice; alliances decided only by the receiving company and never binding until signed in Contracts; investor data room off pending regulatory review; display currencies need a dated rate, money stays in INR; policy pages published by super admin only; analytics aggregates only |

Next: take the remaining screens through the gate module by module (screenshot review at desktop and phone width, then entry in `quality-gate.json`), redesign the content of the older native screens, and add native tests for the 29 without them.

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
- **Quality gate:** only 5 screens are formally entered. The rest work and are tested, but each still needs a recorded desktop + phone screenshot review.
- **Native mobile:** all 46 exist; 17 have automated tests. Visual evidence is rendered through react-native-web; no on-device runs (B-06).
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
SUITE="Stage 13|Stage 14|Stage 15" scripts/e2e-run.sh  # browser journeys on a disposable collabiz_e2e database
(cd apps/mobile && npx jest)                           # native screens (RNTL)
node scripts/capture-screens.mjs docs/audit/screenshots/after   # evidence screenshots (demo database)
```
