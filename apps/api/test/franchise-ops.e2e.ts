/**
 * Franchise operations end to end: agreement drafted → reviewed → signed by both → unit moves to "Agreement signed";
 * purchase orders confirmed/dispatched by the brand and received by the franchisee; customer sales; month close →
 * royalty statement → invoice → payment (or dispute); franchisee and franchisor dashboards with flags.
 */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { idemKey } from './flows';

describe('Franchise operations', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const post = (p: string, tok: string, b: object = {}) => api(app).post(`/v1${p}`).set(auth(tok)).set('Idempotency-Key', idemKey('fr')).send(b);
  const ym = (off: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + off); return d.toISOString().slice(0, 7); };
  const today = () => new Date().toISOString().slice(0, 10);

  let mysuru: string, pune: string;
  it('agreement: drafted from the agreed terms, reviewed by a second person, signed by both; the unit follows automatically', async () => {
    mysuru = (await one("select id from franchise_units where city = 'Mysuru'")).id;
    pune = (await one("select id from franchise_units where city = 'Pune'")).id;
    const terms = { termYears: 5, territory: 'Mysuru city and taluk', exclusive: true, startDate: today(), noticeDays: 90 };
    await post(`/admin/franchise/${mysuru}/agreement`, t.meera, terms).expect(403);
    await post(`/admin/franchise/${pune}/agreement`, t.uniteAdmin, terms).expect(409); // live already
    const a = (await post(`/admin/franchise/${mysuru}/agreement`, t.uniteAdmin, terms).expect(201)).body;
    await post(`/admin/franchise/${mysuru}/agreement`, t.uniteAdmin, terms).expect(409); // one at a time
    const c = (await api(app).get(`/v1/contracts/${a.contractId}`).set(auth(t.uniteAdmin)).expect(200)).body;
    const text = (await api(app).get(`/v1/contracts/${a.contractId}/versions/${c.versions[0].id}/text`).set(auth(t.uniteAdmin)).expect(200)).text;
    expect(text).toMatch(/DRAFT TEMPLATE — SUBJECT TO LEGAL REVIEW/);
    expect(text).toMatch(/Royalty\. 4\.00% of the outlet’s monthly gross sales excluding GST/);
    expect(text).toMatch(/EXCLUSIVE/);
    await post(`/contracts/${a.contractId}/submit`, t.uniteAdmin).expect(200);
    const ap = (await post(`/contracts/${a.contractId}/review`, t.evaluator, { decision: 'approve' }).expect(200)).body;
    const hash = ap.versions[ap.versions.length - 1].bodyHash;
    await post(`/contracts/${a.contractId}/sign`, t.meera, { typedName: 'Meera Iyer', consent: true, bodyHash: hash }).expect(200);
    await post(`/contracts/${a.contractId}/sign`, t.uniteAdmin, { typedName: 'Sanjay Kulkarni', consent: true, bodyHash: hash }).expect(200);
    const d = (await api(app).get(`/v1/franchise/${mysuru}/dashboard`).set(auth(t.meera)).expect(200)).body;
    expect(d.unit.status).toBe('agreement_signed');
    expect(d.unit.checklist.find((x: any) => x.key === 'agreement').doneAt).toBeTruthy();
    expect(d.agreement.status).toBe('executed');
    expect(d.unit.agreementEnds).toBe(new Date(new Date(`${today()}T00:00:00Z`).setUTCFullYear(new Date().getUTCFullYear() + 5) - 86400000).toISOString().slice(0, 10));
    await api(app).get(`/v1/franchise/${mysuru}/dashboard`).set(auth(t.asha)).expect(404); // another franchisee
  });

  let po: string;
  it('purchase orders: placed by the franchisee, confirmed and dispatched only by the brand, received only by the franchisee', async () => {
    const line = { item: '3 kW on-grid rooftop kit', qty: 4, unitPrice: 1_45_000_00, gstBps: 1200 };
    po = (await post(`/franchise/${pune}/orders`, t.asha, { kind: 'purchase', orderDate: today(), lines: [line] }).expect(201)).body.id;
    await post(`/franchise/${pune}/orders/${po}/status`, t.asha, { status: 'confirmed' }).expect(403);
    await post(`/franchise/${pune}/orders/${po}/status`, t.uniteAdmin, { status: 'received' }).expect(409);
    await post(`/franchise/${pune}/orders/${po}/status`, t.uniteAdmin, { status: 'confirmed' }).expect(200);
    await post(`/franchise/${pune}/orders/${po}/status`, t.uniteAdmin, { status: 'dispatched', note: 'LR 88213' }).expect(200);
    await post(`/franchise/${pune}/orders/${po}/status`, t.uniteAdmin, { status: 'received' }).expect(403);
    expect((await post(`/franchise/${pune}/orders/${po}/status`, t.asha, { status: 'received' }).expect(200)).body.total).toBe(4 * 1_45_000_00 + Math.round(4 * 1_45_000_00 * 0.12));
  });

  it('sales and month close: only delivered/paid sales count, net of GST; confirmed ones must be settled first; royalty + 18% GST', async () => {
    const m = ym(-3), d = `${m}-12`;
    await post(`/franchise/${pune}/orders`, t.asha, { kind: 'sale', orderDate: d, lines: [{ item: 'Kit', qty: 1, unitPrice: 100, gstBps: 1200 }] }).expect(400); // no customer
    const s1 = (await post(`/franchise/${pune}/orders`, t.asha, { kind: 'sale', customerName: 'Shinde Residence', orderDate: d, lines: [{ item: '3 kW rooftop system', qty: 1, unitPrice: 1_90_000_00, gstBps: 1200 }] }).expect(201)).body;
    const s2 = (await post(`/franchise/${pune}/orders`, t.asha, { kind: 'sale', customerName: 'Patil Hardware', orderDate: d, lines: [{ item: '10 kW commercial system', qty: 1, unitPrice: 5_20_000_00, gstBps: 1200 }, { item: 'AMC year 1', qty: 1, unitPrice: 12_000_00, gstBps: 1800 }] }).expect(201)).body;
    const s3 = (await post(`/franchise/${pune}/orders`, t.asha, { kind: 'sale', customerName: 'Cancelled lead', orderDate: d, lines: [{ item: 'Kit', qty: 1, unitPrice: 50_000_00, gstBps: 1200 }] }).expect(201)).body;
    await post(`/franchise/${pune}/orders/${s1.id}/status`, t.uniteAdmin, { status: 'delivered' }).expect(403); // brand cannot touch sales
    await post(`/franchise/${pune}/close-month`, t.asha, { month: ym(0) }).expect(400);
    const blocked = await post(`/franchise/${pune}/close-month`, t.asha, { month: m }).expect(409);
    expect(blocked.body.message).toMatch(/3 sale order/);
    await post(`/franchise/${pune}/orders/${s1.id}/status`, t.asha, { status: 'delivered' }).expect(200);
    await post(`/franchise/${pune}/orders/${s1.id}/status`, t.asha, { status: 'paid' }).expect(200);
    await post(`/franchise/${pune}/orders/${s2.id}/status`, t.asha, { status: 'delivered' }).expect(200);
    await post(`/franchise/${pune}/orders/${s3.id}/status`, t.asha, { status: 'cancelled' }).expect(200);
    const st = (await post(`/franchise/${pune}/close-month`, t.asha, { month: m }).expect(201)).body;
    const net = 1_90_000_00 + 5_20_000_00 + 12_000_00;
    expect(st).toMatchObject({ netSales: net, orders: 2, royaltyBps: 300, royalty: Math.round(net * 0.03), gst: Math.round(Math.round(net * 0.03) * 0.18), status: 'due', source: 'orders' });
    await post(`/franchise/${pune}/close-month`, t.asha, { month: m }).expect(409);
    await post(`/franchise/${pune}/orders`, t.asha, { kind: 'sale', customerName: 'Late entry', orderDate: d, lines: [{ item: 'Kit', qty: 1, unitPrice: 100, gstBps: 1200 }] }).expect(409); // month closed

    // Royalty: brand invoices and records payment; the franchisee cannot.
    await post(`/admin/franchise/statements/${st.id}/invoice`, t.asha).expect(403);
    const inv = (await post(`/admin/franchise/statements/${st.id}/invoice`, t.uniteAdmin).expect(200)).body;
    expect(inv.invoiceNumber).toMatch(/^RY-\d{6}-\d{5}$/);
    await post(`/admin/franchise/statements/${st.id}/paid`, t.uniteAdmin, { paymentReference: 'UTR-HDFC-77812' }).expect(200);
    await post(`/franchise/statements/${st.id}/dispute`, t.asha, { reason: 'Already paid, cannot dispute' }).expect(409);
  });

  it('manual reports also create statements; the franchisee can dispute an unpaid statement', async () => {
    const r = await post(`/franchise/${pune}/reports`, t.asha, { month: ym(-4), sales: 10_00_000_00, orders: 8 }).expect(201);
    expect(r.body.royalty).toBe(30_000_00);
    const st = await one('select id, total from franchise_royalty_statements where unit_id = $1 and month = $2', [pune, ym(-4)]);
    expect(Number(st.total)).toBe(35_400_00);
    await post(`/franchise/statements/${st.id}/dispute`, t.asha, { reason: 'Two orders were returned in the same month.' }).expect(200);
  });

  it('dashboards: franchisee KPIs and 12-month series; franchisor network totals, statements to act on and purchase orders', async () => {
    const d = (await api(app).get(`/v1/franchise/${pune}/dashboard`).set(auth(t.asha)).expect(200)).body;
    expect(d.side).toBe('franchisee');
    expect(d.series).toHaveLength(12);
    expect(d.series.find((s: any) => s.month === ym(-1)).sales).toBe(27_85_000_00); // from the earlier monthly report
    const out = await one("select coalesce(sum(total),0)::bigint t from franchise_royalty_statements where unit_id = $1 and status in ('due','invoiced','disputed')", [pune]);
    expect(d.kpis.royaltyOutstanding).toBe(Number(out.t)); // disputed + invoiced (sample) statements
    expect(d.orders.length).toBe(Number((await one('select count(*)::int n from franchise_orders where unit_id = $1', [pune])).n));
    const n = (await api(app).get('/v1/admin/franchise/dashboard').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(n.totals.live).toBeGreaterThanOrEqual(1);
    expect(n.totals.disputes).toBe(1);
    expect(n.statementsToAct.some((s: any) => s.status === 'disputed')).toBe(true);
    expect(n.units.find((u: any) => u.city === 'Mysuru').status).toBe('agreement_signed');
    await api(app).get('/v1/admin/franchise/dashboard').set(auth(t.asha)).expect(403);
  });
});
