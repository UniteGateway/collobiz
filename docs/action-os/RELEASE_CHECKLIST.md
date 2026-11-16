# Release checklist

- [ ] Migration 0046 applied in the target environment (new tables only; non-destructive).
- [ ] `PUSH_PROVIDER=expo` with EAS credentials; the mobile app requests notification permission and registers tokens.
- [ ] `MAIL_DRIVER=smtp`, `SMTP_URL` and a verified `MAIL_FROM`.
- [ ] WhatsApp Business provider connected, utility template approved, delivery-status webhooks.
- [ ] One scheduler: the in-process 5-minute timer on a single instance, or an external cron on `POST /v1/action-os/admin/run-due`.
- [ ] Integrations registered per app with the right organisations; secrets kept in each app's secret manager.
- [ ] Privacy review of notification wording (lock screen, WhatsApp) and a retention period for items and delivery records.
- [ ] Load test refresh and runDue for the expected number of users.
- [ ] Pilot with Unite Solar users; collect feedback through the in-card buttons.
