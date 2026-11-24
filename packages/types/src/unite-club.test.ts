import { describe, expect, it } from 'vitest';
import { UcEventSchema, UcReferralSchema, ucCategoryKey, ucChapterSlug } from './unite-club';

describe('Unite Club', () => {
  it('treats spelling variants of a business category as the same seat', () => {
    expect(ucCategoryKey('Chartered Accountants')).toBe(ucCategoryKey('chartered accountant'));
    expect(ucCategoryKey('Interior  designer!')).toBe('interior designer');
  });
  it('makes a chapter address from name and city', () => {
    expect(ucChapterSlug('Unite Club Pune Central', 'Pune')).toBe('unite-club-pune-central');
    expect(ucChapterSlug('Banjara Hills', 'Hyderabad')).toBe('banjara-hills-hyderabad');
  });
  it('needs consent and a way to reach the person for a referral', () => {
    const base = { toUserId: '00000000-0000-4000-8000-000000000001', contactName: 'Meghana', need: 'Needs a rooftop solar quote for her house' };
    expect(UcReferralSchema.safeParse({ ...base, contactPhone: '9876500000', consent: false }).success).toBe(false);
    expect(UcReferralSchema.safeParse({ ...base, consent: true }).success).toBe(false);
    expect(UcReferralSchema.safeParse({ ...base, contactPhone: '9876500000', consent: true }).success).toBe(true);
  });
  it('events end after they start', () => {
    expect(UcEventSchema.safeParse({ kind: 'meeting', title: 'Weekly', startsAt: '2026-12-01T07:30:00+05:30', endsAt: '2026-12-01T07:00:00+05:30' }).success).toBe(false);
  });
});
