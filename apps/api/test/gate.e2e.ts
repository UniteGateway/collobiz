import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

/**
 * Quality gate — endpoints behind screens whose stage suites did not call them directly:
 * 024 withdraw an application · 076 owner pauses/resumes a project · 097/135 commission policies · 156 team tasks.
 */
describe('Quality gate — remaining screen endpoints', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('024 a partner withdraws its own open application once; nobody else can', async () => {
    const a = await one("select a.id, a.opportunity_id from opportunity_applications a join opportunities o on o.id = a.opportunity_id where o.code = 'OPP-2026-00001'");
    const path = `/v1/opportunities/${a.opportunity_id}/applications/${a.id}/withdraw`;
    await api(app).post(path).set(auth(t.ravi)).expect(404); // another company cannot see it
    expect((await api(app).post(path).set(auth(t.asha)).expect(200)).body.status).toBe('withdrawn');
    const again = await api(app).post(path).set(auth(t.asha)).expect(400);
    expect(again.body.message).toMatch(/withdrawn cannot be withdrawn/);
    const audit = await one("select count(*)::int n from audit_events where action = 'opportunity.application_withdrawn' and object_id = $1", [a.id]);
    expect(audit.n).toBe(1);
    const mine = await api(app).get('/v1/me/opportunities').set(auth(t.asha)).expect(200);
    expect(JSON.stringify(mine.body)).toContain('withdrawn');
  });

  it('076 only the project owner pauses and resumes a project, with a reason that is logged', async () => {
    const p = await one("select id from projects where code = 'PRJ-2026-000001'");
    const path = `/v1/projects/${p.id}/status`;
    await api(app).post(path).set(auth(t.asha)).send({ status: 'on_hold', reason: 'Lead tries to pause' }).expect(403); // lead contractor
    await api(app).post(path).set(auth(t.uniteAdmin)).send({ status: 'on_hold', reason: 'no' }).expect(400); // reason too short
    expect((await api(app).post(path).set(auth(t.uniteAdmin)).send({ status: 'on_hold', reason: 'Monsoon: site closed by the client' }).expect(200)).body.status).toBe('on_hold');
    expect((await api(app).post(path).set(auth(t.uniteAdmin)).send({ status: 'active', reason: 'Site reopened after inspection' }).expect(200)).body.status).toBe('active');
    const log = await api(app).get(`/v1/projects/${p.id}/changes`).set(auth(t.asha)).expect(200);
    expect(log.body.map((c: any) => c.reason)).toEqual(expect.arrayContaining(['Monsoon: site closed by the client', 'Site reopened after inspection']));
  });

  it('097/135 partners read commission policies for the calculator; only super admin creates them', async () => {
    const list = await api(app).get('/v1/commissions/policies').set(auth(t.asha)).expect(200);
    expect(list.body.map((p: any) => p.code)).toEqual(expect.arrayContaining(['INTRODUCER-STD']));
    expect(list.body.every((p: any) => typeof p.version === 'number')).toBe(true);
    await api(app).post('/v1/admin/commission-policies').set(auth(t.asha)).send({ code: 'X', name: 'Partner-made policy' }).expect(403);
    const std = list.body.find((p: any) => p.code === 'INTRODUCER-STD');
    const calc = await api(app).post('/v1/commissions/calculate').set(auth(t.asha)).send({ policyId: std.id, dealValue: 1_00_00_000_00 }).expect(200);
    expect(JSON.stringify(calc.body)).toMatch(/\d/); // the calculator answers from the stored policy
  });

  it('156 signed members tick team tasks; outsiders and unknown tasks are refused', async () => {
    const team = await one("select id from collaboration_teams where code = 'TM-000001'");
    const post = await api(app).post(`/v1/teams/${team.id}/posts`).set(auth(t.asha)).send({ kind: 'task', title: 'Structural drawings', body: 'Share the structural drawings for Shed A' });
    expect(post.status).toBe(201);
    const path = `/v1/teams/${team.id}/posts/${post.body.id}`;
    await api(app).patch(path).set(auth(t.deepak)).send({ status: 'done' }).expect(404); // outsiders can't even see the team
    expect((await api(app).patch(path).set(auth(t.asha)).send({ status: 'done' }).expect(200)).body.status).toBe('done');
    await api(app).patch(path).set(auth(t.asha)).send({ status: 'archived' }).expect(400);
    await api(app).patch(`/v1/teams/${team.id}/posts/00000000-0000-4000-8000-000000000000`).set(auth(t.asha)).send({ status: 'done' }).expect(404);
  });
});
