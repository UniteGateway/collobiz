import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import type { SeedRefs } from '../src/db/seed';

const k = (p: string) => ({ 'Idempotency-Key': `${p}-${Date.now()}-${Math.random().toString(36).slice(2)}` });
const lead = (over: Record<string, any> = {}, consent: Record<string, any> = {}) => ({
  customer: { legalName: 'Shakti Polymers Private Limited', taxId: '27AABCS7777P1Z7', contactName: 'V. Joshi', contactEmail: 'vj@shakti.example', city: 'Nashik', country: 'IN' },
  sector: 'solar', productOrProject: '1 MW rooftop solar', estimatedValue: 4_50_00_000_00, requirements: 'Plant needs 1 MW rooftop solar to cut daytime grid consumption.',
  consent: { method: 'written_email', obtainedAt: new Date(Date.now() - 3600_000).toISOString(), disclosureScope: 'unite_and_approved_partners', ...consent },
  evidenceSummary: 'Email from plant head requesting a proposal, dated today.', ...over,
});

describe('Stage 06 — lead protection & Unite-first routing (gate: priority review and protection tests pass)', () => {
  let app: INestApplication;
  let refs: SeedRefs;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  let asha: any;
  beforeAll(async () => { await resetDatabase(); refs = await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  describe('registration (043–049)', () => {
    it('only verified partners may register; consent is mandatory and cannot be in the future', async () => {
      await api(app).post('/v1/leads').set(auth(t.vikram)).set(k('v')).send(lead()).expect(403);
      await api(app).post('/v1/leads').set(auth(t.asha)).set(k('c')).send({ ...lead(), consent: undefined }).expect(400);
      await api(app).post('/v1/leads').set(auth(t.asha)).set(k('f')).send(lead({}, { obtainedAt: new Date(Date.now() + 86400_000).toISOString() })).expect(400);
    });
    it('a clean lead is verified, protected for 90 days and enters the Unite first review with an SLA timer', async () => {
      const r = await api(app).post('/v1/leads').set(auth(t.asha)).set(k('a')).send(lead()).expect(201);
      asha = r.body;
      expect(asha.claim.status).toBe('protected');
      expect(asha.claim.certificateCode).toMatch(/^CZL-\d{4}-\d{8}$/);
      expect(asha.claim.evidenceHash).toMatch(/^[0-9a-f]{64}$/);
      expect(+new Date(asha.claim.protectedUntil) - +new Date(asha.claim.protectedFrom)).toBe(90 * 86400_000);
      expect(asha.opportunity).toMatchObject({ status: 'unite_priority_review', groupCompany: 'Unite Solar', route: 'partner_originated' });
      expect(asha.routing).toMatchObject({ slaMinutes: 240, decision: null, timezone: 'Asia/Kolkata' });
      expect(asha.history.map((h: any) => h.toStatus)).toEqual(['draft', 'submitted', 'consent_check', 'duplicate_review', 'verified', 'unite_priority_review']);
    });
    it('leads are invisible to other tenants (404) and never listed publicly before release', async () => {
      await api(app).get(`/v1/leads/${asha.claim.id}`).set(auth(t.ravi)).expect(404);
      await api(app).get(`/v1/opportunities/${asha.opportunity.id}`).set(auth(t.ravi)).expect(404);
      const mine = await api(app).get('/v1/leads').set(auth(t.asha)).expect(200);
      expect(mine.body.map((l: any) => l.code)).toContain(asha.opportunity.code);
    });
    it('047 supporting documents are private to the introducer', async () => {
      const up = await api(app).post(`/v1/leads/${asha.claim.id}/documents`).set(auth(t.asha)).field('description', 'Email screenshot').attach('file', Buffer.from('%PDF-1.4 evidence'), { filename: 'email.pdf', contentType: 'application/pdf' }).expect(201);
      expect(up.body.objectKey).toBeUndefined();
      await api(app).get(`/v1/leads/${asha.claim.id}/documents/${up.body.id}/url`).set(auth(t.ravi)).expect(404);
      await api(app).get(`/v1/leads/${asha.claim.id}/documents/${up.body.id}/url`).set(auth(t.asha)).expect(200);
    });
  });

  describe('duplicates are decided on evidence by an independent panel (048, 134)', () => {
    let dup: any;
    it('a matching lead from another partner waits in duplicate review; the other party is not disclosed', async () => {
      const r = await api(app).post('/v1/leads').set(auth(t.ravi)).set(k('d')).send(lead({ customer: { legalName: 'Shakti Polymers Ltd', taxId: '27AABCS7777P1Z7', contactName: 'P. Rao', city: 'Nashik', country: 'IN' } })).expect(201);
      dup = r.body;
      expect(dup.claim.status).toBe('pending');
      expect(dup.opportunity.status).toBe('duplicate_review');
      expect(dup.duplicates[0].reasons).toContain('Same tax / registration ID');
      expect(JSON.stringify(dup.duplicates)).not.toMatch(/Volt|asha/i);
    });
    it('partners cannot rule; compliance sees both evidence sets and upholds the earlier registration', async () => {
      await api(app).get('/v1/admin/lead-conflicts').set(auth(t.ravi)).expect(403);
      const c = await api(app).get('/v1/admin/lead-conflicts').set(auth(t.compliance)).expect(200);
      const item = c.body.duplicates.find((d: any) => d.claim.code === dup.opportunity.code);
      expect(item.candidate.code).toBe(asha.opportunity.code);
      expect(new Date(item.candidate.registeredAt) < new Date(item.claim.registeredAt)).toBe(true);
      const r = await api(app).post(`/v1/admin/lead-conflicts/${item.id}/ruling`).set(auth(t.compliance)).set(k('r')).send({ ruling: 'duplicate_upheld_earlier', reason: 'Volt registered first with stronger email evidence' }).expect(200);
      expect(r.body.claimStatus).toBe('rejected');
      const after = await api(app).get(`/v1/leads/${dup.claim.id}`).set(auth(t.ravi)).expect(200);
      expect(after.body.opportunity.status).toBe('rejected');
    });
    it('a "not duplicate" ruling releases the lead into protection and routing', async () => {
      const r = await api(app).post('/v1/leads').set(auth(t.ravi)).set(k('d2')).send(lead({ customer: { legalName: 'Shakti Polymers Pvt Ltd', taxId: '27AABCS7777P1Z7', contactName: 'P. Rao', city: 'Nashik', country: 'IN' }, productOrProject: 'Transformer replacement', sector: 'solar' })).expect(201);
      const c = await api(app).get('/v1/admin/lead-conflicts').set(auth(t.compliance)).expect(200);
      const item = c.body.duplicates.find((d: any) => d.claim.code === r.body.opportunity.code);
      const res = await api(app).post(`/v1/admin/lead-conflicts/${item.id}/ruling`).set(auth(t.compliance)).set(k('r2')).send({ ruling: 'not_duplicate', reason: 'Different scope: transformer replacement, not rooftop solar' }).expect(200);
      expect(res.body.claimStatus).toBe('protected');
    });
  });

  describe('Unite-first routing (050, 132)', () => {
    it('group-company reviewers and routing owners see the queue with SLA timers; partners do not', async () => {
      await api(app).get('/v1/admin/routing/queue').set(auth(t.asha)).expect(403);
      const q = await api(app).get('/v1/admin/routing/queue').set(auth(t.uniteAdmin)).expect(200);
      const item = q.body.find((x: any) => x.opportunityId === asha.opportunity.id);
      expect(item).toMatchObject({ groupCompany: 'Unite Solar', breached: false, decision: null });
      expect(item.remainingMinutes).toBeLessThanOrEqual(240);
      const r = await api(app).get('/v1/admin/routing/queue').set(auth(t.routing)).expect(200);
      expect(r.body.length).toBeGreaterThanOrEqual(q.body.length);
    });
    it('pause and resume extend the due time by the paused business minutes', async () => {
      await api(app).post(`/v1/admin/routing/${asha.opportunity.id}/decision`).set(auth(t.uniteAdmin)).set(k('p')).send({ decision: 'pause', reason: 'Awaiting buyer site survey confirmation' }).expect(200);
      // Seven days always spans business hours, whatever day the suite runs (two days from a weekend evening contains none).
      await pool.query(`update routing_events set paused_at = paused_at - interval '7 days' where opportunity_id = $1`, [asha.opportunity.id]);
      const r = await api(app).post(`/v1/admin/routing/${asha.opportunity.id}/decision`).set(auth(t.uniteAdmin)).set(k('rs')).send({ decision: 'resume', reason: 'Survey confirmed' }).expect(200);
      expect(r.body.paused).toBe(false);
      expect(new Date(r.body.dueAt).getTime()).toBeGreaterThan(new Date(asha.routing.dueAt).getTime());
    });
    it('a reviewer cannot route a lead introduced by their own organization', async () => {
      await pool.query(`insert into memberships (user_id, organization_id, role) values ($1, $2, 'org_member')`, [refs.users.uniteAdmin, refs.orgs.volt]);
      const tok = (await api(app).post('/v1/auth/login').send({ email: 'unite.admin@collabiz.local', password: 'Collabiz#2026', mfaCode: require('../src/common/crypto').totp('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'), client: 'mobile' })).body.accessToken;
      await api(app).post(`/v1/admin/routing/${asha.opportunity.id}/decision`).set(auth(tok, refs.orgs.uniteSolar)).set(k('self')).send({ decision: 'accept', reason: 'self approval attempt' }).expect(403);
      await pool.query(`delete from memberships where user_id = $1 and organization_id = $2`, [refs.users.uniteAdmin, refs.orgs.volt]);
    });
    it('release with buyer consent lists the lead on the partner exchange; the introducer is notified', async () => {
      const r = await api(app).post(`/v1/admin/routing/${asha.opportunity.id}/decision`).set(auth(t.uniteAdmin)).set(k('rel')).send({ decision: 'release', reason: 'Outside current Unite Solar capacity' }).expect(200);
      expect(r.body).toMatchObject({ opportunityStatus: 'released', listed: true, route: 'partner_exchange', decision: 'release' });
      const ex = await api(app).get('/v1/opportunities?scope=exchange').set(auth(t.ravi)).expect(200);
      const listed = ex.body.find((o: any) => o.id === asha.opportunity.id);
      expect(listed.publisher).toBe('Confidential');
      const n = await api(app).get('/v1/me/notifications').set(auth(t.asha)).expect(200);
      expect(n.body[0].title).toMatch(/Unite first review: release/);
      await api(app).post(`/v1/admin/routing/${asha.opportunity.id}/decision`).set(auth(t.uniteAdmin)).set(k('again')).send({ decision: 'accept', reason: 'too late' }).expect(404);
    });
    it('release WITHOUT sharing consent does not list the lead (buyer confidentiality)', async () => {
      const r = await api(app).post('/v1/leads').set(auth(t.asha)).set(k('u')).send(lead({ customer: { legalName: 'Orion Foods LLP', taxId: '27AAFFO1234L1Z9', contactName: 'S. Iyer', city: 'Pune', country: 'IN' } }, { disclosureScope: 'unite_only' })).expect(201);
      const d = await api(app).post(`/v1/admin/routing/${r.body.opportunity.id}/decision`).set(auth(t.uniteAdmin)).set(k('rel2')).send({ decision: 'release', reason: 'Not pursuing' }).expect(200);
      expect(d.body).toMatchObject({ opportunityStatus: 'released', listed: false });
    });
    it('accept keeps the lead with Unite and the claim protected', async () => {
      const r = await api(app).post('/v1/leads').set(auth(t.asha)).set(k('acc')).send(lead({ customer: { legalName: 'Kaveri Cold Chain Pvt Ltd', taxId: '27AACCK5555K1Z5', contactName: 'M. Das', city: 'Pune', country: 'IN' } })).expect(201);
      await api(app).post(`/v1/admin/routing/${r.body.opportunity.id}/decision`).set(auth(t.routing)).set(k('acc2')).send({ decision: 'accept', reason: 'Fits Unite Solar EPC pipeline' }).expect(200);
      const after = await api(app).get(`/v1/leads/${r.body.claim.id}`).set(auth(t.asha)).expect(200);
      expect(after.body.opportunity.status).toBe('accepted');
      expect(after.body.claim.status).toBe('protected');
    });
  });

  describe('SLA breach handling (§2.3)', () => {
    it('first breach escalates; auto-release happens only when policy allows, after escalation', async () => {
      const r = await api(app).post('/v1/leads').set(auth(t.asha)).set(k('sla')).send(lead({ customer: { legalName: 'Deccan Glass Works', taxId: '27AADDG9999G1Z9', contactName: 'A. Khan', city: 'Pune', country: 'IN' } })).expect(201);
      await pool.query(`update routing_events set start_at = now() - interval '10 days' where opportunity_id = $1`, [r.body.opportunity.id]);
      await api(app).post('/v1/admin/routing/sweep').set(auth(t.uniteAdmin)).expect(403);
      const s1 = await api(app).post('/v1/admin/routing/sweep').set(auth(t.superadmin)).expect(200);
      expect(s1.body.escalated).toBeGreaterThanOrEqual(1);
      const q = await api(app).get('/v1/admin/routing/queue').set(auth(t.routing)).expect(200);
      expect(q.body.find((x: any) => x.opportunityId === r.body.opportunity.id)).toMatchObject({ breached: true });
      const s2 = await api(app).post('/v1/admin/routing/sweep').set(auth(t.superadmin)).expect(200);
      expect(s2.body.autoReleased).toBe(0); // policy off by default
      const sla = await api(app).get('/v1/admin/routing/sla').set(auth(t.superadmin)).expect(200);
      const us = sla.body.find((g: any) => g.brandName === 'Unite Solar');
      await api(app).put(`/v1/admin/routing/sla/${us.organizationId}`).set(auth(t.superadmin)).send({ slaMinutes: 240, calendar: us.calendar, autoReleaseOnBreach: true }).expect(200);
      const s3 = await api(app).post('/v1/admin/routing/sweep').set(auth(t.superadmin)).expect(200);
      expect(s3.body.autoReleased).toBeGreaterThanOrEqual(1);
      const after = await api(app).get(`/v1/leads/${r.body.claim.id}`).set(auth(t.asha)).expect(200);
      expect(after.body.opportunity.status).toBe('released');
      expect(after.body.routing.reason).toMatch(/Auto-released/);
    });
    it('133 validates calendars and previews due times', async () => {
      const sla = await api(app).get('/v1/admin/routing/sla').set(auth(t.superadmin)).expect(200);
      await api(app).put(`/v1/admin/routing/sla/${sla.body[0].organizationId}`).set(auth(t.superadmin)).send({ slaMinutes: 240, calendar: { timezone: 'Mars/Olympus', workdays: [1], startHour: 9, endHour: 18, holidays: [] }, autoReleaseOnBreach: false }).expect(400);
      await api(app).put(`/v1/admin/routing/sla/${sla.body[0].organizationId}`).set(auth(t.uniteAdmin)).send(sla.body[0]).expect(403);
      const p = await api(app).post('/v1/admin/routing/sla/preview').set(auth(t.uniteAdmin)).send({ start: '2026-11-13T11:30:00.000Z', slaMinutes: 240, calendar: { timezone: 'Asia/Kolkata', workdays: [1, 2, 3, 4, 5], startHour: 9, endHour: 18, holidays: [] } }).expect(200);
      expect(p.body.dueAt).toBe('2026-11-16T06:30:00.000Z'); // Fri 17:00 IST + 4 business h = 1 h Fri + 3 h Mon → Mon 12:00 IST
    });
  });

  describe('certificates (051, 152) and disputes (153, 134)', () => {
    let dsp: any;
    it('public verification proves registration without revealing the customer', async () => {
      const v = await api(app).get(`/v1/public/certificates/${asha.claim.certificateCode}`).expect(200);
      expect(v.body).toMatchObject({ valid: true, introducer: 'Volt EPC', evidenceHash: asha.claim.evidenceHash });
      expect(JSON.stringify(v.body)).not.toMatch(/Shakti/);
      await api(app).get('/v1/public/certificates/CZL-2026-99999999').expect(404);
      await api(app).get("/v1/public/certificates/x' or '1'='1").expect(404);
    });
    it('a third party disputes ownership; the claim becomes contested; parties add evidence', async () => {
      await api(app).post('/v1/lead-disputes').set(auth(t.asha)).send({ certificateCode: asha.claim.certificateCode, statement: 'Disputing my own lead should be refused by the platform.' }).expect(400);
      const r = await api(app).post('/v1/lead-disputes').set(auth(t.ravi)).send({ certificateCode: asha.claim.certificateCode, statement: 'Sunrise introduced Shakti Polymers to Unite at a trade fair in September; minutes attached.' }).expect(201);
      dsp = r.body;
      const l = await api(app).get(`/v1/leads/${asha.claim.id}`).set(auth(t.asha)).expect(200);
      expect(l.body.claim.status).toBe('contested');
      await api(app).post(`/v1/lead-disputes/${dsp.id}/evidence`).set(auth(t.asha)).send({ body: 'Our email from the plant head is dated before the trade fair and requests our proposal.' }).expect(201);
      await api(app).get(`/v1/lead-disputes/${dsp.id}`).set(auth(t.meera)).expect(404);
    });
    it('the panel rules; a party appeals; the re-hearing must be by a different panel member', async () => {
      await api(app).post(`/v1/admin/lead-disputes/${dsp.id}/ruling`).set(auth(t.ravi)).set(k('x')).send({ outcome: 'upheld', reason: 'self ruling attempt' }).expect(403);
      const r = await api(app).post(`/v1/admin/lead-disputes/${dsp.id}/ruling`).set(auth(t.compliance)).set(k('rul')).send({ outcome: 'rejected', reason: 'Email evidence predates the trade fair' }).expect(200);
      expect(r.body).toMatchObject({ status: 'resolved', outcome: 'rejected' });
      let l = await api(app).get(`/v1/leads/${asha.claim.id}`).set(auth(t.asha)).expect(200);
      expect(l.body.claim.status).toBe('upheld');
      await api(app).post(`/v1/lead-disputes/${dsp.id}/appeal`).set(auth(t.ravi)).send({ grounds: 'The trade fair minutes show an earlier verbal introduction with the same plant head.' }).expect(200);
      await api(app).post(`/v1/admin/lead-disputes/${dsp.id}/ruling`).set(auth(t.compliance)).set(k('rul2')).send({ outcome: 'upheld', reason: 'Same panelist' }).expect(403);
      await api(app).post(`/v1/admin/lead-disputes/${dsp.id}/ruling`).set(auth(t.superadmin)).set(k('rul3')).send({ outcome: 'upheld', reason: 'Verbal introduction proven by minutes signed by both parties' }).expect(200);
      l = await api(app).get(`/v1/leads/${asha.claim.id}`).set(auth(t.asha)).expect(200);
      expect(l.body.claim.status).toBe('released');
      const v = await api(app).get(`/v1/public/certificates/${asha.claim.certificateCode}`).expect(200);
      expect(v.body.valid).toBe(false);
    });
    it('151 protection dashboard summarises statuses and disputes', async () => {
      const s = await api(app).get('/v1/leads/protection-summary').set(auth(t.asha)).expect(200);
      expect(s.body.total).toBeGreaterThanOrEqual(4);
      expect(s.body.openDisputes).toBeGreaterThanOrEqual(1);
    });
  });
});
