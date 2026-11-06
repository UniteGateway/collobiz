# Changelog

All notable changes to COLLABIZ. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); stages from Master Book §8.

## [Unreleased]

### Stage 08 — Partner matching & teams (2026-11-06)
- Partner directory, find partners, explainable consent-gated match suggestions, collaboration teams and consortiums with invitations, NDA signing, roles, versioned commercial sharing proposals, activation and NDA-gated workspace; screens 055–064, 124, 154–156 and native 059.

### Stage 07 — CRM & pipeline (2026-11-06)
- Customers, deals with versioned stage moves and activity audit, follow-up tasks with calendar, activity centre, lead conversion timeline; leads auto-open deals; screens 028, 030, 052–054 (web) and native 030/053.

### Stage 06 — Lead protection & Unite-first routing (2026-11-06)
- Protected lead registration with sealed evidence, consent checks, evidence-based duplicate review, 90-day protection, Unite-first review with business-hours SLA (pause/escalate/auto-release policy), consent-gated release to the partner exchange, verifiable certificates and ownership disputes with appeal; screens 026, 043–051, 132–134, 151–153 (web/admin) and native 026/043/048/050/051/151.

### Stage 05 — Opportunity marketplace (2026-11-06)
- Marketplace with audience-specific visibility, search, categories, map, eligibility, idempotent applications, saved searches with alerts, explainable recommendations, dashboard KPIs, public RFQs and Unite route-A publishing; screens 006, 009, 023–025, 031–038, 040–042 (web) and 023/031/036/042 (native).

### Stage 04 — Catalogue (2026-11-06)
- Group companies with legal entities, business units, catalogue with visibility and price-disclosure rules, success stories; screens 004, 005, 008, 039, 128, 136.
- Fixed: unique-constraint conflicts in transactions returned 500 instead of 409.

### Launch-readiness audit (2026-11-06)
#### Added
- `docs/launch-readiness-report.md` (verdict NO-GO), `docs/deployment.md`, `docs/runbooks/backup-restore.md`, `.env.production.example`, `apps/mobile/eas.json`, `infra/backup/{backup,restore}.sh`, `scripts/a11y-scan.mjs`.
#### Fixed / Security
- `multer` upgraded to 2.5.0 (high-severity DoS advisory).
- Web/admin `/api/v1` proxy now resolved at runtime (container images failed with 500).
- WCAG 2.2 AA: accessible muted-text and action-green tokens; invalid ARIA on homepage chips.
- Oversized bodies return 413; CSP + HSTS on web/admin; Swagger UI off in production; demo seed refuses production; backups written with mode 600; Docker builds accept a corporate CA.

### Stage 03 — Onboarding and KYB (2026-11-06)
#### Added
- Partner onboarding 013–022 (web + native), KYC/KYB private document upload with validation, scanning and signed links, encrypted bank & tax profile, agreement e-acceptance with evidence, idempotent submission.
- Admin verification queue and dossier (130), risk & compliance centre with automatic flags and four-eyes clearing (131), privacy & data rights (149), partner profile (143).
#### Fixed
- Resubmission possible after a document rejection; prefilled forms overwriting input; unsignable short agreements; raw rate-limit message; 390 px overflow of hashes.

### Stage 02 — Identity, tenant permissions and security (2026-11-06)
#### Added
- Registration, login with lockout and rate limiting, rotating refresh tokens with reuse detection, email/SMS OTP, TOTP MFA (mandatory for admins), password change, session management, team invitations.
- Tenant context validated against memberships; capability-based authorization; admin capabilities require MFA-verified sessions.
- Screens 011, 012, 129, 141, 144, 145 (web/admin) and native mobile 011, 012, 145; baseline 023.
- Admin user/role management with reasons and self-privilege protection; audit browser with hash-chain verification; security summary.
- Demo seed data; OpenAPI export (`docs/api/openapi.json`).

### Stage 01 — Repository foundation and design system (2026-11-06)
#### Added
- Monorepo (pnpm): API (NestJS 11), web + admin (Next.js 16), mobile (Expo SDK 58), shared `types`, `ui`, `config` packages.
- COLLABIZ design system: brand tokens from the approved logo, responsive stylesheet (1440/1024/768/390/360), accessible components with loading/empty/error/permission-denied states; token parity web ↔ mobile.
- Shared domain package: roles/capabilities, 15 state machines, Zod schemas, SLA business-hours calculator, duplicate scoring, commission calculator, explainable matching, reputation scoring, 165-screen catalogue.
- API foundation: auth/tenant guard, CSRF double-submit, throttling, hash-chained audit log, idempotency keys, private storage with signed URLs and scan hook, mail outbox, health/meta endpoints, OpenAPI.
- Public screens 001, 002, 003, 007, 010 (contact enquiries API); design-system preview; live screen registry.
- CI workflow, Docker images, docker-compose; Playwright smoke tests.
- Requirements index, architecture, assumptions/blockers, screen registry (CSV + Markdown).
