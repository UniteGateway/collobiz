# Unite Hybrid Power Lab — Stage 00 audit and build plan

_2026-11-15. Extends Unite Power Dispatch (`apps/power`, `packages/power-engine`); no second app, no duplicate project, tariff or customer entities._

## What already exists and is reused

| Area | Existing | Reuse in the Lab |
|---|---|---|
| Solar generation | 15-min physics model (sun geometry, clear sky, Erbs split, POA, NOCT temperature, clipping, degradation), CUF on DC and AC, weather scenarios — **illustrative AP climate** because PVGIS/NASA POWER are unreachable from this environment | Solar series for every scenario (aggregated to hourly), unchanged |
| BESS | √RTE split, SOC bounds, fade per cycle and per year, augmentation threshold | Parameters and degradation trajectory; the hybrid model adds separate ηc/ηd, reserve SOC, auxiliary load, charge-source pools |
| Dispatch | Daily LP (HiGHS, MIT) for solar + BESS, three modes, carry of end-of-day SOC, per-interval checks | Same solver and approach, generalised to solar + wind + grid charging with binaries for no simultaneous charge/discharge |
| Delivery / CUF | 6 AM–10 PM contract, feasibility labels, limiting factor | Generalised to ten delivery products, interval-level compliance |
| Open access | Versioned tariff records with provenance and effective dates, waivers only with every condition confirmed, STU→ISTS routing, landed cost (AP, TS, KA, TN, MH, OD, ISTS — **all illustrative**) | Landed tariff for each scenario; Gujarat and Rajasthan placeholders added |
| Voltage / network | Line and transformer losses, voltage comparison, connectivity flags | Grid checks and voltage comparison in the Lab |
| Savings | Consumer bill vs proposal | Customer savings |
| App | Next.js app, Prisma (Project, SimulationRun, TariffRecord, RegulatoryChange, …), RBAC (admin/analyst/viewer), audit log, Recharts | New `HybridScenario` and `HybridReview` tables, routes and pages under the same shell |

## Gaps the Lab fills
Wind model; hybrid charging-source accounting (solar / wind / grid pools, renewable vs grid-charged discharge); MIP dispatch with binaries; delivery products (solar hours … RTC, custom); interval-level compliance; peak-value strategy; land and grid checks; finance (IRR, equity IRR, DSCR, NPV, LCOE, LCOS, break-even tariff); automatic combination generator with screening and full-year confirmation; scenario comparison; pre-signature review workflow.

## Data honesty rules applied
- Wind and solar resource data are **synthetic and labelled illustrative** until site measurements or a validated dataset are loaded (an hourly series upload is supported). Results built on them are marked **Insufficient Data** for decisions, while still showing the technical outcome.
- No regulatory value is fabricated: every charge is a tariff record with provenance; unverified records are flagged; nothing is set to zero silently. Policy documents named in the brief are recorded as sources **to be verified**, not as applied rules.
- The optimiser reports its solver status for every day; heuristic or failed days are counted and shown.

## Status — 2026-11-15

| Stage | Status | Evidence |
|---|---|---|
| 00 Audit | Done | This file |
| 01 Regulatory source and version management | Partly: versioned tariff records with provenance, effective dates and an approval workflow (existing); source register of the documents named in the brief, all **not reviewed** (official sites unreachable here); GJ and RJ placeholders | `POLICY_SOURCES`, `/hybrid/policies` |
| 02 Inputs | Done: project, solar, wind, BESS, grid/voltage (incl. 11 and 765 kV and custom), product hours, peak hours, prices, land, finance; versioned on save | `/hybrid/[id]?tab=inputs` |
| 03 Solar and wind time series | Done (hourly; solar physics model, synthetic wind with power curve; measured wind series accepted; leap years) | `wind.ts`, tests |
| 04–05 BESS and dispatch | Done: daily MIP with binaries, renewable and grid-charged SOC pools, DC coupling, import/export limits, outages, auxiliary load; every hour checked | `hybrid.ts`, 23 tests |
| 06 RTC / delivery compliance | Done: ten products, hour-level compliance, monthly fulfilment, longest shortfall, indicative extra storage | `compliance()` |
| 07 Peak optimisation | Done as dispatch objectives (profit, compliance, peak revenue, curtailment, balanced); battery wear cost and opportunity value included | |
| 08 Open-access charges | Done on the existing landed-cost engine; **all charges illustrative** until orders are entered | |
| 09 Captive / group captive / PPA models | Partly: structure changes which surcharges apply, with a flag requiring confirmation of captive conditions. Multi-buyer schedules are **not built** | |
| 10 Finance | Done (screening grade: later years scale year-1 dispatch) | `financeModel` |
| 11 Combination generator | Done: pruning, screening on 41 representative/worst days, ranking, Pareto set, create scenario from a row | `/hybrid/combinations` |
| 12–13 Charts, comparison | Done (Recharts; up to six scenarios) | |
| 14 PPA review | Done: 11 stages, 18-item checklist, gates, admin-only signature approval record, history | `/hybrid/[id]?tab=review` |
| 15 Reports | Partly: one A4 PDF (feasibility, energy balance, compliance, land/grid, landed cost, economics, limitations, review record) and an Excel workbook (financials, monthly, hourly). Separate term-sheet and savings documents not yet built | |
| 16 Testing | Engine 54 tests (incl. reconciliation per interval and per year); browser check `scripts/hybrid-ui-check.mjs` 13/13 at desktop and phone | |

Sample results (full year, illustrative data): A 81.5% of contract delivered — Infeasible; B 68.7% — Infeasible; C 89.4% — Infeasible; D 70.8% — Infeasible; E 96.1% — technically feasible with conditions, but **Insufficient Data** because resource and cost inputs are illustrative.
