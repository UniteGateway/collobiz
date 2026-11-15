# COLLABIZ Master Upgrade — Stage 00 audit and implementation plan

_Audit date: 2026-11-15 · Branch `claude/collabiz-platform-build` · Reconciles with `DEVELOPMENT_STATUS.md` and `docs/audit/` (not a replacement)._

## 1. What exists today

| Area | State | Where |
|---|---|---|
| Apps | Partner web (Next.js, 212 pages), admin console (63 pages), native app (Expo, 63 screens), NestJS API (33 modules, 174 tables), shared UI and types packages | `apps/*`, `packages/*` |
| Identity, organisations, roles, KYC/KYB, audit log, feature flags | Working, tested | `identity`, `onboarding`, `core.ts` |
| Opportunity marketplace (one canonical `opportunities` record, versioned status history, visibility rules, applications, saved searches, map) | Working — **but only Unite Group companies can publish**; partner-originated work enters as protected leads | `opportunities` |
| Protected leads, duplicate detection, Unite-first routing with review window, lead disputes | Working, tested | `leads` |
| Partner capacity (office, manpower, idle skills, what they want) | Working — narrow: office and people only | `offers` (`partner_capacity`) |
| Direct offers (Unite → partners), offer sales, offer → contract + commission | Working, tested | `offers` |
| Unite ventures (47) as promotable programmes, open only after clearance | Working | `ventures` |
| Contracts (versioned, second-person approval, hash-bound e-signature, wet-ink, certificate, amendments) | Working — **created only from a tender award or a direct-offer selection** | `contracts` |
| Projects (from executed contract), milestones → certification → invoice → paid | Working | `projects` |
| Earnings | Working for the commission ledger only; project receipts of an executing partner are not shown as earnings | `commissions` |
| XCHANGE barter (direct, part-cash, multi-party cycles), COLLABIZ ONE, rescue, revival, 48-hour team challenge, team builder, deal passport, JV contributions | Working, tested | `xchange`, `v2`, `teams` |
| Unite Solar Franchise & Store Partner network (plans, applications, territories, stock, five-stream ledger, settlements) | Working, tested (8 e2e tests + browser journey); LeadDNA and payment gateway not connected | docs/unite-solar/FRANCHISE_NETWORK.md |
| Franchise, property, solar desk, trading, tenders, ERP, GST, billing, comms/inbox, search | Working, tested | respective modules |
| Unite Power Dispatch (separate engineering app) | MVP + Modules 6–8 engine | `apps/power` |

## 2. Gaps against the Master Upgrade (core journey first)

