import { describe, expect, it } from 'vitest';
import { EB5_FORBIDDEN_CLAIMS, EB5_LEAD_STAGES, EB5_PERMISSIONS, Eb5LeadSchema, eb5Can, feeSchedule, normEmail, normPhone } from './eb5';

describe('GO EB5 rules', () => {
  it('fee schedule: 10% of $200,000 is $20,000, balance $180,000 (cents)', () => {
    expect(feeSchedule(200_000, 10)).toEqual({ total: 20_000_000, commencement: 2_000_000, balance: 18_000_000 });
  });
  it('referral partners can introduce but never see documents, finance or agreements', () => {
    for (const p of ['document.view_private', 'payment.verify', 'invoice.issue', 'agreement.draft', 'lead.view_all'] as const) expect(eb5Can(['bd_partner'], p)).toBe(false);
    expect(eb5Can(['bd_partner'], 'lead.introduce')).toBe(true);
    expect(eb5Can(['attorney'], 'case.attorney_verify')).toBe(true);
    expect(eb5Can(['finance'], 'payment.verify')).toBe(true);
    expect(eb5Can(['citrus_admin'], 'payment.verify')).toBe(false); // finance verifies, not the seller
  });
  it('only compliance records compensation; nobody else', () => {
    expect([...EB5_PERMISSIONS['compensation.record']]).toEqual(['compliance']);
  });
  it('leads need consent and a contact route', () => {
    const base = { fullName: 'Demo Prospect', country: 'India', readiness: 'Exploring', timeline: '6–12 months', contactPreference: 'Email' };
    expect(Eb5LeadSchema.safeParse({ ...base, email: 'a@b.co' }).success).toBe(false);
    expect(Eb5LeadSchema.safeParse({ ...base, consent: true }).success).toBe(false);
    expect(Eb5LeadSchema.safeParse({ ...base, consent: true, email: 'a@b.co' }).success).toBe(true);
    expect(normEmail(' A@B.co ')).toBe('a@b.co'); expect(normPhone('+91 98200-11111')).toBe('9820011111');
    expect(EB5_LEAD_STAGES).toHaveLength(16);
  });
  it('flags promises of visas or returns', () => {
    expect(EB5_FORBIDDEN_CLAIMS.test('Guaranteed green card in 18 months')).toBe(true);
    expect(EB5_FORBIDDEN_CLAIMS.test('guaranteed returns on your investment')).toBe(true);
    expect(EB5_FORBIDDEN_CLAIMS.test('100% visa approval')).toBe(true);
    expect(EB5_FORBIDDEN_CLAIMS.test('Consultation about EB-5 eligibility')).toBe(false);
  });
});
