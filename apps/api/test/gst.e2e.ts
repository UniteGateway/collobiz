import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('GST — tax profile, GSTIN checks, e-invoice and e-way bill JSON; filing not connected', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('checks GSTINs locally and says the live lookup is not connected', async () => {
    expect((await api(app).get('/v1/tax/gstin/27aapfu0939f1zv').set(auth(t.asha)).expect(200)).body).toMatchObject({ gstin: '27AAPFU0939F1ZV', valid: true, state: 'Maharashtra', pan: 'AAPFU0939F', panValid: true, live: { connected: false } });
    expect((await api(app).get('/v1/tax/gstin/27AAPFU0939F1ZX').set(auth(t.asha)).expect(200)).body).toMatchObject({ valid: false, state: null });
    const ints = (await api(app).get('/v1/integrations').set(auth(t.asha)).expect(200)).body;
    expect(ints.map((i: any) => i.key)).toEqual(expect.arrayContaining(['gst_filing', 'gstin_lookup', 'esign', 'whatsapp', 'treds', 'tender_feed']));
    expect(ints.every((i: any) => i.connected === false)).toBe(true);
  });

  it('only a valid GSTIN saves a tax profile; the state comes from the GSTIN', async () => {
    const p = { gstin: '27AAPFU0939F1ZX', legalName: 'Volt EPC Private Limited', address1: 'Plot 22, Hinjewadi Phase 2', city: 'Pune', pincode: '411057' };
    await api(app).put('/v1/tax/profile').set(auth(t.asha)).send(p).expect(400);
    await api(app).put('/v1/tax/profile').set(auth(t.rohit)).send({ ...p, gstin: '27AABCV1234F1ZO' }).expect(403);
    expect((await api(app).put('/v1/tax/profile').set(auth(t.asha)).send({ ...p, gstin: '27AABCV1234F1ZO', einvoiceApplicable: true }).expect(200)).body).toMatchObject({ stateCode: '27', state: 'Maharashtra' });
  });

  it('prepares an inter-state services e-invoice from a project invoice; amounts must match the invoice', async () => {
    const inv = await one("select id, amount from project_invoices where number = 'INV-2026-900003'");
    const src = (await api(app).get('/v1/gst/sources').set(auth(t.asha)).expect(200)).body;
    expect(src).toMatchObject({ profileReady: true, filing: { connected: false } });
    expect(src.items.find((i: any) => i.id === inv.id)).toMatchObject({ source: 'project_invoice', buyer: 'Unite Solar', buyerProfile: true, kind: 'services' });
    const line = { description: 'Commissioning & net-metering — milestone 3', hsn: '995461', isService: true, qty: 1, unit: 'OTH', unitPrice: Number(inv.amount), gstRate: 18 };
    await api(app).post('/v1/gst/prepare').set(auth(t.asha)).send({ kind: 'einvoice', source: 'project_invoice', sourceId: inv.id, lines: [{ ...line, unitPrice: 100 }] }).expect(400);
    const r = (await api(app).post('/v1/gst/prepare').set(auth(t.asha)).send({ kind: 'einvoice', source: 'project_invoice', sourceId: inv.id, lines: [line] }).expect(201)).body;
    expect(r).toMatchObject({ ready: true, issues: [], totals: { interState: true, placeOfSupply: '36', igst: Math.round(Number(inv.amount) * 0.18), cgst: 0 } });
    const json = (await api(app).get(`/v1/gst/documents/${r.id}/json`).set(auth(t.asha)).expect(200)).body;
    expect(json).toMatchObject({ Version: '1.1', SellerDtls: { Gstin: '27AABCV1234F1ZO', Stcd: '27' }, BuyerDtls: { Gstin: '36AAACU7777S1Z8', Pos: '36' }, DocDtls: { No: 'INV-2026-900003' } });
    expect(json.ItemList[0]).toMatchObject({ IsServc: 'Y', HsnCd: '995461', GstRt: 18 });
    const f = await api(app).post(`/v1/gst/documents/${r.id}/file`).set(auth(t.asha)).expect(503);
    expect(f.body.message).toMatch(/not connected yet.*Download the JSON/);
    expect((await one('select irn from gst_documents where id = $1', [r.id])).irn).toBeNull();
    await api(app).post('/v1/gst/prepare').set(auth(t.ravi)).send({ kind: 'einvoice', source: 'project_invoice', sourceId: inv.id, lines: [line] }).expect(404); // not Sunrise's invoice
  });

  it('a wrong SAC for a service is reported, and the JSON cannot be downloaded until fixed', async () => {
    const inv = await one("select id, amount from project_invoices where number = 'INV-2026-900003'");
    const r = (await api(app).post('/v1/gst/prepare').set(auth(t.asha)).send({ kind: 'einvoice', source: 'project_invoice', sourceId: inv.id, lines: [{ description: 'Commissioning', hsn: '8541', isService: true, qty: 1, unit: 'OTH', unitPrice: Number(inv.amount), gstRate: 18 }] }).expect(201)).body;
    expect(r.ready).toBe(false);
    expect(r.issues[0]).toMatchObject({ field: 'Line 1 HSN/SAC', message: expect.stringMatching(/SAC code starting with 99/) });
    await api(app).get(`/v1/gst/documents/${r.id}/json`).set(auth(t.asha)).expect(400);
  });

  it('prepares an e-way bill for a goods purchase order with transport details', async () => {
    const po = await one("select id, lines from purchase_orders where number = 'PO-2026-000412'");
    const lines = po.lines.map((l: any, i: number) => ({ description: l.item, hsn: i === 0 ? '85414300' : '73089090', isService: false, qty: l.quantity, unit: l.unit, unitPrice: l.unitPrice, gstRate: i === 0 ? 5 : 18 }));
    const r = (await api(app).post('/v1/gst/prepare').set(auth(t.ravi)).send({ kind: 'ewaybill', source: 'purchase_order', sourceId: po.id, lines, transport: { mode: 1, distanceKm: 660, vehicleNo: 'GJ01AB4321' } }).expect(201)).body;
    expect(r).toMatchObject({ ready: true, validityDays: 4, belowThreshold: false, totals: { interState: true, placeOfSupply: '27' } });
    const json = (await api(app).get(`/v1/gst/documents/${r.id}/json`).set(auth(t.ravi)).expect(200)).body;
    expect(json.billLists[0]).toMatchObject({ fromGstin: '24AAKFS9876K1ZB', toGstin: '27AABCV1234F1ZO', vehicleNo: 'GJ01AB4321', transDistance: '660' });
    expect(json.billLists[0].itemList.map((i: any) => i.igstRate)).toEqual([5, 18]);
  });
});
