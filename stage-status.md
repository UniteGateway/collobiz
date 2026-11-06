# Stage Status Log

Each entry lists exact files changed, commands executed, test results, remaining limitations and next-stage dependencies (Master Book §9 stage-closing rule). Newest last.

---

## Stage 01 — Repository foundation and design system ✅

**Acceptance gate:** web/mobile/admin boot; lint/types/tests green — **met** (evidence below).

### Delivered
- pnpm monorepo: `apps/{api,web,admin,mobile}`, `packages/{types,ui,config}`; shared tsconfig/ESLint; `.env.example`; CI workflow (`.github/workflows/ci.yml`); Docker images + `docker-compose.yml`.
- `packages/types`: roles → capabilities (two-person finance rule), 15 business state machines, shared Zod schemas, business rules (business-hours SLA timer, duplicate-lead scoring, commission calculator, explainable matching, reputation), 165-screen catalogue + status map, environment-agnostic API client.
- `packages/ui`: brand tokens sampled from the approved logo (shared with mobile; parity test), stylesheet matching the atlas shell, accessible components (AppShell, PageHeader, KPI, Stepper, DataTable, Timeline, forms with linked errors, Dialog, all data states incl. permission-denied), logo/mark/app-icon assets.
- `apps/api`: NestJS bootstrap (helmet, CORS, cookie parser, request IDs, OpenAPI `/docs`), global throttling, auth/tenant guard, Zod pipe, domain error filter, hash-chained audit service, idempotency interceptor, private storage + scan hook + signed URLs, mail outbox, health/meta/feature endpoints, public enquiries; Drizzle schema + migration `0000_stage01_02_core.sql`.
- `apps/web`: public site screens **001, 002, 003, 007, 010**, design-system preview (`/design-system`), live screen registry (`/registry`), partner shell with registry-driven navigation, screen access wrapper, session/API libraries (cookie + CSRF + refresh).
- `apps/admin`: admin shell (platform-role + MFA gating) and `/status` health page.
- `apps/mobile`: Expo Router app, SecureStore token handling, native design-system components, welcome screen.
- Docs: requirements index, UI screen registry (generated), architecture, assumptions/decisions/blockers, development status, this log, CHANGELOG, README.

### Commands & results (2026-11-06)
| Command | Result |
|---|---|
| `pnpm --filter @collabiz/types test` | 21/21 passed |
| `pnpm --filter @collabiz/ui test` | 25/25 passed |
| `pnpm --filter @collabiz/api test` | 13/13 passed (real Postgres `collabiz_test`) |
| `pnpm --filter @collabiz/mobile test` | 5/5 passed |
| `pnpm -r typecheck` / `pnpm -r lint` | clean |
| `pnpm --filter @collabiz/web build`, `… admin build` | success |
| `npx expo export --platform android` | Hermes bundle exported (3.3 MB) |
| Boot: API :4000, web :3000, admin :3001 | `/v1/health` ok (database ok, redis ok); web proxy `/api/v1/health` ok; all public pages 200 |
| `node scripts/e2e-smoke.mjs` (Playwright, 1440 & 390 px) | 12/12 passed |

### Limitations / what remains
- Public content is code-defined until CMS (Stage 15).
- Docker images defined but not yet built in CI (Stage 16 verification).
- iOS bundle export verified at Stage 02 close.

### Next-stage dependencies
Stage 02 needs: users/organizations/memberships schema (included in migration 0000), auth endpoints, login/registration UI for web, admin and mobile.

---

## Stage 02 — Identity, tenant permissions and security ✅

**Acceptance gate:** cross-org access tests pass — **met** (`apps/api/test/stage02.e2e.ts › tenant isolation`, 5 tests).

