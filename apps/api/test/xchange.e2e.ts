import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('COLLABIZ XCHANGE and COLLABIZ ONE', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => {
    await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('delete from xchange_approvals; delete from xchange_legs; delete from xchange_deals; delete from xchange_listings;'); // tests build their own market
  });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const org = async (name: string) => (await one('select id from organizations where display_name = $1', [name])).id as string;
  const L = (side: string, category: string, title: string, value: number, accepts = ['barter', 'part_cash']) => ({ side, category, title, description: `${title} — sample listing for the exchange tests.`, value, valueBasis: 'price_list', region: 'IN-MH', accepts });

  let volt: string, sunrise: string, deccan: string, meera: string; let voltOffer: string;
  it('only verified businesses list; only owners/admins; listings appear in the market', async () => {
    [volt, sunrise, deccan, meera] = await Promise.all(['Volt EPC', 'Sunrise Traders', 'Deccan Distributors', 'Meera Iyer Consulting'].map(org));
    await api(app).post('/v1/xchange/listings').set(auth(t.vikram)).send(L('offer', 'advertising', 'Billboards', 1_00_000_00)).expect(403);
    await api(app).post('/v1/xchange/listings').set(auth(t.rohit)).send(L('offer', 'solar_equipment', 'Panels', 5_00_000_00)).expect(403);
    await api(app).post('/v1/xchange/listings').set(auth(t.asha)).send({ ...L('offer', 'solar_equipment', 'x', 1), title: 'x' }).expect(400);
    voltOffer = (await api(app).post('/v1/xchange/listings').set(auth(t.asha)).send(L('offer', 'solar_equipment', '540 Wp solar panels, 200 nos', 5_00_000_00)).expect(201)).body.id;
    await api(app).post('/v1/xchange/listings').set(auth(t.asha)).send(L('need', 'construction_services', 'Civil works for a rooftop structure', 5_00_000_00)).expect(201);
    await api(app).post('/v1/xchange/listings').set(auth(t.ravi)).send(L('offer', 'construction_services', 'Civil crew, 4 weeks', 5_10_000_00)).expect(201);
    await api(app).post('/v1/xchange/listings').set(auth(t.ravi)).send(L('need', 'advertising', 'Outdoor advertising in Gujarat', 5_00_000_00)).expect(201);
    await api(app).post('/v1/xchange/listings').set(auth(t.deepak)).send(L('offer', 'advertising', 'Hoardings and radio package', 4_95_000_00)).expect(201);
    await api(app).post('/v1/xchange/listings').set(auth(t.deepak)).send(L('need', 'solar_equipment', 'Solar for our warehouse', 5_00_000_00)).expect(201);
    await api(app).post('/v1/xchange/listings').set(auth(t.meera)).send(L('offer', 'warehouse_space', '2,000 sq ft warehouse, 3 months', 6_00_000_00)).expect(201);
    const m = (await api(app).get('/v1/xchange').set(auth(t.ravi)).expect(200)).body;
    expect(m.listings.length).toBe(7);
    expect(m.mine).toHaveLength(2);
    expect(m.canTrade).toBe(true);
  });

  it('matching finds the three-way exchange no pair could do alone', async () => {
    const r = (await api(app).get('/v1/xchange/matches').set(auth(t.asha)).expect(200)).body;
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0]).toMatchObject({ kind: 'multi', parties: ['Volt EPC', 'Deccan Distributors', 'Sunrise Traders'] });
    await api(app).get('/v1/xchange/matches').set(auth(t.vikram)).expect(403);
  });

  let dealId: string; let legs: any[];
  it('a proposed exchange must balance, include the proposer, and be approved by every party on the same terms', async () => {
    const body = { note: 'Three-way: panels → Deccan, ads → Sunrise, civil → Volt', legs: [
      { fromOrgId: volt, toOrgId: deccan, listingId: voltOffer, description: '200 × 540 Wp panels', value: 5_00_000_00, cash: 0 },
      { fromOrgId: deccan, toOrgId: sunrise, description: 'Hoardings + radio, 6 weeks', value: 4_95_000_00, cash: 0 },
      { fromOrgId: sunrise, toOrgId: volt, description: 'Civil crew, 4 weeks', value: 5_00_000_00, cash: 0 },
    ] };
    await api(app).post('/v1/xchange/deals').set(auth(t.meera)).send(body).expect(400); // not a party
    const unbalanced = await api(app).post('/v1/xchange/deals').set(auth(t.asha)).send({ ...body, legs: [body.legs[0], body.legs[1], { ...body.legs[2], value: 3_00_000_00 }] }).expect(400);
    expect(unbalanced.body.message).toMatch(/does not balance/);
    const d = (await api(app).post('/v1/xchange/deals').set(auth(t.asha)).send(body).expect(201)).body;
    dealId = d.id; legs = d.legs;
    expect(d).toMatchObject({ kind: 'multi', status: 'proposed', balanced: true });
    expect(d.parties.find((p: any) => p.name === 'Volt EPC').approved).toBe(true);
    expect(d.legs[0].invoice).toMatchObject({ supplier: 'Volt EPC', recipient: 'Deccan Distributors', taxableValue: 5_00_000_00, nonCashConsideration: 5_00_000_00 });
    expect(d.taxNote).toMatch(/rule 27/);
    await api(app).get(`/v1/xchange/deals/${dealId}`).set(auth(t.meera)).expect(404);
    await api(app).post(`/v1/xchange/legs/${legs[0].id}/deliver`).set(auth(t.asha)).send({ note: 'Dispatched by LR 1234' }).expect(409); // not agreed yet
    await api(app).post(`/v1/xchange/deals/${dealId}/approve`).set(auth(t.ravi)).expect(200);
    const agreed = (await api(app).post(`/v1/xchange/deals/${dealId}/approve`).set(auth(t.deepak)).expect(200)).body;
    expect(agreed.status).toBe('agreed');
    await api(app).post(`/v1/xchange/deals/${dealId}/cancel`).set(auth(t.asha)).expect(409);
  });

  it('suppliers deliver, receivers accept or dispute; all accepted completes it and closes the listings', async () => {
    await api(app).post(`/v1/xchange/legs/${legs[0].id}/deliver`).set(auth(t.deepak)).send({ note: 'not mine to deliver' }).expect(403);
    await api(app).post(`/v1/xchange/legs/${legs[0].id}/deliver`).set(auth(t.asha)).send({ note: 'Dispatched by LR 1234' }).expect(200);
    await api(app).post(`/v1/xchange/legs/${legs[0].id}/accept`).set(auth(t.asha)).expect(403);
    await api(app).post(`/v1/xchange/legs/${legs[0].id}/dispute`).set(auth(t.deepak)).send({ reason: 'short' }).expect(400);
    const disp = (await api(app).post(`/v1/xchange/legs/${legs[0].id}/dispute`).set(auth(t.deepak)).send({ reason: '12 panels arrived with cracked glass.' }).expect(200)).body;
    expect(disp.status).toBe('disputed');
    expect((await api(app).get('/v1/admin/xchange').set(auth(t.uniteAdmin)).expect(200)).body.totals.disputed).toBe(1);
    await api(app).post(`/v1/xchange/legs/${legs[0].id}/deliver`).set(auth(t.asha)).send({ note: 'Replaced 12 panels, LR 1301' }).expect(200);
    await api(app).post(`/v1/xchange/legs/${legs[0].id}/accept`).set(auth(t.deepak)).expect(200);
    for (const [i, sup, rec] of [[1, t.deepak, t.ravi], [2, t.ravi, t.asha]] as const) {
      await api(app).post(`/v1/xchange/legs/${legs[i].id}/deliver`).set(auth(sup)).send({ note: 'Work completed, sign-off attached' }).expect(200);
      await api(app).post(`/v1/xchange/legs/${legs[i].id}/accept`).set(auth(rec)).expect(200);
    }
    const done = (await api(app).get(`/v1/xchange/deals/${dealId}`).set(auth(t.asha)).expect(200)).body;
    expect(done.status).toBe('completed');
    expect((await one('select status from xchange_listings where id = $1', [voltOffer])).status).toBe('closed');
    expect(done.parties.find((p: any) => p.name === 'Volt EPC').completed).toBe(1);
  });

  it('part-cash: ₹10 L for ₹6 L of warehouse space plus ₹4 L cash', async () => {
    const d = (await api(app).post('/v1/xchange/deals').set(auth(t.asha)).send({ legs: [
      { fromOrgId: volt, toOrgId: meera, description: 'Inverter and BOS kit', value: 10_00_000_00, cash: 4_00_000_00 },
      { fromOrgId: meera, toOrgId: volt, description: 'Warehouse, 3 months', value: 6_00_000_00, cash: 0 },
    ] }).expect(201)).body;
    expect(d).toMatchObject({ kind: 'part_cash', balanced: true });
    expect(d.legs[0].invoice).toMatchObject({ cashConsideration: 4_00_000_00, nonCashConsideration: 6_00_000_00 });
    expect((await api(app).get('/v1/xchange/deals').set(auth(t.meera)).expect(200)).body).toHaveLength(1);
  });

  describe('COLLABIZ ONE', () => {
    it('shows the six-step journey for an opportunity the company drives; others cannot see it', async () => {
      const opp = (await one("select c.opportunity_id id from lead_claims c join organizations o on o.id = c.introducer_org_id where o.display_name = 'Meera Iyer Consulting' and c.status = 'protected' limit 1")).id;
      const list = (await api(app).get('/v1/one').set(auth(t.meera)).expect(200)).body;
      expect(list.some((x: any) => x.id === opp)).toBe(true);
      const j = (await api(app).get(`/v1/one/${opp}`).set(auth(t.meera)).expect(200)).body;
      expect(j.steps.map((s: any) => s.key)).toEqual(['bring', 'analyse', 'review', 'assemble', 'structure', 'deliver']);
      expect(j.steps[0].status).toBe('done');
      expect(j.steps.find((s: any) => s.key === 'review').status).toBe('done'); // protected by Unite
      expect(j.steps.find((s: any) => s.key === 'analyse').status).toBe('current');
      expect(j.note).toMatch(/not|never|separate legal process/);
      await api(app).get(`/v1/one/${opp}`).set(auth(t.ravi)).expect(404);
      await api(app).post('/v1/ai/team-plans').set(auth(t.meera)).send({ sourceType: 'opportunity', sourceId: opp }).expect(201);
      const j2 = (await api(app).get(`/v1/one/${opp}`).set(auth(t.meera)).expect(200)).body;
      expect(j2.steps.find((s: any) => s.key === 'analyse')).toMatchObject({ status: 'done', action: { label: 'Open team plan' } });
      expect(j2.steps.find((s: any) => s.key === 'assemble').status).toBe('current');
    });
  });
});
