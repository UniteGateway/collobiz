import { describe, expect, it } from 'vitest';
import { ILLUSTRATIVE_PROJECT_FINANCE as F, projectFinance, sensitivity, type PlantFinanceSpec, type YearOne } from './finance';

const plant: PlantFinanceSpec = { dcMwp: 40, bessMw: 17, bessMwh: 68, annualDegradation: 0.005, fadePerYear: 0.01, fadePerCycle: 0.00004, augmentationThreshold: 0.8 };
const y1: YearOne = { revenueRs: 30e7, variableCostRs: 1e7, deliveredMwh: 60000, equivalentCycles: 300 };

describe('project finance (Module 10)', () => {
  it('capex, debt and equity add up; annuity repays the debt within the tenor', () => {
    const r = projectFinance(plant, y1, F);
    const base = 40 * 3.6 + 17 * 0.5 + 68 * 1.5 + 18 + 5;
    expect(r.capex.total).toBeCloseTo(base * 1.04, 6);
    expect(r.debtCr + r.equityCr).toBeCloseTo(r.capex.total, 6);
    const repaid = r.years.reduce((a, y) => a + y.principalCr, 0);
    expect(repaid).toBeCloseTo(r.debtCr, 4);
    expect(r.years[F.tenorYears].interestCr).toBe(0);
  });
  it('IRR is the rate at which project NPV is zero; NPV at the discount rate matches', () => {
    const r = projectFinance(plant, y1, F);
    expect(r.projectIrr).not.toBeNull();
    const npvAt = (rate: number) => -r.capex.total + r.years.reduce((a, y, i) => a + y.projectCfCr / (1 + rate) ** (i + 1), 0);
    expect(Math.abs(npvAt(r.projectIrr!))).toBeLessThan(1e-3);
    expect(npvAt(F.discountRate)).toBeCloseTo(r.npvCr, 6);
  });
  it('degradation lowers later-year energy; augmentation is bought when the battery fades below the threshold', () => {
    const r = projectFinance(plant, y1, F);
    expect(r.years[1].deliveredMwh).toBeCloseTo(60000 * 0.995, 6);
    const firstAug = r.years.find((y) => y.augmentationCr > 0)!;
    // Fade per year = 1% + 300 cycles × 0.004% = 2.2%; capacity falls below 80% in year 10.
    expect(firstAug.year).toBe(10);
  });
  it('sensitivities move the right way', () => {
    const s = Object.fromEntries(sensitivity(plant, y1, F).map((c) => [c.key, c]));
    expect(s.tariff_up.npvCr).toBeGreaterThan(s.base.npvCr);
    expect(s.tariff_down.npvCr).toBeLessThan(s.base.npvCr);
    expect(s.capex_up.lcoeRsKwh).toBeGreaterThan(s.base.lcoeRsKwh);
    expect(s.gen_down.projectIrr!).toBeLessThan(s.base.projectIrr!);
    expect(s.rate_up.minDscr!).toBeLessThan(s.base.minDscr!);
  });
  it('no debt means no DSCR and equity IRR equals project IRR', () => {
    const r = projectFinance(plant, y1, { ...F, debtShare: 0 });
    expect(r.minDscr).toBeNull();
    expect(r.equityIrr!).toBeLessThanOrEqual(r.projectIrr! + 1e-9); // levered tax ≥ unlevered with no interest → equal
    expect(Math.abs(r.equityIrr! - r.projectIrr!)).toBeLessThan(1e-6);
  });
});
