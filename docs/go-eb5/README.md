# GO EB5 — EB-5 consultancy module in COLLABIZ

**Public brand:** GO EB5  ·  **Contracting consultancy entity:** CITRUS360 LLC (USA)  ·  **Platform:** COLLABIZ (unchanged)

GO EB5 is a business vertical inside the existing COLLABIZ application. It handles:
- partner onboarding and protected referrals
- client applications
- consultations
- CITRUS360 consultancy agreements
- consultancy invoices
- secure documents and EB-5 case tracking
- project records, compliance and reporting

COLLABIZ coordinates and tracks this work. **It is not a law firm, gives no legal advice, never holds EB-5 investment capital and never pays automatic EB-5 referral compensation.**

## How it fits into COLLABIZ (what is reused, what is new)

| Need | Reused from COLLABIZ | New for GO EB5 |
|---|---|---|
| Sign-in, sessions, two-step sign-in | Existing identity and MFA | Staff roles require MFA (`eb5_roles`) |
| Organisations, partner businesses, KYB | Organisations, memberships, verification status | `eb5_partners` (compliance approval, I-956K status, partner agreement) |
| Feature flag | `feature_flags` table | Flag `go_eb5` (on in the demo seed only) |
| Notifications, email outbox | Notifications table, `MailService` outbox | — |
| Client accounts | Existing invitation flow (`/invite?token=`) | Client linked on the lead |
| Private file storage | `StorageService` (magic-byte checks, malware hook, private files) | Whole-file AES-256-GCM encryption (`putEncrypted`), permission-checked downloads, access log |
| Field encryption | `encryptField` | Lead contact details and application content encrypted |
| Audit | Hash-chained `audit_events` | `eb5.*` actions; no personal data in the log |
| Charts, design system, page frame | `@collabiz/ui`, `Screen`, chart kit | 34 screens, A4 print styles |

**Why GO EB5 leads are separate from business leads.** The COLLABIZ lead-protection engine was built for business-to-business opportunities. EB-5 prospects are individuals, and their data is sensitive. So GO EB5 keeps the same protection ideas and stores the data more strictly:
- first introduction wins, and the introduction is time-stamped
- duplicate checks run on contact details
- ownership disputes are decided by compliance
- contact details are encrypted
- emails and phone numbers are stored only as salted hashes for duplicate checks
- partners can never see another partner's prospect, or the details of their own

**Why the COLLABIZ commission engine is not used.** EB-5 promoter rules (Form I-956K) and possible securities-law issues (transaction-based pay) mean percentage commissions must not apply automatically. GO EB5 only keeps compliance records of compensation:
- it is disabled until counsel's approval is recorded
- each record needs a second compliance officer
- nothing is ever calculated or paid automatically

## Legal gates (all closed by default)

The gates are recorded in **GO EB5 → Settings** by a compliance officer or super admin, always with counsel's reference.

| Gate | What it unlocks |
|---|---|
| Fees and refund terms approved | With the template gate: agreements can be legally approved. With the invoicing gate: invoices can be issued. Changing the fee or percentage withdraws this approval automatically. |
| Agreement template approved | Agreements can move to "Legal Approved" (otherwise they carry a DRAFT banner) |
| Billing channel and invoicing approved | Consultancy invoices can be issued |
| Partner compensation approved | Compensation records can be approved (never paid automatically) |

**Proposed terms (configurable and not yet approved):**
- indicative EB-5 investment: USD 800,000 (paid to the project, not to COLLABIZ)
- consultancy fee: USD 200,000
- commencement payment: 10% (USD 20,000)
- balance: USD 180,000, at milestones to be agreed

## Money

Each money type has its own ledger, and ledgers are never added together:
- consultancy fees (CITRUS360 LLC)
- third-party legal fees
- government fees
- project administration fees
- referral compensation, only if authorised
- **EB-5 investment capital — tracking only**

Only consultancy invoices can be issued, and the client pays them through CITRUS360's own billing instructions. COLLABIZ shows no bank details, and no bank details are kept in the code.

The client reports their transfer reference. Finance then confirms cleared funds against the bank statement. Only after that is a receipt issued, the agreement made Active and the lead moved to "Consultancy Active". The person who issued an invoice cannot verify its payment.

## Workflows

