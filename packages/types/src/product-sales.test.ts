import { describe, expect, it } from 'vitest';
import { ProductEnquirySchema, customerKey, orderCommission, resolveRate } from './product-sales';

describe('product sales rules', () => {
  const rules = [
    { productLine: null, category: null, rateBps: 200, active: true },
    { productLine: 'POWERTEK SOLAR', category: null, rateBps: 300, active: true },
    { productLine: 'POWERTEK SOLAR', category: 'PV Modules', rateBps: 150, active: true },
    { productLine: 'POWERTEK EV', category: null, rateBps: 900, active: false },
  ];
  it('resolves the most specific active rule, capped at 10%', () => {
    expect(resolveRate(rules, 'POWERTEK SOLAR', 'PV Modules')).toBe(150);
    expect(resolveRate(rules, 'POWERTEK SOLAR', 'Inverters')).toBe(300);
    expect(resolveRate(rules, 'POWERTEK EV', 'Chargers')).toBe(200); // inactive line rule ignored
    expect(resolveRate([], 'X', 'Y')).toBeNull();
    expect(resolveRate([{ productLine: null, category: null, rateBps: 5000, active: true }], null, null)).toBe(1000);
  });
  it('a mixed order earns the lowest line rate; unknown rates mean no amount yet', () => {
    expect(orderCommission(10_00_000_00, [300, 150])).toEqual({ rateBps: 150, amount: 1_50_000_0 });
    expect(orderCommission(10_00_000_00, [300, null]).amount).toBeNull();
  });
  it('customer keys ignore legal suffixes and punctuation', () => {
    expect(customerKey('Sri Rama Agro Pvt. Ltd.', '500001')).toBe(customerKey('SRI RAMA AGRO', '500001'));
    expect(customerKey('Sri Rama Agro', '500001')).not.toBe(customerKey('Sri Rama Agro', '500002'));
  });
  it('enquiries need consent and at least one product', () => {
    const base = { customerName: 'Sri Rama Agro', city: 'Nalgonda', state: 'Telangana', pincode: '508001', requirement: 'Solar pump sets for 12 farms.', lines: [{ catalogItemId: '00000000-0000-4000-8000-000000000000', qty: 12 }] };
    expect(ProductEnquirySchema.safeParse({ ...base, consent: true }).success).toBe(true);
    expect(ProductEnquirySchema.safeParse({ ...base, consent: false }).success).toBe(false);
    expect(ProductEnquirySchema.safeParse({ ...base, consent: true, lines: [] }).success).toBe(false);
  });
});
