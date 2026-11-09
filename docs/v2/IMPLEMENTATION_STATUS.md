# COLLABIZ V2.0 — Implementation status

Status words: **Implemented** (built, real API and data) · **Tested** (automated tests pass) · **Partially implemented** · **Blocked** (needs an external party) · **Not started**.

| Stage | Feature | Status | Evidence / notes |
|---|---|---|---|
| 00 | Audit and plans | Implemented | `docs/v2/*` |
| 01 | AI Project Team Builder | Partially implemented (existing builder) | V2 extension pending |
| 02 | Deal Passport | Partially implemented (certificate, consent, review, audit exist) | V2 passport pending |
| 03 | Project Splitting Marketplace | Not started | |
| 04 | AI Tender Eligibility Analyzer | Partially implemented (structured eligibility) | Document extraction pending |
| 05 | JV & Consortium Builder | Partially implemented (consortiums, alliances) | Contributions, MoU, amendments pending |
| 06 | Milestone Payment Assurance | Partially implemented (milestones → invoice → paid; ledger) | Partial payments, overdue, reconciliation pending |
| 07 | Local Opportunity Radar | Partially implemented (map, alerts) | Radar view pending |
| 08 | Idle Capacity Exchange | Not started | |
| 09 | Voice-to-Opportunity | Not started | Browser speech recognition sends audio to the browser vendor's service — consent screen required |
| 10 | Conflict & Commission Resolution | Partially implemented (lead and commission disputes) | Contract disputes, reviewer assignment, timeline pending |
| 11 | Country Business Desks | Partially implemented (country partners, territory, import/export, compliance) | Per-country desk pending |
| 12 | Opportunity-to-Revenue Intelligence | Partially implemented (partner funnel) | Revenue funnel pending |
| 13 | Premium UI | Implemented for existing app (design system v3) | Applied to each new screen |
| 14 | QA | Ongoing per stage | |
| 15 | Reference review | Implemented | See gap analysis |
| 16 | Final report | Not started | |

Blocked items carried over: production server/domain, SMTP, payment gateway, ERPNext site, LLM/OCR provider key, app-store signing, legal review (28 questions), real commercial rates, pilot partners.

_Checkpoint: if a session ends, resume from the first row that is not Tested._
