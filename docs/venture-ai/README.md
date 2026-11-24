# COLLABIZ VENTURE AI — Global Business Creation Engine

A layer inside COLLABIZ (not a separate app) that turns a real market gap into a product, checks the numbers, and forms a team of
COLLABIZ members to build it. Feature flag `FEATURE_VENTURE_AI` (default on). Phase 1 audit: [PHASE1_AUDIT.md](PHASE1_AUDIT.md).

## What exists now (Phase 1–2 foundation + Solar Conveyor pilot)

| Area | Where | Status |
|---|---|---|
| Engines (scoring, financial model, sensitivity, Solar Conveyor sizing, role matching) | `packages/types/src/venture-ai.ts` | Done, 8 unit tests |
| Tables `vai_capabilities`, `vai_opportunities`, `vai_evidence`, `vai_ventures`, `vai_members`, `vai_tasks`, `vai_approvals`, `vai_agent_runs` | `apps/api/src/db/schema/venture-ai.ts`, migration 0071 | Done |
| API | `apps/api/src/modules/venture-ai/venture-ai.controller.ts` | Done, 8 API tests (`test/venture-ai.e2e.ts`) |
| AI provider adapter (rules templates; Claude when a key is configured) | `apps/api/src/modules/venture-ai/provider.ts` | Rules path tested; Claude path **blocked** on an API key and admin-set token prices |
| Member screens | `/venture-ai`, `/venture-ai/opportunities`, `/venture-ai/new`, `/venture-ai/opportunities/[id]`, `/venture-ai/capabilities`, `/venture-ai/rooms/[id]` | Done, browser journey "VENTURE AI" |
| Admin console | admin `/venture-ai` (review, AI controls, runs and cost, pilots) | Done |

## Flow

1. A member business (owner/admin) proposes an opportunity: problem, market gap, target customers, solution, roles needed, evidence. It is a **private draft**.
2. Evidence is labelled **verified fact** (needs a source and a date), **assumption** or **forecast**.
3. **Score** — eight criteria with default weights: market demand 20, profitability 20, supplier readiness 15, competitive advantage 10, capital availability 10, member capability 10, scalability 10, regulatory readiness 5. Missing criteria are listed, never guessed. 80+ = priority, 65–79 = validate first, below 65 = uncertain. Any failed mandatory check (legal, financial, engineering, safety) classifies it as **blocked** whatever the score, and the API refuses to approve it.
4. **Financial model** — deterministic: channel margins, freight, duty, packaging, marketing, fixed costs, capex, working capital, tax → five-year P&L and cash flow, contribution per unit, break-even, payback, ROI, IRR, and sensitivity (price −10%, cost +10%, volume −20%). Each recalculation is a new version.
5. **Combination studio** — the Solar Conveyor pilot: motor kW × hours × load factor → kWh/day → PV kWp (peak sun hours, performance ratio) and battery kWh (backup hours, depth of discharge), cost and grid power avoided. Labelled "not certified engineering"; default costs are placeholders to be replaced by supplier quotes.
6. Submit → **Unite admin approves** (or not, with a reason) → a **Venture Room** opens with the proposer as owner.
7. **Role matching** — every member capability profile is scored per role with a transparent percentage (role, categories, countries, investment range, certifications, availability, verification, completed collaborations), with reasons and gaps. The proposer's own business is excluded. **No contact details are returned.**
8. The owner **invites** a member for a role, stating what they would do, how they earn and the risks. The member **accepts or declines**; only then can they see the room.
9. In the room: members and open roles, tasks and milestones, **human approvals** (binding agreements, financial commitments, payments, purchase orders, public claims, sensitive data sharing, production release, safety/engineering decisions — the requester can never approve their own request), and **AI agents**.

## AI agents and controls

Agents: research, innovation, strategy, branding, legal (MoU outline for qualified review — never binding), collaboration.

- Without `ANTHROPIC_API_KEY` the agents return **rules templates** built only from the venture's record, labelled as templates.
- With a key, Claude drafts from the venture record only. The system prompt forbids inventing facts, suppliers, prices or demand and treats the record and the instruction as data, not commands.
- **Kill switch** and **monthly budget** are stored in `site_settings.venture_ai` and changed only by a super admin. With a key but no budget, runs are blocked. Every run (completed, blocked or failed) is logged in `vai_agent_runs` with provider, model, tokens and cost.
- Token prices are **admin configuration** (`VAI_PRICE_*`), not hard-coded; until set, cost shows as "not set".
- Models default to `VAI_MODEL_FAST` / `VAI_MODEL_DEEP` env values.

## Pilots (demonstration data)

Admin → Venture AI → Pilots creates six opportunities marked **Sample**: Solar Conveyor (with sizing), SUNORA Paints, SUNORA Furniture,
Unite Solar industrial projects, Unite Powertek products, UNITE EXIM. Their evidence is recorded only as assumptions; no sources, suppliers,
quotations or demand are claimed. They are excluded from admin counts. Re-running creates nothing new.

## API

| Method | Path | Who |
|---|---|---|
| GET | `/venture-ai/dashboard` | member |
| GET/PUT | `/venture-ai/capabilities` | member (PUT: org owner/admin) |
| POST | `/venture-ai/opportunities` | org owner/admin |
| GET | `/venture-ai/opportunities/:id` | proposer, staff; everyone once approved |
| POST | `/venture-ai/opportunities/:id/evidence` · `/score` · `/finance` · `/conveyor` | proposer while draft / in review; staff |
| POST | `/venture-ai/opportunities/:id/submit` | proposer |
| GET | `/venture-ai/opportunities/:id/matches` | anyone who can see it |
| POST | `/admin/venture-ai/opportunities/:id/decide` | Unite admin, super admin |
| POST | `/venture-ai/rooms/:id/invitations` | venture owner (org owner/admin) |
| POST | `/venture-ai/invitations/:id/respond` | invited org owner/admin |
| GET | `/venture-ai/rooms/:id` | owner, accepted members, staff |
| POST | `/venture-ai/rooms/:id/tasks`, `/venture-ai/tasks/:id/done` | room members |
| POST | `/venture-ai/rooms/:id/approvals`, `/venture-ai/approvals/:id/decide` | members request; owner/staff decide (never own request) |
| POST | `/venture-ai/rooms/:id/agent-runs` | room members; 10/min |
| GET | `/admin/venture-ai/overview` | Unite admin, super admin |
| PUT | `/admin/venture-ai/settings` | super admin |
| POST | `/admin/venture-ai/pilots` | Unite admin, super admin |

## Blockers (need a person)

- **Claude API key** in the server's secret settings, token prices (`VAI_PRICE_*`) and a monthly budget — until then agents use rules templates.
- **Image provider** for the creative studio (logos, packaging, mock-ups) — not started; needs a provider choice and key.
- **Market data sources** (trade statistics, search trends, tenders) — the research agent lists what to collect; no live feeds yet.
- **Legal review** of the MoU/term-sheet outlines, revenue-sharing and any investment-related referral fees (which stay disabled).

## Next phases

- Agreements: generate MoU/JV drafts into the existing Contracts vault and e-sign flow after approval.
- COMEARN and revenue configuration per venture (admin-configured, not hard-coded).
- Procurement: RFQs to matched suppliers through the existing RFQ/PO modules; Sales/LeadDNA hand-off.
- Creative studio (blocked on an image provider), market data adapters, mobile screens.
