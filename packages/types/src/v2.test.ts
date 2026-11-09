import { describe, it, expect } from 'vitest';
import { extractTenderCriteria, compareEligibility, packageBudgetCheck, rolledUpProgress, packageEligibility, responsibilityMatrix } from './index';

const TENDER = [
  'NOTICE INVITING TENDER\nName of work: 2 MW ground-mounted solar plant at Kurnool\nLast date of submission: 15/12/2026 by 3 PM',
  'ELIGIBILITY CRITERIA\nAverage annual turnover of the last three years shall not be less than Rs. 5 crore.\nThe bidder shall have minimum 5 years of experience in solar EPC.\nSimilar work: completed at least one solar project of value not less than Rs 2.5 crore.\nThe bidder shall be ISO 9001 and ISO 45001 certified. MNRE empanelment preferred.\nCopy of GST registration and EPF registration certificate to be enclosed.',
  'The bidder must own or lease a hydra crane and testing equipment (megger, earth tester).\nMinimum 4 qualified engineers and 20 technicians on payroll.\nEMD of Rs. 2,50,000 shall be paid online.\nConsortium of not more than two members is allowed; the lead member must meet 60% of the turnover.',
];

describe('tender eligibility analyzer', () => {
  const c = extractTenderCriteria(TENDER);
  const find = (k: string, l?: RegExp) => c.find((x) => x.kind === k && (!l || l.test(x.label)));
  it('finds each condition with its page and line', () => {
    expect(find('turnover')).toMatchObject({ value: 5 * 1e7 * 100, page: 2, line: 2 });
    expect(find('experience')).toMatchObject({ value: 5, page: 2 });
    expect(find('similar_work')).toMatchObject({ value: 2.5 * 1e7 * 100 });
    expect(find('certification', /ISO9001/)).toBeTruthy();
    expect(find('certification', /ISO45001/)).toBeTruthy();
    expect(find('certification', /MNRE/)).toBeTruthy();
    expect(find('registration', /GST/)).toBeTruthy();
    expect(find('registration', /EPF/)).toBeTruthy();
    expect(find('equipment', /crane/)).toMatchObject({ page: 3, line: 1 });
    expect(find('manpower', /engineers/)).toMatchObject({ value: 4 });
    expect(find('manpower', /technicians/)).toMatchObject({ value: 20 });
    expect(find('emd')).toMatchObject({ value: 2_50_000_00 });
    expect(find('deadline')).toMatchObject({ value: Date.UTC(2026, 11, 15), page: 1 });
    expect(find('consortium')).toBeTruthy();
  });
  it('compares with a profile, never says confirmed, flags a deadline within 7 days', () => {
    const r = compareEligibility(c, { annualTurnover: 3 * 1e7 * 100, yearsExperience: 8, certifications: ['ISO9001'], hasGstin: true, employees: 30, documents: [] }, Date.UTC(2026, 11, 10));
    const row = (k: string, l?: RegExp) => r.rows.find((x) => x.kind === k && (!l || l.test(x.label)))!;
    expect(row('turnover').status).toBe('not_met');
    expect(row('experience').status).toBe('met');
    expect(row('certification', /ISO9001/).status).toBe('met');
    expect(row('certification', /ISO45001/).status).toBe('not_met');
    expect(row('registration', /GST/).status).toBe('met');
    expect(row('registration', /EPF/).status).toBe('needs_evidence');
    expect(r.risk).toBe('high');
    expect(r.deadlineSoon).toBe(true);
    expect(r.disclaimer).toMatch(/Not confirmed until an authorised reviewer/);
    expect(JSON.stringify(r)).not.toMatch(/"eligible"/);
  });
  it('an empty document says so instead of guessing', () => {
    expect(compareEligibility(extractTenderCriteria(['Thank you']), { annualTurnover: null, yearsExperience: null, certifications: [], hasGstin: false, employees: null, documents: [] }).summary).toMatch(/No eligibility conditions were found/);
  });
});

describe('work packages', () => {
  it('packages split the project value and never exceed it', () => {
    expect(packageBudgetCheck(100, [40, 30], 30).ok).toBe(true);
    expect(packageBudgetCheck(100, [40, 30], 31)).toMatchObject({ ok: false, remaining: 30 });
  });
  it('parent progress is weighted by budget; drafts and cancelled packages are ignored', () => {
    expect(rolledUpProgress([{ budget: 300, progress: 50, status: 'in_progress' }, { budget: 100, progress: 0, status: 'completed' }, { budget: 500, progress: 90, status: 'cancelled' }, { budget: 50, progress: 0, status: 'draft' }])).toBe(63);
  });
  it('eligibility explains every reason', () => {
    const r = packageEligibility({ sectors: ['solar'], regions: ['IN-AP'], certifications: ['ISO9001'], minTurnover: 100 }, { sectors: ['construction'], regions: ['IN-MH'], certifications: [], annualTurnover: 50, verified: false });
    expect(r.reasons).toHaveLength(5);
    expect(packageEligibility({ sectors: ['solar'] }, { sectors: ['solar'], regions: [], certifications: [], annualTurnover: null, verified: true }).eligible).toBe(true);
  });
});

describe('responsibility matrix', () => {
  it('lead is accountable for every activity; specialists are responsible for their part', () => {
    const m = responsibilityMatrix([{ key: 'lead', role: 'Lead', kind: 'lead' }, { key: 'r2', role: 'Local partner', kind: 'local' }, { key: 'r3', role: 'Certified partner', kind: 'certified' }]);
    expect(m.every((row) => row.cells.lead.startsWith('A'))).toBe(true);
    expect(m.find((r) => r.activity === 'Site execution')!.cells.r2).toBe('R');
    expect(m.find((r) => r.activity === 'Quality & certification')!.cells.r3).toBe('R');
    expect(m.find((r) => r.activity === 'Procurement')!.cells.lead).toBe('A/R'); // no procurement partner → lead does it
  });
});
