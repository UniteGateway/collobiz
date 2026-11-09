# COLLABIZ V2.0 — API change plan

Existing endpoints keep their contracts. New endpoints follow the current conventions: `/v1` prefix, Zod validation, server-side authorisation, audit records, `{ message }` errors.

| Feature | Endpoints (new) |
|---|---|
| 02 Deal Passport | `GET /leads/:claimId/passport` (owner org, Unite reviewers, listed parties), `POST /leads/:claimId/passport/parties` (owner grants a party access, NDA required), `DELETE …/parties/:orgId`, `GET /public/passports/:code` (validity only, no confidential data) |
| 01 Team Builder | `POST /ai/team-plans` (opportunity, project or tender), `GET /ai/team-plans/:id`, `POST /ai/team-plans/:id/invites`, `POST /team-plan-invites/:id/respond`, `POST /ai/team-plans/:id/approve` (creates the team) |
| 03 Project Splitting | `GET/POST /projects/:id/packages`, `PATCH /projects/:id/packages/:pid`, `POST …/open`, `GET /packages` (open packages for eligible partners), `POST /packages/:pid/bids`, `POST /projects/:id/packages/:pid/award`, `POST …/progress` |
| 04 Tender Analyzer | `POST /tender-analyses` (PDF upload, optional tender id), `GET /tender-analyses/:id` (criteria + partner comparison + checklist), `POST /tender-analyses/:id/review` (authorised reviewer confirms) |
| 05 JV Builder | `GET/POST /teams/:id/contributions`, `GET/POST /teams/:id/agreements`, `POST /teams/:id/agreements/:aid/approve` |
| 06 Payment Assurance | `POST /projects/:id/invoices/:iid/receipts` (partial payment), `GET /finance/reconciliation`, overdue scan |
| 07 Radar | `GET /radar?region=&sector=` |
| 08 Capacity | `GET/POST /capacity/listings`, `POST /capacity/listings/:id/bookings`, `POST /capacity/bookings/:id/{accept,complete,review}` |
| 09 Voice | none server-side beyond `POST /ai/opportunity-draft` (text → structured draft) |
| 10 Resolution | `GET /admin/resolution`, `POST /admin/resolution/:kind/:id/assign` |
| 11 Country desks | `GET /global/desks/:country` |
| 12 Revenue intelligence | `GET /admin/analytics/revenue` |
