import { describe, expect, it } from 'vitest';
import { CapacityOfferSchema, DemandPoolSchema, MicroContractSchema, capacityFree, commitmentState, eachDay, matchBusinessModels, poolQuoteApplies } from './collab-ops';

describe('launch matching', () => {
  it('only suggests models built on something the person has, store first for a store owner', () => {
    const r = matchBusinessModels({ have: ['store', 'customers'], invest: 'lt5l', time: 'part_time' });
    expect(r[0].model.code).toBe('store_network');
    expect(r.every((x) => x.model.core.some((k) => ['store', 'customers'].includes(k)))).toBe(true);
  });
  it('flags investment and time gaps instead of hiding the model', () => {
    const r = matchBusinessModels({ have: ['customers', 'warehouse'], invest: 'none', time: 'passive' });
    const d = r.find((x) => x.model.code === 'distribution')!;
    expect(d.gaps.length).toBe(2);
    expect(d.score).toBeLessThan(r.find((x) => x.model.code === 'warehouse_3pl')!.score);
  });
  it('returns nothing for no resources in any model', () => { expect(matchBusinessModels({ have: ['nothing'], invest: 'gt1cr', time: 'full_time' })).toEqual([]); });
});

describe('capacity', () => {
  const offer = { units: 12, from: '2026-11-21', to: '2027-01-03' };
  it('counts the busiest day in the range', () => {
    const b = [{ units: 4, from: '2026-11-22', to: '2026-11-25' }, { units: 5, from: '2026-11-24', to: '2026-11-30' }];
    expect(capacityFree(offer, b, '2026-11-21', '2026-11-23')).toBe(8);
    expect(capacityFree(offer, b, '2026-11-24', '2026-11-24')).toBe(3);
    expect(capacityFree(offer, b, '2026-12-01', '2026-12-05')).toBe(12);
  });
  it('has nothing free outside the offer dates', () => { expect(capacityFree(offer, [], '2026-11-20', '2026-11-22')).toBe(0); });
  it('validates dates and rates', () => {
    const base = { type: 'workers', title: 'Solar crew of twelve', units: 12, from: '2026-11-21', to: '2026-11-20', rateUnit: 'day', rate: 1500, state: 'KA' };
    expect(CapacityOfferSchema.safeParse(base).success).toBe(false);
    expect(CapacityOfferSchema.safeParse({ ...base, to: '2026-12-01', rate: null }).success).toBe(false);
    expect(CapacityOfferSchema.safeParse({ ...base, to: '2026-12-01', rateUnit: 'negotiable', rate: null }).success).toBe(true);
    expect(eachDay('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });
});

describe('micro, pools, commit', () => {
  it('keeps micro-contract prices between ₹100 and ₹50,000', () => {
    const m = { kind: 'calling', title: '150 calls to contractors', scope: 'Call contractors from the list and note interest.', acceptance: 'Call log with outcomes', quantity: 150, unit: 'calls', priceRs: 3000, due: '2026-12-01' };
    expect(MicroContractSchema.safeParse(m).success).toBe(true);
    expect(MicroContractSchema.safeParse({ ...m, priceRs: 50 }).success).toBe(false);
    expect(MicroContractSchema.safeParse({ ...m, priceRs: 60000 }).success).toBe(false);
  });
  it('pools: own quantity within target; quotes apply only at minimum quantity', () => {
    const p = { title: 'Armoured cable', spec: '1.1 kV XLPE copper armoured cable, IS 7098', unit: 'metres', state: 'MH', targetQty: 20000, myQty: 25000, joinBy: '2026-12-05' };
    expect(DemandPoolSchema.safeParse(p).success).toBe(false);
    expect(poolQuoteApplies(10500, 20000)).toBe(false); expect(poolQuoteApplies(20000, 20000)).toBe(true);
  });
  it('commitments bind only when every pledge and condition is in before the deadline', () => {
    const c = { deadline: '2026-12-31', parties: [{ pledgedAt: '2026-11-20T10:00:00Z' }, { pledgedAt: null }], conditions: [{ verifiedAt: '2026-11-21T00:00:00Z' }] };
    expect(commitmentState(c, '2026-11-25')).toBe('pledging');
    expect(commitmentState(c, '2027-01-01')).toBe('lapsed');
    expect(commitmentState({ ...c, parties: [{ pledgedAt: '2026-11-20T10:00:00Z' }, { pledgedAt: '2026-12-02T00:00:00Z' }] }, '2026-12-03')).toBe('binding');
    expect(commitmentState({ ...c, parties: [{ pledgedAt: null }, { pledgedAt: null, declined: true }] }, '2026-11-25')).toBe('withdrawn');
    expect(commitmentState({ ...c, parties: [{ pledgedAt: null }, { pledgedAt: null }] }, '2026-11-25')).toBe('draft');
  });
});
