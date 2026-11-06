# COLLABIZ Architecture

Implements Master Book §6 (architecture), §7 (security) and the Stage 01 repository prompt. Decisions are logged in `docs/assumptions.md`.

## System overview

```
                 ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
  Partners ───▶  │ apps/web  (Next.js)  │   │ apps/admin (Next.js) │   │ apps/mobile (Expo)   │ ◀── Partners on iOS/Android
  Visitors       │ public site + portal │   │ Unite Group portal   │   │ native screens       │
                 └─────────┬────────────┘   └──────────┬───────────┘   └──────────┬───────────┘
                           │ same-origin /api/v1 rewrite (cookies + CSRF)          │ Bearer token (SecureStore)
                           └───────────────┬───────────┘                           │
                                           ▼                                       ▼
                         ┌───────────────────────────────────────────────────────────────┐
                         │ apps/api — NestJS modular monolith, OpenAPI REST under /v1      │
                         │ Guards: Throttler → Auth/Tenant (memberships, MFA, capabilities) │
                         │ Interceptors: Idempotency-Key · Filter: domain error mapping    │
                         │ Modules: identity · organizations · onboarding/compliance ·     │
                         │ catalog · opportunities · routing · lead-protection · CRM ·     │
                         │ teams · tenders · contracts · projects · procurement ·          │
                         │ commissions · invoicing · chat · notifications · reputation ·   │
                         │ learning · international · analytics · audit · cms · AI         │
                         └──────┬──────────────┬───────────────┬─────────────┬────────────┘
                                ▼              ▼               ▼             ▼
                          PostgreSQL 16     Redis 7     Private object   Outbox (email/SMS/
                          (Drizzle SQL      (rate/cache  storage + scan   integration events)
                          migrations)       /jobs)       + signed URLs
```

## Repository layout

| Path | Purpose |
|---|---|
| `apps/api` | NestJS 11 API. `src/db/schema/*` Drizzle schema, `drizzle/` SQL migrations, `src/modules/*` domain modules, `src/common/*` cross-cutting (auth guard, audit, idempotency, adapters, crypto), `test/*.e2e.ts` integration tests against real Postgres. |
| `apps/web` | Next.js 16 App Router. `(public)` route group = public site (screens 001–010); `(app)` = authenticated partner portal with registry-driven navigation. |
| `apps/admin` | Next.js 16 Unite Group administration portal (screens 127–142 and review queues). |
| `apps/mobile` | Expo SDK 58 / Expo Router app. Native screens for mobile-first workflows. |
| `packages/types` | Shared domain: roles & capabilities, **state machines**, Zod request schemas, business rules (SLA calendar, duplicate scoring, commission calculation, explainable matching, reputation), 165-screen catalogue, API client. Compiled to CommonJS. |
| `packages/ui` | Design tokens (shared with mobile), CSS, accessible React components. |
| `packages/config` | tsconfig bases and ESLint flat config. |
| `scripts` | Registry generator, Playwright UI smoke tests. |
| `infra/docker` | Container images; `docker-compose.yml` at root. |

## Identity, tenancy and authorization (Stage 02)

* **Organizations** are tenants. Types: `platform` (COLLABIZ operations / Unite Group holding), `group_company` (Unite Group legal entities), `partner_company`, `partner_individual`.
* **Memberships** link users to organizations with a role. Partner roles: `org_owner`, `org_admin`, `org_member`. Platform roles: `super_admin`, `unite_admin`, `compliance`, `finance`, `routing_owner`, `moderator`.
* **Capabilities** (`packages/types/src/roles.ts`) are what endpoints require (`@RequireCaps`). Roles map to capabilities.
* **Active tenant** = `X-Org-Id` header, verified against memberships on each request (never trusted alone). Every query on tenant data filters by `ctx.orgId` or an explicit object-level check (owner org, team membership, evaluator assignment…).
* **Platform capabilities** are granted only if MFA is enrolled *and* the session was established with a TOTP code.
* Separation of duties is enforced in services: no self-approval of KYB, awards or payouts (§4.3); finance approvals over the threshold require two distinct approvers (§7.1).

## Data & integrity rules

* Money: integer minor units + ISO currency.
* State changes go through `assertTransition` with the shared state machines; illegal transitions return `409 InvalidTransition`.
* Material records carry a `version` column for optimistic locking (`If-Match`-style `expectedVersion` in request bodies).
* Financial movements are **append-only ledger entries**; balances are derived.
* Audit log: append-only, hash-chained, redacts secrets, records actor, tenant, object, before/after hashes, IP and request ID. Chain verification endpoint for admins.
* Sensitive columns (bank account numbers, MFA secrets) encrypted with AES-256-GCM (`FIELD_ENCRYPTION_KEY`).
* Documents: magic-byte type validation, size limits, scan hook, private storage, short-lived HMAC-signed download URLs; access is audited.

## Adapters (credential-free local defaults)

| Concern | Env | Local adapter | Production adapter |
|---|---|---|---|
| Identity | `IDENTITY_PROVIDER` | scrypt + HS256 JWT + TOTP | OIDC / Keycloak (B-05) |
| Storage | `STORAGE_DRIVER` | private disk, 0600 files | S3-compatible (B-03) |
| Email/SMS | `MAIL_DRIVER` | outbox table + log | SMTP / SMS gateway (B-04) |
| AI | `AI_PROVIDER` | deterministic explainable rules | LLM provider w/ PII redaction (draft-only) |
| e-Sign | `ESIGN_PROVIDER` | click-to-accept evidence (typed name, IP, time, doc hash) | e-sign vendor (B-08) |
| Meetings | `MEETING_PROVIDER` | room link + attendance records | video vendor |
| Group integrations | — | mock connectors + contract tests | Unite OS, SOLBID, LeadDNA, Powertek, Socpost, Unite Exim (B-07) |

## API conventions

* Base path `/v1`, OpenAPI UI at `/docs`, JSON export at `docs/api/openapi.json` (`pnpm --filter @collabiz/api openapi`).
* Errors: `{ statusCode, error, message, issues?[] }`; validation issues carry field paths used by forms.
* `Idempotency-Key` required on payments, submissions and approvals; replays return the original response with `Idempotent-Replay: true`.
* Rate limiting via `@nestjs/throttler` (stricter on public and auth endpoints).

## Mobile

Expo Router file-based routes in `apps/mobile/app`. Tokens imported from `@collabiz/ui/tokens` (parity tested). Tokens stored in SecureStore. API base from `EXPO_PUBLIC_API_URL`. Verified by Jest (jest-expo) and `expo export` for Android & iOS bundles.