### Delivered
- API `identity` module: register, login (generic errors, 5-strike 15-min lockout, per-route rate limits), MFA challenge, rotating refresh tokens with family revocation on reuse, logout, `/auth/me`, email/SMS OTP (hashed, 10-min expiry, attempt limits), TOTP MFA setup/enable/disable (mandatory for admin roles), password change revoking all sessions, session list/revoke, team invitations (7-day token) and acceptance.
- Tenancy: active org via `X-Org-Id` validated against memberships each request; platform capabilities only with MFA-verified sessions; organization team management with object-level checks (404 across tenants), last-owner protection, no self role change; org-scoped activity feed.
- Admin: users & permissions (search, grant/revoke platform roles in Unite Group orgs only with reason, suspend/reactivate, no self-privilege changes), audit log browser with filters and before/after payloads, hash-chain verification, security summary.
- Seed: platform org, 3 Unite Group companies, 4 demo partner orgs, 11 users (admins MFA-enrolled) — `pnpm db:seed`.
- Web: 011 login/register with MFA step, 012 OTP verification, 145 security (QR enrolment, password, sessions), 144 team, invitation acceptance, 023 baseline dashboard. Admin: TOTP login, MFA enrolment, 129 users, 141 audit, security home. Mobile (native): 011, 012, 145, 023 baseline.
- `docs/api/openapi.json` (31 paths).

### Commands & results (2026-11-06)
| Command | Result |
|---|---|
| `pnpm --filter @collabiz/api test` | 39/39 passed (stage01 + stage02 + crypto) |
| `pnpm --filter @collabiz/mobile test` | 8/8 passed (incl. login MFA flow) |
| `pnpm --filter @collabiz/web test` / `admin test` | 7/7 · 6/6 |
| `pnpm -r lint`, `pnpm -r typecheck` | clean |
| `expo export --platform ios` / `android` | Hermes bundles exported (3.3 MB each) |
| `scripts/dev-restart.sh && node scripts/e2e-smoke.mjs` | 22/22 passed (desktop 1440 + mobile 390) |

### Security review (Stage 02 scope)
- Tokens: web tokens never exposed to JS (httpOnly); CSRF double-submit enforced for cookie-authenticated mutations; mobile uses SecureStore.
- JWT alg pinned to HS256; signature compared in constant time; secrets refused in production if defaults.
- Passwords: scrypt (N=16384); no password/secret values in audit payloads (redaction test).
- Enumeration: login errors generic; cross-tenant object access returns 404.

### Limitations / what remains
- OIDC/Keycloak adapter not implemented (B-05); local provider only.
- OTP delivery via outbox only (B-04). `DEV_EXPOSE_OTP` for local development.
- No "forgot password" flow yet — planned with real email delivery (backlog).
- Dashboard 023 is a baseline; KPIs arrive in Stage 05.

### Next-stage dependencies
Stage 03 builds org creation (013–015) on these identity primitives and uses the KYB state machine, private storage and audit service.

---

## Stage 03 — Onboarding and KYB ✅

**Acceptance gate:** verified / rejected / re-upload states complete — **met** (`apps/api/test/stage03.e2e.ts › admin verification queue`, plus browser journey 013→022→130).

### Delivered
- Schema/migration `0001_stage03_onboarding.sql`: partner profiles (capabilities, coverage, consent), KYB documents, review history, reviewer assignments, encrypted bank & tax profiles, versioned agreement templates with body hashes, acceptance evidence, risk flags, consent ledger, data-subject requests.
- API: onboarding steps 013–021 (profile locked while under review), private document upload with magic-byte/size/type validation and scan hook, signed expiring document URLs with audited access, idempotent submission, KYB state machine; admin queue (130) with claim, per-document review, decision with mandatory reason, no-self-review, blocking on unaccepted documents or open high-severity flags; risk centre (131) with automatic duplicate-GSTIN and screened-country flags and four-eyes clearing; privacy (149) consents, data export, 30-day data requests and admin resolution with legal hold; own profile (143).
- Web: wizard for 013–022 with progress navigation, 143, 149. Admin: 130 queue + dossier, 131 risk/data-rights. Mobile (native): 013, 014/015, 016–022, 143.
- Seed: agreement templates, partner profiles, bank details, documents and a submitted dossier (GreenBuild) for the queue.

