# Changelog

All notable changes to COLLABIZ. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); stages from Master Book §8.

## [Unreleased]

### Stage 01 — Repository foundation and design system (2026-11-06)
#### Added
- Monorepo (pnpm): API (NestJS 11), web + admin (Next.js 16), mobile (Expo SDK 58), shared `types`, `ui`, `config` packages.
- COLLABIZ design system: brand tokens from the approved logo, responsive stylesheet (1440/1024/768/390/360), accessible components with loading/empty/error/permission-denied states; token parity web ↔ mobile.
- Shared domain package: roles/capabilities, 15 state machines, Zod schemas, SLA business-hours calculator, duplicate scoring, commission calculator, explainable matching, reputation scoring, 165-screen catalogue.
- API foundation: auth/tenant guard, CSRF double-submit, throttling, hash-chained audit log, idempotency keys, private storage with signed URLs and scan hook, mail outbox, health/meta endpoints, OpenAPI.
- Public screens 001, 002, 003, 007, 010 (contact enquiries API); design-system preview; live screen registry.
- CI workflow, Docker images, docker-compose; Playwright smoke tests.
- Requirements index, architecture, assumptions/blockers, screen registry (CSV + Markdown).
