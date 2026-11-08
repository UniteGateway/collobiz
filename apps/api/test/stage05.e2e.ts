import type { INestApplication } from '@nestjs/common';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import type { SeedRefs } from '../src/db/seed';

const key = (k: string) => ({ 'Idempotency-Key': `${k}-${Date.now()}-${Math.random()}` });

describe('Stage 05 — opportunity marketplace (gate: real listings and eligibility controls)', () => {
  let app: INestApplication;
  let refs: SeedRefs;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let opp: Record<string, any> = {};
  beforeAll(async () => {
    await resetDatabase(); refs = await seed(); app = await bootApp(); t = await loginAll(app);
    const all = await api(app).get('/v1/opportunities').set(auth(t.superadmin)).expect(200);
    opp = Object.fromEntries(all.body.map((o: any) => [o.code, o]));
  });
  afterAll(() => app?.close());

  it('006 anonymous visitors see only public listings and no partner-originated publisher identity', async () => {
    const r = await api(app).get('/v1/public/opportunities').expect(200);
    expect(r.body.map((o: any) => o.code).sort()).toEqual(['OPP-2026-00002', 'OPP-2026-00003']);
  });

  it('031/033 partner exchange listings are visible only to verified partners, with publisher withheld', async () => {
    const verified = await api(app).get('/v1/opportunities?scope=exchange').set(auth(t.asha)).expect(200);
    expect(verified.body.map((o: any) => o.code)).toEqual(['OPP-2026-00005']);
    expect(verified.body[0].publisher).toBe('Confidential');
    const unverified = await api(app).get('/v1/opportunities').set(auth(t.vikram)).expect(200);
    expect(unverified.body.map((o: any) => o.code)).not.toContain('OPP-2026-00005');
    await api(app).get(`/v1/opportunities/${opp['OPP-2026-00005'].id}`).set(auth(t.vikram)).expect(404);
    const owner = await api(app).get(`/v1/opportunities/${opp['OPP-2026-00005'].id}`).set(auth(t.meera)).expect(200);
    expect(owner.body.isOwner).toBe(true);
    expect(owner.body.history.length).toBe(2);
  });

  it('035 search filters by text, sector, region and value range; 034 counts by sector', async () => {
    const s = await api(app).get('/v1/opportunities?q=rooftop&sector=solar').set(auth(t.asha)).expect(200);
    expect(s.body.map((o: any) => o.code)).toEqual(['OPP-2026-00001']);
    const v = await api(app).get(`/v1/opportunities?minValue=${100 * 1_00_000 * 100}`).set(auth(t.ravi)).expect(200);
    expect(v.body.every((o: any) => o.estimatedValue >= 100 * 1_00_000 * 100)).toBe(true);
    const c = await api(app).get('/v1/opportunities/categories').set(auth(t.asha)).expect(200);
    expect(c.body.find((x: any) => x.sector === 'solar').count).toBe(2); // Chakan (India) + Dubai carport programme (Stage 15 seed)
  });

  it('041 eligibility explains each check; unverified, wrong-sector and under-level partners are blocked', async () => {
    const volt = await api(app).get(`/v1/opportunities/${opp['OPP-2026-00003'].id}/eligibility`).set(auth(t.asha)).expect(200);
    expect(volt.body.eligible).toBe(false);
    expect(volt.body.checks.find((c: any) => c.key === 'certifications')).toMatchObject({ result: 'fail', detail: 'Missing: ISO45001' });
    const gb = await api(app).get(`/v1/opportunities/${opp['OPP-2026-00003'].id}/eligibility`).set(auth(t.vikram)).expect(200);
    expect(gb.body.checks.find((c: any) => c.key === 'verified').result).toBe('fail');
    const dist = await api(app).get(`/v1/opportunities/${opp['OPP-2026-00002'].id}/eligibility`).set(auth(t.asha)).expect(200);
    expect(dist.body.checks.find((c: any) => c.key === 'level').result).toBe('fail'); // needs certified
    const ok = await api(app).get(`/v1/opportunities/${opp['OPP-2026-00002'].id}/eligibility`).set(auth(t.ravi)).expect(200);
    expect(ok.body.eligible).toBe(true); // Sunrise: certified, power_equipment, BIS
  });

  it('042 server re-checks eligibility; eligible partners apply once (idempotent)', async () => {
    const r = await api(app).post(`/v1/opportunities/${opp['OPP-2026-00003'].id}/apply`).set(auth(t.asha)).set(key('a')).send({ message: 'We would like to bid on the civil foundations.' }).expect(403);
    expect(r.body.error).toBe('NotEligible');
    await api(app).post(`/v1/opportunities/${opp['OPP-2026-00002'].id}/apply`).set(auth(t.ravi)).send({ message: 'Sunrise stocks transformers in Jaipur.' }).expect(400); // no key
    const k = { 'Idempotency-Key': 'sunrise-apply-0002' };
    const a1 = await api(app).post(`/v1/opportunities/${opp['OPP-2026-00002'].id}/apply`).set(auth(t.ravi)).set(k).send({ message: 'Sunrise stocks transformers in Jaipur and Udaipur.', proposedValue: 120_00_000_00 }).expect(201);
    const a2 = await api(app).post(`/v1/opportunities/${opp['OPP-2026-00002'].id}/apply`).set(auth(t.ravi)).set(k).send({ message: 'Sunrise stocks transformers in Jaipur and Udaipur.', proposedValue: 120_00_000_00 }).expect(201);
    expect(a2.body.id).toBe(a1.body.id);
    await api(app).post(`/v1/opportunities/${opp['OPP-2026-00002'].id}/apply`).set(auth(t.ravi)).set(key('dup')).send({ message: 'Applying a second time should not be allowed.' }).expect(403);
  });

  it('publisher reviews applicants; applicants cannot see others or decide on their own', async () => {
    await api(app).get(`/v1/opportunities/${opp['OPP-2026-00001'].id}/applications`).set(auth(t.asha)).expect(403);
    const list = await api(app).get(`/v1/opportunities/${opp['OPP-2026-00001'].id}/applications`).set(auth(t.uniteAdmin)).expect(200);
    expect(list.body[0].orgName).toBe('Volt EPC');
    await api(app).post(`/v1/opportunities/${opp['OPP-2026-00001'].id}/applications/${list.body[0].id}/decision`).set(auth(t.uniteAdmin)).set(key('d')).send({ status: 'shortlisted', reason: 'Strong Maharashtra references' }).expect(200);
    await api(app).post(`/v1/opportunities/${opp['OPP-2026-00001'].id}/applications/${list.body[0].id}/decision`).set(auth(t.uniteAdmin)).set(key('d2')).send({ status: 'submitted', reason: 'invalid backwards move' }).expect(400);
    const mine = await api(app).get('/v1/me/opportunities').set(auth(t.asha)).expect(200);
    expect(mine.body.applications[0]).toMatchObject({ status: 'shortlisted', decisionReason: 'Strong Maharashtra references' });
  });

  it('unite admin publishes route-A listings for own company only; saved-search alerts fire', async () => {
    await api(app).post('/v1/me/saved-searches').set(auth(t.asha)).send({ name: 'Solar in Maharashtra', query: { sector: 'solar', city: 'Nashik' }, alert: true }).expect(201);
    const body = { title: 'Solar carport EPC — Nashik logistics hub', summary: 'Design and build a 600 kW solar carport for a logistics hub near Nashik.', sector: 'solar', kind: 'project', route: 'unite_owned', city: 'Nashik', region: 'IN-MH', visibility: 'verified_partners', estimatedValue: 3_00_00_000_00 };
    await api(app).post('/v1/admin/opportunities').set(auth(t.uniteAdmin)).set(key('p')).send({ ...body, groupCompanyId: refs.orgs.powertek }).expect(403);
    await api(app).post('/v1/admin/opportunities').set(auth(t.uniteAdmin)).set(key('p')).send({ ...body, route: 'partner_originated' }).expect(400);
    await api(app).post('/v1/admin/opportunities').set(auth(t.asha)).set(key('p')).send(body).expect(403);
    const r = await api(app).post('/v1/admin/opportunities').set(auth(t.uniteAdmin)).set(key('p')).send(body).expect(201);
    expect(r.body).toMatchObject({ status: 'qualification', listed: true, route: 'unite_owned' });
    expect(r.body.code).toMatch(/^OPP-\d{4}-\d{5}$/);
    const n = await api(app).get('/v1/me/notifications').set(auth(t.asha)).expect(200);
    expect(n.body[0].title).toMatch(/Solar carport/);
    const close = await api(app).post(`/v1/admin/opportunities/${r.body.id}/close`).set(auth(t.uniteAdmin)).send({ reason: 'Customer postponed the project' }).expect(200);
    expect(close.body.status).toBe('lost');
    await api(app).post(`/v1/admin/opportunities/${r.body.id}/publish`).set(auth(t.uniteAdmin)).send({ expectedVersion: 99 }).expect(409); // stale version
  });

  it('037 save/unsave and saved list; 025 feed is consent-gated and explainable', async () => {
    await api(app).post(`/v1/opportunities/${opp['OPP-2026-00004'].id}/save`).set(auth(t.ravi)).expect(200);
    const s = await api(app).get('/v1/me/saved').set(auth(t.ravi)).expect(200);
    expect(s.body.opportunities.map((o: any) => o.code)).toContain('OPP-2026-00004');
    const f = await api(app).get('/v1/me/feed').set(auth(t.asha)).expect(200);
    expect(f.body.consent).toBe(true);
    expect(f.body.items[0].match.factors.length).toBe(5);
    expect(f.body.items[0].match.disclaimer).toMatch(/human review/);
    await api(app).post('/v1/privacy/consents').set(auth(t.asha)).send({ purpose: 'matching', granted: false }).expect(201);
    const f2 = await api(app).get('/v1/me/feed').set(auth(t.asha)).expect(200);
    expect(f2.body).toEqual({ consent: false, items: [] });
  });

  it('040 public RFQ enters Unite review (not publicly listed); 009 locations aggregate verified partners', async () => {
    const r = await api(app).post('/v1/public/rfq').send({ title: 'Need 300 kW rooftop solar for a school', description: 'A school campus in Mysuru needs rooftop solar with net metering.', sector: 'solar', city: 'Mysuru', contactName: 'Principal Rao', contactEmail: 'rao@school.example', consentToShare: true }).expect(201);
    expect(r.body.reference).toMatch(/^RFQ-/);
    const pub = await api(app).get('/v1/public/opportunities?q=school').expect(200);
    expect(pub.body).toHaveLength(0);
    const adm = await api(app).get('/v1/admin/opportunities?status=submitted').set(auth(t.superadmin)).expect(200);
    expect(adm.body.find((o: any) => o.code === r.body.code)).toMatchObject({ source: 'rfq', status: 'submitted' });
    await api(app).post('/v1/public/rfq').send({ title: 'x', contactEmail: 'bad', consentToShare: false }).expect(400);
    const loc = await api(app).get('/v1/public/locations').expect(200);
    expect(loc.body.coverage.find((c: any) => c.region === 'IN-MH').partners).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(loc.body)).not.toMatch(/Volt EPC/);
  });

  it('023 dashboard KPIs come from real data', async () => {
    const d = await api(app).get('/v1/me/dashboard').set(auth(t.ravi)).expect(200);
    expect(d.body.applications.total).toBe(1);
    expect(d.body.saved).toBe(1);
  });

  it('038 map query returns only located listings, independent of list size', async () => {
    const r = await api(app).get('/v1/opportunities?mapped=true&limit=200').set(auth(t.asha)).expect(200);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body.every((o: any) => o.lat != null && o.lng != null)).toBe(true);
  });

  it('001 public stats are live aggregates with no organization details', async () => {
    const r = await api(app).get('/v1/public/stats').expect(200);
    expect(r.body).toMatchObject({ verifiedPartners: expect.any(Number), groupCompanies: expect.any(Number), openOpportunities: expect.any(Number), openValue: expect.any(Number) });
    expect(r.body.verifiedPartners).toBeGreaterThan(0);
    expect(Object.keys(r.body).sort()).toEqual(['activeSectors', 'asOf', 'groupCompanies', 'openOpportunities', 'openValue', 'protectedLeads', 'verifiedPartners']);
  });
});
