# COLLABIZ V2.0 — Implementation status

Status words: **Implemented** (built, real API and data) · **Tested** (automated tests pass) · **Partially implemented** · **Blocked** (needs an external party) · **Not started**.

| Stage | Feature | Status | Evidence / notes |
|---|---|---|---|
| 00 | Audit and plans | Implemented | `docs/v2/*` |
| 01 | AI Project Team Builder | **Tested** | Team plans for projects/tenders/opportunities: roles, responsibilities, ranked verified candidates, gaps (incl. self-declared certificates), RACI matrix, invite → accept → approve creates a real team (screen 166). API tests + journey |
| 02 | Deal Passport | **Tested** | Joins lead, consent, review, duplicates, agreements, contract, milestones, documents, hash-chained audit; party sharing behind a confidentiality undertaking (no customer contacts, views logged); public verification; print/PDF (screen 167) |
| 03 | Project Splitting Marketplace | **Tested** | Work packages under a parent project; budgets can never exceed project value; eligibility with reasons; bids; award adds winner as subcontractor; budget-weighted progress (screens 168–169) |
| 04 | AI Tender Eligibility Analyzer | **Tested** | PDF → 11 kinds of conditions with page/line references; comparison with profile and KYB documents; checklist; consortium candidates; Unite reviewer confirmation (screen 170 + admin Tender reviews). Scanned PDFs need OCR (blocked) |
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
