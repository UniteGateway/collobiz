/** UNITE INDUSTRY CLUB — OEM products under the Unite Powertek brand, free-power bundles, buying power, member pages. */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('Unite Industry Club', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const get = (path: string, tok?: string) => (tok ? api(app).get(`/v1${path}`).set(auth(tok)) : api(app).get(`/v1${path}`));
  const post = (path: string, tok: string, b: object = {}) => api(app).post(`/v1${path}`).set(auth(tok)).send(b);
  const ALL_CHECKS = ['quality_checked', 'certifications_verified', 'factory_verified', 'brand_licence_signed'];
  const coldRoom = { name: 'Solar Cold Room 5 MT', category: 'Cold storage', sector: 'manufacturing', description: 'Insulated 5 tonne cold room with inverter compressor for farm produce.', brandOption: 'unite_powertek',
    powerFree: true, powerOffer: '5 kW rooftop solar with every cold room, so the farmer pays nothing for running power.', certifications: ['BIS'], monthlyCapacity: 40, unit: 'units', mrp: 450000_00 };

  let productId: string;
  it('members draft OEM products; validation, roles and KYB are enforced', async () => {
    await post('/club/products', t.ravi, { ...coldRoom, powerOffer: '' }).expect(400); // free power needs a described offer
    await post('/club/products', t.ravi, { ...coldRoom, brandOption: 'own_label' }).expect(400);
    await post('/club/products', t.rohit, coldRoom).expect(403); // members (not owner/admin) cannot submit for the business
    const p = (await post('/club/products', t.ravi, coldRoom).expect(201)).body;
    expect(p.status).toBe('draft'); expect(p.code).toMatch(/^ICP-\d{4}-\d{6}$/);
    productId = p.id;
    // An unverified business can draft but not submit for the brand.
    const g = (await post('/club/products', t.vikram, { ...coldRoom, name: 'Precast wall panel' }).expect(201)).body;
    await post(`/club/products/${g.id}/submit`, t.vikram).expect(403);
    // Others never see a member's products.
    expect((await get('/club/products', t.asha).expect(200)).body.items).toHaveLength(0);
    await post(`/club/products/${productId}/submit`, t.asha).expect(404);
  });

  it('only Unite staff review; approval needs every check including the signed licence, and lists it in the Powertek catalogue', async () => {
    await post(`/club/products/${productId}/submit`, t.ravi).expect(201);
    await post(`/club/products/${productId}/submit`, t.ravi).expect(409);
    await post(`/admin/club/products/${productId}/review`, t.ravi, { decision: 'approve', checks: ALL_CHECKS }).expect(403);
    await post(`/admin/club/products/${productId}/review`, t.uniteAdmin, { decision: 'approve', checks: ALL_CHECKS.slice(0, 3) }).expect(400);
    const queue = (await get('/admin/club/products?status=submitted', t.uniteAdmin).expect(200)).body.items;
    expect(queue.map((x: { id: string }) => x.id)).toContain(productId);
    const ok = (await post(`/admin/club/products/${productId}/review`, t.uniteAdmin, { decision: 'approve', checks: ALL_CHECKS }).expect(201)).body;
    expect(ok.status).toBe('approved'); expect(ok.catalogItemId).toBeTruthy();
    // Now sellable by every partner through the Powertek catalogue — another business finds it there.
    const cat = (await get('/product-sales/powertek/catalogue?q=Cold%20Room', t.asha).expect(200)).body;
    const item = cat.items.find((i: { id: string }) => i.id === ok.catalogItemId);
    expect(item.name).toBe('Unite Powertek Solar Cold Room 5 MT');
    expect(item.productLine).toBe('Unite Industry Club');
    const row = (await pool.query('select specs from catalog_items where id = $1', [ok.catalogItemId])).rows[0];
    expect(row.specs['Free power option']).toMatch(/5 kW rooftop/);
    expect(JSON.stringify(row.specs)).not.toMatch(/Sunrise/); // the brand is shown, not the maker
    await post(`/admin/club/products/${productId}/review`, t.uniteAdmin, { decision: 'reject', note: 'again' }).expect(409);
    const a = await pool.query("select action from audit_events where action like 'club.product_%' order by seq");
    expect(a.rows.map((r) => r.action)).toEqual(expect.arrayContaining(['club.product_created', 'club.product_submitted', 'club.product_approved']));
  });

  it('rejection needs a reason; withdrawing an approved product takes it out of the catalogue', async () => {
    const p = (await post('/club/products', t.ravi, { ...coldRoom, name: 'Solar water pump 3 HP', category: 'Pumps', powerFree: false }).expect(201)).body;
    await post(`/club/products/${p.id}/submit`, t.ravi).expect(201);
    await post(`/admin/club/products/${p.id}/review`, t.uniteAdmin, { decision: 'reject' }).expect(400);
    expect((await post(`/admin/club/products/${p.id}/review`, t.uniteAdmin, { decision: 'reject', note: 'Send the BIS certificate for the motor.' }).expect(201)).body.status).toBe('rejected');
    const w = (await post(`/club/products/${productId}/withdraw`, t.ravi).expect(201)).body;
    expect(w.status).toBe('withdrawn');
    expect((await pool.query('select status from catalog_items where id = $1', [w.catalogItemId])).rows[0].status).toBe('archived');
  });

  it('members ask to buy power; the energy desk updates it and the member is told', async () => {
    await post('/club/power-requests', t.ravi, { need: 'open_access', state: 'Telangana', city: 'Hyderabad' }).expect(400); // no consumption given
    const r = (await post('/club/power-requests', t.ravi, { need: 'open_access', state: 'Telangana', city: 'Hyderabad', monthlyUnits: 180000, sanctionedLoadKw: 900 }).expect(201)).body;
    expect(r.code).toMatch(/^PWR-/);
    await post(`/admin/club/power-requests/${r.id}/status`, t.ravi, { to: 'in_progress' }).expect(403);
    await post(`/admin/club/power-requests/${r.id}/status`, t.uniteAdmin, { to: 'proposal_sent', note: 'Proposal from a 50 MW solar plant in Mahbubnagar sent by email.' }).expect(201);
    const mine = (await get('/club/power-requests', t.ravi).expect(200)).body.items;
    expect(mine[0].statusLabel).toBe('Proposal sent');
    expect((await get('/club/power-requests', t.asha).expect(200)).body.items).toHaveLength(0);
  });

  it('member pages are public only when switched on, and show only approved products', async () => {
    await api(app).put('/v1/join/profile').set(auth(t.ravi)).send({ sector: 'manufacturing', intents: ['solar_products', 'buy_power'], city: 'Hyderabad' }).expect(200);
    const slug = (await pool.query("select slug from collab_join_profiles j join organizations o on o.id = j.org_id where o.display_name = 'Sunrise Traders'")).rows[0].slug;
    await get(`/public/club/members/${slug}`).expect(404);
    // Re-approve a product so the page has something to show
    const p = (await post('/club/products', t.ravi, { ...coldRoom, name: 'Solar dryer' }).expect(201)).body;
    await post(`/club/products/${p.id}/submit`, t.ravi).expect(201);
    await post(`/admin/club/products/${p.id}/review`, t.uniteAdmin, { decision: 'approve', checks: ALL_CHECKS }).expect(201);
    await api(app).put('/v1/join/profile').set(auth(t.ravi)).send({ sector: 'manufacturing', intents: ['solar_products', 'buy_power'], city: 'Hyderabad', micrositePublic: true }).expect(200);
    const page = (await get(`/public/club/members/${slug}`).expect(200)).body;
    expect(page.name).toBe('Sunrise Traders');
    expect(page.products.map((x: { name: string }) => x.name)).toEqual(['Solar dryer']); // withdrawn and rejected ones stay off
    const pub = (await get('/public/club/products').expect(200)).body.items;
    expect(pub.map((x: { name: string }) => x.name)).toContain('Unite Powertek Solar dryer');
    // The board shows the club cards with the member's own numbers
    const b = (await get('/join/board', t.ravi).expect(200)).body;
    expect(b.club).toMatchObject({ approved: 1 });
    const oem = b.cards.find((c: { code: string }) => c.code === 'solar_products');
    expect(oem.stats[0]).toMatchObject({ label: 'Your products approved for the Unite brand', value: 1 });
    const power = b.cards.find((c: { code: string }) => c.code === 'buy_power');
    expect(power.stats[1]).toMatchObject({ value: 1 });
  });
});
