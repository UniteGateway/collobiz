import { describe, it, expect } from 'vitest';
import { paymentState, overdueDays, contributionLedger, evidenceDigest } from './index';

describe('payment assurance', () => {
  it('maps milestones and invoices to the eight display states', () => {
    expect(paymentState({ status: 'planned', contracted: false }, null)).toBe('projected');
    expect(paymentState({ status: 'planned', contracted: true }, null)).toBe('contracted');
    expect(paymentState({ status: 'submitted', contracted: true }, null)).toBe('earned');
    expect(paymentState({ status: 'certified', contracted: true }, null)).toBe('approved');
    expect(paymentState({ status: 'invoiced', contracted: true }, { amount: 100, received: 0, status: 'issued' })).toBe('invoiced');
    expect(paymentState({ status: 'invoiced', contracted: true }, { amount: 100, received: 40, status: 'issued' })).toBe('partially_paid');
    expect(paymentState({ status: 'paid', contracted: true }, { amount: 100, received: 100, status: 'paid' })).toBe('paid');
    expect(paymentState({ status: 'invoiced', contracted: true }, { amount: 100, received: 0, status: 'issued' }, true)).toBe('disputed');
  });
  it('overdue only when money is outstanding after the due date', () => {
    const today = new Date('2026-11-10T00:00:00Z');
    expect(overdueDays('2026-11-01', 100, today)).toBe(9);
    expect(overdueDays('2026-11-01', 0, today)).toBe(0);
    expect(overdueDays('2026-11-20', 100, today)).toBe(0);
  });
});

describe('contribution ledger', () => {
  it('flags under-delivery and gaps against agreed shares, without deciding anything', () => {
    const r = contributionLedger([{ orgId: 'A', pledgedValue: 100, deliveredValue: 100 }, { orgId: 'B', pledgedValue: 100, deliveredValue: 50 }, { orgId: 'B', pledgedValue: 0, deliveredValue: 0 }], { A: 50, B: 50 });
    const a = r.find((x) => x.orgId === 'A')!; const b = r.find((x) => x.orgId === 'B')!;
    expect(a).toMatchObject({ delivered: 100, deliveredPct: 66.7, flags: ['Contribution 66.7% vs agreed share 50%'] });
    expect(b.flags).toContain('Delivered less than pledged');
  });
});

describe('evidence digest', () => {
  it('orders events and summarises parties and span', () => {
    const d = evidenceDigest([{ at: '2026-11-05', who: 'B', what: 'reply' }, { at: '2026-11-01', who: 'A', what: 'raised' }]);
    expect(d).toMatchObject({ count: 2, parties: ['A', 'B'], spanDays: 4 });
    expect(d.first?.what).toBe('raised');
    expect(d.note).toMatch(/not a finding/);
  });
});
