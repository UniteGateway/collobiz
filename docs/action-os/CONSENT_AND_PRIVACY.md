# Consent and privacy

- Items are built per user from their own active memberships; manager-only sources need owner/admin roles in that
  organisation. A platform administrator does **not** see other companies' items by default.
- Every API route is scoped to the signed-in user (other users' notices and plans return 404; another org filter 403).
- Assignment stays inside the item's organisation; escalation goes only to that organisation's owners/admins.
- Integration events must name an organisation the app was registered for.
- WhatsApp needs recorded opt-in; push and WhatsApp carry titles only; confidential items are redacted.
- Admin analytics are counts only — no titles, customers or amounts.
- External text (event titles, summaries) is stored and shown as plain text; it cannot change permissions or rules.
- No business data is sent to an AI provider (`AI_PROVIDER=rules`).
- Retention for action items and delivery records still needs a policy decision (see RELEASE_CHECKLIST.md).
