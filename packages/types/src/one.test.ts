import { describe, expect, it } from 'vitest';
import { challengeCoverage, gapsCovered, revivalSuggestions, turnoverBand } from './one';

describe('COLLABIZ ONE extras', () => {
  it('turnover bands', () => {
    expect(turnoverBand(50_00_000_00)).toBe('Under ₹1 crore');
    expect(turnoverBand(12_00_00_000_00)).toBe('₹5–25 crore');
    expect(turnoverBand(null)).toBeNull();
  });
  it('rescue gaps from business types and stated skills', () => {
    expect(gapsCovered({ partnerTypes: ['contractor'], skills: ['Crane rental'], services: [] }, ['manpower', 'equipment', 'finance'])).toEqual(['manpower', 'equipment']);
    expect(gapsCovered({ partnerTypes: ['finance_associate'], skills: [], services: [] }, ['finance', 'technology'])).toEqual(['finance']);
  });
  it('challenge coverage counts only verified partners', () => {
    const c = challengeCoverage(['EPC lead', 'Module supply', 'Civil works'], [{ org: 'Volt EPC', roles: ['EPC lead'], verified: true }, { org: 'Unverified Co', roles: ['Civil works'], verified: false }, { org: 'Sunrise', roles: ['Module supply', 'Civil works'], verified: true }]);
    expect(c).toMatchObject({ covered: 3, total: 3, pct: 100 });
    expect(c.rows[2].partners).toEqual(['Sunrise']);
  });
  it('revival suggests packages only for large opportunities', () => {
    expect(revivalSuggestions({ estimatedValue: 3_00_00_000_00, status: 'lost', sector: 'solar' }).map((s) => s.kind)).toEqual(['packages', 'consortium', 'phased', 'supply_only']);
    expect(revivalSuggestions({ estimatedValue: 10_00_000_00, status: 'lost', sector: 'consulting' }).map((s) => s.kind)).toEqual(['consortium', 'phased']);
  });
});
