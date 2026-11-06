# COLLABIZ — Requirements Index

Consolidated, persistent extraction of every applicable requirement from the COLLABIZ source documents.
**Never delete entries** — supersede them with a dated note instead.

## Sources ingested (2026-11-06)

| Volume | Pages | Content | Status |
|---|---|---|---|
| `COLLABIZ_All_in_One_Master_Book.docx` (v1.0, 06 Nov 2026) | 78 | Business plan, DPR, PRD, 165-screen spec, architecture, security, stages, prompts, investor deck, appendices | Ingested in full |
| B01 Business & Technical | 001–019 | Strategy, commercial model, DPR, roles | Ingested (identical text to docx) |
| B02 Business & Technical | 020–039 | Screen inventory 022–150 | Ingested |
| B03 Business & Technical | 040–059 | Screens 151–165, architecture, security, stages 01–16 prompts | Ingested |
| B04 Business & Technical | 060–078 | Investor deck, appendices, decision register, checklist | Ingested |
| U01–U10 UI Design Atlas | 001–183 | 165 vector screen concepts + 16 dividers; 135 "Responsive desktop", 30 "Mobile first" | Ingested; layout mode per screen recorded in registry |
| `COLLABIZ_Master_Book_With_165_Designed_UI_Screens.pdf`, `COLLABIZ_Vector_UI_Designs.pdf` | 261 / 183 | Combined editions of the above | Cross-checked; no additional requirements |
| Approved logo (PNG) | — | Navy/green interlocking mark, "collabiz" wordmark with leaf on *i*, tagline "Connect. Collaborate. Grow." | Brand tokens sampled; assets in `packages/ui/assets` |

Page references below (`p.N`) are master-book pages (B-volumes are page-aligned).

## R1 — Vision, positioning & boundaries (§1, p.4–5)

| ID | Requirement | Ref |
|---|---|---|
| R1.1 | Product name COLLABIZ, tagline "Connect. Collaborate. Grow.", "Powered by Unite Group". | p.1, 4 |
| R1.2 | Positioning: Unite-first hybrid B2B project, consulting, construction, trading and business-development network. | §1.2 |
| R1.3 | Join lead registration, multi-party collaboration, quotations, bids, contracts, delivery and settlement into one traceable workflow. | §1.1 |
| R1.4 | Solutions: verified identities; Unite-first review with customer consent + configurable SLAs; protected leads tied to signed conditional agreements; consortium & work-package collaboration; documented quotation/bid comparison; settlement ledger with projected/earned/approved/paid; explainable AI + human approval; reputation from verified outcomes (not paid placement). | §1.4 |
| R1.5 | Priority sectors: solar/renewables, power equipment, construction/EPC, infrastructure, trading/import-export, manufacturing, consulting, real estate. Later: technology, logistics, EV, agri/food, country representation. | §1.5 |
| R1.6 | Platform is **not** an escrow bank, lender, securities exchange, regulated investment intermediary or guarantor; principals only when named in signed agreements. | §1.6 |

## R2 — Operating model (§2, p.7–8)

| ID | Requirement | Ref |
|---|---|---|
| R2.1 | Four routes: **A** Unite-owned (Unite publishes; partners apply; Unite approves/signs) · **B** Partner-originated (client-approved requirement → timed Unite first review → verified tracking ID) · **C** Partner exchange (Unite declines/releases or excluded by consent → eligible partners bid; principals & fee disclosed) · **D** Joint execution (multi-partner workspace, NDA, team approval, agreements, milestones). | §2.1 |
| R2.2 | Opportunity lifecycle: DRAFT → SUBMITTED → CONSENT CHECK → DUPLICATE REVIEW → VERIFIED → UNITE PRIORITY REVIEW → ACCEPTED / RELEASED / REJECTED → QUALIFICATION → PROPOSAL → NEGOTIATION → AWARD / LOST → EXECUTION → MILESTONE CERTIFICATION → COMMERCIAL SETTLEMENT → CLOSED / DISPUTED. | §2.2 |
| R2.3 | Default first-review window **4 business hours**, configurable, not a guaranteed entitlement. | §2.3 |
| R2.4 | Exception workflows for urgent tenders, holidays, customer-restricted leads. | §2.3 |
| R2.5 | No release of buyer PII without sufficient authorization. | §2.3 |
| R2.6 | Duplicates decided on evidence, timestamps, relationship history — not first-click. | §2.3 |
| R2.7 | Escalate to category owner + central operations before auto-release. | §2.3 |
| R2.8 | Unite has an opportunity to participate, not a blanket legal claim. | §2.3 |
| R2.9 | Membership levels: Registered, Verified, Certified, Strategic, Country partner (access + commercial note per level). | §2.4 |
| R2.10 | Revenue: Unite margins; disclosed lawful third-party fees; enterprise sourcing/PM fees; optional tools. **No payments for recruiting partners; no implied guaranteed returns.** | §2.4 |
| R2.11 | GTM: 50–100 verified pilot orgs; 3 corridors (renewables/EPC, electrical sourcing, construction subcontracting); weekly clinics; reward delivery not volume; expand city/category then overseas. | §2.5 |
| R2.12 | North-star metrics: qualified opportunity value, conversion rate, active partner rate, lead decision time (business-hours median), commission dispute rate, realized platform revenue (excl. unearned GMV). | §2.6 |

