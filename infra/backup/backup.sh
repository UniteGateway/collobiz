#!/usr/bin/env bash
# COLLABIZ backup: PostgreSQL logical dump (custom format) + private document storage archive + checksums.
# Usage: DATABASE_URL=... STORAGE_DIR=... BACKUP_DIR=... infra/backup/backup.sh
# Production: run daily (Master Book §4.4), copy the output to encrypted off-site storage, keep >= 30 days.
set -euo pipefail
umask 077  # backups contain personal and financial data
: "${DATABASE_URL:?DATABASE_URL required}"
STORAGE_DIR=${STORAGE_DIR:-apps/api/storage}
BACKUP_DIR=${BACKUP_DIR:-./backups}
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$BACKUP_DIR/collabiz-$TS"
mkdir -p "$OUT"
pg_dump --format=custom --no-owner --no-privileges --file="$OUT/db.dump" "$DATABASE_URL"
if [ -d "$STORAGE_DIR" ]; then tar -C "$STORAGE_DIR" -czf "$OUT/storage.tgz" .; else echo "warning: storage dir $STORAGE_DIR not found" >&2; fi
psql -Atq "$DATABASE_URL" -c "select table_name || '=' || (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.' || quote_ident(table_name), false, true, '')))[1]::text from information_schema.tables where table_schema='public' order by 1" > "$OUT/rowcounts.txt"
(cd "$OUT" && sha256sum * > SHA256SUMS)
echo "$OUT"
