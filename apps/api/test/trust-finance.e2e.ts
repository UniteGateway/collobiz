/**
 * Proof passport + Business QR, Invoices & P&L with credit notes and expenses, Unite programmes and the setup checklist.
 */
import type { INestApplication } from '@nestjs/common';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('Proof, books and programmes', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); });
  afterAll(async () => { await app?.close(); });
  const post = (p: string, tok: string, b: object = {}) => api(app).post(`/v1${p}`).set(auth(tok)).send(b);
  const get = (p: string, tok?: string) => (tok ? api(app).get(`/v1${p}`).set(auth(tok)) : api(app).get(`/v1${p}`));

  it('Proof counts only confirmed records; the public link exists only when shared', async () => {
    const p = (await get('/proof', t.asha).expect(200)).body;
    expect(p).toMatchObject({ name: 'Volt EPC', verified: true, level: 'Emerging', share: null });
    const lines = Object.fromEntries(p.sections.flatMap((s: any) => s.lines).map((l: any) => [l.key, l]));
    expect(lines.projects).toMatchObject({ count: 1, evidence: ['PRJ-2025-000014'] });
    expect(lines.milestones.count).toBe(3);
    expect(p.records).toBeGreaterThanOrEqual(4);
    expect(p.measures[0].label).toBe('On-time delivery');
    const s = (await post('/proof/share', t.asha, { enabled: true }).expect(200)).body;
    const pub = (await get(`/proof/public/${s.token}`).expect(200)).body;
    expect(pub).toMatchObject({ name: 'Volt EPC', level: 'Emerging' });
    expect(JSON.stringify(pub)).not.toMatch(/PRJ-2025|₹/); // no evidence codes or amounts in public
    await post('/proof/share', t.asha, { enabled: false }).expect(200);
    await get(`/proof/public/${s.token}`).expect(404);
    await get('/proof/public/not-a-token').expect(404);
  });

  it('Profit report keeps measures apart; credit notes cap at what is left and refunds count only when paid', async () => {
    const r = (await get('/books/pnl?from=2025-01-01&to=2027-03-31', t.asha).expect(200)).body;
    const m = Object.fromEntries(r.measures.map((x: any) => [x.key, x.value]));
    expect(m.invoicedRevenue).toBe(5.4e9); // three invoices issued by Volt (paise)
    expect(m.collectedCash).toBeLessThanOrEqual(m.invoicedRevenue);
    expect(m.pipeline).toBeGreaterThan(0);
    await get('/books/pnl?from=2027-01-01&to=2026-01-01', t.asha).expect(400);
    const inv = (await get('/books/invoices', t.asha).expect(200)).body;
    const paid = inv.find((i: any) => i.status === 'paid'); const open = inv.find((i: any) => i.status === 'issued');
    await post('/books/credit-notes', t.ravi, { invoiceId: open.id, reason: 'discount', amount: 100, note: 'Not my invoice' }).expect(404);
    await post('/books/credit-notes', t.asha, { invoiceId: open.id, reason: 'discount', amount: open.amount + 1, note: 'Too much credit' }).expect(409);
    const cn = (await post('/books/credit-notes', t.asha, { invoiceId: open.id, reason: 'rate_difference', amount: 50_000_00, note: 'Agreed rate revision on cabling' }).expect(201)).body;
    expect(cn).toMatchObject({ refundDue: false }); expect(cn.number).toMatch(/^CN-/);
    await post(`/books/credit-notes/${cn.id}/refund`, t.asha, { reference: 'UTR0001', paidOn: '2026-11-18' }).expect(400);
    const cn2 = (await post('/books/credit-notes', t.asha, { invoiceId: paid.id, reason: 'deficiency', amount: 10_000_00, note: 'Two inverters replaced late' }).expect(201)).body;
    expect(cn2.refundDue).toBe(true);
    await post(`/books/credit-notes/${cn2.id}/refund`, t.asha, { reference: 'UTR0002', paidOn: '2026-11-18' }).expect(200);
    await post('/books/expenses', t.asha, { date: '2026-11-10', category: 'rent', amount: 1_48_000_00, description: 'Office rent, November' }).expect(201);
    const r2 = (await get('/books/pnl?from=2025-01-01&to=2027-03-31', t.asha).expect(200)).body;
    const m2 = Object.fromEntries(r2.measures.map((x: any) => [x.key, x.value]));
    expect(m2.invoicedRevenue).toBe(m.invoicedRevenue - 60_000_00);
    expect(m2.collectedCash).toBe(m.collectedCash - 10_000_00);
    expect(m2.operatingExpenses).toBe(m.operatingExpenses + 1_48_000_00);
    expect(m2.netProfit).toBe(m2.grossProfit - m2.commissionExpense - m2.operatingExpenses);
    const recv = (await get('/books/credit-notes?dir=received', t.asha).expect(200)).body;
    expect(recv).toEqual([]);
    expect((await get('/books/credit-notes?dir=issued', t.asha).expect(200)).body).toHaveLength(2);
  });

  it('Programmes: notify me, staff opening notifies watchers; setup checklist reads real records', async () => {
    const list = (await get('/programmes', t.ravi).expect(200)).body;
    expect(list.length).toBe(8); expect(list.every((p: any) => p.open === false)).toBe(true);
    await post('/programmes/prizo/notify-me', t.ravi, { on: true }).expect(200);
    expect((await get('/programmes', t.ravi).expect(200)).body.find((p: any) => p.code === 'prizo').watching).toBe(true);
    await post('/admin/programmes/prizo/open', t.ravi, { approvalNote: 'Approved by PRIZO board, ref P-1' }).expect(403);
    expect((await post('/admin/programmes/prizo/open', t.superadmin, { approvalNote: 'Approved by PRIZO board, ref P-1' }).expect(200)).body.notified).toBeGreaterThanOrEqual(1);
    await post('/admin/programmes/prizo/open', t.superadmin, { approvalNote: 'Approved by PRIZO board, ref P-1' }).expect(400);
    const n = (await get('/notifications', t.ravi).expect(200)).body;
    expect(JSON.stringify(n)).toMatch(/PRIZO store collaboration is open/);
    const c = (await get('/me/setup-checklist', t.asha).expect(200)).body;
    expect(c.steps.find((s: any) => s.key === 'verify').done).toBe(true);
    expect(c.steps.find((s: any) => s.key === 'qr').done).toBe(false); // sharing was turned off above
    await post('/proof/share', t.asha, { enabled: true }).expect(200);
    expect((await get('/me/setup-checklist', t.asha).expect(200)).body.done).toBe(c.done + 1);
  });
});
