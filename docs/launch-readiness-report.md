# COLLABIZ — Launch-Readiness Audit

**Audit date:** 2026-11-06 · **Commit audited:** branch `claude/collabiz-platform-build` (Stage 03 + audit fixes) · **Auditor:** automated audit run in a sandbox; every result below comes from a command executed during the audit.

## Verdict

| Decision | Result |
|---|---|
| Production launch | **NO-GO** |
| Controlled pilot (Master Book §8: stages 01–07 + limited 12 + 16) | **NO-GO** — stages 04–07, 12 and 16 are not built |
| Internal demo / UAT of onboarding & KYB on staging | **Ready**, subject to human approval and B-03/B-04 if real partners take part |

What exists is a well-tested foundation: identity and security, tenant isolation, partner onboarding and KYB verification. **The core of the product — Unite-first routing, protected leads, collaboration teams, tenders and projects, the commission ledger, AI matching and reputation — has not been built.** Only their underlying business rules exist as unit-tested library code. A pilot must not start until at least stages 04–07 (catalogue, marketplace, lead protection with routing, CRM) and the limited commission scope of stage 12 pass their acceptance gates.

---

## 1. Implemented and verified functionality

### 1.1 Screen coverage (all 165)

| Status | Count | Screens |
|---|---|---|
| Verified (automated tests pass) | **25** | 001, 002, 003, 007, 010 · 011, 012, 129, 141, 144, 145 · 013–022, 130, 131, 143, 149 |
| Scaffolded | 1 | 023 (baseline dashboard; KPIs pending) |
| Not implemented | **139** | 004–006, 008, 009, 024–122, 123–128, 132–140, 142, 146–148, 150–165 |

Per-screen detail: `docs/ui-screen-registry.md` / `screen-registry.csv`.

### 1.2 Audit areas

| Area | Result | Evidence |
|---|---|---|
| All 165 screens | ❌ **15% complete** (25 verified) | Registry |
| Web functionality | ✅ for implemented scope | 28/28 Playwright journeys at 1440 px and 390 px (register → OTP → onboarding → upload KYB → submit → admin verifies; team invites; MFA; privacy); 0 uncaught page errors |
| Android & iOS | ⚠️ Partial | 10/10 Jest tests (login MFA flow, KYB status); Hermes bundles export for Android (3.3 MB) and iOS (3.4 MB); `expo prebuild` generates both native projects (`group.unite.collabiz`); expo-doctor 18/20 (2 checks need network). **No compiled binary, no device testing** (no SDK/Xcode, Android SDK host blocked, no EAS account — B-06). Native screens: 001, 011–022, 023, 143, 145 |
| Database integrity | ✅ | Fresh migration from empty DB; `drizzle-kit` reports no schema drift; 20 tables, 23 foreign keys, 0 orphaned memberships; unique constraints on email, memberships, agreement acceptances |
| Authentication & authorization | ✅ | 26 identity tests: lockout, rate limit, refresh-token rotation with reuse detection, CSRF, TOTP MFA required for admin capabilities, no self-privilege changes, suspension effective immediately |
| Company-level data isolation | ✅ for implemented modules | Cross-tenant `X-Org-Id` → 403; foreign membership/document IDs → 404 (no enumeration); scoped activity feeds. Future modules need their own isolation tests |
| Unite-first opportunity routing | ❌ Not implemented (Stage 06) | Only the business-hours SLA calculator exists (6 unit tests incl. holidays, weekends, pauses) |
| Lead protection & disputes | ❌ Not implemented (Stage 06) | Only duplicate-scoring and lead-claim/dispute state machines (unit-tested) |
| Collaboration teams | ❌ Not implemented (Stage 08) | Team state machines only. (Screen 144 is company staff management, not collaboration teams) |
| Tender & project workflows | ❌ Not implemented (Stages 09–11) | State machines only |
| Contractual commission tracking | ❌ Not implemented (Stage 12) | Calculator (percent/flat/tiered, deductions, GST/TDS, integer paise) and state machine that blocks paying unearned commissions — unit-tested only. No ledger, approvals or payouts |
| AI opportunity recommendations | ❌ Not implemented (Stage 14) | Explainable scoring engine with consent/verification gates — unit-tested only. Matching consent is captured (018/149) |
| Partner reputation | ❌ Not implemented (Stage 14) | Scoring library only (sample-size shrinkage, excludes appealed events) |
| Document storage & privacy | ✅ locally / ❌ production storage | Magic-byte validation, 15 MB limit, EICAR scan hook, private files (0600), HMAC-signed 5-minute URLs, audited access, cross-tenant 404; AES-256-GCM for bank account & PAN, masked in all responses and audit logs; consent ledger, data export, 30-day data requests. S3 not configured (B-03); no real antivirus |
| Security controls | ⚠️ See §4 | Helmet + CSP/HSTS on API; CSP/HSTS/X-Frame-Options on web & admin (added in this audit); CORS allow-list verified; production refuses dev secrets; demo seed refuses production |
| Error handling & recovery | ✅ | Consistent JSON errors, no stack traces; 409 for illegal state transitions; 413 for oversized bodies (fixed in this audit); friendly 429; 502 from web proxy when API is down; idempotent submissions/decisions with replay |
| API documentation | ✅ | OpenAPI 3 at `docs/api/openapi.json` (60 paths); Swagger UI in non-production only (`EXPOSE_API_DOCS`) |
| Deployment configuration | ⚠️ | API and web images built and run in production mode; `.env.production.example`; `docs/deployment.md`; `eas.json`. Not deployed; no infrastructure-as-code, TLS, DNS or monitoring yet |
| Automated testing | ✅ | **131 unit/integration tests** (API 58 on real PostgreSQL, types 22, UI 28, web 7, admin 6, mobile 10) + **28 browser journeys** + **WCAG 2.2 AA scan of 12 pages: 0 violations**; lint & typecheck clean; CI workflow defined (not yet run on GitHub) |
| Backup & restore | ✅ drill passed | `infra/backup/backup.sh` / `restore.sh`: checksums verified, identical row counts on all tables, audit hash chain intact on the restored DB (453 events), 78 documents restored. Scheduling/off-site copies not configured |

