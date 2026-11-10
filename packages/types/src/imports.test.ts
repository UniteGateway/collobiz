import { describe, expect, it } from 'vitest';
import { extractUtr, parseAmount, parseBankStatement, parseCsv, parseDate, suggestMatches } from './imports';

describe('CSV and values', () => {
  it('parses quotes, doubled quotes, CRLF, BOM and semicolons', () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('reads Indian amounts and dates, day first', () => {
    expect(parseAmount('₹1,20,00,000.50')).toBe(1_20_00_000_50);
    expect(parseAmount('(500.00)')).toBe(-50000);
    expect(parseAmount('2,000.00 Dr')).toBe(-200000);
    expect(parseAmount('abc')).toBeNull();
    expect(parseDate('05/11/2026')).toBe('2026-11-05');
    expect(parseDate('05-Nov-26')).toBe('2026-11-05');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('2026-11-05')).toBe('2026-11-05');
  });
  it('extracts UTRs from NEFT, RTGS, IMPS and UPI narrations', () => {
    expect(extractUtr('NEFT-HDFCN52026110512345-UNITE SOLAR')).toBe('HDFCN52026110512345');
    expect(extractUtr('UPI/612345678901/Payment/unite@hdfc')).toBe('612345678901');
    expect(extractUtr('RTGS/UTIBR52026110500012345/UNITE SOLAR PVT')).toBe('UTIBR52026110500012345');
    expect(extractUtr('CASH DEPOSIT BRANCH')).toBeNull();
  });
});

describe('bank statements', () => {
  it('finds the table under account details (debit/credit columns)', () => {
    const csv = `Account No,XXXX1234\nStatement From,01/10/2026\n\nDate,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n05/11/2026,NEFT-HDFCN52026110512345-UNITE SOLAR INV-2026-900002,HDFCN52026110512345,05/11/2026,,"80,00,000.00","1,00,00,000.00"\n06/11/2026,ATM WDL,,06/11/2026,"5,000.00",,"99,95,000.00"\n,Closing balance,,,,,`;
    const s = parseBankStatement(parseCsv(csv));
    expect(s.layout).toBe('debit_credit_columns');
    expect(s.lines).toHaveLength(2);
    expect(s.lines[0]).toMatchObject({ txnDate: '2026-11-05', direction: 'credit', amount: 80_00_000_00, utr: 'HDFCN52026110512345' });
    expect(s.lines[1]).toMatchObject({ direction: 'debit', amount: 5_000_00 });
    expect(s.skipped).toHaveLength(1);
    expect([s.from, s.to]).toEqual(['2026-11-05', '2026-11-06']);
  });
  it('reads amount + Dr/Cr and signed-amount layouts', () => {
    const a = parseBankStatement(parseCsv('Txn Date,Description,Amount,Dr/Cr\n05-Nov-2026,UPI/612345678901/VOLT,"1,500.00",CR\n06-Nov-2026,CHARGES,"20.00",DR'));
    expect(a.layout).toBe('amount_with_dr_cr');
    expect(a.lines.map((l) => [l.direction, l.amount])).toEqual([['credit', 150000], ['debit', 2000]]);
    const b = parseBankStatement(parseCsv('Transaction Date,Particulars,Amount\n2026-11-05,IMPS 612345678901 DECCAN,2500\n2026-11-06,FEE,-10'));
    expect(b.layout).toBe('signed_amount');
    expect(b.lines.map((l) => l.direction)).toEqual(['credit', 'debit']);
  });
  it('rejects files without a recognisable table', () => {
    expect(() => parseBankStatement(parseCsv('foo,bar\n1,2'))).toThrow(/statement table/);
  });
});

describe('matching', () => {
  const invs = [
    { id: 'a', number: 'INV-2026-900002', amount: 2_00_00_000_00, outstanding: 80_00_000_00, issuedAt: '2026-09-21', counterparty: 'Unite Solar' },
    { id: 'b', number: 'INV-2026-900003', amount: 1_40_00_000_00, outstanding: 1_40_00_000_00, issuedAt: '2026-11-05', counterparty: 'Unite Solar' },
    { id: 'c', number: 'INV-2026-900004', amount: 80_00_000_00, outstanding: 80_00_000_00, issuedAt: '2026-10-01', counterparty: 'Deccan Distributors' },
  ];
  const line = (description: string, amount: number, txnDate = '2026-11-06') => ({ txnDate, description, reference: null, amount, utr: extractUtr(description) });
  it('an invoice number in the narration is an exact match', () => {
    expect(suggestMatches(line('NEFT-HDFCN52026110512345-UNITE INV-2026-900002', 80_00_000_00), invs).best).toMatchObject({ invoiceId: 'a', kind: 'exact_reference', score: 100 });
  });
  it('the payer name breaks a tie on amount; without it the line is ambiguous', () => {
    expect(suggestMatches(line('NEFT-HDFCN52026110512345-DECCAN DISTRIBUTORS', 80_00_000_00), invs).best).toMatchObject({ invoiceId: 'c', score: 85 });
    const r = suggestMatches(line('NEFT-HDFCN52026110512345-XYZ', 80_00_000_00), invs);
    expect(r.ambiguous).toBe(true);
    expect(r.best).toBeNull();
  });
  it('part payments need the payer named; over-payments and payments before the invoice never match', () => {
    expect(suggestMatches(line('RTGS UNITE SOLAR PVT', 50_00_000_00), invs).candidates.map((c) => c.invoiceId)).toEqual(expect.arrayContaining(['a', 'b']));
    expect(suggestMatches(line('RTGS SOMEONE', 50_00_000_00), invs).candidates).toHaveLength(0);
    expect(suggestMatches(line('INV-2026-900002', 90_00_000_00), invs).candidates).toHaveLength(0);
    expect(suggestMatches(line('INV-2026-900003', 1_40_00_000_00, '2026-11-01'), invs).candidates).toHaveLength(0);
  });
});
