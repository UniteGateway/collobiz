#!/usr/bin/env bash
# Runs the browser journeys and the accessibility scan against a freshly rebuilt `collabiz_e2e` database, then restores the
# servers on the demo database. Test data therefore never appears in demonstrations (audit §3.1).
# Usage: LOG_DIR=/tmp scripts/e2e-run.sh [--shots DIR]   (SUITE=... filters suites as usual)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
E2E_DB="${E2E_DATABASE_URL:-${DATABASE_URL%/*}/collabiz_e2e}"
ADMIN_DB="${DATABASE_URL%/*}/postgres"
psql "$ADMIN_DB" -tAc "select 1 from pg_database where datname='collabiz_e2e'" | grep -q 1 || psql "$ADMIN_DB" -c "create database collabiz_e2e" >/dev/null
psql "$E2E_DB" -c "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;" >/dev/null
(cd apps/api && DATABASE_URL="$E2E_DB" node -r @swc-node/register src/db/migrate.ts >/dev/null && DATABASE_URL="$E2E_DB" node -r @swc-node/register src/db/seed.ts | tail -1)
DB_OVERRIDE="$E2E_DB" scripts/dev-restart.sh
status=0
node scripts/e2e-smoke.mjs "$@" || status=$?
[ -z "${SUITE:-}" ] && { node scripts/a11y-scan.mjs > "${LOG_DIR:-/tmp}/a11y.txt" 2>&1 || status=$?; grep -c ": 0 violation" "${LOG_DIR:-/tmp}/a11y.txt" | sed 's/^/a11y pages clean: /'; }
scripts/dev-restart.sh >/dev/null   # back to the demo database
exit $status
