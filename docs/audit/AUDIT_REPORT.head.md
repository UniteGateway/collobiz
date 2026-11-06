# COLLABIZ — Development Recovery & UI Quality Audit

**Date:** 2026-11-06 · **Branch:** `claude/collabiz-platform-build` · **Audited commit:** `c1279e2`
**Method:** repository inspection, route-to-registry mapping (`scripts/audit-routes.mjs`), full automated test run, evidence screenshots with authorized demo accounts (`scripts/capture-screens.mjs`), independent mobile bundle builds and native-layout rendering.

> **Verdict: the platform's back end is broadly functional. The user interface does not meet the approved international corporate standard.**
> Under the new quality gate (Phase E), **no screen counts as complete until it has been redesigned and passes visual, functional, permission and test checks.** A screen that merely renders does not count. Earlier "verified" labels in `screen-registry.csv` meant *functionally verified by automated tests*; they do not certify UI quality.

## 1. Summary

<!--SUMMARY-->

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
