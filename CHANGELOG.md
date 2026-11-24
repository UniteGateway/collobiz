# Changelog

All notable changes to COLLABIZ. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); stages from Master Book §8.

## [Unreleased]

### COLLABIZ VENTURE AI — Global Business Creation Engine (Phase 1–2 foundation)
- Phase 1 audit and integration plan; deterministic engines (weighted scoring with mandatory-check override, five-year financial model with sensitivity, Solar Conveyor PV/battery sizing, transparent role matching); `vai_*` tables (migration 0071); opportunity → Unite approval → Venture Room API with consent-based invitations, tasks, human approvals and AI agents (rules templates until a Claude key and budget are set; kill switch; run log with cost); member screens, admin console and six Sample pilots. See docs/venture-ai.

### COLLABIZ POWERTRADE — Do Business. Save on Power. Grow Together.
- New collaboration layer (COLLAB → Energy & Business Tie-Ups): join wizard, electricity profile, contributions, power comparison through the Power Lab engine (eligibility, provenance, objectives), energy + business and reverse matching, six collaboration models with documents, tax review and attributed workflow, benefit ledger with verification, collection and approved allocation, finance summary and calculator, admin review page, microsite section, ACTION OS connector, feature flag. Migration 0070. See docs/powertrade.
- Design v5: Apple type, navy sidebar, solid phone menu, vector logo, member home redesigned; cover figures removed.

### Unite Club
- A business club with local chapters (like Rotary, Lions or BNI): propose and approve chapters, apply with one seat per business category, officers and roles, chapter meetings with U meet rooms, RSVPs, service hours, consent-based referrals with member-reported business won. Public landing and chapter pages; members' dashboard; admin approvals. See docs/unite-club.md.
- UNIECO microsite filled from the Eco-Living Catalogue (range, Mighty Mug, benefits); brand products gain admin-editable range and benefits.

### Website content, guide chat, U meet and page redesign
- Admin-managed social links in a large footer on every page and a strip on signed-in pages; YouTube video library placed on pages, products and modules.
- COLLABIZ guide chat on every page with handover to the Unite team (Admin → Guide chats).
- U meet: instant meetings, video embedded in the room (Jitsi), attendee-only meeting chat.
- Public inner pages redesigned with photo heroes, mosaics and photo cards, each module with its own colour and layout.
- UNIECO eco tableware added as a Unite brand product. See docs/website-content-guide-umeet.md.

### Sunora Paints by Unite Group (2026-11-24)
- Sunora Paints added as a Unite brand product (sunora. microsite) with the Sunora logo and the Sunora Luxe tin as its product photo; dealer/store/franchise/manufacturer applications, matching and dealer routing as for other brand products. Brand products now carry a logo and product photo (admin form, directory tiles, partner cards). Migration 0065.

### Simpler, clearer site (2026-11-24)
- Organised around four paths — Buy from Unite, Sell Unite products, Grow my business, Earn as a partner — on the home page and a new /start page. Public header cut from 11 links to 5 with one Get started button; home page cut from 12 sections to 7 (detail moved to How it works and the footer); member menu regrouped with the long tail folded. No page removed. See docs/navigation.md.

### Add Unite brand products from one admin page; customers routed to local dealers (2026-11-24)
- Admin console → Unite brand products → Products: one form (name, web address, description, buyers, partner roles, matching rules, features, steps, OEM, colours); publishing creates the microsite, web address, partner applications, matching, dealer CRM and home-page listing without code changes. Products are now data (table brand_products, migration 0064).
- Buyers' enquiries on a brand microsite go straight into the CRM of the approved partner for their area (with consent), else to the Unite team.

### Unite brand products and channel partners (2026-11-24)
- Unite Cement, Steel, Ply, Carpets and Furniture microsites (cement., steel., ply., carpets., furniture.) with internal OEM manufacturer records (public only when a super admin allows). Distributor / dealer / store / franchise / manufacturer applications on every product microsite, the home page and /partner-with-unite; rules-based matching agent with reasons; admin review (shortlist, approve with territory, decline with reason); dealer dashboard with a product-tagged sales CRM. Migrations 0062–0063. See docs/unite-brand-products.md.

### BIZO connected by file, linked to bizo.one (2026-11-24)
- Pricing removed from the BIZO microsite. Start free / Log in open the BIZO app (leaddna.bizo.one); every feature links to its bizo.one page; BIZO industry pages linked. Members' BIZO page: app links, industry link, partner links, lead exchange both ways (customer import; BIZO-ready CSV export that withholds contacts without outreach consent, neutralises formulas, audited). BIZO on Industry Club boards for trading and exports.

