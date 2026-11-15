import { describe, expect, it } from 'vitest';
import {
  baseScenario, canEnter, dispatchHybridDay, financeModel, generateCombinations, gridCheck, hoursMask, hybridInputs, landCheck, landedCost, reconcile, simulateHybrid, simulateWindYear, solver,
  summarizeHybrid, compliance, windFromSeries, DEFAULT_WIND, ILLUSTRATIVE_SOUTH_INDIA_WIND, type HybridDay, type HybridInputs, type HybridScenario,
} from './index';

const day = (f: (h: number) => number) => Array.from({ length: 24 }, (_, h) => f(h));
const bell = (peak: number) => day((h) => (h >= 7 && h < 18 ? peak * Math.sin(((h - 6.5) / 11) * Math.PI) : 0));
function inputs(S: number[], W: number[], L: number[], E = 100, days = 1): HybridInputs {
  const rep = (a: number[]) => Array.from({ length: days }, () => a).flat();
  return { solarMw: rep(S), solarClipMw: rep(day(() => 0)), windMw: rep(W), loadMw: rep(L), exportMw: rep(day(() => E)), H: 24 * days, solarMwh: 0, windMwh: 0, solarSource: 'test', windSource: 'test', windYear: null };
}
async function run(sc: HybridScenario, x: HybridInputs, days = 1, socR0?: number) {
  const hs = await solver(); const out: HybridDay[] = [];
  let r = socR0 ?? sc.bess.energyMwh * sc.bess.initialSoc, g = 0;
  for (let d = 0; d < days; d++) { const res = await dispatchHybridDay(hs, sc, x, d, r, g, sc.bess.energyMwh); out.push(res); r = res.hours[23].socR; g = res.hours[23].socG; }
  return out;
}
const sum = (days: HybridDay[], f: (h: HybridDay['hours'][number]) => number) => days.reduce((a, d) => a + d.hours.reduce((x, h) => x + f(h), 0), 0);
const sc0 = (over: Partial<HybridScenario> = {}) => baseScenario({ objective: 'max_profit', ...over });
const noBess = (s: HybridScenario) => ({ ...s, bess: { ...s.bess, powerMw: 0, energyMwh: 0 } });
const L16 = day((h) => (h >= 6 && h < 22 ? 10 : 0));

