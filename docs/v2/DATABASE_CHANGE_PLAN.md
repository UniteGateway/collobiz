# COLLABIZ V2.0 — Database change plan

All changes are **additive** Drizzle migrations from `0026` onward: new tables, new nullable columns, widened check constraints. No drops, no renames, no rewrites of existing rows. Existing data stays valid.

| Feature | Migration | Tables / columns |
|---|---|---|
| 02 Deal Passport | 0026 | `deal_passports` (code `DP-YYYY-NNNNNN`, lead_claim_id unique, owner org, status, issued_at, revoked_at); `deal_passport_parties` (passport, organisation, role, granted_by, NDA hash) — access list. Everything else is read from existing tables. |
| 01 Team Builder | 0026 | `team_plans` (source = opportunity/project/tender, roles jsonb with responsibilities, gaps jsonb, status draft/approved); `team_plan_invites` (plan, role, organisation, status invited/accepted/declined/rejected). Approval creates a normal `teams` row. |
| 03 Project Splitting | 0026 | `work_packages` (project_id FK, code, category, title, scope, budget, eligibility jsonb, status draft/open/awarded/in_progress/completed/cancelled, awarded_org_id, awarded_value, progress); `work_package_bids` (package, organisation, amount, days, note, status). Budgets are never summed into project value. |
| 04 Tender Analyzer | 0026 | `tender_analyses` (tender_id nullable, file key, criteria jsonb with page/line references, status draft/reviewed, reviewed_by, reviewed_at). |
| 05 JV Builder | 0027 | `team_contributions` (team, organisation, kind financial/technical/resource, amount, description); `team_agreements` (team, kind nda/mou/jv/amendment, version, body hash, status draft/proposed/approved/signed, approvals jsonb). |
| 06 Payment Assurance | 0027 | `payment_receipts` (invoice_id, amount, received_at, reference, recorded_by) — partial payments; invoice `paid_amount` derived. |
| 08 Capacity Exchange | 0028 | `capacity_listings`, `capacity_bookings`, `capacity_reviews`. |
| 09 Voice | 0028 | none (drafts go to the existing opportunity tables after confirmation). |
| 10 Resolution | 0028 | `resolution_cases` (kind lead/commission/contract, source id, reviewer, status, decision), `resolution_events`. |
| 11, 12 | — | Read-only views over existing tables. |

Rollback: every migration only adds; reverting the application leaves the new tables unused.