### Defects found & fixed during verification
- Rejected KYB document did not re-open the "documents" step (partner could resubmit without re-uploading) — step now derived from live document state.
- Late-loading profile data overwrote user input on prefilled forms — forms render after data loads.
- Agreements whose text fits without scrolling could never be signed — read state now set when no scrolling is needed.
- Raw `ThrottlerException` shown to users — 429 mapped to a plain message; auth rate limit configurable (`AUTH_RATE_LIMIT`).
- Long hashes overflowed at 390 px — monospace text wraps.
- Plain-language validation messages shared by API and clients.

### Commands & results (2026-11-06)
| Command | Result |
|---|---|
| `pnpm --filter @collabiz/api test` | 57/57 passed |
| `pnpm --filter @collabiz/types test` | 22/22 passed |
| `pnpm --filter @collabiz/mobile test` | 10/10 passed |
| `node scripts/e2e-smoke.mjs` | 28/28 passed (desktop + 390 px) |
| lint / typecheck / web + admin builds | clean |

### Limitations / what remains
- Sanctions screening uses a placeholder country list; a licensed screening provider is needed before launch (§7.3).
- Bank account verification (penny-drop) requires a payments provider — bank details are marked verified on KYB approval only.
- Agreement texts are drafts pending legal review (B-08).
- Mobile document upload is verified by typecheck/bundle export only (device testing needs EAS/devices, B-06).

### Next-stage dependencies
Stage 04 uses group-company organizations (seeded) and verification/membership levels for price visibility.

---

## Launch-readiness audit (2026-11-06) — verdict: NO-GO (production and pilot)

Full report: [`docs/launch-readiness-report.md`](docs/launch-readiness-report.md). Summary: 25/165 screens verified; the five trust capabilities, routing, tenders, projects and commissions are not built (stages 04–16 outstanding). Audit fixes: multer high-severity advisory, runtime web→API proxy (container defect), WCAG AA contrast/ARIA, 413 handling, web CSP/HSTS, Swagger disabled in production, demo-seed production guard, backup file permissions, Docker CA support. Added backup/restore scripts (drill passed), deployment guide, production env template, EAS config, accessibility scanner.

Commands: 131 unit/integration tests pass · 28/28 browser journeys · `node scripts/a11y-scan.mjs` 0 violations on 12 pages · API + web Docker images built and run in production mode · Android/iOS bundles + `expo prebuild` OK · `pnpm audit --prod`: 0 high/critical.

---

## Stage 04 — Unite company catalogue and products ✅

**Acceptance gate:** controlled public/private catalogs — **met** (`apps/api/test/stage04.e2e.ts`: anonymous / unverified / verified / certified views, 404 on hidden items, own-company admin scoping).

- Migration `0002_stage04_catalog.sql`: `group_companies` (legal entity code separate from brand; SLA calendar fields for Stage 06), `business_units`, `catalog_items` (visibility public/partners/private, price visibility public/verified/certified/on-request, full-text index), `success_stories` (consent-gated).
- API: public group companies (004), catalogue search with FTS (005), item detail + price request (039), consented case studies (008); admin group companies & units (128, super admin), catalogue management scoped to the admin's own group company (136).
- Web 004/005/008/039; admin 128/136.
- Fixed latent bug: duplicate-key conflicts inside transactions returned 500 (wrapped driver error) — now 409 everywhere.
- Results: API 70/70 · browser 32/32 · lint/typecheck clean.
- Remaining: catalogue images/attachments (needs S3, B-03); enquiry desk lifecycle arrives with 088 (Stage 11).

---

## Stage 05 — Opportunity marketplace ✅

**Acceptance gate:** real listings and eligibility controls — **met** (`apps/api/test/stage05.e2e.ts`: audience-specific visibility, eligibility checks enforced on apply, publisher-only applicant review, no self-decision).