describe('Hybrid dispatch — energy flows (tests 1–16, 26, 27)', () => {
  it('1 zero generation: nothing delivered, battery idle once empty, all demand unserved', async () => {
    const d = await run(sc0(), inputs(day(() => 0), day(() => 0), L16), 1, 0);
    expect(sum(d, (h) => h.uns)).toBeCloseTo(160, 4);
    expect(sum(d, (h) => h.sC + h.wC + h.bDr)).toBeCloseTo(0, 6);
  });
  it('2 solar only (no BESS): direct supply limited to solar and load, the rest exported', async () => {
    const S = bell(30); const d = await run(noBess(sc0()), inputs(S, day(() => 0), L16));
    expect(sum(d, (h) => h.sD)).toBeCloseTo(S.reduce((a, s, h) => a + Math.min(s, L16[h]), 0), 4);
    expect(sum(d, (h) => h.sX + h.sK)).toBeCloseTo(S.reduce((a, s, h) => a + Math.max(0, s - L16[h]), 0), 4);
  });
  it('3 wind only: night wind serves night load; no wind means no supply', async () => {
    const W = day((h) => (h < 6 ? 20 : 5)); const d = await run(noBess(sc0()), inputs(day(() => 0), W, day(() => 8)));
    expect(sum(d, (h) => h.wD)).toBeCloseTo(6 * 8 + 18 * 5, 4);
    expect(sum(d, (h) => h.uns)).toBeCloseTo(18 * 3, 4);
  });
  it('4/9 solar + BESS from empty: no discharge before charging; evening served from stored solar', async () => {
    const d = await run(sc0(), inputs(bell(40), day(() => 0), L16), 1, 0);
    const hours = d[0].hours; const firstCharge = hours.findIndex((h) => h.sC > 0);
    expect(firstCharge).toBeGreaterThan(0);
    expect(hours.slice(0, firstCharge).every((h) => h.bDr + h.bDg === 0)).toBe(true);
    expect(sum(d, (h) => (h.t % 24 >= 18 ? h.bDr : 0))).toBeGreaterThan(30);
    expect(sum(d, (h) => h.wC + h.gC)).toBe(0);
  });
  it('5 wind + BESS: battery charges only from wind', async () => {
    const W = day((h) => (h >= 10 && h < 16 ? 30 : 0)); const d = await run(sc0(), inputs(day(() => 0), W, L16), 1, 0);
    expect(sum(d, (h) => h.wC)).toBeGreaterThan(0); expect(sum(d, (h) => h.sC + h.gC)).toBe(0);
  });
  it('6 solar + wind + BESS over 3 days: energy and storage reconcile exactly', async () => {
    const sc = sc0({ wind: { ...DEFAULT_WIND, capacityMw: 40, resource: ILLUSTRATIVE_SOUTH_INDIA_WIND } });
    const x = inputs(bell(35), day((h) => 10 + 8 * Math.sin(h / 3)), L16, 40, 3);
    const days = await run(sc, x, 3);
    const s = summarizeHybrid(sc, days);
    const rec = reconcile({ scenario: sc, inputs: x, days, summary: s, compliance: compliance(sc, days, s), computedMs: 0, screening: false });
    expect(Math.abs(rec.generationError)).toBeLessThan(1e-3); expect(Math.abs(rec.storageError)).toBeLessThan(1e-2); expect(Math.abs(rec.demandError)).toBeLessThan(1e-6);
  });
  it('7/8/26/27 grid charging: off means none; on means only in permitted hours, within import limit, tracked as grid-charged', async () => {
    const cheap = sc0({ prices: { ...baseScenario().prices, gridChargeRsKwh: day((h) => (h < 6 ? 1 : 9)), peakRsKwh: 12 } });
    const off = await run(cheap, inputs(day(() => 0), day(() => 0), L16), 1, 0);
    expect(sum(off, (h) => h.gC)).toBe(0);
    const on = { ...cheap, bess: { ...cheap.bess, grid: 'yes' as const, gridChargeHours: hoursMask(0, 4) }, grid: { ...cheap.grid, importMw: 12 } };
    const d = await run(on, inputs(day(() => 0), day(() => 0), L16), 1, 0);
    expect(d[0].hours.filter((h) => h.gC > 0).every((h) => h.t % 24 < 4 && h.gC <= 12 + 1e-6)).toBe(true);
    expect(sum(d, (h) => h.gC)).toBeGreaterThan(0);
    expect(sum(d, (h) => h.bDr)).toBeCloseTo(0, 6); // nothing renewable was stored
    expect(sum(d, (h) => h.bDg + h.bXg)).toBeCloseTo(sum(d, (h) => h.gC) * on.bess.chargeEff * on.bess.dischargeEff - (d[0].hours[23].socG) * on.bess.dischargeEff, 3);
    expect(summarizeHybrid(on, d).renewableDeliveredMwh).toBeCloseTo(0, 6);
  });
  it('10 full battery: never charges above the maximum SOC; surplus is exported or curtailed', async () => {
    const sc = sc0(); const d = await run(sc, inputs(bell(60), day(() => 0), day(() => 0)), 1, sc.bess.energyMwh * sc.bess.maxSoc);
    expect(sum(d, (h) => h.sC)).toBeCloseTo(0, 6);
    expect(Math.max(...d[0].hours.map((h) => h.socR + h.socG))).toBeLessThanOrEqual(sc.bess.energyMwh * sc.bess.maxSoc + 1e-6);
  });
  it('11 efficiency: energy out of the battery equals energy in × ηc × ηd (net of stored change)', async () => {
    const sc = sc0(); const d = await run(sc, inputs(bell(40), day(() => 0), L16), 1, 0);
    const inn = sum(d, (h) => h.sC + h.wC + h.gC), out = sum(d, (h) => h.bDr + h.bDg + h.bXr + h.bXg), endSoc = d[0].hours[23].socR + d[0].hours[23].socG;
    expect(out).toBeCloseTo((inn * sc.bess.chargeEff - endSoc) * sc.bess.dischargeEff, 3);
  });
  it('13/14 export limit binds and causes solar curtailment when export is not allowed and storage is full', async () => {
    const sc = { ...noBess(sc0()), prices: { ...baseScenario().prices, exportAllowed: false } };
    const d = await run(sc, inputs(bell(40), day(() => 0), day(() => 10), 25));
    expect(Math.max(...d[0].hours.map((h) => h.sD + h.sX))).toBeLessThanOrEqual(25 + 1e-6);
    expect(sum(d, (h) => h.sK)).toBeGreaterThan(0);
  });
  it('15 wind curtailment at the export limit', async () => {
    const d = await run(noBess(sc0()), inputs(day(() => 0), day(() => 50), day(() => 10), 30));
    expect(sum(d, (h) => h.wK)).toBeCloseTo(24 * 20, 4);
  });
  it('16 overnight RTC with solar and a small battery: night shortfall shown hour by hour', async () => {
    const sc = sc0({ objective: 'max_compliance', bess: { ...baseScenario().bess, powerMw: 10, energyMwh: 20 }, product: { ...baseScenario().product, kind: 'rtc', hours: hoursMask(0, 24), contractedMw: 10 } });
    const d = await run(sc, inputs(bell(40), day(() => 0), day(() => 10), 100, 2), 2);
    const s = summarizeHybrid(sc, d), c = compliance(sc, d, s);
    expect(c.technical).toBe('infeasible');
    expect(c.longestShortfallRunHours).toBeGreaterThan(5);
    expect(c.hoursFullyServed).toBeLessThan(c.hoursWithDemand);
  });
});

