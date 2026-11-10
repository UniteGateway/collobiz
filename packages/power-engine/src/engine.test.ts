import { beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_PLANT, DEFAULT_PRICES, DT_H, STEPS_PER_DAY, calibrateToCuf, capacityTrajectory, checkInterval, cufMetrics, degradationFactor, demandProfile, dispatchDay,
  dispatchDayRules, dispatchRange, feasibilityReport, simulateSolarYear, stepBess, summarize, validatePlant, type PlantConfig, type SolarYear,
} from './index';

const plant = (patch: (p: PlantConfig) => void = () => undefined) => { const p: PlantConfig = JSON.parse(JSON.stringify(DEFAULT_PLANT)); patch(p); return p; };
let year: SolarYear;
beforeAll(() => { year = simulateSolarYear(DEFAULT_PLANT); });
const daySolar = (d: number, y = year) => y.intervals.slice(d * STEPS_PER_DAY, (d + 1) * STEPS_PER_DAY).map((x) => x.acMw);

describe('Module 1 — configuration', () => {
  it('keeps the five capacities distinct and enforces the brief’s ranges', () => {
    expect(validatePlant(DEFAULT_PLANT).filter((i) => i.severity === 'error')).toEqual([]);
    expect(validatePlant(plant((p) => { p.bess.powerMw = 40; })).map((i) => i.field)).toContain('bess.powerMw');
    expect(validatePlant(plant((p) => { p.bess.energyMwh = 250; })).map((i) => i.field)).toContain('bess.energyMwh');
    expect(validatePlant(plant((p) => { p.delivery.contractedMw = 36; })).map((i) => i.field)).toContain('delivery.contractedMw');
    expect(validatePlant(plant((p) => { p.delivery.exportVoltageKv = 100 as never; })).map((i) => i.field)).toContain('delivery.exportVoltageKv');
  });
});

describe('Module 2 — solar generation', () => {
  it('is a daily curve, zero at night, never above the AC rating, with energy conserved through DC → AC', () => {
    for (const x of year.intervals) {
      if (x.hour < 5 || x.hour >= 19.5) expect(x.acMw).toBe(0);
      expect(x.acMw).toBeLessThanOrEqual(DEFAULT_PLANT.solar.acMw + 1e-9);
      expect(x.acPreClipMw).toBeCloseTo(x.dcMw * DEFAULT_PLANT.solar.inverterEfficiency, 9);
      expect(x.acMw + x.clippedMw).toBeCloseTo(x.acPreClipMw, 9);
    }
    expect(year.intervals).toHaveLength(365 * 96);
    expect(year.acMwh).toBeLessThan(year.dcMwh);
    const noon = year.intervals[80 * 96 + 48].acMw, seven = year.intervals[80 * 96 + 28].acMw;
    expect(noon).toBeGreaterThan(seven); // not a flat CUF block
  });
  it('states CUF on two denominators that differ by the DC/AC ratio', () => {
    expect(year.cufDc.value * DEFAULT_PLANT.solar.dcMwp).toBeCloseTo(year.cufAc.value * DEFAULT_PLANT.solar.acMw, 9);
    expect(year.cufDc.denominator).toMatch(/40 MWp DC × 8760 h/);
    expect(year.cufAc.denominator).toMatch(/35 MW AC × 8760 h/);
    expect(year.acMwh / (35 * 8760)).toBeCloseTo(year.cufAc.value, 9);
  });
  it('monsoon months produce less; heavy-monsoon and degradation reduce output', () => {
    expect(year.monthlyAcMwh[6]).toBeLessThan(year.monthlyAcMwh[2]); // July < March
    expect(simulateSolarYear(DEFAULT_PLANT, { scenario: 'monsoon_heavy' }).acMwh).toBeLessThan(year.acMwh);
    expect(simulateSolarYear(DEFAULT_PLANT, { operatingYear: 10 }).acMwh).toBeLessThan(year.acMwh);
    expect(degradationFactor(DEFAULT_PLANT.solar, 1)).toBeCloseTo(0.98, 9);
    expect(degradationFactor(DEFAULT_PLANT.solar, 3)).toBeCloseTo(0.98 * 0.995 ** 2, 9);
  });
  it('calibrates to a CUF target by changing weather, so clipping appears as output nears the AC rating', () => {
    const c = calibrateToCuf(DEFAULT_PLANT, 0.22, 'dc');
    expect(c.achievable).toBe(true);
    expect(c.year.cufDc.value).toBeCloseTo(0.22, 3);
    expect(c.year.clippedMwh).toBeGreaterThan(year.clippedMwh);
    expect(calibrateToCuf(DEFAULT_PLANT, 0.6, 'ac').achievable).toBe(false);
  });
});

