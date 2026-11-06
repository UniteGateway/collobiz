import type { INestApplication } from '@nestjs/common';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import type { SeedRefs } from '../src/db/seed';

describe('Stage 04 — Unite company catalogue (gate: controlled public/private catalogs)', () => {
  let app: INestApplication;
  let refs: SeedRefs;
  let t: Awaited<ReturnType<typeof loginAll>>;
  beforeAll(async () => { await resetDatabase(); refs = await seed(); app = await bootApp(); t = await loginAll(app); });
  afterAll(() => app?.close());
  const byName = (rows: any[], n: string) => rows.find((r) => r.name.startsWith(n));

  it('004 lists active group companies with legal entity separate from brand', async () => {
    const r = await api(app).get('/v1/public/group-companies').expect(200);
    expect(r.body.map((g: any) => g.brandName)).toEqual(['Powertek', 'Unite Exim', 'Unite Solar']);
    expect(r.body[0].legalEntityCode).toMatch(/PLACEHOLDER/);
    expect(r.body[0].legalName).not.toBe(r.body[0].brandName);
  });

  it('anonymous visitors see only public, published items and only public prices', async () => {
    const r = await api(app).get('/v1/catalog').expect(200);
    expect(r.body.every((i: any) => i.visibility === 'public' && i.status === 'published')).toBe(true);
    expect(byName(r.body, 'Solar O&M')).toBeUndefined(); // partners-only
    expect(byName(r.body, 'Internal pricing')).toBeUndefined(); // private draft
    expect(byName(r.body, 'Rooftop Solar EPC').listPrice).toBe(42000_00); // public price
    expect(byName(r.body, 'Mono PERC').listPrice).toBeNull(); // verified-partner price hidden
    expect(byName(r.body, 'Mono PERC').priceNote).toBe('Visible to verified partners');
  });

  it('verified partners see partner items and verified prices, but not certified-only prices', async () => {
    const r = await api(app).get('/v1/catalog').set(auth(t.asha)).expect(200); // Volt: verified, level verified
    expect(byName(r.body, 'Mono PERC').listPrice).toBe(13500_00);
    expect(byName(r.body, 'Solar O&M').listPrice).toBeNull();
    expect(byName(r.body, 'Solar O&M').priceNote).toMatch(/certified/);
    expect(byName(r.body, 'Internal pricing')).toBeUndefined();
  });

  it('certified partners see certified prices; on-request prices stay hidden', async () => {
    const r = await api(app).get('/v1/catalog').set(auth(t.ravi)).expect(200); // Sunrise: certified
    expect(byName(r.body, 'Solar O&M').listPrice).toBe(600_00);
    expect(byName(r.body, 'LT Switchgear').listPrice).toBeNull();
    expect(byName(r.body, 'LT Switchgear').priceNote).toBe('Price on request');
  });

  it('unverified partners see partner items but no restricted prices', async () => {
    const r = await api(app).get('/v1/catalog').set(auth(t.vikram)).expect(200); // GreenBuild: submitted
    expect(byName(r.body, 'Solar O&M')).toBeDefined();
    expect(byName(r.body, 'Mono PERC').listPrice).toBeNull();
  });

  it('039 detail returns 404 for items the viewer may not see (no existence leak)', async () => {
    const all = await api(app).get('/v1/admin/catalog').set(auth(t.superadmin)).expect(200);
    const priv = byName(all.body, 'Internal pricing');
    const om = byName(all.body, 'Solar O&M');
    await api(app).get(`/v1/catalog/${priv.id}`).set(auth(t.asha)).expect(404);
    await api(app).get(`/v1/catalog/${om.id}`).expect(404);
    const d = await api(app).get(`/v1/catalog/${om.id}`).set(auth(t.ravi)).expect(200);
    expect(d.body.related).toBeInstanceOf(Array);
  });

  it('search uses full-text and filters', async () => {
    const r = await api(app).get('/v1/catalog?q=transformer').expect(200);
    expect(r.body[0].name).toMatch(/Transformer/);
    const s = await api(app).get('/v1/catalog?sector=trading').expect(200);
    expect(s.body.every((i: any) => i.sector === 'trading')).toBe(true);
  });

  it('price requests need a partner account', async () => {
    const r = await api(app).get('/v1/catalog?q=switchgear').expect(200);
    await api(app).post(`/v1/catalog/${r.body[0].id}/price-request`).set(auth(t.asha)).send({ quantity: '4 panels' }).expect(201);
    await api(app).post(`/v1/catalog/${r.body[0].id}/price-request`).send({ quantity: '4' }).expect(401);
  });

  describe('136 catalogue management & 128 group companies', () => {
    it('unite admin manages only their own group company items', async () => {
      const mine = await api(app).get('/v1/admin/catalog').set(auth(t.uniteAdmin)).expect(200);
      expect(mine.body.every((i: any) => i.ownerOrgId === refs.orgs.uniteSolar)).toBe(true);
      await api(app).post('/v1/admin/catalog').set(auth(t.uniteAdmin)).send({ ownerOrgId: refs.orgs.powertek, kind: 'product', name: 'Not mine', sector: 'power_equipment', description: 'Should be refused for unite solar admin', priceVisibility: 'on_request', visibility: 'public' }).expect(403);
      const c = await api(app).post('/v1/admin/catalog').set(auth(t.uniteAdmin)).send({ ownerOrgId: refs.orgs.uniteSolar, kind: 'product', name: 'Solar Inverter 100 kW', sector: 'solar', description: 'Three-phase string inverter for C&I plants.', listPrice: 350000_00, priceVisibility: 'verified_partners', visibility: 'public' }).expect(201);
      expect(c.body.status).toBe('draft');
      let pub = await api(app).get('/v1/catalog?q=inverter').expect(200);
      expect(pub.body).toHaveLength(0); // drafts are not public
      await api(app).patch(`/v1/admin/catalog/${c.body.id}`).set(auth(t.uniteAdmin)).send({ status: 'published' }).expect(200);
      pub = await api(app).get('/v1/catalog?q=inverter').expect(200);
      expect(pub.body).toHaveLength(1);
      const a = await api(app).get(`/v1/admin/audit?objectId=${c.body.id}`).set(auth(t.compliance)).expect(200);
      expect(a.body.map((e: any) => e.action)).toEqual(expect.arrayContaining(['catalog.item_created', 'catalog.item_published']));
    });
    it('requires a price unless on request; partners cannot use admin endpoints', async () => {
      await api(app).post('/v1/admin/catalog').set(auth(t.uniteAdmin)).send({ ownerOrgId: refs.orgs.uniteSolar, kind: 'product', name: 'No price', sector: 'solar', description: 'Missing price should fail', priceVisibility: 'public', visibility: 'public' }).expect(400);
      await api(app).get('/v1/admin/catalog').set(auth(t.asha)).expect(403);
    });
    it('super admin creates a group company and business unit; unite admin cannot', async () => {
      const body = { legalName: 'Unite Infra Projects (placeholder)', legalEntityCode: 'UG-INFRA-TEST', brandName: 'Unite Infra', sectors: ['infrastructure'], country: 'IN' };
      await api(app).post('/v1/admin/group-companies').set(auth(t.uniteAdmin)).send(body).expect(403);
      const r = await api(app).post('/v1/admin/group-companies').set(auth(t.superadmin)).send(body).expect(201);
      await api(app).post(`/v1/admin/group-companies/${r.body.id}/units`).set(auth(t.superadmin)).send({ name: 'Roads & Highways', sectors: ['infrastructure'] }).expect(201);
      await api(app).post('/v1/admin/group-companies').set(auth(t.superadmin)).send(body).expect(409); // duplicate legal entity code
      const list = await api(app).get('/v1/public/group-companies').expect(200);
      expect(list.body.map((g: any) => g.brandName)).toContain('Unite Infra');
    });
  });

  it('008 publishes only consented success stories', async () => {
    const r = await api(app).get('/v1/public/success-stories').expect(200);
    expect(r.body.length).toBe(2);
    await api(app).post('/v1/admin/success-stories').set(auth(t.superadmin)).send({ title: 'Unconsented story', sector: 'solar', summary: 'A summary that is long enough to pass.', body: 'x'.repeat(60), partnerConsent: false, publish: true }).expect(400);
  });
});
