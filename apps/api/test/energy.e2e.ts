/**
 * Unite Green Park on the real API: listing and moderation, buyer confidentiality until an accepted introduction,
 * one-step deal stages by either party, state map and counters, traders directory.
 */
import type { INestApplication } from '@nestjs/common';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('Unite Green Park', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); });
  afterAll(async () => { await app?.close(); });
  const post = (p: string, tok: string, b: object = {}) => api(app).post(`/v1${p}`).set(auth(tok)).send(b);
  const get = (p: string, tok: string) => api(app).get(`/v1${p}`).set(auth(tok));

  const buyer = { side: 'buyer', category: 'solar_required', title: '6 MW solar power required — Karnataka', company: 'Volt Fabrication Unit', industry: 'Fabrication', state: 'KA', district: 'Tumakuru', discom: 'BESCOM', consumerCategory: 'HT-2a', requiredMw: 6, source: 'solar', currentTariffRsKwh: 7.9, targetRsKwh: 6.2, ppaYears: 10, models: ['open_access'], openAccessEligible: true, storageRequired: false, description: 'Two-shift fabrication unit seeking daytime open-access solar.' };
  let id: string;
  it('demo data, counters and map are live; listings need verification and a staff check', async () => {
    const s = (await get('/energy/summary', t.asha).expect(200)).body;
    expect(s).toMatchObject({ plants: 7, buyers: 4 }); expect(s.mwAvailable).toBe(247); expect(s.disclaimer).toMatch(/not a licensed electricity trader/);
    const map = (await get('/energy/map', t.asha).expect(200)).body;
    expect(map.find((x: any) => x.code === 'TG')).toMatchObject({ demand: 15, net: -15 });
    await post('/energy/listings', t.vikram, buyer).expect(403); // GreenBuild is not verified
    await post('/energy/listings', t.asha, { ...buyer, category: 'wind' }).expect(400);
    const l = (await post('/energy/listings', t.asha, buyer).expect(201)).body;
    id = l.id; expect(l).toMatchObject({ status: 'pending', side: 'buyer' });
    await get(`/energy/listings/${id}`, t.ravi).expect(404); // not live yet
    await post(`/energy/admin/listings/${id}/moderate`, t.ravi, { decision: 'approve' }).expect(403);
    await post(`/energy/admin/listings/${id}/moderate`, t.superadmin, { decision: 'reject' }).expect(400);
    expect((await post(`/energy/admin/listings/${id}/moderate`, t.superadmin, { decision: 'approve' }).expect(200)).body.status).toBe('live');
  });

  it('buyer identity stays hidden until the buyer accepts an introduction', async () => {
    const seen = (await get(`/energy/listings/${id}`, t.ravi).expect(200)).body;
    expect(seen).toMatchObject({ owner: 'Confidential buyer', district: null, private: null });
    expect(JSON.stringify(seen)).not.toMatch(/Volt Fabrication|BESCOM|Tumakuru/);
    await post(`/energy/listings/${id}/introductions`, t.asha, { message: 'This is our own listing, should fail here.' }).expect(400);
    await post(`/energy/listings/${id}/introductions`, t.ravi, { message: 'short' }).expect(400);
    const intro = (await post(`/energy/listings/${id}/introductions`, t.ravi, { message: 'Sunrise can supply 6 MW from our Kutch plant via open access.' }).expect(201)).body;
    await post(`/energy/listings/${id}/introductions`, t.ravi, { message: 'Sunrise can supply 6 MW from our Kutch plant via open access.' }).expect(409);
    await post(`/energy/introductions/${intro.id}/stage`, t.ravi, { stage: 1, note: 'trying early' }).expect(409);
    await post(`/energy/introductions/${intro.id}/decide`, t.ravi, { decision: 'accept' }).expect(404); // only the owner decides
    await post(`/energy/introductions/${intro.id}/decide`, t.asha, { decision: 'accept' }).expect(200);
    const after = (await get(`/energy/listings/${id}`, t.ravi).expect(200)).body;
    expect(after.private).toMatchObject({ company: 'Volt Fabrication Unit', discom: 'BESCOM' }); expect(after.district).toBe('Tumakuru');
    expect(after.myIntroduction).toMatchObject({ status: 'accepted', stage: 1 });
    // Deal stages: one step at a time, by either party, with a note.
    await post(`/energy/introductions/${intro.id}/stage`, t.ravi, { stage: 3, note: 'skip ahead' }).expect(400);
    expect((await post(`/energy/introductions/${intro.id}/stage`, t.ravi, { stage: 2, note: 'Mutual NDA signed on 18 Nov' }).expect(200)).body.stageLabel).toBe('NDA signed');
    expect((await post(`/energy/introductions/${intro.id}/stage`, t.asha, { stage: 3, note: 'Load profile shared' }).expect(200)).body.stage).toBe(3);
    await post(`/energy/introductions/${intro.id}/stage`, t.deepak, { stage: 4, note: 'not a party' }).expect(404);
    const mine = (await get('/energy/mine', t.ravi).expect(200)).body;
    expect(mine.introductions[0]).toMatchObject({ direction: 'sent', stage: 3, stageLabel: 'Load profile shared' });
  });

  it('traders directory shows check status; only staff add entries', async () => {
    const tr = (await get('/energy/traders', t.asha).expect(200)).body;
    expect(tr.every((x: any) => x.status === 'Demo — not verified')).toBe(true);
    await post('/energy/admin/traders', t.asha, { name: 'Some Trader', licenceNo: 'ABC-1', authority: 'CERC', category: 'Category I', validUntil: '2030-01-01' }).expect(403);
    await post('/energy/admin/traders', t.superadmin, { name: 'Checked Trader Pvt Ltd', licenceNo: 'TEST/CERC/0099', authority: 'CERC', category: 'Category III', validUntil: '2029-12-31', verified: true }).expect(201);
    expect((await get('/energy/traders', t.asha).expect(200)).body[0]).toMatchObject({ name: 'Checked Trader Pvt Ltd', status: 'Valid · checked' });
  });
});
