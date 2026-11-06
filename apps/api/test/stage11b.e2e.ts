import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { idemKey } from './flows';
import type { SeedRefs } from '../src/db/seed';

const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);

describe('Stage 11b — trading (gate: evidence and change logs carried into procurement)', () => {
  let app: INestApplication;
  let refs: SeedRefs;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  let req: any; let sunriseQ: any; let deccanQ: any; let po: any; let transformer: any;

  beforeAll(async () => {
    await resetDatabase(); refs = await seed(); app = await bootApp(); t = await loginAll(app);
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    req = (await pool.query("select * from trade_requirements where code = 'REQ-2026-000001'")).rows[0];
    transformer = (await pool.query("select * from supplier_products where sku = 'SR-TX-630'")).rows[0];
  });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('086 only verified traders/manufacturers/distributors list products; directory shows suppliers and their distributors', async () => {
    await api(app).post('/v1/trading/products').set(auth(t.asha)).send({ name: 'Mounting structures', sector: 'solar', description: 'Hot-dip galvanised structures', unit: 'kWp' }).expect(403);
    await api(app).post('/v1/trading/products').set(auth(t.ravi)).send({ name: 'x', sector: 'solar', description: 'short', unit: 'm' }).expect(400);
    const p = await api(app).post('/v1/trading/products').set(auth(t.ravi)).send({ name: 'Earthing kit (chemical)', sector: 'power_equipment', description: 'Maintenance-free chemical earthing electrode kit, 3 m', unit: 'set', price: 8_500_00, moq: 10 }).expect(201);
    const u = await api(app).patch(`/v1/trading/products/${p.body.id}`).set(auth(t.ravi)).send({ leadTimeDays: 2 }).expect(200);
    expect(u.body).toMatchObject({ leadTimeDays: 2, moq: 10, stock: 'in_stock' }); // patch keeps unsent fields
    await api(app).patch(`/v1/trading/products/${p.body.id}`).set(auth(t.deepak)).send({ price: 1 }).expect(404); // Deccan is a supplier but not the owner
    const s = await api(app).get('/v1/trading/suppliers').set(auth(t.asha)).expect(200);
    expect(s.body.map((x: any) => x.name)).toEqual(expect.arrayContaining(['Sunrise Traders', 'Deccan Distributors']));
    expect(s.body.map((x: any) => x.name)).not.toContain('Volt EPC');
  });

  it('093 territories: only manufacturers/traders appoint distributors; exclusive grants cannot overlap', async () => {
    await api(app).post('/v1/trading/territories').set(auth(t.asha)).send({ distributorOrgId: refs.orgs.deccan, region: 'IN-KA', sector: 'power_equipment', startDate: inDays(-1), endDate: inDays(365) }).expect(403);
    await api(app).post('/v1/trading/territories').set(auth(t.deepak)).send({ distributorOrgId: refs.orgs.sunrise, region: 'IN-KA', sector: 'power_equipment', startDate: inDays(-1), endDate: inDays(365) }).expect(403);
    await api(app).post('/v1/trading/territories').set(auth(t.ravi)).send({ distributorOrgId: refs.orgs.volt, region: 'IN-KA', sector: 'power_equipment', startDate: inDays(-1), endDate: inDays(365) }).expect(400);
    await api(app).post('/v1/trading/territories').set(auth(t.ravi)).send({ distributorOrgId: refs.orgs.deccan, region: 'IN-KA', sector: 'power_equipment', exclusive: true, startDate: inDays(-1), endDate: inDays(365), targetValue: 50_00_000_00 }).expect(201);
    const dup = await api(app).post('/v1/trading/territories').set(auth(t.ravi)).send({ distributorOrgId: refs.orgs.deccan, region: 'IN-KA', sector: 'power_equipment', startDate: inDays(10), endDate: inDays(20) }).expect(409);
    expect(dup.body.message).toMatch(/already appointed for IN-KA/);
    const other = (await pool.query("insert into organizations (legal_name, display_name, type, country, city, verification_status, membership_level, partner_types) values ('Karnataka Power Traders LLP', 'KPT', 'partner_company', 'IN', 'Mysuru', 'verified', 'verified', '{distributor}') returning id")).rows[0].id;
    const c = await api(app).post('/v1/trading/territories').set(auth(t.ravi)).send({ distributorOrgId: other, region: 'IN-KA', sector: 'power_equipment', startDate: inDays(30), endDate: inDays(60) }).expect(409);
    expect(c.body.message).toMatch(/exclusive territory of Deccan Distributors in IN-KA/);
    await api(app).post('/v1/trading/territories').set(auth(t.ravi)).send({ distributorOrgId: other, region: 'IN-TN', sector: 'power_equipment', exclusive: true, startDate: inDays(0), endDate: inDays(90) }).expect(201);
    const mine = await api(app).get('/v1/trading/territories').set(auth(t.deepak)).expect(200);
    expect(mine.body).toEqual([expect.objectContaining({ side: 'distributor', supplier: 'Sunrise Traders', region: 'IN-KA', exclusive: true, current: true })]);
  });

  it('088 enquiries are routed to the exclusive distributor for the buyer’s region; threads stay private', async () => {
    const m = await api(app).post('/v1/trading/enquiries').set(auth(t.meera)).send({ supplierProductId: transformer.id, quantity: '2 nos', message: 'Need two units delivered to Hosur by January.' }).expect(201);
    expect(m.body).toMatchObject({ routedToDistributor: true, supplierOrgId: refs.orgs.deccan, intendedSupplierOrgId: refs.orgs.sunrise });
    const a = await api(app).post('/v1/trading/enquiries').set(auth(t.asha)).send({ supplierProductId: transformer.id, quantity: '1 no', message: 'Price for one unit ex-works Ahmedabad?' }).expect(201);
    expect(a.body).toMatchObject({ routedToDistributor: false, supplierOrgId: refs.orgs.sunrise });
    await api(app).get(`/v1/trading/enquiries/${m.body.id}`).set(auth(t.ravi)).expect(404);
    await api(app).post(`/v1/trading/enquiries/${m.body.id}/messages`).set(auth(t.deepak)).send({ body: 'Two units ex-stock Bengaluru, 10 days.' }).expect(201);
    const th = await api(app).get(`/v1/trading/enquiries/${m.body.id}`).set(auth(t.meera)).expect(200);
    expect(th.body.messages.map((x: any) => x.org)).toEqual(['Meera Iyer Consulting', 'Deccan Distributors']);
    const q = await api(app).post('/v1/trading/quotations').set(auth(t.deepak)).send({ enquiryId: m.body.id, lines: [{ item: '630 kVA transformer', quantity: 2, unit: 'nos', unitPrice: 9_60_000_00 }], deliveryDays: 10, validUntil: inDays(15) }).expect(201);
    expect(q.body).toMatchObject({ subtotal: 19_20_000_00, total: 22_65_600_00 }); // 18% GST default
    expect((await api(app).get(`/v1/trading/enquiries/${m.body.id}`).set(auth(t.meera)).expect(200)).body.status).toBe('quoted');
    // Catalogue price requests land on the same desk for the owning group company
    const item = (await pool.query("select id from catalog_items where sku = 'US-MOD-545'")).rows[0].id;
    await api(app).post(`/v1/catalog/${item}/price-request`).set(auth(t.asha)).send({ quantity: '500 modules', message: 'For the Chakan rooftop' }).expect(201);
    const inbox = await api(app).get('/v1/trading/enquiries').set(auth(t.uniteAdmin)).expect(200);
    expect(inbox.body.find((e: any) => e.subject === 'Mono PERC Solar Module 545 Wp')).toMatchObject({ direction: 'received', buyer: 'Volt EPC' });
  });

  it('087/089 requirements reach eligible suppliers; quotations are private to each supplier and compared only by the buyer', async () => {
    const mk = await api(app).get('/v1/trading/market').set(auth(t.ravi)).expect(200);
    expect(mk.body.isSupplier).toBe(true);
    expect(mk.body.openRequirements.map((r: any) => r.code)).toContain('REQ-2026-000001');
    expect((await api(app).get('/v1/trading/market').set(auth(t.meera)).expect(200)).body.openRequirements).toEqual([]);
    await api(app).post('/v1/trading/requirements').set(auth(t.asha)).send({ title: 'Too soon to close', sector: 'solar', items: [{ item: 'Clamps', quantity: 100, unit: 'nos' }], deliveryLocation: 'Pune', closesAt: new Date(Date.now() + 10 * 60_000).toISOString() }).expect(400);
    await api(app).post('/v1/trading/quotations').set(auth(t.asha)).send({ requirementId: req.id, lines: [{ item: 'Cable', quantity: 1, unit: 'm', unitPrice: 1 }], deliveryDays: 1, validUntil: inDays(5) }).expect(403); // not a supplier
    sunriseQ = (await api(app).post('/v1/trading/quotations').set(auth(t.ravi)).send({ requirementId: req.id, lines: [{ item: '4C x 300 sq mm XLPE armoured cable', quantity: 1800, unit: 'm', unitPrice: 1_420_00 }, { item: '4C x 95 sq mm XLPE armoured cable', quantity: 600, unit: 'm', unitPrice: 520_00 }], deliveryDays: 7, validUntil: inDays(20), terms: 'Ex-works Ahmedabad, freight extra' }).expect(201)).body;
    await api(app).post('/v1/trading/quotations').set(auth(t.ravi)).send({ requirementId: req.id, lines: [{ item: '4C x 300 sq mm XLPE armoured cable', quantity: 1800, unit: 'm', unitPrice: 1_400_00 }], deliveryDays: 7, validUntil: inDays(20) }).expect(409); // one active quote per supplier
    deccanQ = (await api(app).post('/v1/trading/quotations').set(auth(t.deepak)).send({ requirementId: req.id, lines: [{ item: '4C x 300 sq mm XLPE armoured cable', quantity: 1800, unit: 'm', unitPrice: 1_480_00 }, { item: '4C x 95 sq mm XLPE armoured cable', quantity: 600, unit: 'm', unitPrice: 495_00 }], deliveryDays: 4, validUntil: inDays(20) }).expect(201)).body;
    await api(app).get(`/v1/trading/requirements/${req.id}/quotations`).set(auth(t.ravi)).expect(403);
    const own = await api(app).get(`/v1/trading/requirements/${req.id}`).set(auth(t.ravi)).expect(200);
    expect(own.body.myQuotations.map((q: any) => q.id)).toEqual([sunriseQ.id]);
    expect(JSON.stringify(own.body)).not.toContain('148000');
    const cmp = await api(app).get(`/v1/trading/requirements/${req.id}/quotations`).set(auth(t.asha)).expect(200);
    const s = cmp.body.quotations.find((q: any) => q.id === sunriseQ.id);
    const d = cmp.body.quotations.find((q: any) => q.id === deccanQ.id);
    expect(s).toMatchObject({ rank: 1, lowest: true, fastest: false });
    expect(d).toMatchObject({ rank: 2, lowest: false, fastest: true });
    expect(s.lines[0].best).toBe(true); expect(d.lines[1].best).toBe(true);
  });

  it('090/091 PO from the chosen quote: other quotes rejected, requirement awarded; issued orders are locked and fully logged', async () => {
    await api(app).post('/v1/trading/purchase-orders').set(auth(t.meera)).send({ supplierOrgId: refs.orgs.volt, lines: [{ item: 'Clamp', quantity: 1, unit: 'nos', unitPrice: 100 }], deliveryAddress: 'Bengaluru', deliveryBy: inDays(10), paymentTerms: '30 days' }).expect(400); // Volt is not a supplier
    const r = await api(app).post('/v1/trading/purchase-orders').set(auth(t.asha)).send({ quotationId: sunriseQ.id, deliveryAddress: 'Chakan MIDC Phase II, Pune', deliveryBy: inDays(14), paymentTerms: '30 days from delivery' }).expect(201);
    po = r.body;
    expect(po).toMatchObject({ status: 'draft', total: sunriseQ.total, supplierOrgId: refs.orgs.sunrise });
    const statuses = (await pool.query('select id, status from quotations where requirement_id = $1', [req.id])).rows;
    expect(Object.fromEntries(statuses.map((x) => [x.id, x.status]))).toEqual({ [sunriseQ.id]: 'accepted', [deccanQ.id]: 'rejected' });
    expect((await pool.query('select status from trade_requirements where id = $1', [req.id])).rows[0].status).toBe('awarded');
    await api(app).post('/v1/trading/purchase-orders').set(auth(t.asha)).send({ quotationId: sunriseQ.id, deliveryAddress: 'Pune MIDC', deliveryBy: inDays(14), paymentTerms: 'x30 days' }).expect(409);
    await api(app).post(`/v1/trading/purchase-orders/${po.id}/issue`).set(auth(t.ravi)).set('Idempotency-Key', idemKey()).expect(403);
    await api(app).post(`/v1/trading/purchase-orders/${po.id}/issue`).set(auth(t.asha)).set('Idempotency-Key', idemKey()).expect(200);
    await expect(pool.query("update purchase_orders set total = 1 where id = $1", [po.id])).rejects.toThrow(/issued; lines, totals and parties are locked/);
    await api(app).post(`/v1/trading/purchase-orders/${po.id}/start`).set(auth(t.ravi)).expect(409); // must accept first
    await api(app).post(`/v1/trading/purchase-orders/${po.id}/accept`).set(auth(t.ravi)).send({ note: 'Stock reserved' }).expect(200);
    await api(app).post(`/v1/trading/purchase-orders/${po.id}/start`).set(auth(t.ravi)).expect(200);
    await api(app).post(`/v1/trading/purchase-orders/${po.id}/cancel`).set(auth(t.asha)).send({ reason: 'Changed my mind' }).expect(409); // too late
    await api(app).get(`/v1/trading/purchase-orders/${po.id}`).set(auth(t.deepak)).expect(404);
  });

  it('092 shipment tracking and line-by-line goods receipt with exceptions; project materials update from the receipt', async () => {
    await api(app).post(`/v1/trading/purchase-orders/${po.id}/receipt`).set(auth(t.asha)).set('Idempotency-Key', idemKey()).field('payload', JSON.stringify({ lines: [{ item: '4C x 300 sq mm XLPE armoured cable', received: 1800 }] })).expect(409); // not shipped
    await api(app).post(`/v1/trading/purchase-orders/${po.id}/shipment`).set(auth(t.ravi)).send({ carrier: 'VRL Logistics', trackingNo: 'VRL-7781-22', eta: inDays(5) }).expect(201);
    await api(app).post(`/v1/trading/purchase-orders/${po.id}/shipment/events`).set(auth(t.ravi)).send({ status: 'In transit', location: 'Vadodara hub' }).expect(201);
    await api(app).post(`/v1/trading/purchase-orders/${po.id}/receipt`).set(auth(t.asha)).set('Idempotency-Key', idemKey()).field('payload', JSON.stringify({ lines: [{ item: '4C x 300 sq mm XLPE armoured cable', received: 2000 }] })).expect(400); // more than ordered
    const rc = await api(app).post(`/v1/trading/purchase-orders/${po.id}/receipt`).set(auth(t.asha)).set('Idempotency-Key', idemKey())
      .field('payload', JSON.stringify({ lines: [{ item: '4C x 300 sq mm XLPE armoured cable', received: 1800, damaged: 0 }, { item: '4C x 95 sq mm XLPE armoured cable', received: 550, damaged: 40 }], note: '50 m short; one drum crushed' }))
      .attach('files', png, { filename: 'drum.png', contentType: 'image/png' }).expect(200);
    expect(rc.body.status).toBe('delivered');
    expect(rc.body.exceptions.map((x: any) => x.item)).toEqual(['4C x 95 sq mm XLPE armoured cable']);
    const o = await api(app).get(`/v1/trading/purchase-orders/${po.id}`).set(auth(t.ravi)).expect(200);
    expect(o.body.history.map((h: any) => h.action)).toEqual(['po.created', 'po.issued', 'po.accepted', 'po.in_fulfilment', 'po.shipped', 'shipment.tracking', 'po.delivered']);
    expect(o.body.shipment).toMatchObject({ status: 'delivered', carrier: 'VRL Logistics' });
    expect(o.body.shipment.proofOfDelivery).toHaveLength(1);
    await expect(pool.query('delete from po_events where po_id = $1', [po.id])).rejects.toThrow(/append-only/);
    // Project material linkage: a direct PO for the seeded project's inverters updates delivered quantity on receipt
    const mat = (await pool.query("select * from project_materials where item = 'String inverters 100 kW'")).rows[0];
    const p2 = (await api(app).post('/v1/trading/purchase-orders').set(auth(t.asha)).send({ supplierOrgId: refs.orgs.sunrise, lines: [{ item: 'String inverter 100 kW', quantity: 20, unit: 'nos', unitPrice: 3_10_000_00 }], deliveryAddress: 'Chakan MIDC, Pune', deliveryBy: inDays(20), paymentTerms: '50% advance', projectMaterialId: mat.id }).expect(201)).body;
    expect(p2.projectId).toBe(mat.project_id);
    await api(app).post(`/v1/trading/purchase-orders/${p2.id}/issue`).set(auth(t.asha)).set('Idempotency-Key', idemKey()).expect(200);
    await api(app).post(`/v1/trading/purchase-orders/${p2.id}/accept`).set(auth(t.ravi)).send({}).expect(200);
    await api(app).post(`/v1/trading/purchase-orders/${p2.id}/start`).set(auth(t.ravi)).expect(200);
    await api(app).post(`/v1/trading/purchase-orders/${p2.id}/shipment`).set(auth(t.ravi)).send({ carrier: 'Own fleet', trackingNo: 'SR-TRK-1' }).expect(201);
    await api(app).post(`/v1/trading/purchase-orders/${p2.id}/receipt`).set(auth(t.asha)).set('Idempotency-Key', idemKey()).field('payload', JSON.stringify({ lines: [{ item: 'String inverter 100 kW', received: 20 }] })).expect(200);
    const after = (await pool.query('select status, delivered_qty from project_materials where id = $1', [mat.id])).rows[0];
    expect(after).toEqual({ status: 'delivered', delivered_qty: 20 });
    const log = (await pool.query("select reason from project_change_log where entity_id = $1 and field = 'deliveredQty'", [mat.id])).rows[0];
    expect(log.reason).toMatch(/Goods receipt on PO-/);
  });

  it('094 claims need evidence for damage, block closing until resolved, and escalate when rejected', async () => {
    const payload = { poId: po.id, kind: 'damage', description: 'One drum of 95 sq mm cable crushed in transit; 40 m unusable.', lines: [{ item: '4C x 95 sq mm XLPE armoured cable', quantity: 40 }], amountClaimed: 20_800_00 };
    await api(app).post('/v1/trading/claims').set(auth(t.asha)).field('payload', JSON.stringify(payload)).expect(400); // no photo
    await api(app).post('/v1/trading/claims').set(auth(t.asha)).field('payload', JSON.stringify({ ...payload, lines: [{ item: '4C x 95 sq mm XLPE armoured cable', quantity: 9999 }] })).attach('files', png, { filename: 'c.png', contentType: 'image/png' }).expect(400);
    const c = (await api(app).post('/v1/trading/claims').set(auth(t.asha)).field('payload', JSON.stringify(payload)).attach('files', png, { filename: 'crushed.png', contentType: 'image/png' }).expect(201)).body;
    await api(app).post(`/v1/trading/claims/${c.id}/escalate`).set(auth(t.asha)).send({ note: 'Escalating too early on purpose' }).expect(409); // supplier still has time
    await api(app).post(`/v1/trading/claims/${c.id}/respond`).set(auth(t.asha)).send({ decision: 'accept', resolution: 'replacement', note: 'Buyer cannot respond' }).expect(403);
    await api(app).post(`/v1/trading/claims/${c.id}/respond`).set(auth(t.ravi)).send({ decision: 'accept', note: 'Will replace' }).expect(400); // resolution required
    await api(app).post(`/v1/trading/claims/${c.id}/respond`).set(auth(t.ravi)).send({ decision: 'accept', resolution: 'replacement', note: 'Replacement drum dispatched with the next load' }).expect(200);
    await api(app).post(`/v1/trading/purchase-orders/${po.id}/close`).set(auth(t.asha)).expect(409);
    await api(app).post(`/v1/trading/claims/${c.id}/resolve`).set(auth(t.asha)).send({ note: 'Replacement received in good condition' }).expect(200);
    const short = (await api(app).post('/v1/trading/claims').set(auth(t.asha)).field('payload', JSON.stringify({ poId: po.id, kind: 'shortage', description: '50 m of 95 sq mm cable short-supplied against the order.', lines: [{ item: '4C x 95 sq mm XLPE armoured cable', quantity: 50 }] })).expect(201)).body;
    await api(app).post(`/v1/trading/claims/${short.id}/respond`).set(auth(t.ravi)).send({ decision: 'reject', note: 'Our dispatch note shows full quantity loaded' }).expect(200);
    const e = await api(app).post(`/v1/trading/claims/${short.id}/escalate`).set(auth(t.asha)).send({ note: 'Weighbridge slip and GRN show 550 m received.' }).expect(200);
    expect(e.body.status).toBe('escalated');
    const n = await pool.query("select count(*)::int n from notifications where user_id = $1 and title like 'Escalated claim%'", [refs.users.compliance]);
    expect(n.rows[0].n).toBe(1);
    await api(app).post(`/v1/trading/purchase-orders/${po.id}/close`).set(auth(t.asha)).expect(409); // escalated claim still open
    const list = await api(app).get('/v1/trading/claims').set(auth(t.ravi)).expect(200);
    expect(list.body.find((x: any) => x.id === c.id).evidence).toHaveLength(1);
    const hist = (await api(app).get(`/v1/trading/purchase-orders/${po.id}`).set(auth(t.asha)).expect(200)).body.history.map((h: any) => h.action);
    expect(hist).toEqual(expect.arrayContaining(['claim.raised', 'claim.accepted', 'claim.resolved', 'claim.rejected', 'claim.escalated']));
  });
});