### Unite Biofix — Bio-CNG and green hydrogen microsite (2026-11-23)
- Biofix becomes the Bio-CNG and green hydrogen business: microsite with features, workflow, public programmes (facts only) and a validated register (feedstock type and tonnes/day, land, Bio-CNG/manure/hydrogen offtake, EPC/O&M partners) with live totals. Industry Club: new Bio-energy choice and Bio-CNG / green hydrogen power requests, counted as Biofix demand. Migration 0061.

### Wave 3 — 17 Unite businesses connected (2026-11-23)
- Live module feeds on the pages of EV Saathi, ELWIN, SOCPOST, PRIZO, Unite Biofix, Unite Aqua (items a visitor can ask about, routed to the business and the listing owner without contact details); WAKIN, VIDPLAY, 99Films and MoveOn post real micro-contracts; Help Today, Goodtime, WITHME, WEEKEND, iBrain, U meet and Nano Bazar show live counts from Community, Announcements, ACTION OS, Meetings and Business QR. Admins see the listing on each enquiry. No business is "link only" any more.

### Industry Club: virtual agreements, legal drafts, Terms and Conditions, global reach (2026-11-23)
- Five versioned legal drafts (Club terms, Brand Licence & OEM Supply, mutual NDA, international distribution, collaboration MoU), with a counsel-approval record per version and a pilot-draft notice until approved.
- The brand licence is issued on Unite approval and signed online by both parties; the product is listed only after both sign. Members send each other agreements by club code, in any country, with a choice of law and forum.
- Members, products and markets can be anywhere in the world (ISO countries, currency, made-in). Public pages: `/club/terms`, `/club/legal`. Migration 0060.
- Fixed: the production setup check now ignores Club templates, and the setup test reflects the 48 Unite businesses (BIZO).

### Unite Industry Club (2026-11-23)
- The join module becomes the Unite Industry Club: sell under the Unite Powertek brand (OEM), with Unite review (four checks, including a signed brand licence) that lists approved products in the Powertek catalogue for every partner to sell; free-power offers with products; buy-power requests handled by the energy desk; opt-in public member pages; admin console page. Migration 0059. See `docs/unite-industry-club.md`.

### Join as any industry + My collaboration board (2026-11-23)
- Public `/join` wizard: industry, then ways to collaborate with Unite Group (free power, solar-integrated products, EPC, barter, trading, exports/imports, promoting Unite businesses, property, work, learning, launch); choices are kept through sign-up.
- `/board`: one live card per choice, matched Unite businesses and member offers with reasons, peers in the same industry. Table `collab_join_profiles` (migration 0058). See `docs/join-any-industry.md`.

### Stage 12 — Commission ledger & finance (2026-11-06)
- Commission policies (two-person activation), agreements with frozen hashed terms, a ledger earned only on customer payment, dual approval, payout requests, idempotent single-use settlements, tax records, holds/reversals, commission and payment disputes, and feature-flagged finance introductions; screens 027, 095–104, 135, 138, 157–159 (web/admin) and 095/100/158 (native).
- Fixed: lead-evidence seal hash omitted nested fields; all JSON hashes now use canonical JSON (jsonb-safe). Opportunity map now queries located listings server-side.

### Stage 11b — Trading & procurement (2026-11-06)
- Supplier products, buyer requirements, threaded enquiries with exclusive-distributor routing, private quotations with buyer-only comparison, purchase orders (locked once issued, append-only history), shipping with line-by-line goods receipt and proof of delivery, distributor territories with overlap checks, and evidence-backed claims with escalation; screens 085–094 (web) and 088 (native).
- Changed: global API rate limit is configurable (`API_RATE_LIMIT`); deployment requires `X-Forwarded-For` from the load balancer.

### Stage 11a — Project execution (2026-11-06)
- Projects started from executed contracts: baseline approval, milestone planning, subcontractor allocation, site updates with photos (web + native), materials, versioned documents, quality/safety inspections with NCRs, owner-only evidence-based certification, invoicing, payment recording, hashed completion certificate and closure, with an append-only change log; screens 075–084.
- Fixed: PATCH endpoints (tender, catalogue item, CRM customer, milestone) silently reset omitted fields to schema defaults; new `patchOf()` helper.

### Stage 10 — Contracts & document vault (2026-11-06)
- LOI, work order and contract drafted from the tender award; versioned drafts, two-person approval, approved versions locked by a database trigger, hash-bound click-to-sign by both parties, amendments that supersede on execution, termination; documents & agreements vault; screens 074 and 148.

### Stage 09 — Tenders, RFQs & sealed bids (2026-11-06)
- Tender lifecycle (draft → publish → close → open → technical → commercial → negotiation → award/cancel) with encrypted, hash-sealed two-envelope bids, seal verification at opening, evaluator conflict-of-interest checks, staged envelope disclosure, weighted comparison, negotiation with versioned price revisions, and platform oversight; screens 065–071, 073 (web) and 137 (admin).
- Fixed: web/admin `useQuery` loading flag was briefly false when a dependent path became available, crashing pages that read the data.

