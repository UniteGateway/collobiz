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