describe('Commercial behaviour (17, 18, 22)', () => {
  it('17/18 peak tariff: stored energy is sold in the peak window and billed at the peak tariff', async () => {
    const sc = sc0({ product: { ...baseScenario().product, hours: hoursMask(6, 22), contractedMw: 5 } });
    const d = await run(sc, inputs(bell(40), day(() => 0), day((h) => (h >= 6 && h < 22 ? 5 : 0))), 1, 0);
    const peakDis = sum(d, (h) => (sc.prices.peakHours[h.t % 24] ? h.bDr + h.bXr : 0)), offDis = sum(d, (h) => (!sc.prices.peakHours[h.t % 24] ? h.bDr + h.bXr : 0));
    expect(peakDis).toBeGreaterThan(offDis);
    const s = summarizeHybrid(sc, d);
    expect(s.revenue.peak).toBeCloseTo(s.peakDeliveredMwh * sc.prices.peakRsKwh * 1000, 0);
  });
  it('22 longer duration delivers more of an evening-heavy contract', async () => {
    const mk = (h: number) => sc0({ objective: 'max_compliance', bess: { ...baseScenario().bess, powerMw: 15, energyMwh: 15 * h } });
    const x = inputs(bell(40), day(() => 0), L16, 100, 2);
    const two = summarizeHybrid(mk(2), await run(mk(2), x, 2)), four = summarizeHybrid(mk(4), await run(mk(4), x, 2));
    expect(four.deliveredMwh).toBeGreaterThan(two.deliveredMwh);
  });
});

describe('Land, grid, open access and finance (12, 19–21, 23, 28–30)', () => {
  it('23 insufficient land makes the combination infeasible before simulation', () => {
    const l = landCheck(baseScenario({ land: { ...baseScenario().land, availableAcres: 100 } }));
    expect(l.ok).toBe(false); expect(l.requiredAcres).toBeGreaterThan(200);
    const shared = landCheck(baseScenario({ wind: { ...DEFAULT_WIND, capacityMw: 9, resource: ILLUSTRATIVE_SOUTH_INDIA_WIND } }));
    const apart = landCheck(baseScenario({ wind: { ...DEFAULT_WIND, capacityMw: 9, resource: ILLUSTRATIVE_SOUTH_INDIA_WIND }, land: { ...baseScenario().land, coLocated: false } }));
    expect(shared.requiredAcres).toBeLessThan(apart.requiredAcres); // co-located land is not double-counted
  });
  it('21/30 grid: 40 MW cannot go out at 33 kV; contracted MW above the export limit is blocked', () => {
    expect(gridCheck(baseScenario({ grid: { ...baseScenario().grid, voltageKv: 33 } })).issues.some((i) => i.severity === 'block' && /33 kV/.test(i.message))).toBe(true);
    expect(gridCheck(baseScenario({ product: { ...baseScenario().product, contractedMw: 50 } })).issues[0].severity).toBe('block');
    expect(gridCheck(baseScenario({ grid: { ...baseScenario().grid, voltageKv: 765, customVoltage: true } })).voltageKnown).toBe(false);
  });
  it('19/20 landed cost differs by state, applies losses, and flags illustrative charges', async () => {
    const sc = sc0(); const d = await run(sc, inputs(bell(40), day(() => 0), L16), 1);
    const s = summarizeHybrid(sc, d);
    const ap = landedCost(sc, s, 7.4), mh = landedCost({ ...sc, destinationState: 'MH' }, s, 7.4), gj = landedCost({ ...sc, destinationState: 'GJ' }, s, 7.4);
    expect(ap.energyReceivedMwh).toBeLessThan(ap.energyInjectedMwh);
    expect(mh.landedRsKwh).not.toBeCloseTo(ap.landedRsKwh, 3);
    expect(gj.lines.length).toBeGreaterThan(0);
    expect(ap.flags.join(' ')).toMatch(/illustrative/);
  });
  it('12/28/29 finance: debt amortises fully, BESS augments when fade crosses the threshold, NPV rises with tariff', async () => {
    const sc = sc0(); const d = await run(sc, inputs(bell(40), day(() => 0), L16, 100, 2), 2);
    const s = summarizeHybrid(sc, d);
    const f = financeModel(sc, s);
    const principal = f.years.reduce((a, y) => a + y.principalCr, 0);
    expect(principal).toBeCloseTo(f.capex.total * sc.finance.debtShare, 4);
    expect(f.years.some((y) => y.augmentationCr > 0)).toBe(true);
    expect(f.years.every((y) => Math.abs(y.ebitdaCr - (y.revenueCr - y.opexCr)) < 1e-9)).toBe(true);
    expect(financeModel(sc, s, 0.5).npvCr).toBeGreaterThan(f.npvCr);
    if (f.projectIrr != null) { const npvAtIrr = -f.capex.total + f.years.reduce((a, y, i) => a + y.projectCfCr / (1 + f.projectIrr!) ** (i + 1), 0); expect(Math.abs(npvAtIrr)).toBeLessThan(1e-3); }
  });
});

