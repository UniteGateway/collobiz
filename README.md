# COLLABIZ

**Connect. Collaborate. Grow.** — the Unite-first hybrid B2B collaboration platform, powered by Unite Group.

COLLABIZ connects consultants, EPC contractors, traders, manufacturers, distributors and project developers to Unite Group and approved partner opportunities, with five trust capabilities: **protected leads, collaboration teams, transparent commissions, explainable AI matching and verified reputation**.

> Status: under staged development — see [`docs/development-status.md`](docs/development-status.md) and [`stage-status.md`](stage-status.md). Nothing here is deployed to production.

## Apps

| App | Path | Dev URL | Description |
|---|---|---|---|
| API | `apps/api` | http://localhost:4000/v1 (OpenAPI: `/docs`) | NestJS modular monolith, PostgreSQL via Drizzle |
| Web | `apps/web` | http://localhost:3000 | Public site + partner portal (Next.js) |
| Admin | `apps/admin` | http://localhost:3001 | Unite Group administration portal |
| Mobile | `apps/mobile` | Expo Go / simulator | iOS & Android app (Expo Router) |

## Quick start

Prerequisites: Node 22+, pnpm 10 (`corepack enable`), PostgreSQL 16 and Redis 7 (or Docker).

```bash
cp .env.example .env
docker compose up -d postgres redis          # or use local services
pnpm install
pnpm --filter @collabiz/types build          # shared package (CommonJS)
pnpm db:migrate && pnpm db:seed              # schema + demo data
pnpm dev:api                                 # :4000
pnpm dev:web                                 # :3000
pnpm dev:admin                               # :3001
pnpm dev:mobile                              # Expo; set EXPO_PUBLIC_API_URL to your LAN IP for devices
```

Full containerized stack: `docker compose --profile app up --build`.

## Quality gates

```bash
pnpm lint && pnpm typecheck && pnpm test     # all workspaces (API tests need TEST_DATABASE_URL)
pnpm --filter @collabiz/web build && pnpm --filter @collabiz/admin build
node scripts/e2e-smoke.mjs --shots ./shots   # Playwright UI smoke (servers must be running)
node scripts/a11y-scan.mjs                   # WCAG 2.2 AA scan (axe-core)
pnpm registry                                 # regenerate screen-registry.csv + docs/ui-screen-registry.md
```

## Documentation

- **[Launch-readiness audit](docs/launch-readiness-report.md)** · [Deployment guide](docs/deployment.md) · [Backup & restore runbook](docs/runbooks/backup-restore.md)
- [Requirements index](docs/requirements-index.md) — everything extracted from the Master Book and UI atlas
- [UI screen registry](docs/ui-screen-registry.md) / [`screen-registry.csv`](screen-registry.csv) — 165 screens with route, access, stage, status, tests
- [Architecture](docs/architecture.md)
- [Assumptions, decisions & blockers](docs/assumptions.md)
- [Development status](docs/development-status.md) · [Stage log](stage-status.md) · [Changelog](CHANGELOG.md)

## Brand

Logo assets in `packages/ui/assets`. Tokens: navy `#011E48` / `#03325D`, green `#55A444`, grey `#7A7A7B` (`packages/ui/src/tokens.ts`).

## Important qualifications

COLLABIZ is not an escrow bank, lender, securities exchange or regulated investment intermediary. Finance/investor modules are disabled by default pending legal review. No earnings are guaranteed and there are no payments for recruiting partners.
