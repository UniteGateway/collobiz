# Database (migration `0046_action_os.sql`, new tables only)

| Table | Purpose | Key constraints |
|---|---|---|
| action_items | One item per (user, source app, source record, kind): score, band, parts, rule, verification, status, snooze, pin, read, assignment, escalation, completion | unique identity; index (user, status, band) |
| action_plans | Plans: summary, counts, sections, item snapshot, trigger | unique (user, kind, period_key) |
| action_preferences | Per-user preferences (JSON validated by `PreferencesSchema`) | pk user |
| action_deliveries | Per-channel delivery records | unique dedupe_key |
| action_integrations | Registered apps, hashed secret, allowed organisations | unique app_key |
| action_source_events | Raw integration events (provenance) | unique (integration, event_id) |
| action_feedback, action_comments | Feedback and notes per item | |

Reuses users, organizations, memberships, notifications, push_tokens, channel_preferences, outbox_messages.
