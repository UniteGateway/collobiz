# SOLBID ↔ COLLABIZ

SOLBID is Unite's sealed-bid solar EPC and PPA marketplace (repository `UniteGateway/solbid`). This integration lets Unite admins hand a COLLABIZ solar referral to SOLBID so the customer receives sealed bids from verified vendors. COLLABIZ then follows the outcome for the partner who introduced the customer.

## Flow
1. **Lead arrives in COLLABIZ.** A solar lead comes in from a product page (SunX, SUNGATE, ROOFZ and others) or a partner link, and appears on the admin Unite Solar desk under Referrals.
2. **Admin hands it to SOLBID.** The admin clicks **Send to SOLBID** and enters the system size, the model (EPC or PPA) and how and when the customer agreed to receive bids on SOLBID. The note is stored and audited.
3. **COLLABIZ sends a signed hand-off.** `POST {SOLBID}/api/v1/integrations/collabiz/intakes` carries the name, mobile, city, state and requirement, plus the introducer's code and name. It never includes the bill or roof photo.
4. **SOLBID invites the customer.** SOLBID stores an *intake*, not a project, and sends the customer a link (`/c/post?intake=…`).
5. **The customer confirms on SOLBID.** The customer signs in with the same mobile or email, completes the address, chooses the bidding mode and decides whether COLLABIZ may see progress. Nothing reaches vendors before this.
6. **SOLBID sends signed updates.** `intake.claimed`, `project.awarded` and `project.completed` go to `{COLLABIZ}/v1/public/integrations/solbid/events`. The referral shows *Invited → Live → Awarded → Completed* on SOLBID. Bid count and contract value appear only if the customer chose to share them. Admins can also **Refresh** (signed GET).
7. **Partners are notified, nothing is paid automatically.** The introducing partner is notified at each step; any reward follows their signed agreement.

## Security
- **Signing:** both directions use a shared secret with HMAC-SHA256 and a 5-minute timestamp window.
  - COLLABIZ → SOLBID signs `${ts}.${METHOD}.${path}.${rawBody}` and sends it in `x-collabiz-timestamp` / `x-collabiz-signature`.
  - SOLBID → COLLABIZ signs `${ts}.${rawBody}` and sends it in `x-solbid-timestamp` / `x-solbid-signature`.
- **Off by default:** each side returns 503 until its secret is set.
- **Admins only:** only Unite admins can hand a referral over, and each referral can be handed over once.
- **Reliable delivery:** SOLBID's updates go through its database job runner, which retries with back-off.

## Configuration
| COLLABIZ | SOLBID |
|---|---|
| `SOLBID_API_URL=https://<solbid-host>` (origin only) | `COLLABIZ_SHARED_SECRET=<same secret>` |
| `SOLBID_SHARED_SECRET=<same secret>` | `COLLABIZ_WEBHOOK_URL=https://<collabiz-api>/v1/public/integrations/solbid/events` |

## Tests and verification
- **COLLABIZ:** `apps/api/test/solbid.e2e.ts` (3 tests) runs against a fake SOLBID that checks signatures with SOLBID's own algorithm.
- **SOLBID:** `apps/api/test/integrations.spec.ts` (3 tests); SOLBID's full suite passes 59/59.
- **End-to-end:** run on 22 Nov 2026 with both real APIs running locally. A SunX lead was handed over and SOLBID created the intake and invited the customer. The customer registered with the same mobile, saw the pre-filled requirement and confirmed it (project SB-2026-16372). The signed `intake.claimed` update reached COLLABIZ, and the status pull matched.

## Open items
- **SOLBID changes not pushed:** the SOLBID side is committed locally on branch `claude/collabiz-integration` (from `claude/solbid-full-128-screens`). Pushing was refused by this session's permission settings; see the session notes.
- **Public stats missing from GitHub:** the deployed SOLBID site serves `GET /api/v1/public/stats` (the live board), but that endpoint is not in the GitHub branch. The live board in COLLABIZ works against the deployed site; the code behind it should be pushed to GitHub.
