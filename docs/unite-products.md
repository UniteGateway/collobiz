# Unite products: public product pages (/businesses)

There is a public page for every Unite Group business, styled as a product directory.

## Pages
- `/businesses` is the directory.
  - Search, category chips and featured photo cards (including GO EB5).
  - Products are grouped by category.
  - A "Built to work together" band.
- `/businesses/<slug>` is each product's own page.
  - A sticky product menu: Overview, Features, Works with, Contact.
  - A photo hero with the logo.
  - Features and how it works, shown only where brand data exists in `packages/types/src/app-brands.ts`.
  - A "Works with" panel and related products.
  - An enquiry form.
- Photos are royalty-free Pexels images (`apps/web/public/photos/CREDITS.md`), mapped per business in `apps/web/lib/photos.ts`.

## What appears
- Every business that is **not** waiting for regulatory clearance, with its stage:
  - Available
  - Pilot
  - In development
  - Coming soon
- Regulated businesses (banking, payments, digital currency and so on) stay hidden until a super admin records clearance.
- Early-stage products offer "Notify me at launch" rather than a service.

## "Works with" is factual
It lists only connections that exist in this codebase:
- COLLABIZ enquiries (always).
- The partner network (connected only when the business is open to partners).
- The relevant COLLABIZ desk: Unite Solar, Powertek, Property, Green Park energy or Store/BOGO.
- A brand's own integration status, for example BIZO: "Link only — not connected yet".

## Enquiries
- Endpoint: `POST /api/v1/public/products/:slug/enquiries`. It is rate-limited to 5 per minute and has a honeypot field. Explicit consent is required.
- Storage: enquiries go into the existing `enquiries` table, with `venture_id`, `kind` (customer | partner | interest), `phone` and `city`. Migration 0052 only adds columns.
- Notifications:
  - The sender gets a confirmation email with a `BIZ-YYYY-NNNNNN` reference.
  - The business's operating company, or failing that the Unite admins, get an in-app notification.
- Admin: the admin console shows enquiries under **Ventures → business → Website enquiries**, with Mark handled / Reopen. Changes are audited.
- Public reads: `GET /api/v1/public/products` and `GET /api/v1/public/products/:slug`. Internal fields (roles, reward notes, regulated reasons) are stripped.
- Admin link setting: the admin "Public page" link uses `NEXT_PUBLIC_WEB_URL`.

## Tests
- `apps/api/test/ventures.e2e.ts`: listing, regulated hiding, honeypot and consent checks, enquiry to admin, handled status and notification.
- Browser suite "Unite products · …" in `scripts/e2e-suites.mjs`, desktop and mobile.
- `scripts/a11y-scan.mjs` covers `/businesses` and sample product pages.
