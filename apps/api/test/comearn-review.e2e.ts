/**
 * COMEARN part 3 — Unite review before publishing (negotiation, margin, release), member-facing rate, Unite margin on each
 * commission, ratings after payment, Unite Guaranteed gated on legally reviewed terms, and labelled sample listings.
 */
import type { INestApplication } from '@nestjs/common';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

const L = 1e5 * 100; const CR = 1e7 * 100;
const opp = { title: 'Rooftop solar for schools', type: 'sales_conversion', category: 'solar', description: 'Introduce schools that want rooftop solar; we design, install and maintain.', territory: 'Telangana', estimatedValuePaise: 1 * CR, model: 'percent', rateBps: 300, trigger: 'customer_payment', paymentDays: 30 };
const lead = { customerName: 'Sri Vidya School', city: 'Warangal', contactName: 'Principal', phone: '9000022222', requirement: 'Wants 100 kW rooftop solar on the main block', consent: true };

describe('COMEARN part 3', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); });
  afterAll(async () => { await app?.close(); });
  const get = (p: string, tok: string) => api(app).get(`/v1${p}`).set(auth(tok));
  const post = (p: string, b: object, tok: string) => api(app).post(`/v1${p}`).set(auth(tok)).send(b);
  const put = (p: string, b: object, tok: string) => api(app).put(`/v1${p}`).set(auth(tok)).send(b);
  let id = ''; let engId = '';

  it('companies cannot publish directly — they submit; members see nothing until Unite releases', async () => {
    id = (await post('/comearn/opportunities', opp, t.asha).expect(201)).body.id;
    await post(`/comearn/opportunities/${id}/status`, { status: 'live' }, t.asha).expect(409);
    expect((await post(`/comearn/opportunities/${id}/status`, { status: 'submit' }, t.asha).expect(200)).body.status).toBe('in_review');
    await get(`/comearn/opportunities/${id}`, t.ravi).expect(404);
    const o = (await get('/admin/comearn/overview', t.uniteAdmin).expect(200)).body;
    expect(o.review.map((x: { id: string }) => x.id)).toContain(id);
  });

  it('Unite negotiates; the company accepts the counter; Unite releases with its margin; members see the net rate', async () => {
    await post(`/admin/comearn/opportunities/${id}/counter`, { rateBps: 500, note: 'Members respond better at 5%; we suggest raising it.' }, t.asha).expect(403);
    const n = (await post(`/admin/comearn/opportunities/${id}/counter`, { rateBps: 500, note: 'Members respond better at 5%; we suggest raising it.' }, t.uniteAdmin).expect(201)).body;
    await post(`/admin/comearn/opportunities/${id}/release`, { marginBps: 100 }, t.uniteAdmin).expect(409); // waiting for the company
    const mine = (await get('/comearn/offer', t.asha).expect(200)).body.opportunities.find((x: { id: string }) => x.id === id);
    expect(mine).toMatchObject({ status: 'negotiating', openCounter: { id: n.id, proposedRateBps: 500 } });
    await post(`/comearn/negotiations/${n.id}/respond`, { decision: 'accept' }, t.ravi).expect(404);
    await post(`/comearn/negotiations/${n.id}/respond`, { decision: 'accept', note: 'Agreed.' }, t.asha).expect(200);
    await post(`/admin/comearn/opportunities/${id}/release`, { marginBps: 500 }, t.uniteAdmin).expect(400); // nothing left for members
    const r = (await post(`/admin/comearn/opportunities/${id}/release`, { marginBps: 100, note: 'Released at 4% to members.' }, t.uniteAdmin).expect(200)).body;
    expect(r.member).toMatchObject({ rateBps: 400, marginBps: 100 });
    const asMember = (await get(`/comearn/opportunities/${id}`, t.ravi).expect(200)).body;
    expect(asMember).toMatchObject({ rateBps: 400, potentialPaise: 4 * L }); expect(asMember.companyRateBps).toBeUndefined(); expect(asMember.uniteMarginBps).toBeUndefined();
    const asCompany = (await get(`/comearn/opportunities/${id}`, t.asha).expect(200)).body;
    expect(asCompany).toMatchObject({ companyRateBps: 500, uniteMarginBps: 100, rateBps: 400 });
  });

  it('each commission records the member share and the Unite margin separately; editing sends the listing back to review', async () => {
    const j = (await post(`/comearn/opportunities/${id}/join`, {}, t.ravi).expect(201)).body;
    engId = j.id; expect(j.agreement).toMatch(/4% of the verified business value/);
    await post(`/comearn/engagements/${engId}/accept`, { termsHash: j.termsHash, confirm: true }, t.ravi).expect(200);
    await post(`/comearn/engagements/${engId}/lead`, lead, t.ravi).expect(201);
    for (const s of [{ stage: 'quoted' }, { stage: 'order_confirmed', amountPaise: 1 * CR }]) await post(`/comearn/engagements/${engId}/stage`, s, t.asha).expect(200);
    const v = (await post(`/comearn/engagements/${engId}/stage`, { stage: 'payment_verified', amountPaise: 1 * CR, reference: 'UTR-77' }, t.asha).expect(200)).body;
    expect(v.commission).toMatchObject({ grossPaise: 4 * L, uniteMarginPaise: 1 * L });
    const u = (await put(`/comearn/opportunities/${id}`, { ...opp, rateBps: 600 }, t.asha).expect(200)).body;
    expect(u.status).toBe('in_review');
    await get(`/comearn/opportunities/${id}`, t.deepak).expect(404);
    await post(`/comearn/opportunities/${id}/status`, { status: 'live' }, t.asha).expect(409); // needs re-release
  });

  it('ratings open after payment, one per side, and show on listings; no ratings means null, never a default', async () => {
    await post(`/comearn/engagements/${engId}/rate`, { stars: 5 }, t.ravi).expect(409); // not paid yet
    await post(`/comearn/engagements/${engId}/stage`, { stage: 'commission_approved' }, t.asha).expect(200);
    await post(`/comearn/engagements/${engId}/stage`, { stage: 'commission_paid', reference: 'NEFT-5', tdsPaise: 0 }, t.asha).expect(200);
    await post(`/comearn/engagements/${engId}/rate`, { stars: 6 }, t.ravi).expect(400);
    await post(`/comearn/engagements/${engId}/rate`, { stars: 5, comment: 'Paid on time, clear updates.' }, t.ravi).expect(201);
    await post(`/comearn/engagements/${engId}/rate`, { stars: 4 }, t.ravi).expect(409);
    await post(`/comearn/engagements/${engId}/rate`, { stars: 4 }, t.asha).expect(201);
    await post(`/comearn/engagements/${engId}/rate`, { stars: 4 }, t.deepak).expect(404);
    await post(`/admin/comearn/opportunities/${id}/release`, { marginBps: 100 }, t.uniteAdmin).expect(200);
    const list = (await get('/comearn/opportunities', t.deepak).expect(200)).body.items;
    expect(list.find((x: { id: string }) => x.id === id).rating).toEqual({ avg: 5, count: 1 });
    const other = (await post('/comearn/opportunities', { ...opp, title: 'Inverters for installers' }, t.vikram).expect(201)).body;
    void other;
  });

  it('Unite Guaranteed needs a super admin and legally reviewed terms', async () => {
    await put(`/admin/comearn/opportunities/${id}/guarantee`, { on: true }, t.uniteAdmin).expect(403);
    await put(`/admin/comearn/opportunities/${id}/guarantee`, { on: true }, t.superadmin).expect(409); // no terms yet
    await put('/admin/comearn/settings', { platformFeeBps: 0, feePayer: 'company', restrictedCategories: ['real_estate'], legalReviewed: false, guaranteeTerms: 'If the paying company does not pay an approved commission within 30 days of its due date, Unite pays it and recovers it from the company.', guaranteeLegalReviewed: true }, t.superadmin).expect(200);
    await put(`/admin/comearn/opportunities/${id}/guarantee`, { on: true }, t.superadmin).expect(200);
    const d = (await get(`/comearn/opportunities/${id}`, t.deepak).expect(200)).body;
    expect(d).toMatchObject({ uniteGuaranteed: true }); expect(d.guaranteeTerms).toMatch(/Unite pays it/);
    expect((await get('/comearn/opportunities?guaranteed=1', t.deepak).expect(200)).body.items.map((x: { id: string }) => x.id)).toEqual([id]);
  });

  it('sample listings are created once, labelled Sample and left out of the counts', async () => {
    await post('/admin/comearn/samples', {}, t.ravi).expect(403);
    const a = (await post('/admin/comearn/samples', {}, t.uniteAdmin).expect(201)).body;
    expect(a.created).toBeGreaterThan(20);
    expect((await post('/admin/comearn/samples', {}, t.uniteAdmin).expect(201)).body.created).toBe(0);
    const items = (await get('/comearn/opportunities', t.deepak).expect(200)).body.items;
    expect(items.filter((x: { sample: boolean }) => x.sample).length).toBe(a.created);
    const o = (await get('/admin/comearn/overview', t.uniteAdmin).expect(200)).body;
    expect(o.counts.samples).toBe(a.created); expect(o.counts.live).toBe(1);
  });
});
