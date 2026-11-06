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
