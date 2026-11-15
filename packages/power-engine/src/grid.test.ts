import { describe, expect, it } from 'vitest';
import { DEFAULT_NETWORK, ILLUSTRATIVE_VOLTAGES, compareVoltages, current, deliveredCost, illustrativeTariffs, lineLossMw, networkFlags, routeNetworks, transformerLossMw, type RouteInputs, type TariffRecord } from './index';

describe('Module 6 — voltage and evacuation', () => {
  it('line losses fall with the square of voltage for the same power', () => {
    const v132 = ILLUSTRATIVE_VOLTAGES.find((v) => v.kv === 132)!;
    const at = (kv: number) => lineLossMw(35, { ...v132, kv: kv as never }, 20, 1, 0.98);
    expect(at(132) / at(264)).toBeCloseTo(4, 6);
    expect(lineLossMw(0, v132, 20, 1, 0.98)).toBe(0);
    // Two circuits halve the loss for the same total power.
    expect(lineLossMw(35, v132, 20, 2, 0.98)).toBeCloseTo(lineLossMw(35, v132, 20, 1, 0.98) / 2, 9);
  });
  it('transformers lose no-load energy whenever energised, plus load loss by the square of loading', () => {
    const t = DEFAULT_NETWORK.transformers[0];
    expect(transformerLossMw(0, t, 0.98)).toBeCloseTo(t.noLoadLossKw / 1000, 9);
    expect(transformerLossMw(t.mva * 0.98, t, 0.98)).toBeCloseTo((t.noLoadLossKw + t.loadLossKwRated) / 1000, 9);
  });
  it('compares voltages on capex and lifetime loss value, and flags thermal limits', () => {
    const profile = Array.from({ length: 8760 }, (_, h) => (h % 24 >= 7 && h % 24 < 18 ? 30 : 0));
    const r = compareVoltages(profile, 1, DEFAULT_NETWORK, 4);
    const by = (kv: number) => r.find((x) => x.kv === kv)!;
    expect(by(33).thermalOk).toBe(false);
    expect(by(132).lineLossMwh).toBeLessThan(by(66).lineLossMwh);
    expect(by(400).capexCr).toBeGreaterThan(by(132).capexCr);
  });
  it('flags missing connectivity and that a 132 kV state connection is not ISTS access', () => {
    const f = networkFlags({ ...DEFAULT_NETWORK, wheelingNetworks: ['STU', 'ISTS'] });
    expect(f[0]).toMatchObject({ severity: 'critical' });
    expect(f.map((x) => x.message).join(' ')).toMatch(/does not by itself qualify for ISTS/);
  });
});

describe('Modules 7–8 — open access', () => {
  const recs = illustrativeTariffs();
  const base: RouteInputs = { sourceState: 'AP', destinationState: 'AP', receivingKv: 132, capacityMw: 17, energyInjectedMwh: 60000, structure: 'third_party', istsConnected: false, confirmedConditions: {}, ppaRsKwh: 4.2, consumerTariffRsKwh: 7.4, developerBears: [], asOf: '2026-11-10' };
  it('applies losses in sequence and computes landed cost on energy received', () => {
    const r = deliveredCost(recs, base);
    expect(r.energyReceivedMwh).toBeCloseTo(60000 * (1 - 0.03), 6); // AP transmission loss only — 132 kV consumer, no distribution loss
    const sum = r.lines.reduce((a, l) => a + l.rs, 0);
    expect(r.landedRsKwh).toBeCloseTo((4.2 * 60000e3 + sum) / (r.energyReceivedMwh * 1000), 9);
    expect(r.lines.map((l) => l.type)).not.toContain('wheeling'); // wheeling record applies up to 33 kV only
    expect(r.illustrativeShare).toBe(1);
    expect(r.flags.join(' ')).toMatch(/illustrative/);
  });
  it('captive structures skip surcharges only with a flag to confirm captive conditions', () => {
    const tp = deliveredCost(recs, base), cap = deliveredCost(recs, { ...base, structure: 'group_captive' });
    expect(tp.lines.some((l) => l.type === 'css')).toBe(true);
    expect(cap.lines.some((l) => l.type === 'css' || l.type === 'additional_surcharge')).toBe(false);
    expect(cap.flags.join(' ')).toMatch(/only if captive conditions/);
  });
  it('interstate without ISTS connection crosses the source state network first; waivers need every condition confirmed', () => {
    const r1 = deliveredCost(recs, { ...base, destinationState: 'KA' });
    expect(routeNetworks({ ...base, destinationState: 'KA' })[0].label).toMatch(/AP transmission to the ISTS/);
    expect(r1.flags.join(' ')).toMatch(/Not connected to the ISTS/);
    const ists = r1.lines.find((l) => l.type === 'ists_charge')!;
    expect(ists.waived).toBe(0);
    expect(ists.waiverNote).toMatch(/not applied/);
    const partial = deliveredCost(recs, { ...base, destinationState: 'KA', istsConnected: true, confirmedConditions: { 'ISTS.waiver': ['ists_connected', 'eligible_technology'] } });
    expect(partial.lines.find((l) => l.type === 'ists_charge')!.waived).toBe(0);
    const full = deliveredCost(recs, { ...base, destinationState: 'KA', istsConnected: true, confirmedConditions: { 'ISTS.waiver': ['ists_connected', 'eligible_technology', 'commissioning_date_within_window', 'supply_to_eligible_buyer'] } });
    const l = full.lines.find((x) => x.type === 'ists_charge')!;
    expect(l.waived).toBeCloseTo(300 * 17000 * 12 * 0.5, 3);
    expect(full.lines.some((x) => x.jurisdiction === 'AP' && x.type === 'transmission')).toBe(false); // ISTS-connected: no AP network
  });
  it('uses the latest version in force and ignores expired or future records', () => {
    const r: TariffRecord[] = [
      { key: 'AP.transmission', jurisdiction: 'AP', chargeType: 'transmission', unit: 'Rs/kWh', value: 0.3, provenance: 'verified', version: 1, effectiveFrom: '2025-04-01' },
      { key: 'AP.transmission', jurisdiction: 'AP', chargeType: 'transmission', unit: 'Rs/kWh', value: 0.4, provenance: 'verified', version: 2, effectiveFrom: '2026-04-01' },
      { key: 'AP.transmission', jurisdiction: 'AP', chargeType: 'transmission', unit: 'Rs/kWh', value: 0.5, provenance: 'verified', version: 3, effectiveFrom: '2027-04-01' },
    ];
    expect(current(r, '2026-11-10')[0].value).toBe(0.4);
    expect(current(r, '2025-06-01')[0].value).toBe(0.3);
  });
  it('developer net realisation deducts only the charges the developer bears', () => {
    const r = deliveredCost(recs, { ...base, developerBears: ['transmission'] });
    const tr = r.lines.filter((l) => l.type === 'transmission').reduce((a, l) => a + l.rs, 0);
    expect(r.developerNetRsKwh).toBeCloseTo(4.2 - tr / 60000e3, 9);
  });
});