| # | Journey step | Gap | Severity |
|---|---|---|---|
| G1 | **What I Have** | Only office/manpower capacity. No store, factory, machinery, warehouse, land, vehicles, skills, capital, customers, products, services, contracts. No multiple resources per organisation, no evidence/verification state per resource. | Blocking |
| G2 | **What I Need** | No structured needs profile at all. | Blocking |
| G3 | **Matching** | AI matching exists for opportunities by sector/region, but nothing is resource-first; no reverse matching (my need ↔ others' resources); no explanation of why a match was proposed; Unite programmes are not matched against resources. | Blocking |
| G4 | **Business Offers** | A partner cannot publish an offer (e.g. "50 seats, seeking support contracts"). No offer categories, expiry/renewal, zero-upfront flag, Draft → Pending verification → Active → Negotiating → Closed/Expired/Suspended/Rejected lifecycle, or moderation queue. | Blocking |
| G5 | **Partner application** | Exists (apply / shortlist / accept) but stops at "accepted" — nothing follows. | Blocking |
| G6 | **Commercial proposal** | No proposal/counter-proposal between the two parties of an application. | Blocking |
| G7 | **Agreement** | Contracts cannot be generated from an accepted proposal. | Blocking |
| G8 | **Execution** | Projects work once a contract exists — reusable as-is. | — |
| G9 | **Earnings** | The provider's project receipts are not shown; pipeline / contract / invoiced / collected are not separated per collaboration. | High |
| G10 | Navigation | Web has no COLLAB or BUSINESS OFFERS entry; mobile tabs are Home · Discover · Leads · Messages · Account instead of Home · Collab · Post · Inbox · Profile. | High |
| G11 | Unite-first on partner offers | Routing exists for leads only; partner-published offers need an optional, consented Unite review window. | Medium |
| G12 | Energy marketplace (Unite Green Park) | Not built. Should be a specialised opportunity type reusing offers, matching, proposals, contracts and the `power-engine` landed-cost calculator — not a separate system. | Medium (after core) |
| G13 | EQUITY9 hand-off | No integration; investment-type offers must be routed out, never transacted. | Medium; external dependency |

## 3. Duplicates and inconsistencies found

| Finding | Decision |
|---|---|
| Capacity is edited in two places (web `/settings/capacity`, app "Your capacity") and covers only office/manpower | Keep the table; expose it inside the new "What I have" profile so there is one place to declare resources. |
| Matching lives in three places (`/ai/matching`, `/feed`, COLLABIZ ONE team builder) | New Collab matching becomes the single resource-first entry; the others stay as specialised views. No new matching screen beyond Collab. |
| "Trading" and "XCHANGE" share one navigation module; "Opportunities" module has 10 tabs | Navigation regrouped: COLLAB and BUSINESS OFFERS become first-class; existing tabs untouched. |
| Mobile tab bar differs from the requested pattern | Change to Home · Collab · Post · Inbox · Profile; Leads stays one tap from Home. |
| Opportunity applications end at "accepted" while tenders and offers continue to contracts | Proposal → contract service added once and used by Business Offers (and later by programmes). |

## 4. Prioritised plan (do not add screens unless they carry the journey)

**Phase 1 — the core journey (now).** One new API module `collab` reusing opportunities, contracts, projects and notifications:
1. `collab_assets` (what I have — 15 kinds, evidence state, visibility) and `collab_needs` (what I need — 14 kinds).
2. Business offers = opportunities with `route = 'partner_listing'` plus `business_offer_details` (25 categories, lifecycle, expiry, zero-upfront, eligibility, consent for Unite-first review). One canonical record.
3. Deterministic, explainable matching (assets/needs ↔ offers, Unite programmes, and reverse matching against other partners' resources), unit-tested.
4. Proposals with counter-proposals on an accepted/shortlisted application; mutual acceptance generates an approved contract in Contracts (both parties' agreement is recorded as the approval), then the existing sign → project → milestone → invoice → paid flow.
5. Collab earnings: per collaboration, pipeline value, contract value, invoiced and collected kept separate.
6. Screens (web): **Collab** (have / need / matches — one page with three steps), **Business Offers** (browse + publish + my offers), **Offer detail with applications and proposal room**, **My collaborations** (agreement → project → earnings). Mobile: same four as native screens, new tab bar.
7. Moderation: admin queue for pending offers (approve / reject / suspend).

**Phase 2** — Unite programmes as Collab programmes (map ventures to asset kinds), Unite-first review window on consenting offers, invitations from reverse matches, offer renewal/expiry job, opportunity revival hook.
**Phase 3** — Unite Green Park energy vertical (plant/buyer registration as specialised offers and needs, power matching with landed cost from `@unite/power-engine`, deal stages, commission split on the existing ledger).
**Phase 4** — EQUITY9 discovery link (blocked: needs EQUITY9 API and agreement), franchise/XCHANGE/projects entry points from Collab matches, documentation set in `docs/master/`.

## 5. Status log

| Date | Item | Status |
|---|---|---|
| 2026-11-15 | Stage 00 audit and plan | Done (this file) |
| 2026-11-15 | Phase 1 core journey — API | **Done and tested**: `test/collab.e2e.ts` (7 tests) drives have → need → publish → moderation → matching → apply → shortlist → proposal/counter → accept → agreement → both sign → project → milestone certified → invoiced → paid, with the four money figures kept separate. 9 unit tests for matching and lifecycle rules (`packages/types/src/collab.test.ts`). Opportunity, contract and direct-offer regression suites still pass (26 tests). |
| 2026-11-15 | Phase 1 core journey — web | **Done and tested in a browser**: Collab (have / need / matches), Business Offers (browse, publish, my offers, detail with applications and suggested partners), proposal room, My collaborations; admin “Business offer checks”. Two browser journeys pass at 1440 px and 390 px (`scripts/e2e-suites.mjs`, suites “COLLAB ·”), no horizontal overflow on phone. |
| 2026-11-15 | Phase 1 core journey — native app | **Done, unit-tested**: tab bar is now Home · Collab · Post · Inbox · Profile (Discover and Leads stay reachable from Home); native Collab, Post, offer detail, proposal room and My collaborations (`apps/mobile/test/collab.test.tsx`, 5 tests; all 91 native tests pass). Not yet run on a device or simulator. |

### Not done yet (next, in order)
1. Unite programmes as Collab programmes with the configurable Unite-first review window on consenting offers (fields exist; routing not wired).
2. Invitations from reverse matches (today the suggested partners are listed; inviting them is not built).
3. Scheduled expiry reminders (expiry is applied on every read; no reminder job yet).
4. Unite Green Park energy vertical on the same records, using the `@unite/power-engine` landed-cost calculator.
5. EQUITY9 hand-off — blocked on an EQUITY9 API and agreement.
6. The `docs/master` registry files (module, screen, API, database, security, test reports) — this file is the current source of truth.
