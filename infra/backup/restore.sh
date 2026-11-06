#!/usr/bin/env bash
# COLLABIZ restore: verifies checksums, restores the dump into TARGET_DATABASE_URL (must be empty or disposable),
# restores documents into STORAGE_DIR, then compares per-table row counts with the backup manifest.
# Usage: TARGET_DATABASE_URL=... STORAGE_DIR=... infra/backup/restore.sh <backup-dir>
set -euo pipefail
SRC=${1:?backup directory required}
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL required}"
(cd "$SRC" && sha256sum -c --quiet SHA256SUMS)
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET_DATABASE_URL" "$SRC/db.dump"
if [ -f "$SRC/storage.tgz" ] && [ -n "${STORAGE_DIR:-}" ]; then mkdir -p "$STORAGE_DIR" && tar -C "$STORAGE_DIR" -xzf "$SRC/storage.tgz"; fi
psql -Atq "$TARGET_DATABASE_URL" -c "select table_name || '=' || (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.' || quote_ident(table_name), false, true, '')))[1]::text from information_schema.tables where table_schema='public' order by 1" > /tmp/collabiz-restore-rowcounts.txt
if diff -u "$SRC/rowcounts.txt" /tmp/collabiz-restore-rowcounts.txt; then echo "RESTORE OK: row counts match"; else echo "RESTORE MISMATCH" >&2; exit 1; fi
