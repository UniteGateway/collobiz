import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('V2 Phase 2 — payment assurance, resolution centre, consortium ledger and agreements, radar', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const org = async (name: string) => (await one('select id from organizations where display_name = $1', [name])).id as string;

  let projectId: string; let invoiceId: string;
  describe('payment assurance', () => {
    it('eight display states, part payments, full payment, overdue and reconciliation', async () => {
      projectId = (await one("select id from projects where code = 'PRJ-2026-000001'")).id;
      const m1 = (await one('select id, amount from milestones where project_id = $1 and seq = 1', [projectId]));
      await pool.query("update milestones set status = 'invoiced' where id = $1", [m1.id]);
      invoiceId = (await one("insert into project_invoices (number, project_id, milestone_id, amount, issued_by_org_id, status, issued_at) values ('INV-T-001', $1, $2, $3, (select lead_org_id from projects where id = $1), 'issued', now() - interval '40 days') returning id", [projectId, m1.id, m1.amount])).id;
      await pool.query("update milestones set status = 'submitted' where project_id = $1 and seq = 2", [projectId]);
      const v = (await api(app).get(`/v1/projects/${projectId}/payments`).set(auth(t.asha)).expect(200)).body;
      expect(v.milestones.map((m: any) => m.state)).toEqual(['invoiced', 'earned', 'projected']);
      expect(v.milestones[0].invoice).toMatchObject({ overdueDays: 10, outstanding: Number(m1.amount) });
      expect(v.note).toMatch(/does not hold funds/);
      await api(app).post(`/v1/projects/${projectId}/invoices/${invoiceId}/receipts`).set(auth(t.asha)).send({ amount: 100, reference: 'UTR1' }).expect(403); // the payee cannot record
      await api(app).post(`/v1/projects/${projectId}/invoices/${invoiceId}/receipts`).set(auth(t.uniteAdmin)).send({ amount: Number(m1.amount) + 1, reference: 'UTR0' }).expect(400);
      const part = (await api(app).post(`/v1/projects/${projectId}/invoices/${invoiceId}/receipts`).set(auth(t.uniteAdmin)).send({ amount: 1_00_00_000_00, reference: 'UTR-001' }).expect(201)).body;
      expect(part).toMatchObject({ paid: false, outstanding: Number(m1.amount) - 1_00_00_000_00 });
      await api(app).post(`/v1/projects/${projectId}/invoices/${invoiceId}/receipts`).set(auth(t.uniteAdmin)).send({ amount: 1, reference: 'UTR-001' }).expect(409); // same reference twice
      expect((await api(app).get(`/v1/projects/${projectId}/payments`).set(auth(t.asha)).expect(200)).body.milestones[0].state).toBe('partially_paid');
      const rec = (await api(app).get('/v1/finance/reconciliation').set(auth(t.finance)).expect(200)).body;
      expect(rec.totals.overdueCount).toBe(1);
      expect(rec.remindersSent).toBe(1);
      expect((await api(app).get('/v1/finance/reconciliation').set(auth(t.finance)).expect(200)).body.remindersSent).toBe(0); // once a week
      await api(app).get('/v1/finance/reconciliation').set(auth(t.asha)).expect(403);
      const full = (await api(app).post(`/v1/projects/${projectId}/invoices/${invoiceId}/receipts`).set(auth(t.uniteAdmin)).send({ amount: Number(m1.amount) - 1_00_00_000_00, reference: 'UTR-002' }).expect(201)).body;
      expect(full).toMatchObject({ paid: true, outstanding: 0 });
      expect((await one('select status, payment_reference from project_invoices where id = $1', [invoiceId]))).toMatchObject({ status: 'paid', payment_reference: 'UTR-002' });
      expect((await api(app).get(`/v1/projects/${projectId}/payments`).set(auth(t.asha)).expect(200)).body.milestones[0].state).toBe('paid');
    });
  });

  describe('resolution centre', () => {
    let caseId: string;
    it('a party raises a contract dispute against another party; the other party responds', async () => {
      const volt = await org('Volt EPC'); const solar = await org('Unite Solar');
      await api(app).post(`/v1/projects/${projectId}/disputes`).set(auth(t.asha)).send({ againstOrgId: volt, subject: 'Self', statement: 'This cannot be raised against my own company at all.' }).expect(400);
      const c = (await api(app).post(`/v1/projects/${projectId}/disputes`).set(auth(t.asha)).send({ againstOrgId: solar, subject: 'Scope change not paid', statement: 'Additional cabling of 1.2 km was instructed on site and is not covered by any milestone or variation.', amount: 6_00_000_00 }).expect(201)).body;
      caseId = c.id;
      expect(c.code).toMatch(/^RC-\d{4}-\d{5}$/);
      await api(app).get(`/v1/resolution/${caseId}`).set(auth(t.ravi)).expect(404);
      await api(app).post(`/v1/resolution/${caseId}/respond`).set(auth(t.uniteAdmin)).send({ body: 'Variation was never approved in writing.' }).expect(201);
      const mine = (await api(app).get('/v1/resolution/mine').set(auth(t.asha)).expect(200)).body;
      expect(mine.some((x: any) => x.kind === 'contract' && x.id === caseId)).toBe(true);
    });
    it('Unite assigns a reviewer; only that reviewer decides; one appeal within 14 days; a super admin closes it', async () => {
      const q = (await api(app).get('/v1/admin/resolution').set(auth(t.compliance)).expect(200)).body;
      const row = q.cases.find((x: any) => x.id === caseId);
      expect(row).toMatchObject({ kind: 'contract', open: true, reviewer: null });
      expect(q.totals.unassigned).toBeGreaterThanOrEqual(1);
      const reviewer = q.reviewers.find((r: any) => /Compliance/.test(r.name));
      await api(app).post('/v1/admin/resolution/assign').set(auth(t.asha)).send({ kind: 'contract', sourceId: caseId, reviewerUserId: reviewer.id }).expect(403);
      await api(app).post('/v1/admin/resolution/assign').set(auth(t.uniteAdmin)).send({ kind: 'contract', sourceId: caseId, reviewerUserId: reviewer.id }).expect(200);
      const tl = (await api(app).get(`/v1/admin/resolution/contract/${caseId}/timeline`).set(auth(t.compliance)).expect(200)).body;
      expect(tl.digest).toMatchObject({ count: expect.any(Number) });
      expect(tl.digest.note).toMatch(/not a finding/);
      const decision = { decision: 'partly_upheld', note: 'Site instruction is evidenced by photos; quantity to be measured jointly before payment.' };
      await api(app).post(`/v1/admin/resolution/contract/${caseId}/decide`).set(auth(t.finance)).send(decision).expect(403); // not assigned
      await api(app).post(`/v1/admin/resolution/contract/${caseId}/decide`).set(auth(t.compliance)).send(decision).expect(200);
      await api(app).post(`/v1/resolution/${caseId}/appeal`).set(auth(t.asha)).send({ note: 'Joint measurement already happened on 2 November; please include it.' }).expect(200);
      await api(app).post(`/v1/resolution/${caseId}/appeal`).set(auth(t.asha)).send({ note: 'Second appeal should not be possible at all here.' }).expect(409);
      await api(app).post(`/v1/admin/resolution/contract/${caseId}/decide`).set(auth(t.compliance)).send(decision).expect(403); // appeals go to a super admin
      expect((await api(app).post(`/v1/admin/resolution/contract/${caseId}/decide`).set(auth(t.superadmin)).send({ decision: 'upheld', note: 'Joint measurement record confirms 1.2 km; pay as a variation.' }).expect(200)).body.status).toBe('closed');
    });
  });

  describe('consortium ledger and agreements', () => {
    let teamId: string;
    it('members pledge and deliver; the lead confirms; gaps against agreed shares are flagged', async () => {
      teamId = (await one("select id from collaboration_teams where name = 'Chakan Rooftop Consortium'")).id;
      await pool.query("update team_members set status = 'nda_signed' where team_id = $1 and status in ('invited','accepted','nda_signed')", [teamId]);
      const members = (await pool.query("select o.display_name n from team_members m join organizations o on o.id = m.organization_id where m.team_id = $1 and m.status = 'nda_signed'", [teamId])).rows.map((r) => r.n);
      expect(members).toEqual(expect.arrayContaining(['Volt EPC']));
      await api(app).get(`/v1/teams/${teamId}/ledger`).set(auth(t.vikram)).expect(404);
      const c = (await api(app).post(`/v1/teams/${teamId}/contributions`).set(auth(t.asha)).send({ kind: 'equipment', description: 'Crane and installation tools for 6 weeks', pledgedValue: 4_00_000_00 }).expect(201)).body;
      await api(app).post(`/v1/team-contributions/${c.id}/deliver`).set(auth(t.asha)).send({ deliveredValue: 3_00_000_00, evidence: 'Crane on site 4 weeks, log attached' }).expect(200);
      const l = (await api(app).get(`/v1/teams/${teamId}/ledger`).set(auth(t.asha)).expect(200)).body;
      const v = l.ledger.find((x: any) => x.name === 'Volt EPC');
      expect(v).toMatchObject({ pledged: 4_00_000_00, delivered: 3_00_000_00 });
      expect(v.flags).toContain('Delivered less than pledged');
      expect(l.note).toMatch(/separate legal step/);
    });
    it('MoU drafts bind nothing until every member approves the same text; amendments need an approved MoU', async () => {
      const draft = { kind: 'mou', title: 'Chakan rooftop consortium MoU', decisionRule: 'majority', authority: 'Volt EPC signs customer documents; finance above ₹10 lakh needs all members.', body: 'Volt EPC leads delivery; members contribute equipment and crews as recorded in the ledger. Shares follow the approved sharing proposal.' };
      await api(app).post(`/v1/teams/${teamId}/agreements`).set(auth(t.asha)).send({ ...draft, kind: 'amendment' }).expect(400);
      const a = (await api(app).post(`/v1/teams/${teamId}/agreements`).set(auth(t.asha)).send(draft).expect(201)).body;
      const l = (await api(app).get(`/v1/teams/${teamId}/ledger`).set(auth(t.asha)).expect(200)).body;
      const others = l.members.filter((m: any) => m.name !== 'Volt EPC');
      expect(l.agreements[0]).toMatchObject({ status: 'proposed', version: 1 });
      if (!others.length) return;
      const tokenFor: Record<string, string> = { 'Sunrise Traders': t.ravi, 'Meera Iyer Consulting': t.meera, 'Deccan Distributors': t.deepak };
      for (const m of others) {
        const tok = tokenFor[m.name];
        if (tok) await api(app).post(`/v1/team-agreements/${a.id}/approve`).set(auth(tok)).expect(200);
      }
      const after = (await api(app).get(`/v1/teams/${teamId}/ledger`).set(auth(t.asha)).expect(200)).body;
      expect(after.agreements[0].status).toBe(others.every((m: any) => tokenFor[m.name]) ? 'approved' : 'proposed');
    });
  });

  it('radar shows open opportunities, packages, verified partners and capacity for a state', async () => {
    const r = (await api(app).get('/v1/radar?region=IN-MH').set(auth(t.ravi)).expect(200)).body;
    expect(r.region).toBe('IN-MH');
    expect(r.totals).toMatchObject({ partners: expect.any(Number), packages: expect.any(Number) });
    expect(r.partners.some((p: any) => p.name === 'Volt EPC')).toBe(true);
    expect(r.partners.some((p: any) => p.name === 'Sunrise Traders')).toBe(false); // never yourself
    expect(r.note).toMatch(/no scraped/);
  });
});