- Migration `0003_stage05_marketplace.sql`: `opportunities` (stable `OPP-YYYY-NNNNN` codes via sequence, route/source, version for optimistic locking, FTS index), immutable `opportunity_events`, applications (one active per org), saved opportunities/searches, notifications, RFQ requests.
- API: listing visibility (public / partners / verified-only exchange / owner), filters & FTS, categories, eligibility (verification, level, sector, certifications, coverage, capacity, open, own, duplicate), idempotent apply with eligibility snapshot, withdraw, publisher decisions, saved searches with alerts on publish, explainable consent-gated feed, dashboard KPIs, public RFQ into Unite review, public locations aggregate; admin route-A publishing scoped to own group company, close, versioned publish.
- Web: 006, 009, 023 (KPIs), 024, 025, 031–038, 040–042; admin opportunity publishing. Mobile (native): 023 KPIs, 031, 036 (+041 summary), 042.
- Fixed: arrays interpolated into raw SQL caused 500s on two endpoints.
- Results: API 80/80 · browser 39/39 · mobile 10/10 · lint/typecheck clean.
- Remaining: map uses a lightweight plot (no basemap tiles — a map provider would need a key); RFQ triage happens in Stage 06 routing queue.

---

## Stage 06 — Lead protection and Unite-first routing ✅

**Acceptance gate:** priority review and protection tests pass — **met** (`apps/api/test/stage06.e2e.ts`, 19 tests: registration → consent check → duplicate review → verification/protection → Unite first review with business-hours SLA → accept / release / reject / pause / resume / escalate; SLA breach escalation and policy-gated auto-release; duplicate rulings; disputes with appeal; certificates).

- Migration `0004_stage06_leads.sql`: customers (consent provenance), lead claims (sealed evidence snapshot + SHA-256, protection window, certificate code, optimistic version), lead documents, duplicate candidates, routing events (calendar, pauses, escalation), disputes + entries.
- Rules enforced: verified partners only; consent mandatory and not future-dated; duplicates ruled by independent compliance on evidence (other party never disclosed to partners); reviewers cannot route their own organization's lead; release lists on the partner exchange only with buyer consent; SLA breach escalates first, auto-release only if policy allows; dispute panel independent of both parties; appeals within 14 days to a different panelist; public certificate verification never reveals the customer.
- Web: 026, 043–051, 151–153 + public verify page; admin 132–134. Mobile (native): 026, 043 (single form), 048, 050, 051, 151.
- Fixed during verification: SLA times displayed in the viewer's browser zone instead of the calendar zone.
- Results: API 99/99 · browser 43/43 · WCAG scan 0 violations · mobile 10/10 · lint/typecheck clean.
- Remaining: the SLA sweep must be scheduled (cron / job runner) in deployment — endpoint `POST /v1/admin/routing/sweep`; lead timeline (054) arrives with CRM in Stage 07.

---

## Stage 07 — CRM and pipeline ✅ (MVP block 01–07 complete)

**Acceptance gate:** sales stage transitions and activity audit — **met** (`apps/api/test/stage07.e2e.ts`: versioned moves with optimistic locking, stage changes written to the append-only activity history and the hash-chained audit log, lost requires a reason, won/lost terminal, cross-tenant 404s).

- Migration `0005_stage07_crm.sql`: `crm_deals`, append-only `crm_activities`, `crm_tasks`. Customers reuse the Stage 06 consent-scoped table.
- Every registered lead now opens a CRM deal automatically; the lead timeline (054) merges opportunity status versions, Unite review events, documents, disputes and CRM activity.
- Web: 028 week calendar, 030 activity centre, 052 customer profile (+ customer list), 053 kanban with accessible move dialog, 054 timeline. Mobile (native): 030, 053.
- Results: API 106/106 · browser 45/45 · WCAG 0 violations · mobile 10/10 · lint/typecheck clean.

---

## Stage 08 — Partner matching and teams ✅

**Acceptance gate:** no private disclosure without permission — **met** (`apps/api/test/stage08.e2e.ts`, 9 tests + browser journey: invitees see only a teaser and the NDA; workspace, opportunity details and commercial terms unlock only after accept + NDA signature; revocation removes access immediately; outsiders get 404; directory exposes public profile fields only; matching excludes partners without consent).

