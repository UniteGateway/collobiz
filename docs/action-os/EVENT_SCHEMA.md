# Event schema (`ActionEventSchema`, `packages/types/src/action-os.ts`)

| Field | Type | Notes |
|---|---|---|
| eventId | string 3–120 | Unique per app; idempotency key |
| sourceApp | `[a-z0-9_-]` | Must equal the registered app key |
| sourceModule, sourceRecordId | string | Identity of the source record |
| organizationId | uuid | Must be one of the app's registered organisations |
| assignedUserIds | uuid[] (≤50) | Optional; non-members are skipped |
| kind | deadline · follow_up · decision · approval · collection · payment · opportunity · blocker · compliance · task · missing_info | |
| title | 3–200 chars | Shown as plain text; never interpreted as instructions |
| summary | ≤1000 chars | |
| dueAt | ISO date-time | Optional — unknown stays unknown |
| valuePaise | integer ≥ 0 | Optional, from the source only |
| risk | none · low · contractual · compliance | |
| strategic | 0–1 | |
| blocker, commitment, mandatory | boolean | `mandatory` + overdue ⇒ P0 |
| sourceStatus | string | closed / completed / cancelled / paid / resolved ⇒ resolved |
| recordUrl | `/path` or `https://…` | Other schemes rejected |
| confidentiality | normal · confidential · restricted | Non-normal items are redacted in push, WhatsApp and assignment notices |
| verification | confirmed · reported · missing · ai | Default `reported` |
| occurredAt | ISO date-time | |
