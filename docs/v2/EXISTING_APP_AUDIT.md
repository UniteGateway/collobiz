# COLLABIZ V2.0 — Existing application audit (Stage 00)

Audited 2026-11-09 on branch `claude/collabiz-platform-build`. This is an upgrade of the existing application; nothing below is rebuilt.

## Stack and repositories
| Part | Technology | Location |
|---|---|---|
| API | NestJS 11, Drizzle ORM, PostgreSQL 16, Zod validation | `apps/api` |
| Partner web + public site | Next.js 16 (app router) | `apps/web` |
| Administration portal | Next.js 16 | `apps/admin` |
| Android / iOS | Expo (React Native), Expo Router | `apps/mobile` |
| Shared rules, schemas, engines | TypeScript | `packages/types` |
| Design system | React components + `styles.css` (v3 Apple-style layer), tokens shared with native | `packages/ui` |
| Business operations | ERPNext v16 + Frappe HR + India Payroll/Compliance (docker stack, connector with sample fallback) | `infra/erpnext`, `apps/api/src/modules/erp` |

One monorepo (pnpm). 26 non-destructive migrations (`apps/api/drizzle/0000`–`0025`). Screen registry: 165 screens (`packages/types/src/screens.ts`) plus 54 later pages swept as X01–X54.

## Identity, roles, security
- E-mail/password with MFA (TOTP) for platform staff; OTP e-mail/phone verification; sessions; per-organisation memberships.
- Platform roles: super_admin, unite_admin, finance, compliance, routing, evaluator. Organisation roles: org_owner, org_admin, member. Capabilities checked server-side; screens mirror the rules (`apps/web/lib/access.ts`).
- Append-only audit log on every material action; private object storage with magic-byte checks and signed links; rate limits on public forms.

## Modules present (all with real APIs, database tables and tests)
| Area | What exists |
|---|---|
| Onboarding & KYB | 4-step onboarding, KYC/KYB uploads, verification queue, risk review |
| Opportunity marketplace | Listings, search, filters, saved searches/alerts, map view, categories, eligibility rules explaining failures, applications |
| Lead protection | Lead wizard with buyer consent, CZL- registration certificate (public verify), Unite-first priority review with SLA, conflicts, disputes with evidence, rulings and appeal |
| CRM | Pipeline, deals, tasks, activity, timeline |
| Collaboration | Teams and consortiums (named parties, roles, work shares, NDA hashes), invitations, joint workspace, JV & alliance proposals (123) |
| AI (rules engine; LLM switchable) | Partner matching with explainable factors, AI team builder (roles + ranked candidates per opportunity), proposal drafts, AI monitoring |
| Tenders | Tender admin, documents, eligibility, bids, scoring, negotiation |
| Projects | Portfolio, milestones (start → submit → certify → invoice → paid), site updates, certification |
| Trading | Supplier products, requirements/RFQs, quotations, purchase orders, shipping |
| Commissions | Policies, agreements with frozen terms, ledger (estimated → eligible → earned → approved → invoiced → settled; on hold, disputed, reversed), payouts, commission disputes |
| Global | Country partner registration, territory dashboard, import/export enquiry desk, cross-border compliance checklist, languages/currencies |
| Direct offers & ventures | Unite offers to partners, offer sales, 47 Unite businesses |
| Growth Desk | Lawful lead database, agents, drafts, approvals, opt-out |
| Workspace (Unite OS) | Apps launcher (34 apps), companies, meet, search, HR, payroll, finance, inventory, manufacturing, POS, procurement (ERPNext) |
| Franchise, Real estate | Franchise network with checklist and royalty; property inventory with RERA-checked partner holds |
| Unite Solar desk | Kit/EPC/PPA quotes, PDF bill auto-quote, kits, commission, referrals |
| Promotions | BOGO engine, online store, store vouchers, ERPNext pricing rules |

## Mobile (Expo)
46 native screens with tests (tab shell: Home, Discover, Leads, Messages, Account; offers, ventures, projects, earnings, global, trading, chat, learning, onboarding…). Later web features (solar, franchise, property, store, workspace) are web-only for now. No store builds have been produced (blocker B-06: signing accounts).

## Tests at audit time
API 272/272 (33 suites), browser journeys 85/85, axe 51 pages clean, native 77/77, UI 31/31, web 8/8, engine 38/38, lint clean. No known failures.

## Known UI state
Design system v3 (Apple-style) applied globally on 2026-11-09; all 219 pages swept at 1440 and 390 px with one false positive. Older native screens use shared components but have not had a full visual redesign.
