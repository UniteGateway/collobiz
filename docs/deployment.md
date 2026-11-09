# COLLABIZ Deployment Guide

> Status (2026-11-06): **not deployed anywhere.** Production deployment requires explicit human approval (instruction 15) and the integrations listed in `docs/launch-readiness-report.md`. The steps below were verified in a sandbox up to the point marked.

> **Pilot:** for a small pilot on one server, follow `docs/pilot/go-live-checklist.md` and use `infra/pilot/` (single-server compose with HTTPS). A fresh database is set up with the bootstrap command (`node dist/db/bootstrap.js`), never with the demo seed.

## 1. Architecture to deploy

| Component | Image / artefact | Port | Notes |
|---|---|---|---|
| API | `infra/docker/api.Dockerfile` | 4000 | Runs migrations, then starts. Non-root (uid 10001). Healthcheck `GET /v1/health`. |
| Web | `infra/docker/next.Dockerfile` (`APP=web`) | 3000 | Next.js standalone. Proxies `/api/v1/*` to `API_INTERNAL_URL` **at runtime**. |
| Admin | `infra/docker/next.Dockerfile` (`APP=admin`, `PORT=3001`) | 3001 | Deploy on a separate hostname; restrict by IP/VPN/SSO where possible. |
| PostgreSQL 16 | Managed service | 5432 | TLS, automated backups + PITR, encryption at rest. |
| Redis 7 | Managed service | 6379 | Health check today; required for multi-instance rate limiting (D-08). |
| Object storage | S3-compatible, private bucket | — | Not yet wired (B-03). |

Only Web and Admin are exposed publicly, behind a TLS-terminating load balancer that sets `X-Forwarded-For`. The API stays on the private network.

> **Required:** the load balancer must set `X-Forwarded-For`. The web/admin proxy passes it through, and the API (`trust proxy 1`) uses it as the client IP for rate limiting (`API_RATE_LIMIT`, `AUTH_RATE_LIMIT`). Without it, every user would share the proxy's IP and one rate-limit bucket.

## 2. Build images (verified 2026-11-06)

```bash
docker build -f infra/docker/api.Dockerfile -t collabiz-api:<git-sha> .
docker build -f infra/docker/next.Dockerfile --build-arg APP=web   --build-arg PORT=3000 -t collabiz-web:<git-sha> .
docker build -f infra/docker/next.Dockerfile --build-arg APP=admin --build-arg PORT=3001 -t collabiz-admin:<git-sha> .
# Behind a TLS-intercepting corporate proxy add:
#   --secret id=ca,src=/path/to/corporate-ca.crt --build-arg HTTPS_PROXY=$HTTPS_PROXY
```

Verified: API and web images built; API ran with `NODE_ENV=production` and generated secrets (health OK, non-root, `HttpOnly; Secure; SameSite=Lax` cookies, OpenAPI UI disabled); web container served pages and proxied to the API via runtime `API_INTERNAL_URL`.

## 3. Configure

1. Copy `.env.production.example` into your secrets manager; generate every secret with `openssl rand -hex 32`.
2. **Back up `FIELD_ENCRYPTION_KEY` separately from database backups** — without it, encrypted bank/PAN fields are unrecoverable.
3. Create a least-privilege DB role for the app (owner of the `public` schema for migrations or a separate migration role).
4. Never run `pnpm db:seed` against production (it refuses when `NODE_ENV=production`).

## 4. Release procedure (staging first, then production)

1. CI green on the commit (`.github/workflows/ci.yml`: lint, typecheck, unit/integration tests, builds, mobile bundles).
2. Take a backup: `infra/backup/backup.sh` (see `docs/runbooks/backup-restore.md`).
3. Deploy API (migrations run automatically on start; they are forward-only — roll back by restoring the pre-release backup).
4. Deploy Web/Admin with `API_INTERNAL_URL` pointing at the API service.
5. Smoke test: `WEB_URL=https://staging… ADMIN_URL=https://admin.staging… node scripts/e2e-smoke.mjs` (uses demo accounts → staging only), `node scripts/a11y-scan.mjs`.
6. First release only: `node dist/db/bootstrap.js --platform-name "<operating company>"`, then the first Unite Group super admin registers on the web app, then `node dist/db/bootstrap.js --super-admin <email>` (audited). That admin enrols MFA at `/mfa` before any admin action works. Never run the demo seed.

## 5. Android build (EAS — requires Expo account, Google Play Console; blocker B-06)

Native folders are generated, not committed (continuous native generation). Verified here: `expo prebuild` generates `android/` with `applicationId group.unite.collabiz`; `expo export --platform android` bundles successfully. A Gradle compile was **not** possible in the sandbox (Android SDK host blocked).

```bash
cd apps/mobile
npm i -g eas-cli && eas login                    # Unite Group Expo organisation account
eas init                                          # links projectId into app.json
# set EXPO_PUBLIC_API_URL in eas.json profiles to the real pilot/production API
eas build --platform android --profile pilot      # installable APK for internal testers
eas build --platform android --profile production # AAB for Play Store
eas submit --platform android --profile production
```

Local alternative (Android Studio + SDK 35 installed): `npx expo prebuild -p android && cd android && ./gradlew assembleRelease` with a release keystore configured in `android/app/build.gradle` (store the keystore in a secrets vault).

## 6. iOS build (EAS — requires Apple Developer Program, App Store Connect; blocker B-06)

Verified here: `expo prebuild` generates `ios/` with bundle identifier `group.unite.collabiz`; `expo export --platform ios` bundles successfully. Compiling requires macOS/Xcode or EAS cloud builds.

```bash
cd apps/mobile
eas build --platform ios --profile pilot          # internal distribution (register tester devices: eas device:create)
eas build --platform ios --profile production
eas submit --platform ios --profile production    # TestFlight → App Store review
```

Before store submission: privacy nutrition labels / Data safety form (account, financial, documents), account-deletion entry point (screen 150 — not yet built), App Store review notes with a demo account, and ATS-compliant HTTPS API URL.

## 7. Observability (to configure before pilot)

API logs go to stdout (Nest logger, request IDs in `X-Request-Id`). Ship container logs to a central store, add uptime checks on `/v1/health`, alert on 5xx rate, failed-login spikes (`/v1/admin/security/summary`) and backup job failures.
