/** Unite brand products: matching agent, channel applications, Unite review, dealer dashboard and product-tagged CRM. */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('Unite brand products and channel partners', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const get = (p: string, tok?: string) => (tok ? api(app).get(`/v1${p}`).set(auth(tok)) : api(app).get(`/v1${p}`));
  const post = (p: string, b: object, tok?: string) => (tok ? api(app).post(`/v1${p}`).set(auth(tok)).send(b) : api(app).post(`/v1${p}`).send(b));
  const apply = { productSlug: 'unite-cement', role: 'distributor', businessType: 'building_materials_dealer', name: 'Asha Patil', email: 'asha@voltepc.example', phone: '9820011111', company: 'Volt EPC', state: 'Maharashtra', city: 'Pune', warehouseSqft: 6000, consent: true };

  it('five Unite brand products have microsites; the OEM partner is private until a super admin makes it public', async () => {
    const list = (await get('/public/brand-products').expect(200)).body.items;
    expect(list.map((x: { slug: string }) => x.slug)).toEqual(['unite-cement', 'unite-steel', 'unite-ply', 'unite-carpets', 'unite-furniture']);
    for (const s of list) expect(s.oem.partner).toBeNull();
    const p = (await get('/public/products/unite-cement').expect(200)).body;
    expect(p.channel).toBe(true); expect(p.oem).toEqual({ status: 'Being finalised', partner: null });
    expect(JSON.stringify(p)).not.toContain('CCI');
    await post('/admin/brand-products/oem/unite-cement', { oemPublic: true }, t.uniteAdmin).expect(403);
    await post('/admin/brand-products/oem/unite-cement', { oemStatus: 'agreement_signed' }, t.uniteAdmin).expect(200);
    await post('/admin/brand-products/oem/unite-cement', { oemPublic: true }, t.superadmin).expect(200);
    expect((await get('/public/products/unite-cement').expect(200)).body.oem).toEqual({ status: 'Agreement signed', partner: 'CCI' });
  });

  it('the matching agent recommends products and roles with reasons', async () => {
    const r = (await post('/public/brand-products/match', { businessType: 'furniture_store', showroomSqft: 1500 }).expect(200)).body;
    expect(r.engine).toBe('rules');
    expect(r.items[0]).toMatchObject({ slug: 'unite-furniture', role: 'store' });
    expect(r.items[0].reasons.length).toBeGreaterThan(0);
    await post('/public/brand-products/match', { businessType: 'astronaut' }).expect(400);
  });

  let appId: string;
  it('anyone applies; duplicates are refused; the agent’s reasons are kept with the application', async () => {
    await post('/public/brand-products/applications', { ...apply, role: 'manufacturer', capacity: 'Big plant' }).expect(400); // cement OEM is not open
    const r = (await post('/public/brand-products/applications', apply).expect(201)).body;
    expect(r.code).toMatch(/^CHN-\d{4}-\d{6}$/);
    expect(r.alsoFits.map((x: { slug: string }) => x.slug)).toContain('unite-steel');
    await post('/public/brand-products/applications', apply).expect(409);
    const row = (await pool.query('select id, match, org_id from channel_applications where code = $1', [r.code])).rows[0];
    expect(row.match.reasons.join(' ')).toMatch(/6,000 sq ft/); expect(row.org_id).toBeNull();
    appId = row.id;
  });

  it('approval needs a linked business account and a territory; the dashboard links by email', async () => {
    await post(`/admin/brand-products/applications/${appId}/decide`, { decision: 'approve', territory: 'Pune district' }, t.asha).expect(403);
    await post(`/admin/brand-products/applications/${appId}/decide`, { decision: 'approve', territory: 'Pune district' }, t.uniteAdmin).expect(409); // not linked yet
    const d0 = (await get('/brand-products/dashboard', t.asha).expect(200)).body; // links the application to Volt EPC
    expect(d0.applications[0].statusLabel).toBe('Received'); expect(d0.channels).toEqual([]);
    await post(`/admin/brand-products/applications/${appId}/decide`, { decision: 'approve' }, t.uniteAdmin).expect(400); // territory needed
    const ok = (await post(`/admin/brand-products/applications/${appId}/decide`, { decision: 'approve', territory: 'Pune district' }, t.uniteAdmin).expect(200)).body;
    expect(ok.status).toBe('approved');
    await post(`/admin/brand-products/applications/${appId}/decide`, { decision: 'decline', note: 'again' }, t.uniteAdmin).expect(409);
  });

  it('approved dealers add leads into their own CRM, tagged with the product; others cannot', async () => {
    await post('/brand-products/leads', { productSlug: 'unite-steel', customer: 'Sai Builders', title: '40 t TMT for a G+4 site' }, t.asha).expect(403); // not approved for steel
    await post('/brand-products/leads', { productSlug: 'unite-cement', customer: 'Sai Builders', title: '600 bags for a G+4 site' }, t.ravi).expect(403);
    const d = (await post('/brand-products/leads', { productSlug: 'unite-cement', customer: 'Sai Builders', contactName: 'Sai Kumar', phone: '9876500000', city: 'Pune', title: '600 bags for a G+4 site', value: 2_40_000_00 }, t.asha).expect(201)).body;
    const v = (await pool.query("select id from unite_ventures where slug = 'unite-cement'")).rows[0].id;
    expect(d.ventureId).toBe(v); expect(d.stage).toBe('new');
    const dash = (await get('/brand-products/dashboard', t.asha).expect(200)).body;
    expect(dash.channels[0]).toMatchObject({ slug: 'unite-cement', role: 'distributor', territory: 'Pune district' });
    expect(dash.channels[0].pipeline.find((x: { stage: string }) => x.stage === 'new')).toEqual({ stage: 'new', count: 1, value: 2_40_000_00 });
    expect(dash.recommendations.map((x: { slug: string }) => x.slug)).toContain('unite-steel');
    // The lead is an ordinary CRM deal: it moves through the pipeline in COLLABIZ CRM
    await api(app).post(`/v1/crm/deals/${d.id}/move`).set(auth(t.asha)).send({ stage: 'contacted' }).expect(200);
    expect((await get('/brand-products/dashboard', t.asha).expect(200)).body.channels[0].pipeline.find((x: { stage: string }) => x.stage === 'contacted').count).toBe(1);
    expect((await get('/brand-products/dashboard', t.ravi).expect(200)).body.channels).toEqual([]);
    const a = await pool.query("select action from audit_events where action like 'brand_channel.%' order by seq");
    expect(a.rows.map((x) => x.action)).toEqual(expect.arrayContaining(['brand_channel.application_approved', 'brand_channel.lead_added', 'brand_channel.oem_updated']));
  });
});