### 1.3 Defects found and fixed during this audit

| # | Severity | Defect | Fix |
|---|---|---|---|
| A-1 | High | Runtime dependency `multer` <2.5.0 — denial of service via pending async file (GHSA, high) on the upload endpoint | Pinned `multer@^2.5.0`; tests pass |
| A-2 | High | Web/admin containers ignored runtime `API_INTERNAL_URL` (Next.js rewrites are fixed at build time) → every `/api/v1` call failed with 500 in the container | Replaced with a runtime proxy route; verified in the container and by 28/28 browser journeys |
| A-3 | High | WCAG AA contrast failures on every page (muted text 4.29:1, white on brand green 3.1:1) and invalid ARIA on homepage chips | Accessible text/action tokens (5.9:1, 5.1:1); brand colours kept for logo/graphics; 0 violations |
| A-4 | Medium | Oversized request bodies returned 500 and were logged as incidents | Mapped to 413/400; regression test |
| A-5 | Medium | Web and admin sent no Content-Security-Policy or HSTS | Added; no regressions |
| A-6 | Medium | Swagger UI publicly served in production | Disabled by default in production |
| A-7 | Medium | Demo seed (published password + TOTP secret) could be loaded into production | Seed refuses `NODE_ENV=production` |
| A-8 | Low | Backup files world-readable (0644) | `umask 077` |
| A-9 | Low | Test teardown masked the real cause when the database was down | Guarded teardown |
| A-10 | Low | Docker builds failed behind TLS-intercepting proxies | Optional CA build secret |

---

## 2. Outstanding defects

