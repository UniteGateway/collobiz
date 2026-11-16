/** Community presence and wall; group-investment offers with non-binding interest behind a regulatory gate. */
import type { INestApplication } from '@nestjs/common';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

const L = 100_000_00;
describe('Community and group investments', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); });
  afterAll(async () => { await app?.close(); });
  const post = (p: string, tok: string, b: object = {}) => api(app).post(`/v1${p}`).set(auth(tok)).send(b);
  const get = (p: string, tok: string) => api(app).get(`/v1${p}`).set(auth(tok));

  it('shows who is online (unless they hide it), never yourself', async () => {
    await post('/community/heartbeat', t.asha).expect(200);
    await post('/community/heartbeat', t.meera).expect(200);
    await post('/community/heartbeat', t.ravi).expect(200);
    const seen = (await get('/community/online', t.asha).expect(200)).body;
    expect(seen.members.map((m: { name: string }) => m.name)).toEqual(expect.arrayContaining(['Meera Iyer']));
    expect(seen.members.some((m: { name: string }) => m.name.startsWith('Asha'))).toBe(false);
    await post('/community/presence', t.meera, { visible: false }).expect(200);
    expect((await get('/community/online', t.asha)).body.members.some((m: { name: string }) => m.name === 'Meera Iyer')).toBe(false);
    await api(app).get('/v1/community/online').expect(401);
  });

  let postId: string;
  it('verified members post; everyone signed in likes and comments; reports reach moderators who can remove', async () => {
    await post('/community/posts', t.vikram, { body: 'Hello all' }).expect((r) => expect([403]).toContain(r.status));
    postId = (await post('/community/posts', t.asha, { body: 'Looking for a structural engineer in Pune for a 2 MW rooftop.', topic: 'opportunity' }).expect(201)).body.id;
    expect((await post(`/community/posts/${postId}/like`, t.meera).expect(200)).body).toEqual({ liked: true, likes: 1 });
    expect((await post(`/community/posts/${postId}/like`, t.meera).expect(200)).body).toEqual({ liked: false, likes: 0 });
    await post(`/community/posts/${postId}/comments`, t.ravi, { body: 'I can introduce you to one — messaging you.' }).expect(201);
    const wall = (await get('/community/posts?topic=opportunity', t.meera).expect(200)).body;
    expect(wall[0]).toMatchObject({ topic: 'opportunity', comments: 1, author: expect.stringMatching(/Asha/) });
    await post(`/community/posts/${postId}/report`, t.ravi, { reason: 'Testing the report flow' }).expect(200);
    expect((await get('/admin/community/reported', t.uniteAdmin).expect(200)).body[0].id).toBe(postId);
    await post(`/community/posts/${postId}/remove`, t.ravi, { reason: 'Not mine to remove' }).expect(403);
    await post(`/community/posts/${postId}/remove`, t.uniteAdmin, { reason: 'Moderation test' }).expect(200);
    expect((await get('/community/posts', t.meera)).body.some((p: { id: string }) => p.id === postId)).toBe(false);
  });

  let offer: string;
  it('group investment: interest only, pro-rata rent shown, units capped, regulatory clearance only by a super admin', async () => {
    const o = { title: 'Grade-A office floor share — Gachibowli', kind: 'property_share', summary: 'A leased office floor offered in square-foot shares; rent shared pro rata.', location: 'Gachibowli, Hyderabad', totalUnits: 10000, unitPrice: 9_000_00, minUnits: 100, projectedMonthlyRent: 6 * L, lockInMonths: 36, sponsor: 'ProDeal (sample offer)' };
    await post('/admin/invest/offers', t.asha, o).expect(403);
    offer = (await post('/admin/invest/offers', t.uniteAdmin, o).expect(201)).body.id;
    expect((await get('/invest/offers', t.asha)).body).toHaveLength(0); // drafts are not shown
    await post(`/admin/invest/offers/${offer}/status`, t.uniteAdmin, { to: 'interest_open' }).expect(200);
    const list = (await get('/invest/offers', t.asha).expect(200)).body;
    expect(list[0]).toMatchObject({ rentPerUnitMonth: 6000, grossYieldPct: 8, regulatoryStatus: 'pending', assetValue: 9 * 100 * L });
    expect(list[0].notice).toMatch(/does not take money or allot units/);
    await post(`/invest/offers/${offer}/interest`, t.vikram, { units: 200 }).expect(403); // KYC first
    await post(`/invest/offers/${offer}/interest`, t.asha, { units: 50 }).expect(400); // below minimum
    const mine = (await post(`/invest/offers/${offer}/interest`, t.asha, { units: 2500 }).expect(200)).body;
    expect(mine).toMatchObject({ units: 2500, monthlyRentShare: 1_50_000_00, amount: 2500 * 9_000_00 });
    await post(`/invest/offers/${offer}/interest`, t.meera, { units: 8000 }).expect(400); // only 7,500 left
    await post(`/invest/offers/${offer}/interest`, t.meera, { units: 7500 }).expect(200);
    await post(`/invest/offers/${offer}/interest`, t.asha, { units: 3000 }).expect(400); // own update counts against others
    const one = (await get(`/invest/offers/${offer}`, t.asha).expect(200)).body;
    expect(one).toMatchObject({ subscribedPct: 100, interestedMembers: 2, mine: { units: 2500 } });
    await post(`/admin/invest/offers/${offer}/clearance`, t.uniteAdmin, { reference: 'SEBI/SMREIT/IN/2026/001', note: 'Registration confirmed by counsel.' }).expect(403);
    const c = (await post(`/admin/invest/offers/${offer}/clearance`, t.superadmin, { reference: 'Pending — demo only', note: 'Recorded in the test to exercise the gate.' }).expect(200)).body;
    expect(c.regulatoryStatus).toBe('cleared');
    const book = (await get(`/admin/invest/offers/${offer}/interests`, t.uniteAdmin).expect(200)).body;
    expect(book.reduce((a: number, b: { monthlyRentShare: number }) => a + b.monthlyRentShare, 0)).toBe(6 * L);
    await post(`/invest/offers/${offer}/withdraw`, t.meera).expect(200);
    expect((await get(`/invest/offers/${offer}`, t.asha)).body.availableUnits).toBe(7500);
  });
});