describe('Module 3 — BESS', () => {
  const b = DEFAULT_PLANT.bess;
  it('conserves energy: what comes out is round-trip efficiency × what went in', () => {
    let st = { capacityMwh: b.energyMwh, socMwh: b.energyMwh * b.minSocFraction };
    let inMwh = 0, outMwh = 0;
    for (let i = 0; i < 40; i++) { const r = stepBess(b, st, 10, 0); inMwh += r.charge * DT_H; st = r.next; }
    for (let i = 0; i < 80; i++) { const r = stepBess(b, st, 0, 10); outMwh += r.discharge * DT_H; st = r.next; }
    expect(st.socMwh).toBeCloseTo(b.energyMwh * b.minSocFraction, 6);
    expect(outMwh / inMwh).toBeCloseTo(b.roundTripEfficiency, 6);
  });
  it('respects SOC bounds and power, and refuses simultaneous charge and discharge', () => {
    let st = { capacityMwh: b.energyMwh, socMwh: b.energyMwh * 0.94 };
    const r = stepBess(b, st, 30, 0);
    expect(r.charge).toBeLessThanOrEqual(b.powerMw);
    expect(r.next.socMwh).toBeLessThanOrEqual(b.energyMwh * b.maxSocFraction + 1e-9);
    st = { capacityMwh: b.energyMwh, socMwh: b.energyMwh * b.minSocFraction };
    expect(stepBess(b, st, 0, 5).discharge).toBe(0);
    expect(() => stepBess(b, st, 1, 1)).toThrow(/cannot charge and discharge/);
  });
  it('fades with years and cycles and is augmented below the threshold', () => {
    const t = capacityTrajectory(b, 300, 25);
    expect(t[1].capacityMwh).toBeLessThan(t[0].capacityMwh);
    const aug = t.find((x) => x.augmentMwh > 0)!;
    expect(aug).toBeDefined();
    expect(aug.capacityMwh).toBe(b.energyMwh);
    expect(Math.min(...t.map((x) => x.capacityMwh))).toBeGreaterThanOrEqual(b.energyMwh * b.augmentationThreshold - b.energyMwh * (b.fadePerYear + b.fadePerCycle * 300));
  });
});

