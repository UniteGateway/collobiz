# COLLABIZ — roadmap to a finished, launched application

_Prepared 23 Nov 2026. Timelines are estimates and assume the decisions and accounts in Phase 0 arrive on time._

**Where we are**
- **Built:** about 100k lines of code, about 465 screens, 939 API endpoints and 245 tables.
- **Tested:** about 750 server and unit tests, 76 browser journeys, accessibility clean.
- **Unite businesses:** 37 of the 48 are connected (Wave 3 finished on 23 Nov 2026), 1 needs an external API (BIZO) and 10 are waiting for regulatory clearance.
- **Not yet in place:** deployment, real data, live third-party services, a security audit and real users.

**Owners:** **Dev** = engineering (can be done in this project). **Unite** = decisions, accounts, legal or people that only Unite Group can provide.

---

## Phase 0 — Decisions and access (week 1) · owner: Unite
These block later phases, so they come first.

| # | Item | Blocks |
|---|---|---|
| 0.1 | Push SOLBID integration branch `claude/collabiz-integration` and the latest deployed SOLBID code to GitHub | SOLBID go-live |
| 0.2 | GO EB5 contracting entity: CITRUS360 LLC or Unite Group Inc. (with counsel); counsel approval of the fee terms and the agreement template | GO EB5 go-live |
| 0.3 | Commission rules: SOLBID success-fee share, Unite business referral rewards, partner agreement template | Payouts |
| 0.4 | Pilot scope: which modules are on at launch (recommended list in Phase 5) | Phase 5 |
| 0.5 | Domain for COLLABIZ and the product subdomains (`*.domain`) | Phase 4 |
| 0.6 | Cloud account (recommended: AWS Mumbai region) and a billing owner | Phase 4 |
| 0.7 | Accounts and keys: Razorpay; SMS with DLT-registered templates (MSG91 or similar); WhatsApp Business; email (Amazon SES or similar); e-sign; GST/GSTIN verification provider; Pexels API key (optional) | Phase 3 |
| 0.8 | BIZO API documentation and credentials | BIZO integration |
| 0.9 | Real master data: Unite Group companies, products and prices, property projects and units, courses, solar kits and prices | Phase 1.4 |

---

## Phase 1 — Finish the product (weeks 1–4) · owner: Dev

| # | Work | Done when |
|---|---|---|
| 1.1 | ✅ **Done 23 Nov 2026 — Wave 3: connect the 17 link-only businesses** — 99Films/MoveOn/Unite Biofix → data rooms and contracts; EV Saathi/ELWIN/WITHME → capacity bookings; WEEKEND → announcements; Help Today/Goodtime → community; Nano Bazar → Business QR storefronts; SOCPOST/VIDPLAY/PRIZO → business offers; iBrain → ACTION OS; U meet → meetings; WAKIN → teams; Unite Aqua → Powertek products | Each shows "Connected" with tests |
| 1.2 | **BIZO** single sign-on and data sync | After 0.8; tests pass |
| 1.3 | **Mobile app parity** for recent features: business pages, solar quote, partner links, GO EB5 portal, the Google-style restyle | Mobile E2E pass; Android and iOS builds |
| 1.4 | **Real data import** — replace demo data with Unite's master data (0.9), using the existing Excel/CSV/Tally importers; remove the demo banner in production | Data reviewed by Unite |
| 1.5 | **Content pass** — About, How it works, Terms, Privacy, FAQs and help articles in final wording; Hindi and Telugu for the public pages (optional) | Signed off by Unite |
| 1.6 | **Admin onboarding tools** — bulk invite partners, approve KYC/KYB queues, assign operating companies to every business | Admin dry run |

## Phase 2 — Production hardening (weeks 3–6) · owner: Dev + external auditor

| # | Work | Done when |
|---|---|---|
| 2.1 | Security review and **external penetration test** (OWASP Top 10, authentication, multi-tenant isolation, file uploads, webhooks) | Critical/high findings fixed |
| 2.2 | **Load test** at the target scale: 1M registered, 100–150k monthly active, peak about 500 requests per second; add database indexes, caching and read replicas where needed | p95 < 500 ms at peak |
| 2.3 | **Backups and disaster recovery**: point-in-time database restore, a tested restore drill, storage versioning | Restore drill documented |
| 2.4 | **Monitoring**: uptime, errors (Sentry or similar), logs, alerts for queue, payment and webhook failures | On-call runbook |
| 2.5 | **India DPDP Act 2023** compliance: consent records, data-retention schedules, data-principal requests (export/delete), breach procedure; privacy notice update | Legal sign-off |
| 2.6 | Antivirus scanning on uploads (as in SOLBID), dependency audit, secrets in a vault | Clean audit |
| 2.7 | Full regression: all API, browser and accessibility suites green on the staging build | 100% green |

