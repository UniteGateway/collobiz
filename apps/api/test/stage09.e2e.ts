import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import type { SeedRefs } from '../src/db/seed';

const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();
const technical = (approach: string) => ({ approach, experience: 'Operated 60 MW of ground-mount plants for C&I clients since 2019.', timelineWeeks: 6, team: '1 site manager, 4 technicians' });
const commercial = (amount: number) => ({ amount, validityDays: 90, paymentTerms: 'Quarterly in arrears, 30 days from invoice' });

describe('Stage 09 — tenders & sealed bids (gate: sealed-bid boundaries and evaluator controls)', () => {
  let app: INestApplication;
  let refs: SeedRefs;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  let tender: any;
  let ashaBid: string;
  let raviBid: string;
  const SECRET_APPROACH = 'Robotic dry-cleaning with drone thermography every fortnight';

  beforeAll(async () => { await resetDatabase(); refs = await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  const draft = { title: 'Inverter replacement at Chakan rooftop', scope: 'Supply and replace six 100 kW string inverters at the Chakan rooftop plant with commissioning and SCADA integration.', sector: 'solar', closesAt: inDays(5), budget: 12_00_000_00, techWeight: 70, minTechScore: 60 };

  it('066 only verified organizations with tender.issue can create; publishing needs documents and evaluators', async () => {
    await api(app).post('/v1/tenders').set(auth(t.vikram)).send(draft).expect(403); // not verified
    await api(app).post('/v1/tenders').set(auth(t.rohit)).send(draft).expect(403); // org_member lacks tender.issue
    await api(app).post('/v1/tenders').set(auth(t.uniteAdmin)).send({ ...draft, title: 'x' }).expect(400);
    const r = await api(app).post('/v1/tenders').set(auth(t.uniteAdmin)).send(draft).expect(201);
    tender = r.body;
    expect(tender).toMatchObject({ status: 'draft', code: expect.stringMatching(/^TND-\d{4}-\d{6}$/) });
    const p = await api(app).post(`/v1/tenders/${tender.id}/publish`).set(auth(t.uniteAdmin)).expect(400);
    expect(p.body.problems).toEqual(expect.arrayContaining(['Upload at least one tender document', 'Assign at least one technical evaluator', 'Assign at least one commercial evaluator']));
    // Drafts are invisible to partners
    await api(app).get(`/v1/tenders/${tender.id}`).set(auth(t.asha)).expect(404);
  });

  it('067 documents and evaluator assignment: evaluators must belong to the issuer', async () => {
    await api(app).post(`/v1/tenders/${tender.id}/documents`).set(auth(t.uniteAdmin)).field('title', 'Inverter datasheet & BoQ').attach('file', Buffer.from('%PDF-1.4 boq'), { filename: 'boq.pdf', contentType: 'application/pdf' }).expect(201);
    await api(app).post(`/v1/tenders/${tender.id}/documents`).set(auth(t.asha)).field('title', 'x').attach('file', Buffer.from('%PDF-1.4 x'), { filename: 'x.pdf', contentType: 'application/pdf' }).expect(403);
    const bad = await api(app).post(`/v1/tenders/${tender.id}/evaluators`).set(auth(t.uniteAdmin)).send({ userId: refs.users.asha, role: 'technical' }).expect(400);
    expect(bad.body.fields.userId).toMatch(/members of the issuing organization/);
    await api(app).post(`/v1/tenders/${tender.id}/evaluators`).set(auth(t.uniteAdmin)).send({ userId: refs.users.evaluator, role: 'technical' }).expect(201);
    await api(app).post(`/v1/tenders/${tender.id}/evaluators`).set(auth(t.uniteAdmin)).send({ userId: refs.users.uniteAdmin, role: 'commercial' }).expect(201);
    // closing time must be at least an hour away
    await api(app).patch(`/v1/tenders/${tender.id}`).set(auth(t.uniteAdmin)).send({ closesAt: new Date(Date.now() + 10 * 60_000).toISOString() }).expect(200);
    const early = await api(app).post(`/v1/tenders/${tender.id}/publish`).set(auth(t.uniteAdmin)).expect(400);
    expect(early.body.problems[0]).toMatch(/at least one hour/);
    await api(app).patch(`/v1/tenders/${tender.id}`).set(auth(t.uniteAdmin)).send({ closesAt: inDays(3) }).expect(200);
    const pub = await api(app).post(`/v1/tenders/${tender.id}/publish`).set(auth(t.uniteAdmin)).expect(200);
    expect(pub.body.status).toBe('published');
    await api(app).patch(`/v1/tenders/${tender.id}`).set(auth(t.uniteAdmin)).send({ title: 'Changed after publishing' }).expect(409);
    const docs = await api(app).get(`/v1/tenders/${tender.id}/documents`).set(auth(t.ravi)).expect(200);
    expect(docs.body[0]).toMatchObject({ title: 'Inverter datasheet & BoQ', addendum: false });
    expect(docs.body[0].objectKey).toBeUndefined();
    const url = await api(app).get(`/v1/tenders/${tender.id}/documents/${docs.body[0].id}/url`).set(auth(t.ravi)).expect(200);
    expect(url.body.url).toMatch(/sig=/);
  });

  it('065 dashboard: partners see open tenders with eligibility; unverified partners cannot see them', async () => {
    const d = await api(app).get('/v1/tenders').set(auth(t.ravi)).expect(200);
    expect(d.body.open.map((x: any) => x.id)).toContain(tender.id);
    expect(d.body.open.find((x: any) => x.id === tender.id).version).toBeUndefined();
    const i = await api(app).get('/v1/tenders').set(auth(t.uniteAdmin)).expect(200);
    expect(i.body.issued.find((x: any) => x.id === tender.id).bidCount).toBe(0);
    const e = await api(app).get('/v1/tenders').set(auth(t.evaluator)).expect(200);
    expect(e.body.evaluating.find((x: any) => x.id === tender.id).evaluatorRole).toBe('technical');
    const det = await api(app).get(`/v1/tenders/${tender.id}`).set(auth(t.asha)).expect(200);
    expect(det.body).toMatchObject({ role: 'bidder', biddingOpen: true, eligibility: { eligible: true } });
    expect(det.body.evaluators).toBeUndefined();
    await api(app).get(`/v1/tenders/${tender.id}`).set(auth(t.vikram)).expect(404);
  });

  it('068 bids are sealed: encrypted at rest, unreadable by issuer/evaluators/admins, and immutable once submitted', async () => {
    await api(app).put(`/v1/tenders/${tender.id}/bid`).set(auth(t.asha)).send({ technical: technical('short'), commercial: commercial(0) }).expect(400);
    await api(app).put(`/v1/tenders/${tender.id}/bid`).set(auth(t.asha)).send({ technical: technical(SECRET_APPROACH), commercial: commercial(10_50_000_00) }).expect(200);
    await api(app).put(`/v1/tenders/${tender.id}/bid`).set(auth(t.uniteAdmin)).send({ technical: technical(SECRET_APPROACH), commercial: commercial(1) }).expect(403); // issuer cannot bid
    const sub = await api(app).post(`/v1/tenders/${tender.id}/bid/submit`).set(auth(t.asha)).set('Idempotency-Key', 'bid-submit-asha-1').expect(200);
    expect(sub.body.sealedHash).toMatch(/^[0-9a-f]{64}$/);
    ashaBid = sub.body.id;
    const replay = await api(app).post(`/v1/tenders/${tender.id}/bid/submit`).set(auth(t.asha)).set('Idempotency-Key', 'bid-submit-asha-1').expect(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
    await api(app).put(`/v1/tenders/${tender.id}/bid`).set(auth(t.asha)).send({ technical: technical(SECRET_APPROACH), commercial: commercial(9_00_000_00) }).expect(409);

    // Ravi submits, withdraws, and resubmits at a different price
    await api(app).put(`/v1/tenders/${tender.id}/bid`).set(auth(t.ravi)).send({ technical: technical('Manual wet cleaning with monthly IV-curve tracing of strings'), commercial: commercial(9_80_000_00) }).expect(200);
    await api(app).post(`/v1/tenders/${tender.id}/bid/submit`).set(auth(t.ravi)).set('Idempotency-Key', 'stage09-key-001').expect(200);
    await api(app).post(`/v1/tenders/${tender.id}/bid/withdraw`).set(auth(t.ravi)).expect(200);
    await api(app).put(`/v1/tenders/${tender.id}/bid`).set(auth(t.ravi)).send({ technical: technical('Manual wet cleaning with monthly IV-curve tracing of strings'), commercial: commercial(9_20_000_00) }).expect(200);
    raviBid = (await api(app).post(`/v1/tenders/${tender.id}/bid/submit`).set(auth(t.ravi)).set('Idempotency-Key', 'stage09-key-002').expect(200)).body.id;
    const own = await api(app).get(`/v1/tenders/${tender.id}/bid`).set(auth(t.ravi)).expect(200);
    expect(own.body).toMatchObject({ status: 'submitted', withdrawnBefore: 1, commercial: { amount: 9_20_000_00 } });
    expect(JSON.stringify(own.body)).not.toContain(SECRET_APPROACH);
    // Meera only saves a draft
    await api(app).put(`/v1/tenders/${tender.id}/bid`).set(auth(t.meera)).send({ technical: technical('Advisory-led O&M with a subcontracted crew'), commercial: commercial(8_00_000_00) }).expect(200);

    // Encrypted at rest
    const raw = await pool.query('select technical_enc, commercial_enc from bids where id = $1', [ashaBid]);
    expect(raw.rows[0].technical_enc).toMatch(/^v1:/);
    expect(raw.rows[0].technical_enc).not.toContain('Robotic');
    // Nobody on the issuing side can read content before opening
    await api(app).get(`/v1/tenders/${tender.id}/technical`).set(auth(t.evaluator)).expect(409);
    await api(app).get(`/v1/tenders/${tender.id}/commercial`).set(auth(t.uniteAdmin)).expect(409);
    await api(app).get(`/v1/tenders/${tender.id}/comparison`).set(auth(t.uniteAdmin)).expect(409);
    await api(app).get(`/v1/tenders/${tender.id}/bid`).set(auth(t.uniteAdmin)).expect(404);
    const adm = await api(app).get(`/v1/admin/tenders/${tender.id}`).set(auth(t.superadmin)).expect(200);
    expect(JSON.stringify(adm.body)).not.toMatch(/Robotic|technicalEnc|commercialEnc|1050000/);
    const det = await api(app).get(`/v1/tenders/${tender.id}`).set(auth(t.uniteAdmin)).expect(200);
    expect(det.body.bidCount).toBe(2);
  });

  it('eligibility rules are enforced at submission', async () => {
    const r = await api(app).post('/v1/tenders').set(auth(t.uniteAdmin)).send({ ...draft, title: 'Certified partners only: transformer supply', eligibility: { minLevel: 'certified', sectors: ['solar'], certifications: ['BIS'] } }).expect(201);
    const id = r.body.id;
    await api(app).post(`/v1/tenders/${id}/documents`).set(auth(t.uniteAdmin)).field('title', 'Specification').attach('file', Buffer.from('%PDF-1.4 s'), { filename: 's.pdf', contentType: 'application/pdf' }).expect(201);
    await api(app).post(`/v1/tenders/${id}/evaluators`).set(auth(t.uniteAdmin)).send({ userId: refs.users.evaluator, role: 'both' }).expect(201);
    await api(app).post(`/v1/tenders/${id}/publish`).set(auth(t.uniteAdmin)).expect(200);
    const el = await api(app).get(`/v1/tenders/${id}/eligibility`).set(auth(t.asha)).expect(200);
    expect(el.body.eligible).toBe(false);
    expect(el.body.checks.filter((c: any) => !c.ok).map((c: any) => c.key)).toEqual(expect.arrayContaining(['level', 'cert:BIS']));
    await api(app).put(`/v1/tenders/${id}/bid`).set(auth(t.asha)).send({ technical: technical(SECRET_APPROACH), commercial: commercial(100) }).expect(200);
    const s = await api(app).post(`/v1/tenders/${id}/bid/submit`).set(auth(t.asha)).set('Idempotency-Key', 'stage09-key-003').expect(403);
    expect(s.body.checks.length).toBeGreaterThan(0);
    expect((await api(app).get(`/v1/tenders/${id}/eligibility`).set(auth(t.ravi)).expect(200)).body.eligible).toBe(true);
  });

  it('closing is time-bound: no early close or opening; late submissions are refused; drafts lapse', async () => {
    await api(app).post(`/v1/tenders/${tender.id}/close`).set(auth(t.uniteAdmin)).expect(409);
    await api(app).post(`/v1/tenders/${tender.id}/open`).set(auth(t.uniteAdmin)).expect(409);
    await pool.query("update tenders set closes_at = now() - interval '1 minute' where id = $1", [tender.id]);
    await api(app).post(`/v1/tenders/${tender.id}/bid/submit`).set(auth(t.meera)).set('Idempotency-Key', 'stage09-key-004').expect(409);
    await api(app).post(`/v1/tenders/${tender.id}/bid/withdraw`).set(auth(t.asha)).expect(409);
    await api(app).post(`/v1/tenders/${tender.id}/close`).set(auth(t.asha)).expect(403);
    const c = await api(app).post(`/v1/tenders/${tender.id}/close`).set(auth(t.uniteAdmin)).expect(200);
    expect(c.body.status).toBe('closed');
    const left = await pool.query("select count(*)::int n from bids where tender_id = $1 and status = 'draft'", [tender.id]);
    expect(left.rows[0].n).toBe(0);
    await api(app).get(`/v1/tenders/${tender.id}`).set(auth(t.meera)).expect(404); // never bid → no access after closing
  });

  it('opening verifies every seal and blocks evaluators with a conflict of interest', async () => {
    // Evaluator joins a bidding organization → opening is blocked
    await pool.query("insert into memberships (user_id, organization_id, role, status) values ($1, $2, 'org_member', 'active')", [refs.users.evaluator, refs.orgs.sunrise]);
    const cf = await api(app).post(`/v1/tenders/${tender.id}/open`).set(auth(t.uniteAdmin)).expect(409);
    expect(cf.body.message).toMatch(/Conflict of interest: Lakshmi Rao.*Sunrise Traders/);
    await pool.query('delete from memberships where user_id = $1 and organization_id = $2', [refs.users.evaluator, refs.orgs.sunrise]);
    // Tampered seal → blocked and audited
    const orig = (await pool.query('select sealed_hash from bids where id = $1', [raviBid])).rows[0].sealed_hash;
    await pool.query("update bids set sealed_hash = repeat('0', 64) where id = $1", [raviBid]);
    const tm = await api(app).post(`/v1/tenders/${tender.id}/open`).set(auth(t.uniteAdmin)).expect(409);
    expect(tm.body.message).toMatch(/Seal verification failed/);
    const ev = await pool.query("select count(*)::int n from audit_events where action = 'tender.seal_violation' and object_id = $1", [tender.id]);
    expect(ev.rows[0].n).toBe(1);
    await pool.query('update bids set sealed_hash = $2 where id = $1', [raviBid, orig]);
    const o = await api(app).post(`/v1/tenders/${tender.id}/open`).set(auth(t.uniteAdmin)).expect(200);
    expect(o.body).toMatchObject({ status: 'technical_evaluation', opened: 2 });
    expect(o.body.integrity.every((i: any) => i.ok)).toBe(true);
    await api(app).post(`/v1/tenders/${tender.id}/evaluators`).set(auth(t.uniteAdmin)).send({ userId: refs.users.uniteAdmin, role: 'both' }).expect(409); // frozen after opening
  });

  it('070 technical evaluation: technical envelopes only; scores by assigned evaluators, once each', async () => {
    const r = await api(app).get(`/v1/tenders/${tender.id}/technical`).set(auth(t.evaluator)).expect(200);
    expect(r.body.canScore).toBe(true);
    expect(r.body.bids.map((b: any) => b.technical.approach)).toContain(SECRET_APPROACH);
    expect(JSON.stringify(r.body)).not.toMatch(/1050000|920000|paymentTerms/);
    await api(app).get(`/v1/tenders/${tender.id}/commercial`).set(auth(t.uniteAdmin)).expect(409); // still sealed
    await api(app).post(`/v1/tenders/${tender.id}/bids/${ashaBid}/scores`).set(auth(t.uniteAdmin)).send({ kind: 'technical', score: 99, comment: 'Not my envelope' }).expect(403);
    await api(app).post(`/v1/tenders/${tender.id}/bids/${ashaBid}/scores`).set(auth(t.asha)).send({ kind: 'technical', score: 100, comment: 'Self-scoring' }).expect(403);
    await api(app).post(`/v1/tenders/${tender.id}/technical/complete`).set(auth(t.uniteAdmin)).expect(409); // incomplete
    await api(app).post(`/v1/tenders/${tender.id}/bids/${ashaBid}/scores`).set(auth(t.evaluator)).send({ kind: 'technical', score: 82, criteria: { methodology: 85, experience: 80 }, comment: 'Strong methodology and relevant fleet experience.' }).expect(201);
    await api(app).post(`/v1/tenders/${tender.id}/bids/${ashaBid}/scores`).set(auth(t.evaluator)).send({ kind: 'technical', score: 90, comment: 'Trying to change my score' }).expect(409);
    await api(app).post(`/v1/tenders/${tender.id}/bids/${raviBid}/scores`).set(auth(t.evaluator)).send({ kind: 'technical', score: 55, comment: 'Manual approach; limited plant-scale O&M track record.' }).expect(201);
    await api(app).post(`/v1/tenders/${tender.id}/bids/${raviBid}/scores`).set(auth(t.evaluator)).send({ kind: 'commercial', score: 55, comment: 'Wrong phase' }).expect(403);
    const c = await api(app).post(`/v1/tenders/${tender.id}/technical/complete`).set(auth(t.uniteAdmin)).expect(200);
    expect(c.body.results.find((x: any) => x.bidId === ashaBid)).toMatchObject({ average: 82, qualified: true });
    expect(c.body.results.find((x: any) => x.bidId === raviBid)).toMatchObject({ average: 55, qualified: false });
  });

  it('071 commercial evaluation: only qualified bids are revealed, only to commercial evaluators and the issuer', async () => {
    await api(app).get(`/v1/tenders/${tender.id}/commercial`).set(auth(t.evaluator)).expect(403); // technical-only evaluator
    const r = await api(app).get(`/v1/tenders/${tender.id}/commercial`).set(auth(t.uniteAdmin)).expect(200);
    expect(r.body.bids).toHaveLength(1);
    expect(r.body.bids[0]).toMatchObject({ id: ashaBid, commercial: { amount: 10_50_000_00 }, priceScore: 100 });
    expect(JSON.stringify(r.body)).not.toContain('920000'); // disqualified envelope stays sealed
    await api(app).post(`/v1/tenders/${tender.id}/bids/${raviBid}/scores`).set(auth(t.uniteAdmin)).send({ kind: 'commercial', score: 90, comment: 'Disqualified bid' }).expect(409);
    await api(app).post(`/v1/tenders/${tender.id}/award`).set(auth(t.uniteAdmin)).set('Idempotency-Key', 'stage09-key-005').send({ bidId: ashaBid, reason: 'Best combined score after evaluation' }).expect(409); // commercial incomplete
    await api(app).post(`/v1/tenders/${tender.id}/bids/${ashaBid}/scores`).set(auth(t.uniteAdmin)).send({ kind: 'commercial', score: 88, comment: 'Within budget, standard payment terms.' }).expect(201);
  });

  it('069 comparison: weighted ranking; technical-only evaluators never see prices', async () => {
    const r = await api(app).get(`/v1/tenders/${tender.id}/comparison`).set(auth(t.uniteAdmin)).expect(200);
    expect(r.body.commercialVisible).toBe(true);
    const a = r.body.bids.find((b: any) => b.id === ashaBid);
    expect(a).toMatchObject({ rank: 1, technicalScore: 82, commercialScore: 88, amount: 10_50_000_00, combined: 83.8 });
    const rv = r.body.bids.find((b: any) => b.id === raviBid);
    expect(rv).toMatchObject({ qualified: false, rank: null });
    expect(rv.amount).toBeUndefined();
    const e = await api(app).get(`/v1/tenders/${tender.id}/comparison`).set(auth(t.evaluator)).expect(200);
    expect(e.body.commercialVisible).toBe(false);
    expect(JSON.stringify(e.body)).not.toMatch(/1050000|"amount"/);
    await api(app).get(`/v1/tenders/${tender.id}/comparison`).set(auth(t.asha)).expect(403);
  });

  it('073 negotiation: shortlisted bidder revises price; issuer replies; other bidders are excluded', async () => {
    await api(app).post(`/v1/tenders/${tender.id}/shortlist`).set(auth(t.uniteAdmin)).send({ bidIds: [raviBid] }).expect(400);
    await api(app).post(`/v1/tenders/${tender.id}/shortlist`).set(auth(t.uniteAdmin)).send({ bidIds: [ashaBid] }).expect(200);
    await api(app).get(`/v1/tenders/${tender.id}/bids/${ashaBid}/negotiation`).set(auth(t.ravi)).expect(404);
    await api(app).post(`/v1/tenders/${tender.id}/bids/${ashaBid}/negotiation`).set(auth(t.uniteAdmin)).send({ body: 'Can you sharpen the price?', revisedAmount: 9_00_000_00 }).expect(400);
    await api(app).post(`/v1/tenders/${tender.id}/bids/${ashaBid}/negotiation`).set(auth(t.uniteAdmin)).send({ body: 'Can you sharpen the price for a three-year term?' }).expect(201);
    await api(app).post(`/v1/tenders/${tender.id}/bids/${ashaBid}/negotiation`).set(auth(t.asha)).send({ body: 'Revised for a three-year commitment.', revisedAmount: 9_95_000_00 }).expect(201);
    const th = await api(app).get(`/v1/tenders/${tender.id}/bids/${ashaBid}/negotiation`).set(auth(t.asha)).expect(200);
    expect(th.body).toMatchObject({ open: true, sealed: 10_50_000_00, final: 9_95_000_00 });
    expect(th.body.messages).toHaveLength(2);
    const iss = await api(app).get(`/v1/tenders/${tender.id}/negotiations`).set(auth(t.uniteAdmin)).expect(200); // issuer manager who is also an evaluator
    expect(iss.body).toMatchObject({ role: 'issuer', canManage: true });
    expect(iss.body.bids.map((b: any) => b.id)).toEqual([ashaBid]);
    const list = await api(app).get(`/v1/tenders/${tender.id}/negotiations`).set(auth(t.ravi)).expect(200);
    expect(list.body.bids).toHaveLength(0);
  });

  it('award closes the tender and notifies every bidder; outcome is audited', async () => {
    await api(app).post(`/v1/tenders/${tender.id}/award`).set(auth(t.uniteAdmin)).set('Idempotency-Key', 'stage09-key-006').send({ bidId: raviBid, reason: 'Attempt to award a disqualified bid' }).expect(400);
    const a = await api(app).post(`/v1/tenders/${tender.id}/award`).set(auth(t.uniteAdmin)).set('Idempotency-Key', 'stage09-key-007').send({ bidId: ashaBid, reason: 'Highest combined score and revised price within budget.' }).expect(200);
    expect(a.body).toMatchObject({ status: 'awarded', awardedBidId: ashaBid, amount: 9_95_000_00 });
    await api(app).post(`/v1/tenders/${tender.id}/bids/${ashaBid}/negotiation`).set(auth(t.asha)).send({ body: 'Late message' }).expect(409);
    const n = await api(app).get('/v1/me/notifications').set(auth(t.ravi)).expect(200);
    const items = n.body.items ?? n.body;
    expect(items.some((x: any) => /Tender result/.test(x.title))).toBe(true);
    const mine = await api(app).get('/v1/tenders').set(auth(t.asha)).expect(200);
    expect(mine.body.myBids.find((b: any) => b.id === ashaBid).status).toBe('awarded');
  });

  it('137 admin: platform staff see metadata, counts and the audit trail, never content', async () => {
    await api(app).get('/v1/admin/tenders').set(auth(t.asha)).expect(403);
    const l = await api(app).get('/v1/admin/tenders').set(auth(t.superadmin)).expect(200);
    const row = l.body.find((x: any) => x.id === tender.id);
    expect(row).toMatchObject({ status: 'awarded', submitted: 2, withdrawn: 1, evaluators: 2 });
    const d = await api(app).get(`/v1/admin/tenders/${tender.id}`).set(auth(t.superadmin)).expect(200);
    expect(d.body.events.map((e: any) => e.action)).toEqual(expect.arrayContaining(['tender.published', 'tender.opened', 'bid.submitted', 'bid.withdrawn', 'tender.awarded']));
    expect(JSON.stringify(d.body)).not.toMatch(/Robotic|Manual wet|"amount"/);
    expect(l.body.some((x: any) => x.code === 'TND-2026-000001')).toBe(true); // seeded demo tender
  });
});