describe('Module 4 — dispatch', () => {
  const opt = { mode: 'max_reliability' as const, allowExport: true, allowGridFirming: false };
  it('balances energy in every interval and never exceeds the 35 MW export limit (checked inside the solver wrapper)', async () => {
    const r = await dispatchRange(DEFAULT_PLANT, year.intervals.map((x) => x.acMw), DEFAULT_PRICES, opt, 60, 90);
    let prev = r.days[0].socStartMwh;
    for (const d of r.days) for (const it of d.intervals) { checkInterval(DEFAULT_PLANT, it, prev, DEFAULT_PLANT.bess.energyMwh, 35); prev = it.socMwh; }
    const s = r.summary;
    expect(s.solarMwh).toBeCloseTo(s.directMwh + (s.chargedMwh - s.gridChargeMwh) + s.exportUncontractedMwh + s.curtailedMwh, 3);
    expect(s.batteryLossMwh / s.chargedMwh).toBeCloseTo(1 - DEFAULT_PLANT.bess.roundTripEfficiency, 2);
  });
  it('never counts battery discharge as generation: delivered + exported never exceeds solar + grid energy in', async () => {
    const r = await dispatchRange(DEFAULT_PLANT, year.intervals.map((x) => x.acMw), DEFAULT_PRICES, opt, 0, 30);
    const s = r.summary;
    expect(s.poiMwh).toBeLessThanOrEqual(s.solarMwh + s.gridChargeMwh + r.days[0].socStartMwh + 1e-6);
  });
  it('holds the export limit in a transformer outage (20 MW) by curtailing', async () => {
    const r = await dispatchDay(plant(), daySolar(80), DEFAULT_PRICES, { ...opt, exportLimitMw: 20 }, DEFAULT_PLANT.bess.energyMwh * 0.1);
    expect(Math.max(...r.intervals.map((i) => i.exportMw))).toBeLessThanOrEqual(20 + 1e-6);
  });
  it('rule-based priority dispatch also balances, and serves less than or the same as the optimiser', async () => {
    const soc = DEFAULT_PLANT.bess.energyMwh * 0.1;
    const rules = dispatchDayRules(DEFAULT_PLANT, daySolar(100), opt, soc);
    let prev = soc;
    for (const it of rules.intervals) { checkInterval(DEFAULT_PLANT, it, prev, DEFAULT_PLANT.bess.energyMwh, 35); prev = it.socMwh; }
    const lp = await dispatchDay(DEFAULT_PLANT, daySolar(100), DEFAULT_PRICES, opt, soc);
    const served = (d: typeof lp) => d.intervals.reduce((a, it) => a + it.sd + it.bd, 0);
    expect(served(lp)).toBeGreaterThanOrEqual(served(rules) - 1e-6);
  });
  it('savings mode shifts battery energy into the peak window rather than off-peak hours', async () => {
    const p = plant((x) => { x.delivery.contractedMw = 8; });
    const r = await dispatchDay(p, daySolar(40), DEFAULT_PRICES, { mode: 'max_savings', allowExport: true, allowGridFirming: false }, p.bess.energyMwh * 0.1);
    const peak = r.intervals.filter((_, t) => t * DT_H >= 18 && t * DT_H < 22).reduce((a, it) => a + it.bd, 0);
    expect(peak).toBeGreaterThan(0);
  });
  it('grid charging stays off unless explicitly allowed', async () => {
    const r = await dispatchDay(DEFAULT_PLANT, daySolar(180), DEFAULT_PRICES, { ...opt, mode: 'max_profit' }, 10);
    expect(r.intervals.every((i) => i.gc === 0)).toBe(true);
  });
});

describe('Module 11 — CUF and deliverability', () => {
  it('17 MW for 6 AM–10 PM is not feasible from this plant, and says why', async () => {
    const r = await dispatchRange(DEFAULT_PLANT, year.intervals.map((x) => x.acMw), DEFAULT_PRICES, { mode: 'max_reliability', allowExport: true, allowGridFirming: false }, 0, 364);
    const f = feasibilityReport(DEFAULT_PLANT, r.days, year);
    expect(f.annual.feasibility).toBe('not_feasible');
    expect(f.annual.limiting).toBe('contract_demand');
    expect(f.energyTest.annualDemandMwh).toBeCloseTo(17 * 16 * 365, 6);
    expect(f.energyTest.maxDeliverableMwh).toBeLessThan(f.energyTest.annualDemandMwh);
    const m = cufMetrics(DEFAULT_PLANT, year, r.summary);
    expect(m.map((x) => x.label)).not.toContain('Combined CUF');
    for (const x of m) expect(x.denominator.length).toBeGreaterThan(5);
    expect(f.note).toMatch(/never added/);
  }, 60_000);
  it('a smaller contract with a larger battery is feasible on most days', async () => {
    const p = plant((x) => { x.delivery.contractedMw = 6; x.bess.energyMwh = 120; x.bess.powerMw = 10; });
    const r = await dispatchRange(p, year.intervals.map((x) => x.acMw), DEFAULT_PRICES, { mode: 'max_reliability', allowExport: true, allowGridFirming: false }, 30, 120, p.bess.energyMwh);
    const f = feasibilityReport(p, r.days, year);
    expect(f.annual.feasibleDays).toBeGreaterThan(f.days.length * 0.7);
    expect(summarize(p, r.days, p.bess.energyMwh).demandCoverage).toBeGreaterThan(0.95);
  }, 60_000);
  it('the default demand profile covers exactly the 6 AM–10 PM window', () => {
    const d = demandProfile(DEFAULT_PLANT);
    expect(d.filter((x) => x > 0)).toHaveLength(16 * 4);
    expect(d[23]).toBe(0); expect(d[24]).toBe(17); expect(d[87]).toBe(17); expect(d[88]).toBe(0);
  });
});
