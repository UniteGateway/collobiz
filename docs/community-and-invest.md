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
