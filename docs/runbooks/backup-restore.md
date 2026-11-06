# Runbook — Backup & Restore

Master Book §4.4 (daily backups, defined RPO/RTO) and §7.1 (restore drills).

## Proposed objectives (pilot)
| Objective | Target | How |
|---|---|---|
| RPO | ≤ 24 h (logical dump); ≤ 5 min with managed-DB PITR | Daily `backup.sh` + provider point-in-time recovery |
| RTO | ≤ 4 h | Restore procedure below, rehearsed monthly |
| Retention | 30 daily, 12 monthly | Off-site encrypted bucket with object lock |

## What is backed up
1. PostgreSQL (custom-format `pg_dump`) — all business data incl. the hash-chained audit log.
2. Private document storage (KYB files) — `storage.tgz` (moves to S3 versioning once B-03 is done).
3. Row-count manifest and SHA-256 checksums.
4. **Not included, store separately:** `FIELD_ENCRYPTION_KEY` and other secrets (secrets manager with its own backup).

## Backup
```bash
DATABASE_URL=... STORAGE_DIR=/data/storage BACKUP_DIR=/backups infra/backup/backup.sh
# → /backups/collabiz-<UTC timestamp>/{db.dump, storage.tgz, rowcounts.txt, SHA256SUMS}  (mode 600)
```
Schedule daily (cron/Kubernetes CronJob) and copy the folder to encrypted off-site storage. Alert if the job fails or the dump is unexpectedly small.

## Restore (into an EMPTY database)
```bash
createdb collabiz_restore
TARGET_DATABASE_URL=postgres://.../collabiz_restore STORAGE_DIR=/data/storage-restore infra/backup/restore.sh /backups/collabiz-<ts>
```
The script verifies checksums, restores, extracts documents and fails unless per-table row counts match the manifest. Then:
1. Verify the audit chain: sign in as compliance → Admin → Audit Logs (chain "Intact"), or `GET /v1/admin/audit/verify`.
2. Point the API at the restored DB (`DATABASE_URL`), restart, run the smoke tests against staging.
3. Record the drill (date, backup age, duration, result) in the operations log.

## Drill record
| Date | Backup | Result |
|---|---|---|
| 2026-11-06 | dev database (20 tables, 453 audit events, 78 documents) | ✅ Checksums OK · row counts identical · audit hash chain intact on restored DB · documents restored |

## Migration rollback
Migrations are forward-only. To roll back a failed release: stop the API, restore the pre-release backup into a new database, switch `DATABASE_URL`, redeploy the previous image tag.
