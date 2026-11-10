import type { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

const TENDER_PDF = readFileSync(join(__dirname, 'fixtures', 'sample-tender.pdf'));

describe('V2 Phase 1 — Deal Passport, team plans, work packages, tender analyzer', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => {
    await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // Start from a clean slate: the demo seed adds a sample passport and work packages that these tests create themselves.
    await pool.query('delete from deal_passport_parties; delete from deal_passports; delete from work_package_bids; delete from work_packages;');
  });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const org = async (name: string) => (await one('select id from organizations where display_name = $1', [name])).id as string;

  describe('Deal Passport', () => {
    let claimId: string; let code: string;
    it('issued for a protected lead; owner sees everything; others see nothing', async () => {
      claimId = (await one("select c.id from lead_claims c join organizations o on o.id = c.introducer_org_id where o.display_name = 'Meera Iyer Consulting' and c.status = 'protected' limit 1")).id;
      const r = (await api(app).get(`/v1/leads/${claimId}/passport`).set(auth(t.meera)).expect(200)).body;
      code = r.passport.code;
      expect(code).toMatch(/^DP-\d{4}-\d{6}$/);
      expect(r).toMatchObject({ access: 'owner', owner: 'Meera Iyer Consulting', canManage: true });
      expect(r.ownership).toMatchObject({ status: 'protected' });
      expect(r.customer.name).toBeTruthy();
      expect(r.notice).toMatch(/not a guarantee of commission/);
      expect(r.audit.some((e: any) => e.action === 'passport.issued')).toBe(true);
      expect((await api(app).get(`/v1/leads/${claimId}/passport`).set(auth(t.meera)).expect(200)).body.passport.code).toBe(code); // one passport per lead
      await api(app).get(`/v1/leads/${claimId}/passport`).set(auth(t.asha)).expect(404);
      expect((await api(app).get(`/v1/leads/${claimId}/passport`).set(auth(t.uniteAdmin)).expect(200)).body.access).toBe('staff');
    });
    it('a shared party must accept the undertaking first, never sees customer contacts, and every view is logged', async () => {
      const volt = await org('Volt EPC');
      await api(app).post(`/v1/leads/${claimId}/passport/parties`).set(auth(t.asha)).send({ organizationId: volt, role: 'execution_partner' }).expect(404);
      await api(app).post(`/v1/leads/${claimId}/passport/parties`).set(auth(t.meera)).send({ organizationId: await org('GreenBuild Infra'), role: 'advisor' }).expect(400); // not verified
      await api(app).post(`/v1/leads/${claimId}/passport/parties`).set(auth(t.meera)).send({ organizationId: volt, role: 'execution_partner' }).expect(201);
      const inv = (await api(app).get(`/v1/leads/${claimId}/passport`).set(auth(t.asha)).expect(200)).body;
      expect(inv).toMatchObject({ access: 'invitee', role: 'execution_partner' });
      expect(inv.customer).toBeUndefined();
      expect(inv.ndaText).toMatch(/gives no right to commission/);
      await api(app).post(`/v1/leads/${claimId}/passport/nda`).set(auth(t.asha)).send({ typedName: 'Someone Else' }).expect(400);
      await api(app).post(`/v1/leads/${claimId}/passport/nda`).set(auth(t.asha)).send({ typedName: 'Asha Patil' }).expect(200);
      const party = (await api(app).get(`/v1/leads/${claimId}/passport`).set(auth(t.asha)).expect(200)).body;
      expect(party.access).toBe('party');
      expect(party.customer.email).toBeUndefined();
      expect(party.customer.phone).toBeUndefined();
      expect(party.canManage).toBe(false);
      expect((await one("select count(*)::int n from audit_events where action = 'passport.viewed'")).n).toBeGreaterThanOrEqual(1);
      expect((await api(app).get('/v1/passports/shared').set(auth(t.asha)).expect(200)).body[0]).toMatchObject({ code, ndaAccepted: true });
      const pub = (await api(app).get(`/v1/public/passports/${code.toLowerCase()}`).expect(200)).body;
      expect(pub).toMatchObject({ code, valid: true, registeredBy: 'Meera Iyer Consulting' });
      expect(JSON.stringify(pub)).not.toMatch(/customer|consent|email/i);
      await api(app).delete(`/v1/leads/${claimId}/passport/parties/${volt}`).set(auth(t.meera)).expect(200);
      await api(app).get(`/v1/leads/${claimId}/passport`).set(auth(t.asha)).expect(404);
    });
    it('no passport for a lead Unite has not protected', async () => {
      await pool.query("update lead_claims set status = 'pending' where id = (select id from lead_claims where id <> $1 limit 1)", [claimId]);
      const other = (await one("select id from lead_claims where status = 'pending' limit 1")).id;
      await api(app).get(`/v1/leads/${other}/passport`).set(auth(t.meera)).expect(409);
    });
  });

  let projectId: string;
  describe('AI team plans', () => {
    let planId: string; let roleKey: string;
    it('plans roles, responsibilities, candidates, gaps and a responsibility matrix for a project', async () => {
      projectId = (await one("select id from projects where code = 'PRJ-2026-000001'")).id;
      await api(app).post('/v1/ai/team-plans').set(auth(t.ravi)).send({ sourceType: 'project', sourceId: projectId }).expect(404); // not their project
      const p = (await api(app).post('/v1/ai/team-plans').set(auth(t.asha)).send({ sourceType: 'project', sourceId: projectId, sector: 'solar' }).expect(201)).body;
      planId = p.id;
      expect(p.isOwner).toBe(true);
      expect(p.roles[0]).toMatchObject({ key: 'lead' });
      expect(p.roles.find((r: any) => r.key === 'om').responsibilities.length).toBeGreaterThan(0);
      expect(p.matrix.length).toBe(7);
      expect(p.note).toMatch(/Nobody is contacted until you invite them/);
      roleKey = p.roles.find((r: any) => !r.coveredByYou).key;
      expect(p.readiness.canApprove).toBe(false);
    });
    it('invite → accept → owner approves → a real team is created; outsiders see nothing', async () => {
      const sunrise = await org('Sunrise Traders');
      await api(app).post(`/v1/ai/team-plans/${planId}/approve`).set(auth(t.asha)).send({}).expect(409); // nobody accepted yet
      await api(app).post(`/v1/ai/team-plans/${planId}/invites`).set(auth(t.asha)).send({ roleKey, organizationId: await org('GreenBuild Infra') }).expect(400);
      const v = (await api(app).post(`/v1/ai/team-plans/${planId}/invites`).set(auth(t.asha)).send({ roleKey, organizationId: sunrise, message: 'Join us for O&M' }).expect(201)).body;
      await api(app).post(`/v1/ai/team-plans/${planId}/invites`).set(auth(t.asha)).send({ roleKey, organizationId: sunrise }).expect(409);
      const ravi = (await api(app).get(`/v1/ai/team-plans/${planId}`).set(auth(t.ravi)).expect(200)).body;
      expect(ravi.matrix).toBeUndefined(); // invitees see only their role
      expect(ravi.roles).toHaveLength(1);
      await api(app).get(`/v1/ai/team-plans/${planId}`).set(auth(t.vikram)).expect(404);
      const inviteId = v.invites.find((i: any) => i.organizationId === sunrise).id;
      await api(app).post(`/v1/team-plan-invites/${inviteId}/respond`).set(auth(t.asha)).send({ decision: 'accept' }).expect(404);
      await api(app).post(`/v1/team-plan-invites/${inviteId}/respond`).set(auth(t.ravi)).send({ decision: 'accept' }).expect(200);
      const ok = (await api(app).post(`/v1/ai/team-plans/${planId}/approve`).set(auth(t.asha)).send({ kind: 'consortium' }).expect(200)).body;
      const members = (await pool.query('select o.display_name n, m.status from team_members m join organizations o on o.id = m.organization_id where m.team_id = $1 order by n', [ok.teamId])).rows;
      expect(members).toEqual([{ n: 'Sunrise Traders', status: 'accepted' }, { n: 'Volt EPC', status: 'nda_signed' }]);
      await api(app).post(`/v1/ai/team-plans/${planId}/approve`).set(auth(t.asha)).send({}).expect(409);
    });
  });

  describe('Project work packages', () => {
    let pkgId: string; let bidId: string;
    it('packages never exceed the project value; open packages reach eligible partners with reasons', async () => {
      const closes = new Date(Date.now() + 7 * 86400_000).toISOString();
      const pkg = { category: 'civil', title: 'Module mounting foundations', scope: 'Pile foundations and module mounting structure for 2 MW, including soil tests.', budget: 1_00_00_000_00, closesAt: closes, eligibility: { sectors: [], regions: [], certifications: [] } };
      await api(app).post(`/v1/projects/${projectId}/packages`).set(auth(t.ravi)).send(pkg).expect(403); // a project member, not its manager
      await api(app).post(`/v1/projects/${projectId}/packages`).set(auth(t.asha)).send({ ...pkg, budget: 1_00_00_00_000_00 }).expect(400);
      const w = (await api(app).post(`/v1/projects/${projectId}/packages`).set(auth(t.asha)).send(pkg).expect(201)).body;
      pkgId = w.id;
      expect(w).toMatchObject({ status: 'draft', code: expect.stringMatching(/^WP-/) });
      expect((await api(app).get('/v1/packages').set(auth(t.ravi)).expect(200)).body).toHaveLength(0); // drafts are private
      await api(app).post(`/v1/projects/${projectId}/packages/${pkgId}/status`).set(auth(t.asha)).send({ status: 'open' }).expect(200);
      const open = (await api(app).get('/v1/packages').set(auth(t.ravi)).expect(200)).body;
      expect(open[0]).toMatchObject({ id: pkgId, eligible: true, categoryLabel: 'Civil works' });
      expect((await api(app).get('/v1/packages').set(auth(t.asha)).expect(200)).body).toHaveLength(0); // own project
    });
    it('eligible partners bid; the manager awards; the winner joins the project and reports progress that rolls up', async () => {
      await api(app).post(`/v1/packages/${pkgId}/bids`).set(auth(t.asha)).send({ amount: 90_00_000_00, days: 60, note: 'We will self-perform' }).expect(400);
      await api(app).post(`/v1/packages/${pkgId}/bids`).set(auth(t.ravi)).send({ amount: 5_00_00_000_00, days: 60, note: 'Too expensive offer' }).expect(400);
      bidId = (await api(app).post(`/v1/packages/${pkgId}/bids`).set(auth(t.ravi)).send({ amount: 92_00_000_00, days: 75, note: 'Own piling rig and crew of 30.' }).expect(201)).body.id;
      const mgr = (await api(app).get(`/v1/projects/${projectId}/packages`).set(auth(t.asha)).expect(200)).body;
      expect(mgr.packages[0].bids).toHaveLength(1);
      expect(mgr.totals).toMatchObject({ budgeted: 1_00_00_000_00, remaining: mgr.project.value - 1_00_00_000_00 });
      await api(app).post(`/v1/projects/${projectId}/packages/${pkgId}/award`).set(auth(t.ravi)).send({ bidId }).expect(403);
      await api(app).post(`/v1/projects/${projectId}/packages/${pkgId}/award`).set(auth(t.asha)).send({ bidId }).expect(200);
      expect(await one("select role, allocated_value from project_members m join organizations o on o.id = m.organization_id where m.project_id = $1 and o.display_name = 'Sunrise Traders'", [projectId])).toMatchObject({ role: 'subcontractor', allocated_value: '2720000000' }); // ₹1.8 Cr already allocated + ₹92 lakh package = ₹2.72 Cr
      await api(app).post(`/v1/packages/${pkgId}/progress`).set(auth(t.ravi)).send({ progress: 40 }).expect(200);
      expect((await api(app).get(`/v1/projects/${projectId}/packages`).set(auth(t.ravi)).expect(200)).body.totals.progress).toBe(40);
      await api(app).post(`/v1/projects/${projectId}/packages/${pkgId}/status`).set(auth(t.asha)).send({ status: 'completed' }).expect(200);
      expect((await api(app).get(`/v1/projects/${projectId}/packages`).set(auth(t.asha)).expect(200)).body.totals.progress).toBe(100);
    });
  });

  describe('Tender eligibility analyzer', () => {
    let id: string;
    it('reads a tender PDF with page and line references and compares it with the profile — never “confirmed”', async () => {
      await api(app).post('/v1/tender-analyses').set(auth(t.asha)).attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), { filename: 't.png', contentType: 'image/png' }).expect(400);
      const a = (await api(app).post('/v1/tender-analyses').set(auth(t.asha)).field('title', '2 MW Kurnool').attach('file', TENDER_PDF, { filename: 'tender.pdf', contentType: 'application/pdf' }).expect(201)).body;
      id = a.id;
      expect(a.pages).toBe(3);
      expect(a.rows.length).toBe(17);
      expect(a.rows.find((r: any) => r.kind === 'turnover')).toMatchObject({ page: 2, line: 2, value: 5_00_00_000_00 });
      expect(a.rows.find((r: any) => r.kind === 'emd')).toMatchObject({ page: 3, value: 2_50_000_00 });
      expect(a.disclaimer).toMatch(/Not confirmed until an authorised reviewer/);
      expect(a.status).toBe('draft');
      expect(a.checklist.length).toBeGreaterThan(3);
      await api(app).get(`/v1/tender-analyses/${id}`).set(auth(t.ravi)).expect(404);
    });
    it('only authorised Unite reviewers confirm, and only when asked', async () => {
      await api(app).post(`/v1/tender-analyses/${id}/review`).set(auth(t.uniteAdmin)).send({ note: 'Checked turnover and EMD clauses.' }).expect(409);
      await api(app).post(`/v1/tender-analyses/${id}/request-review`).set(auth(t.asha)).expect(200);
      await api(app).post(`/v1/tender-analyses/${id}/review`).set(auth(t.asha)).send({ note: 'I approve myself please' }).expect(403);
      expect((await api(app).get('/v1/admin/tender-analyses').set(auth(t.uniteAdmin)).expect(200)).body[0]).toMatchObject({ id, organization: 'Volt EPC', status: 'review_requested' });
      await api(app).post(`/v1/tender-analyses/${id}/review`).set(auth(t.uniteAdmin)).send({ note: 'Checked turnover, ISO and EMD clauses against the original PDF.' }).expect(200);
      expect((await api(app).get(`/v1/tender-analyses/${id}`).set(auth(t.asha)).expect(200)).body).toMatchObject({ status: 'reviewed', reviewNote: expect.stringMatching(/original PDF/) });
    });
  });
});
