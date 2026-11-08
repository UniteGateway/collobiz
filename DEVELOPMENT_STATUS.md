# COLLABIZ — Development Status

_Last updated: 2026-11-08 · Branch `claude/collabiz-platform-build`_

This file is the single place to see where the build stands. It follows the recovery instruction: **no screen counts as complete until it passes the quality gate** (redesign + real API + permissions + desktop and mobile layouts + automated tests + screenshot review). Evidence is in `docs/audit/`.

## Current phase

| Phase | Scope | Status |
|---|---|---|
| A — Audit | Route/test/native inventory for all 165 screens; findings and corrective plan | Done (`docs/audit/AUDIT_REPORT.md`) |
| B — Design system | White surfaces, navy/green from the logo, Inter/SF type, icon set, refined tables/forms/states, task-based navigation, demo labelling, status-tone fix | Done |
| C — Five priority screens | 001, 023, 031, 036, 137 rebuilt individually on real APIs | In progress: all five redesigned; quality gate below |
| D — Native mobile | Tab shell, native core partner workflows, native tests | Next |
| E — Quality gate | Per-screen evidence; remaining screens wait until the first five pass | Running per screen |

**Expansion is paused.** The 35 unbuilt screens (Stage 13–16 UI) and the restyling of the other 125 implemented screens wait until the five priority screens pass the gate and Phase D is done.

## Priority screens

| Screen | What changed | API | Tests | Evidence |
|---|---|---|---|---|
| 001 Homepage | Live featured listing and figures (`/public/stats`), four steps, five capabilities, routes A–D, sectors, companies; product preview without overlap | `/public/stats`, `/public/opportunities`, `/public/group-companies` | stage05 API; Stage 05 public journey; a11y scan | `docs/audit/screenshots/after/001-*` |
| 023 Partner Home | "Needs your attention" actions across modules, earnings, linked KPIs, explainable recommendations, pipeline by stage, plain-language activity | `GET /me/home` (new, org-scoped) | `recovery.e2e.ts` (shape, org scoping, readable activity) | `after/023-*` |
| 031 Marketplace | Search, source segments with live counts, sector/location/type/value filters, removable filter chips, sort, result count, scannable rows with match score and closing urgency, pagination | `GET /opportunities?paged=true` (new: total, counts, sort, offset) | `recovery.e2e.ts`; journeys "Recovery · 031" and "Stage 05 · 031/036/041/042" | `after/031-*` |
| 036 Opportunity detail | Hero, key-figure strip, scope, requirements, route explainer, history; decision panel that adapts (eligible / not eligible with reasons / applied with progress and withdraw / owner with applicant review) | `/opportunities/:id`, `/eligibility`, `/applications`, withdraw | `recovery.e2e.ts` (human-readable eligibility); Stage 05 journeys (ineligible explains, eligible applies) | `after/036-*` |
| 137 Tender administration | KPI strip, integrity exceptions, search, stage segments, refined register, pagination, inspector sheet (panel, sealed-bid metadata with seal hashes, humanised audit trail) — never bid content | `GET /admin/tenders?paged=true` (new: search, stages, summary, exceptions) | `recovery.e2e.ts` (platform-only, search, stages); `stage09.e2e.ts`; Stage 09 journey | `after/137-*` |

Quality-gate status per screen is recorded in `docs/audit/quality-gate.json` and summarised in `AUDIT_REPORT.md`. A screen is entered there only after its journeys pass and its screenshots have been reviewed.

## Shell fixes found during Phase C
- Phones: the top bar overflowed by 31 px on every partner page (sign-out button). Sign-out moved into the menu drawer; menu button is icon-only below 720 px. Verified 390 px with no horizontal scroll on Home, Opportunities, Projects and Earnings.
- Off-canvas drawer cast a shadow into the page while closed. Fixed.
- Duplicate controls: the Opportunities module tabs repeated the source filter. Tabs now: Browse · Recommended · My applications · Saved & alerts · Categories · Map.

## Known gaps (honest list)
- **Native mobile:** 32 of 46 native screens exist; 14 missing; 6 tested. Native layouts still use the pre-recovery style (screen-ID crumbs, no tab bar). Field labels are not programmatically associated with inputs. → Phase D.
- **Demo data depth:** the curated demo has one tender, so the 137 dashboard shows little volume. Adding more curated (clearly labelled) demo tenders is planned; it must not disturb the seeded counts the API tests rely on.
- **Stage 13 (messaging, meetings, support):** API only, no tests, no UI.
- **Stages 14–16:** not started.

## Blockers needing a person
| ID | Blocker | Needed |
|---|---|---|
| B-06 | No native binaries: Android SDK download blocked, no Xcode/EAS here | EAS account or a build machine; approval to register |
| — | Production hosting, domains, email/SMS providers, payment rails, KYC providers | Commercial approval and credentials (not requested; nothing has been registered or purchased) |

## How to verify locally
```
pnpm lint && pnpm typecheck
(cd apps/api && npx jest --runInBand)                 # API on collabiz_test
SUITE="Stage 05|Recovery|Stage 09" scripts/e2e-run.sh  # browser journeys on a disposable collabiz_e2e database
node scripts/capture-screens.mjs docs/audit/screenshots/after   # evidence screenshots (demo database)
```
