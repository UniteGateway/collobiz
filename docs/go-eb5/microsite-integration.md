# GO EB5 microsite → COLLABIZ

The microsite at https://eb5new.vercel.app is static and its forms do not send data anywhere yet. This page explains how to connect it to COLLABIZ **without** building a second CRM. Every enquiry becomes a GO EB5 lead (source `website`) in the existing module.

Nothing here is live until someone deploys it and enables the `go_eb5` feature flag.

## Option 1 — link to the hosted application (no code on the microsite)

Point the microsite's "Apply" / "Online application" buttons at:

```
https://<collabiz-web-host>/go-eb5/apply
```

That page is the Preliminary Consultancy Application form (sections A–J of the PDF form). When it is submitted:

- a lead is created;
- the applicant gets a sign-in invitation;
- the application appears in their portal at `/eb5/portal` and in the manager's queue.

Duplicate applicants (same email or phone) are not given a second record. They see a neutral "we already have your details" message.

## Option 2 — post the microsite's own forms

Public endpoints (no sign-in; rate-limited):

| Endpoint | Use | Limit |
|---|---|---|
| `GET /api/v1/eb5/public/info` | Brand, contracting entity, whether terms are approved | — |
| `POST /api/v1/eb5/public/enquiries` | Consultation booking (`kind: "consultation"`) or portal early access (`kind: "portal_interest"`) | 5 per minute per IP |
| `POST /api/v1/eb5/public/applications` | Full preliminary application (same body as the hosted form) | 3 per minute per IP |

The enquiry body is validated by `Eb5PublicEnquirySchema` in `packages/types/src/eb5.ts`:

```js
// contact.html — consultation form
await fetch('https://<collabiz-api-host>/api/v1/eb5/public/enquiries', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    kind: 'consultation',
    fullName, email, phone, country,
    interest, readiness, timeline, family, currentlyInUs, language, preferredDate, message,
    consent: true,          // must be an explicit tick by the visitor
    website: honeypotValue, // hidden field; must be empty
  }),
});
// portal.html — early access: { kind: 'portal_interest', fullName, email, country, consent: true }
```

Responses:

- `201` with `{ reference, message }`. `reference` is `null` for a duplicate.
- `400` with field errors.
- `404` while the feature flag is off.

### Deployment settings (need approval before going live)

- Add the microsite origin to the API's `CORS_ORIGINS`, for example `CORS_ORIGINS=https://<collabiz-web-host>,https://eb5new.vercel.app`. This is only needed for Option 2.
- Turn on the `go_eb5` feature flag in the admin console.
- Before the microsite says that consultations or agreements are offered, record counsel's approvals in GO EB5 → Settings.

## Content points to resolve before launch

- **Contracting entity.** The microsite and the uploaded legal draft name *Unite Group Inc., USA* as the Consultant. The COLLABIZ specification requires *CITRUS360 LLC*.
  - COLLABIZ uses the entity set in GO EB5 → Settings. The default is CITRUS360 LLC.
  - Changing it withdraws the agreement-template approval until counsel approves again.
  - Decide on one entity and use it on the microsite as well.
- The microsite should show the same at-risk and no-guarantee wording as the hosted form: no visa approval, timeline, return or capital repayment is guaranteed.
- Fees ($200,000; 10% commencement) remain proposed terms until counsel's approval is recorded.
