/**
 * Launch, Capacity calendar, Micro-contracts, Demand pools and Commit on the real API.
 */
import type { INestApplication } from '@nestjs/common';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('Collaboration operations', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); });
  afterAll(async () => { await app?.close(); });
  const post = (p: string, tok: string, b: object = {}) => api(app).post(`/v1${p}`).set(auth(tok)).send(b);
  const get = (p: string, tok: string) => api(app).get(`/v1${p}`).set(auth(tok));

  it('Launch: matches what you have to models and real records; plan progress comes from applications', async () => {
    await post('/launch/match', t.asha, { have: [], invest: 'none', time: 'part_time' }).expect(400);
    const m = (await post('/launch/match', t.asha, { have: ['store', 'customers'], state: 'TG', invest: 'lt5l', time: 'part_time' }).expect(200)).body;
    expect(m.models[0]).toMatchObject({ code: 'store_network' });
    expect(m.models[0].programmes.map((p: any) => p.slug)).toEqual(expect.arrayContaining(['solcart']));
    expect(typeof m.models[0].lookingFor).toBe('number');
    const plan = (await post('/launch/plans', t.asha, { model: 'store_network', profile: { have: ['store'], invest: 'lt5l', time: 'part_time' } }).expect(201)).body;
    expect(plan.code).toMatch(/^LCH-\d{4}-\d{6}$/);
    const list = (await get('/launch/plans', t.asha).expect(200)).body;
    expect(list[0]).toMatchObject({ stageLabel: 'Exploring options', applications: 0 });
    await post(`/launch/plans/${plan.id}/stage`, t.asha, { stage: 2, note: 'Spoke to a franchisor' }).expect(400); // must apply first
    await get(`/launch/plans/${plan.id}`, t.ravi).expect(404);
  });

  it('Capacity: publish, book exact dates, never double-book, calendar shows both sides', async () => {
    const free = (await get('/capacity/offers?type=sqft', t.asha).expect(200)).body;
    expect(free.find((x: any) => x.title.startsWith('Covered warehouse'))).toMatchObject({ units: 3200, free: 3200, demo: true });
    await post('/capacity/offers', t.vikram, { type: 'workers', title: 'Two electricians', units: 2, from: day(1), to: day(5), rateUnit: 'negotiable', state: 'KA' }).expect(403);
    await post('/capacity/offers', t.asha, { type: 'workers', title: 'Two electricians', units: 2, from: day(5), to: day(1), rateUnit: 'negotiable', state: 'KA' }).expect(400);
    const o = (await post('/capacity/offers', t.asha, { type: 'machines', title: 'Hydraulic crimping machines', units: 3, from: day(2), to: day(20), rateUnit: 'day', rate: 800, state: 'TG' }).expect(201)).body;
    await post(`/capacity/offers/${o.id}/book`, t.asha, { units: 1, from: day(3), to: day(4) }).expect(400);
    await post(`/capacity/offers/${o.id}/book`, t.ravi, { units: 4, from: day(3), to: day(4) }).expect(409);
    const b1 = (await post(`/capacity/offers/${o.id}/book`, t.ravi, { units: 2, from: day(3), to: day(6), note: 'Cable lugs job' }).expect(201)).body;
    const b2 = (await post(`/capacity/offers/${o.id}/book`, t.deepak, { units: 2, from: day(5), to: day(8) }).expect(201)).body;
    const board = (await get('/action-os/dashboard', t.asha).expect(200)).body;
    expect(board.items.filter((i: any) => i.sourceApp === 'capacity' && i.kind === 'decision')).toHaveLength(2);
    expect(board.sources.every((x: any) => x.ok)).toBe(true);
    await post(`/capacity/bookings/${b1.id}/decide`, t.ravi, { decision: 'accept' }).expect(404);
    await post(`/capacity/bookings/${b1.id}/decide`, t.asha, { decision: 'accept' }).expect(200);
    await post(`/capacity/bookings/${b2.id}/decide`, t.asha, { decision: 'accept' }).expect(409); // only 1 free on day 5–6
    expect((await get(`/capacity/offers?from=${day(5)}&to=${day(6)}&type=machines`, t.deepak).expect(200)).body.find((x: any) => x.id === o.id).free).toBe(1);
    const mine = (await get('/capacity/mine', t.asha).expect(200)).body;
    expect(mine.requests.map((r: any) => r.status).sort()).toEqual(['accepted', 'requested']);
    const cal = (await get(`/capacity/calendar?month=${day(3).slice(0, 7)}`, t.ravi).expect(200)).body;
    expect(cal.entries.find((e: any) => e.id === b1.id)).toMatchObject({ kind: 'booking', direction: 'mine' });
  });

  it('Micro-contracts: post, apply, choose, submit, revise, accept, pay, confirm', async () => {
    const job = { kind: 'calling', state: 'TG', title: '80 follow-up calls to rooftop leads', scope: 'Call the leads we share, confirm interest and book site visits.', acceptance: 'Call log with an outcome for each lead', quantity: 80, unit: 'calls', priceRs: 2400, due: day(7) };
    await post('/micro', t.asha, { ...job, priceRs: 60000 }).expect(400);
    await post('/micro', t.vikram, job).expect(403);
    const m = (await post('/micro', t.asha, job).expect(201)).body;
    expect(m.code).toMatch(/^MIC-/);
    await post(`/micro/${m.id}/apply`, t.asha, { message: 'Applying to my own job should fail here.' }).expect(400);
    await post(`/micro/${m.id}/apply`, t.ravi, { message: 'Our Ahmedabad calling team can finish this in two days.' }).expect(201);
    await post(`/micro/${m.id}/apply`, t.ravi, { message: 'Our Ahmedabad calling team can finish this in two days.' }).expect(409);
    await post(`/micro/${m.id}/apply`, t.deepak, { message: 'Deccan can do this with our sales desk this week.' }).expect(201);
    const d = (await get(`/micro/${m.id}`, t.asha).expect(200)).body;
    expect(d.applications).toHaveLength(2);
    const ravi = d.applications.find((a: any) => /Sunrise/.test(a.org));
    await post(`/micro/${m.id}/submit`, t.ravi, { delivery: 'Too early to submit anything' }).expect(403);
    await post(`/micro/${m.id}/assign`, t.asha, { applicationId: ravi.id }).expect(200);
    await post(`/micro/${m.id}/submit`, t.deepak, { delivery: 'Not chosen, cannot submit' }).expect(403);
    await post(`/micro/${m.id}/submit`, t.ravi, { delivery: 'Call log uploaded to the shared folder, 80 rows.' }).expect(200);
    await post(`/micro/${m.id}/review`, t.asha, { decision: 'revise' }).expect(400);
    await post(`/micro/${m.id}/review`, t.asha, { decision: 'revise', note: 'Add the visit dates for interested leads.' }).expect(200);
    await post(`/micro/${m.id}/submit`, t.ravi, { delivery: 'Call log updated with visit dates.' }).expect(200);
    await post(`/micro/${m.id}/paid`, t.asha, { paymentRef: 'UTR123456' }).expect(409); // not accepted yet
    await post(`/micro/${m.id}/review`, t.asha, { decision: 'accept' }).expect(200);
    await post(`/micro/${m.id}/confirm-payment`, t.ravi).expect(409);
    await post(`/micro/${m.id}/paid`, t.asha, { paymentRef: 'UTR123456' }).expect(200);
    const done = (await post(`/micro/${m.id}/confirm-payment`, t.ravi).expect(200)).body;
    expect(done).toMatchObject({ status: 'paid', paymentConfirmed: true, isWorker: true });
    await get(`/micro/${m.id}`, t.meera).expect(404); // closed work is private to the parties
  });

  it('Demand pools: suppliers never see buyers; a quote applies only at its minimum; each buyer accepts for itself', async () => {
    const pools = (await get('/pools', t.asha).expect(200)).body;
    const cable = pools.find((p: any) => p.title.startsWith('Copper armoured'));
    expect(cable).toMatchObject({ committed: 10500, buyers: 2, myQty: 4500 });
    await post(`/pools/${cable.id}/quotes`, t.asha, { unitPriceRs: 410, minQty: 10000, validUntil: day(20), terms: 'Ex-works Pune, 30 days' }).expect(400); // a buyer
    await post(`/pools/${cable.id}/quotes`, t.deepak, { unitPriceRs: 395, minQty: 15000, validUntil: day(20), terms: 'Delivered Pune and Ahmedabad, 50% advance' }).expect(201);
    const sup = (await get(`/pools/${cable.id}`, t.deepak).expect(200)).body;
    expect(sup.quotes).toEqual([]); expect(JSON.stringify(sup)).not.toMatch(/Volt|Sunrise/);
    const buyerView = (await get(`/pools/${cable.id}`, t.asha).expect(200)).body;
    const q = buyerView.quotes[0]; expect(q).toMatchObject({ supplier: expect.stringMatching(/Deccan/), applies: false });
    await post(`/pools/${cable.id}/quotes/${q.id}/accept`, t.asha).expect(409);
    await post(`/pools/${cable.id}/join`, t.meera, { qty: 5000 }).expect(200);
    expect((await post(`/pools/${cable.id}/quotes/${q.id}/accept`, t.asha).expect(200)).body.myAcceptedQuoteId).toBe(q.id);
    await post(`/pools/${cable.id}/leave`, t.asha).expect(409);
    const after = (await get(`/pools/${cable.id}`, t.deepak).expect(200)).body;
    expect(after.myQuote.acceptedBuyers).toEqual([expect.objectContaining({ qty: 4500 })]);
    expect(after.myQuote.acceptedBuyers[0].org).toMatch(/Volt/);
    expect(JSON.stringify(after)).not.toMatch(/Sunrise/);
  });

  it('Commit: binding only after every pledge and independently verified condition', async () => {
    const dir = (await get('/launch/directory', t.asha).expect(200)).body;
    const sunrise = dir.find((o: any) => /Sunrise/.test(o.name)).id; const deccan = dir.find((o: any) => /Deccan/.test(o.name)).id; const volt = dir.find((o: any) => /Volt/.test(o.name)).id;
    const c = (await post('/commit', t.asha, {
      title: 'Kurnool 2 MW rooftop cluster', purpose: 'Install 2 MW across five factories if orders, panels and finance all line up.', deadline: day(30), myRole: 'EPC', myPledge: 'Install and commission within 60 days',
      parties: [{ orgId: sunrise, role: 'Panel supplier', pledge: 'Supply 2 MW of modules at the agreed price' }, { orgId: deccan, role: 'Cable supplier', pledge: 'Supply all DC and AC cabling' }],
      conditions: [{ kind: 'buyer_order', text: 'Purchase orders from five factories', ownerOrgId: volt }, { kind: 'financing', text: 'Working-capital line sanctioned', ownerOrgId: sunrise }],
    }).expect(201)).body;
    expect(c).toMatchObject({ state: 'pledging', pledged: 1 });
    await get(`/commit/${c.id}`, t.meera).expect(404);
    await post(`/commit/${c.id}/pledge`, t.ravi, { decision: 'pledge' }).expect(200);
    const own = c.conditions.find((x: any) => x.kind === 'buyer_order');
    await post(`/commit/conditions/${own.id}/evidence`, t.ravi, { evidence: 'Not my condition to prove' }).expect(403);
    await post(`/commit/conditions/${own.id}/evidence`, t.asha, { evidence: 'PO numbers 4411-4415 uploaded to the vault' }).expect(200);
    await post(`/commit/conditions/${own.id}/verify`, t.asha).expect(403); // cannot verify your own
    await post(`/commit/conditions/${own.id}/verify`, t.ravi).expect(200);
    const fin = c.conditions.find((x: any) => x.kind === 'financing');
    await post(`/commit/conditions/${fin.id}/verify`, t.asha).expect(409); // no evidence yet
    await post(`/commit/conditions/${fin.id}/evidence`, t.ravi, { evidence: 'Sanction letter ref WC/2026/118' }).expect(200);
    let s = (await post(`/commit/conditions/${fin.id}/verify`, t.deepak).expect(200)).body;
    expect(s.state).toBe('pledging'); // Deccan has not pledged
    const dk = (await get('/action-os/dashboard', t.deepak).expect(200)).body;
    expect(dk.items.find((i: any) => i.sourceApp === 'commit')).toMatchObject({ kind: 'decision', recordUrl: `/commit/${c.id}` });
    s = (await post(`/commit/${c.id}/pledge`, t.deepak, { decision: 'pledge' }).expect(200)).body;
    expect(s).toMatchObject({ state: 'binding', pledged: 3, verified: 2 }); expect(s.boundAt).toBeTruthy();
    await post(`/commit/${c.id}/withdraw`, t.asha, { reason: 'Changed our mind' }).expect(409);
    expect((await get('/commit/mine', t.deepak).expect(200)).body[0]).toMatchObject({ state: 'binding', myPledged: true });
  });
});
