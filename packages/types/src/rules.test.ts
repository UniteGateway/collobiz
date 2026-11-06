import { describe, it, expect } from 'vitest';
import {
  addBusinessMinutes, businessMinutesBetween, slaStatus, DEFAULT_CALENDAR,
  duplicateScore, calculateCommission, scorePartner, rankPartners, computeReputation,
  CommissionMachine, OpportunityMachine, assertTransition, canTransition, TransitionError,
  SCREENS, SCREEN_FAMILIES, capabilitiesFor, LeadCreateSchema, BankTaxSchema, RegisterSchema as RegisterSchemaForMsg,
} from './index';

const IST = (s: string) => new Date(`${s}+05:30`);

describe('SLA business hours (§2.3 4-hour first review)', () => {
  it('adds 4 business hours within one day', () => {
    expect(addBusinessMinutes(IST('2026-11-09T10:00:00'), 240).toISOString()).toBe(IST('2026-11-09T14:00:00').toISOString());
  });
  it('rolls over evening into next business morning', () => {
    // Mon 16:00 + 4h = Mon 18:00 (2h) + Tue 09:00-11:00
    expect(addBusinessMinutes(IST('2026-11-09T16:00:00'), 240).toISOString()).toBe(IST('2026-11-10T11:00:00').toISOString());
  });
  it('skips weekends and holidays', () => {
    const cal = { ...DEFAULT_CALENDAR, holidays: ['2026-11-16'] };
    // Fri 17:00 + 2h → Fri 1h, skip Sat/Sun/Mon(holiday) → Tue 10:00
    expect(addBusinessMinutes(IST('2026-11-13T17:00:00'), 120, cal).toISOString()).toBe(IST('2026-11-17T10:00:00').toISOString());
  });
  it('submission on a Saturday starts at Monday open', () => {
    expect(addBusinessMinutes(IST('2026-11-14T11:00:00'), 60).toISOString()).toBe(IST('2026-11-16T10:00:00').toISOString());
  });
  it('counts business minutes between instants', () => {
    expect(businessMinutesBetween(IST('2026-11-13T17:00:00'), IST('2026-11-16T10:00:00'))).toBe(120);
  });
  it('honours pause minutes and reports breach', () => {
    const s = slaStatus(IST('2026-11-09T10:00:00'), 240, 60, IST('2026-11-09T14:30:00'));
    expect(s.dueAt.toISOString()).toBe(IST('2026-11-09T15:00:00').toISOString());
    expect(s.breached).toBe(false);
    expect(slaStatus(IST('2026-11-09T10:00:00'), 240, 0, IST('2026-11-09T14:30:00')).breached).toBe(true);
  });
});

describe('duplicate lead scoring', () => {
  it('flags same GSTIN + similar name for review', () => {
    const r = duplicateScore(
      { customerName: 'Sunrise Textiles Pvt Ltd', taxId: '27AAACS1234A1Z5', city: 'Pune', category: 'solar' },
      { customerName: 'Sunrise Textiles Limited', taxId: '27AAACS1234A1Z5', city: 'pune', category: 'solar' },
    );
    expect(r.requiresReview).toBe(true);
    expect(r.reasons).toContain('Same tax / registration ID');
  });
  it('does not flag unrelated companies or shared free-mail domains', () => {
    const r = duplicateScore(
      { customerName: 'Alpha Steel', email: 'a@gmail.com' },
      { customerName: 'Beta Foods', email: 'b@gmail.com' },
    );
    expect(r.score).toBe(0);
    expect(r.requiresReview).toBe(false);
  });
});

describe('commission calculation (integer minor units)', () => {
  it('percent with GST and TDS', () => {
    const b = calculateCommission({ dealValue: 10_000_000_00, basis: 'percent', ratePct: 2, gstPct: 18, tdsPct: 5 });
    expect(b.gross).toBe(20_000_000);
    expect(b.gst).toBe(3_600_000);
    expect(b.tds).toBe(1_000_000);
    expect(b.payable).toBe(22_600_000);
  });
  it('tiered with team share and deductions', () => {
    const b = calculateCommission({
      dealValue: 300_000, basis: 'tiered', tiers: [{ upTo: 100_000, ratePct: 5 }, { upTo: null, ratePct: 2 }],
      sharePct: 50, deductions: [{ label: 'Platform fee', pct: 10 }],
    });
    expect(b.gross).toBe(9_000); // 5000 + 4000
    expect(b.share).toBe(4_500);
    expect(b.deductions[0].amount).toBe(450);
    expect(b.payable).toBe(4_050);
  });
  it('rejects invalid input', () => {
    expect(() => calculateCommission({ dealValue: -1, basis: 'flat', flatAmount: 1 })).toThrow();
    expect(() => calculateCommission({ dealValue: 1, basis: 'percent', ratePct: 140 })).toThrow();
  });
});

