# Changelog

All notable changes to COLLABIZ. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); stages from Master Book §8.

## [Unreleased]

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
