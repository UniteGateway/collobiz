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
