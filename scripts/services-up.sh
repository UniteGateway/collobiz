#!/usr/bin/env bash
# Starts local PostgreSQL 16 and Redis 7 if they are not running (sandbox/dev convenience; Docker users: docker compose up -d postgres redis).
pg_lsclusters 2>/dev/null | grep -q " online " || pg_ctlcluster 16 main start
redis-cli ping >/dev/null 2>&1 || redis-server --daemonize yes >/dev/null
for i in $(seq 1 20); do pg_isready -q && redis-cli ping >/dev/null 2>&1 && { echo "postgres + redis up"; exit 0; }; sleep 1; done
echo "services failed to start"; exit 1
