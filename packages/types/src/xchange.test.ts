import { describe, it, expect } from 'vitest';
import { balances, isBalanced, dealKind, findCycles, oneWayMatches, termsKey, type XListing } from './index';

const L = (id: string, orgId: string, side: 'offer' | 'need', category: string, value: number, region = 'IN-MH', accepts = ['barter', 'part_cash']): XListing => ({ id, orgId, orgName: orgId, side, category, title: id, value, region, accepts });

describe('XCHANGE balances', () => {
  it('direct barter of equal value is balanced', () => {
    const legs = [{ fromOrgId: 'A', toOrgId: 'B', value: 5_00_000_00, cash: 0 }, { fromOrgId: 'B', toOrgId: 'A', value: 5_00_000_00, cash: 0 }];
    expect(isBalanced(legs).ok).toBe(true);
    expect(dealKind(legs)).toBe('direct');
  });
  it('part-cash: ₹10 L machinery for ₹6 L materials + ₹4 L cash', () => {
    const legs = [{ fromOrgId: 'A', toOrgId: 'B', value: 10_00_000_00, cash: 4_00_000_00 }, { fromOrgId: 'B', toOrgId: 'A', value: 6_00_000_00, cash: 0 }];
    expect(balances(legs).map((b) => b.net)).toEqual([0, 0]);
    expect(dealKind(legs)).toBe('part_cash');
    expect(isBalanced([{ ...legs[0], cash: 0 }, legs[1]]).ok).toBe(false);
  });
  it('three-way cycle A→B→C→A of near-equal values is balanced within 2%', () => {
    const legs = [{ fromOrgId: 'A', toOrgId: 'B', value: 300_000_00, cash: 0 }, { fromOrgId: 'B', toOrgId: 'C', value: 300_000_00, cash: 0 }, { fromOrgId: 'C', toOrgId: 'A', value: 295_000_00, cash: 0 }];
    expect(isBalanced(legs).ok).toBe(true);
    expect(dealKind(legs)).toBe('multi');
  });
  it('terms key ignores leg order but not values', () => {
    const a = { fromOrgId: 'A', toOrgId: 'B', description: 'x', value: 1, cash: 0 }; const b = { fromOrgId: 'B', toOrgId: 'A', description: 'y', value: 1, cash: 0 };
    expect(termsKey([a, b])).toBe(termsKey([b, a]));
    expect(termsKey([a, b])).not.toBe(termsKey([{ ...a, value: 2 }, b]));
  });
});

describe('XCHANGE matching', () => {
  // Solar supplier needs construction; contractor needs advertising; agency needs solar equipment.
  const listings = [
    L('solar-off', 'Solar', 'offer', 'solar_equipment', 5_00_000_00), L('solar-need', 'Solar', 'need', 'construction_services', 5_00_000_00),
    L('build-off', 'Build', 'offer', 'construction_services', 5_20_000_00), L('build-need', 'Build', 'need', 'advertising', 4_80_000_00),
    L('ads-off', 'Ads', 'offer', 'advertising', 5_00_000_00), L('ads-need', 'Ads', 'need', 'solar_equipment', 5_00_000_00),
    L('cash-only', 'Other', 'offer', 'construction_services', 4_00_000_00, 'IN-MH', ['cash']),
  ];
  it('finds the three-way cycle that no pair could do alone', () => {
    const c = findCycles(listings, 'Solar');
    expect(c).toHaveLength(1);
    expect(c[0].orgs).toEqual(['Solar', 'Ads', 'Build']);
    expect(c[0].legs.map((l) => l.offer.id)).toEqual(['solar-off', 'ads-off', 'build-off']);
    expect(c[0].imbalancePct).toBeLessThan(10);
  });
  it('prefers a direct swap when one exists; cash-only listings never enter barter cycles', () => {
    const c = findCycles([...listings, L('build-need2', 'Build', 'need', 'solar_equipment', 5_00_000_00)], 'Solar');
    expect(c[0].orgs).toEqual(['Solar', 'Build']);
    expect(c.flatMap((x) => x.legs.map((l) => l.offer.id))).not.toContain('cash-only');
  });
  it('one-way matches for part-cash or cash deals', () => {
    const m = oneWayMatches(listings, 'Solar');
    expect(m.some((x) => x.theirs.id === 'ads-need' && x.direction === 'they_need_my_offer')).toBe(true);
    expect(m.some((x) => x.theirs.id === 'cash-only' && x.direction === 'they_offer_my_need')).toBe(true);
  });
});