| # | Severity | Defect | Blocks |
|---|---|---|---|
| D-1 | **Critical** | 139 of 165 screens not implemented, including all five mandatory trust capabilities | Pilot & production |
| D-2 | High | No password-reset ("forgot password") flow; a locked-out or forgetful user needs an administrator | Pilot |
| D-3 | High | Mobile app never run on a physical device or simulator; native document upload untested on devices | Mobile pilot |
| D-4 | High | No central logging, metrics, alerting or error tracking | Pilot |
| D-5 | Medium | Rate limiting uses in-memory storage — limits are per instance, not global | Multi-instance deploy |
| D-6 | Medium | Screen 150 (help, feedback, account closure) not built — app stores require an in-app account-deletion path | Store submission |
| D-7 | Medium | Partner dashboard (023) is a baseline without business KPIs | Pilot UX |
| D-8 | Low | 4 moderate + 1 low advisories in build/test tooling only (Expo CLI `glob`/`minimatch`, Jest `deepmerge`); not in runtime code | Track upstream |
| D-9 | Low | Web CSP allows `'unsafe-inline'` scripts (Next.js bootstrap); nonce-based CSP recommended | Hardening |
| D-10 | Low | CI workflow has never run on GitHub Actions | Verify on first push to PR |

---

## 3. Unconfigured integrations

| Integration | Current adapter | Needed for | Blocker |
|---|---|---|---|
| Object storage (S3-compatible) + antivirus | Local private disk, EICAR test signature only | Pilot | B-03 |
| Email & SMS delivery (OTP, notifications) | Database outbox + log — **users receive no codes** | Pilot | B-04 |
| OIDC / Keycloak SSO | Local identity provider | Optional for pilot | B-05 |
| Expo/EAS, Apple Developer, Google Play | None | Mobile distribution | B-06 |
| Unite Group OS, SOLBID, SUNITE, LeadDNA, Powertek, Unite Exim, Socpost | Not built (Stage 15) | Expanded release | B-07 |
| e-Signature provider | Click-to-accept with evidence | Legally binding agreements | B-08 |
| Sanctions/KYB screening provider | Placeholder country list | Pilot compliance | §7.3 |
| Bank account verification (penny-drop) | None | Payouts (Stage 12) | — |
| Payments/settlement rails | None (no stored-value wallet by design) | Stage 12 | — |
| LLM provider for AI drafting | Deterministic rules engine | Optional | — |
| Video meetings | Not built (Stage 13) | Expanded release | — |

---

## 4. Security or compliance blockers

1. **Legal entity not confirmed (B-01).** Agreements, invoices and the privacy notice cannot name the data controller or contracting principal.
2. **Agreement templates are unreviewed drafts (B-08, §7.2).** Partner terms, lead registration agreement and privacy notice need counsel sign-off before real partners accept them.
3. **DPDP Act compliance review (§7.3).** Consent, notices, retention schedule, cross-border transfer and grievance-officer details need legal review; retention periods are not yet encoded.
4. **No penetration test or external security review.** Required before real partner data (§7.1, §10.1).
5. **Secrets management and key rotation.** No secrets manager provisioned; `FIELD_ENCRYPTION_KEY` rotation procedure not implemented (single-version ciphertext prefix `v1` allows it later).
6. **Malware scanning is a stub.** Uploaded KYB documents are not scanned by a real engine.
7. **Sanctions screening is a placeholder.** It must use a licensed provider before verifying partners in production.
8. **Regulated modules (finance, investor data room) must stay disabled** until regulatory review (§7.3). They are disabled by default and not built.
9. **Trademark and domain (B-02)** are unverified.
10. **Incident response.** No on-call rota or incident playbook has been exercised.

---

## 5. Web deployment instructions

Full guide: [`docs/deployment.md`](deployment.md). Summary:
1. Provision managed PostgreSQL 16 (TLS, PITR), Redis 7 and a private S3 bucket.
2. Build images: `infra/docker/api.Dockerfile`, and `infra/docker/next.Dockerfile` with `APP=web` and with `APP=admin`.
3. Configure secrets from `.env.production.example` in a secrets manager; generate each with `openssl rand -hex 32`; back up `FIELD_ENCRYPTION_KEY` separately.
4. Deploy the API privately (it migrates on start), then deploy web and admin with `API_INTERNAL_URL` set. Put them behind a TLS load balancer that sets `X-Forwarded-For`; restrict admin by VPN/IP.
5. Take a backup, run the smoke and accessibility scripts against staging, and create the first super admin under change control (no demo seed).

## 6. Android build instructions

