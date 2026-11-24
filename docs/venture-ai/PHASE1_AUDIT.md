# VENTURE AI — Phase 1 audit and integration plan (2026-11-24)

**Stack:** pnpm monorepo · NestJS 11 + Drizzle + PostgreSQL (API) · Next.js (web, admin) · Expo (mobile) · shared Zod
rules in `packages/types` · design system in `packages/ui`. Auth: JWT sessions with org memberships and platform roles
(super_admin, unite_admin, finance, compliance…); MFA for admins. Deployment: Docker images (`deploy/`), not touched.

## Reused — not rebuilt
| Need | Existing part |
|---|---|
| Members, companies, roles, verification | `users`, `organizations`, `memberships`, KYB onboarding |
| What a member can contribute (partial) | `collab_join_profiles` (industry, intents), `collab_assets`/`collab_needs`, `partner_capacity`, POWERTRADE `pt_contributions` |
| Brands and product microsites | `brand_products` (admin creates a product → microsite, channel applications, dealer CRM) |
| Dealers, distributors, franchise | `channel_applications`, Franchise OS, Unite Solar network |
| Agreements | Contracts engine (versions, SHA-256 typed signatures, vault), agreement templates with counsel approval |
| Earnings | `commission_*` ledger, payouts, settlements (COMEARN = this ledger) |
| RFQs, quotations, POs, shipments | Trading module |
| Leads and lawful outreach | Growth Desk (lawful-contact rules, drafts need approval), CRM, LeadDNA via BIZO CSV |
| Weekly plans, reminders | ACTION OS connectors |
| AI provider switch | `AI_PROVIDER` = `rules` (default) or `anthropic`; no model client existed — added in Venture AI as an adapter |

## Name collision
`unite_ventures` already means *Unite businesses*. Venture AI uses its own `vai_*` tables, the `/venture-ai` route and the
words *opportunity* and *Venture Room*.

## Integration strategy
1. Deterministic engines in `packages/types/venture-ai.ts` (scoring, financial model, combination sizing, role matching)
   — numbers never come from a language model.
2. Provider adapter in the API: `rules` writes structured template drafts labelled as templates; `anthropic` (Claude) is
   used only when an API key is configured and the AI kill switch is off; every run is logged with provider, tokens, cost
   estimate and status. Output from a model is advisory text, never a financial record.
3. Human approval for opportunity publication, Venture Room creation, invitations' binding roles, agreements and any money.
4. Demonstration pilots are created on request by an admin and stored with `sample = true`, shown with a Sample badge and
   excluded from analytics.

## Blockers needing the owner
- Anthropic (or other) API key and a monthly AI budget — not configured; without it the agents produce rule-based templates.
- Image-generation provider for logos and packaging — not configured; the studio produces naming and brief text only.
- Market-data sources (UN Comtrade, licensed trade data, web search) — keys/licences not available; evidence is entered by
  members/admins with source and date.
- Legal review of all agreement templates before any is used for signing.
