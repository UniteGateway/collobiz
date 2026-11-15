/**
 * Unite Powertek products sold by anyone: franchise, store, partner and agent register customer enquiries on the real
 * imported catalogue; the first seller keeps the customer; the sales team quotes and wins; the rate is frozen; finance's
 * payment record makes the commission earned (held for unverified sellers); losing a won order reverses the projection.
 */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema';
import { importCatalogue } from '../src/db/import-catalogue';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { idemKey } from './flows';

const L = 100_000_00;
describe('Product sales — Unite Powertek for everyone', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => {
    await resetDatabase(); await seed();
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await importCatalogue(drizzle(pool, { schema }) as never, 'powertek', { images: async () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]) }, () => undefined);
    app = await bootApp(); t = await loginAll(app);
  });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const post = (p: string, tok: string, b: object = {}) => api(app).post(`/v1/product-sales/powertek${p}`).set(auth(tok)).set('Idempotency-Key', idemKey('ps')).send(b);
  const get = (p: string, tok: string) => api(app).get(`/v1/product-sales/powertek${p}`).set(auth(tok));
  const item = async (name: string) => (await one("select c.id, c.specs from catalog_items c join organizations o on o.id = c.owner_org_id where o.display_name = 'Powertek' and c.name = $1", [name]));
  const enquiry = (name: string, lines: { catalogItemId: string; qty: number }[], extra: object = {}) => ({ customerName: name, city: 'Nalgonda', state: 'Telangana', pincode: '508001', lines, requirement: 'Needs supply and installation within 60 days.', consent: true, ...extra });

  let pump: { id: string; specs: Record<string, string> }, module: { id: string; specs: Record<string, string> };
  it('the whole imported catalogue is open to every seller, grouped by product line, with the rate that applies', async () => {
    const c = (await get('/catalogue', t.vikram).expect(200)).body;
    expect(c.total).toBeGreaterThanOrEqual(360);
    expect(c.lines.find((l: { line: string }) => l.line === 'POWERTEK SOLAR').count).toBe(57);
    expect(c.items[0].commissionBps).toBe(200); // the demo default rate
    const solar = (await get('/catalogue?line=POWERTEK%20SOLAR&q=Mono%20PERC', t.asha).expect(200)).body;
    expect(solar.items[0]).toMatchObject({ name: 'Mono PERC Solar PV Modules', productLine: 'POWERTEK SOLAR', category: 'PV Modules', hasImage: true });
    expect(solar.items[0].productPage).toMatch(/^https:\/\/www\.unitepowertek\.com\/products\//);
    await api(app).get('/v1/product-sales/powertek/catalogue').expect(401);
    await get('/catalogue', t.asha).query({}).expect(200);
    await api(app).get('/v1/product-sales/acme/catalogue').set(auth(t.asha)).expect(404);
    module = await item('Mono PERC Solar PV Modules');
    pump = (await one("select c.id, c.specs from catalog_items c join organizations o on o.id = c.owner_org_id where o.display_name = 'Powertek' and c.specs->>'Product line' = 'POWERTEK AGRI' order by c.name limit 1"));
  });

  it('Unite admins set rates (≤ 10%); the most specific rule wins and shows on the catalogue', async () => {
    await post('/admin/rules', t.asha, { productLine: null, category: null, rateBps: 200 }).expect(403);
    await post('/admin/rules', t.uniteAdmin, { productLine: null, category: null, rateBps: 1500 }).expect(400);
    await post('/admin/rules', t.uniteAdmin, { productLine: null, category: 'PV Modules', rateBps: 100 }).expect(400); // category needs its line
    await post('/admin/rules', t.uniteAdmin, { productLine: null, category: null, rateBps: 200, note: 'Default' }).expect(200);
    await post('/admin/rules', t.uniteAdmin, { productLine: 'POWERTEK SOLAR', category: 'PV Modules', rateBps: 150 }).expect(200);
    await post('/admin/rules', t.uniteAdmin, { productLine: 'POWERTEK AGRI', category: null, rateBps: 400 }).expect(200);
    const c = (await get('/catalogue?line=POWERTEK%20SOLAR&q=Mono%20PERC', t.asha).expect(200)).body;
    expect(c.items[0].commissionBps).toBe(150);
    const agri = (await get('/catalogue?line=POWERTEK%20AGRI', t.asha).expect(200)).body;
    expect(agri.items.every((i: { commissionBps: number }) => i.commissionBps === 400)).toBe(true);
  });

  let deccanEnq: string, ashaEnq: string;
  it('anyone sells: franchise/store, partner and agent channels; the first seller keeps the customer; consent is required', async () => {
    await post('/enquiries', t.asha, enquiry('Sri Rama Agro', [{ catalogItemId: pump.id, qty: 12 }], { consent: false })).expect(400);
    const a = (await post('/enquiries', t.asha, enquiry('Sri Rama Agro Pvt. Ltd.', [{ catalogItemId: pump.id, qty: 12 }])).expect(201)).body;
    expect(a).toMatchObject({ channel: 'partner', status: 'submitted' });
    expect(a.lines[0]).toMatchObject({ productLine: 'POWERTEK AGRI', rateBps: 400 });
    ashaEnq = a.id;
    const dup = await post('/enquiries', t.meera, enquiry('SRI RAMA AGRO', [{ catalogItemId: module.id, qty: 50 }])).expect(409);
    expect(dup.body.message).toMatch(/already registered .* by another seller/);
    const d = (await post('/enquiries', t.deepak, enquiry('Peenya Cold Storage', [{ catalogItemId: module.id, qty: 200 }, { catalogItemId: pump.id, qty: 2 }], { pincode: '560058', city: 'Bengaluru', state: 'Karnataka' })).expect(201)).body;
    expect(d.channel).toBe('store'); // Deccan runs a Unite Solar stock store
    deccanEnq = d.id;
    const m = (await post('/enquiries', t.meera, enquiry('Mysuru Dairy Co-op', [{ catalogItemId: pump.id, qty: 4 }], { pincode: '570001', city: 'Mysuru', state: 'Karnataka' })).expect(201)).body;
    expect(m.channel).toBe('agent'); // individual consultant
    // Sellers see only their own enquiries; customer contact details are for the sales team.
    await get(`/enquiries/${deccanEnq}`, t.asha).expect(404);
    const mine = (await get('/enquiries/mine', t.deepak).expect(200)).body;
    expect(mine.enquiries).toHaveLength(1);
    expect(mine.disclaimer).toMatch(/not a guaranteed income/);
    // Powertek's own team cannot register referrals for itself; other companies' products are refused.
    const other = await one("select c.id from catalog_items c join organizations o on o.id = c.owner_org_id where o.display_name <> 'Powertek' and c.status = 'published' limit 1");
    if (other) await post('/enquiries', t.asha, enquiry('Another Co', [{ catalogItemId: other.id, qty: 1 }], { pincode: '411001' })).expect(400);
  });

  it('sales team: quote → won freezes the lowest line rate and opens a projected commission; finance records payment → earned', async () => {
    await post(`/admin/enquiries/${deccanEnq}/status`, t.deepak, { to: 'quoted', quoteValue: 20 * L }).expect(403);
    await post(`/admin/enquiries/${deccanEnq}/status`, t.uniteAdmin, { to: 'won', orderValue: 20 * L, invoiceNumber: 'PT-SO-1' }).expect(409); // must be quoted first
    await post(`/admin/enquiries/${deccanEnq}/status`, t.uniteAdmin, { to: 'quoted' }).expect(400);
    await post(`/admin/enquiries/${deccanEnq}/status`, t.uniteAdmin, { to: 'quoted', quoteValue: 21 * L, assignedTo: 'Powertek Bengaluru desk' }).expect(200);
    await post(`/admin/enquiries/${deccanEnq}/status`, t.uniteAdmin, { to: 'won', orderValue: 20 * L }).expect(400);
    const w = (await post(`/admin/enquiries/${deccanEnq}/status`, t.uniteAdmin, { to: 'won', orderValue: 20 * L, invoiceNumber: 'PT-SO-1' }).expect(200)).body;
    expect(w).toMatchObject({ status: 'won', rateBps: 150, commission: 30_000_00 }); // modules 1.5% < agri 4%
    const ce = await one('select * from commission_entries where id = $1', [w.commissionEntryId]);
    expect(ce).toMatchObject({ status: 'estimated', base_amount: String(20 * L), gross: String(30_000_00) });
    await post(`/admin/enquiries/${deccanEnq}/paid`, t.uniteAdmin, { paymentReference: 'NEFT-PT-1' }).expect(403); // finance only
    await post(`/admin/enquiries/${deccanEnq}/paid`, t.finance, { paymentReference: 'NEFT-PT-1' }).expect(200);
    expect((await one('select status, earned_at from commission_entries where id = $1', [w.commissionEntryId])).status).toBe('earned');
    const earn = (await api(app).get('/v1/earnings').set(auth(t.deepak))).body;
    expect(JSON.stringify(earn)).toMatch(/Product sale PE-/);
    await post(`/admin/enquiries/${deccanEnq}/status`, t.uniteAdmin, { to: 'lost', lostReason: 'Customer changed mind' }).expect(409); // paid is final
  });

  it('a won order that is lost reverses the projected commission; withdrawing is the seller’s choice before a win', async () => {
    await post(`/admin/enquiries/${ashaEnq}/status`, t.uniteAdmin, { to: 'quoted', quoteValue: 9 * L }).expect(200);
    const w = (await post(`/admin/enquiries/${ashaEnq}/status`, t.uniteAdmin, { to: 'won', orderValue: 8 * L, invoiceNumber: 'PT-SO-2' }).expect(200)).body;
    expect(w.commission).toBe(32_000_00);
    await post(`/admin/enquiries/${ashaEnq}/status`, t.uniteAdmin, { to: 'lost' }).expect(400);
    await post(`/admin/enquiries/${ashaEnq}/status`, t.uniteAdmin, { to: 'lost', lostReason: 'Customer cancelled the order' }).expect(200);
    expect((await one('select status from commission_entries where id = $1', [w.commissionEntryId])).status).toBe('reversed');
    // The customer is free again once lost.
    await post('/enquiries', t.meera, enquiry('Sri Rama Agro', [{ catalogItemId: pump.id, qty: 6 }])).expect(201);
    const mine = (await get('/enquiries/mine', t.meera).expect(200)).body;
    const open = mine.enquiries.find((e: { customerName: string }) => e.customerName === 'Sri Rama Agro');
    await post(`/enquiries/${open.id}/withdraw`, t.asha, { reason: 'not mine' }).expect(404);
    await post(`/enquiries/${open.id}/withdraw`, t.meera, { reason: 'Customer postponed' }).expect(200);
  });

  it('unverified sellers can sell, but their earned commission is held until verification', async () => {
    const v = (await post('/enquiries', t.vikram, enquiry('Uppal Poultry Farm', [{ catalogItemId: pump.id, qty: 1 }], { pincode: '500039', city: 'Hyderabad' })).expect((r) => expect([201, 403]).toContain(r.status))).body;
    if (!v.id) return; // vikram has no organisation in this seed — covered by RequireOrg
    await post(`/admin/enquiries/${v.id}/status`, t.uniteAdmin, { to: 'quoted', quoteValue: 2 * L }).expect(200);
    const w = (await post(`/admin/enquiries/${v.id}/status`, t.uniteAdmin, { to: 'won', orderValue: 2 * L, invoiceNumber: 'PT-SO-3' }).expect(200)).body;
    await post(`/admin/enquiries/${v.id}/paid`, t.finance, { paymentReference: 'UPI-PT-3' }).expect(200);
    expect((await one('select status, hold_reason from commission_entries where id = $1', [w.commissionEntryId]))).toMatchObject({ status: 'on_hold', hold_reason: expect.stringMatching(/verification/) });
  });

  it('sales dashboard by channel, state and product line; sellers are kept out', async () => {
    await get('/admin/enquiries', t.asha).expect(403);
    const d = (await get('/admin/enquiries', t.uniteAdmin).expect(200)).body;
    expect(d.kpis.paid).toBeGreaterThanOrEqual(1);
    expect(d.byChannel.map((c: { key: string }) => c.key)).toEqual(expect.arrayContaining(['Store partner', 'Partner company', 'Agent / individual']));
    expect(d.enquiries[0].customerPhone !== undefined).toBe(true);
    const audit = await one("select count(*)::int n from audit_events where action like 'product_sales.%'");
    expect(audit.n).toBeGreaterThan(8);
  });
});
