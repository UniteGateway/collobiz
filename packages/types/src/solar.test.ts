import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SOLAR_CONFIG as C, recommendKw, subsidyFor, quoteSolar, readBill, solarCommission, referralReward, pickKit, savingsFor, epcBoq,
  applyPromotions, promoApplies, type PromoLike,
} from './index';

const home = { segment: 'residential' as const, region: 'IN-MH', monthlyUnits: 350, tariff: 900 };
const kits = [1, 2, 3, 4, 5].map((kw) => ({ id: `k${kw}`, code: `USK-OG-${kw}`, name: `${kw} kW on-grid`, system: 'on_grid', capacityKw: kw, price: kw * 60_000_00 }));

describe('solar sizing, subsidy and savings', () => {
  it('sizes to the yearly consumption, limited by sanctioned load and roof', () => {
    expect(recommendKw(C, home).kw).toBe(3); // 4200 kWh / 1450 = 2.9 → 3
    expect(recommendKw(C, { ...home, sanctionedLoadKw: 2 })).toEqual({ kw: 2, limits: ['sanctioned load'] });
    expect(recommendKw(C, { ...home, roofAreaSqft: 150 }).limits).toContain('roof area');
    expect(recommendKw(C, { ...home, segment: 'commercial', monthlyUnits: 30000 }).kw).toBe(250); // 248.3 → step 5
  });
  it('PM Surya Ghar: ₹30k/kW for 2 kW, ₹18k for the 3rd, capped at ₹78k; homes and on-grid only', () => {
    expect(subsidyFor(C, 'residential', 'on_grid', 1)).toBe(30_000_00);
    expect(subsidyFor(C, 'residential', 'on_grid', 2.5)).toBe(69_000_00);
    expect(subsidyFor(C, 'residential', 'on_grid', 10)).toBe(78_000_00);
    expect(subsidyFor(C, 'commercial', 'on_grid', 10)).toBe(0);
    expect(subsidyFor(C, 'residential', 'hybrid', 3)).toBe(0);
  });
  it('picks the smallest kit that covers the need, else the largest', () => {
    expect(pickKit(kits, 'on_grid', 2.9)?.capacityKw).toBe(3);
    expect(pickKit(kits, 'on_grid', 9)?.capacityKw).toBe(5);
    expect(pickKit(kits, 'hybrid', 3)).toBeNull();
  });
  it('kit quote: GST inside the price, subsidy off the net, payback within a sensible range', () => {
    const q = quoteSolar(C, { site: home, model: 'kit', system: 'on_grid' }, kits[2]);
    expect(q.total).toBe(180_000_00);
    expect(q.subtotal + q.gst).toBe(q.total);
    expect(q.net).toBe(180_000_00 - 78_000_00);
    expect(q.savings.annualGeneration).toBe(4350);
    expect(q.savings.paybackYears).toBeGreaterThan(2);
    expect(q.savings.paybackYears).toBeLessThan(5);
    expect(q.commission).toBe(7_500_00); // 3 kW × ₹2,500
  });
  it('EPC: BOQ lines add up to the subtotal; GST on top; tiered commission', () => {
    const b = epcBoq(C, 100);
    expect(b.subtotal).toBe(100 * 1000 * 4400);
    expect(b.lines.reduce((a, l) => a + l.amount, 0)).toBe(b.subtotal);
    expect(b.lines[0].quantity).toBe(182); // 100 kW / 550 W
    const q = quoteSolar(C, { site: { ...home, segment: 'commercial', monthlyUnits: 12000, tariff: 1000 }, model: 'epc', system: 'on_grid', capacityKw: 100 }, null);
    expect(q.total).toBe(Math.round(b.subtotal * 1.089));
    expect(q.subsidy).toBe(0);
    expect(solarCommission(C, 'epc', 0, 2_00_00_000_00)).toBe(2_00_000_00 + 1_50_000_00); // 2% of first 1 Cr + 1.5% of next
  });
  it('PPA: no upfront cost, savings are the tariff gap, minimum size enforced', () => {
    const site = { ...home, segment: 'industrial' as const, monthlyUnits: 20000, tariff: 900 };
    const q = quoteSolar(C, { site, model: 'ppa', system: 'on_grid', capacityKw: 150 }, null);
    expect(q.total).toBe(0);
    expect(q.savings.yearOneSavings).toBe(Math.round(150 * 1450 * (900 - 490)));
    expect(q.savings.paybackYears).toBeNull();
    expect(() => quoteSolar(C, { site, model: 'ppa', system: 'on_grid', capacityKw: 20 }, null)).toThrow(/at least 50 kW/);
  });
  it('exported surplus earns only the export rate', () => {
    const s = savingsFor(C, { ...home, monthlyUnits: 100 }, 5, 0);
    expect(s.yearOneSavings).toBe(Math.round(1200 * 900 + (5 * 1450 - 1200) * 300));
  });
  it('referral reward: flat for homes, per kW (capped) for businesses', () => {
    expect(referralReward(C, 'residential', 10)).toBe(2_000_00);
    expect(referralReward(C, 'commercial', 50)).toBe(15_000_00);
    expect(referralReward(C, 'industrial', 500)).toBe(25_000_00);
  });
});

