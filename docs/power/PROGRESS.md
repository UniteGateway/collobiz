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
