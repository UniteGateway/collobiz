# Unite brand products and channel partners

**What it is:** Unite-branded products made by established manufacturers (OEM) and sold through Unite's own partner network.

| Product | Microsite | OEM manufacturer (internal record) |
|---|---|---|
| Unite Cement | `cement.` / `/businesses/unite-cement` | CCI |
| Unite Steel | `steel.` / `/businesses/unite-steel` | Simhadri Steels |
| Unite Ply | `ply.` / `/businesses/unite-ply` | To be selected (Gujarat); manufacturers can apply |
| Unite Carpets | `carpets.` / `/businesses/unite-carpets` | To be selected (Gujarat); manufacturers can apply |
| Unite Furniture | `furniture.` / `/businesses/unite-furniture` | Multiple manufacturers; manufacturers can apply |

## How manufacturer names are shown
- **Public pages:** they show "an approved manufacturer" and the status (being finalised, agreement signed, or in production) until a super admin makes the name public. That should only happen once the OEM agreement allows it.
- **Status:** all five are currently "being finalised".
- **Open to partners:** the products start closed to partner promotion. A Unite admin opens each one on the Unite businesses admin page.

## Channel partners
- **Where people apply:**
  - every brand-product microsite ("Sell Unite …")
  - the home page ("Sell Unite products")
  - `/partner-with-unite`
  - the public header link "Sell Unite products"
- **Roles:**
  - Distributor, dealer, store or franchise, for all five products.
  - Manufacturer, for ply, carpets and furniture.
- **When someone applies:**
  - They get a reference (CHN-…) by email.
  - Unite admins are notified.
  - Duplicate applications that are still open are refused.
- **Linking to an account:** an application links to a COLLABIZ business account when the applicant signs in with the same email and opens the dealer dashboard.
- **Review** (admin console → Unite brand products):
  - **Shortlist.**
  - **Approve:** needs a linked account and a territory.
  - **Decline:** needs a reason.
  - The applicant is notified and emailed. Every step is audited.

## Matching agent
- **What it is:** rules-based (`recommendChannels` in `packages/types/src/brand-channels.ts`). It is labelled as rules-based on screen.
- **Inputs:** the applicant's current business (13 types), the role they want, and their warehouse and showroom space.
- **Output:** a ranking of products and roles, with the reason for each suggestion.
- **Where it's used:**
  - on `/partner-with-unite` and each product microsite
  - stored with every application, so admins see the score and reasons
  - on the dealer dashboard ("Also a fit for your business")
- **Later:** an AI model can re-rank the results once the AI provider is switched on, but the reasons stay.

## Dealer dashboard (`/dealer`)
- **Shows**, for each approved product: role, territory, and the pipeline (New → Contacted → Qualified → Quotation → Negotiation → Won) with counts and values, plus recent leads.
- **"Add a lead":** creates a customer and a deal in the dealer's own COLLABIZ CRM, tagged with the product. Deals move through the normal CRM pipeline.
- **Privacy:** only the dealer's business sees its leads.
- **Also shows:** the dealer's applications and their status, and other products that fit.

## API

| Endpoint | Access | Purpose |
|---|---|---|
| `GET /v1/public/brand-products` | public | The five products. |
| `POST /v1/public/brand-products/match` | public | The matching agent. |
| `POST /v1/public/brand-products/applications` | public | Apply as a channel partner. |
| `GET /v1/brand-products/dashboard` | member | Dealer dashboard; links applications by email. |
| `POST /v1/brand-products/leads` | approved partners | Add a lead. |
| `GET /v1/admin/brand-products/applications`, `POST …/:id/decide` | Unite admins | Review applications. |
| `GET/POST /v1/admin/brand-products/oem[/:slug]` | Unite admins; only a super admin makes a name public | OEM manufacturer records. |

**Data:** table `channel_applications`; the OEM fields on `unite_ventures`; `crm_deals.venture_id`. Migrations 0062 and 0063.

**Tests:** `apps/api/test/brand-channels.e2e.ts`, `packages/types/src/brand-channels.test.ts`, and the browser suite "Unite brand products".

## Adding a product — one admin page (admin console → Unite brand products → Products)

**The form asks for:**
- Name. The page address and web address are suggested from it.
- Category and industry.
- Tagline, description, and who buys the product.
- Partner roles offered.
- Matching rules: which business types are a strong fit and which are a good fit, and whether the product is sold in bulk or from a showroom.
- Microsite features (each can be marked "planned"), plus "how it works" steps.
- OEM manufacturer and status.
- Brand colours.

**Save as draft:** nothing is public yet.

**Publish** creates the business record and, with no code change:
- the microsite at `/businesses/<page address>` and `<web address>.<domain>`
- its place in "Sell Unite products", the matching agent, partner applications, the dealer CRM, the home page section, the sitemap and the admin review queue

The product starts closed to partner promotion; open it on the Unite businesses page. Editing a published product updates the live page. The five launch products moved into the same table (migration 0064), and admin-set features override their built-in ones.

## Customers routed to the local dealer
- **Routing:** a buyer's enquiry on a brand product's microsite ("I want to buy") goes straight into the CRM of the approved partner whose territory or town matches the customer's city, or failing that their state. If several partners match, the one with the fewest open leads gets it.
- **Consent:** the customer agrees to be contacted by "Unite Group and its authorised partner for my area".
- **What each side sees:**
  - the customer sees which partner will contact them
  - the dealer is notified and the lead appears on their dashboard
  - the enquiry records which dealer received it
- **No dealer for the area:** the Unite team handles the enquiry as before.

| Endpoint | Purpose |
|---|---|
| `GET/POST /v1/admin/brand-products/catalogue` | List and add products. |
| `PUT /v1/admin/brand-products/catalogue/:slug` | Edit a product. |
| `POST /v1/admin/brand-products/catalogue/:slug/publish` | Publish a product. |