### Stage 08 — Partner matching & teams (2026-11-06)
- Partner directory, find partners, explainable consent-gated match suggestions, collaboration teams and consortiums with invitations, NDA signing, roles, versioned commercial sharing proposals, activation and NDA-gated workspace; screens 055–064, 124, 154–156 and native 059.

### Stage 07 — CRM & pipeline (2026-11-06)
- Customers, deals with versioned stage moves and activity audit, follow-up tasks with calendar, activity centre, lead conversion timeline; leads auto-open deals; screens 028, 030, 052–054 (web) and native 030/053.

### Stage 06 — Lead protection & Unite-first routing (2026-11-06)
- Protected lead registration with sealed evidence, consent checks, evidence-based duplicate review, 90-day protection, Unite-first review with business-hours SLA (pause/escalate/auto-release policy), consent-gated release to the partner exchange, verifiable certificates and ownership disputes with appeal; screens 026, 043–051, 132–134, 151–153 (web/admin) and native 026/043/048/050/051/151.

### Stage 05 — Opportunity marketplace (2026-11-06)
- Marketplace with audience-specific visibility, search, categories, map, eligibility, idempotent applications, saved searches with alerts, explainable recommendations, dashboard KPIs, public RFQs and Unite route-A publishing; screens 006, 009, 023–025, 031–038, 040–042 (web) and 023/031/036/042 (native).

### Stage 04 — Catalogue (2026-11-06)
- Group companies with legal entities, business units, catalogue with visibility and price-disclosure rules, success stories; screens 004, 005, 008, 039, 128, 136.
- Fixed: unique-constraint conflicts in transactions returned 500 instead of 409.

### Launch-readiness audit (2026-11-06)
#### Added
- `docs/launch-readiness-report.md` (verdict NO-GO), `docs/deployment.md`, `docs/runbooks/backup-restore.md`, `.env.production.example`, `apps/mobile/eas.json`, `infra/backup/{backup,restore}.sh`, `scripts/a11y-scan.mjs`.
#### Fixed / Security
- `multer` upgraded to 2.5.0 (high-severity DoS advisory).
- Web/admin `/api/v1` proxy now resolved at runtime (container images failed with 500).
- WCAG 2.2 AA: accessible muted-text and action-green tokens; invalid ARIA on homepage chips.
- Oversized bodies return 413; CSP + HSTS on web/admin; Swagger UI off in production; demo seed refuses production; backups written with mode 600; Docker builds accept a corporate CA.

### Stage 03 — Onboarding and KYB (2026-11-06)
#### Added
- Partner onboarding 013–022 (web + native), KYC/KYB private document upload with validation, scanning and signed links, encrypted bank & tax profile, agreement e-acceptance with evidence, idempotent submission.
- Admin verification queue and dossier (130), risk & compliance centre with automatic flags and four-eyes clearing (131), privacy & data rights (149), partner profile (143).
#### Fixed
- Resubmission possible after a document rejection; prefilled forms overwriting input; unsignable short agreements; raw rate-limit message; 390 px overflow of hashes.

### Stage 02 — Identity, tenant permissions and security (2026-11-06)
#### Added
- Registration, login with lockout and rate limiting, rotating refresh tokens with reuse detection, email/SMS OTP, TOTP MFA (mandatory for admins), password change, session management, team invitations.
- Tenant context validated against memberships; capability-based authorization; admin capabilities require MFA-verified sessions.
- Screens 011, 012, 129, 141, 144, 145 (web/admin) and native mobile 011, 012, 145; baseline 023.
- Admin user/role management with reasons and self-privilege protection; audit browser with hash-chain verification; security summary.
- Demo seed data; OpenAPI export (`docs/api/openapi.json`).

### Stage 01 — Repository foundation and design system (2026-11-06)
#### Added
- Monorepo (pnpm): API (NestJS 11), web + admin (Next.js 16), mobile (Expo SDK 58), shared `types`, `ui`, `config` packages.
- COLLABIZ design system: brand tokens from the approved logo, responsive stylesheet (1440/1024/768/390/360), accessible components with loading/empty/error/permission-denied states; token parity web ↔ mobile.
- Shared domain package: roles/capabilities, 15 state machines, Zod schemas, SLA business-hours calculator, duplicate scoring, commission calculator, explainable matching, reputation scoring, 165-screen catalogue.
- API foundation: auth/tenant guard, CSRF double-submit, throttling, hash-chained audit log, idempotency keys, private storage with signed URLs and scan hook, mail outbox, health/meta endpoints, OpenAPI.
- Public screens 001, 002, 003, 007, 010 (contact enquiries API); design-system preview; live screen registry.
- CI workflow, Docker images, docker-compose; Playwright smoke tests.
- Requirements index, architecture, assumptions/blockers, screen registry (CSV + Markdown).
