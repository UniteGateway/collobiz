# COLLABIZ — Development Recovery & UI Quality Audit

**Date:** 2026-11-06 · **Branch:** `claude/collabiz-platform-build` · **Audited commit:** `c1279e2`
**Method:** repository inspection, route-to-registry mapping (`scripts/audit-routes.mjs`), full automated test run, evidence screenshots with authorized demo accounts (`scripts/capture-screens.mjs`), independent mobile bundle builds and native-layout rendering.

> **Verdict: the platform's back end is broadly functional. The user interface does not meet the approved international corporate standard.**
> Under the new quality gate (Phase E), **no screen counts as complete until it has been redesigned and passes visual, functional, permission and test checks.** A screen that merely renders does not count. Earlier "verified" labels in `screen-registry.csv` meant *functionally verified by automated tests*; they do not certify UI quality.

## 1. Summary

| Measure | Count |
|---|---|
| Registry screens | 165 |
| Route implemented | 130 |
| Not built | 35 |
| Functional with API e2e + browser journey | 88 |
| Functional with API e2e only | 14 |
| Passed the new quality gate | 0 |
| Native required | 46 |
| Native implemented | 32 |
| Native with automated test | 6 |


## 2. Automated test results (re-run during this audit)

| Suite | Result | Evidence |
|---|---|---|
| API integration (real PostgreSQL) | 160/160 passed, 14 suites | `docs/audit/test-results/api.txt` |
| Business rules (types) | 24/24 passed | `docs/audit/test-results/types.txt` |
| UI component library | 28/28 passed | `docs/audit/test-results/ui.txt` |
| Mobile (jest-expo, RNTL) | 15/15 passed, 6 suites | `docs/audit/test-results/mobile.txt` |
| Browser journeys (desktop 1440 + mobile 390) | 62/62 passed | `docs/audit/test-results/browser.txt` |
| Accessibility (axe, WCAG 2.2 AA) | 0 violations on 50 pages | `docs/audit/test-results/a11y.txt` |
| Lint / typecheck (all packages) | clean | `docs/audit/test-results/lint.txt`, `typecheck.txt` |
| Android / iOS JS bundles (`expo export`) | both compile | recorded in §6 |

**No test fails.** However, the suites prove behaviour, not visual quality. The browser journeys also *caused* one of the most visible defects (§3.1).

## 3. Critical findings

### 3.1 Demo data is polluted by test runs (critical, customer-facing)
The browser suites ran against the same database used for demonstrations. They created records with machine-generated titles such as *"Transformer yard O&M desktop 1793990692256"* and *"Solar O&M contractor desktop 1793978929998"*.

| Table | Rows | With timestamp-style titles |
|---|---|---|
| opportunities | 108 | 22 (plus ~45 duplicate "600 kW rooftop solar — Kolhapur") |
| tenders | 25 | 24 |
| collaboration teams | 28 | 27 |
| trade requirements | 10 | 9 |
| unread notifications for one demo partner | 344 | — |

**Corrective action:**
- Run browser suites against a dedicated, disposable `collabiz_e2e` database that is reset each run.
- Test fixtures use realistic titles; uniqueness is carried by the record code, never the title.
- Rebuild the demo database from curated seed data. Every demo record is labelled *Demo*.

### 3.2 Navigation is generated from the screen registry (critical)
- The partner sidebar lists 60+ registry titles verbatim, including onboarding steps such as "OTP & Email Verification", even for verified partners.
- It is oversized, unprioritised and inconsistent with the top navigation.
- Developer artifacts are shown to users: "SCREEN 023" badges and the breadcrumb "Unite-first hybrid network / …".

**Corrective action:** a task-based information architecture (Home, Opportunities, Leads, Projects, Trading, Earnings, Messages) with a compact sidebar, role-aware sections, and no registry IDs in production.

### 3.3 Priority screens are functional but visually below standard