describe('explainable matching', () => {
  const base = { id: 'p1', name: 'Volt EPC', sectors: ['solar'], regions: ['MH'], capacityMax: 50_000_000, certifications: ['ISO9001'], reputationScore: 80, verified: true, consentToMatch: true };
  it('excludes partners without consent or verification', () => {
    expect(scorePartner({ ...base, consentToMatch: false }, { category: 'solar' })).toBeNull();
    expect(scorePartner({ ...base, verified: false }, { category: 'solar' })).toBeNull();
  });
  it('explains factors and uncertainty, ranks better fits first', () => {
    const s = scorePartner(base, { category: 'solar', region: 'MH', value: 10_000_000, requiredCertifications: ['ISO9001'] })!;
    expect(s.score).toBe(97);
    expect(s.factors.map((f) => f.factor)).toEqual(['Sector', 'Geography', 'Capacity', 'Certifications', 'Verified reputation']);
    expect(s.disclaimer).toMatch(/human review/);
    const ranked = rankPartners([{ ...base, id: 'p2', sectors: ['trading'] }, base], { category: 'solar', region: 'MH' });
    expect(ranked[0].partnerId).toBe('p1');
    expect(ranked[0].uncertainty.length).toBeGreaterThan(0);
  });
});

describe('reputation', () => {
  it('is unrated without verified outcomes; reviews alone cannot rate', () => {
    expect(computeReputation([{ kind: 'review', rating: 5, status: 'counted' }]).tier).toBe('unrated');
  });
  it('shrinks small samples and excludes appealed events', () => {
    const one = computeReputation([{ kind: 'verified_outcome', onTime: true, quality: 5, settlementConduct: 5, status: 'counted' }]);
    expect(one.score).toBeLessThan(80);
    const ex = computeReputation([
      { kind: 'verified_outcome', onTime: true, quality: 5, settlementConduct: 5, status: 'counted' },
      { kind: 'verified_outcome', onTime: false, quality: 1, settlementConduct: 1, status: 'excluded' },
    ]);
    expect(ex.score).toBe(one.score);
  });
});

describe('state machines', () => {
  it('blocks paying an unearned commission', () => {
    expect(canTransition(CommissionMachine, 'estimated', 'settled')).toBe(false);
    expect(() => assertTransition(CommissionMachine, 'eligible', 'invoiced')).toThrow(TransitionError);
    expect(canTransition(CommissionMachine, 'approved', 'invoiced')).toBe(true);
  });
  it('enforces Unite priority review path', () => {
    expect(canTransition(OpportunityMachine, 'verified', 'unite_priority_review')).toBe(true);
    expect(canTransition(OpportunityMachine, 'submitted', 'awarded')).toBe(false);
  });
});

describe('catalogue & permissions', () => {
  it('has all 165 screens with unique sequential ids and 16 families', () => {
    expect(SCREENS).toHaveLength(165);
    expect(SCREENS.map((s) => s.id)).toEqual(Array.from({ length: 165 }, (_, i) => String(i + 1).padStart(3, '0')));
    expect(SCREEN_FAMILIES).toHaveLength(16);
    expect(new Set(SCREENS.map((s) => `${s.app}${s.route}`)).size).toBe(165);
  });
  it('super admin cannot approve payouts alone; finance can', () => {
    expect(capabilitiesFor(['super_admin']).has('payout.approve')).toBe(false);
    expect(capabilitiesFor(['finance']).has('payout.approve')).toBe(true);
    expect(capabilitiesFor(['org_owner']).has('kyb.review')).toBe(false);
  });
});

describe('schemas', () => {
  it('requires consent provenance for leads', () => {
    const r = LeadCreateSchema.safeParse({ customer: { legalName: 'X Co', contactName: 'Ann', city: 'Pune' }, sector: 'solar', productOrProject: 'Rooftop', estimatedValue: 100, requirements: 'x'.repeat(25), evidenceSummary: 'emailed intro' });
    expect(r.success).toBe(false);
  });
  it('requires GSTIN when GST registered', () => {
    const r = BankTaxSchema.safeParse({ accountHolder: 'A B', accountNumber: '12345678', ifsc: 'HDFC0001234', bankName: 'HDFC', pan: 'ABCDE1234F', gstRegistered: true });
    expect(r.success).toBe(false);
  });
});

describe('validation messages', () => {
  it('uses plain-language messages', () => {
    const r = RegisterSchemaForMsg.safeParse({ email: 'x', fullName: 'A', password: 'abcdefghij1', acceptTerms: true });
    const m = Object.fromEntries((r as any).error.issues.map((i: any) => [i.path.join('.'), i.message]));
    expect(m.email).toBe('Enter a valid email address');
    expect(m.fullName).toBe('Enter at least 2 characters');
  });
});