- **Lead pipeline:** the lead pipeline has 16 stages.
  - "Agreement Signed", "Commencement Payment Verified" and "Consultancy Active" follow the records (signature and verified payment) and cannot be clicked.
  - Consultation, proposal and application events raise the stage automatically.
- **Agreement:**
  1. Draft
  2. Internal Review
  3. Legal Approved (compliance only; needs the gates; the drafter cannot approve)
  4. Sent to Client
  5. Viewed
  6. Signed: the client types their exact full name and gives consent, and the agreement text's SHA-256 fingerprint, the time and the IP address are recorded.
  7. Counter-Signed (CITRUS360 admin)
  8. Active (after the verified commencement payment)
  9. Terminated (with a reason)
- **Case tracking:** each update records its source: client-reported, internal administrative, attorney-verified (only the assigned attorney) or document-supported (only with an accepted document). Clients see only attorney-verified and document-supported updates. Processing times, approvals and returns are never predicted.
- **Projects:** each project is recorded as *proposed*. Five claims must each have evidence submitted and then verified by a different compliance officer before a project can be marked "offering": TEA, business plan, economic report, I-956F and offering documents. The **Texas Solar + BESS** project is seeded as PROPOSED ONLY.
- **Wording:** the shared rule `EB5_FORBIDDEN_CLAIMS` flags promises of visas, approvals or returns. Every client-facing screen shows the "not a law firm, nothing promised" notice.

## Screens (34)

| Area | Screens |
|---|---|
| Dashboard and configuration | `/eb5`, `/eb5/settings`, `/eb5/roles` |
| Partners | `/eb5/partners`, `/eb5/partners/apply`, `/eb5/partners/[id]`, `/eb5/partner` |
| Leads | `/eb5/leads`, `/eb5/leads/new`, `/eb5/leads/[id]`, public `/go-eb5/[token]`, `/eb5/disputes` |
| Applications | `/eb5/apply`, `/eb5/applications`, `/eb5/applications/[id]`, `/eb5/applications/[id]/print` |
| Agreements | `/eb5/agreements`, `/eb5/agreements/[id]`, `/eb5/agreements/[id]/print` |
| Invoices | `/eb5/invoices`, `/eb5/invoices/[id]`, `/eb5/invoices/[id]/receipt` |
| Documents and case tracking | `/eb5/documents`, `/eb5/documents/[id]`, `/eb5/cases`, `/eb5/cases/[id]` |
| Appointments and follow-ups | `/eb5/consultations`, `/eb5/tasks` |
| Compliance | `/eb5/compliance`, `/eb5/audit` |
| Reports | `/eb5/reports` (CSV export, print to PDF) |
| Projects | `/eb5/projects`, `/eb5/projects/[id]` |
| Client portal | `/eb5/portal` |

The menu shows GO EB5 only to people the API says may see it, and the menu items follow their role. PDFs come from print-ready A4 pages saved through the browser ("Print / save as PDF"). No server-side PDF generator was added.

## API

All routes are under `/v1/eb5/…`:
- controllers: `apps/api/src/modules/eb5/` (`core`, `leads`, `engagement`, `records`)
- access layer: `access.ts`
- schema: `apps/api/src/db/schema/eb5.ts`
- migration: `0051_go_eb5.sql` (additive only: new tables, no changes to existing ones)
- shared rules: `packages/types/src/eb5.ts`

See also: [permission-matrix.md](permission-matrix.md) · [deployment-checklist.md](deployment-checklist.md) · [rollback.md](rollback.md) · [test-summary.md](test-summary.md)

## Application form, agreement and microsite (update)

- The client application follows the **GO EB5 Preliminary Consultancy Application** PDF, sections A–J. The A4 print view adds section K (office use). The form component is `apps/web/components/Eb5ApplicationForm.tsx`; the schema is `Eb5ApplicationSchema`.
- The public online application is at `/go-eb5/apply`. It uses the same form, a honeypot field and a rate limit.
- The agreement body follows the **Consultancy Engagement Agreement legal draft** (sections 1–13 and Schedules A–C). While the template is not approved it carries a "LEGAL DRAFT — NOT FOR EXECUTION" banner.
- These fields in Settings fill the draft's blanks: entity, jurisdiction, address, email, governing law, dispute forum and summary days. Changing any of them withdraws the template approval.
- Microsite hook-up: see [microsite-integration.md](microsite-integration.md).
