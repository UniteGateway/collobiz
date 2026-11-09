# COLLABIZ pilot plan (one page)

**Prepared:** 9 Nov 2026 · **Owner:** _(Unite Group pilot owner)_ · **Length:** 8 weeks · **Status:** proposal for approval

## Why
Test the core idea with real partners before a wider launch. The idea: Unite Group sends business **directly** to verified partners, they sell and deliver, and everyone sees the agreement, the sale and the commission in one place. The pilot is cheap, reversible and measured. **No earnings are promised to partners.**

## What we test

| # | Question the pilot answers | How we know |
|---|---|---|
| 1 | Will partners sign up and get verified without hand-holding? | Partners verified within 5 working days of invitation |
| 2 | Do direct offers turn into real sales? | Offers answered, partners selected, sales registered, sales won |
| 3 | Does the money trail work end to end? | At least one sale goes from offer to signed agreement to customer payment to commission "Earned" to paid |
| 4 | Do partners find it useful and easy enough to keep using? | Weekly in-app check-in: usefulness, ease, recommendation score, would-continue |
| 5 | Can Unite run it with the current team? | Hours per week spent by Unite staff; support requests and response time |

## Scope
- **One Unite business, recommended SOLCART** (Unite Solar): solar products, kits and local installation. It is already open to partners, has a clear product and price, and fits the existing partner base.
- **Optional, from week 5: one non-solar business** to test the "all Unite verticals" promise. Recommended: **Nano Bazar** (bringing local shops online) or **Unite Learning** (bringing colleges).
- **10–20 invited partners** in 2–3 states:
  - EPC/installer companies;
  - electrical and solar distributors;
  - 2–3 independent consultants.

  Pick a mix: about 5 who already work with Unite, and the rest new.
- **People:** pilot owner (≈ 4 h/week), one Unite Solar sales/operations person (≈ 6 h/week), finance approver (≈ 1 h/week), IT support (≈ 2 h/week).
- **Channels:** partner web app and mobile web. A native app build is optional (testers only).
- **Out of scope:**
  - tenders;
  - investment or finance businesses (they stay locked);
  - international partners;
  - store-published mobile apps;
  - paid marketing.

## Timeline

| Week | Milestone |
|---|---|
| −2 to 0 | Decisions and accounts (go-live checklist §1). Legal review returned. Real commission rates approved. Server set up, backups tested. |
| 1 | Invite the first 5 partners and run a 30-minute onboarding call. Verify their companies. Send the first SOLCART direct offer. |
| 2 | Invite the remaining partners. Select partners for the first offer. Agreements and commission terms are drafted and signed in the app. |
| 3–4 | Partners register customers and sales. Weekly check-ins start. First review meeting at the end of week 4. |
| 5–6 | Optional second business. Fix the top issues from check-ins. Push for the first paid sale and commission. |
| 7 | Final check-ins. Data export. |
| 8 | **Go / adjust / stop** decision meeting, using the metrics below. |

## Success metrics, measured in the app

| Metric | Target by week 8 | Where to see it |
|---|---|---|
| Partners verified | ≥ 10 | Admin → Verification queue |
| Offers answered within the deadline | ≥ 70% of recipients | Admin → Direct offers |
| Sales registered under offers | ≥ 15 | Offer → Sales |
| Sales won | ≥ 3 | Offer → Sales |
| Paid sale with commission earned and settled | ≥ 1 | Admin → Settlements |
| Usefulness (1–5) | ≥ 4.0 | Admin → **Pilot feedback** |
| Ease of use (1–5) | ≥ 3.5 | Admin → Pilot feedback |
| Recommendation score (−100 to +100) | ≥ 20 | Admin → Pilot feedback |
| "Would keep using" | ≥ 70% yes | Admin → Pilot feedback |
| Support requests answered within 24 h | ≥ 90% | Support tickets: the staff view in the partner web app, for a support/compliance role |
| Serious incidents (data loss, wrong payout, security) | 0 | Incident log |

**Decision rule (week 8):**
- **Go:** most targets met and no serious incident. Plan the wider launch, using section 9 of the checklist.
- **Adjust:** usefulness is at least 3.5 but sales or ease are below target. Fix the top 3 issues and run 4 more weeks.
- **Stop or rethink:** usefulness is below 3.5, or a serious incident happened.

## Weekly rhythm
- **Monday:** pilot owner reviews Pilot feedback, the support queue and offer responses (30 minutes).
- **Wednesday:** 15-minute partner call, open to all pilot partners (optional).
- **Friday:** the pilot owner presses **Send reminder** on Admin → Pilot feedback. Every verified partner contact who hasn't checked in that week gets an in-app reminder for the two-minute check-in (Help & support → Pilot check-in).
- **Every two weeks:** 1-hour review with Unite management, using the admin dashboards and the exported CSV.

## Risks and how we handle them

| Risk | Mitigation |
|---|---|
| Partners expect guaranteed income | The pilot letter and partner terms say clearly that earnings depend on paid customer sales |
| Commission disputes | Rates are fixed in the signed agreement. Commission becomes "Earned" only when the customer pays. Disputes go to the built-in dispute process. |
| Data protection | India-region hosting, encrypted bank/PAN fields, a reviewed privacy notice, and daily encrypted backups |
| E-mail codes not arriving | SPF/DKIM set up before launch. Support can resend codes. A test sign-up on launch day. |
| Low activity | Choose partners with real customer access. Send the first offer in week 1. Hold a call with any partner silent for 10 days. |

## Pilot invitation letter (template)
> Dear _(name)_,
>
> Unite Group is inviting a small number of trusted partners to pilot **COLLABIZ**, our new partner platform, for eight weeks from _(date)_. Through COLLABIZ you will receive offers directly from Unite Group businesses, starting with SOLCART. You will be able to accept them or propose your own price and terms, register your customers and sales, and follow your agreements and commission in one place.
>
> This is a pilot. Some features will change based on what you tell us. Commission is earned only when the customer pays, under the agreement you sign in the app. No income is guaranteed. Each week we will ask for a two-minute check-in (Help & support → Pilot check-in).
>
> Your invitation link: _(link)_. Questions: _(pilot owner name, phone, e-mail)_.
>
> _(Signature)_