## R3 — DPR (§3, p.10–11) — informational

Budget ₹63.2–115 lakh incl. 15% contingency (illustrative); modular monolith; INR currency; revenue scenarios are hypothetical (not forecasts); risk register (demand, supply, disputes, regulatory, scope creep, runway, data leakage); decision gates 0–5. Platform analytics must not double-count Unite principal margins with marketplace fees (§3.4).

## R4 — Roles & product rules (§4, p.14)

| ID | Requirement | Ref |
|---|---|---|
| R4.1 | Roles: Visitor; Individual partner; Company partner owner; Contractor/EPC; Trader/distributor; Consultant; Investor/funding associate; Unite business admin; Group super admin; Compliance/finance. | §4.1 |
| R4.2 | **Five mandatory trust capabilities**: Lead protection · Collaboration teams · Commission transparency · AI opportunity matching · Partner reputation (details per §4.2). | §4.2 |
| R4.3 | A registered lead has a stable identifier and immutable versioned status changes. | §4.3 |
| R4.4 | Only authenticated/authorized parties see restricted counterparties and attachments. | §4.3 |
| R4.5 | First-review timeout uses business calendars, pause reasons and event timestamps. | §4.3 |
| R4.6 | External routing blocked where buyer confidentiality disallows disclosure. | §4.3 |
| R4.7 | **A partner cannot approve their own KYC, deal award or commission payout.** | §4.3 |
| R4.8 | No commission becomes "earned" without a defined contractual trigger. | §4.3 |
| R4.9 | An organization can operate across multiple industries and regions with controlled roles. | §4.3 |
| R4.10 | AI outputs are reviewable, provenance-aware, and cannot change contractual/finance states alone. | §4.3 |
| R4.11 | NFRs: 99.5% pilot availability; P95 read < 500 ms; WCAG 2.2 AA; MFA for admins, RBAC/ABAC, encryption, audit logs; daily backups with RPO/RTO; English first + i18n foundation; tracing, structured logs, SLA alerts; consent, minimization, retention/deletion. | §4.4 |

## R5 — UI specification (§5, p.17–40; Atlas U01–U10)

| ID | Requirement |
|---|---|
| R5.1 | 165 principal screens, 16 families, IDs 001–165 preserved — see `docs/ui-screen-registry.md`. |
| R5.2 | Responsive web 1440 / 1024 / 768 px; mobile 390 / 360 px. |
| R5.3 | Every screen: list, empty, loading, disabled, error, success and permission-denied states. |
| R5.4 | Common acceptance: correct role can complete the primary action; unauthorized users cannot; understandable failure/empty states; audit events for consequential changes. |
| R5.5 | Atlas shell: navy top bar (Explore · Opportunities · My Business · Messages, avatar), left sidebar (Overview, Opportunities, My Leads, Collaborations, Financials, Resources, Settings), KPI cards, status stepper (Submitted → Reviewed → Approved → Completed), data table, functional-spec panel. |
| R5.6 | Atlas notes: "implement components as reusable React / React Native views; bind to APIs and approval workflows"; mockup values are illustrative sample data. |
| R5.7 | 30 screens are atlas "Mobile first" (011–022, 030, 042, 048, 050, 059, 088, 100, 108, 110, 116, 120, 143, 145, 147, 150, 163–165). Mobile adaptations for other screens must be designed with documented decisions (READ_ME guide item 7). |
| R5.8 | Screen QA standard (App. D): responsive layouts, labels, keyboard nav, validation, permissions, all states, data source, event logging, test ID, screenshots in repo. |

## R6 — Architecture (§6, p.42–43)