Requires an Expo/EAS account and a Google Play Console account (B-06). Set real API URLs in `apps/mobile/eas.json`, then:
```bash
cd apps/mobile && npm i -g eas-cli && eas login && eas init
eas build -p android --profile pilot        # internal APK
eas build -p android --profile production   # Play Store AAB
eas submit -p android --profile production
```
Local alternative: Android Studio with SDK 35, `npx expo prebuild -p android`, then `./gradlew assembleRelease` with a vaulted release keystore.

## 7. iOS build instructions

Requires an Apple Developer Program membership and App Store Connect (B-06):
```bash
cd apps/mobile && eas device:create         # register pilot devices for internal distribution
eas build -p ios --profile pilot
eas build -p ios --profile production && eas submit -p ios --profile production   # TestFlight → review
```
Before review: privacy labels, account-deletion path (D-6), demo credentials in review notes, HTTPS API.

---

## 8. Production launch checklist

Legend: ✅ done & verified · ⬜ open. **Every item must be ✅ and signed by the named owner before go-live.**

### A. Product scope (Master Book §8 sequencing)
- ✅ Stage 01 foundation · ✅ Stage 02 identity & tenancy · ✅ Stage 03 onboarding & KYB
- ⬜ Stage 04 catalogue · ⬜ 05 marketplace · ⬜ 06 lead protection & Unite-first routing · ⬜ 07 CRM — **minimum for pilot**
- ⬜ Stage 12 (limited): commission ledger with no unearned payout and idempotent settlement — **pilot**
- ⬜ Stage 16: hardening, UAT with the six personas, pilot guide, incident runbook — **pilot**
- ⬜ Stages 08–11, 13–15 — commercial pilot / expanded release
- ⬜ D-2 password reset · ⬜ D-6 account closure (screen 150)

### B. Security & compliance
- ✅ MFA enforced for admins · ✅ tenant isolation tests · ✅ CSRF, rate limits, security headers · ✅ encryption of sensitive fields · ✅ hash-chained audit log
- ✅ Runtime dependencies free of high/critical advisories (audit 2026-11-06)
- ⬜ External penetration test, findings closed
- ⬜ Secrets manager + key-rotation procedure
- ⬜ Real antivirus scanning · ⬜ licensed sanctions screening
- ⬜ Legal sign-off: partner terms, lead registration agreement, privacy notice, DPDP review, retention schedule
- ⬜ Legal entity named in all templates (B-01) · ⬜ trademark/domain (B-02)

### C. Integrations
- ⬜ S3 storage (B-03) · ⬜ email/SMS provider with domain authentication (B-04) · ⬜ e-signature decision (B-08)

### D. Operations
- ✅ Backup & restore drill passed (local)
- ⬜ Scheduled backups + off-site copies + PITR on managed DB
- ⬜ Central logs, metrics, uptime and 5xx alerts, error tracking (D-4)
- ⬜ Redis-backed rate limiting for multiple instances (D-5)
- ⬜ CI green on GitHub (D-10) · ⬜ staging environment deployed and smoke-tested
- ⬜ Named group administrator, moderation lead and on-call rota; incident playbook drill

### E. Quality
- ✅ 131 automated tests + 28 browser journeys + accessibility scan with 0 violations (current scope)
- ⬜ Same gates for every pilot-scope stage, including the end-to-end chain lead → Unite review → release/accept → apply → award → settle (§10.1)
- ⬜ Performance test at pilot load (P95 read < 500 ms)
- ⬜ Mobile device testing on iOS and Android; signed pilot builds distributed (B-06)

### F. Go / no-go sign-off (human approval required)
| Role | Name | Decision | Date |
|---|---|---|---|
| Product owner / program lead | | ⬜ | |
| Unite Group business owner | | ⬜ | |
| Compliance & legal | | ⬜ | |
| Finance (settlement controls) | | ⬜ | |
| Security / engineering lead | | ⬜ | |

---

## Recommended next steps

1. Build stages 04–07 and limited stage 12, holding each to the same gates (unit, integration, isolation, browser, accessibility). This is the shortest path to a pilot.
2. In parallel, the business resolves B-01, B-03, B-04 and B-08 (legal entity, storage, email/SMS, agreement review). Without B-04, real partners cannot even verify their email.
3. Stand up a staging environment with monitoring, then run Stage 16 (UAT, pen test, pilot guide) and repeat this audit.
