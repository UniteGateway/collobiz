import type { INestApplication } from '@nestjs/common';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import type { SeedRefs } from '../src/db/seed';

describe('Stage 08 — partner matching & teams (gate: no private disclosure without permission)', () => {
  let app: INestApplication;
  let refs: SeedRefs;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let team: any;
  beforeAll(async () => { await resetDatabase(); refs = await seed(); app = await bootApp(); t = await loginAll(app); });
  afterAll(() => app?.close());

  it('056 directory lists verified partners with public fields only', async () => {
    const r = await api(app).get('/v1/partners').set(auth(t.asha)).expect(200);
    const names = r.body.map((p: any) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Sunrise Traders', 'Meera Iyer Consulting']));
    expect(names).not.toContain('GreenBuild Infra'); // not verified
    const keys = new Set(r.body.flatMap((x: any) => Object.keys(x)));
    for (const k of ['email', 'contactEmail', 'phone', 'accountMasked', 'panMasked', 'gstin', 'registrationNumber', 'about']) expect(keys.has(k)).toBe(false);
    const p = await api(app).get(`/v1/partners/${refs.orgs.sunrise}`).set(auth(t.asha)).expect(200);
    expect(p.body.about).toMatch(/distributes/);
    await api(app).get(`/v1/partners/${refs.orgs.greenbuild}`).set(auth(t.asha)).expect(404);
    const f = await api(app).get('/v1/partners?sector=power_equipment').set(auth(t.asha)).expect(200);
    expect(f.body.map((x: any) => x.name)).toEqual(['Sunrise Traders']);
  });

  it('057 AI match suggestions are explainable and exclude partners without matching consent', async () => {
    const r = await api(app).post('/v1/partners/match').set(auth(t.asha)).send({ sector: 'solar', region: 'IN-KA' }).expect(200);
    expect(r.body.suggestions[0].factors.map((f: any) => f.factor)).toContain('Sector');
    expect(r.body.suggestions.every((s: any) => s.partnerId !== refs.orgs.volt)).toBe(true);
    await api(app).post('/v1/privacy/consents').set(auth(t.meera)).send({ purpose: 'matching', granted: false }).expect(201);
    const r2 = await api(app).post('/v1/partners/match').set(auth(t.asha)).send({ sector: 'consulting' }).expect(200);
    expect(r2.body.suggestions.map((s: any) => s.partnerId)).not.toContain(refs.orgs.meera);
    expect(r2.body.excludedForConsent).toBeGreaterThanOrEqual(1);
    await api(app).post('/v1/privacy/consents').set(auth(t.meera)).send({ purpose: 'matching', granted: true }).expect(201);
  });

  it('154 only verified partners create teams; the lead joins with a signed NDA', async () => {
    await api(app).post('/v1/teams').set(auth(t.vikram)).send({ name: 'Unverified team', purpose: 'This should be refused because GreenBuild is not verified.' }).expect(403);
    const r = await api(app).post('/v1/teams').set(auth(t.asha)).send({ name: 'Nashik Carport Team', purpose: 'Design-build a solar carport with a structural partner and a consultant.' }).expect(201);
    team = r.body;
    expect(team.status).toBe('forming');
    expect(team.ndaHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('058/059 invitations: only verified orgs; invitee sees a teaser and the NDA, nothing private', async () => {
    await api(app).post(`/v1/teams/${team.id}/invitations`).set(auth(t.asha)).send({ organizationId: refs.orgs.greenbuild, role: 'execution', responsibilities: 'Civil structure for carport' }).expect(400);
    await api(app).post(`/v1/teams/${team.id}/invitations`).set(auth(t.rohit)).send({ organizationId: refs.orgs.sunrise, role: 'procurement', responsibilities: 'Electrical supply' }).expect(403); // org_member
    await api(app).post(`/v1/teams/${team.id}/invitations`).set(auth(t.asha)).send({ organizationId: refs.orgs.sunrise, role: 'procurement', responsibilities: 'Electrical supply and cabling', message: 'Join us?' }).expect(201);
    await api(app).post(`/v1/teams/${team.id}/invitations`).set(auth(t.asha)).send({ organizationId: refs.orgs.meera, role: 'specialist', responsibilities: 'Feasibility and tender advisory' }).expect(201);
    await api(app).post(`/v1/teams/${team.id}/posts`).set(auth(t.asha)).send({ kind: 'note', title: 'Buyer budget', body: 'Confidential: buyer budget is ₹3 Cr.' }).expect(201);
    const req = await api(app).get('/v1/collaboration/requests').set(auth(t.ravi)).expect(200);
    expect(req.body.find((x: any) => x.teamId === team.id)).toMatchObject({ status: 'invited', role: 'procurement', lead: 'Volt EPC' });
    const teaser = await api(app).get(`/v1/teams/${team.id}`).set(auth(t.ravi)).expect(200);
    expect(teaser.body.access).toBe('invitee');
    expect(teaser.body.ndaText).toMatch(/NON-DISCLOSURE/);
    expect(teaser.body.proposals).toBeUndefined();
    expect(teaser.body.opportunity).toBeUndefined();
    expect(teaser.body.version).toBeUndefined();
    expect(JSON.stringify(teaser.body)).not.toMatch(/₹3 Cr|Buyer budget/);
    await api(app).get(`/v1/teams/${team.id}/posts`).set(auth(t.ravi)).expect(403);
    await api(app).get(`/v1/teams/${team.id}`).set(auth(t.vikram)).expect(404); // outsider
  });

  it('062 workspace unlocks only after accept + NDA signature with the exact registered name', async () => {
    await api(app).post(`/v1/teams/${team.id}/nda/sign`).set(auth(t.ravi)).send({ typedName: 'Ravi Patel' }).expect(400); // must accept first
    await api(app).post(`/v1/teams/${team.id}/respond`).set(auth(t.ravi)).send({ decision: 'accept' }).expect(200);
    await api(app).post(`/v1/teams/${team.id}/nda/sign`).set(auth(t.ravi)).send({ typedName: 'Someone Else' }).expect(400);
    await api(app).post(`/v1/teams/${team.id}/nda/sign`).set(auth(t.ravi)).send({ typedName: 'Ravi Patel' }).expect(200);
    const posts = await api(app).get(`/v1/teams/${team.id}/posts`).set(auth(t.ravi)).expect(200);
    expect(posts.body[0].body).toMatch(/₹3 Cr/);
    const full = await api(app).get(`/v1/teams/${team.id}`).set(auth(t.ravi)).expect(200);
    expect(full.body.access).toBe('full');
  });

  it('063 sharing proposal needs all NDAs, shares totalling 100% for every member, and every member’s approval', async () => {
    const shares = [{ organizationId: refs.orgs.volt, sharePct: 60 }, { organizationId: refs.orgs.sunrise, sharePct: 30 }, { organizationId: refs.orgs.meera, sharePct: 10 }];
    await api(app).post(`/v1/teams/${team.id}/proposals`).set(auth(t.asha)).send({ shares, terms: 'Revenue shared pro rata to work packages, settled on customer payment.' }).expect(400); // Meera hasn't signed
    await api(app).post(`/v1/teams/${team.id}/respond`).set(auth(t.meera)).send({ decision: 'accept' }).expect(200);
    await api(app).post(`/v1/teams/${team.id}/nda/sign`).set(auth(t.meera)).send({ typedName: 'Meera Iyer' }).expect(200);
    await api(app).post(`/v1/teams/${team.id}/proposals`).set(auth(t.asha)).send({ shares: shares.map((x, i) => (i ? x : { ...x, sharePct: 50 })), terms: 'Revenue shared pro rata to work packages.' }).expect(400); // 90%
    const p = await api(app).post(`/v1/teams/${team.id}/proposals`).set(auth(t.asha)).send({ shares, terms: 'Revenue shared pro rata to work packages, settled on customer payment.' }).expect(201);
    await api(app).post(`/v1/teams/${team.id}/activate`).set(auth(t.asha)).expect(400);
    await api(app).post(`/v1/teams/${team.id}/proposals/${p.body.id}/decision`).set(auth(t.ravi)).send({ decision: 'reject' }).expect(400); // reason needed
    await api(app).post(`/v1/teams/${team.id}/proposals/${p.body.id}/decision`).set(auth(t.ravi)).send({ decision: 'approve' }).expect(200);
    const d = await api(app).post(`/v1/teams/${team.id}/proposals/${p.body.id}/decision`).set(auth(t.meera)).send({ decision: 'approve' }).expect(200);
    expect(d.body).toMatchObject({ status: 'approved', teamStatus: 'approval_pending' });
  });

  it('064 activation succeeds when all conditions are met; 061 role changes are lead-only', async () => {
    const det = await api(app).get(`/v1/teams/${team.id}`).set(auth(t.asha)).expect(200);
    const meeraM = det.body.members.find((m: any) => m.organization === 'Meera Iyer Consulting');
    await api(app).patch(`/v1/teams/${team.id}/members/${meeraM.id}`).set(auth(t.ravi)).send({ role: 'lead', responsibilities: 'Takeover attempt' }).expect(403);
    await api(app).patch(`/v1/teams/${team.id}/members/${meeraM.id}`).set(auth(t.asha)).send({ role: 'specialist', responsibilities: 'Feasibility, net-metering approvals' }).expect(200);
    const a = await api(app).post(`/v1/teams/${team.id}/activate`).set(auth(t.asha)).expect(200);
    expect(a.body.status).toBe('active');
  });

  it('revocation removes access immediately (no lingering disclosure)', async () => {
    const det = await api(app).get(`/v1/teams/${team.id}`).set(auth(t.asha)).expect(200);
    const m = det.body.members.find((x: any) => x.organization === 'Meera Iyer Consulting');
    await api(app).post(`/v1/teams/${team.id}/members/${m.id}/revoke`).set(auth(t.asha)).send({ reason: 'Advisory scope completed' }).expect(200);
    await api(app).get(`/v1/teams/${team.id}`).set(auth(t.meera)).expect(404);
    await api(app).get(`/v1/teams/${team.id}/posts`).set(auth(t.meera)).expect(404);
    const req = await api(app).get('/v1/collaboration/requests').set(auth(t.meera)).expect(200);
    expect(req.body.find((x: any) => x.teamId === team.id).status).toBe('revoked');
  });

  it('124/155 consortiums are agreements among named parties and support the same controls', async () => {
    const c = await api(app).post('/v1/teams').set(auth(t.ravi)).send({ name: 'Gujarat Distribution Consortium', purpose: 'Named-party consortium for a utility distribution tender; not a separate legal entity.', kind: 'consortium' }).expect(201);
    expect(c.body.kind).toBe('consortium');
    const mine = await api(app).get('/v1/teams').set(auth(t.ravi)).expect(200);
    expect(mine.body.map((x: any) => x.kind)).toEqual(expect.arrayContaining(['team', 'consortium']));
  });
});
