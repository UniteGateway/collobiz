# COLLABIZ V2.0 — Feature gap analysis

Each V2 enhancement mapped to what already exists. "Extend" means build inside the existing module; no duplicate modules.

| # | Enhancement | Already in COLLABIZ | Gap to close | Verdict |
|---|---|---|---|---|
| 01 | AI Project Team Builder | `POST /ai/team-builder` ranks candidates per role for an opportunity with explainable factors; teams/consortium invitations with NDA; human activation | Run it for **projects and tenders** too; **capability gap analysis** (what no candidate covers, with evidence state); **responsibility matrix** draft; **invite/reject from the builder** and an approval step before the team is activated | Extend `growth` (AI) + `teams` |
| 02 | Deal Passport | Lead claim with consent, CZL certificate (152), public verification, Unite priority review, conflicts, audit log, NDA on teams, commission agreements, project milestones | One **Deal Passport** view joining these: ownership & protection policy, consent, verification/review history, authorised parties, NDA, agreed participation (agreement terms), contract & milestones, document versions, append-only audit, **PDF export**; server-side access check (owner, Unite reviewers, parties) | Extend `leads` |
| 03 | Project Splitting Marketplace | Projects + milestones; tenders have a free-text work package; RFQs/bids in tenders and trading | **Work packages** under a parent project (civil, electrical, mechanical, procurement, I&C, logistics, O&M, consulting, custom) with budget, eligibility, RFQ/bids, award, progress roll-up; budgets never added to parent revenue | New sub-module in `projects` |
| 04 | AI Tender Eligibility Analyzer | Structured eligibility rules on tenders/opportunities with pass/fail explanations; tender documents storage | **Upload tender PDF → extract** turnover, experience, certifications/registrations, EMD, equipment/manpower, deadlines **with page/line references**; compare with partner profile; missing documents; consortium view; checklist; "not confirmed until reviewed" status | Extend `tenders` |
| 05 | Smart JV & Consortium Builder | Consortiums (124/155): named parties, lead, roles, work shares, NDA, signed terms; JV proposals (123) | **Financial/technical contributions**, **decision authority**, **MoU workflow and amendments** with approval history, per-organisation document visibility | Extend `teams` |
| 06 | Milestone Payment Assurance | Milestones with evidence, certification, invoice, paid; commission ledger with disputes and settlement | **Partial payments** and **reconciliation**, explicit **Contracted / Partially paid** display states, **overdue alerts**, settlement report; no escrow claims | Extend `projects` + `commissions` |
| 07 | Local Opportunity Radar | Marketplace map, region filters, saved searches and alerts, field lead registration, territories | **Radar view**: opportunities + verified partners/suppliers + capacity by district/cluster; nearby counts; recommendations | Extend `opportunities` (small) |
| 08 | Idle Capacity Exchange | Partner capacity (people/offices) for offers | **Listings** of machinery, equipment, warehouse, vehicles, crews, technicians, production capacity; calendar; quotes; booking with named contracting parties; completion; ratings | New module `capacity` |
| 09 | Voice-to-Opportunity | — | Microphone dictation (English, Hindi, Telugu), structured extraction, draft, missing-info questions, user confirmation, submit to the existing opportunity engine | New (web; native later) |
| 10 | Conflict & Commission Resolution | Lead disputes (153/134) with evidence, ruling, appeal; commission disputes (159) | **Contract responsibility disputes**, **reviewer assignment**, **timeline reconstruction** across audit + evidence, one resolution centre for staff | Extend `leads` + `commissions` |
| 11 | Country Business Desks | Country partner registration, territory dashboard, import/export desk, compliance checklist, currency/language preferences | **Per-country desk** page joining these for one country, approved representative profiles, country manager approvals | Extend `global` (small) |
| 12 | Opportunity-to-Revenue Intelligence | Partner funnel analytics (139), home KPIs, commission ledger | **Lead → … → Settlement** stage funnel with **pipeline, booked, invoiced, collected** kept separate; aging, losses, partner/industry/geography, commission liabilities, AI match effectiveness | Extend `global` analytics |

## Order (as recommended)
Phase 1: 02 Deal Passport · 01 Team Builder · 03 Project Splitting · 04 Tender Analyzer.
Phase 2: 06 Payment Assurance · 10 Resolution · 05 JV Builder · 07 Radar · 08 Capacity Exchange.
Phase 3: 09 Voice · 11 Country Desks · 12 Revenue Intelligence.
Phase 4: native screens for the most-used new flows, regression, security review, report.

## Reference repositories (Stage 15)
Reviewed as references only — no code copied. Twenty (AGPL), Plane (AGPL), Chatwoot (MIT core, enterprise folder proprietary), Keycloak (Apache-2.0), Vendure (GPL-3.0 core), Expo (MIT), LangChain.js (MIT), ERPNext (GPL-3.0, already integrated **over its API**, not linked). AGPL/GPL code is not brought into COLLABIZ; existing COLLABIZ modules already cover CRM, projects, commerce, messaging and auth, so none is replaced. LangChain.js may be used later behind `AI_PROVIDER` once an LLM key is approved.

## Added 2026-11-10: COLLABIZ ONE and COLLABIZ XCHANGE

| Proposal | Already in COLLABIZ | Gap | Plan |
|---|---|---|---|
| **COLLABIZ ONE** (virtual company builder) | Opportunity + lead protection, Unite priority review, AI team plans with gaps, team/consortium with NDA and sharing proposals, Deal Passport, work packages, projects, commission ledger | One guided journey per opportunity showing the six steps (bring → analyse → Unite review → assemble → agree structure → win, execute, settle) with live status and the next action | `GET /one/:opportunityId` aggregates existing records; screen **178** `/one/[id]`, list **179** `/one`. A "virtual company" is a collaboration workspace, never an incorporated entity. |
| Business DNA Passport | Partner profile, KYB documents, reputation from verified outcomes | Evidence-backed capability view | Later: capabilities marked *evidenced* (KYB document, completed COLLABIZ project) vs *self-declared* — team plans already label certificates as self-declared |
| Opportunity Rescue Engine | Team plans for any project/tender, work packages | Trigger from a stuck project | Covered by team plans + packages; "Rescue" entry point on ONE when a step is blocked |
| Dynamic Contribution Ledger | — | = V2 Stage 05 contributions | Phase 2 |
| 48-hour team challenge, Revival | — | — | Later, on top of ONE |
| **COLLABIZ XCHANGE** (B2B barter) | Partner capacity, trading catalogue | Barter listings (offers and needs incl. idle capacity), matching, multi-party cycles, exchange agreements with legs, approvals, delivery/acceptance, invoice data | New module (migration 0027). Covers V2 **Stage 08 Idle Capacity Exchange** (capacity is a listing kind; cash allowed). Screens **180–183**. No trade-credit tokens or proprietary currency. Each leg is treated as a separate taxable supply at open-market value (CGST Rule 27) — invoice data is prepared for the parties' accountants, never filed by COLLABIZ. |
