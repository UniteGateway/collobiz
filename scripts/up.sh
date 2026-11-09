#!/usr/bin/env bash
# Brings the whole local stack back after a machine restart: PostgreSQL + Redis, then API, web and admin.
set -e
cd "$(dirname "$0")/.."
bash scripts/services-up.sh
bash scripts/dev-restart.sh