- Migration `0006_stage08_teams.sql`: collaboration teams/consortiums (NDA text + hash, optimistic version), members (role, responsibilities, NDA evidence, revocation), versioned sharing proposals with per-member approvals, workspace posts.
- Team lifecycle uses the shared state machines: forming → nda_pending → proposal → approval_pending → active (dissolve at any point); activation requires ≥2 orgs, all NDAs, an approved 100% sharing proposal.
- Web: 055–064, 124, 154–156 (+ team hub, partner profile). Mobile (native): 059 with NDA signing.
- Results: API 115/115 · browser 47/47 · WCAG 0 violations · mobile 10/10 · lint/typecheck clean.
- Remaining: reputation score feeds matching once Stage 14 lands (currently "unrated" factor at neutral weight); team document uploads reuse S3 when configured (B-03).

## Stage 09 — Tender, RFQ and proposals ✅

**Acceptance gate:** sealed-bid boundaries and evaluator controls — **met** (`apps/api/test/stage09.e2e.ts`, 13 tests, plus 2 browser journeys).
- Sealed bids: both envelopes are AES-256-GCM encrypted at rest and committed with a SHA-256 seal at submission. Before opening, nobody can read bid content: not the issuer, not the evaluators, not platform admins. A sealed bid cannot be edited; the bidder must withdraw and resubmit before closing.
- Time-bound: tenders cannot be closed early. Submissions and withdrawals are refused after the closing time. Unsubmitted drafts lapse at closing. Publishing requires a closing time at least 1 hour away, at least one document, and both evaluator kinds.
- Opening ceremony: every seal is re-verified. A tampered bid blocks opening and writes a `tender.seal_violation` audit event. An evaluator who belongs to a bidding organization also blocks opening (conflict of interest).
- Staged disclosure: technical envelopes are revealed first. Commercial envelopes are revealed only after technical evaluation completes, and only for bids at or above the published pass mark. Technical-only evaluators never see prices, even in the comparison.
- Evaluator controls:
  - Evaluators must be members of the issuing organization.
  - Each evaluator scores only the envelope kind they are assigned, and only once.
  - Evaluator assignments freeze at opening.
  - Completing a phase requires every evaluator to have scored every bid.
- Negotiation (073): only the issuer and the shortlisted bidder see a thread. Only the bidder can revise the price; every revision is kept and audited. The award uses the latest price.
- Admin 137 shows metadata, counts, seal hashes and the audit trail only, never envelope content.

### Delivered
- Migration `0007_stage09_tenders.sql`: tenders, tender_documents, tender_evaluators, bids (encrypted envelopes, seal hash, partial unique active bid per org), bid_scores (unique per evaluator × kind), negotiation_messages.
- API: `TendersModule` (`apps/api/src/modules/tenders/tenders.controller.ts`):
  - Lifecycle: dashboard, draft/edit/publish, documents and addenda (with bidder notifications), evaluator committee, eligibility checks, bid draft/submit (idempotent)/withdraw, close, open.
  - Evaluation and award: technical and commercial scoring, technical completion, comparison, shortlist, negotiation, award (idempotent), cancel.
  - Admin endpoint: `/admin/tenders`.
- Seed: evaluator account `evaluator@collabiz.local` (Unite Solar, MFA) and demo tender `TND-2026-000001`.
- Web: 065 dashboard, 066 publish, 067 documents & eligibility & tender actions, 068 bid submission, 069 comparison/shortlist/award, 070 technical evaluation, 071 commercial evaluation, 073 negotiation.
- Admin: 137 tender administration.
- Mobile: no Stage 09 screen is registered as native; all are responsive web.
- Fixed in this stage:
  - `useQuery` (web and admin) reported "not loading" for one render when its path became available. This caused a crash on dependent pages; a settled-key guard now covers every page.
  - Smoke suites no longer depend on earlier runs' data (unique CRM note; saved-search cleanup for the 20-search cap).

