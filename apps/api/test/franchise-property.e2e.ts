import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('Franchise Management and Real Estate', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const month = (off = 0) => { const d = new Date(); d.setMonth(d.getMonth() + off); return d.toISOString().slice(0, 7); };

  describe('franchise', () => {
    let unitId: string;
    it('verified partner owners apply to open brands only, once per brand and city', async () => {
      const brands = (await api(app).get('/v1/franchise/brands').set(auth(t.ravi)).expect(200)).body;
      const solar = brands.find((b: any) => b.name === 'Unite Solar');
      expect(brands.map((b: any) => b.name)).toEqual(['Unite Solar']);
      const body = { brandOrgId: solar.id, format: 'store', city: 'Vadodara', region: 'IN-GJ', message: 'Showroom on the main road with parking and a team of six installers.' };
      await api(app).post('/v1/franchise/applications').set(auth(t.vikram)).send(body).expect(403); // not verified
      await api(app).post('/v1/franchise/applications').set(auth(t.rohit)).send(body).expect(403); // not an owner/admin
      const r = await api(app).post('/v1/franchise/applications').set(auth(t.ravi)).send(body).expect(201);
      unitId = r.body.id;
      expect(r.body).toMatchObject({ status: 'applied', city: 'Vadodara', brand: 'Unite Solar' });
      await api(app).post('/v1/franchise/applications').set(auth(t.ravi)).send({ ...body, city: 'vadodara' }).expect(409);
      const powertek = (await one("select organization_id id from group_companies g join organizations o on o.id = g.organization_id where o.display_name = 'Powertek'")).id;
      await api(app).post('/v1/franchise/applications').set(auth(t.ravi)).send({ ...body, brandOrgId: powertek }).expect(409); // not franchising
    });

    it('Unite moves an application to live only through the steps, with fee and royalty, and a finished checklist', async () => {
      await api(app).post(`/v1/admin/franchise/${unitId}/status`).set(auth(t.asha)).send({ status: 'approved' }).expect(403);
      await api(app).post(`/v1/admin/franchise/${unitId}/status`).set(auth(t.uniteAdmin)).send({ status: 'approved' }).expect(400); // fee and royalty needed
      await api(app).post(`/v1/admin/franchise/${unitId}/status`).set(auth(t.uniteAdmin)).send({ status: 'live' }).expect(409); // cannot skip steps
      await api(app).post(`/v1/admin/franchise/${unitId}/status`).set(auth(t.uniteAdmin)).send({ status: 'approved', fee: 3_00_000_00, royaltyBps: 250, monthlyTarget: 10_00_000_00 }).expect(200);
      await api(app).post(`/v1/admin/franchise/${unitId}/status`).set(auth(t.uniteAdmin)).send({ status: 'agreement_signed' }).expect(200);
      await api(app).post(`/v1/admin/franchise/${unitId}/status`).set(auth(t.uniteAdmin)).send({ status: 'setup' }).expect(200);
      const blocked = await api(app).post(`/v1/admin/franchise/${unitId}/status`).set(auth(t.uniteAdmin)).send({ status: 'live' }).expect(409);
      expect(blocked.body.message).toMatch(/Finish the setup checklist first: Site selected/);
      for (const key of ['site', 'agreement', 'fee', 'training', 'branding', 'stock', 'launch']) await api(app).post(`/v1/admin/franchise/${unitId}/checklist`).set(auth(t.uniteAdmin)).send({ key, done: true }).expect(200);
      const live = await api(app).post(`/v1/admin/franchise/${unitId}/status`).set(auth(t.uniteAdmin)).send({ status: 'live', note: 'Opened with a launch event' }).expect(200);
      expect(live.body).toMatchObject({ status: 'live', royaltyBps: 250 });
      expect(live.body.openedAt).toBeTruthy();
      expect((await one("select count(*)::int n from notifications n join users u on u.id = n.user_id where u.email = 'ravi@sunrise.example' and n.link = '/franchise'")).n).toBeGreaterThanOrEqual(4);
    });

    it('live franchisees report each month once; royalty follows the agreed rate; others never see the unit', async () => {
      const r = await api(app).post(`/v1/franchise/${unitId}/reports`).set(auth(t.ravi)).send({ month: month(), sales: 12_00_000_00, orders: 9 }).expect(201);
      expect(r.body).toMatchObject({ sales: 12_00_000_00, royalty: 3_00_000_0 }); // 2.5 % of ₹12 lakh = ₹30,000
      await api(app).post(`/v1/franchise/${unitId}/reports`).set(auth(t.ravi)).send({ month: month(), sales: 1, orders: 1 }).expect(409);
      await api(app).post(`/v1/franchise/${unitId}/reports`).set(auth(t.ravi)).send({ month: month(1), sales: 1, orders: 1 }).expect(400);
      await api(app).post(`/v1/franchise/${unitId}/reports`).set(auth(t.asha)).send({ month: month(-1), sales: 1, orders: 1 }).expect(404); // not their unit
      const mine = (await api(app).get('/v1/franchise/mine').set(auth(t.asha)).expect(200)).body;
      expect(mine.map((u: any) => u.city)).toEqual(['Pune']); // only Volt's own
      const setup = (await api(app).get('/v1/franchise/mine').set(auth(t.ravi)).expect(200)).body.find((u: any) => u.city === 'Ahmedabad');
      await api(app).post(`/v1/franchise/${setup.id}/reports`).set(auth(t.ravi)).send({ month: month(-1), sales: 1, orders: 1 }).expect(409); // not live yet
      const net = (await api(app).get('/v1/admin/franchise').set(auth(t.uniteAdmin)).expect(200)).body;
      expect(net.totals.live).toBe(2);
      expect(net.totals.salesThisMonth).toBeGreaterThanOrEqual(12_00_000_00);
      await api(app).get('/v1/admin/franchise').set(auth(t.ravi)).expect(403);
    });
  });

  describe('real estate', () => {
    const park = async () => (await api(app).get('/v1/property/projects').set(auth(t.ravi)).expect(200)).body.find((p: any) => p.kind === 'industrial_park');
    it('partners see open projects; RERA projects cannot open without a number, and holds need the agent’s RERA number', async () => {
      const list = (await api(app).get('/v1/property/projects').set(auth(t.ravi)).expect(200)).body;
      expect(list.map((p: any) => p.kind).sort()).toEqual(['industrial_park', 'residential']);
      const owner = (await api(app).get('/v1/admin/property').set(auth(t.uniteAdmin)).expect(200)).body.owners[0].id;
      const p = await api(app).post('/v1/admin/property/projects').set(auth(t.uniteAdmin)).send({ ownerOrgId: owner, name: 'Test Towers', kind: 'residential', city: 'Pune', region: 'IN-MH', description: 'Residential tower used to test the RERA rule for partner marketing.' }).expect(201);
      const refused = await api(app).patch(`/v1/admin/property/projects/${p.body.id}`).set(auth(t.uniteAdmin)).send({ openToPartners: true }).expect(409);
      expect(refused.body.message).toMatch(/RERA/);
      await api(app).patch(`/v1/admin/property/projects/${p.body.id}`).set(auth(t.uniteAdmin)).send({ openToPartners: true, reraNumber: 'P52100099999' }).expect(200);
      const homes = list.find((x: any) => x.kind === 'residential');
      const detail = (await api(app).get(`/v1/property/projects/${homes.id}`).set(auth(t.ravi)).expect(200)).body;
      const flat = detail.units.find((u: any) => u.status === 'available');
      const hold = { buyerName: 'K. Joshi', buyerCity: 'Hyderabad', consentMethod: 'written_email', consent: true };
      const noRera = await api(app).post(`/v1/property/units/${flat.id}/hold`).set(auth(t.ravi)).send(hold).expect(400);
      expect(noRera.body.issues[0].path).toBe('agentRera');
      await api(app).post(`/v1/property/units/${flat.id}/hold`).set(auth(t.vikram)).send({ ...hold, agentRera: 'A1' }).expect(403); // unverified
      await api(app).post(`/v1/property/units/${flat.id}/hold`).set(auth(t.ravi)).send({ ...hold, agentRera: 'A02500012345' }).expect(200);
      await api(app).post(`/v1/property/units/${flat.id}/hold`).set(auth(t.meera)).send({ ...hold, agentRera: 'A0' }).expect(409); // already held
      const seenByOther = (await api(app).get(`/v1/property/projects/${homes.id}`).set(auth(t.meera)).expect(200)).body.units.find((u: any) => u.id === flat.id);
      expect(seenByOther).toMatchObject({ status: 'held', mine: false, buyerName: null }); // other partners never see the buyer
    });

    it('industrial plots: 5 holds per partner per project; release; expired holds free up automatically', async () => {
      const p = await park();
      const units = (await api(app).get(`/v1/property/projects/${p.id}`).set(auth(t.meera)).expect(200)).body.units.filter((u: any) => u.status === 'available');
      const hold = { buyerName: 'Buyer', buyerCity: 'Kurnool', consentMethod: 'meeting_minutes', consent: true };
      for (const u of units.slice(0, 5)) await api(app).post(`/v1/property/units/${u.id}/hold`).set(auth(t.meera)).send(hold).expect(200);
      await api(app).post(`/v1/property/units/${units[5].id}/hold`).set(auth(t.meera)).send(hold).expect(409);
      await api(app).post(`/v1/property/units/${units[0].id}/release`).set(auth(t.ravi)).expect(404); // not theirs
      await api(app).post(`/v1/property/units/${units[0].id}/release`).set(auth(t.meera)).expect(200);
      await pool.query("update property_units set held_until = now() - interval '1 hour' where id = $1", [units[1].id]);
      const after = (await api(app).get(`/v1/property/projects/${p.id}`).set(auth(t.ravi)).expect(200)).body.units.find((u: any) => u.id === units[1].id);
      expect(after.status).toBe('available');
      const holds = (await api(app).get('/v1/property/holds').set(auth(t.meera)).expect(200)).body;
      expect(holds).toHaveLength(3);
      expect(holds[0].commission).toBe(Math.round((holds[0].price * p.commissionBps) / 10000));
    });

    it('Unite books and sells units; a sale keeps the partner; sold units cannot be undone; blocked units are hidden', async () => {
      const p = await park();
      const mine = (await api(app).get('/v1/property/holds').set(auth(t.meera)).expect(200)).body[0];
      await api(app).post(`/v1/admin/property/units/${mine.id}/status`).set(auth(t.meera)).send({ status: 'sold' }).expect(403);
      await api(app).post(`/v1/admin/property/units/${mine.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'booked' }).expect(200);
      await api(app).post(`/v1/admin/property/units/${mine.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'sold' }).expect(200);
      expect((await api(app).get('/v1/property/holds').set(auth(t.meera)).expect(200)).body.find((h: any) => h.id === mine.id)).toMatchObject({ status: 'sold', buyerName: 'Buyer' });
      await api(app).post(`/v1/admin/property/units/${mine.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'available' }).expect(409);
      const free = (await api(app).get(`/v1/property/projects/${p.id}`).set(auth(t.ravi)).expect(200)).body.units.find((u: any) => u.status === 'available');
      await api(app).post(`/v1/admin/property/units/${free.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'blocked' }).expect(200);
      expect((await api(app).get(`/v1/property/projects/${p.id}`).set(auth(t.ravi)).expect(200)).body.units.some((u: any) => u.id === free.id)).toBe(false);
      const add = await api(app).post(`/v1/admin/property/projects/${p.id}/units`).set(auth(t.uniteAdmin)).send({ units: [{ unitNo: 'P-01', unitType: 'plot', areaSqft: 1, price: 1 }, { unitNo: 'P-99', unitType: 'shed', areaSqft: 9000, price: 1_30_00_000_00 }] }).expect(200);
      expect(add.body).toEqual({ added: 1, skipped: 1 });
      expect((await one("select count(*)::int n from audit_events where action like 'property.%'")).n).toBeGreaterThan(5);
    });
  });
});
