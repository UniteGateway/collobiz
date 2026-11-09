import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

/** Direct offers: Unite Group sends work straight to chosen partners; partners accept terms or quote; Unite selects. */
describe('Direct offers', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  const org = async (name: string) => (await one('select id from organizations where display_name = $1', [name])).id as string;
  const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();
  let n = 0;
  const idem = () => ({ 'Idempotency-Key': `offer-${++n}-${Date.now()}` });
  const offer = (over: Record<string, unknown> = {}) => ({
    title: 'Market our EV chargers to logistics parks', summary: 'Introduce Powertek-style AC and DC chargers to logistics parks and fleet depots; Unite prices and installs, you earn on each sale.',
    kind: 'marketing', sector: 'solar', regions: ['IN-KA'], target: { mode: 'all' }, pricing: 'unite_price', unitePrice: 1_20_000_00, priceUnit: 'per unit',
    uniteReward: { model: 'commission', bps: 500 }, rewardModels: ['commission'], deadline: inDays(14), ...over,
  });
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('only Unite Group administrators send offers; offers reach verified partners only', async () => {
    await api(app).post('/v1/admin/offers').set(auth(t.asha)).set(idem()).send(offer()).expect(403);
    const all = await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send(offer()).expect(201);
    const verified = (await one("select count(*)::int n from organizations where type in ('partner_company','partner_individual') and verification_status = 'verified'")).n;
    expect(all.body.recipients).toBe(verified);
    expect(all.body.code).toMatch(/^DO-\d{4}-\d{6}$/);
    const greenbuild = (await one("select id from organizations where verification_status <> 'verified' and type = 'partner_company' limit 1")).id;
    const bad = await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send(offer({ target: { mode: 'selected', organizationIds: [await org('Volt EPC'), greenbuild] } })).expect(400);
    expect(JSON.stringify(bad.body)).toMatch(/not verified partners/);
    // an unverified partner never sees it
    expect((await api(app).get('/v1/offers').set(auth(t.vikram)).expect(200)).body.find((o: any) => o.id === all.body.id)).toBeUndefined();
    const audit = await one("select count(*)::int n from audit_events where action = 'offer.created' and object_id = $1", [all.body.id]);
    expect(audit.n).toBe(1);
    const note = await one("select count(*)::int n from notifications n join users u on u.id = n.user_id where u.email = 'asha@voltepc.example' and n.kind = 'offer' and n.link = $1", [`/offers/${all.body.id}`]);
    expect(note.n).toBe(1);
  });

  it('a filtered audience uses declared capacity: office and idle manpower', async () => {
    const pre = await api(app).post('/v1/admin/offers/audience').set(auth(t.uniteAdmin)).send({ target: { mode: 'filtered', hasOffice: true, minIdleManpower: 10 } }).expect(200);
    expect(pre.body.partners.map((p: any) => p.name)).toEqual(['Volt EPC']); // 12 idle; Sunrise 4, Deccan 6, Meera has no office
    await api(app).put('/v1/me/capacity').set(auth(t.deepak)).send({ hasOffice: true, officeLocations: ['Bengaluru'], totalManpower: 30, idleManpower: 40 }).expect(400); // idle > total
    await api(app).put('/v1/me/capacity').set(auth(t.deepak)).send({ hasOffice: true, officeLocations: ['Bengaluru', 'Hosur'], totalManpower: 30, idleManpower: 14, lookingFor: ['manpower'] }).expect(200);
    const again = await api(app).post('/v1/admin/offers/audience').set(auth(t.uniteAdmin)).send({ target: { mode: 'filtered', hasOffice: true, minIdleManpower: 10 } }).expect(200);
    expect(again.body.partners.map((p: any) => p.name).sort()).toEqual(['Deccan Distributors', 'Volt EPC']);
    const none = await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send(offer({ target: { mode: 'filtered', minIdleManpower: 5000 } })).expect(400);
    expect(none.body.message).toMatch(/No verified partner/);
  });

  it('fixed terms: partners accept or decline but cannot quote; only recipients see the offer', async () => {
    const o = (await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send(offer({ target: { mode: 'selected', organizationIds: [await org('Volt EPC')] } })).expect(201)).body;
    await api(app).get(`/v1/offers/${o.id}`).set(auth(t.ravi)).expect(404); // Sunrise was not chosen
    const seen = await api(app).get(`/v1/offers/${o.id}`).set(auth(t.asha)).expect(200);
    expect(seen.body.uniteReward.text).toBe('Commission on sales · 5%');
    expect(seen.body.myStatus).toBe('viewed');
    await api(app).post(`/v1/offers/${o.id}/respond`).set(auth(t.asha)).set(idem()).send({ mode: 'proposal', reward: { model: 'commission', bps: 900 }, message: 'We would like a higher commission for this market.' }).expect(400);
    const ok = await api(app).post(`/v1/offers/${o.id}/respond`).set(auth(t.asha)).set(idem()).send({ mode: 'accept_terms', message: 'Accepted. Our Pune sales team will cover logistics parks on the Chakan belt.' }).expect(200);
    expect(ok.body).toMatchObject({ mode: 'accept_terms', price: 1_20_000_00, rewardModel: 'commission', rewardBps: 500 });
  });

  it('quotes: price required, reward must be allowed, office and manpower requirements enforced; edits are versioned', async () => {
    const o = (await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send(offer({
      title: 'Deploy an installation crew for Karnataka rooftops', kind: 'manpower', pricing: 'partner_quote', unitePrice: undefined, priceUnit: undefined, uniteReward: undefined,
      rewardModels: ['fixed_fee', 'profit_share'], needsOffice: true, minManpower: 5, target: { mode: 'selected', organizationIds: [await org('Deccan Distributors'), await org('Volt EPC')] },
    })).expect(201)).body;
    const base = { mode: 'proposal', priceUnit: 'per month', reward: { model: 'fixed_fee', amount: 3_00_000_00 }, manpower: 6, hasOffice: true, officeLocation: 'Hosur', message: 'Six trained installers from our Hosur base, available from next month.' };
    await api(app).post(`/v1/offers/${o.id}/respond`).set(auth(t.deepak)).set(idem()).send({ ...base, mode: 'accept_terms' }).expect(400); // nothing to accept
    await api(app).post(`/v1/offers/${o.id}/respond`).set(auth(t.deepak)).set(idem()).send(base).expect(400); // no price
    await api(app).post(`/v1/offers/${o.id}/respond`).set(auth(t.deepak)).set(idem()).send({ ...base, price: 3_50_000_00, reward: { model: 'equity', bps: 1000 } }).expect(400); // not allowed
    await api(app).post(`/v1/offers/${o.id}/respond`).set(auth(t.deepak)).set(idem()).send({ ...base, price: 3_50_000_00, hasOffice: false, officeLocation: undefined }).expect(400); // needs office
    await api(app).post(`/v1/offers/${o.id}/respond`).set(auth(t.deepak)).set(idem()).send({ ...base, price: 3_50_000_00, manpower: 3 }).expect(400); // too few people
    const first = await api(app).post(`/v1/offers/${o.id}/respond`).set(auth(t.deepak)).set(idem()).send({ ...base, price: 3_50_000_00 }).expect(200);
    expect(first.body.version).toBe(1);
    const second = await api(app).post(`/v1/offers/${o.id}/respond`).set(auth(t.deepak)).set(idem()).send({ ...base, price: 3_20_000_00, reward: { model: 'profit_share', bps: 2000 } }).expect(200);
    expect(second.body).toMatchObject({ version: 2, price: 3_20_000_00, rewardModel: 'profit_share', rewardBps: 2000 });
    expect(second.body.agreementNote).toMatch(/binding only through an agreement/);
    // Unite sees both partners' responses; a partner never sees another's
    await api(app).post(`/v1/offers/${o.id}/respond`).set(auth(t.asha)).set(idem()).send({ ...base, price: 3_90_000_00, officeLocation: 'Pune', manpower: 8, message: 'Eight installers from our Pune office, ready within two weeks.' }).expect(200);
    const mine = await api(app).get(`/v1/offers/${o.id}`).set(auth(t.asha)).expect(200);
    expect(JSON.stringify(mine.body)).not.toMatch(/Deccan|Hosur/);
    const admin = await api(app).get(`/v1/admin/offers/${o.id}`).set(auth(t.uniteAdmin)).expect(200);
    expect(admin.body.responses.map((r: any) => r.partner).sort()).toEqual(['Deccan Distributors', 'Volt EPC']);
    expect(admin.body.responses.find((r: any) => r.partner === 'Deccan Distributors').rewardText).toBe('Profit share · 20%');
    // another group company's admin cannot see or manage it
    await api(app).get(`/v1/admin/offers/${o.id}`).set(auth(t.asha)).expect(403);
  });

  it('selection freezes terms; an exclusive offer closes and tells everyone else; decisions are final', async () => {
    const o = (await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send(offer({
      title: 'Represent Unite Solar in Gujarat (exclusive)', kind: 'local_presence', pricing: 'either', unitePrice: 2_00_000_00, priceUnit: 'per month', uniteReward: { model: 'fixed_fee', amount: 2_00_000_00 },
      rewardModels: ['fixed_fee', 'revenue_share'], exclusive: true, target: { mode: 'selected', organizationIds: [await org('Sunrise Traders'), await org('Volt EPC'), await org('Deccan Distributors')] },
    })).expect(201)).body;
    await api(app).post(`/v1/offers/${o.id}/respond`).set(auth(t.ravi)).set(idem()).send({ mode: 'accept_terms', hasOffice: true, officeLocation: 'Ahmedabad', message: 'Our Ahmedabad office and four sales staff are ready to represent you.' }).expect(200);
    const asha = await api(app).post(`/v1/offers/${o.id}/respond`).set(auth(t.asha)).set(idem()).send({ mode: 'proposal', reward: { model: 'revenue_share', bps: 400 }, message: 'We prefer a revenue share instead of a fixed monthly fee for Gujarat.' }).expect(200);
    await api(app).post(`/v1/offers/${o.id}/decline`).set(auth(t.deepak)).send({ reason: 'Gujarat is outside our network' }).expect(200);
    const det = await api(app).get(`/v1/admin/offers/${o.id}`).set(auth(t.uniteAdmin)).expect(200);
    const sunrise = det.body.responses.find((r: any) => r.partner === 'Sunrise Traders');
    expect(det.body.recipients.find((r: any) => r.name === 'Deccan Distributors')).toMatchObject({ status: 'declined', declineReason: 'Gujarat is outside our network' });
    await api(app).post(`/v1/admin/offers/${o.id}/responses/${sunrise.id}/select`).set(auth(t.asha)).send({ note: 'Self-selection attempt' }).expect(403);
    const sel = await api(app).post(`/v1/admin/offers/${o.id}/responses/${sunrise.id}/select`).set(auth(t.uniteAdmin)).send({ note: 'Existing Ahmedabad office; fixed fee within budget' }).expect(200);
    expect(sel.body).toMatchObject({ status: 'selected', offerClosed: true });
    expect(sel.body.termsHash).toMatch(/^[0-9a-f]{64}$/);
    const lost = await api(app).get(`/v1/offers/${o.id}`).set(auth(t.asha)).expect(200);
    expect(lost.body).toMatchObject({ status: 'closed', myStatus: 'not_selected' });
    expect(lost.body.myResponse.status).toBe('not_selected');
    await api(app).post(`/v1/offers/${o.id}/respond`).set(auth(t.asha)).set(idem()).send({ mode: 'accept_terms', message: 'Trying again after the offer closed, please.' }).expect(409);
    await api(app).post(`/v1/admin/offers/${o.id}/responses/${asha.body.id}/select`).set(auth(t.uniteAdmin)).send({ note: 'Second place' }).expect(409);
    const won = await api(app).get('/v1/offers').set(auth(t.ravi)).expect(200);
    expect(won.body.find((x: any) => x.id === o.id)).toMatchObject({ myStatus: 'selected' });
    const log = await one("select after from audit_events where action = 'offer.selected' and object_id = $1", [o.id]);
    expect(log.after.termsHash).toBe(sel.body.termsHash);
  });

  it('several places: offers stay open until filled; Unite can turn a response down with a reason; withdrawing hides the offer', async () => {
    const o = (await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send(offer({ maxSelections: 2, target: { mode: 'selected', organizationIds: [await org('Volt EPC'), await org('Sunrise Traders'), await org('Deccan Distributors')] } })).expect(201)).body;
    const ids: Record<string, string> = {};
    for (const [k, tok] of [['volt', t.asha], ['sunrise', t.ravi], ['deccan', t.deepak]] as const) ids[k] = (await api(app).post(`/v1/offers/${o.id}/respond`).set(auth(tok)).set(idem()).send({ mode: 'accept_terms', message: 'We accept the commission terms and will start next week.' }).expect(200)).body.id;
    await api(app).post(`/v1/admin/offers/${o.id}/responses/${ids.deccan}/reject`).set(auth(t.uniteAdmin)).send({ note: 'No coverage in the target parks' }).expect(200);
    expect((await api(app).post(`/v1/admin/offers/${o.id}/responses/${ids.volt}/select`).set(auth(t.uniteAdmin)).send({ note: 'Strong Pune network' }).expect(200)).body.offerClosed).toBe(false);
    expect((await api(app).post(`/v1/admin/offers/${o.id}/responses/${ids.sunrise}/select`).set(auth(t.uniteAdmin)).send({ note: 'Gujarat coverage' }).expect(200)).body.offerClosed).toBe(true);
    const w = (await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send(offer({ title: 'Offer sent by mistake to test withdrawal' })).expect(201)).body;
    await api(app).post(`/v1/admin/offers/${w.id}/close`).set(auth(t.uniteAdmin)).send({ reason: 'Sent in error', withdraw: true }).expect(200);
    await api(app).get(`/v1/offers/${w.id}`).set(auth(t.asha)).expect(404);
  });
});