| Screen | Defects observed (`docs/audit/screenshots/before/`) |
|---|---|
| 001 Homepage | No product imagery or proof points; route cards (A–D) have titles only; long single-colour hero; the sector chip row looks like a tag cloud. |
| 023 Partner Dashboard | KPI tiles lack context and trends; recommendations show test titles; activity feed shows raw audit codes ("team nda pending"); organization card dumps raw fields ("Level: verified"); no next-best-action. |
| 031 Marketplace | No result count, sort or pagination; a uniform two-column card wall; missing deadline/eligibility on cards; "—" for missing values; duplicates. |
| 036 Opportunity Detail | Large empty area; no eligibility summary or decision panel; lowercase raw values ("project", "verified"); no timeline, documents or publisher context. |
| 137 Tender Administration | No KPI strip, search or pagination; issuer column wraps; long single table; polluted titles. |

### 3.4 Status colour bug (functional UI defect)
The status-to-colour mapping tests "success" words first:
- "Disqualified" renders in success green (it contains "qualified").
- "not_awarded" renders green (contains "awarded").
- "Unverified" and "inactive" render as positive.

Observed on screen 070 (Technical Evaluation). **Corrective action:** negative patterns are evaluated first, with a unit test (Phase B).

### 3.5 Restricted Tender Evaluation & Negotiation screens (070/071/069/073)
Investigated with authorized demo accounts:
- *Lakshmi Rao*, technical evaluator: technical envelopes only, no prices visible.
- *Sanjay Kulkarni*, issuer and commercial evaluator: negotiation thread and comparison.

Permissions behave as designed and are covered by `apps/api/test/stage09.e2e.ts` (14 tests, including sealed-bid and evaluator-conflict controls). The defects are presentational: polluted titles, the status-colour bug, and dense unstyled score text.

### 3.6 Mobile application
- 32 of the 46 screens the registry marks as native have native implementations; 14 are missing (015, 105, 106, 108, 110, 111, 116, 120, 147, 150, 160, 163, 164, 165).
- Only 6 of the 32 implemented native screens have automated tests.
- `Field` labels are not programmatically associated with their inputs (screen-reader defect; found while rendering the native layouts).
- Android and iOS JavaScript bundles compile. **No native binaries exist:** the Android SDK download is blocked and there is no Xcode/EAS in this environment (blocker B-06).
- Native layouts were rendered through `react-native-web` at 390 px as visual evidence. This is not proof of on-device behaviour.

### 3.7 Not built
- 35 registry screens have no route (Stages 13–16): messaging, meetings, announcements, notifications, support, learning, reputation, AI, international and analytics.
- The Stage 13 API exists (commit `c1279e2`) but has no tests or UI.

### 3.8 Back-end integrity (positive)
Real PostgreSQL operations everywhere; no mocked endpoints. Tenancy isolation returns 404 across organizations. Integrity is enforced in the database:
- immutable approved contract versions;
- append-only change logs, order history and commission journal;
- immutable settlements;
- a guard against unearned payouts.

Authentication uses HS256 JWT with refresh rotation, CSRF double-submit for web, Bearer for mobile, and mandatory TOTP MFA for platform roles. Role capabilities are defined in one place (`packages/types/src/roles.ts`) and enforced server-side.

## 4. Authentication & permission audit

| Check | Result | Evidence |
|---|---|---|
| Cross-organization object access returns 404 | Pass | stage02, 06, 08, 09, 10, 11, 12 e2e |
| MFA required for platform roles; finance actions re-check MFA | Pass | stage02, stage12 |
| Two-person rules (contract approval, finance dual approval, policy activation, payout approver ≠ settler) | Pass | stage10, stage12 |
| Sealed bids unreadable by issuer, evaluators and admins before opening | Pass | stage09 |
| Client-side gating is UX only; the API enforces | Pass | code review: `apps/web/components/Screen.tsx`, `common/auth.guard.ts` |
| Permission-denied states are explained to the user | Partial | generic "Access restricted" text; no next step on several screens |

## 5. Corrective plan (this recovery)
1. **Data hygiene:**
   - isolated e2e database;
   - realistic fixtures;
   - curated, labelled demo data.
2. **Phase B design system:**
   - navy/green tokens from the approved logo on white surfaces;
   - typography scale, spacing scale, icon set;
   - refined tables, cards and form controls;
   - loading, empty and error states;
   - task-based navigation with no developer artifacts;
   - status-tone fix.
