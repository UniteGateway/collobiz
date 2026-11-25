import { describe, expect, it } from 'vitest';
import { CeLeadSchema, CeOpportunitySchema, ceCommission, ceLeadFingerprint, ceNextStage, cePlatformFee, cePotential } from './comearn';

const base = { title: '1 MW rooftop solar for factories', type: 'sales_conversion', category: 'solar', description: 'Introduce factories that want rooftop solar; we design, supply and install.', territory: 'Telangana', trigger: 'customer_payment' };

describe('COMEARN opportunity terms', () => {
  it('requires the figure for the chosen commission model', () => {
    expect(CeOpportunitySchema.safeParse({ ...base, model: 'percent' }).success).toBe(false);
    expect(CeOpportunitySchema.safeParse({ ...base, model: 'percent', rateBps: 200 }).success).toBe(true);
    expect(CeOpportunitySchema.safeParse({ ...base, model: 'fixed' }).success).toBe(false);
    expect(CeOpportunitySchema.safeParse({ ...base, model: 'recurring', rateBps: 100 }).success).toBe(false);
  });
  it('milestones must add up to 100%', () => {
    const r = CeOpportunitySchema.safeParse({ ...base, model: 'milestone', rateBps: 300, milestones: [{ label: 'Order', pct: 40 }, { label: 'Commissioning', pct: 50 }] });
    expect(r.success).toBe(false);
    expect(CeOpportunitySchema.safeParse({ ...base, model: 'milestone', rateBps: 300, milestones: [{ label: 'Order', pct: 40 }, { label: 'Commissioning', pct: 60 }] }).success).toBe(true);
  });
});

describe('COMEARN commission calculation', () => {
  it('computes percentage, fixed and milestone commission from the verified amount', () => {
    const cr3 = 3 * 1e7 * 100; // ₹3 crore
    expect(ceCommission({ model: 'percent', rateBps: 200, trigger: 'customer_payment', paymentDays: 30, milestones: [] }, cr3)).toBe(6 * 1e5 * 100); // ₹6 lakh
    expect(ceCommission({ model: 'fixed', fixedPaise: 50_000_00, trigger: 'order_confirmed', paymentDays: 30, milestones: [] }, cr3)).toBe(50_000_00);
    const ms = { model: 'milestone' as const, rateBps: 300, trigger: 'milestone_completed' as const, paymentDays: 30, milestones: [{ label: 'Order', pct: 40 }, { label: 'Commissioning', pct: 60 }] };
    expect(ceCommission(ms, cr3, 0) + ceCommission(ms, cr3, 1)).toBe(9 * 1e5 * 100);
    expect(ceCommission(ms, cr3, 5)).toBe(0);
  });
  it('potential is an estimate only when a value is known; platform fee is off at 0', () => {
    expect(cePotential({ model: 'percent', rateBps: 200, trigger: 'customer_payment', paymentDays: 30, milestones: [] }, null)).toBeNull();
    expect(cePlatformFee(6 * 1e5 * 100, 0)).toBe(0);
    expect(cePlatformFee(6 * 1e5 * 100, 1000)).toBe(6 * 1e4 * 100);
  });
});

describe('COMEARN leads and stages', () => {
  it('fingerprints a customer by GSTIN, else phone, so the same customer is caught', () => {
    expect(ceLeadFingerprint({ customerName: 'A', phone: '+91 98480 12345' })).toBe(ceLeadFingerprint({ customerName: 'B', phone: '9848012345' }));
    expect(ceLeadFingerprint({ customerName: 'A', gstin: '36aabcu9603r1zm', phone: '1' })).toBe('gst:36AABCU9603R1ZM');
  });
  it('needs customer consent and a way to reach them', () => {
    const l = { customerName: 'Deccan Cements', city: 'Hyderabad', contactName: 'Plant head', requirement: 'Needs a 1 MW rooftop solar plant', phone: '9848012345' };
    expect(CeLeadSchema.safeParse(l).success).toBe(false);
    expect(CeLeadSchema.safeParse({ ...l, consent: true }).success).toBe(true);
    expect(CeLeadSchema.safeParse({ ...l, phone: undefined, consent: true }).success).toBe(false);
  });
  it('walks the eight stages in order', () => {
    expect(ceNextStage('selected')).toBe('agreement_accepted');
    expect(ceNextStage('commission_paid')).toBeNull();
  });
});

describe('COMEARN reverse marketplace, team pool and reputation', () => {
  it('a requirement needs customer consent and contact; a bid needs its figure', async () => {
    const { CeRequirementSchema, CeBidSchema } = await import('./comearn');
    const r = { title: 'Factory needs a 1 MW solar plant', category: 'solar', description: 'Two sheds, 1 MW rooftop, wants a turnkey EPC partner.', city: 'Hyderabad', closesOn: '2026-12-31', customerName: 'Deccan Polymers', contactName: 'Plant head', phone: '9848012345' };
    expect(CeRequirementSchema.safeParse(r).success).toBe(false);
    expect(CeRequirementSchema.safeParse({ ...r, consent: true }).success).toBe(true);
    expect(CeBidSchema.safeParse({ model: 'percent', trigger: 'customer_payment', proposal: 'Turnkey EPC with 25-year performance warranty.' }).success).toBe(false);
  });
  it('allocates a pool by shares with the remainder to the lead', async () => {
    const { ceAllocate, ceLeadShareBp } = await import('./comearn');
    expect(ceLeadShareBp([2500, 1500, 1500, 1000])).toBe(3500);
    const parts = ceAllocate(30_00_000_01, [3500, 2500, 1500, 1500, 1000]);
    expect(parts.reduce((s, x) => s + x, 0)).toBe(30_00_000_01);
    expect(parts[1]).toBe(Math.floor(30_00_000_01 * 0.25));
  });
  it('reputation is null without history and never invented', async () => {
    const { ceReputation } = await import('./comearn');
    expect(ceReputation({ engagements: 0, converted: 0, paid: 0, onTime: 0, disputesLost: 0 })).toBeNull();
    expect(ceReputation({ engagements: 4, converted: 2, paid: 2, onTime: 1, disputesLost: 0 })).toMatchObject({ conversionPct: 50, onTimePct: 50 });
  });
});

describe('COMEARN Unite margin and ratings', () => {
  it('members see the company rate minus the Unite margin; the member must still earn something', async () => {
    const { ceMemberTerms } = await import('./comearn');
    expect(ceMemberTerms({ model: 'percent', rateBps: 500 }, { bps: 100 })).toMatchObject({ rateBps: 400, marginBps: 100 });
    expect(ceMemberTerms({ model: 'fixed', fixedPaise: 50_000_00 }, { paise: 10_000_00 })).toMatchObject({ fixedPaise: 40_000_00 });
    expect(ceMemberTerms({ model: 'percent', rateBps: 200 }, { bps: 200 })).toBeNull();
  });
  it('rating summary is null without ratings', async () => {
    const { ceRatingSummary } = await import('./comearn');
    expect(ceRatingSummary([])).toBeNull();
    expect(ceRatingSummary([5, 4, 4])).toEqual({ avg: 4.3, count: 3 });
  });
});
