import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

/** Pilot feedback: partners send a short structured check-in; Unite reads averages, NPS and comments. */
describe('Pilot feedback', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  const answer = (o: Record<string, unknown> = {}) => ({ usefulness: 4, ease: 3, recommend: 9, used: ['offers', 'ventures'], continueUse: 'yes', ...o });

  it('validates the answers and refuses a second check-in within a day', async () => {
    const bad = await api(app).post('/v1/pilot-feedback').set(auth(t.asha)).send(answer({ usefulness: 0, recommend: 11, used: ['spaceships'] })).expect(400);
    expect(bad.body.issues.map((i: any) => i.path)).toEqual(expect.arrayContaining(['usefulness', 'recommend']));
    expect((await api(app).get('/v1/pilot-feedback/mine').set(auth(t.asha)).expect(200)).body).toMatchObject({ canAnswer: true, lastAt: null });
    await api(app).post('/v1/pilot-feedback').set(auth(t.asha)).send(answer({ blockers: 'Could not find where to upload the signed quote.', contactOk: true })).expect(201);
    const mine = await api(app).get('/v1/pilot-feedback/mine').set(auth(t.asha)).expect(200);
    expect(mine.body.canAnswer).toBe(false);
    expect(new Date(mine.body.nextAt).getTime()).toBeGreaterThan(Date.now());
    const again = await api(app).post('/v1/pilot-feedback').set(auth(t.asha)).send(answer()).expect(409);
    expect(again.body.message).toMatch(/tomorrow/);
    await api(app).post('/v1/pilot-feedback').send(answer()).expect(401);
  });

  it('Unite reads averages, NPS, continue split, feature use and comments; partners cannot', async () => {
    await api(app).post('/v1/pilot-feedback').set(auth(t.ravi)).send(answer({ usefulness: 2, ease: 2, recommend: 4, used: ['offers'], continueUse: 'maybe', wishlist: 'Hindi language', platform: 'mobile' })).expect(201);
    await api(app).post('/v1/pilot-feedback').set(auth(t.meera)).send(answer({ usefulness: 5, ease: 5, recommend: 7, used: ['leads'], continueUse: 'no', mostValuable: 'Lead certificates' })).expect(201);
    await api(app).get('/v1/admin/pilot-feedback').set(auth(t.asha)).expect(403);
    const r = await api(app).get('/v1/admin/pilot-feedback').set(auth(t.uniteAdmin)).expect(200);
    expect(r.body).toMatchObject({ responses: 3, respondents: 3, usefulness: 3.7, ease: 3.3, nps: 0, continueUse: { yes: 1, maybe: 1, no: 1 }, platforms: { web: 2, mobile: 1 } });
    expect(r.body.used[0]).toEqual({ feature: 'offers', count: 2 });
    expect(r.body.weekly.reduce((n: number, w: any) => n + w.responses, 0)).toBe(3);
    const asha = r.body.comments.find((c: any) => c.name.startsWith('Asha'));
    expect(asha).toMatchObject({ blockers: expect.stringMatching(/signed quote/), contact: 'asha@voltepc.example', organization: 'Volt EPC' });
    expect(r.body.comments.find((c: any) => c.wishlist === 'Hindi language').contact).toBeNull(); // did not agree to be contacted
    await api(app).get('/v1/admin/pilot-feedback?days=1').set(auth(t.finance)).expect(200);
    const audit = (await pool.query("select count(*)::int n from audit_events where action = 'pilot.feedback'")).rows[0];
    expect(audit.n).toBe(3);
  });

  it('Unite reminds verified partners who have not checked in this week, at most once a day', async () => {
    await api(app).post('/v1/admin/pilot-feedback/remind').set(auth(t.asha)).expect(403);
    const r = await api(app).post('/v1/admin/pilot-feedback/remind').set(auth(t.uniteAdmin)).expect(200);
    expect(r.body.alreadyAnswered).toBeGreaterThanOrEqual(3); // asha, ravi, meera answered above
    expect(r.body.reminded).toBeGreaterThan(0);
    const got = async (email: string) => (await pool.query("select count(*)::int n from notifications n join users u on u.id = n.user_id where u.email = $1 and n.link = '/help/pilot'", [email])).rows[0].n;
    expect(await got('asha@voltepc.example')).toBe(0); // already checked in
    expect(await got('deepak@deccan.example')).toBe(1); // verified partner, no check-in
    expect(await got('vikram@greenbuild.example')).toBe(0); // company not verified
    expect(await got('unite.admin@collabiz.local')).toBe(0); // staff are not reminded
    await api(app).post('/v1/admin/pilot-feedback/remind').set(auth(t.uniteAdmin)).expect(409);
  });
});
