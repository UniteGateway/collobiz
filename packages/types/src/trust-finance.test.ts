import { describe, expect, it } from 'vitest';
import { CreditNoteSchema, creditRoom, financialYear, pct, profitReport, proofLevel } from './trust-finance';

describe('proof level', () => {
  it('climbs only with confirmed records and on-time delivery', () => {
    expect(proofLevel(0, null)).toBe('New');
    expect(proofLevel(6, 67)).toBe('Emerging');
    expect(proofLevel(12, 67)).toBe('Emerging');
    expect(proofLevel(12, 85)).toBe('Established');
    expect(proofLevel(40, 95, 1)).toBe('Established');
    expect(proofLevel(40, 95)).toBe('Proven');
    expect(pct(2, 3)).toBe(67); expect(pct(0, 0)).toBeNull();
  });
});
describe('profit report', () => {
  it('keeps pipeline, revenue and cash separate', () => {
    const r = profitReport({ pipeline: 88e5, contractValue: 0, invoicesIssued: 5.4e7, creditNotesIssued: 0, microEarned: 0, royaltyIncome: 0, receiptsIn: 2e7, refundsPaid: 0,
      supplierInvoices: 0, creditNotesReceived: 0, microPaid: 0, commissionExpense: 0, expenses: 1.48e5, royaltyPaid: 0, commissionLiability: 0 });
    expect(r).toMatchObject({ invoicedRevenue: 5.4e7, collectedCash: 2e7, grossProfit: 5.4e7, operatingExpenses: 1.48e5, netProfit: 5.4e7 - 1.48e5 });
  });
  it('credit notes and refunds reduce revenue and cash', () => {
    const r = profitReport({ pipeline: 0, contractValue: 0, invoicesIssued: 1000, creditNotesIssued: 200, microEarned: 300, royaltyIncome: 50, receiptsIn: 900, refundsPaid: 100,
      supplierInvoices: 400, creditNotesReceived: 40, microPaid: 60, commissionExpense: 30, expenses: 20, royaltyPaid: 10, commissionLiability: 5 });
    expect(r).toMatchObject({ invoicedRevenue: 1100, collectedCash: 800, directCosts: 420, grossProfit: 730, operatingExpenses: 30, netProfit: 670 });
  });
  it('credit room and validation; Indian financial year', () => {
    expect(creditRoom(1000, 700)).toBe(300); expect(creditRoom(1000, 1200)).toBe(0);
    expect(CreditNoteSchema.safeParse({ invoiceId: '6f1c0f0e-8b8e-4b8e-9a63-3f1d2f0e8b8e', reason: 'discount', amount: 0, note: 'Volume discount' }).success).toBe(false);
    expect(financialYear(new Date('2026-11-18T00:00:00Z'))).toEqual({ from: '2026-04-01', to: '2027-03-31' });
    expect(financialYear(new Date('2027-02-01T00:00:00Z'))).toEqual({ from: '2026-04-01', to: '2027-03-31' });
  });
});