describe('reading a power bill', () => {
  it('MSEDCL-style monthly bill', () => {
    const b = readBill(`Maharashtra State Electricity Distribution Co. Ltd (MSEDCL)\nConsumer No: 170012345678\nTariff: LT I Residential\nSanctioned Load : 3 KW\nBilling Period 01/09/2026 to 30/09/2026\nUnits Consumed : 412\nNet Amount Payable Rs. 3,914.00`);
    expect(b).toMatchObject({ units: 412, amount: 391400, sanctionedLoadKw: 3, billingMonths: 1, consumerNo: '170012345678', discom: 'MSEDCL', segment: 'residential', monthlyUnits: 412, tariff: 950 });
  });
  it('bi-monthly bill halves the units; HP load converted to kW; commercial category', () => {
    const b = readBill('TNPDCL bi-monthly bill · Service No 0412345678 · Commercial LT II · Connected Load 10 HP · Total Units 1,800 · Total Amount Due ₹ 18,450');
    expect(b).toMatchObject({ units: 1800, billingMonths: 2, monthlyUnits: 900, sanctionedLoadKw: 7.5, segment: 'commercial', discom: 'TNPDCL', amount: 1845000 });
  });
  it('unreadable text finds nothing rather than guessing', () => {
    const b = readBill('Thank you for paying on time.');
    expect(b.found).toEqual([]);
    expect(b.monthlyUnits).toBeNull();
  });
});

describe('BOGO promotions', () => {
  const now = new Date('2026-11-09T10:00:00Z');
  const base: PromoLike = { id: 'p1', code: 'PRM-1', name: 'Diwali', buyQty: 1, getQty: 1, scope: 'all', sectors: [], itemRefs: [], channel: 'both', stores: [], maxFreePerOrder: 2, budgetUnits: 10, budgetValue: null, usedUnits: 0, usedValue: 0, startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-30T00:00:00Z', status: 'active' };
  const cart = [{ ref: 'item:a', name: 'Lantern', sector: 'Solar', unitPrice: 1000_00, qty: 3 }, { ref: 'item:b', name: 'Fan', sector: 'Appliances', unitPrice: 2500_00, qty: 1 }];
  it('buy 1 get 1: free units on top, per-order cap goes to the dearest items first, whatever the cart order', () => {
    const r = applyPromotions(cart, [base], 'online', null, now);
    expect(r.lines.map((l) => l.freeQty)).toEqual([1, 1]); // fan first (₹2,500), then one lantern; cap of 2 used up
    expect(r.subtotal).toBe(5500_00);
    expect(r.freeValue).toBe(3500_00);
    const r2 = applyPromotions([...cart].reverse(), [base], 'online', null, now);
    expect(r2.lines.map((l) => l.freeQty)).toEqual([1, 1]);
    expect(applyPromotions([cart[0]], [{ ...base, maxFreePerOrder: 5 }], 'online', null, now).lines[0].freeQty).toBe(3);
  });
  it('respects channel, store list, dates, status and budget', () => {
    expect(promoApplies({ ...base, channel: 'online' }, 'store', 'Pune', now)).toBe(false);
    expect(promoApplies({ ...base, channel: 'store', stores: ['Pune'] }, 'store', 'Mysuru', now)).toBe(false);
    expect(promoApplies({ ...base, channel: 'store', stores: ['Pune'] }, 'store', 'Pune', now)).toBe(true);
    expect(promoApplies(base, 'online', null, new Date('2026-12-02T00:00:00Z'))).toBe(false);
    expect(promoApplies({ ...base, status: 'draft' }, 'online', null, now)).toBe(false);
    expect(promoApplies({ ...base, usedUnits: 10 }, 'online', null, now)).toBe(false);
    expect(applyPromotions(cart, [{ ...base, budgetUnits: null, budgetValue: 1500_00 }], 'online', null, now).lines[0].freeQty).toBe(1);
  });
  it('category scope; buy 2 get 1', () => {
    const r = applyPromotions(cart, [{ ...base, scope: 'sectors', sectors: ['Appliances'], buyQty: 2, getQty: 1 }], 'online', null, now);
    expect(r.lines.map((l) => l.freeQty)).toEqual([0, 0]);
    const r2 = applyPromotions([{ ...cart[1], qty: 4 }], [{ ...base, scope: 'sectors', sectors: ['Appliances'], buyQty: 2, getQty: 1 }], 'online', null, now);
    expect(r2.lines[0].freeQty).toBe(2);
  });
});
