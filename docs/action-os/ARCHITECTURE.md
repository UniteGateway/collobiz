# Architecture

- **Shared core service.** `ActionOsService` (NestJS) reads authorised records through *connectors*, scores them with the
  pure rule engine in `@collabiz/types`, stores one `action_items` row per (user, source app, source record, kind), and
  builds plans. Connected apps post events to the same store through the integration API — no core changes per app.
- **Refresh.** Each dashboard or plan request re-reads the connectors. Items whose source no longer needs action become
  `resolved`; locally completed items stay `done` (the source record is never changed silently). Snoozes expire on refresh.
- **Event-triggered alerts.** A newly found *critical* (P0) item goes to the inbox at once (deduplicated).
- **Scheduler.** The API runs `runDue()` every 5 minutes (also `POST /v1/action-os/admin/run-due` for an external cron).
  Each user's weekly/daily time is evaluated in their own IANA time zone (DST-safe). One plan per (user, kind, period) is
  enforced by a unique index, one delivery per (plan, channel) by a unique dedupe key — retries and restarts never send
  twice. A missed run is caught up for up to two days after the scheduled day.
- **Reuse.** In-app notifications (live stream + push via `LiveService`), e-mail outbox (`MailService`), WhatsApp consent
  (`channel_preferences`), provider registry (`providerConnected`), audit log (completions, assignments, escalations,
  preferences, integrations).
- **AI.** Plans are built by deterministic rules; "suggested next steps" are fixed, labelled suggestions per item kind.
  `AI_PROVIDER` is `rules` here — no business data is sent to an AI service. An AI writer may later draft the executive
  summary from the same grounded items, but cannot change priorities, dates, values or verification states.
