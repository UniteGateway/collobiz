import { describe, expect, it } from 'vitest';
import { SEED_OFFTAKE_RULES, maxOaWithoutSurplus, offtakeCheck, ruleFor, type OfftakeInputs, type OfftakeRule } from './index';

const flat = (v: number) => Array(12).fill(v);
const base: OfftakeInputs = { state: 'AP', structure: 'third_party', contractDemandKva: 5000, monthlyConsumptionKwh: flat(2_000_000), proposedOaMw: 4, oaMonthlyKwh: flat(500_000), rooftopKwp: 300, rooftopMonthlyKwh: flat(36_000) };
const day = (f: (h: number) => number) => Array.from({ length: 24 }, (_, h) => f(h));
const norm = (a: number[]) => { const s = a.reduce((x, y) => x + y, 0); return a.map((x) => x / s); };

describe('Consumer offtake checks', () => {
  it('state rules override national ones; unknown state limits are reported, never assumed', () => {
    expect(ruleFor(SEED_OFFTAKE_RULES, 'RJ', 'rooftop', 'net_metering_cap_kw')!.value).toBe(1000);
    expect(ruleFor(SEED_OFFTAKE_RULES, 'AP', 'rooftop', 'net_metering_cap_kw')!.value).toBe(500);
    const r = offtakeCheck(base);
    expect(r.maxOaMwByRules).toBeNull();
    expect(r.unknownRules.some((u) => /capacity limit/.test(u))).toBe(true);
    expect(r.findings.some((f) => f.check === 'Capacity' && /Do not assume/.test(f.message))).toBe(true);
  });
  it('eligibility: below 100 kW blocks third-party open access, captive has no minimum', () => {
    expect(offtakeCheck({ ...base, contractDemandKva: 80 }).findings.some((f) => f.severity === 'block' && f.check === 'Eligibility')).toBe(true);
    expect(offtakeCheck({ ...base, contractDemandKva: 80, structure: 'captive', ownershipPct: 30, plantConsumptionSharePct: 60 }).findings.some((f) => f.severity === 'block' && f.check === 'Eligibility')).toBe(false);
  });
  it('a recorded capacity rule caps the offer and counts rooftop against a combined limit', () => {
    const rules: OfftakeRule[] = [...SEED_OFFTAKE_RULES, { state: 'AP', structure: 'all_open_access', key: 're_total_capacity_pct_of_cd', value: 100, confidence: 'user', source: 'test' }];
    const r = offtakeCheck({ ...base, proposedOaMw: 5 }, rules);
    expect(r.maxOaMwByRules).toBeCloseTo(5000 * 0.95 / 1000 - 0.3, 6);
    expect(r.ok).toBe(false);
  });
  it('energy above monthly consumption is surplus; with banking banned it is lapsed and blocks the offer', () => {
    const big = { ...base, state: 'TN', oaMonthlyKwh: flat(2_100_000) };
    const r = offtakeCheck(big);
    expect(r.annual.surplusKwh).toBeCloseTo(12 * 136_000, 0);
    expect(r.annual.lapsedKwh).toBeGreaterThan(0);
    expect(r.findings.some((f) => f.check === 'Banking' && f.severity === 'block')).toBe(true);
    expect(r.findings.some((f) => /8% of banked energy/.test(f.message))).toBe(true);
  });
  it('hourly shapes reveal daytime surplus even when the month balances', () => {
    const load = norm(day(() => 1)), solar = norm(day((h) => (h >= 7 && h < 18 ? Math.sin(((h - 6.5) / 11) * Math.PI) : 0)));
    const r = offtakeCheck({ ...base, oaMonthlyKwh: flat(1_500_000), hourlyLoadShape: load, oaHourlyShape: solar });
    expect(r.annual.surplusKwh).toBe(0);
    expect(r.hourlySurplusShare!).toBeGreaterThan(0.2);
    const mw = maxOaWithoutSurplus(24_000_000, load, solar, 1_700_000);
    expect(mw).toBeGreaterThan(0.5); expect(mw).toBeLessThan(5);
  });
  it('captive tests: 26% ownership and 51% consumption, both required', () => {
    const r = offtakeCheck({ ...base, structure: 'group_captive', ownershipPct: 20, plantConsumptionSharePct: 45 });
    expect(r.findings.filter((f) => f.check === 'Captive' && f.severity === 'block')).toHaveLength(2);
    expect(offtakeCheck({ ...base, structure: 'group_captive', ownershipPct: 26, plantConsumptionSharePct: 51 }).findings.some((f) => f.check === 'Captive' && f.severity === 'block')).toBe(false);
  });
  it('rooftop above the net-metering ceiling moves to gross metering / net billing', () => {
    const r = offtakeCheck({ ...base, rooftopKwp: 800 });
    expect(r.rooftop.netMeteringLimitKw).toBe(500);
    expect(r.rooftop.arrangement).toMatch(/Gross metering/);
    expect(offtakeCheck({ ...base, state: 'RJ', rooftopKwp: 800 }).rooftop.arrangement).toBe('Net metering');
  });
});
