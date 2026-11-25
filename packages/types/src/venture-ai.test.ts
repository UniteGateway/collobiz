import { describe, expect, it } from 'vitest';
import { VaiEvidenceSchema, VaiTermsSchema, vaiShareTotal, vaiNeedsSecuritiesReview, financialModel, matchRole, scoreOpportunity, vaiSensitivity, sizeSolarConveyor, type VaiFinanceInput } from './venture-ai';

describe('Venture AI scoring', () => {
  const all = (v: number) => Object.fromEntries(['market_demand', 'profitability', 'supplier_readiness', 'competitive_advantage', 'capital_availability', 'member_capability', 'scalability', 'regulatory_readiness'].map((k) => [k, { value: v, evidence: 'strong' as const }]));
  it('weights the criteria with the default weights and classifies', () => {
    const r = scoreOpportunity({ market_demand: { value: 85, evidence: 'strong' }, profitability: { value: 80, evidence: 'some' }, supplier_readiness: { value: 90, evidence: 'strong' }, competitive_advantage: { value: 75, evidence: 'some' }, capital_availability: { value: 70, evidence: 'none' }, member_capability: { value: 90, evidence: 'strong' }, scalability: { value: 85, evidence: 'some' }, regulatory_readiness: { value: 80, evidence: 'none' } });
    expect(r.score).toBe(83); // (85·20+80·20+90·15+75·10+70·10+90·10+85·10+80·5)/100
    expect(r.classification).toBe('priority');
    expect(r.evidenceQuality).toBeLessThan(100);
  });
  it('a failed mandatory check overrides a high score', () => {
    const r = scoreOpportunity(all(95), {}, { safety: 'fail' });
    expect(r.score).toBe(95); expect(r.classification).toBe('blocked'); expect(r.label).toMatch(/Safety/);
  });
  it('does not guess missing criteria', () => {
    const r = scoreOpportunity({ market_demand: { value: 90, evidence: 'some' } });
    expect(r.classification).toBe('incomplete'); expect(r.missing).toHaveLength(7);
  });
});

describe('Venture AI financial engine', () => {
  const base: VaiFinanceInput = { unitPricePaise: 100000, unitCostPaise: 50000, freightPerUnitPaise: 2000, dutyPct: 0, packagingPerUnitPaise: 1000, dealerMarginPct: 10, distributorMarginPct: 5, salesCommissionPct: 2, marketingPctOfRevenue: 5, year1Units: 10000, growthPct: 20, years: 5, fixedCostsPerYearPaise: 5_00_00_000, capexPaise: 50_00_00_000, workingCapitalDays: 60, taxPct: 25 };
  it('computes margins after channel costs, break-even, payback and IRR deterministically', () => {
    const r = financialModel(base);
    expect(r.unitContributionPaise).toBe(100000 * 0.83 - 53000 - 5000); // ₹250 per unit
    expect(r.breakEvenUnitsPerYear).toBe(Math.ceil(5_00_00_000 / 25000));
    expect(r.years[0].revenue).toBe(10000 * 100000);
    expect(r.years[1].units).toBe(12000);
    expect(r.irrPct).not.toBeNull();
    expect(financialModel(base)).toEqual(r); // same inputs, same answer
  });
  it('flags a loss-making unit and shows vaiSensitivity', () => {
    expect(financialModel({ ...base, unitCostPaise: 90000 }).notes.join(' ')).toMatch(/loses money/);
    const s = vaiSensitivity(base);
    expect(s[1].netProfit).toBeLessThan(s[0].netProfit);
  });
});

describe('Solar Conveyor sizing', () => {
  it('sizes PV and battery from the conveyor load', () => {
    const r = sizeSolarConveyor({ motorKw: 22, hoursPerDay: 10, loadFactorPct: 70, daysPerYear: 300, peakSunHours: 5, performanceRatioPct: 78, batteryHours: 2, depthOfDischargePct: 80, solarCostPaisePerWp: 3800, batteryCostPaisePerKwh: 1800000, gridTariffPaisePerKwh: 850 });
    expect(r.energyKwhPerDay).toBe(154);
    expect(r.solarKwp).toBe(39.5);
    expect(r.batteryKwh).toBe(38.5);
    expect(r.notes[0]).toMatch(/not certified engineering/);
  });
});

describe('Role matching', () => {
  const cap = { roles: ['oem'], categories: ['Paints'], countries: ['IN'], certifications: ['ISO 9001'], investmentMaxPaise: null, spareCapacity: '30% of a 5,000 kL line', available: true, verified: true, completedCollaborations: 2 };
  it('never matches a member without the role, and explains every point', () => {
    expect(matchRole({ role: 'investor', categories: [], countries: [] }, cap)).toBeNull();
    const m = matchRole({ role: 'oem', categories: ['Paints'], countries: ['IN'], certifications: ['ISO 9001'] }, cap)!;
    expect(m.percent).toBe(100); expect(m.reasons.join(' ')).toMatch(/Paints/); expect(m.gaps).toEqual([]);
  });
  it('a verified fact needs a source and date', () => {
    expect(VaiEvidenceSchema.safeParse({ kind: 'verified', statement: 'Demand for cool-roof coatings grew' }).success).toBe(false);
    expect(VaiEvidenceSchema.safeParse({ kind: 'assumption', statement: 'Dealers will stock it within 90 days' }).success).toBe(true);
  });
});

describe('Participation terms', () => {
  const base = { contribution: 'Fabricate and supply the conveyor frames', termMonths: 24, territory: 'India', ipOwnership: 'joint' as const };
  it('requires the figure for the chosen earning model', () => {
    expect(VaiTermsSchema.safeParse({ ...base, earningModel: 'revenue_share' }).success).toBe(false);
    expect(VaiTermsSchema.safeParse({ ...base, earningModel: 'revenue_share', sharePct: 20 }).success).toBe(true);
    expect(VaiTermsSchema.safeParse({ ...base, earningModel: 'fixed_fee' }).success).toBe(false);
  });
  it('totals revenue shares and flags equity or investor terms for review', () => {
    const t = VaiTermsSchema.parse({ ...base, earningModel: 'revenue_share', sharePct: 60 });
    expect(vaiShareTotal([t, null], { ...t, sharePct: 45 })).toBe(105);
    expect(vaiNeedsSecuritiesReview({ ...t, earningModel: 'equity' }, 'manufacturer')).toBe(true);
    expect(vaiNeedsSecuritiesReview(t, 'investor')).toBe(true);
    expect(vaiNeedsSecuritiesReview(t, 'manufacturer')).toBe(false);
  });
});
