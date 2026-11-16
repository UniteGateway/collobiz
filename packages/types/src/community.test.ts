import { describe, expect, it } from 'vitest';
import { InvestmentOfferSchema, grossYieldPct, prorataSplit, rentShare } from './community';

describe('group investments', () => {
  it('rent is shared pro rata to units; unsold units’ share is retained', () => {
    // 10,000 sq ft; ₹6,00,000 rent a month; 3 holders own 2,500 + 1,000 + 333 sq ft
    const r = prorataSplit(6_00_000_00, [{ id: 'a', units: 2500 }, { id: 'b', units: 1000 }, { id: 'c', units: 333 }], 10000);
    expect(r.shares.find((s) => s.id === 'a')!.amount).toBe(1_50_000_00);
    expect(r.shares.find((s) => s.id === 'b')!.amount).toBe(60_000_00);
    expect(r.shares.reduce((a, s) => a + s.amount, 0)).toBe(r.distributed);
    expect(r.distributed + r.retainedForUnsold).toBe(6_00_000_00);
    expect(rentShare(6_00_000_00, 100, 10000)).toBe(6_000_00);
  });
  it('rounding never over-pays and never loses a paisa among holders', () => {
    const r = prorataSplit(100, [{ id: 'a', units: 1 }, { id: 'b', units: 1 }, { id: 'c', units: 1 }], 3);
    expect(r.shares.map((s) => s.amount).sort()).toEqual([33, 33, 34]);
    expect(() => prorataSplit(100, [{ id: 'a', units: 5 }], 3)).toThrow();
  });
  it('yield and offer validation', () => {
    expect(grossYieldPct(6_00_000_00, 10000, 9_000_00)).toBe(8);
    expect(InvestmentOfferSchema.safeParse({ title: 'Office floor', kind: 'property_share', summary: 'A Grade-A office floor leased to an IT company.', location: 'Hyderabad', totalUnits: 100, unitPrice: 1, minUnits: 500, projectedMonthlyRent: 0, sponsor: 'ProDeal' }).success).toBe(false);
  });
});
