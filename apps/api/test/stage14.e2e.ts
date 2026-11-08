import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

/** Stage 14 gate — explainable recommendations and appeals; reputation from verified outcomes only; AI as reviewable drafts. */
describe('Stage 14 — reputation, learning, marketing and AI', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('029/163 reputation comes from certified milestones and published reviews, with the evidence shown', async () => {
    const me = await api(app).get('/v1/reputation/me').set(auth(t.asha)).expect(200);
    expect(me.body.score).toMatchObject({ outcomes: 3, onTimeOutcomes: 2, publishedReviews: 1 });
    expect(me.body.score.score).toBeGreaterThan(50);
    expect(me.body.score.components.onTimeRate).toBeCloseTo(2 / 3);
    expect(me.body.outcomes.map((o: any) => o.onTime)).toEqual(expect.arrayContaining([true, false]));
    const volt = (await one("select id from organizations where display_name = 'Volt EPC'")).id;
    const pub = await api(app).get(`/v1/reputation/orgs/${volt}`).set(auth(t.meera)).expect(200);
    expect(pub.body.score.score).toBe(me.body.score.score);
    expect(pub.body.reviews[0].comment).toMatch(/Clean installation/);
    const unverified = (await one("select id from organizations where verification_status <> 'verified' and type <> 'platform' limit 1")).id;
    await api(app).get(`/v1/reputation/orgs/${unverified}`).set(auth(t.meera)).expect(404);
    // A new company with no certified work is unrated, not zero
    expect((await api(app).get('/v1/reputation/me').set(auth(t.meera)).expect(200)).body.score.tier).toBe('unrated');
  });

  it('164 reviews require a shared project with certified work; one per project and partner', async () => {
    const volt = (await one("select id from organizations where display_name = 'Volt EPC'")).id;
    const solar = (await one("select organization_id as id from group_companies where brand_name = 'Unite Solar'")).id;
    const past = (await one("select id from projects where code = 'PRJ-2025-000014'")).id;
    await api(app).post('/v1/reviews').set(auth(t.meera)).send({ projectId: past, subjectOrgId: volt, quality: 1, timeliness: 1, communication: 1, comment: 'Never worked with them but leaving a bad review anyway.' }).expect(403);
    await api(app).post('/v1/reviews').set(auth(t.asha)).send({ projectId: past, subjectOrgId: volt, quality: 5, timeliness: 5, communication: 5, comment: 'Reviewing our own company should not be allowed at all.' }).expect(400);
    const me = await api(app).get('/v1/reputation/me').set(auth(t.asha)).expect(200);
    expect(me.body.reviewable.map((r: any) => r.org_id)).toContain(solar);
    await api(app).post('/v1/reviews').set(auth(t.asha)).send({ projectId: past, subjectOrgId: solar, quality: 4, timeliness: 5, communication: 4, comment: 'Inspections were scheduled promptly and payments arrived on time.' }).expect(201);
    await api(app).post('/v1/reviews').set(auth(t.asha)).send({ projectId: past, subjectOrgId: solar, quality: 4, timeliness: 5, communication: 4, comment: 'Trying to post a second review for the same project.' }).expect(409);
  });

  it('appeals exclude the review while open; the reviewed company cannot decide; upheld removes it', async () => {
    const before = (await api(app).get('/v1/reputation/me').set(auth(t.asha)).expect(200)).body;
    const review = before.reviews.find((r: any) => r.status === 'published');
    await api(app).post('/v1/reputation/appeals').set(auth(t.meera)).send({ reviewId: review.id, reason: 'Trying to appeal a review about another company entirely.' }).expect(404);
    const a = await api(app).post('/v1/reputation/appeals').set(auth(t.asha)).send({ reviewId: review.id, reason: 'The five-day delay was caused by a grid outage recorded in the site log.' }).expect(201);
    const during = (await api(app).get('/v1/reputation/me').set(auth(t.asha)).expect(200)).body;
    expect(during.score).toMatchObject({ publishedReviews: 0, excludedReviews: 1 });
    await api(app).post(`/v1/reputation/appeals`).set(auth(t.asha)).send({ reviewId: review.id, reason: 'Appealing the same review a second time should fail.' }).expect(409);
    await api(app).post(`/v1/admin/reputation/appeals/${a.body.id}/decision`).set(auth(t.asha)).send({ decision: 'upheld', reason: 'Deciding my own appeal' }).expect(403);
    const list = await api(app).get('/v1/admin/reputation/appeals').set(auth(t.compliance)).expect(200);
    expect(list.body.find((x: any) => x.id === a.body.id).review.comment).toMatch(/Clean installation/);
    await api(app).post(`/v1/admin/reputation/appeals/${a.body.id}/decision`).set(auth(t.compliance)).send({ decision: 'rejected', reason: 'The review reflects the delivery record accurately.' }).expect(200);
    expect((await api(app).get('/v1/reputation/me').set(auth(t.asha)).expect(200)).body.score.publishedReviews).toBe(1);
    await api(app).post(`/v1/admin/reputation/appeals/${a.body.id}/decision`).set(auth(t.compliance)).send({ decision: 'upheld', reason: 'Changing my mind later' }).expect(409);
  });

  it('165 excellence lists each criterion for the next level and never promotes automatically', async () => {
    const r = await api(app).get('/v1/reputation/excellence').set(auth(t.asha)).expect(200);
    expect(r.body).toMatchObject({ level: 'verified', next: 'certified', nextName: 'Certified partner' });
    expect(r.body.criteria.map((c: any) => c.key)).toEqual(['verified', 'outcomes', 'score', 'certs']);
    expect(r.body.criteria.find((c: any) => c.key === 'outcomes').met).toBe(true);
    expect(r.body.note).toMatch(/does not change your level automatically/);
  });

  it('116/117/118 learning: answers stay on the server; modules first; pass issues a verifiable certificate', async () => {
    const list = await api(app).get('/v1/learning/courses').set(auth(t.rohit)).expect(200);
    const c = list.body.find((x: any) => x.code === 'CZ-101');
    const detail = await api(app).get(`/v1/learning/courses/${c.id}`).set(auth(t.rohit)).expect(200);
    expect(JSON.stringify(detail.body.assessment)).not.toContain('answer');
    await api(app).post(`/v1/learning/courses/${c.id}/assessment`).set(auth(t.rohit)).send({ answers: [1, 0, 2, 2] }).expect(409); // modules not done
    for (let i = 0; i < c.modules; i++) await api(app).post(`/v1/learning/courses/${c.id}/modules/${i}/complete`).set(auth(t.rohit)).expect(200);
    await api(app).post(`/v1/learning/courses/${c.id}/modules/9/complete`).set(auth(t.rohit)).expect(404);
    const fail = await api(app).post(`/v1/learning/courses/${c.id}/assessment`).set(auth(t.rohit)).send({ answers: [0, 0, 0, 0] }).expect(200);
    expect(fail.body).toMatchObject({ passed: false, score: 25, incorrect: [1, 3, 4], certificate: null });
    const pass = await api(app).post(`/v1/learning/courses/${c.id}/assessment`).set(auth(t.rohit)).send({ answers: [1, 0, 2, 2] }).expect(200);
    expect(pass.body).toMatchObject({ passed: true, score: 100 });
    const code = pass.body.certificate.code;
    expect(code).toMatch(/^CZC-\d{4}-\d{8}$/);
    const v = await api(app).get(`/v1/public/training-certificates/${code}`).expect(200);
    expect(v.body).toMatchObject({ holder: 'Rohit Deshmukh', organization: 'Volt EPC', course: 'Working with Unite Group on COLLABIZ', status: 'valid' });
    expect(Object.keys(v.body).sort()).toEqual(['code', 'course', 'expiresAt', 'holder', 'issuedAt', 'organization', 'status']);
    await api(app).get('/v1/public/training-certificates/CZC-0000-00000000').expect(404);
    const again = await api(app).post(`/v1/learning/courses/${c.id}/assessment`).set(auth(t.rohit)).send({ answers: [1, 0, 2, 2] }).expect(200); // third attempt allowed
    expect(again.body.certificate.code).toBe(code); // passing again does not issue a duplicate certificate
    await api(app).post(`/v1/learning/courses/${c.id}/assessment`).set(auth(t.rohit)).send({ answers: [1, 0, 2, 2] }).expect(409); // fourth in 24 hours is refused
    expect((await api(app).get('/v1/learning/certificates').set(auth(t.rohit)).expect(200)).body[0]).toMatchObject({ code, status: 'valid' });
  });

  it('113/114/115 marketing: level-gated assets; brochure for verified partners only, with escaped content', async () => {
    const assets = await api(app).get('/v1/marketing/assets').set(auth(t.asha)).expect(200);
    const locked = assets.body.find((a: any) => a.minLevel === 'certified');
    expect(locked).toMatchObject({ locked: true, body: null });
    await api(app).post(`/v1/marketing/assets/${locked.id}/use`).set(auth(t.asha)).send({ kind: 'copy' }).expect(403);
    const open = assets.body.find((a: any) => !a.locked);
    await api(app).post(`/v1/marketing/assets/${open.id}/use`).set(auth(t.asha)).send({ kind: 'copy' }).expect(200);
    await api(app).post('/v1/marketing/brochure').set(auth(t.vikram)).send({ headline: 'Solar for factories', sector: 'Solar', services: ['Design'] }).expect(403);
    const b = await api(app).post('/v1/marketing/brochure').set(auth(t.asha)).send({ headline: 'Rooftop <script>alert(1)</script> solar', sector: 'Solar & Renewable Energy', services: ['Design & engineering', 'Installation'] }).expect(200);
    expect(b.body.html).not.toContain('<script>');
    expect(b.body.html).toContain('&lt;script&gt;');
    expect(b.body.html).toMatch(/Volt EPC · in partnership with Unite Group/);
    expect(b.body.html).toMatch(/does not imply that Unite Group has approved/);
  });

  it('072/160/161/162 AI: drafts with sources and no prices; team builder fills the gaps; nothing is submitted', async () => {
    const opp3 = (await one("select id from opportunities where code = 'OPP-2026-00003'")).id;
    const apps = Number((await one('select count(*)::int as n from opportunity_applications')).n);
    const draft = await api(app).post('/v1/ai/proposal-draft').set(auth(t.asha)).send({ opportunityId: opp3 }).expect(200);
    expect(draft.body.sections.map((s: any) => s.heading)).toContain('Commercials');
    expect(draft.body.sections.find((s: any) => s.heading === 'Commercials').body).toMatch(/never proposes prices/);
    expect(draft.body.sections.every((s: any) => s.source)).toBe(true);
    expect(draft.body).toMatchObject({ provider: 'rules', promptVersion: expect.any(String) });
    expect(Number((await one('select count(*)::int as n from opportunity_applications')).n)).toBe(apps); // nothing submitted
    await api(app).post('/v1/ai/proposal-draft').set(auth(t.vikram)).send({ opportunityId: opp3 }).expect(403);
    const tender = (await one("select id from tenders where status = 'published' limit 1")).id;
    expect((await api(app).post('/v1/ai/proposal-draft').set(auth(t.asha)).send({ tenderId: tender }).expect(200)).body.subject.code).toMatch(/^TND-/);
    await api(app).post(`/v1/ai/suggestions/${draft.body.suggestionId}/review`).set(auth(t.ravi)).send({ status: 'accepted' }).expect(404); // another org's draft
    await api(app).post(`/v1/ai/suggestions/${draft.body.suggestionId}/review`).set(auth(t.asha)).send({ status: 'edited', feedback: 'Useful structure' }).expect(200);
    await api(app).post(`/v1/ai/suggestions/${draft.body.suggestionId}/review`).set(auth(t.asha)).send({ status: 'accepted' }).expect(409);
    // 162 — Volt lacks ISO 45001, so a certified-partner role is proposed with explained candidates
    const tb = await api(app).post('/v1/ai/team-builder').set(auth(t.asha)).send({ opportunityId: opp3 }).expect(200);
    const certRole = tb.body.plan.find((r: any) => /ISO 45001/.test(r.role));
    expect(certRole).toMatchObject({ coveredByYou: false });
    expect(tb.body.note).toMatch(/nobody is contacted automatically/);
    // 161 — recommendations carry reputation and factor explanations
    const rec = await api(app).post('/v1/ai/partners').set(auth(t.meera)).send({ sector: 'solar' }).expect(200);
    const volt = rec.body.suggestions.find((s: any) => s.partnerName === 'Volt EPC');
    expect(volt.reputation).toBeGreaterThan(50);
    expect(volt.factors.length).toBeGreaterThan(0);
    // 160 — dismissing a match hides it
    const m = await api(app).get('/v1/ai/matching').set(auth(t.asha)).expect(200);
    const first = m.body.items[0].opportunity.id;
    await api(app).post(`/v1/ai/matching/${first}/feedback`).set(auth(t.asha)).send({ useful: false, reason: 'Not our sector' }).expect(200);
    expect((await api(app).get('/v1/ai/matching').set(auth(t.asha)).expect(200)).body.items.map((i: any) => i.opportunity.id)).not.toContain(first);
  });

  it('140 AI controls: super admin only; switching a capability off blocks it at once and is audited', async () => {
    await api(app).get('/v1/admin/ai').set(auth(t.compliance)).expect(403);
    const o = await api(app).get('/v1/admin/ai').set(auth(t.superadmin)).expect(200);
    expect(o.body.capabilities.find((c: any) => c.kind === 'proposal_draft')).toMatchObject({ enabled: true, total: expect.any(Number), acceptance: 100 });
    expect(o.body.safeguards.length).toBeGreaterThan(2);
    await api(app).put('/v1/admin/ai/settings').set(auth(t.superadmin)).send({ kind: 'team_builder', enabled: false, reason: 'Pausing while we review candidate quality' }).expect(200);
    const opp3 = (await one("select id from opportunities where code = 'OPP-2026-00003'")).id;
    const r = await api(app).post('/v1/ai/team-builder').set(auth(t.asha)).send({ opportunityId: opp3 }).expect(403);
    expect(r.body.message).toMatch(/turned off by the COLLABIZ administrator/);
    expect((await one("select count(*)::int as n from audit_events where action = 'ai.disabled'")).n).toBe(1);
    await api(app).put('/v1/admin/ai/settings').set(auth(t.superadmin)).send({ kind: 'team_builder', enabled: true, reason: 'Review complete; candidates look right' }).expect(200);
  });
});
