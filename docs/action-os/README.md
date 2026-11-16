# COLLABIZ ACTION OS

**Your Business. Your Priorities. Every Day.** One action centre inside COLLABIZ (not a separate app) that tells each user
what needs attention, why it matters and what to do next — across every app and organisation they are authorised for.

| Part | Where |
|---|---|
| Rules (priority, scheduling, plan builder, event contract) | `packages/types/src/action-os.ts` (tests: `action-os.test.ts`, 9) |
| Engine, connectors, API | `apps/api/src/modules/action-os/` (tests: `apps/api/test/action-os.e2e.ts`, 8) |
| Database | `apps/api/src/db/schema/action-os.ts`, migration `0046_action_os.sql` |
| Web | Home → *My Business Notice Board*; `/action-os` (board), `/action-os/plans`, `/action-os/plans/[id]`, `/action-os/settings` |
| Mobile | Home notice-board card; `app/action-os.tsx` (tests: `apps/mobile/test/action-os.test.tsx`) |
| Browser journey | `scripts/e2e-suites.mjs` → "ACTION OS · …" (desktop + mobile) |

Pipeline: connected records → authorised connectors / integration events → normalised items → rule-based priority →
plan builder → notice board, inbox, push, e-mail, WhatsApp (when configured and consented) → user actions and feedback →
next refresh.

Files: [ARCHITECTURE](ARCHITECTURE.md) · [INTEGRATIONS](INTEGRATIONS.md) · [EVENT_SCHEMA](EVENT_SCHEMA.md) ·
[PRIORITY_RULES](PRIORITY_RULES.md) · [AI_PLAN_FORMAT](AI_PLAN_FORMAT.md) · [NOTIFICATION_CHANNELS](NOTIFICATION_CHANNELS.md) ·
[WHATSAPP_INTEGRATION](WHATSAPP_INTEGRATION.md) · [CONSENT_AND_PRIVACY](CONSENT_AND_PRIVACY.md) ·
[DATABASE_SCHEMA](DATABASE_SCHEMA.md) · [API_SPECIFICATION](API_SPECIFICATION.md) · [SCREEN_REGISTRY](SCREEN_REGISTRY.md) ·
[TEST_REPORT](TEST_REPORT.md) · [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md) · [RELEASE_CHECKLIST](RELEASE_CHECKLIST.md)
