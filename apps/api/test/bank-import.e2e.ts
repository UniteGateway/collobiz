import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

/** Volt EPC's own bank statement: credits for the demo invoices INV-2026-900002 (₹80 lakh outstanding) and -900003 (₹1.4 crore). */
const STATEMENT = [
  'Account Number,50100012345678',
  'Statement Period,01/10/2026 to 10/11/2026',
  '',
  'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
  '05/11/2026,NEFT-HDFCN52026110512345-UNITE SOLAR-INV-2026-900002,HDFCN52026110512345,05/11/2026,,"80,00,000.00","95,00,000.00"',
  '06/11/2026,RTGS/UTIBR52026110600054321/UNITE SOLAR PVT,UTIBR52026110600054321,06/11/2026,,"1,40,00,000.00","2,35,00,000.00"',
  '07/11/2026,UPI/612345678901/REFUND/someone@okaxis,612345678901,07/11/2026,,"5,000.00","2,35,05,000.00"',
  '08/11/2026,NEFT-SBIN0001-SALARY NOV,,08/11/2026,"12,00,000.00",,"2,23,05,000.00"',
  ',Closing balance,,,,,"2,23,05,000.00"',
].join('\n');
const csv = (text: string, name = 'volt-hdfc-nov.csv') => ({ buf: Buffer.from(text), name });