| ID | Requirement |
|---|---|
| R6.1 | Stack: Next.js/TypeScript/React web; React Native/Expo mobile with token parity; NestJS modular monolith, OpenAPI REST; PostgreSQL tenant-scoped; Postgres FTS initially; Redis + durable jobs; S3-compatible private storage with malware scans; OIDC/Keycloak with RBAC + context-aware permissions; central logs/traces/metrics; provider-agnostic AI with prompt versioning + PII redaction; containerized CI/CD with staging/prod isolation. |
| R6.2 | Domain modules: identity; organizations; group-companies; partner-compliance; catalog; customers; opportunities; routing; lead-protection; partner-matching; team-collaboration; tenders; proposals; contracts; projects; procurement; commissions; invoicing; notifications; chat; reputation; analytics; admin; audit; integrations. |
| R6.3 | Core entities and required fields (users, organizations, memberships, group_companies, partners, customers, opportunities, lead_claims, routing_events, collaboration_teams, tenders/bids, contracts, milestones, commission_rules, commission_ledger, reputation_events, audit_events). |
| R6.4 | API conventions (`/v1/...` examples); tenant context from validated identity claims only; authorization on every query/mutation; **idempotency keys** for payments, submissions, approvals; **optimistic locking** on material contract states. |
| R6.5 | No public URLs for contract attachments; encrypt sensitive columns & storage; audit document access; **append-only financial ledger**; explicit time zones & calendars; consortiums are agreements among named parties; separate draft AI from committed records; integrate Unite products via service tokens + outbox/events. |
| R6.6 | Integrations: Unite Group OS, SOLBID, SUNITE, LeadDNA, Powertek, Unite Exim, Socpost — each requires contract, API spec and data-sharing permission. |

## R7 — Security, governance & compliance (§7, p.45)

| ID | Requirement |
|---|---|
| R7.1 | MFA for admins and finance approvers; strong auth for all. |
| R7.2 | Least privilege, object-level permissions, cross-tenant access tests. |
| R7.3 | **Two-person approval** for awards and payouts over thresholds. |
| R7.4 | Consent management, export & deletion workflows with retention exceptions. |
| R7.5 | Attachment scanning, signed expiring download URLs, private storage. |
| R7.6 | Encryption in transit/at rest, key rotation, secrets manager. |
| R7.7 | Vulnerability scans, audit logging, backup-restore drills, incident playbooks. |
| R7.8 | Rate limiting, bot protection, anti-spam moderation, fraud case management. |
| R7.9 | Control documents: partner terms, lead registration agreement, NDA, collaboration/consortium agreement, commission addendum, marketplace terms, privacy policy, supplier/EPC agreements. |
| R7.10 | Compliance dependencies (DPDP, GST/TDS, e-signature validity, advertising claims, transfers/sanctions). **Finance advisory, securities, lending, insurance, payment custody modules stay disabled until legal review.** |
| R7.11 | Governance matrix: publish Unite opportunity (group company lead; admin review if restricted); release partner opportunity (routing owner; consent + SLA audit); accept KYB (compliance; no self-approval); award tender (authorized principal; signed award); approve commission (commercial owner + finance); resolve referral dispute (independent panel; evidence + appeal); delete restricted records (privacy/compliance; legal hold). |

## R8 — Delivery stages (§8–9, p.46–56)

Sixteen stages, each with scope, engineering specifics and acceptance gate (see `docs/development-status.md`). Stage exit standard: code, migrations, OpenAPI, role-based UI, sample data, positive/negative tests, security review, deployment instructions, README, CHANGELOG, "what remains" list. MVP = 01–07 + limited 12 & 16; pilot = 08–12 + 16; expanded = 13–15 + full 16.

Master prompt constraints: no earnings guarantees; no pay-for-recruiting; no auto-signing contracts; no auto-approval of finance/investment; maintain 001–165 registry with route, role permissions, backend dependencies, test reference and status.

## R9 — Testing, operations & launch (§10, p.57)

Test matrix: unit (transitions, fee calc, SLA business hours, duplicates); API integration (lead → Unite review → release/accept → apply → award → settle); authorization (cross-tenant, object leakage, forbidden approval, URL expiry); concurrency (duplicate opportunities, bid collision, idempotent settlement); security (OWASP, upload validation, CSRF/session, rate limits); accessibility; performance; DR (backup restore, migration rollback, incident drill); UAT personas. Pilot targets: 50–100 partners, 20–50 qualified opportunities, ≥90% SLA within window, ≥95% evidence completeness, 100% payout reconciliation, zero unresolved critical security defects.

## R10 — Appendices (p.77–78)

| ID | Requirement |
|---|---|
| R10.1 | Lead registration minimum fields: introducer & org (verified, authorized person); buyer (consent, org, disclosure scope); scope (industry, product/service, quantity/capacity, location, value); evidence (date, source, proof); commercial terms (protected period, fee trigger, rate/negotiation); routing (entity, SLA rule, timer, decision, release); audit (version, reviewers, conflict reasons, expiration). |
| R10.2 | Collaboration term sheet: parties/legal entities; scope; roles (origination, execution, procurement, finance, management); confidentiality/client ownership/publicity; exclusivity/timelines/termination; price/margin/fee method, milestones, invoicing; taxes/liability/quality/dispute forum; e-signatures and versioned annexures. |
| R10.3 | Backlog standard fields (story ID … released version). |
| R10.4 | Open decisions (legal principal, trademark/domain, capitalization, fee matrix, budget, countries, production integrations, final logo vector) — tracked in `docs/assumptions.md` as blockers. |

## R11 — Investor deck (§11, p.60–76) — informational

16-page narrative; hypothetical economics must be labelled; no invented valuation or funding ask. Not a software deliverable.
