# COLLABIZ V2.0 — Implementation status

Status words: **Implemented** (built, real API and data) · **Tested** (automated tests pass) · **Partially implemented** · **Blocked** (needs an external party) · **Not started**.

| Stage | Feature | Status | Evidence / notes |
|---|---|---|---|
| 00 | Audit and plans | Implemented | `docs/v2/*` |
| 01 | AI Project Team Builder | **Tested** | Team plans for projects/tenders/opportunities: roles, responsibilities, ranked verified candidates, gaps (incl. self-declared certificates), RACI matrix, invite → accept → approve creates a real team (screen 166). API tests + journey |
| 02 | Deal Passport | **Tested** | Joins lead, consent, review, duplicates, agreements, contract, milestones, documents, hash-chained audit; party sharing behind a confidentiality undertaking (no customer contacts, views logged); public verification; print/PDF (screen 167) |
| 03 | Project Splitting Marketplace | **Tested** | Work packages under a parent project; budgets can never exceed project value; eligibility with reasons; bids; award adds winner as subcontractor; budget-weighted progress (screens 168–169) |
| 04 | AI Tender Eligibility Analyzer | **Tested** | PDF → 11 kinds of conditions with page/line references; comparison with profile and KYB documents; checklist; consortium candidates; Unite reviewer confirmation (screen 170 + admin Tender reviews). Scanned PDFs need OCR (blocked) |
| 05 | JV & Consortium Builder | **Tested** | Contribution ledger per member (pledged vs delivered; the lead confirms others' deliveries; gaps against agreed shares flagged); MoU / JV terms / amendments with decision rule and signing authority, approved by every member on the exact text (hash). Drafts only — binding signature is a separate legal step (team tab "Contributions & MoU") |
| 06 | Milestone Payment Assurance | **Tested** | Eight display states (projected → paid / disputed); part payments with bank/UTR reference (duplicates refused, over-payment refused); due dates (30-day default), overdue days, weekly payer reminders; projected/contracted/approved/invoiced/received/outstanding kept separate; admin reconciliation. No escrow or fund custody (project tab "Payments", admin `/reconciliation`) |
| 07 | Local Opportunity Radar | **Tested** | Per state and sector: open opportunities, work packages, verified partners, spare capacity, city clusters — from COLLABIZ listings and verified profiles only (screen 171, `/radar`) |
| 08 | Idle Capacity Exchange | **Tested** (via XCHANGE) | Capacity is an XCHANGE listing kind (warehouse, vehicles, crews, technicians, production lines, machinery) exchangeable for goods, part-cash or cash |
| 09 | Voice-to-Opportunity | Not started | Browser speech recognition sends audio to the browser vendor's service — consent screen required |
| 10 | Conflict & Commission Resolution | **Tested** | One queue for lead, commission, XCHANGE and contract disputes; Unite admin assigns a reviewer from neither party; evidence timeline with a rules-based digest (not a finding); contract disputes: statements, evidence, reasoned decision, one appeal within 14 days to a super admin. Internal mediation, not arbitration (screen 175; partner `/resolution`) |
| 11 | Country Business Desks | Partially implemented (country partners, territory, import/export, compliance) | Per-country desk pending |
| 12 | Opportunity-to-Revenue Intelligence | Partially implemented (partner funnel) | Revenue funnel pending |
| — | **COLLABIZ XCHANGE** (barter) | **Tested** | Listings (offers/needs), matching incl. 3–4 way cycles, balanced agreements approved by all parties, delivery/acceptance/dispute/redelivery, invoice data (screens 180–183, admin oversight). Legal Q29 open |
| — | **COLLABIZ ONE** | **Tested** | Six-step journey per opportunity from existing records (screens 178–179) |
| 13 | Premium UI | Implemented for existing app (design system v3) | Applied to each new screen |
| 14 | QA | Ongoing per stage | |
| 15 | Reference review | Implemented | See gap analysis |
| 16 | Final report | Not started | |

Blocked items carried over: production server/domain, SMTP, payment gateway, ERPNext site, LLM/OCR provider key, app-store signing, legal review (29 questions), real commercial rates, pilot partners.

_Checkpoint: if a session ends, resume from the first row that is not Tested._
