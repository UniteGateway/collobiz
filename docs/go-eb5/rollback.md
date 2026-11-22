# GO EB5 — rollback procedure

GO EB5 is isolated, so the rest of COLLABIZ never depends on it.

## 1. Switch it off (instant, no data change)
```sql
update feature_flags set enabled = false where key = 'go_eb5';
```
Effect:
- Every `/v1/eb5/*` route returns 404 for everyone except super admins.
- The menu entry disappears.
- Public partner links stop accepting enquiries.

Existing COLLABIZ modules are unaffected.

## 2. Roll back the code (if needed)
Revert the GO EB5 commits on `claude/collabiz-platform-build`, from `GO EB5 module (wip)` onwards. If the GO EB5 tables were created, keep migration `0051_go_eb5.sql` in place. Its tables are self-contained, and leaving them does no harm.

## 3. Remove the data (only with legal sign-off — irreversible)
Client documents and records may be under retention obligations. Export them first and confirm with counsel.
```sql
-- files: delete stored objects under <STORAGE_LOCAL_DIR>/eb5/ after exporting what must be kept
drop table if exists eb5_doc_access, eb5_case_milestones, eb5_documents, eb5_invoices, eb5_agreements, eb5_consultations,
  eb5_applications, eb5_tasks, eb5_compensation, eb5_leads, eb5_partners, eb5_projects, eb5_roles, eb5_settings cascade;
delete from feature_flags where key = 'go_eb5';
```
The audit trail (`audit_events`, actions `eb5.*`) is append-only and hash-chained. It is kept.
