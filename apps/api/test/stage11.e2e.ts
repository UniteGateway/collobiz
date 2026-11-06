import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { executedContract, idemKey } from './flows';
import type { SeedRefs } from '../src/db/seed';

const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

describe('Stage 11a — project execution (gate: evidence-based certification and change logs)', () => {
  let app: INestApplication;
  let refs: SeedRefs;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  let contract: any;
  let project: any;
  let m1: any; let m2: any;
  let subMember: any;

  beforeAll(async () => {
    await resetDatabase(); refs = await seed(); app = await bootApp(); t = await loginAll(app);
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    ({ contract } = await executedContract(app, t, refs, pool, 10_00_000_00));
  });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('project starts only from an executed contract, by the issuer; owner and lead are set from the contract', async () => {
    await api(app).post(`/v1/contracts/${contract.id}/project`).set(auth(t.asha)).send({ startDate: '2026-11-10', endDate: '2027-01-31' }).expect(403);
    await api(app).post(`/v1/contracts/${contract.id}/project`).set(auth(t.uniteAdmin)).send({ startDate: '2026-12-10', endDate: '2026-11-01' }).expect(400);
    const r = await api(app).post(`/v1/contracts/${contract.id}/project`).set(auth(t.uniteAdmin)).send({ startDate: '2026-11-10', endDate: '2027-01-31', site: 'Chakan MIDC Phase II, Pune' }).expect(201);
    project = r.body;
    expect(project).toMatchObject({ status: 'planning', value: 10_00_000_00, ownerOrgId: refs.orgs.uniteSolar, leadOrgId: refs.orgs.volt });
    await api(app).post(`/v1/contracts/${contract.id}/project`).set(auth(t.uniteAdmin)).send({ startDate: '2026-11-10', endDate: '2027-01-31' }).expect(409); // one project per contract
    const pf = await api(app).get('/v1/projects').set(auth(t.asha)).expect(200);
    expect(pf.body.find((x: any) => x.id === project.id)).toMatchObject({ role: 'lead', owner: 'Unite Solar' });
    await api(app).get(`/v1/projects/${project.id}`).set(auth(t.ravi)).expect(404);
  });

  it('077/078 lead plans milestones and allocates a subcontractor; owner approves the baseline only when fully planned', async () => {
    await api(app).post(`/v1/projects/${project.id}/milestones`).set(auth(t.uniteAdmin)).send({ title: 'Owner cannot plan', dueDate: '2026-12-01', amount: 100 }).expect(403);
    m1 = (await api(app).post(`/v1/projects/${project.id}/milestones`).set(auth(t.asha)).send({ title: 'Trenching & cable laying', dueDate: '2026-12-15', amount: 6_00_000_00 }).expect(201)).body;
    await api(app).post(`/v1/projects/${project.id}/milestones`).set(auth(t.asha)).send({ title: 'Too much', dueDate: '2027-01-15', amount: 5_00_000_00 }).expect(400);
    const sub = await api(app).post(`/v1/projects/${project.id}/members`).set(auth(t.asha)).send({ organizationId: refs.orgs.sunrise, scope: 'Supply and termination of cable glands and lugs', allocatedValue: 1_50_000_00 }).expect(201);
    subMember = sub.body;
    await api(app).post(`/v1/projects/${project.id}/members`).set(auth(t.asha)).send({ organizationId: refs.orgs.greenbuild, scope: 'Unverified partner' }).expect(400);
    m2 = (await api(app).post(`/v1/projects/${project.id}/milestones`).set(auth(t.asha)).send({ title: 'Terminations, testing & commissioning', dueDate: '2027-01-20', amount: 3_00_000_00, assignedOrgId: refs.orgs.sunrise, requiresInspection: 'both' }).expect(201)).body;
    const a = await api(app).post(`/v1/projects/${project.id}/activate`).set(auth(t.uniteAdmin)).expect(400);
    expect(a.body.problems[0]).toMatch(/must add up to the project value/);
    await api(app).patch(`/v1/projects/${project.id}/milestones/${m2.id}`).set(auth(t.asha)).send({ amount: 4_00_000_00 }).expect(200); // planning: no reason needed
    await api(app).post(`/v1/projects/${project.id}/activate`).set(auth(t.asha)).expect(403); // only the owner approves
    const act = await api(app).post(`/v1/projects/${project.id}/activate`).set(auth(t.uniteAdmin)).expect(200);
    expect(act.body.status).toBe('active');
    // Subcontractor sees only its own money
    const ms = await api(app).get(`/v1/projects/${project.id}/milestones`).set(auth(t.ravi)).expect(200);
    expect(ms.body.milestones.find((m: any) => m.id === m1.id).amount).toBeUndefined();
    expect(ms.body.milestones.find((m: any) => m.id === m2.id).amount).toBe(4_00_000_00);
    expect(ms.body.project.value).toBeUndefined();
  });

  it('GATE (change logs): after baseline, re-planning needs a reason and every change is logged before/after, append-only', async () => {
    const no = await api(app).patch(`/v1/projects/${project.id}/milestones/${m1.id}`).set(auth(t.asha)).send({ dueDate: '2026-12-22' }).expect(400);
    expect(no.body.fields?.reason ?? no.body.message).toBeTruthy();
    await api(app).patch(`/v1/projects/${project.id}/milestones/${m1.id}`).set(auth(t.asha)).send({ dueDate: '2026-12-22', reason: 'Monsoon backlog delayed trenching permits' }).expect(200);
    await api(app).patch(`/v1/projects/${project.id}/members/${subMember.id}`).set(auth(t.asha)).send({ allocatedValue: 1_80_000_00 }).expect(400);
    await api(app).patch(`/v1/projects/${project.id}/members/${subMember.id}`).set(auth(t.asha)).send({ allocatedValue: 1_80_000_00, reason: 'Added 40 extra terminations' }).expect(200);
    const log = await api(app).get(`/v1/projects/${project.id}/changes`).set(auth(t.uniteAdmin)).expect(200);
    const due = log.body.find((c: any) => c.field === 'dueDate');
    expect(due).toMatchObject({ before: '2026-12-15', after: '2026-12-22', reason: 'Monsoon backlog delayed trenching permits', who: 'Asha Patil', org: 'Volt EPC' });
    expect(log.body.find((c: any) => c.field === 'allocatedValue')).toMatchObject({ before: 1_50_000_00, after: 1_80_000_00 });
    expect(log.body.find((c: any) => c.field === 'status' && c.after === 'active')).toBeTruthy();
    const subLog = await api(app).get(`/v1/projects/${project.id}/changes`).set(auth(t.ravi)).expect(200);
    expect(subLog.body.find((c: any) => c.field === 'allocatedValue').after).toBeNull(); // money hidden from subcontractors
    await expect(pool.query("update project_change_log set reason = 'rewritten' where project_id = $1", [project.id])).rejects.toThrow(/append-only/);
    await expect(pool.query('delete from project_change_log where project_id = $1', [project.id])).rejects.toThrow(/append-only/);
  });

  it('079/080/081 progress with photos, materials, versioned documents', async () => {
    await api(app).post(`/v1/projects/${project.id}/milestones/${m1.id}/start`).set(auth(t.asha)).expect(200);
    await api(app).post(`/v1/projects/${project.id}/updates`).set(auth(t.asha)).field('note', 'Half the trench is dug').field('progressPct', '50').expect(400); // progress without milestone
    const up = await api(app).post(`/v1/projects/${project.id}/updates`).set(auth(t.asha)).field('note', 'Trenching complete on the east run; cable pulled 1.2 km.').field('progressPct', '60').field('milestoneId', m1.id)
      .attach('files', png, { filename: 'trench.png', contentType: 'image/png' }).expect(201);
    expect(up.body.attachments).toBe(1);
    await api(app).post(`/v1/projects/${project.id}/updates`).set(auth(t.ravi)).field('note', 'Not my milestone').field('milestoneId', m1.id).expect(403);
    const ups = await api(app).get(`/v1/projects/${project.id}/updates`).set(auth(t.uniteAdmin)).expect(200);
    expect(ups.body[0].attachments[0]).toMatchObject({ category: 'photo', mime: 'image/png' });
    expect(ups.body[0].attachments[0].objectKey).toBeUndefined();
    const mat = await api(app).post(`/v1/projects/${project.id}/materials`).set(auth(t.asha)).send({ item: '4C x 300 sq mm XLPE armoured cable', quantity: 2000, unit: 'm', neededBy: '2026-11-25' }).expect(201);
    await api(app).patch(`/v1/projects/${project.id}/materials/${mat.body.id}`).set(auth(t.asha)).send({ deliveredQty: 2500 }).expect(400);
    await api(app).patch(`/v1/projects/${project.id}/materials/${mat.body.id}`).set(auth(t.asha)).send({ status: 'delivered', deliveredQty: 2000 }).expect(200);
    await api(app).patch(`/v1/projects/${project.id}/materials/${mat.body.id}`).set(auth(t.uniteAdmin)).send({ status: 'installed' }).expect(403);
    const d1 = await api(app).post(`/v1/projects/${project.id}/documents`).set(auth(t.asha)).field('title', 'Cable route drawing').field('category', 'drawing').attach('file', Buffer.from('%PDF-1.4 rev0'), { filename: 'route-r0.pdf', contentType: 'application/pdf' }).expect(201);
    await api(app).post(`/v1/projects/${project.id}/documents`).set(auth(t.asha)).field('title', 'Cable route drawing').field('category', 'drawing').field('supersedesId', d1.body.id).field('reason', 'Rerouted around the substation').attach('file', Buffer.from('%PDF-1.4 rev1'), { filename: 'route-r1.pdf', contentType: 'application/pdf' }).expect(201);
    const docs = await api(app).get(`/v1/projects/${project.id}/documents`).set(auth(t.uniteAdmin)).expect(200);
    expect(docs.body.filter((d: any) => d.title === 'Cable route drawing').map((d: any) => d.current).sort()).toEqual([false, true]);
  });

  it('GATE (evidence): submission needs 100% progress and evidence; certification needs the owner’s passing inspection and unchanged evidence', async () => {
    let s = await api(app).post(`/v1/projects/${project.id}/milestones/${m1.id}/submit`).set(auth(t.asha)).send({ note: 'Ready for check' }).expect(400);
    expect(s.body.problems).toEqual(['Report 100% progress before submitting']);
    await api(app).post(`/v1/projects/${project.id}/updates`).set(auth(t.asha)).field('note', 'All 2 km laid and megger tested; IR > 100 MΩ on all cores.').field('progressPct', '100').field('milestoneId', m1.id)
      .attach('files', Buffer.from('%PDF-1.4 megger report'), { filename: 'megger.pdf', contentType: 'application/pdf' }).expect(201);
    s = await api(app).post(`/v1/projects/${project.id}/milestones/${m1.id}/submit`).set(auth(t.asha)).send({ note: 'Trenching and laying complete; megger report attached.' }).expect(200);
    expect(s.body.evidenceHash).toMatch(/^[0-9a-f]{64}$/);
    // Lead's own inspection is not independent; owner certification is still blocked
    await api(app).post(`/v1/projects/${project.id}/inspections`).set(auth(t.asha)).send({ milestoneId: m1.id, kind: 'quality', checklist: [{ item: 'Trench depth ≥ 750 mm', result: 'pass' }] }).expect(201);
    await api(app).post(`/v1/projects/${project.id}/milestones/${m1.id}/certify`).set(auth(t.asha)).set('Idempotency-Key', idemKey()).send({ decision: 'certify', note: 'Self-certify attempt' }).expect(403);
    let c = await api(app).post(`/v1/projects/${project.id}/milestones/${m1.id}/certify`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).send({ decision: 'certify', note: 'Looks fine' }).expect(409);
    expect(c.body.problems).toEqual(['Passing quality inspection by the owner']);
    // Owner inspects: a failure opens an NCR that blocks certification until closed
    await api(app).post(`/v1/projects/${project.id}/inspections`).set(auth(t.uniteAdmin)).send({ milestoneId: m1.id, kind: 'quality', checklist: [{ item: 'Warning tape laid', result: 'fail' }] }).expect(400); // corrective action required
    const ncr = await api(app).post(`/v1/projects/${project.id}/inspections`).set(auth(t.uniteAdmin)).send({ milestoneId: m1.id, kind: 'quality', checklist: [{ item: 'Warning tape laid', result: 'fail' }, { item: 'Route markers', result: 'pass' }], correctiveAction: 'Lay warning tape over the east run' }).expect(201);
    await api(app).post(`/v1/projects/${project.id}/inspections`).set(auth(t.uniteAdmin)).send({ milestoneId: m1.id, kind: 'quality', checklist: [{ item: 'Trench depth', result: 'pass' }, { item: 'Backfill compaction', result: 'pass' }] }).expect(201);
    c = await api(app).post(`/v1/projects/${project.id}/milestones/${m1.id}/certify`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).send({ decision: 'certify', note: 'Looks fine' }).expect(409);
    expect(c.body.problems).toEqual(['No open non-conformance on this milestone']);
    await api(app).post(`/v1/projects/${project.id}/inspections/${ncr.body.id}/close`).set(auth(t.asha)).send({ note: 'Tape laid' }).expect(403);
    await api(app).post(`/v1/projects/${project.id}/inspections/${ncr.body.id}/close`).set(auth(t.uniteAdmin)).send({ note: 'Warning tape verified on site' }).expect(200);
    // Evidence changed after submission → refused (simulate a late swap of an evidence record)
    const docId = (await pool.query("select id from project_documents where milestone_id = $1 order by created_at limit 1", [m1.id])).rows[0].id;
    await pool.query("update project_documents set sha256 = repeat('a', 64) where id = $1", [docId]);
    c = await api(app).post(`/v1/projects/${project.id}/milestones/${m1.id}/certify`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).send({ decision: 'certify', note: 'Looks fine' }).expect(409);
    expect(c.body.problems).toEqual(['Evidence unchanged since submission']);
    // Reject → the lead reopens the milestone and resubmits, which re-seals the evidence as it now stands
    await api(app).post(`/v1/projects/${project.id}/milestones/${m1.id}/certify`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).send({ decision: 'reject', note: 'Evidence record changed; resubmit with current files' }).expect(200);
    await api(app).post(`/v1/projects/${project.id}/milestones/${m1.id}/submit`).set(auth(t.asha)).send({ note: 'Too early' }).expect(409); // must reopen first
    expect((await api(app).post(`/v1/projects/${project.id}/milestones/${m1.id}/start`).set(auth(t.asha)).expect(200)).body.status).toBe('in_progress');
    await api(app).post(`/v1/projects/${project.id}/milestones/${m1.id}/submit`).set(auth(t.asha)).send({ note: 'Resubmitted with current evidence' }).expect(200);
    c = await api(app).post(`/v1/projects/${project.id}/milestones/${m1.id}/certify`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).send({ decision: 'certify', certifiedAmount: 5_80_000_00, note: 'Deducted 20,000 for 40 m of missing warning tape' }).expect(200);
    expect(c.body).toMatchObject({ status: 'certified', certifiedAmount: 5_80_000_00 });
    await expect(pool.query('update milestones set certified_amount = 6000000000 where id = $1', [m1.id])).rejects.toThrow(/certified; its amount, evidence and certification are locked/);
    await api(app).post(`/v1/projects/${project.id}/documents`).set(auth(t.asha)).field('title', 'Late photo').field('category', 'photo').field('milestoneId', m1.id).attach('file', png, { filename: 'late.png', contentType: 'image/png' }).expect(409);
    await api(app).patch(`/v1/projects/${project.id}/milestones/${m1.id}`).set(auth(t.asha)).send({ amount: 6_00_000_00, reason: 'Try to restore' }).expect(409);
  });

  it('083 invoice and payment: lead invoices certified amount once; owner records payment once', async () => {
    await api(app).post(`/v1/projects/${project.id}/milestones/${m2.id}/invoice`).set(auth(t.asha)).set('Idempotency-Key', idemKey()).expect(409); // not certified
    const inv = await api(app).post(`/v1/projects/${project.id}/milestones/${m1.id}/invoice`).set(auth(t.asha)).set('Idempotency-Key', idemKey()).expect(201);
    expect(inv.body).toMatchObject({ amount: 5_80_000_00, status: 'issued' });
    await api(app).post(`/v1/projects/${project.id}/milestones/${m1.id}/invoice`).set(auth(t.asha)).set('Idempotency-Key', idemKey()).expect(409);
    await api(app).post(`/v1/projects/${project.id}/invoices/${inv.body.id}/paid`).set(auth(t.asha)).set('Idempotency-Key', idemKey()).send({ paymentReference: 'UTR123' }).expect(403);
    await api(app).post(`/v1/projects/${project.id}/invoices/${inv.body.id}/paid`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).send({ paymentReference: 'UTR-HDFC-0001' }).expect(200);
    await api(app).post(`/v1/projects/${project.id}/invoices/${inv.body.id}/paid`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).send({ paymentReference: 'UTR-HDFC-0002' }).expect(409);
    const ov = await api(app).get(`/v1/projects/${project.id}`).set(auth(t.uniteAdmin)).expect(200);
    expect(ov.body.financials).toMatchObject({ value: 10_00_000_00, certified: 5_80_000_00, invoiced: 5_80_000_00, paid: 5_80_000_00 });
    expect((await api(app).get(`/v1/projects/${project.id}`).set(auth(t.ravi)).expect(200)).body.financials).toBeUndefined();
  });

  it('084 closure: completion needs every milestone invoiced, no NCRs and handover docs; closing needs payment', async () => {
    let c = await api(app).post(`/v1/projects/${project.id}/complete`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).expect(409);
    expect(c.body.problems).toEqual(expect.arrayContaining(['Every milestone certified and invoiced', 'Handover documents uploaded (as-built drawings, manuals, warranties)']));
    // Subcontractor delivers milestone 2 (needs quality + safety inspections by the owner)
    await api(app).post(`/v1/projects/${project.id}/milestones/${m2.id}/start`).set(auth(t.ravi)).expect(200);
    await api(app).post(`/v1/projects/${project.id}/updates`).set(auth(t.ravi)).field('note', 'All terminations done and tested.').field('progressPct', '100').field('milestoneId', m2.id).attach('files', png, { filename: 'glands.png', contentType: 'image/png' }).expect(201);
    await api(app).post(`/v1/projects/${project.id}/milestones/${m2.id}/submit`).set(auth(t.ravi)).send({ note: 'Terminations complete' }).expect(200);
    await api(app).post(`/v1/projects/${project.id}/inspections`).set(auth(t.uniteAdmin)).send({ milestoneId: m2.id, kind: 'quality', checklist: [{ item: 'Torque marks', result: 'pass' }] }).expect(201);
    c = await api(app).post(`/v1/projects/${project.id}/milestones/${m2.id}/certify`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).send({ decision: 'certify', note: 'Quality looks good' }).expect(409);
    expect(c.body.problems).toEqual(['Passing safety inspection by the owner']);
    await api(app).post(`/v1/projects/${project.id}/inspections`).set(auth(t.uniteAdmin)).send({ milestoneId: m2.id, kind: 'safety', checklist: [{ item: 'LOTO applied during terminations', result: 'pass' }, { item: 'PPE', result: 'na' }] }).expect(201);
    await api(app).post(`/v1/projects/${project.id}/milestones/${m2.id}/certify`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).send({ decision: 'certify', note: 'Terminations accepted' }).expect(200);
    const inv2 = await api(app).post(`/v1/projects/${project.id}/milestones/${m2.id}/invoice`).set(auth(t.asha)).set('Idempotency-Key', idemKey()).expect(201);
    await api(app).post(`/v1/projects/${project.id}/documents`).set(auth(t.asha)).field('title', 'As-built drawings & test certificates').field('category', 'handover').attach('file', Buffer.from('%PDF-1.4 as built'), { filename: 'as-built.pdf', contentType: 'application/pdf' }).expect(201);
    await api(app).post(`/v1/projects/${project.id}/complete`).set(auth(t.asha)).set('Idempotency-Key', idemKey()).expect(403);
    c = await api(app).post(`/v1/projects/${project.id}/complete`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).expect(200);
    expect(c.body).toMatchObject({ status: 'completed', certificate: { code: expect.stringMatching(/^CMP-\d{4}-\d{6}$/), hash: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect(c.body.certificate.snapshot.milestones.map((m: any) => m.certifiedAmount)).toEqual([5_80_000_00, 4_00_000_00]);
    const cl = await api(app).post(`/v1/projects/${project.id}/close`).set(auth(t.uniteAdmin)).expect(409);
    expect(cl.body.problems).toEqual(['Every invoice paid (required to close)']);
    await api(app).post(`/v1/projects/${project.id}/invoices/${inv2.body.id}/paid`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).send({ paymentReference: 'UTR-HDFC-0003' }).expect(200);
    expect((await api(app).post(`/v1/projects/${project.id}/close`).set(auth(t.uniteAdmin)).expect(200)).body.status).toBe('closed');
    const audit = await pool.query("select count(*)::int n from audit_events where action = 'project.invoice_paid'");
    expect(audit.rows[0].n).toBe(2);
  });
});
