import { describe, expect, it } from 'vitest';
import { ENERGY_CATEGORIES, ENERGY_DEAL_STAGES, ENERGY_STATES, EnergyBuyerSchema, EnergyPlantSchema, ILLUSTRATIVE_STATE_CHARGES, deliveredCost, stateBalance } from './energy';

describe('Unite Green Park rules', () => {
  it('has 15 categories (1 demand) and 19 deal stages; states on a unique grid', () => {
    expect(ENERGY_CATEGORIES).toHaveLength(15);
    expect(ENERGY_CATEGORIES.filter((c) => c.side === 'buyer').map((c) => c.code)).toEqual(['solar_required']);
    expect(ENERGY_DEAL_STAGES).toHaveLength(19);
    expect(new Set(ENERGY_STATES.map((s) => `${s.x},${s.y}`)).size).toBe(ENERGY_STATES.length);
  });
  it('validates plant and buyer listings, including side-specific categories', () => {
    const plant = { side: 'plant', category: 'solar_available', title: '40 MW solar power available', state: 'AP', district: 'Kurnool', source: 'solar', stage: 'operational', capacityMw: 40, availableMw: 30, tariffRsKwh: 4.2, ppaYears: 25, models: ['open_access'], description: 'Operational plant with spare capacity for open-access buyers.' };
    expect(EnergyPlantSchema.safeParse(plant).success).toBe(true);
    expect(EnergyPlantSchema.safeParse({ ...plant, availableMw: 50 }).success).toBe(false);
    expect(EnergyPlantSchema.safeParse({ ...plant, category: 'solar_required' }).success).toBe(false);
    const buyer = { side: 'buyer', category: 'solar_required', title: '15 MW solar power required', company: 'Demo Mills', industry: 'Textiles', state: 'TG', district: 'Medak', discom: 'TGSPDCL', consumerCategory: 'HT-I', requiredMw: 15, source: 'solar', currentTariffRsKwh: 8.1, ppaYears: 15, models: ['open_access'], openAccessEligible: true, storageRequired: false, description: 'Two-shift textile mill seeking open-access solar.' };
    expect(EnergyBuyerSchema.safeParse(buyer).success).toBe(true);
    expect(EnergyBuyerSchema.safeParse({ ...buyer, category: 'wind' }).success).toBe(false);
  });
  it('computes delivered cost, savings and the year table', () => {
    const r = deliveredCost({ capacityMw: 10, cufPct: 20, ppaRsKwh: 4, years: 3, escalationPct: 0, transmission: 0.4, wheeling: 0.6, lossPct: 10, bankingPct: 0, css: 1.5, additionalSurcharge: 0.5, scheduling: 0, tradingMargin: 0, duty: 0.1, discomRsKwh: 8 });
    expect(r.generatedMwh).toBeCloseTo(17520, 6);
    expect(r.receivedMwh).toBeCloseTo(15768, 6);
    // (4 + 0.4 + 0.6) / 0.9 + 1.5 + 0.5 + 0.1 = 5.5556 + 2.1 = 7.6556
    expect(r.landedRsKwh).toBeCloseTo(7.6556, 3);
    expect(r.savingRsKwh).toBeCloseTo(0.3444, 3);
    expect(r.rows).toHaveLength(3);
    expect(r.totalSavingRs).toBeCloseTo(r.annualSavingRs * 3, 0);
    expect(r.breakdown.reduce((a, b) => a + b.rsKwh, 0)).toBeCloseTo(r.landedRsKwh, 6);
    const esc = deliveredCost({ ...{ capacityMw: 10, cufPct: 20, ppaRsKwh: 4, years: 2, escalationPct: 5, transmission: 0, wheeling: 0, lossPct: 0, bankingPct: 0, css: 0, additionalSurcharge: 0, scheduling: 0, tradingMargin: 0, duty: 0, discomRsKwh: 8 } });
    expect(esc.rows[1].ppa).toBeCloseTo(4.2, 6);
  });
  it('state balance: supply minus demand, null where nothing is listed; presets exist for the calculator', () => {
    const b = stateBalance([{ state: 'AP', side: 'plant', mw: 40 }, { state: 'AP', side: 'buyer', mw: 10 }, { state: 'TG', side: 'buyer', mw: 15 }]);
    expect(b.find((s) => s.code === 'AP')).toMatchObject({ supply: 40, demand: 10, net: 30 });
    expect(b.find((s) => s.code === 'TG')!.net).toBe(-15);
    expect(b.find((s) => s.code === 'KL')!.net).toBeNull();
    expect(Object.keys(ILLUSTRATIVE_STATE_CHARGES)).toHaveLength(10);
  });
});
