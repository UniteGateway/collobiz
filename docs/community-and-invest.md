# Community, Invest together and the Home dashboard

- **Community** (`/community`): members online now (heartbeat each minute; anyone can hide it), a wall for thoughts,
  questions and opportunities (verified members post; likes, comments, reports; moderators remove), and private messages
  through the existing encrypted Chat. Admin moderation: Workspace → Invest together & community.
- **Invest together** (`/invest`): Unite group-investment offers such as a property share per sq ft with rent shared pro
  rata (`prorataSplit` in `packages/types/src/community.ts`). **Interest only**: COLLABIZ takes no money and allots no units.
  Pooled investment in property is regulated in India (SEBI — Small & Medium REITs; otherwise a possible collective
  investment scheme). A super admin records the regulatory clearance reference per offer; actual subscription, payment,
  escrow and allotment must run through the approved structure and are deliberately not built. The demo offer
  INV-DEMO-001 is labelled as a demonstration.
- **Home dashboard**: business-domain theme and illustration, six-month charts, ad slot (admin-booked, or Unite's own
  programmes), news, video (YouTube/Vimeo privacy player), Unite apps tray (open apps and "coming soon"), members online,
  Invest together highlight, and the newest marketplace opportunities.
- **Menus**: grouped, collapsible sections with module sub-menus (state remembered per browser).

## Live updates and push (gap 4)
- A Postgres trigger on `notifications` sends `pg_notify('collabiz_live')`; `LiveService` (`apps/api/src/modules/community/live.ts`)
  listens and streams Server-Sent Events at `GET /v1/live` to the signed-in user only (presence every 30 s, keep-alive 25 s).
  The web app shows a toast and refreshes chat, inbox, the community wall and "online now" without polling delays.
  Verified in a browser: a message sent from Community reached the recipient's toast in about 1.4 s through the web proxy.
- Push: devices register Expo tokens at `POST /v1/me/push-token`. Sending is off unless `PUSH_PROVIDER=expo`
  (optionally `EXPO_ACCESS_TOKEN`). **Blocked:** the mobile app does not request push permission yet — it needs an Expo/EAS
  project ID and credentials from the account owner.

## Collab follow-ups (gap 5)
- **Unite first look:** a publisher can tick "Offer Unite companies the first look". On approval, the first active Unite
  company covering the offer's sector (and taking leads) sees it alone for 48 hours (`UNITE_FIRST_HOURS`). It can say
  *We are interested* (the publisher is told) or *Pass* (listed for everyone at once). When the window lapses, the hourly
  sweep lists it and tells the publisher. Other partners get "not found" until then; the marketplace keeps it unlisted.
- **Invitations:** once listed, the publisher invites verified partner businesses (search by name, or "Invite to apply"
  on suggested partners), up to 25 per offer a day, once per partner. Invitees see "You are invited" on Collab and on the
  offer; they apply or decline. The publisher sees Invited / Applied / Declined / Offer closed.
- **Expiry reminders:** 7 days and 1 day before expiry (each once), then an expiry notice. The API runs the sweep hourly;
  `POST /v1/admin/business-offers/sweep` runs it on demand (for an external scheduler in production).
- Tests: `apps/api/test/collab-followups.e2e.ts` (5), types `collab.test.ts`, browser suite "COLLAB follow-ups".
