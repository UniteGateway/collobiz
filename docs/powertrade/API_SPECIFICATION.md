# API (all under `/v1`, behind `FEATURE_POWERTRADE`)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/powertrade/dashboard` | member | `joined:false` until a profile exists |
| GET / PUT | `/powertrade/profile` | member / owner, admin | interests, sharing consent |
| POST | `/powertrade/energy-needs` | owner, admin | appends a version |
| POST / DELETE | `/powertrade/business-contributions[/:id]` | owner, admin | delete = deactivate |
| POST | `/powertrade/power-scenarios/compare` | member | eligibility findings, landed cost, charge provenance, ranking by objective |
| GET | `/powertrade/matches/recommended` | member | rules; reasons, agreements, conditions, risks, missing info |
| POST | `/powertrade/matches/reverse` | member | parses plain words, then matches |
| GET / POST | `/powertrade/collaborations` | parties / owner, admin | Product-for-Power needs both supply and benefit; benefit ≤ supply |
| GET | `/powertrade/collaborations/:id` | parties, reviewers | history with names |
| POST | `/powertrade/collaborations/:id/transition` | parties; `approved` reviewers only | allowed moves only; approval needs accepted documents and cleared tax review; completion needs all documents |
| POST | `/powertrade/collaborations/:id/documents` | parties provide (with reference); reviewers accept/reject | |
| POST | `/powertrade/collaborations/:id/tax-review` | finance, compliance | |
| GET / POST | `/powertrade/benefits` | member / owner, admin | |
| POST | `/powertrade/benefits/from-commission/:entryId` | owner, admin | earned+ commissions only; once per entry |
| POST | `/powertrade/benefits/:id/verify` · `/collect` | finance | collect ≤ net; partial collections add up |
| POST | `/powertrade/allocations` · `/:id/decide` | owner, admin · finance | only collected, unallocated money |
| POST | `/powertrade/savings` · `/:id/verify` | owner, admin · finance | |
| GET | `/powertrade/finance/summary?period=YYYY-MM` | member | savings, sales (turnover), benefits by stage, allocations, net economic power expense |
| GET | `/admin/powertrade/overview` | reviewers, finance | sample records excluded from counts |
| GET | `/public/club/members/:slug` | public | adds `powertrade` section when shared |
