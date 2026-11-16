# Unite Power Dispatch — development progress log

Brief: Solar + BESS smart energy optimiser for UNITE 40 MWp DC / 35 MW AC solar + BESS, Donakonda (AP).
Code: calculation engine `packages/power-engine` (pure TypeScript, no I/O); app `apps/power`.

## Environment facts (2026-11-10)
- PVGIS and NASA POWER are **not reachable** from this environment (network blocked). The solar engine therefore runs on a
  physics model with **illustrative** monthly climate inputs; a weather adapter is built to replace them when network access
  is granted. No measured data is shown as measured.
- Packages reviewed before use: `highs` 1.15.4 (HiGHS LP/MIP solver, MIT, maintained 2026-10), `recharts` (MIT),
  `tailwindcss` (MIT), `@prisma/client` 6.19 (Apache-2.0; engines download confirmed), `exceljs` (MIT), `pdfkit` (MIT).

## Log
| Date | Module | Status | Evidence |
|---|---|---|---|
| 2026-11-10 | M1 Plant configuration (engine) | Done | `config.ts`; five capacities kept distinct; range checks |
| 2026-11-10 | M2 Solar engine | Done | `solar.ts`: solar position, Haurwitz clear sky, Erbs split, isotropic POA, NOCT temperature, losses, degradation, AC clipping; 15-min and 8,760 h; CUF on DC and AC denominators; CUF calibration by weather scaling |
| 2026-11-10 | M3 BESS engine | Done | `bess.ts`: AC-coupled, √RTE split, SOC bounds, exclusivity, fade + augmentation |
| 2026-11-10 | M4 Dispatch | Done | `dispatch.ts`: daily LP (HiGHS) with SOC carry-over and value of overnight carry; three modes; per-interval checks; rule-based cross-check |
| 2026-11-10 | M11 CUF & reliability | Done | `cuf.ts`: metrics with denominators, hourly coverage, firm availability, feasibility per day/month/year with limiting factor |

| 2026-11-10 | M9 Savings engine | Done | `savings.ts`: present vs proposed bill, losses, OA charges, shortfall/backup, 25-year projection |
| 2026-11-10 | App MVP (M1–M5, M9, M11 screens) | Done | `apps/power`: Next.js 16 + Tailwind 4 + Prisma 6.19 (db `unite_power`), sign-in with admin/analyst/viewer roles, Executive Dashboard, Project Configuration, Solar, Battery, Smart Dispatch (3 modes compared), Interactive Power Graph (synced tooltips, slider, calendar, zoom/pan, day/month/year, playback, CSV/PNG/PDF, Sankey), CUF & Reliability, Industrial Savings (+ proposal PDF). Checked in a browser (`scripts/power-ui-check.mjs`). |

Engine tests: 22/22 (`src/engine.test.ts`, `src/savings.test.ts`).

## Findings so far (illustrative climate, default inputs)
- Solar AC energy ≈ 61.5 GWh/yr (DC CUF 17.6 %, AC CUF 20.1 %).
- 17 MW for 06:00–22:00 needs 99.3 GWh/yr; even perfect storage could deliver at most ≈ 60.4 GWh (61 %). **Not feasible** —
  limiting factor: contracted demand above plant capability. Smaller contracts (e.g. 6–8 MW) with 100–120 MWh are feasible on
  most days, limited by weather in the monsoon.

## Checkpoint — Modules 6–8 (partial, paused)
- Engine: `network.ts` (line/transformer losses, voltage comparison, connectivity flags) and `openaccess.ts` (versioned tariff records, waivers applied only with every condition confirmed, STU→ISTS routing, landed cost, buyer saving, developer net). 31 engine tests pass.
- App: TariffRecord gains minKv/maxKv/waiver (migration `20261110092742_tariff_voltage_waiver`); `lib/tariffs.ts` (illustrative seed, approved records); API `GET /api/tariffs`, `GET/POST /api/tariffs/changes`, `POST /api/tariffs/changes/[id]` (admin approve → new version, supersede old). Typecheck and lint pass; routes not yet exercised in a browser.
- Not done: open-access / interstate / network calculation routes and the Voltage, AP Open Access and Interstate pages; Modules 10, 12–15.
- Paused to prioritise the COLLABIZ core journey audit (user request).

## 2026-11-16 — Modules 6–8, 10, 12, 13 and Settings (all menu pages now exist)
| Module | Status | Evidence |
|---|---|---|
| M6 Voltage & Evacuation | Done | `/voltage`, `GET/POST /api/network`: losses (line I²R + transformer) from the 15-minute POI export, indicative capex, 25-year cost per voltage, thermal check, approvals flags |
| M7 AP Open Access | Done | `/open-access`, `/api/openaccess`: landed cost, saving, route and losses, charge lines with provenance; tariff register with propose → admin approve/reject |
| M8 Interstate | Done | `/interstate`: STU→ISTS→STU→DISCOM, ISTS waiver applied only when all four conditions are ticked, landed cost compared across 8 states |
| M10 Financial Analysis | Done | engine `finance.ts` (5 tests): capex, annuity debt, IRR, NPV, DSCR, LCOE, payback, battery augmentation, 7 sensitivities; `/finance` |
| M12 Reports | Done | `/reports`; management report PDF `/api/reports/management` (plant, generation, feasibility, evacuation, open access, finance) |
| M13 Automation | Done (on demand) | `/automation`: tariff check, re-simulation, battery health, profitability with alerts and run history. **Blocked:** scheduled runs need an external scheduler calling `POST /api/automation/due` with `AUTOMATION_TOKEN`; weather refresh is recorded as skipped (PVGIS / NASA POWER unreachable) |
| Settings | Done | `/settings`: account, roles (admin; never own role; last admin kept), data-source status, audit log |

Checks: engine 66/66 tests; `scripts/power-modules-check.mjs` (all 7 pages, actions, PDF) and `scripts/power-ui-check.mjs` pass with no page errors.
Fixed on the way: Hybrid compare/combinations failed the production build (`useSearchParams` without Suspense); rejected tariff changes were audited as `tariff.change_rejectd`; the UI check matched a hidden dropdown option.
Results with default inputs remain indicative: tariffs and costs are illustrative placeholders (e.g. landed cost ₹7.61/kWh vs a ₹7.50 tariff; project IRR 3.5% because the 17 MW contract is not feasible on this plant).
M14 (deployment) and M15 (documentation) are covered by docs/deployment.md and this log; production hosting is not set up (needs approval).
