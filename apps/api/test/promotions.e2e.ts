import type { INestApplication } from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { resetConfigForTests } from '../src/config';

/** Minimal Frappe stand-in: lists POS Profiles and records Pricing Rule inserts. */
function fakeErp(port: number) {
  const inserts: { doctype: string; body: any }[] = [];
  const server = createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
      const send = (st: number, d: unknown) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
      if (req.headers.authorization !== 'token k:s') return send(401, {});
      const doctype = decodeURIComponent(new URL(req.url!, 'http://x').pathname).split('/').filter(Boolean)[2];
      if (req.method === 'GET') return send(200, { data: doctype === 'POS Profile' ? [{ name: 'Unite Solar Store — Hyderabad' }, { name: 'Unite Solar Store — Vizag' }] : [] });
      const body = JSON.parse(raw); inserts.push({ doctype, body }); send(200, { data: { name: 'PRLE-0001', ...body } });
    });
  });
  return new Promise<{ server: Server; inserts: typeof inserts }>((r) => server.listen(port, '127.0.0.1', () => r({ server, inserts })));
}

describe('Promotions (BOGO), online store and in-store vouchers', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  const saved = { ...process.env };
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); process.env = saved; resetConfigForTests(); });

  let products: any[];
  const ref = (name: RegExp) => products.find((p) => name.test(p.name)).ref;
  const customer = { name: 'Meena Shah', phone: '98204 56789', address: '12 Lake View Society, Baner Road', city: 'Pune', region: 'IN-MH', pincode: '411045' };

  it('the online store lists solar kits and listed products, with live offers only', async () => {
    const s = (await api(app).get('/v1/public/store').expect(200)).body;
    products = s.products;
    expect(products.filter((p: any) => p.kind === 'kit')).toHaveLength(14);
    expect(products.filter((p: any) => p.kind === 'item')).toHaveLength(8);
    expect(products.find((p: any) => /lantern/i.test(p.name)).offer).toMatchObject({ label: 'Buy 1 get 1 free', name: 'Festive solar lights' });
    expect(products.find((p: any) => /BLDC/.test(p.name)).offer).toBeNull(); // not in the category
    expect(s.offers.map((o: any) => o.name)).toEqual(['Festive solar lights']); // the "all products" draft is not live
  });

  it('prices on the server: free units added, capped per order and by budget; order records usage; cancelling releases it', async () => {
    const lines = [{ ref: ref(/lantern/i), qty: 3 }, { ref: ref(/BLDC/), qty: 1 }];
    const p = (await api(app).post('/v1/public/store/price').send({ lines }).expect(200)).body;
    expect(p.lines.map((l: any) => l.freeQty)).toEqual([2, 0]);
    expect(p).toMatchObject({ subtotal: 3 * 1_499_00 + 3_299_00, freeValue: 2 * 1_499_00 });
    await api(app).post('/v1/public/store/price').send({ lines: [{ ref: 'item:00000000-0000-0000-0000-000000000000', qty: 1 }] }).expect(400);
    await api(app).post('/v1/public/store/orders').send({ lines, customer, consent: false }).expect(400);
    const o = (await api(app).post('/v1/public/store/orders').send({ lines, customer, consent: true, unitPrice: 1 }).expect(201)).body;
    expect(o).toMatchObject({ freeValue: 2 * 1_499_00 });
    expect(o.code).toMatch(/^STO-\d{4}-\d{6}$/);
    expect(await one("select used_units, used_value from promotions where code = 'PRM-2026-0001'")).toMatchObject({ used_units: 2, used_value: String(2 * 1_499_00) });
    // Budget nearly used up: only one free unit left.
    await pool.query("update promotions set budget_units = 3 where code = 'PRM-2026-0001'");
    expect((await api(app).post('/v1/public/store/price').send({ lines }).expect(200)).body.lines[0].freeQty).toBe(1);
    const admin = (await api(app).get('/v1/admin/store').set(auth(t.uniteAdmin)).expect(200)).body;
    const mine = admin.orders.find((x: any) => x.code === o.code);
    await api(app).post(`/v1/admin/store/orders/${mine.id}/status`).set(auth(t.asha)).send({ status: 'cancelled' }).expect(403);
    await api(app).post(`/v1/admin/store/orders/${mine.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'fulfilled' }).expect(409);
    await api(app).post(`/v1/admin/store/orders/${mine.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'cancelled' }).expect(200);
    expect((await one("select used_units from promotions where code = 'PRM-2026-0001'")).used_units).toBe(0);
    await pool.query("update promotions set budget_units = 200 where code = 'PRM-2026-0001'");
  });

  let draftId: string;
  it('Unite admins draft; only finance or a super admin makes a promotion live, never the author alone; every promotion needs a budget and terms', async () => {
    const now = Date.now();
    const body = { name: 'Fan fortnight', buyQty: 1, getQty: 1, scope: 'sectors', sectors: ['Energy-efficient appliances'], channel: 'online', maxFreePerOrder: 1, budgetUnits: 50, startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 14 * 86400_000).toISOString(), terms: 'Buy a BLDC fan or LED pack online and get one more free, one per order, while 50 last.' };
    await api(app).post('/v1/admin/promotions').set(auth(t.asha)).send(body).expect(403);
    await api(app).post('/v1/admin/promotions').set(auth(t.uniteAdmin)).send({ ...body, budgetUnits: undefined }).expect(400);
    await api(app).post('/v1/admin/promotions').set(auth(t.uniteAdmin)).send({ ...body, sectors: [] }).expect(400);
    await api(app).post('/v1/admin/promotions').set(auth(t.uniteAdmin)).send({ ...body, endsAt: body.startsAt }).expect(400);
    const p = (await api(app).post('/v1/admin/promotions').set(auth(t.uniteAdmin)).send(body).expect(201)).body;
    draftId = p.id;
    expect(p.status).toBe('draft');
    await api(app).post(`/v1/admin/promotions/${p.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'active' }).expect(403);
    await api(app).post(`/v1/admin/promotions/${p.id}/status`).set(auth(t.finance)).send({ status: 'active' }).expect(200);
    const price = (await api(app).post('/v1/public/store/price').send({ lines: [{ ref: ref(/BLDC/), qty: 2 }] }).expect(200)).body;
    expect(price.lines[0]).toMatchObject({ freeQty: 1, promotionName: 'Fan fortnight — Buy 1 get 1 free' });
    await api(app).patch(`/v1/admin/promotions/${p.id}`).set(auth(t.uniteAdmin)).send(body).expect(409); // pause first
    await api(app).post(`/v1/admin/promotions/${p.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'paused' }).expect(200);
    const edited = (await api(app).patch(`/v1/admin/promotions/${p.id}`).set(auth(t.uniteAdmin)).send({ ...body, budgetUnits: 80 }).expect(200)).body;
    expect(edited).toMatchObject({ status: 'draft', budgetUnits: 80 }); // edits need approval again
    const list = (await api(app).get('/v1/admin/promotions').set(auth(t.finance)).expect(200)).body;
    expect(list.canApprove).toBe(true);
    expect(list.promotions.find((x: any) => x.name === 'Buy one get one — all products')).toMatchObject({ scope: 'all', status: 'draft', eligibleProducts: 22 });
  });

  let voucher: string;
  const store = async () => (await api(app).get('/v1/store/redeem').set(auth(t.asha)).expect(200)).body.stores[0] as string;
  it('in stores: one voucher per mobile number; redeemed once by the store, for products in the offer', async () => {
    const offers = (await api(app).get('/v1/public/store/offers').expect(200)).body;
    const festive = offers.find((o: any) => o.name === 'Festive solar lights');
    expect(offers.find((o: any) => o.name === 'Fan fortnight')).toBeUndefined(); // online-only and paused
    await api(app).post(`/v1/public/store/offers/${festive.id}/voucher`).send({ name: 'Ramesh', phone: '9811122233', consent: false }).expect(400);
    const v = (await api(app).post(`/v1/public/store/offers/${festive.id}/voucher`).send({ name: 'Ramesh', phone: '9811122233', consent: true }).expect(201)).body;
    voucher = v.code;
    expect(voucher).toMatch(/^BOGO-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    await api(app).post(`/v1/public/store/offers/${festive.id}/voucher`).send({ name: 'Ramesh', phone: '+91 98111 22233', consent: true }).expect(409);
    await api(app).get('/v1/store/redeem').set(auth(t.ravi)).expect(403); // no live franchise store
    const pune = await store();
    expect(pune).toMatch(/^Unite Solar franchise — Pune \(FR-/);
    const redeem = { code: voucher.toLowerCase(), store: pune, itemRef: ref(/lantern/i), billNo: 'PUN-2026-0042', phone: '9811122233' };
    await api(app).post('/v1/store/vouchers/redeem').set(auth(t.asha)).send({ ...redeem, store: 'Solar Experience Centre — Hyderabad' }).expect(403);
    await api(app).post('/v1/store/vouchers/redeem').set(auth(t.asha)).send({ ...redeem, phone: '9811100000' }).expect(404);
    await api(app).post('/v1/store/vouchers/redeem').set(auth(t.asha)).send({ ...redeem, itemRef: ref(/BLDC/) }).expect(409);
    const r = (await api(app).post('/v1/store/vouchers/redeem').set(auth(t.asha)).send(redeem).expect(200)).body;
    expect(r).toMatchObject({ free: 1, value: 1_499_00, customer: 'Ramesh' });
    const again = await api(app).post('/v1/store/vouchers/redeem').set(auth(t.uniteAdmin)).send({ ...redeem, store: 'Solar Experience Centre — Hyderabad' }).expect(409);
    expect(again.body.message).toMatch(/already used/);
    expect(await one("select count(*)::int n from promo_redemptions where channel = 'store'")).toMatchObject({ n: 1 });
  });

  it('ERPNext: refused while not connected; when connected, stores come from POS Profiles and a live promotion becomes a Pricing Rule', async () => {
    const festive = (await api(app).get('/v1/admin/promotions').set(auth(t.uniteAdmin)).expect(200)).body.promotions.find((x: any) => x.name === 'Festive solar lights');
    await api(app).post(`/v1/admin/promotions/${festive.id}/erpnext`).set(auth(t.uniteAdmin)).expect(409);
    const PORT = 19900 + Math.floor(Math.random() * 90);
    const fake = await fakeErp(PORT);
    Object.assign(process.env, { ERPNEXT_URL: `http://127.0.0.1:${PORT}`, ERPNEXT_API_KEY: 'k', ERPNEXT_API_SECRET: 's' }); resetConfigForTests();
    try {
      const a = (await api(app).get('/v1/admin/promotions').set(auth(t.uniteAdmin)).expect(200)).body;
      expect(a.erpnext).toBe(true);
      expect(a.stores).toEqual(expect.arrayContaining(['Unite Solar Store — Vizag']));
      await api(app).post(`/v1/admin/promotions/${draftId}/erpnext`).set(auth(t.uniteAdmin)).expect(409); // not live
      const r = (await api(app).post(`/v1/admin/promotions/${festive.id}/erpnext`).set(auth(t.uniteAdmin)).expect(200)).body;
      expect(r).toEqual({ name: 'PRLE-0001', created: true });
      expect(fake.inserts[0]).toMatchObject({ doctype: 'Pricing Rule', body: { apply_on: 'Item Group', price_or_product_discount: 'Product', min_qty: 1, free_qty: 1, same_item: 1, selling: 1, item_groups: [{ item_group: 'Solar accessories' }] } });
      expect((await api(app).post(`/v1/admin/promotions/${festive.id}/erpnext`).set(auth(t.uniteAdmin)).expect(200)).body.created).toBe(false); // never twice
    } finally { fake.server.close(); delete process.env.ERPNEXT_URL; resetConfigForTests(); }
  });
});
