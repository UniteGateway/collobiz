import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { executedContract, idemKey } from './flows';
import type { SeedRefs } from '../src/db/seed';

const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

describe('Stage 12 — commission ledger & finance (gate: no unearned payout, idempotent settlement)', () => {
  let app: INestApplication;
  let refs: SeedRefs;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  let project: any; let m1: any; let m2: any; let policy: any; let agreement: any;
  let line1: any; let line2: any; let payout1: any;

  /** Drives one milestone through evidence → owner inspection → certification. */
  async function certify(m: any) {
    await api(app).post(`/v1/projects/${project.id}/milestones/${m.id}/start`).set(auth(t.asha)).expect(200);
    await api(app).post(`/v1/projects/${project.id}/updates`).set(auth(t.asha)).field('note', `Work complete on ${m.title}`).field('progressPct', '100').field('milestoneId', m.id).attach('files', png, { filename: 'done.png', contentType: 'image/png' }).expect(201);
    await api(app).post(`/v1/projects/${project.id}/milestones/${m.id}/submit`).set(auth(t.asha)).send({ note: 'Complete with photo evidence' }).expect(200);
    await api(app).post(`/v1/projects/${project.id}/inspections`).set(auth(t.uniteAdmin)).send({ milestoneId: m.id, kind: 'quality', checklist: [{ item: 'Workmanship', result: 'pass' }] }).expect(201);
    await api(app).post(`/v1/projects/${project.id}/milestones/${m.id}/certify`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).send({ decision: 'certify', note: 'Accepted in full' }).expect(200);
  }
  async function invoiceAndPay(m: any, ref: string) {
    const inv = (await api(app).post(`/v1/projects/${project.id}/milestones/${m.id}/invoice`).set(auth(t.asha)).set('Idempotency-Key', idemKey()).expect(201)).body;
    await api(app).post(`/v1/projects/${project.id}/invoices/${inv.id}/paid`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).send({ paymentReference: ref }).expect(200);
  }
  const line = async (mid: string) => (await api(app).get('/v1/earnings').set(auth(t.meera)).expect(200)).body.lines.find((l: any) => l.description.startsWith(mid === m1.id ? 'Milestone 1' : 'Milestone 2'));

  beforeAll(async () => {
    await resetDatabase(); refs = await seed(); app = await bootApp(); t = await loginAll(app);
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const { contract } = await executedContract(app, t, refs, pool, 1_20_00_000_00);
    project = (await api(app).post(`/v1/contracts/${contract.id}/project`).set(auth(t.uniteAdmin)).send({ startDate: '2026-11-10', endDate: '2027-03-31' }).expect(201)).body;
    m1 = (await api(app).post(`/v1/projects/${project.id}/milestones`).set(auth(t.asha)).send({ title: 'Civil and structure', dueDate: '2026-12-31', amount: 1_10_00_000_00 }).expect(201)).body;
    m2 = (await api(app).post(`/v1/projects/${project.id}/milestones`).set(auth(t.asha)).send({ title: 'Commissioning', dueDate: '2027-02-28', amount: 10_00_000_00 }).expect(201)).body;
    await api(app).post(`/v1/projects/${project.id}/activate`).set(auth(t.uniteAdmin)).expect(200);
  });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('135 policies: drafted by a commission admin, activated by a different finance approver, immutable once active', async () => {
    await api(app).post('/v1/admin/commission-policies').set(auth(t.finance)).send({ code: 'TEST-INTRO', name: 'Test introducer', basis: 'percent', rateBps: 500 }).expect(403);
    await api(app).post('/v1/admin/commission-policies').set(auth(t.superadmin)).send({ code: 'TEST-INTRO', name: 'Test introducer', basis: 'percent' }).expect(400);
    policy = (await api(app).post('/v1/admin/commission-policies').set(auth(t.superadmin)).send({ code: 'TEST-INTRO', name: 'Test introducer 5%', basis: 'percent', rateBps: 500, tdsBps: 500 }).expect(201)).body;
    await api(app).post(`/v1/admin/commission-policies/${policy.id}/activate`).set(auth(t.superadmin)).expect(403); // lacks commission.approve
    policy = (await api(app).post(`/v1/admin/commission-policies/${policy.id}/activate`).set(auth(t.finance)).expect(200)).body;
    expect(policy).toMatchObject({ status: 'active', version: 1 });
    await api(app).post(`/v1/admin/commission-policies/${policy.id}/activate`).set(auth(t.finance2)).expect(409);
    const calc = await api(app).post('/v1/commissions/calculate').set(auth(t.meera)).send({ dealValue: 1_00_000_00, policyId: policy.id }).expect(200);
    expect(calc.body).toMatchObject({ gross: 5_000_00, taxable: 5_000_00, tds: 250_00, payable: 4_750_00 });
    const tiered = await api(app).post('/v1/commissions/calculate').set(auth(t.meera)).send({ dealValue: 2_00_00_000_00, basis: 'tiered', tiers: [{ upTo: 1_00_00_000_00, rateBps: 250 }, { upTo: null, rateBps: 150 }], gstRegistered: true }).expect(200);
    expect(tiered.body.gross).toBe(4_00_000_00); // 2.5% of first 1 Cr + 1.5% of next 1 Cr
    expect(tiered.body.gst).toBe(72_000_00);
  });

  it('096/157 agreement: created by the payer, terms frozen and hashed; every milestone becomes a projected line', async () => {
    await api(app).post('/v1/commissions/agreements').set(auth(t.asha)).send({ projectId: project.id, beneficiaryOrgId: refs.orgs.meera, policyId: policy.id }).expect(403);
    await api(app).post('/v1/commissions/agreements').set(auth(t.uniteAdmin)).send({ projectId: project.id, beneficiaryOrgId: refs.orgs.greenbuild, policyId: policy.id }).expect(400);
    agreement = (await api(app).post('/v1/commissions/agreements').set(auth(t.uniteAdmin)).send({ projectId: project.id, beneficiaryOrgId: refs.orgs.meera, policyId: policy.id }).expect(201)).body;
    const a = await api(app).get(`/v1/commissions/agreements/${agreement.id}`).set(auth(t.meera)).expect(200);
    expect(a.body).toMatchObject({ termsIntact: true, beneficiary: 'Meera Iyer Consulting', payer: 'Unite Solar' });
    expect(a.body.lines.map((l: any) => [l.status, l.gross])).toEqual([['estimated', 5_50_000_00], ['estimated', 50_000_00]]);
    await api(app).get(`/v1/commissions/agreements/${agreement.id}`).set(auth(t.ravi)).expect(404);
    line1 = await line(m1.id); line2 = await line(m2.id);
    expect(line1.payable).toBe(5_22_500_00); // 5,50,000 − 5% TDS (individual, no GST)
  });

  it('GATE: nothing before customer payment can be approved, requested or paid — not even by direct SQL', async () => {
    let r = await api(app).post(`/v1/finance/entries/${line1.id}/approve`).set(auth(t.finance)).set('Idempotency-Key', idemKey()).send({}).expect(409);
    expect(r.body.message).toMatch(/Not earned yet/);
    await api(app).post('/v1/payouts').set(auth(t.meera)).set('Idempotency-Key', idemKey()).send({ entryIds: [line1.id], partnerInvoiceNo: 'MIC/26-27/001' }).expect(409);
    await certify(m1);
    expect((await line(m1.id)).status).toBe('eligible');
    r = await api(app).post(`/v1/finance/entries/${line1.id}/approve`).set(auth(t.finance)).set('Idempotency-Key', idemKey()).send({}).expect(409);
    expect(r.body.message).toMatch(/Not earned yet/);
    const pid = (await pool.query("insert into payout_requests (code, beneficiary_org_id, partner_invoice_no, taxable, gst, tds, payable, requested_by) values ('PAY-HACK', $1, 'HACK-1', 1, 0, 0, 1, $2) returning id", [refs.orgs.meera, refs.users.meera])).rows[0].id;
    await expect(pool.query('update commission_entries set payout_id = $1 where id = $2', [pid, line1.id])).rejects.toThrow(/not earned and approved; it cannot be paid/);
    await expect(pool.query("update commission_entries set status = 'settled' where id = $1", [line1.id])).rejects.toThrow(/cannot be settled without being earned/);
    await pool.query('delete from payout_requests where id = $1', [pid]);
    // The customer pays → earned (system journal entry)
    await invoiceAndPay(m1, 'UTR-CUST-0001');
    const l = await line(m1.id);
    expect(l).toMatchObject({ status: 'earned', payable: 5_22_500_00 });
    const j = await api(app).get(`/v1/commissions/entries/${line1.id}/journal`).set(auth(t.meera)).expect(200);
    expect(j.body.map((x: any) => x.toStatus)).toEqual(['estimated', 'eligible', 'earned']);
    expect(j.body[2]).toMatchObject({ who: 'System (payment trigger)' });
    expect(j.body[2].note).toMatch(/Customer payment received/);
  });

  it('098 dual approval above the threshold; finance only, MFA required, one vote per person', async () => {
    await api(app).post(`/v1/finance/entries/${line1.id}/approve`).set(auth(t.meera)).set('Idempotency-Key', idemKey()).send({}).expect(403);
    let r = await api(app).post(`/v1/finance/entries/${line1.id}/approve`).set(auth(t.finance)).set('Idempotency-Key', idemKey()).send({ note: 'Checked against invoice' }).expect(200);
    expect(r.body).toMatchObject({ status: 'earned', approvals: 1, approvalsRequired: 2 });
    await api(app).post(`/v1/finance/entries/${line1.id}/approve`).set(auth(t.finance)).set('Idempotency-Key', idemKey()).send({}).expect(409);
    r = await api(app).post(`/v1/finance/entries/${line1.id}/approve`).set(auth(t.finance2)).set('Idempotency-Key', idemKey()).send({}).expect(200);
    expect(r.body).toMatchObject({ status: 'approved', approvals: 2 });
    const q = await api(app).get('/v1/finance/approvals').set(auth(t.finance)).expect(200);
    expect(q.body.entries.find((e: any) => e.id === line1.id)).toBeUndefined();
  });

  it('027/095/158/099/138 payout: bank verified, invoice number unique; settlement is idempotent and separated from approval', async () => {
    payout1 = (await api(app).post('/v1/payouts').set(auth(t.meera)).set('Idempotency-Key', idemKey()).send({ entryIds: [line1.id], partnerInvoiceNo: 'MIC/26-27/001' }).expect(201)).body;
    expect(payout1).toMatchObject({ status: 'requested', payable: 5_22_500_00, tds: 27_500_00 });
    await api(app).post('/v1/payouts').set(auth(t.meera)).set('Idempotency-Key', idemKey()).send({ entryIds: [line2.id], partnerInvoiceNo: 'MIC/26-27/001' }).expect(409); // not earned (and invoice reused)
    await api(app).post(`/v1/finance/payouts/${payout1.id}/settle`).set(auth(t.finance2)).set('Idempotency-Key', idemKey()).send({ bankReference: 'HDFCN26310000001' }).expect(409); // not approved yet
    await api(app).post(`/v1/finance/payouts/${payout1.id}/approve`).set(auth(t.finance)).expect(200);
    await api(app).post(`/v1/finance/payouts/${payout1.id}/settle`).set(auth(t.finance)).set('Idempotency-Key', idemKey()).send({ bankReference: 'HDFCN26310000001' }).expect(403); // approver cannot settle ≥ threshold
    const key = idemKey('settle');
    const s1 = await api(app).post(`/v1/finance/payouts/${payout1.id}/settle`).set(auth(t.finance2)).set('Idempotency-Key', key).send({ bankReference: 'HDFCN26310000001', method: 'neft' }).expect(200);
    const s2 = await api(app).post(`/v1/finance/payouts/${payout1.id}/settle`).set(auth(t.finance2)).set('Idempotency-Key', key).send({ bankReference: 'HDFCN26310000001', method: 'neft' }).expect(200);
    expect(s2.headers['idempotent-replay']).toBe('true');
    expect(s2.body.id).toBe(s1.body.id);
    await api(app).post(`/v1/finance/payouts/${payout1.id}/settle`).set(auth(t.finance2)).set('Idempotency-Key', idemKey()).send({ bankReference: 'HDFCN26310000002' }).expect(409); // already settled
    const n = await pool.query('select count(*)::int n from settlements where payout_id = $1', [payout1.id]);
    expect(n.rows[0].n).toBe(1);
    await expect(pool.query('update settlements set amount = 1 where payout_id = $1', [payout1.id])).rejects.toThrow(/immutable/);
    await expect(pool.query('delete from commission_journal where entry_id = $1', [line1.id])).rejects.toThrow(/append-only/);
    expect((await line(m1.id)).status).toBe('settled');
    const hist = await api(app).get('/v1/payouts').set(auth(t.meera)).expect(200);
    expect(hist.body[0]).toMatchObject({ status: 'settled', settlement: { bankReference: 'HDFCN26310000001', amount: 5_22_500_00 } });
    const tax = await api(app).get('/v1/tax-records').set(auth(t.meera)).expect(200);
    expect(tax.body.quarters[0]).toMatchObject({ taxable: 5_50_000_00, tds: 27_500_00, paid: 5_22_500_00, invoices: ['MIC/26-27/001'] });
    const earn = await api(app).get('/v1/earnings').set(auth(t.meera)).expect(200);
    expect(earn.body.totals.paidThisFy).toBe(5_22_500_00);
  });

  it('159 dispute → adjustment forces re-approval; holds block payouts; rejected payouts return lines; bank references are single-use', async () => {
    await certify(m2);
    await invoiceAndPay(m2, 'UTR-CUST-0002');
    await api(app).post(`/v1/finance/entries/${line2.id}/approve`).set(auth(t.finance)).set('Idempotency-Key', idemKey()).send({}).expect(200); // below threshold: one approval
    expect((await line(m2.id)).status).toBe('approved');
    const d = (await api(app).post('/v1/finance/disputes').set(auth(t.meera)).send({ kind: 'commission', entryId: line2.id, reason: 'Variation order of ₹2 L was certified separately and is missing from the base.', expectedAmount: 57_000_00 }).expect(201)).body;
    expect((await line(m2.id)).status).toBe('disputed');
    await api(app).post('/v1/finance/disputes').set(auth(t.meera)).send({ kind: 'commission', entryId: line2.id, reason: 'Second dispute on the same line should fail' }).expect(409);
    await api(app).post(`/v1/finance/disputes/${d.id}/rule`).set(auth(t.meera)).set('Idempotency-Key', idemKey()).send({ outcome: 'adjusted', resolution: 'Self-ruling attempt', adjustedAmount: 1 }).expect(403);
    await api(app).post(`/v1/finance/disputes/${d.id}/rule`).set(auth(t.finance)).set('Idempotency-Key', idemKey()).send({ outcome: 'adjusted', resolution: 'Variation verified; base increased to 12 L.' }).expect(400);
    await api(app).post(`/v1/finance/disputes/${d.id}/rule`).set(auth(t.finance)).set('Idempotency-Key', idemKey()).send({ outcome: 'adjusted', resolution: 'Variation verified; base increased to 12 L.', adjustedAmount: 57_000_00 }).expect(200);
    let l2 = await line(m2.id);
    expect(l2).toMatchObject({ status: 'earned', payable: 57_000_00 }); // re-priced lines need approval again
    await api(app).post(`/v1/finance/entries/${line2.id}/approve`).set(auth(t.finance2)).set('Idempotency-Key', idemKey()).send({}).expect(200);
    await api(app).post(`/v1/finance/entries/${line2.id}/hold`).set(auth(t.finance)).send({ reason: 'PAN-name mismatch under review' }).expect(200);
    await api(app).post('/v1/payouts').set(auth(t.meera)).set('Idempotency-Key', idemKey()).send({ entryIds: [line2.id], partnerInvoiceNo: 'MIC/26-27/002' }).expect(409);
    l2 = (await api(app).post(`/v1/finance/entries/${line2.id}/release`).set(auth(t.finance)).send({ note: 'PAN confirmed' }).expect(200)).body;
    expect(l2.status).toBe('approved');
    const p2 = (await api(app).post('/v1/payouts').set(auth(t.meera)).set('Idempotency-Key', idemKey()).send({ entryIds: [line2.id], partnerInvoiceNo: 'MIC/26-27/002' }).expect(201)).body;
    await api(app).post(`/v1/finance/payouts/${p2.id}/reject`).set(auth(t.finance)).send({ reason: 'Invoice missing PAN' }).expect(200);
    expect((await line(m2.id)).status).toBe('approved');
    const p3 = (await api(app).post('/v1/payouts').set(auth(t.meera)).set('Idempotency-Key', idemKey()).send({ entryIds: [line2.id], partnerInvoiceNo: 'MIC/26-27/003' }).expect(201)).body;
    await api(app).post(`/v1/finance/payouts/${p3.id}/approve`).set(auth(t.finance)).expect(200);
    await api(app).post(`/v1/finance/payouts/${p3.id}/settle`).set(auth(t.finance)).set('Idempotency-Key', idemKey()).send({ bankReference: 'HDFCN26310000001' }).expect(409); // bank reference reused
    await api(app).post(`/v1/finance/payouts/${p3.id}/settle`).set(auth(t.finance)).set('Idempotency-Key', idemKey()).send({ bankReference: 'HDFCN26310000009' }).expect(200); // below threshold: approver may settle
    expect((await line(m2.id)).status).toBe('settled');
    // Paid lines cannot be re-priced through a dispute
    const d2 = (await api(app).post('/v1/finance/disputes').set(auth(t.meera)).send({ kind: 'commission', entryId: line2.id, reason: 'TDS deducted at a higher rate than agreed.' }).expect(201)).body;
    await api(app).post(`/v1/finance/disputes/${d2.id}/rule`).set(auth(t.finance)).set('Idempotency-Key', idemKey()).send({ outcome: 'adjusted', resolution: 'Trying to re-price a paid line', adjustedAmount: 60_000_00 }).expect(409);
    await api(app).post(`/v1/finance/disputes/${d2.id}/messages`).set(auth(t.finance)).send({ body: 'TDS at 5% under 194H is correct for your PAN.' }).expect(201);
    await api(app).post(`/v1/finance/disputes/${d2.id}/rule`).set(auth(t.finance)).set('Idempotency-Key', idemKey()).send({ outcome: 'rejected', resolution: 'TDS rate is correct under section 194H.' }).expect(200);
    expect((await line(m2.id)).status).toBe('settled');
    // 104 payment dispute
    const pd = (await api(app).post('/v1/finance/disputes').set(auth(t.meera)).send({ kind: 'payment', payoutId: payout1.id, reason: 'Amount credited is ₹500 short of the payout advice.' }).expect(201)).body;
    const list = await api(app).get('/v1/finance/disputes').set(auth(t.meera)).expect(200);
    expect(list.body.disputes.map((x: any) => x.id)).toEqual(expect.arrayContaining([d.id, d2.id, pd.id]));
    expect(list.body.canRule).toBe(false);
    expect((await api(app).get('/v1/finance/disputes').set(auth(t.ravi)).expect(200)).body.disputes).toEqual([]);
  });

  it('102/103 finance introductions stay disabled until regulatory review (B-09)', async () => {
    const r = await api(app).get('/v1/finance/opportunities').set(auth(t.meera)).expect(403);
    expect(r.body.featureDisabled).toBe(true);
    await api(app).post('/v1/finance/enquiries').set(auth(t.meera)).send({ purpose: 'Working capital for a rooftop EPC order', amount: 10_00_000_00, consentToShare: true }).expect(403);
    const f = await api(app).get('/v1/meta/features').expect(200);
    expect(f.body.financeIntroductions).toBe(false);
  });
});
