import { describe, expect, it } from 'vitest';
import { usageAgainst, yearlySavingPct } from './plans';

describe('plans', () => {
  it('marks usage ok, near, over or unlimited', () => {
    const r = usageAgainst({ leadsPerMonth: 10, teamMembers: 5, gstDocsPerMonth: null, importsPerMonth: 0 }, { leadsPerMonth: 8, teamMembers: 6, gstDocsPerMonth: 40 });
    expect(r.map((x) => [x.key, x.state, x.pct])).toEqual([['leadsPerMonth', 'near', 80], ['teamMembers', 'over', 120], ['gstDocsPerMonth', 'unlimited', null], ['importsPerMonth', 'over', 100]]);
  });
  it('yearly saving only when cheaper', () => {
    expect(yearlySavingPct(1000_00, 10000_00)).toBe(17);
    expect(yearlySavingPct(1000_00, 12000_00)).toBeNull();
    expect(yearlySavingPct(null, 10000_00)).toBeNull();
  });
});
