import { describe, expect, it } from 'vitest';
import { PT_REQUIRED_DOCS, PT_TRANSITIONS, PtBenefitSchema, commercialBenefit, parseReverse } from './powertrade';

const L = 1e5 * 100; // ₹1 lakh in paise
const base = { currentBillPaise: 10 * L, newPowerExpensePaise: 7.5 * L, savingsVerified: true, productSalesPaise: 0, productGrossMarginPct: 0, rebatesPaise: 0, commissionsPaise: 0, benefitCostsPaise: 0, benefitTaxesPaise: 0, collectedPaise: 0, approvedAllocationPaise: 0 };

describe('POWERTRADE commercial benefit calculator', () => {
  it('reproduces the worked example: ₹10 L bill, ₹2.5 L savings, ₹5 L verified benefit → ₹2.5 L residual', () => {
    const r = commercialBenefit({ ...base, commissionsPaise: 5 * L, collectedPaise: 5 * L, approvedAllocationPaise: 5 * L });
    expect(r.energySavings).toBe(2.5 * L);
    expect(r.availableForPowerSupport).toBe(5 * L);
    expect(r.residualEconomicPowerExpense).toBe(2.5 * L);
  });
  it('shows zero residual only when collected, approved, net benefits cover the expense — and says why', () => {
    const r = commercialBenefit({ ...base, commissionsPaise: 8 * L, benefitTaxesPaise: 0.5 * L, collectedPaise: 7.5 * L, approvedAllocationPaise: 7.5 * L });
    expect(r.residualEconomicPowerExpense).toBe(0);
    expect(r.notes.join(' ')).toMatch(/not because power is free/);
  });
  it('never counts uncollected or anticipated money, and never treats turnover as profit', () => {
    const r = commercialBenefit({ ...base, productSalesPaise: 45 * L, productGrossMarginPct: 12, commissionsPaise: 3 * L, collectedPaise: 1 * L, approvedAllocationPaise: 3 * L });
    expect(r.grossProfitFromSupply).toBe(5.4 * L); // 12% of ₹45 L, not ₹45 L
    expect(r.availableForPowerSupport).toBe(1 * L); // capped at collected
    expect(r.cashTimingGap).toBe(2 * L);
    expect(r.residualEconomicPowerExpense).toBe(6.5 * L);
  });
  it('labels unverified savings as estimated', () => {
    expect(commercialBenefit({ ...base, savingsVerified: false }).savingsLabel).toBe('estimated');
  });
  it('rejects a benefit whose costs and taxes exceed the gross amount', () => {
    expect(PtBenefitSchema.safeParse({ source: 'rebate', description: 'Transformer rebate', grossPaise: 100, costsPaise: 80, taxesPaise: 30 }).success).toBe(false);
  });
});

describe('POWERTRADE workflow and documents', () => {
  it('only allows forward moves the workflow defines; completed and cancelled are final', () => {
    expect(PT_TRANSITIONS.draft).toContain('submitted');
    expect(PT_TRANSITIONS.draft).not.toContain('contracted');
    expect(PT_TRANSITIONS.completed).toEqual([]);
    expect(PT_TRANSITIONS.cancelled).toEqual([]);
  });
  it('Product-for-Power keeps supply and power as separate documented legs with tax review', () => {
    expect(PT_REQUIRED_DOCS.product_for_power).toEqual(expect.arrayContaining(['supply_agreement', 'ppa', 'benefit_agreement', 'tax_review', 'settlement_authorisation']));
  });
});

describe('Reverse POWERTRADE matching (rules)', () => {
  it('reads units, products and wants from plain words', () => {
    const p = parseReverse('I have a steel factory consuming 15 lakh units per month. I manufacture structural steel and want cheaper electricity plus more customers.');
    expect(p.monthlyUnits).toBe(1_500_000);
    expect(p.products).toContain('steel');
    expect(p.wants).toEqual(expect.arrayContaining(['buy_power', 'find_customers']));
    expect(p.industry).toBe('steel');
  });
});
