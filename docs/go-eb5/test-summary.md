# GO EB5 — test summary

These results come from runs on 22 Nov 2026 in the development environment.

| Check | Command | Result |
|---|---|---|
| Shared rules (fees, permissions, lead validation, forbidden claims) | `packages/types: npx vitest run src/eb5.test.ts` | 5/5 passed |
| API journey and permission boundaries | `apps/api: npx jest --runInBand test/eb5.e2e.ts` | 8/8 passed |
| Browser journey (partner → public link → client application → counsel approvals → agreement signed and counter-signed → invoice → payment verified → portal) | `SUITE="GO EB5" scripts/e2e-run.sh` | 3/3 passed (journey plus no page errors on desktop and mobile) |
| Accessibility (axe), including 23 GO EB5 pages across partner, client, manager and compliance views | `node scripts/a11y-scan.mjs` | 92 pages, 0 violations |
| Web, API and type builds | `next build`, `nest build`, `tsc` | clean |

## What the API test proves
- The module is hidden from people without a role. Staff roles need two-step sign-in.
- Partner approval needs a signed partner agreement and an I-956K assessment. Reviewers cannot approve their own organisation.
- Consent is required. A duplicate prospect becomes an ownership claim and the existing owner is never revealed. A partner never sees contact details or another partner's lead.
- The client application validates fully only on submission. The photo is encrypted and served only to permitted users.
- Agreements cannot be legally approved, and invoices cannot be issued, until the counsel gates are recorded. The client's typed name must match. Billing cannot exceed the agreed fee.
- Only finance verifies payment, and not the person who issued the invoice. Verification makes the agreement Active and the lead "Consultancy Active".
- The investment ledger is tracking only, and clients see consultancy invoices only.
- Documents are encrypted and the referring partner cannot reach them. Every view and download is logged.
- Only the assigned attorney records attorney-verified updates. Clients see only verified updates.
- A project cannot go "offering" without verified evidence, and the person who submits evidence cannot verify it.
- Compensation stays disabled while its gate is closed.
- The dashboard shows real totals. The CSV export and the audit log work.

## Not tested or not built
- Mobile app screens (none yet)
- A licensed e-signature provider
- SMTP/SMS delivery (outbox only)
- S3 storage
- A production malware scanner
- Load and penetration testing
- Review by U.S. counsel of every text and template — required before use
