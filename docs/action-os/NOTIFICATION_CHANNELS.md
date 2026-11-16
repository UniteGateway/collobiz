# Channels

| Channel | Behaviour | Status here |
|---|---|---|
| Notice board + inbox | Always on; plans and P0 alerts written to notifications; live stream refreshes the screen | Working |
| Mobile push | Existing push plumbing when `PUSH_PROVIDER=expo` and a device token exists; quiet hours defer push | **Not configured** — needs Expo/EAS project and credentials |
| E-mail | Plain-text digest through `MailService` | Outbox only — **no SMTP provider configured** |
| WhatsApp | Titles-only summary with an approved template, only after opt-in | **Not configured** — no WhatsApp Business provider |

Delivery records (`action_deliveries`): sent · queued · delivered (only on provider confirmation) · not_configured ·
no_consent · quiet_hours · failed · duplicate_skipped. Nothing is reported as delivered without a provider confirmation.