3. **Phase C five screens:** 001, 023, 031, 036, 137 rebuilt individually (no shared generic template), each with screenshots and checks.
4. **Phase D mobile:** a native tab-based shell and native layouts for the core partner workflows (home, opportunities, opportunity detail, leads, projects), with native tests.
5. **Phase E gate:** every completed screen is recorded in `docs/audit/quality-gate.json` with its evidence. The remaining screens wait until the first five pass.

## 6. Mobile build evidence
```
npx expo export --platform android  → Exported (Hermes bundle)
npx expo export --platform ios      → Exported
npx expo export --platform web      → Exported (used only to render native layouts for screenshots)
```

## 7. Evidence index
- `docs/audit/route-inventory.json` — machine-generated route/test/native mapping for all 165 screens.
- `docs/audit/screenshots/before/` — desktop and mobile captures of the priority and restricted screens before redesign.
- `docs/audit/screenshots/before/mobile-native/` — native layouts rendered at 390 px.
- `docs/audit/test-results/` — raw outputs of every suite.

## 8. Per-screen evidence (generated by `scripts/audit-report.mjs`)

| ID | Screen | App · route | Functional evidence | UI quality | Mobile | Corrective action |
|---|---|---|---|---|---|---|
| 001 | Website homepage | web · `/` | Functional — API e2e + browser journey (stage01.e2e.ts, stage09.e2e.ts, stage12.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 002 | About COLLABIZ | web · `/about` | Functional — API e2e + browser journey (stage09.e2e.ts, stage12.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 003 | How Collaboration Works | web · `/how-it-works` | Functional — API e2e + browser journey (stage09.e2e.ts, stage12.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 004 | Unite Group Companies Directory | web · `/group-companies` | Functional — API e2e + browser journey (stage04.e2e.ts, stage09.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 005 | Products & Services Catalogue | web · `/catalogue` | Functional — API e2e + browser journey (stage09.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 006 | Public Business Opportunities | web · `/opportunities/public` | Functional — API e2e + browser journey (stage05.e2e.ts, stage09.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 007 | Partner Benefits & Membership | web · `/membership` | Functional — API e2e + browser journey (stage09.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 008 | Success Stories & Case Studies | web · `/success-stories` | Functional — API e2e + browser journey (stage04.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 009 | Global Partner Locations | web · `/locations` | Functional — API e2e + browser journey (stage05.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 010 | Contact, FAQs & Support | web · `/support/contact` | Functional — API e2e + browser journey (stage01.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 011 | Login / Create Account | web · `/login` | Functional — API e2e + browser journey (stage02.e2e.ts) | Below premium standard — pending redesign | Native + test | Redesign to Phase B system; re-verify |
| 012 | OTP & Email Verification | web · `/verify` | Functional — API e2e + browser journey (stage02.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 013 | Select Account Type | web · `/onboarding/account-type` | Functional — API e2e + browser journey (stage03.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 014 | Individual Partner Registration | web · `/onboarding/individual` | Wired to API — no automated evidence | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add browser journey; add native test; re-verify |
| 015 | Company Partner Registration | web · `/onboarding/company` | Functional — API e2e + browser journey (stage03.e2e.ts) | Below premium standard — pending redesign | **Native missing** | Redesign to Phase B system; build native screen; re-verify |
| 016 | Partner Industry & Skills Selection | web · `/onboarding/industries` | Functional — browser journey only | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 017 | Geographical Coverage Selection | web · `/onboarding/coverage` | Functional — browser journey only | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 018 | Business Profile Builder | web · `/onboarding/profile` | Functional — browser journey only | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 019 | KYC / KYB Document Upload | web · `/onboarding/kyc` | Functional — API e2e + browser journey (stage03.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 020 | Bank & Tax Profile | web · `/onboarding/bank-tax` | Functional — browser journey only | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 021 | Agreement Acceptance & e-Sign | web · `/onboarding/agreements` | Functional — API e2e + browser journey (stage03.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 022 | Verification Status & Approval | web · `/onboarding/status` | Functional — API e2e + browser journey (stage03.e2e.ts) | Below premium standard — pending redesign | Native + test | Redesign to Phase B system; re-verify |
| 023 | Partner Home Dashboard | web · `/dashboard` | Functional — API e2e only (no browser journey) (stage05.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add browser journey; add native test; re-verify |
| 024 | My Opportunities Overview | web · `/my/opportunities` | Functional — browser journey only | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 025 | Recommended Business Feed | web · `/feed` | Functional — API e2e + browser journey (stage05.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 026 | My Leads & Pipeline | web · `/my/leads` | Functional — browser journey only | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 027 | Earnings & Settlement Summary | web · `/earnings/summary` | Functional — browser journey only | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 028 | Tasks & Follow-up Calendar | web · `/tasks` | Functional — API e2e + browser journey (stage07.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 029 | Partner Performance Scorecard | web · `/performance` | Not built | — | Responsive web only | Build in Stage 14 under the new design system |
| 030 | Quick Actions & Activity Center | web · `/activity` | Functional — API e2e + browser journey (stage07.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 031 | All Opportunities Marketplace | web · `/marketplace` | Functional — API e2e + browser journey (stage05.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 032 | Unite Group Opportunities | web · `/marketplace/unite` | Static page | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; add browser journey; re-verify |
| 033 | Approved Partner Exchange | web · `/marketplace/exchange` | Functional — API e2e only (no browser journey) (stage05.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; add browser journey; re-verify |
| 034 | Opportunity Category Browser | web · `/marketplace/categories` | Functional — API e2e + browser journey (stage05.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 035 | Advanced Search & Filter | web · `/marketplace/search` | Functional — API e2e + browser journey (stage05.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 036 | Opportunity Detail Page | web · `/opportunities/[id]` | Functional — browser journey only | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 037 | Saved Opportunities & Alerts | web · `/marketplace/saved` | Functional — API e2e + browser journey (stage05.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 038 | Location-Based Opportunities Map | web · `/marketplace/map` | Functional — API e2e + browser journey (stage05.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 039 | Product & Service Detail | web · `/catalogue/[id]` | Functional — API e2e + browser journey (stage04.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 040 | Submit Requirement / RFQ | web · `/rfq/new` | Functional — API e2e + browser journey (stage05.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 041 | Opportunity Eligibility Checker | web · `/opportunities/[id]/eligibility` | Functional — API e2e + browser journey (stage05.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 042 | Apply / Express Interest | web · `/opportunities/[id]/apply` | Functional — API e2e + browser journey (stage05.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 043 | Register New Business Lead | web · `/leads/new` | Functional — API e2e + browser journey (stage06.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 044 | Customer / Company Details | web · `/leads/new/customer` | Static page | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; add browser journey; re-verify |
| 045 | Select Products or Project Type | web · `/leads/new/scope` | Static page | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; add browser journey; re-verify |
| 046 | Opportunity Value & Requirements | web · `/leads/new/value` | Functional — browser journey only | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 047 | Upload Lead Supporting Documents | web · `/leads/[id]/documents` | Functional — API e2e only (no browser journey) (stage06.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; add browser journey; re-verify |
| 048 | Duplicate Lead Detection | web · `/leads/[id]/duplicates` | Functional — API e2e only (no browser journey) (stage06.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add browser journey; add native test; re-verify |
| 049 | Lead Registration Confirmation | web · `/leads/[id]/confirmation` | Functional — API e2e + browser journey (stage06.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 050 | Unite First-Review Status | web · `/leads/[id]/review-status` | Functional — API e2e + browser journey (stage06.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 051 | Protected Lead Ownership Certificate | web · `/leads/[id]/certificate` | Functional — API e2e only (no browser journey) (stage06.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add browser journey; add native test; re-verify |
| 052 | Customer CRM Profile | web · `/crm/customers/[id]` | Functional — browser journey only | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 053 | Sales Pipeline Kanban | web · `/crm/pipeline` | Functional — API e2e + browser journey (stage07.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 054 | Lead Follow-up & Conversion Timeline | web · `/leads/[id]/timeline` | Functional — API e2e + browser journey (stage07.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 055 | Find Collaboration Partners | web · `/partners/find` | Functional — browser journey only | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 056 | Partner Directory & Profiles | web · `/partners` | Functional — API e2e only (no browser journey) (stage08.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; add browser journey; re-verify |
| 057 | AI Partner Match Suggestions | web · `/partners/ai-matches` | Functional — API e2e + browser journey (stage08.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 058 | Invite Partner to Collaborate | web · `/teams/[id]/invite` | Functional — API e2e + browser journey (stage08.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 059 | Incoming Collaboration Requests | web · `/collaboration/requests` | Functional — API e2e + browser journey (stage08.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 060 | Multi-Partner Project Team Builder | web · `/teams/builder` | Wired to API — no automated evidence | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; add browser journey; re-verify |
| 061 | Roles & Responsibilities Allocation | web · `/teams/[id]/roles` | Functional — API e2e only (no browser journey) (stage08.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; add browser journey; re-verify |
| 062 | Confidentiality / NDA Workspace | web · `/teams/[id]/nda` | Functional — API e2e + browser journey (stage08.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 063 | Commercial Sharing Proposal | web · `/teams/[id]/sharing` | Functional — API e2e + browser journey (stage08.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 064 | Collaboration Approval & Team Activation | web · `/teams/[id]/activation` | Functional — API e2e + browser journey (stage08.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 065 | Tender & RFQ Dashboard | web · `/tenders` | Functional — API e2e + browser journey (stage09.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 066 | Publish Tender / Work Package | web · `/tenders/new` | Functional — API e2e + browser journey (stage09.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 067 | Tender Documents & Eligibility | web · `/tenders/[id]/documents` | Functional — API e2e + browser journey (stage09.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 068 | Partner Bid Submission | web · `/tenders/[id]/bid` | Functional — API e2e + browser journey (stage09.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 069 | Bid Comparison Table | web · `/tenders/[id]/comparison` | Functional — API e2e + browser journey (stage09.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 070 | Technical Evaluation | web · `/tenders/[id]/technical` | Functional — API e2e + browser journey (stage09.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 071 | Commercial Evaluation | web · `/tenders/[id]/commercial` | Functional — API e2e + browser journey (stage09.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 072 | AI Proposal Draft Builder | web · `/tenders/[id]/ai-proposal` | Not built | — | Responsive web only | Build in Stage 14 under the new design system |
| 073 | Negotiation & Revision Workspace | web · `/tenders/[id]/negotiation` | Functional — API e2e + browser journey (stage09.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 074 | Award, LOI & Work Order | web · `/tenders/[id]/award` | Functional — API e2e + browser journey (stage10.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 075 | Active Projects Portfolio | web · `/projects` | Functional — browser journey only | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 076 | Project Overview Dashboard | web · `/projects/[id]` | Functional — browser journey only | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 077 | Milestone & Schedule Planner | web · `/projects/[id]/milestones` | Functional — API e2e + browser journey (stage11.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 078 | Work Allocation & Subcontractors | web · `/projects/[id]/allocation` | Functional — API e2e only (no browser journey) (stage11.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; add browser journey; re-verify |
| 079 | Site Progress & Photo Updates | web · `/projects/[id]/progress` | Functional — API e2e + browser journey (stage11.e2e.ts) | Below premium standard — pending redesign | Native + test | Redesign to Phase B system; re-verify |
| 080 | Materials & Procurement Tracker | web · `/projects/[id]/materials` | Functional — API e2e + browser journey (stage11.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 081 | Project Documents Repository | web · `/projects/[id]/documents` | Functional — API e2e + browser journey (stage11.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 082 | Quality & Safety Inspection | web · `/projects/[id]/inspections` | Functional — browser journey only | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 083 | Invoice / Milestone Certification | web · `/projects/[id]/certification` | Functional — API e2e + browser journey (stage11.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 084 | Project Closure & Completion Certificate | web · `/projects/[id]/closure` | Functional — API e2e + browser journey (stage11.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 085 | Trading Marketplace | web · `/trading` | Functional — browser journey only | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 086 | Supplier & Manufacturer Catalogue | web · `/trading/suppliers` | Functional — API e2e + browser journey (stage11b.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 087 | Buyer Requirement Posting | web · `/trading/requirements/new` | Functional — API e2e + browser journey (stage11b.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 088 | Product Enquiry & Price Request | web · `/trading/enquiry` | Functional — API e2e + browser journey (stage11b.e2e.ts) | Below premium standard — pending redesign | Native + test | Redesign to Phase B system; re-verify |
| 089 | Supplier Quotation Comparison | web · `/trading/quotations` | Functional — API e2e + browser journey (stage11b.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 090 | Purchase Order Creation | web · `/trading/po/new` | Functional — API e2e + browser journey (stage11b.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 091 | Order Fulfillment Dashboard | web · `/trading/orders` | Functional — API e2e + browser journey (stage11b.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 092 | Shipping & Logistics Tracking | web · `/trading/orders/[id]/shipping` | Functional — API e2e + browser journey (stage11b.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 093 | Distributor Territory Management | web · `/trading/territories` | Functional — API e2e + browser journey (stage11b.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 094 | Returns, Warranty & Claims | web · `/trading/claims` | Functional — API e2e + browser journey (stage11b.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 095 | Partner Earnings Overview | web · `/earnings` | Functional — browser journey only | Below premium standard — pending redesign | Native + test | Redesign to Phase B system; re-verify |
| 096 | Commission Agreement Detail | web · `/commissions/agreements/[id]` | Functional — API e2e + browser journey (stage12.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 097 | Commission Calculator | web · `/commissions/calculator` | Functional — browser journey only | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 098 | Commission Approval Workflow | web · `/commissions/approvals` | Functional — API e2e + browser journey (stage12.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 099 | Invoice / Payout Request | web · `/payouts/request` | Functional — API e2e + browser journey (stage12.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 100 | Payment & Settlement History | web · `/payments/history` | Functional — API e2e + browser journey (stage04.e2e.ts, stage05.e2e.ts, stage08.e2e.ts, stage09.e2e.ts, stage11.e2e.ts, stage11b.e2e.ts, stage12.e2e.ts) | Below premium standard — pending redesign | Native + test | Redesign to Phase B system; re-verify |
| 101 | Tax / TDS / GST Records | web · `/tax-records` | Functional — browser journey only | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 102 | Finance & Funding Opportunities | web · `/finance/opportunities` | Functional — API e2e + browser journey (stage12.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 103 | Project Finance Enquiry | web · `/finance/enquiry` | Functional — API e2e + browser journey (stage12.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 104 | Payment Disputes & Reconciliation | web · `/finance/disputes` | Functional — API e2e only (no browser journey) (stage12.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; add browser journey; re-verify |
| 105 | Unified Business Inbox | web · `/inbox` | Not built | — | **Native missing** | Build in Stage 13 under the new design system |
| 106 | One-to-One Partner Chat | web · `/chat/[id]` | Not built | — | **Native missing** | Build in Stage 13 under the new design system |
| 107 | Project Group Chat | web · `/chat/groups/[id]` | Not built | — | Responsive web only | Build in Stage 13 under the new design system |
| 108 | Audio / Video Meeting Room | web · `/meetings/[id]/room` | Not built | — | **Native missing** | Build in Stage 13 under the new design system |
| 109 | Meeting Scheduling | web · `/meetings` | Not built | — | Responsive web only | Build in Stage 13 under the new design system |
| 110 | Business Announcements | web · `/announcements` | Not built | — | **Native missing** | Build in Stage 13 under the new design system |
| 111 | Notifications & Alerts Center | web · `/notifications` | Not built | — | **Native missing** | Build in Stage 13 under the new design system |
| 112 | Support Tickets & Escalation | web · `/support/tickets` | Not built | — | Responsive web only | Build in Stage 13 under the new design system |
| 113 | Marketing Resources Library | web · `/resources` | Not built | — | Responsive web only | Build in Stage 14 under the new design system |
| 114 | Co-Branded Brochure Generator | web · `/resources/brochure` | Not built | — | Responsive web only | Build in Stage 14 under the new design system |
| 115 | Approved Social Campaign Assets | web · `/resources/social` | Not built | — | Responsive web only | Build in Stage 14 under the new design system |
| 116 | Training & Learning Center | web · `/learning` | Not built | — | **Native missing** | Build in Stage 14 under the new design system |
| 117 | Certification Assessment | web · `/learning/assessments/[id]` | Not built | — | Responsive web only | Build in Stage 14 under the new design system |
| 118 | Partner Certificate & Badge | web · `/certificates` | Not built | — | Responsive web only | Build in Stage 14 under the new design system |
| 119 | Global Opportunities Portal | web · `/global` | Not built | — | Responsive web only | Build in Stage 15 under the new design system |
| 120 | Country Partner Registration | web · `/global/country-partner` | Not built | — | **Native missing** | Build in Stage 15 under the new design system |
| 121 | International Territory Dashboard | web · `/global/territory` | Not built | — | Responsive web only | Build in Stage 15 under the new design system |
| 122 | Import / Export Enquiry Desk | web · `/global/import-export` | Not built | — | Responsive web only | Build in Stage 15 under the new design system |
| 123 | JV & Strategic Alliance Proposals | web · `/alliances` | Not built | — | Responsive web only | Build in Stage 15 under the new design system |
| 124 | Consortium Formation | web · `/consortiums` | Functional — API e2e only (no browser journey) (stage08.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; add browser journey; re-verify |
| 125 | Investor Opportunity Data Room | web · `/data-room` | Not built | — | Responsive web only | Build in Stage 15 under the new design system |
| 126 | Cross-Border Compliance Checklist | web · `/global/compliance` | Not built | — | Responsive web only | Build in Stage 15 under the new design system |
| 127 | Group Admin Executive Dashboard | admin · `/` | Wired to API — no automated evidence | Below premium standard — pending redesign | n/a (desktop admin) | Redesign to Phase B system; add browser journey; re-verify |
| 128 | Group Companies & Business Units | admin · `/group-companies` | Functional — API e2e + browser journey (stage04.e2e.ts) | Below premium standard — pending redesign | n/a (desktop admin) | Redesign to Phase B system; re-verify |
| 129 | Admin Users & Permissions | admin · `/users` | Functional — API e2e + browser journey (stage02.e2e.ts) | Below premium standard — pending redesign | n/a (desktop admin) | Redesign to Phase B system; re-verify |
| 130 | Partner Verification Queue | admin · `/verification` | Functional — API e2e + browser journey (stage03.e2e.ts) | Below premium standard — pending redesign | n/a (desktop admin) | Redesign to Phase B system; re-verify |
| 131 | Partner Risk & Compliance Review | admin · `/risk` | Functional — browser journey only | Below premium standard — pending redesign | n/a (desktop admin) | Redesign to Phase B system; re-verify |
| 132 | Opportunity Approval & Routing | admin · `/routing` | Functional — API e2e + browser journey (stage06.e2e.ts) | Below premium standard — pending redesign | n/a (desktop admin) | Redesign to Phase B system; re-verify |
| 133 | Priority Review SLA Configuration | admin · `/sla` | Functional — API e2e only (no browser journey) (stage06.e2e.ts) | Below premium standard — pending redesign | n/a (desktop admin) | Redesign to Phase B system; add browser journey; re-verify |
| 134 | Lead Ownership & Conflict Resolution | admin · `/lead-conflicts` | Functional — API e2e + browser journey (stage06.e2e.ts) | Below premium standard — pending redesign | n/a (desktop admin) | Redesign to Phase B system; re-verify |
| 135 | Commission Policy Configuration | admin · `/commission-policy` | Functional — API e2e only (no browser journey) (stage12.e2e.ts) | Below premium standard — pending redesign | n/a (desktop admin) | Redesign to Phase B system; add browser journey; re-verify |
| 136 | Product & Catalogue Management | admin · `/catalogue` | Functional — API e2e + browser journey (stage04.e2e.ts) | Below premium standard — pending redesign | n/a (desktop admin) | Redesign to Phase B system; re-verify |
| 137 | Project / Tender Administration | admin · `/tenders` | Functional — API e2e + browser journey (stage09.e2e.ts) | Below premium standard — pending redesign | n/a (desktop admin) | Redesign to Phase B system; re-verify |
| 138 | Finance & Settlement Controls | admin · `/finance` | Functional — API e2e + browser journey (stage12.e2e.ts) | Below premium standard — pending redesign | n/a (desktop admin) | Redesign to Phase B system; re-verify |
| 139 | Performance Analytics & BI | admin · `/analytics` | Not built | — | n/a (desktop admin) | Build in Stage 16 under the new design system |
| 140 | AI Monitoring & Recommendation Controls | admin · `/ai` | Not built | — | n/a (desktop admin) | Build in Stage 14 under the new design system |
| 141 | Audit Logs & Security Center | admin · `/audit` | Functional — API e2e + browser journey (stage02.e2e.ts) | Below premium standard — pending redesign | n/a (desktop admin) | Redesign to Phase B system; re-verify |
| 142 | Global Content & CMS Management | admin · `/cms` | Not built | — | n/a (desktop admin) | Build in Stage 15 under the new design system |
| 143 | My Partner Profile | web · `/profile` | Functional — API e2e + browser journey (stage03.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 144 | Company Team & Sub-Accounts | web · `/company/team` | Functional — API e2e + browser journey (stage02.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 145 | Account Security & MFA | web · `/settings/security` | Functional — API e2e + browser journey (stage02.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 146 | Languages, Currencies & Regions | web · `/settings/regional` | Not built | — | Responsive web only | Build in Stage 15 under the new design system |
| 147 | Notification Preferences | web · `/settings/notifications` | Not built | — | **Native missing** | Build in Stage 13 under the new design system |
| 148 | Documents & Agreements Vault | web · `/vault` | Functional — API e2e + browser journey (stage10.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 149 | Privacy, Consent & Data Rights | web · `/settings/privacy` | Functional — API e2e + browser journey (stage03.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 150 | Help, Feedback & Account Closure | web · `/help` | Not built (stage12.e2e.ts) | — | **Native missing** | Build in Stage 13 under the new design system |
| 151 | Lead Protection Dashboard | web · `/lead-protection` | Functional — API e2e + browser journey (stage06.e2e.ts) | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 152 | Digital Lead Registration Certificate | web · `/leads/[id]/registration-certificate` | Functional — API e2e only (no browser journey) (stage06.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; add browser journey; re-verify |
| 153 | Lead Ownership Dispute Center | web · `/lead-disputes` | Functional — API e2e + browser journey (stage06.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 154 | Collaboration Team Creation | web · `/teams/new` | Functional — API e2e + browser journey (stage08.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 155 | Consortium Member Roles & Sharing | web · `/teams/[id]/members` | Functional — API e2e only (no browser journey) (stage08.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; add browser journey; re-verify |
| 156 | Joint Proposal & Team Workspace | web · `/teams/[id]/workspace` | Functional — browser journey only | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 157 | Commission Agreement & Milestones | web · `/commissions/agreements/[id]/milestones` | Functional — browser journey only | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 158 | Live Earnings & Settlement Tracker | web · `/earnings/live` | Functional — browser journey only | Below premium standard — pending redesign | Native, untested | Redesign to Phase B system; add native test; re-verify |
| 159 | Commission Dispute Resolution | web · `/commissions/disputes` | Functional — API e2e + browser journey (stage12.e2e.ts) | Below premium standard — pending redesign | Responsive web only | Redesign to Phase B system; re-verify |
| 160 | AI Opportunity Matching Dashboard | web · `/ai/matching` | Not built | — | **Native missing** | Build in Stage 14 under the new design system |
| 161 | AI Recommended Partners | web · `/ai/partners` | Not built | — | Responsive web only | Build in Stage 14 under the new design system |
| 162 | AI Project Collaboration Builder | web · `/ai/team-builder` | Not built | — | Responsive web only | Build in Stage 14 under the new design system |
| 163 | Partner Reputation Profile | web · `/partners/[id]/reputation` | Not built | — | **Native missing** | Build in Stage 14 under the new design system |
| 164 | Verified Performance & Reviews | web · `/reputation/reviews` | Not built | — | **Native missing** | Build in Stage 14 under the new design system |
| 165 | Partner Excellence & Certification | web · `/reputation/excellence` | Not built (stage01.e2e.ts) | — | **Native missing** | Build in Stage 14 under the new design system |
