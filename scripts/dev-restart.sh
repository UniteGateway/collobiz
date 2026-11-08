#!/usr/bin/env bash
# Restarts built API (:4000), web (:3000) and admin (:3001) for local verification. Logs to $LOG_DIR (default /tmp).
set -u
LOG_DIR=${LOG_DIR:-/tmp}
cd "$(dirname "$0")/.."
for p in 4000 3000 3001; do fuser -k -n tcp $p >/dev/null 2>&1 || true; done
sleep 1
set -a; [ -f .env ] && . ./.env; set +a
# Browser suites run against a disposable database so test data never reaches the demo database (audit §3.1).
if [ -n "${DB_OVERRIDE:-}" ]; then export DATABASE_URL="$DB_OVERRIDE"; fi
(cd apps/api && nohup node dist/main.js > "$LOG_DIR/api.log" 2>&1 &)
(cd apps/web && nohup npx next start -p 3000 > "$LOG_DIR/web.log" 2>&1 &)
(cd apps/admin && nohup npx next start -p 3001 > "$LOG_DIR/admin.log" 2>&1 &)
for i in $(seq 1 60); do
  curl -sf localhost:4000/v1/health >/dev/null && curl -sf localhost:3000 >/dev/null && curl -sf localhost:3001/status >/dev/null && { echo "servers up"; exit 0; }
  sleep 1
done
echo "servers failed to start"; exit 1