### Commands & results (2026-11-06)
| Command | Result |
|---|---|
| `pnpm --filter @collabiz/api test` | 128/128 passed (10 suites) |
| `node scripts/e2e-smoke.mjs` | 50/50 passed (desktop 1440 + mobile 390) |
| `node scripts/a11y-scan.mjs` | 0 violations (now includes /tenders, /tenders/new, documents, bid) |
| `pnpm --filter @collabiz/mobile test` · types · ui | 10/10 · 22/22 · 28/28 |
| `pnpm -r --no-bail lint` / `typecheck` | clean |

### Remaining
- Closing is driven by the issuer clicking Close after the deadline. A scheduled auto-close sweep arrives with the Stage 16 job runner; admin 137 flags tenders that are past closing but not closed.
- AI proposal drafting (072) is Stage 14.
- The letter of award / contract follows in Stage 10 (074).
- Tender documents use local private storage until S3 is configured (B-03).

## Stage 10 — Contracts and document workflows ✅

**Acceptance gate:** an approved agreement version is immutable — **met**. Evidence: `apps/api/test/stage10.e2e.ts` (8 tests) and 2 browser journeys.
- A PostgreSQL trigger (`contract_versions_immutable`) rejects:
  - any `UPDATE` or `DELETE` of an approved version;
  - any change to the text, terms or number of a submitted version.
- The tests prove this with direct SQL as well as the API; the API maps the error to 409.
- Signatures are append-only (trigger `contract_signatures_append_only`).
- Each edit after a submission creates a new version. A rejected version stays on record with the reviewer's note.
- Approval is two-person: the approver needs approval rights in the issuing organization (`contract.approve` or `org.manage`) and must not be the version's author.
- Each signature binds to the approved version's SHA-256. The signer submits the hash they saw, and a mismatch is refused. The evidence recorded is typed name, designation, IP, user agent and timestamp. Signing requires an idempotency key.
- The counterparty never sees internal drafts. The contract only becomes visible to them once a version is approved; before that it returns 404 on every route.
- Amendments are new contracts that supersede the original only when executed, so the original stays in force until then. Termination is issuer-only, applies only to executed contracts, and requires a reason.

### Delivered
- Migration `0008_stage10_contracts.sql`: contracts, contract_versions and contract_signatures, plus the two integrity triggers.
- API: `ContractsModule` (`apps/api/src/modules/contracts/contracts.controller.ts`):
  - `GET /contracts`, `POST /tenders/:id/contracts` (LOI, work order or contract drafted from the award, including the negotiated price).
  - Draft, submit, review, sign, amend and terminate.
  - Text download with an `X-Content-SHA256` header.
  - `GET /vault`.
- Error filter: PostgreSQL integrity-trigger errors (`P0001`) map to 409 "This record is locked".
- Web: 074 award documents (new tender tab "Award & contracts") and 148 vault. The vault has tabs for contracts, platform agreements, KYB documents, team NDAs and lead certificates, and `?contract=` deep links from notifications. A shared `ContractPanel` drives the full workflow.
- Smoke runner: `SUITE` accepts `a|b` alternation. The Stage 10 contract journey continues from the tender awarded in the Stage 09 journey.

### Commands & results (2026-11-06)
| Command | Result |
|---|---|
| `pnpm --filter @collabiz/api test` | 136/136 passed (11 suites) |
| `node scripts/e2e-smoke.mjs` | 53/53 passed |
| `node scripts/a11y-scan.mjs` | 0 violations (includes /vault) |
| mobile · lint · typecheck | 10/10 · clean · clean |

### Remaining
- The templates are drafts marked "SUBJECT TO LEGAL REVIEW". Approved legal wording and a qualified e-signature provider (Aadhaar eSign / DSC) are still open (B-08); click-to-sign evidence is the interim mechanism.
- PDF rendering and S3 storage of executed copies wait on B-03; plain-text downloads with hashes are provided meanwhile.
- Single-admin partner organizations cannot approve their own contracts: approval always needs a second person. This is recorded as decision D-18.