describe('Bank statement import — parse, suggest, confirm; payee reports wait for the payer', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const upload = (who: string, f: { buf: Buffer; name: string }, orgId?: string) => {
    const r = api(app).post('/v1/finance/bank-statements').set(auth(who));
    if (orgId) r.field('orgId', orgId);
    return r.attach('file', f.buf, { filename: f.name, contentType: 'text/csv' });
  };

  let stmtId: string; let lines: any[];
  it('only owners/admins import their own statement; the same file twice is refused', async () => {
    await upload(t.rohit, csv(STATEMENT)).expect(403);
    const r = (await upload(t.asha, csv(STATEMENT)).expect(201)).body;
    expect(r).toMatchObject({ lines: 4, skipped: 1, suggested: 2, alreadyRecorded: 0, layout: 'debit_credit_columns', period: ['2026-11-05', '2026-11-08'] });
    stmtId = r.id;
    await upload(t.asha, csv(STATEMENT)).expect(409);
    await upload(t.asha, csv('hello,world\n1,2', 'junk.csv')).expect(400);
    await upload(t.asha, { buf: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), name: 'old.xls' }).expect(400);
    await api(app).get(`/v1/finance/bank-statements/${stmtId}`).set(auth(t.vikram)).expect(404);
  });

  it('suggestions explain themselves; unrelated lines stay unmatched', async () => {
    const s = (await api(app).get(`/v1/finance/bank-statements/${stmtId}`).set(auth(t.asha)).expect(200)).body;
    lines = s.lines;
    expect(s.payeeReports).toBe(true);
    expect(lines[0]).toMatchObject({ status: 'suggested', utr: 'HDFCN52026110512345', suggested: { number: 'INV-2026-900002' } });
    expect(lines[0].matchReason).toMatch(/names INV-2026-900002/);
    expect(lines[1]).toMatchObject({ status: 'suggested', suggested: { number: 'INV-2026-900003' }, matchScore: 85 });
    expect(lines[2]).toMatchObject({ status: 'unmatched', direction: 'credit', amount: 5_000_00 });
    expect(lines[3]).toMatchObject({ status: 'unmatched', direction: 'debit', options: [] }); // Volt has nothing to pay
    expect((await api(app).get('/v1/finance/bank-statements').set(auth(t.asha)).expect(200)).body[0]).toMatchObject({ company: 'Volt EPC', suggested: 2, unmatched: 2 });
  });

  it("the payee's match is reported, not received, until the payer confirms — then the invoice is paid", async () => {
    const inv2 = await one("select id, project_id from project_invoices where number = 'INV-2026-900002'");
    await api(app).post(`/v1/finance/bank-statement-lines/${lines[3].id}/match`).set(auth(t.asha)).send({ invoiceId: inv2.id }).expect(400); // money paid out cannot settle an invoice Volt issued
    const m = (await api(app).post(`/v1/finance/bank-statement-lines/${lines[0].id}/match`).set(auth(t.asha)).send({ invoiceId: inv2.id }).expect(200)).body;
    expect(m).toMatchObject({ status: 'matched', invoice: 'INV-2026-900002', pending: true, paid: false });
    await api(app).post(`/v1/finance/bank-statement-lines/${lines[0].id}/match`).set(auth(t.asha)).send({ invoiceId: inv2.id }).expect(409);
    let pay = (await api(app).get(`/v1/projects/${inv2.project_id}/payments`).set(auth(t.asha)).expect(200)).body;
    const row = pay.milestones.find((x: any) => x.invoice?.number === 'INV-2026-900002');
    expect(row.state).toBe('partially_paid');
    expect(row.invoice.outstanding).toBe(80_00_000_00); // still outstanding until confirmed
    expect(row.invoice.reported[0]).toMatchObject({ amount: 80_00_000_00, reference: 'HDFCN52026110512345' });
    expect(pay.canConfirm).toBe(false);
    await api(app).post(`/v1/payment-receipts/${row.invoice.reported[0].id}/confirm`).set(auth(t.asha)).expect(403); // the payee cannot confirm its own report
    expect((await api(app).get('/v1/finance/reconciliation').set(auth(t.finance)).expect(200)).body.totals.awaitingConfirmation).toBe(80_00_000_00);
    const c = (await api(app).post(`/v1/payment-receipts/${row.invoice.reported[0].id}/confirm`).set(auth(t.uniteAdmin)).expect(200)).body;
    expect(c).toMatchObject({ paid: true, outstanding: 0 });
    await api(app).post(`/v1/payment-receipts/${row.invoice.reported[0].id}/confirm`).set(auth(t.uniteAdmin)).expect(409);
    pay = (await api(app).get(`/v1/projects/${inv2.project_id}/payments`).set(auth(t.asha)).expect(200)).body;
    expect(pay.milestones.find((x: any) => x.invoice?.number === 'INV-2026-900002').state).toBe('paid');
  });

  it('Unite finance confirms directly; a re-imported statement recognises recorded payments', async () => {
    const inv3 = await one("select id from project_invoices where number = 'INV-2026-900003'");
    const m = (await api(app).post(`/v1/finance/bank-statement-lines/${lines[1].id}/match`).set(auth(t.finance)).send({ invoiceId: inv3.id }).expect(200)).body;
    expect(m).toMatchObject({ pending: false, paid: true });
    expect((await one("select status from project_invoices where number = 'INV-2026-900003'")).status).toBe('paid');
    await api(app).post(`/v1/finance/bank-statement-lines/${lines[2].id}/ignore`).set(auth(t.asha)).expect(200);
    await api(app).post(`/v1/finance/bank-statement-lines/${lines[1].id}/ignore`).set(auth(t.asha)).expect(409);
    const audit = await one("select count(*)::int n from audit_events where action in ('finance.statement_imported', 'project.receipt_reported')");
    expect(audit.n).toBe(2);
  });

  it('reads Excel (.xlsx) statements with an amount and Dr/Cr column', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Statement');
    ws.addRow(['Txn Date', 'Description', 'Amount', 'Dr/Cr']);
    ws.addRow([new Date(Date.UTC(2026, 10, 9)), 'IMPS 612345678999 SUNRISE TRADERS', 1500, 'CR']);
    ws.addRow([new Date(Date.UTC(2026, 10, 9)), 'BANK CHARGES', 20, 'DR']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const r = (await api(app).post('/v1/finance/bank-statements').set(auth(t.asha)).attach('file', buf, { filename: 'icici.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }).expect(201)).body;
    expect(r).toMatchObject({ lines: 2, layout: 'amount_with_dr_cr', period: ['2026-11-09', '2026-11-09'] });
  });
});
