/** Demonstration projects A–E from the brief. ILLUSTRATIVE: feasibility is decided by simulation, never assumed. */
import { DEFAULT_WIND, ILLUSTRATIVE_SOUTH_INDIA_WIND } from './wind';
import { baseScenario, hoursMask, type HybridScenario } from './hybrid';

const b = baseScenario();
const wind = (mw: number) => ({ ...DEFAULT_WIND, capacityMw: mw, resource: ILLUSTRATIVE_SOUTH_INDIA_WIND });
const bess = (p: number, e: number) => ({ ...b.bess, powerMw: p, energyMwh: e });
export const HYBRID_SAMPLES: { key: string; scenario: HybridScenario }[] = [
  { key: 'A', scenario: baseScenario({ name: 'Project A — Solar + BESS (AP, 132 kV, daytime with evening peak)', bess: bess(20, 80), grid: { ...b.grid, exportMw: 40, voltageKv: 132 },
    product: { ...b.product, kind: 'six_to_ten', contractedMw: 15, hours: hoursMask(6, 22) } }) },
  { key: 'B', scenario: baseScenario({ name: 'Project B — Wind + BESS (220 kV, interstate sale)', solar: { ...b.solar, acMw: 0, dcMwp: 0 }, wind: wind(40), bess: bess(20, 80), destinationState: 'KA',
    grid: { ...b.grid, exportMw: 40, voltageKv: 220, lineKm: 25 }, product: { ...b.product, kind: 'rtc', contractedMw: 10, hours: hoursMask(0, 24) }, land: { ...b.land, availableAcres: 1600, coLocated: false } }) },
  { key: 'C', scenario: baseScenario({ name: 'Project C — Solar + Wind + BESS (16-hour supply)', wind: wind(21), bess: bess(20, 80), grid: { ...b.grid, exportMw: 60, voltageKv: 220, transformerMva: 80 },
    product: { ...b.product, kind: 'sixteen_hour', contractedMw: 20, hours: hoursMask(6, 22) }, land: { ...b.land, availableAcres: 1000 } }) },
  { key: 'D', scenario: baseScenario({ name: 'Project D — RTC hybrid (24-hour target)', wind: wind(39), bess: bess(40, 160), grid: { ...b.grid, exportMw: 80, voltageKv: 220, transformerMva: 100 },
    product: { ...b.product, kind: 'rtc', contractedMw: 25, hours: hoursMask(0, 24) }, land: { ...b.land, availableAcres: 1800 } }) },
  { key: 'E', scenario: baseScenario({ name: 'Project E — Peak revenue (time-of-day tariffs)', wind: wind(39), bess: bess(40, 240), objective: 'max_peak_revenue', grid: { ...b.grid, exportMw: 80, voltageKv: 220, transformerMva: 100 },
    product: { ...b.product, kind: 'six_to_ten', contractedMw: 20, hours: hoursMask(6, 22) }, prices: { ...b.prices, peakRsKwh: 8, ppaRsKwh: 3.8 }, land: { ...b.land, availableAcres: 1800 } }) },
];
