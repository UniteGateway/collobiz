# Integrations

## Built-in connectors (COLLABIZ data, per user, own memberships only)
| Key | App | Produces |
|---|---|---|
| crm_tasks | CRM | Open tasks assigned to the user (due within 14 days or overdue) |
| offer_applications | Business Offers | New applications on offers the user's business owns → decision |
| collab_invitations | Collab | Invitations to apply that are still open → opportunity |
| collab_proposals | Collab | Proposal rounds waiting for the user's business → decision |
| offers_expiring | Business Offers | Own open offers expiring within 7 days → deadline |
| unite_first_look | Business Offers | Unite first-look decisions due → decision |
| collections | Projects | Issued invoices to collect (due date, or 30 days after issue) |
| payables | Projects | Invoices to pay |
| milestones | Projects | Milestones due within 14 days, overdue or rejected |
| tender_bids | Tenders | Draft bids before the tender closes (mandatory deadline) |
| product_enquiries | Powertek | New product enquiries to answer |
| xchange | XCHANGE | Barter proposals, deliveries to make, deliveries to confirm |

Manager-only connectors need an owner/admin role in that organisation. A failing connector is shown on the board
("source unavailable — items may be out of date") and does not stop the others.

## Connected apps (Unite Solar, PRIZO, ADBUZ, LeadDNA, EQUITY9, Hybrid Power Lab, BIZO …)
1. A Unite administrator registers the app: `POST /v1/action-os/integrations { appKey, name, orgIds[] }`. The secret is
   returned once and stored as a SHA-256 hash.
2. The app posts events: `POST /v1/action-os/integrations/events`, headers `X-Action-App: <appKey>` and
   `Authorization: Bearer <secret>`, body `{ events: [...] }` (1–100 per call). See EVENT_SCHEMA.md.
3. Each event must name an organisation the app was registered for, and `sourceApp` must equal the app key. Duplicate
   `eventId`s are ignored. A closing `sourceStatus` (closed, completed, cancelled, paid, resolved) resolves the item.
4. Recipients: the `assignedUserIds` who are active members of that organisation; otherwise its owners/admins.

No external app is registered in this environment yet — each needs its own event feed.
