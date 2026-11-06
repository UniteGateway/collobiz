# Assumptions, Decisions & Blockers

Running log of engineering decisions and assumptions made without asking (per instruction 8), plus blockers requiring human action (instruction 16). Append; do not rewrite history.

## Decisions (ADR-lite)

| # | Date | Decision | Rationale |
|---|---|---|---|
| D-01 | 2026-11-06 | pnpm workspaces monorepo: `apps/{api,web,admin,mobile}`, `packages/{types,ui,config}` exactly as Stage 01 prompt specifies. `node-linker=hoisted` for React Native compatibility. | Master Book §9 Stage 01 |
| D-02 | 2026-11-06 | **NestJS 11.2 (CommonJS)** rather than NestJS 12. | NestJS 12 is ESM-only (published Aug 2026); 11.2.x is maintained and works with Jest/SWC without ESM friction. Revisit at Stage 16. |
| D-03 | 2026-11-06 | **Drizzle ORM + drizzle-kit** SQL migrations (committed in `apps/api/drizzle`). | Pure-JS (no engine binary downloads), typed schema, reviewable SQL migrations. |
| D-04 | 2026-11-06 | TypeScript pinned to **5.9.x**. | TS 7 (native compiler) and 6.x tooling compatibility with Next/Jest/Expo is not yet assured. |
| D-05 | 2026-11-06 | Next.js **16.4** for web and admin; React **19.3.0** pinned monorepo-wide via pnpm overrides. | Expo SDK 58 requires React 19.3.0; a single React copy avoids hook/duplicate-instance errors. |
| D-06 | 2026-11-06 | Expo **SDK 58** (React Native 0.88, Expo Router). | Current SDK; required by brief (React Native/Expo). |
| D-07 | 2026-11-06 | Web auth: httpOnly `cz_at` access cookie + rotating refresh cookie + double-submit CSRF (`cz_csrf` cookie ↔ `X-CZ-CSRF` header), served same-origin via Next.js rewrite `/api/v1/* → API`. Mobile: Bearer tokens in SecureStore (Keychain/Keystore). | Keeps tokens out of JS on web; CSRF protection for cookie auth; native secure storage on mobile. |
| D-08 | 2026-11-06 | Local identity provider (scrypt password hashing, HS256 JWT, RFC 6238 TOTP) behind an adapter; `IDENTITY_PROVIDER=oidc` reserved for Keycloak/managed OIDC. | No external IdP credentials available; book permits "Managed OIDC or Keycloak". |
| D-09 | 2026-11-06 | Tenant context = active organization selected by `X-Org-Id`, **validated against DB memberships on every request**; platform roles (Unite Group) come from memberships in `platform`/`group_company` organizations. | §6.4 "tenant context from validated identity claims, never from untrusted client input alone". |
| D-10 | 2026-11-06 | Super admin intentionally lacks `commission.approve` and `payout.approve`; finance role holds them. | §7.1 two-person rule and §7.4 governance matrix. |
| D-11 | 2026-11-06 | All money stored as integer minor units (paise) with ISO currency code. | Avoid float rounding in commission/tax calculations. |
| D-12 | 2026-11-06 | Audit log is append-only and **hash-chained** (each row hashes the previous row's hash), serialized by a Postgres advisory lock; sensitive keys redacted. | §6.3 "before/after hash"; tamper evidence. |
| D-13 | 2026-11-06 | Stage→screen mapping and route plan for all 165 screens recorded in `packages/types/src/screens.ts` (single source for registry CSV/MD, navigation and access gating). | Instruction 3 and §9 registry requirement. |
| D-14 | 2026-11-06 | Mobile strategy: 30 atlas "mobile-first" screens + 16 key partner workflows get **native** Expo screens; remaining partner screens are **responsive web** at 390/360 px; admin portal (127–142) is desktop/tablet only. | Atlas provides no bespoke mobile rendition of every screen (READ_ME item 7); admin work is desk-based with MFA. |
| D-15 | 2026-11-06 | Brand tokens sampled from the approved logo: navy `#011E48` (wordmark), `#03325D` (mark), green `#55A444`, grey `#7A7A7B` (tagline). Raster logo used; final vector lockup pending (App. E). | Instruction 5. |
| D-16 | 2026-11-06 | Public marketing content (001–003, 007) is code-defined until the CMS (screen 142, Stage 15) exists. | Stage ordering. |
| D-17 | 2026-11-06 | AI matching uses a deterministic, explainable rules engine (`AI_PROVIDER=rules`); an LLM provider adapter is optional and never changes contractual/finance state. | §4.2, §4.3, §6.5; no API key provided. |

## Assumptions

| # | Assumption |
|---|---|
| A-01 | Default business calendar: Asia/Kolkata, Mon–Fri 09:00–18:00, configurable per group company with holidays. |
| A-02 | Default currency INR, locale en-IN; multi-currency representation added in Stage 15. |
| A-03 | Two-person approval threshold defaults to ₹5,00,000 (`DUAL_APPROVAL_THRESHOLD`), configurable. |
| A-04 | KYB document types follow Indian practice (PAN, GSTIN, incorporation certificate, address/identity proof, bank proof, MSME). International equivalents handled as `other` until Stage 15. |
| A-05 | Mock/illustrative values in the UI atlas (e.g. "₹ 3.8 Cr", "68%") are not used as real data; dashboards compute from the database. |
| A-06 | Group company names in seed data (e.g. "Unite Solar", "Powertek") come from the master book's integration list and atlas samples and are clearly marked demo data; legal entity codes are placeholders until confirmed (App. E). |

## Blockers requiring human action

| # | Blocker | Impact | Workaround in place |
|---|---|---|---|
| B-01 | Operating legal entity for COLLABIZ not confirmed (App. E). | Contract templates/invoices cannot name the real principal. | Configurable `group_companies` with placeholder legal entity codes. |
| B-02 | Trademark/domain `collabiz.co` not verified/acquired. | Production URLs, email sender domain. | Env-configurable URLs; no purchase made (instruction 15). |
| B-03 | No S3-compatible storage credentials. | Production document storage. | Private local-disk adapter with magic-byte validation, scan hook and signed URLs; S3 driver stub refuses to run without config. |
| B-04 | No SMTP/SMS provider credentials. | Real OTP/email delivery. | Transactional outbox table + log adapter; `DEV_EXPOSE_OTP` for local testing only (refused in production). |
| B-05 | No OIDC/Keycloak tenant. | Federated SSO. | Local identity adapter; OIDC config documented. |
| B-06 | No Expo/EAS account, Apple Developer or Google Play accounts. | Signed iOS/Android binaries and store submission. | `expo export` produces verified Android/iOS JS bundles; native projects generated via `expo prebuild`; EAS config documented. |
| B-07 | Unite Group OS / SOLBID / SUNITE / LeadDNA / Powertek / Unite Exim / Socpost API contracts unavailable. | Live integrations (Stage 15). | Mock adapters with contract tests. |
| B-08 | e-Sign provider and legal review of agreement templates (§7.2). | Legally binding e-signatures. | Local click-to-accept with typed name, timestamp, IP and document hash as evidence; flagged as non-final. |
| B-09 | Regulatory review for finance/investor modules (§7.3). | Screens 102, 103, 125 operate only as disabled/feature-flagged flows. | `FEATURE_INVESTOR_DATA_ROOM`, `FEATURE_FINANCE_INTRODUCTIONS` default false. |
| B-10 | Platform fee and sector commission matrix not approved (App. E). | Commission rules use configurable policies with demo rates only. | Commission policy configuration (screen 135). |
| B-11 | Production deployment requires explicit approval (instruction 15). | No production deploy performed. | Docker + deployment guide prepared. |
