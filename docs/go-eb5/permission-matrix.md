# GO EB5 role–permission matrix

Generated from `EB5_PERMISSIONS` in `packages/types/src/eb5.ts` — the same table the API enforces. Staff roles work only with two-step sign-in. Partners get their role from an approved `eb5_partners` record; clients from being the linked client on a lead.

| Permission | COLLABIZ Super Admin | CITRUS360 Company Admin | GO EB5 Business Manager | Business Development Partner | Referral Consultant | Immigration Consultant | U.S. Immigration Attorney | Regional Center Representative | Finance Executive | Compliance Officer | Client / Investor |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `module.configure` | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| `roles.assign` | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| `legal.approve` | ✓ |  |  |  |  |  |  |  |  | ✓ |  |
| `lead.view_all` | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  | ✓ |  |
| `lead.manage` | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| `lead.introduce` |  | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `partner.review` | ✓ | ✓ |  |  |  |  |  |  |  | ✓ |  |
| `application.review` | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| `consultation.manage` | ✓ | ✓ | ✓ |  |  | ✓ | ✓ |  |  |  |  |
| `agreement.draft` | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| `agreement.countersign` |  | ✓ |  |  |  |  |  |  |  |  |  |
| `invoice.issue` |  | ✓ |  |  |  |  |  |  | ✓ |  |  |
| `payment.verify` |  |  |  |  |  |  |  |  | ✓ |  |  |
| `document.request` | ✓ | ✓ | ✓ |  |  | ✓ | ✓ |  |  |  |  |
| `document.view_private` |  | ✓ | ✓ |  |  | ✓ | ✓ |  |  | ✓ |  |
| `case.record` |  | ✓ | ✓ |  |  | ✓ | ✓ |  |  |  |  |
| `case.attorney_verify` |  |  |  |  |  |  | ✓ |  |  |  |  |
| `project.manage` | ✓ | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| `reports.view` | ✓ | ✓ | ✓ |  |  |  |  |  | ✓ | ✓ |  |
| `audit.view` | ✓ |  |  |  |  |  |  |  |  | ✓ |  |
| `compensation.record` |  |  |  |  |  |  |  |  |  | ✓ |  |

Additional rules enforced in the API:
- A partner sees only leads it introduced, with a general status — never contact details, applications, documents, agreements or payments.
- A client sees only their own lead, application, agreement once sent, consultancy invoices and documents.
- An attorney sees only leads and cases assigned to them; only the assigned attorney can record an attorney-verified case status.
- Separation of duties: the drafter of an agreement cannot legally approve it; the issuer of an invoice cannot verify its payment; a compensation record needs a second compliance officer; evidence for a project claim must be verified by someone other than the submitter; compliance cannot review its own organisation.
