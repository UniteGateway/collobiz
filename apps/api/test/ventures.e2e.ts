import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

/** Unite Group businesses: every venture can be promoted, regulated ones stay locked, partners ask, Unite approves. */
describe('Unite Group businesses (ventures)', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  let n = 0;
  const idem = () => ({ 'Idempotency-Key': `v-${++n}-${Date.now()}` });
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('all 47 businesses are loaded across sectors, not only solar; regulated ones are hidden from partners and the public', async () => {
    const admin = await api(app).get('/v1/admin/ventures').set(auth(t.uniteAdmin)).expect(200);
    expect(admin.body).toHaveLength(47);
    expect(new Set(admin.body.map((v: any) => v.sector)).size).toBeGreaterThanOrEqual(10);
    expect(admin.body.filter((v: any) => v.regulated).map((v: any) => v.slug)).toEqual(expect.arrayContaining(['unite-digital-bank', 'bestpe', 'universal-trade-coin', 'payslip-app']));
    const partner = await api(app).get('/v1/ventures').set(auth(t.asha)).expect(200);
    expect(partner.body.length).toBe(47 - admin.body.filter((v: any) => v.regulated).length);
    expect(partner.body.some((v: any) => v.slug === 'universal-trade-coin')).toBe(false);
    await api(app).get('/v1/ventures/universal-trade-coin').set(auth(t.asha)).expect(404);
    const pub = await api(app).get('/v1/public/ventures').expect(200);
    expect(pub.body.every((v: any) => v.open)).toBe(true);
    expect(pub.body.map((v: any) => v.slug)).toEqual(expect.arrayContaining(['wakin', 'nano-bazar', 'unite-learning', 'solcart', 'unite-powertek']));
    expect(pub.body.every((v: any) => !('roles' in v) && !('rating' in v) && !('regulatedReason' in v))).toBe(true);
    expect(admin.body.find((v: any) => v.slug === 'unite-powertek')).toMatchObject({ company: 'Powertek', stage: 'live' });
  });

  it('a verified partner asks to promote an open business with roles it needs; closed or regulated ones are refused', async () => {
    await api(app).post('/v1/ventures/zuppo/interest').set(auth(t.ravi)).send({ roles: ['recruit_members'], message: 'We can bring personal shoppers in Ahmedabad.' }).expect(409); // coming soon
    await api(app).post('/v1/ventures/bestpe/interest').set(auth(t.ravi)).send({ roles: ['recruit_merchants'], message: 'We know many small merchants in Gujarat.' }).expect(404); // regulated: hidden
    await api(app).post('/v1/ventures/nano-bazar/interest').set(auth(t.vikram)).send({ roles: ['recruit_merchants'], message: 'Our unverified company wants to recruit merchants.' }).expect(403);
    await api(app).post('/v1/ventures/nano-bazar/interest').set(auth(t.ravi)).send({ roles: ['create_content'], message: 'We can make videos for Nano Bazar sellers.' }).expect(400); // not a role it needs
    const ok = await api(app).post('/v1/ventures/nano-bazar/interest').set(auth(t.ravi)).send({ roles: ['recruit_merchants'], regions: ['IN-GJ'], message: 'We supply 300 shops in Ahmedabad and can onboard them as Nano Bazar sellers.' }).expect(200);
    expect(ok.body.status).toBe('pending');
    const note = await one("select count(*)::int n from notifications n join users u on u.id = n.user_id where n.kind = 'venture' and u.email = 'unite.admin@collabiz.local'");
    expect(note.n).toBeGreaterThan(0);
    const me = await api(app).get('/v1/ventures/nano-bazar').set(auth(t.ravi)).expect(200);
    expect(me.body.myInterest.status).toBe('pending');
  });

  it('Unite approves promoters; an offer for the business can go to its approved promoters only', async () => {
    const v = (await api(app).get('/v1/admin/ventures').set(auth(t.uniteAdmin)).expect(200)).body.find((x: any) => x.slug === 'nano-bazar');
    const det = await api(app).get(`/v1/admin/ventures/${v.id}`).set(auth(t.uniteAdmin)).expect(200);
    const req = det.body.interests.find((i: any) => i.partner === 'Sunrise Traders');
    await api(app).post(`/v1/admin/ventures/${v.id}/interests/${req.id}/decide`).set(auth(t.asha)).send({ decision: 'approved', note: 'Partner trying' }).expect(403);
    await api(app).post(`/v1/admin/ventures/${v.id}/interests/${req.id}/decide`).set(auth(t.uniteAdmin)).send({ decision: 'approved', note: 'Strong Gujarat retail network' }).expect(200);
    await api(app).post(`/v1/admin/ventures/${v.id}/interests/${req.id}/decide`).set(auth(t.uniteAdmin)).send({ decision: 'declined', note: 'Changed mind' }).expect(409);
    const pre = await api(app).post('/v1/admin/offers/audience').set(auth(t.uniteAdmin)).send({ target: { mode: 'promoters' }, ventureId: v.id }).expect(200);
    expect(pre.body.partners.map((p: any) => p.name)).toEqual(['Sunrise Traders']);
    const o = await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send({
      ventureId: v.id, title: 'Onboard 50 shops to Nano Bazar in Ahmedabad', summary: 'Bring local shops online on Nano Bazar; a fixed fee is paid for every shop that publishes its first ten products.', kind: 'marketing', sector: 'local_commerce', regions: ['IN-GJ'],
      target: { mode: 'promoters' }, pricing: 'unite_price', uniteReward: { model: 'fixed_fee', amount: 500_00 }, rewardModels: ['fixed_fee'], maxSelections: 3, deadline: new Date(Date.now() + 10 * 86400_000).toISOString(),
    }).expect(201);
    expect(o.body).toMatchObject({ recipients: 1, venture: { slug: 'nano-bazar', name: 'Nano Bazar' } });
    const mine = await api(app).get('/v1/offers').set(auth(t.ravi)).expect(200);
    expect(mine.body.find((x: any) => x.id === o.body.id).venture.name).toBe('Nano Bazar');
    expect((await api(app).get('/v1/offers').set(auth(t.asha)).expect(200)).body.find((x: any) => x.id === o.body.id)).toBeUndefined();
    const vd = await api(app).get('/v1/ventures/nano-bazar').set(auth(t.ravi)).expect(200);
    expect(vd.body.offers.map((x: any) => x.id)).toContain(o.body.id);
    await api(app).post('/v1/admin/offers/audience').set(auth(t.uniteAdmin)).send({ target: { mode: 'promoters' } }).expect(400); // no business chosen
  });

  it('closed or regulated businesses cannot be offered or opened; a super admin records clearance first', async () => {
    const list = (await api(app).get('/v1/admin/ventures').set(auth(t.uniteAdmin)).expect(200)).body;
    const zuppo = list.find((x: any) => x.slug === 'zuppo');
    const udb = list.find((x: any) => x.slug === 'unite-digital-bank');
    const base = { title: 'Pilot offer for a closed business', summary: 'This offer should be refused because the business is not open to partners yet.', kind: 'marketing', sector: 'local_commerce', target: { mode: 'all' }, pricing: 'partner_quote', rewardModels: ['fixed_fee'], deadline: new Date(Date.now() + 5 * 86400_000).toISOString() };
    await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send({ ...base, ventureId: zuppo.id }).expect(409);
    await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send({ ...base, ventureId: udb.id, sector: 'financial_services' }).expect(409);
    const refused = await api(app).patch(`/v1/admin/ventures/${udb.id}`).set(auth(t.uniteAdmin)).send({ open: true }).expect(409);
    expect(refused.body.message).toMatch(/needs regulatory review/);
    await api(app).post(`/v1/admin/ventures/${udb.id}/clearance`).set(auth(t.uniteAdmin)).send({ note: 'Legal opinion received from counsel' }).expect(403); // super admin only
    await api(app).post(`/v1/admin/ventures/${udb.id}/clearance`).set(auth(t.superadmin)).send({ note: 'Bank partner agreement and legal opinion on file (ref LO-2026-118)' }).expect(200);
    await api(app).patch(`/v1/admin/ventures/${udb.id}`).set(auth(t.uniteAdmin)).send({ open: true, stage: 'pilot' }).expect(200);
    expect((await api(app).get('/v1/ventures').set(auth(t.asha)).expect(200)).body.some((v: any) => v.slug === 'unite-digital-bank')).toBe(true);
    // opening a coming-soon business; a group company admin cannot change another company's business
    await api(app).patch(`/v1/admin/ventures/${zuppo.id}`).set(auth(t.uniteAdmin)).send({ open: true }).expect(200);
    const powertek = list.find((x: any) => x.slug === 'unite-powertek');
    await api(app).patch(`/v1/admin/ventures/${powertek.id}`).set(auth(t.uniteAdmin)).send({ stage: 'pilot' }).expect(403); // Unite Solar admin, Powertek business
    const audit = await one("select count(*)::int n from audit_events where action in ('venture.cleared', 'venture.updated')");
    expect(audit.n).toBeGreaterThanOrEqual(3);
  });

  it('the new sectors work in offers (Unite Learning in Education)', async () => {
    const v = (await api(app).get('/v1/admin/ventures').set(auth(t.uniteAdmin)).expect(200)).body.find((x: any) => x.slug === 'unite-learning');
    const o = await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send({
      ventureId: v.id, title: 'Bring colleges to Unite Learning AI-tools programmes', summary: 'Introduce colleges and schools to Unite Learning technology and AI-tools programmes; fixed fee per signed institution.', kind: 'marketing', sector: 'education',
      target: { mode: 'all' }, pricing: 'unite_price', uniteReward: { model: 'fixed_fee', amount: 25_000_00 }, rewardModels: ['fixed_fee'], maxSelections: 10, deadline: new Date(Date.now() + 10 * 86400_000).toISOString(),
    }).expect(201);
    expect(o.body.sector).toBe('education');
  });
});
