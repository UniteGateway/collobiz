import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('COLLABIZ ONE extras — DNA passport, rescue with authorisation, 48-hour challenge, revival with permission', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('DNA passport separates evidenced from self-declared', async () => {
    const volt = (await one("select id from organizations where display_name = 'Volt EPC'")).id;
    const d = (await api(app).get(`/v1/dna/${volt}`).set(auth(t.ravi)).expect(200)).body;
    expect(d).toMatchObject({ name: 'Volt EPC', verified: true });
    const items = d.sections.flatMap((s: any) => s.items);
    expect(items.some((i: any) => i.evidence === 'evidenced')).toBe(true);
    expect(items.find((i: any) => i.label === 'Turnover')).toMatchObject({ evidence: 'self_declared' });
    const vik = (await one("select id from organizations where display_name = 'GreenBuild Infra'")).id;
    await api(app).get(`/v1/dna/${vik}`).set(auth(t.ravi)).expect(404); // unverified companies are not shown to others
  });

  it('rescue: partners are searched only after both owner and lead authorise', async () => {
    const proj = (await one("select id from projects where code = 'PRJ-2026-000001'")).id;
    const body = { gaps: ['equipment', 'manpower'], note: 'Crane and an installation crew are needed for four weeks at Shed A.' };
    await api(app).post(`/v1/projects/${proj}/rescue`).set(auth(t.ravi)).send(body).expect(403);
    const r = (await api(app).post(`/v1/projects/${proj}/rescue`).set(auth(t.asha)).send(body).expect(201)).body;
    expect(r.status).toBe('awaiting_authorization');
    let v = (await api(app).get(`/v1/projects/${proj}/rescue`).set(auth(t.asha)).expect(200)).body;
    expect(v.candidates).toEqual([]); // not searched before authorisation
    await api(app).post(`/v1/rescue/${r.id}/interest`).set(auth(t.ravi)).send({ items: ['equipment'], note: 'We can supply a 25 t crane.' }).expect(404);
    await api(app).post(`/v1/rescue/${r.id}/authorize`).set(auth(t.asha)).expect(409);
    expect((await api(app).post(`/v1/rescue/${r.id}/authorize`).set(auth(t.uniteAdmin)).expect(200)).body.status).toBe('searching');
    v = (await api(app).get(`/v1/projects/${proj}/rescue`).set(auth(t.asha)).expect(200)).body;
    expect(v.rescue.authorized.every((a: any) => a.at)).toBe(true);
    await api(app).post(`/v1/rescue/${r.id}/interest`).set(auth(t.ravi)).send({ items: ['finance'], note: 'Something else entirely here.' }).expect(400);
    await api(app).post(`/v1/rescue/${r.id}/interest`).set(auth(t.ravi)).send({ items: ['equipment', 'manpower'], note: 'Crane and a 12-person civil crew available.' }).expect(201);
    expect((await api(app).get(`/v1/projects/${proj}/rescue`).set(auth(t.asha)).expect(200)).body.interests[0]).toMatchObject({ org: 'Sunrise Traders', items: ['equipment', 'manpower'] });
  });

  it('48-hour challenge: owner lists roles, partners join, coverage is shown', async () => {
    const opp = (await one("select o.id from opportunities o join lead_claims c on c.opportunity_id = o.id join organizations g on g.id = c.introducer_org_id where g.display_name = 'Meera Iyer Consulting' limit 1")).id;
    await api(app).post(`/v1/opportunities/${opp}/challenge`).set(auth(t.ravi)).send({ roles: ['EPC lead'] }).expect(403);
    const c = (await api(app).post(`/v1/opportunities/${opp}/challenge`).set(auth(t.meera)).send({ roles: ['EPC lead', 'Module supply', 'Civil works'] }).expect(201)).body;
    expect(new Date(c.deadline).getTime() - Date.now()).toBeGreaterThan(47 * 3600_000);
    await api(app).post(`/v1/opportunities/${opp}/challenge`).set(auth(t.meera)).send({ roles: ['EPC lead'] }).expect(409);
    await api(app).post(`/v1/challenges/${c.id}/interest`).set(auth(t.asha)).send({ items: ['EPC lead', 'Civil works'], note: 'Volt can lead execution and civil.' }).expect(201);
    await api(app).post(`/v1/challenges/${c.id}/interest`).set(auth(t.ravi)).send({ items: ['Catering'], note: 'Not one of the roles listed.' }).expect(400);
    const v = (await api(app).get(`/v1/challenges/${c.id}`).set(auth(t.meera)).expect(200)).body;
    expect(v.coverage).toMatchObject({ covered: 2, total: 3 });
    expect(v.note).toMatch(/not a guarantee/);
    expect((await api(app).get(`/v1/challenges/${c.id}`).set(auth(t.ravi)).expect(200)).body.interests).toEqual([]); // only the owner sees who joined
  });

  it('revival needs the owner’s permission and offers suggestions only', async () => {
    const opp = await one("select o.id, o.owner_org_id from opportunities o join lead_claims c on c.opportunity_id = o.id join organizations g on g.id = c.introducer_org_id where g.display_name = 'Meera Iyer Consulting' limit 1");
    // As after Unite takes the lead on it: Unite Solar owns the opportunity, Meera remains the introducer.
    await pool.query("update opportunities set status = 'lost', owner_org_id = (select id from organizations where display_name = 'Unite Solar') where id = $1", [opp.id]);
    const list = (await api(app).get('/v1/revival').set(auth(t.meera)).expect(200)).body.items;
    const it = list.find((x: any) => x.id === opp.id);
    expect(it.suggestions.map((s: any) => s.kind)).toContain('consortium');
    const r = (await api(app).post(`/v1/opportunities/${opp.id}/revival`).set(auth(t.meera)).send({ reason: 'The buyer still needs the plant; a phased scope could work this quarter.' }).expect(201)).body;
    expect(r.status).toBe('requested');
    await api(app).post(`/v1/revival/${r.id}/decide`).set(auth(t.meera)).send({ decision: 'approved' }).expect(403);
    expect((await api(app).post(`/v1/revival/${r.id}/decide`).set(auth(t.uniteAdmin)).send({ decision: 'approved', note: 'Go ahead with a phased offer.' }).expect(200)).body.status).toBe('approved');
    expect((await one("select status from opportunities where id = $1", [opp.id])).status).toBe('lost'); // nothing changed automatically
    // The owner reviving its own opportunity needs no one else's permission.
    await pool.query("update revival_requests set status = 'declined' where opportunity_id = $1", [opp.id]);
    expect((await api(app).post(`/v1/opportunities/${opp.id}/revival`).set(auth(t.uniteAdmin)).send({ reason: 'We will offer the buyer a smaller first phase this quarter.' }).expect(201)).body.status).toBe('approved');
  });
});
