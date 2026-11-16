# Test report (16 Nov 2026)

| Suite | Result |
|---|---|
| `packages/types` — action-os.test.ts: priority, hard rules, DST, time zones, ISO weeks, catch-up, quiet hours, event contract, plan sections, digest | 9/9 (package total 137/137) |
| `apps/api` — test/action-os.e2e.ts | 8/8 |
| `apps/mobile` — test/action-os.test.tsx | 2/2 (mobile total 102/102) |
| Browser — "ACTION OS · …" (desktop + mobile) | 4/4 |

The API tests cover:
- items from real records, only for the people allowed to act on them; cross-tenant 403/404;
- completion without touching the source; a completed item is not re-flagged on refresh; snooze validation;
- assignment within the organisation; resolution when the source changes; escalation only to the organisation's heads;
- preferences validation (time zone, own organisations, WhatsApp consent);
- one plan per period, one delivery per channel; e-mail to the outbox; WhatsApp `not_configured`;
- Monday 08:00 in Asia/Kolkata vs America/New_York, retries and restarts without duplicates, no catch-up after two days;
- integration authentication, tenant boundary, idempotency, URL validation, closure, injection text kept as data;
- analytics counts only.

Not covered yet: provider outages (no providers connected), push permission denial on a device, load tests.