## Phase 3 — Connect live services (weeks 4–7) · owner: Dev, after the 0.7 accounts

Switch from the development stand-ins to real providers, one at a time, on staging first:
- **Payments:** Razorpay, including subscriptions and the payout records (manual payouts first).
- **Messaging:** SMS OTP and notices (DLT templates), WhatsApp templates, email (SES) with SPF/DKIM/DMARC.
- **Documents and storage:** e-sign provider; S3 storage.
- **Compliance services:** GST e-invoice and GSTIN/PAN checks.
- **Other systems:** SOLBID shared secrets on both sides; ERPNext (if used).

Done when every adapter passes its contract tests against the real provider sandbox, then production.

## Phase 4 — Deploy (weeks 6–8) · owner: Dev + Unite (accounts)

| # | Work |
|---|---|
| 4.1 | Infrastructure as code: managed Postgres, Redis, app containers (API, web, admin, Power Lab), CDN, object storage, Mumbai region |
| 4.2 | Separate **staging** and **production** environments; CI/CD with tests before every deploy; blue-green or rolling releases |
| 4.3 | DNS: main domain, admin, API and wildcard product subdomains; TLS certificates (including the wildcard) |
| 4.4 | Production start-up guard: refuses dev secrets or stand-in providers (as SOLBID already does) |
| 4.5 | Mobile apps: Play Store and App Store listings and builds (EAS), privacy labels |
| 4.6 | Go-live checklist (`docs/pilot` pack) signed |

## Phase 5 — Pilot (weeks 8–12) · owner: Unite + Dev support

- **Users:** 50–200 invited partners in 1–2 states (for example AP and Telangana).
- **Modules switched on (recommended):** sign-up and KYB, opportunities and protected leads, CRM, the Unite Solar desk and solar quotes, Unite business pages and enquiries, SOLBID hand-off, commission ledger (record only), admin console. Everything else stays behind its on/off switch.
- **Measure** weekly: activation, leads registered, quotes, conversions, support tickets, errors.
- **Fix and improve** in weekly releases; in-app pilot feedback is already built.
- **Exit criteria:** no critical bugs for 2 weeks, partners transacting, payouts reconciled manually.

## Phase 6 — Public launch (months 3–6)

- Switch on modules in stages: teams and tenders, projects, micro-contracts and capacity, offers and XCHANGE, property, learning, GO EB5 (after 0.2).
- Regulated businesses go public one by one as clearances arrive (UGROW, GREEN WALLET, HNW Club, FreeTicket, Payslip, Power Partner, PowerBank, Unite Digital Bank, Bestpe, Universal Trade Coin).
- Teams: support desk, KYC/verification staff, partner success, sales.
- Marketing: product subdomains live, partner referral programme, SEO via the sitemap.

## Phase 7 — Scale to 1 million users (months 6–18)

- Infrastructure: read replicas and connection pooling, queue workers scaled separately, search engine (OpenSearch) for listings, CDN for media.
- Regional languages across the partner app; WhatsApp-first flows for smaller partners.
- AI: matching and lead-scoring with a live model (the AI provider switch is ready), copilots for quotes and tenders.
- Automated payouts once commission rules and the finance controls are proven.
- Data: analytics warehouse, partner dashboards, investor reporting.

---

## Timeline at a glance

| Weeks | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9–12 | Months 3–6 | 6–18 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 Decisions and access | ■ | ■ | | | | | | | | | |
| 1 Finish product | ■ | ■ | ■ | ■ | | | | | | | |
| 2 Hardening | | | ■ | ■ | ■ | ■ | | | | | |
| 3 Live services | | | | ■ | ■ | ■ | ■ | | | | |
| 4 Deploy | | | | | | ■ | ■ | ■ | | | |
| 5 Pilot | | | | | | | | ■ | ■ | | |
| 6 Public launch | | | | | | | | | | ■ | |
| 7 Scale | | | | | | | | | | | ■ |

**Critical path:** Phase 0 decisions → live-service accounts (0.7) → deploy (Phase 4) → pilot. Product work (Phase 1) and hardening (Phase 2) run alongside.

## Budget pointers (see the earlier estimate)
- **Pilot running cost:** about ₹3–8 lakh a month (cloud, messages, services) plus the core team.
- **External penetration test:** about ₹3–10 lakh, once before launch and then yearly.
- **At 1M users:** about ₹1.2–4.5 crore a month, mostly people.