describe('Resource data, review workflow and combinations (24, 25 note, leap year)', () => {
  it('24 wind seasonality: monsoon months produce more than winter months; never capacity × CUF', () => {
    const w = simulateWindYear({ ...DEFAULT_WIND, capacityMw: 40 }, ILLUSTRATIVE_SOUTH_INDIA_WIND);
    expect(w.monthlyMwh[6]).toBeGreaterThan(2 * w.monthlyMwh[11]);
    expect(Math.max(...w.mw)).toBeLessThanOrEqual(40);
    expect(w.mw.some((x) => x === 0)).toBe(true); // calm hours exist, including at night
    expect(w.provenance).toBe('illustrative');
  });
  it('leap years have 8,784 hours; a measured series must match the year and the capacity', () => {
    const x = hybridInputs(baseScenario({ year: 2028, wind: { ...DEFAULT_WIND, capacityMw: 20, resource: ILLUSTRATIVE_SOUTH_INDIA_WIND } }));
    expect(x.solarMw).toHaveLength(8784); expect(x.windMw).toHaveLength(8784);
    expect(() => windFromSeries(new Array(8760).fill(5), 20, 'mast', 'measured', 2028)).toThrow(/8784/);
    expect(() => windFromSeries(new Array(8760).fill(25), 20, 'mast')).toThrow(/capacity/);
  });
  it('review: signature approval needs every checklist item; infeasible or unverified scenarios cannot reach negotiation', () => {
    expect(canEnter('approved_for_signature', {}, 'feasible').blockers.length).toBe(18);
    expect(canEnter('ready_for_negotiation', Object.fromEntries(['site_generation_data', 'land', 'schedule_feasible', 'connectivity', 'export_import', 'metering', 'oa_charges', 'current_regulations', 'bess_charging_permission', 're_accounting', 'buyer_credit', 'payment_security', 'penalties', 'firming_source', 'financial_assumptions', 'grid_scheduling'].map((k) => [k, true])), 'insufficient_data').ok).toBe(false);
    expect(canEnter('data_verified', { site_generation_data: true }, 'insufficient_data').ok).toBe(true);
  });
  it('combinations: impossible ones are pruned before simulation and the rest are ranked with a Pareto set', async () => {
    const base = baseScenario({ land: { ...baseScenario().land, availableAcres: 220 } });
    const r = await generateCombinations(base, { solarAcMw: { min: 20, max: 40, step: 20 }, windMw: { min: 0, max: 0, step: 1 }, bessMw: { min: 0, max: 15, step: 15 }, bessHours: [4], rankBy: 'reliability' });
    expect(r.pruned.some((c) => /Land/.test(c.pruned!))).toBe(true);
    expect(r.ranked.length).toBeGreaterThan(0);
    expect(r.ranked.some((c) => c.pareto)).toBe(true);
    for (let i = 1; i < r.ranked.length; i++) if (r.ranked[i].technical !== 'infeasible' && r.ranked[i - 1].technical !== 'infeasible') expect(r.ranked[i - 1].reliability!).toBeGreaterThanOrEqual(r.ranked[i].reliability!);
  }, 120000);
  it('full-year run: annual totals reconcile with the sum of intervals', async () => {
    const r = await simulateHybrid(baseScenario(), { days: [0, 1, 2, 180, 181] });
    const e = reconcile(r);
    expect(Math.abs(e.generationError)).toBeLessThan(1e-3); expect(Math.abs(e.demandError)).toBeLessThan(1e-6);
    expect(r.screening).toBe(true);
  }, 60000);
});
