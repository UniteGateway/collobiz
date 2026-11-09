import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

/**
 * Direct offers end to end: selection drafts the agreement in Contracts and (for commission rewards) a commission
 * agreement; the selected partner registers buyers; Unite moves sales on; a won sale projects commission; the customer
 * payment — only after the agreement is signed — makes it earned; finance approval and payout then work as for projects.
 */
describe('Direct offers — agreements, sales and commission', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  let n = 0;
  const idem = () => ({ 'Idempotency-Key': `os-${++n}-${Date.now()}` });
  let offerId = '';
  let contract: { id: string; code: string } = { id: '', code: '' };
  const sale = (over: Record<string, unknown> = {}) => ({ buyerName: 'Apex Castings Pvt Ltd', buyerCity: 'Kolhapur', contactName: 'R. Jadhav', description: '500 kW rooftop on the foundry sheds', estimatedValue: 2_10_00_000_00, consentMethod: 'meeting_minutes', consent: true, ...over });

  beforeAll(async () => {
    await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const volt = (await one("select id from organizations where display_name = 'Volt EPC'")).id;
    const o = await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send({
      title: 'Sell rooftop packages in Maharashtra', summary: 'Introduce factory customers; Unite Solar prices, contracts and delivers. Commission on paid sales.', kind: 'sell_products', sector: 'solar', regions: ['IN-MH'],
      target: { mode: 'selected', organizationIds: [volt] }, pricing: 'unite_price', unitePrice: 42_000_00, priceUnit: 'per kW', uniteReward: { model: 'commission', bps: 300 }, rewardModels: ['commission'], maxSelections: 5,
      deadline: new Date(Date.now() + 7 * 86400_000).toISOString(),
    }).expect(201);
    offerId = o.body.id;
  });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('only a selected partner registers sales; selection drafts the agreement and a commission agreement', async () => {
    const r = await api(app).post(`/v1/offers/${offerId}/respond`).set(auth(t.asha)).set(idem()).send({ mode: 'accept_terms', message: 'Accepted — our Pune team covers the Chakan and Kolhapur industrial belts.' }).expect(200);
    await api(app).post(`/v1/offers/${offerId}/sales`).set(auth(t.asha)).set(idem()).send(sale()).expect(403); // not selected yet
    const sel = await api(app).post(`/v1/admin/offers/${offerId}/responses/${r.body.id}/select`).set(auth(t.uniteAdmin)).send({ note: 'Strong Maharashtra network' }).expect(200);
    expect(sel.body.contract.code).toMatch(/^CTR-\d{4}-\d{6}$/);
    expect(sel.body.contract.status).toBe('draft');
    expect(sel.body.commissionAgreement.code).toMatch(/^CA-\d{4}-\d{6}$/);
    contract = sel.body.contract;
    const c = await one('select c.kind, c.offer_id, v.body from contracts c join contract_versions v on v.contract_id = c.id where c.id = $1', [contract.id]);
    expect(c.offer_id).toBe(offerId);
    expect(c.body).toMatch(/Commission on sales · 3%/);
    expect(c.body).toMatch(/only when the customer has paid/);
    const a = await one('select terms, project_id from commission_agreements where id = $1', [sel.body.commissionAgreement.id]);
    expect(a.project_id).toBeNull();
    expect(a.terms.policy).toMatchObject({ basis: 'percent', rateBps: 300, tdsBps: 500 }); // TDS from the active introducer policy
    // partner sees the papers
    const mine = await api(app).get(`/v1/offers/${offerId}`).set(auth(t.asha)).expect(200);
    expect(mine.body.papers.contract.code).toBe(contract.code);
    // it appears with the partner's other agreements (no project needed)
    const ags = await api(app).get('/v1/commissions/agreements').set(auth(t.asha)).expect(200);
    expect(ags.body.find((x: any) => x.id === sel.body.commissionAgreement.id)).toMatchObject({ source: 'offer', project: expect.stringMatching(/Sell rooftop packages/) });
  });

  it('sales need buyer consent; the same buyer cannot be registered twice under an offer', async () => {
    await api(app).post(`/v1/offers/${offerId}/sales`).set(auth(t.asha)).set(idem()).send(sale({ consent: false })).expect(400);
    const s1 = await api(app).post(`/v1/offers/${offerId}/sales`).set(auth(t.asha)).set(idem()).send(sale()).expect(201);
    expect(s1.body.code).toMatch(/^OS-\d{4}-\d{6}$/);
    const dup = await api(app).post(`/v1/offers/${offerId}/sales`).set(auth(t.asha)).set(idem()).send(sale({ buyerName: 'APEX CASTINGS PRIVATE LIMITED', buyerCity: 'kolhapur' })).expect(409);
    expect(dup.body.message).toBe('This buyer is already registered under this offer');
    await api(app).get(`/v1/offers/${offerId}/sales`).set(auth(t.ravi)).expect(404); // not a recipient
  });

  it('won → projected commission; paid is refused until the agreement is signed; then commission is earned and finance can approve it', async () => {
    const s = (await api(app).get(`/v1/offers/${offerId}/sales`).set(auth(t.asha)).expect(200)).body[0];
    await api(app).post(`/v1/admin/offers/${offerId}/sales/${s.id}/status`).set(auth(t.asha)).send({ status: 'quoted' }).expect(403); // partners don't move sales
    await api(app).post(`/v1/admin/offers/${offerId}/sales/${s.id}/paid`).set(auth(t.uniteAdmin)).send({ paymentReference: 'UTR123456' }).expect(409); // not won yet
    await api(app).post(`/v1/admin/offers/${offerId}/sales/${s.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'quoted', note: 'Quote Q-114 sent' }).expect(200);
    await api(app).post(`/v1/admin/offers/${offerId}/sales/${s.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'won' }).expect(400); // needs a value
    const won = await api(app).post(`/v1/admin/offers/${offerId}/sales/${s.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'won', saleValue: 2_00_00_000_00 }).expect(200);
    expect(won.body.commission.status).toBe('estimated');
    const line = await one('select gross, gst, tds, payable, status from commission_entries where offer_sale_id = $1', [s.id]);
    expect(Number(line.gross)).toBe(6_00_000_00); // 3% of ₹2 crore
    expect(Number(line.tds)).toBe(30_000_00); // 5% TDS
    expect(Number(line.gst)).toBe(1_08_000_00); // Volt EPC is GST-registered: 18% on the commission
    expect(Number(line.payable)).toBe(6_78_000_00); // 6,00,000 + 1,08,000 GST − 30,000 TDS
    const blocked = await api(app).post(`/v1/admin/offers/${offerId}/sales/${s.id}/paid`).set(auth(t.uniteAdmin)).send({ paymentReference: 'UTR123456' }).expect(409);
    expect(blocked.body.message).toMatch(new RegExp(`${contract.code} must be signed by both sides`));
    // Execute the agreement through the normal contract flow
    await api(app).post(`/v1/contracts/${contract.id}/submit`).set(auth(t.uniteAdmin)).expect(200);
    const ap = (await api(app).post(`/v1/contracts/${contract.id}/review`).set(auth(t.evaluator)).send({ decision: 'approve' }).expect(200)).body;
    const hash = ap.versions[ap.versions.length - 1].bodyHash;
    await api(app).post(`/v1/contracts/${contract.id}/sign`).set(auth(t.asha)).set(idem()).send({ typedName: 'Asha Patil', consent: true, bodyHash: hash }).expect(200);
    const ex = (await api(app).post(`/v1/contracts/${contract.id}/sign`).set(auth(t.uniteAdmin)).set(idem()).send({ typedName: 'Sanjay Kulkarni', consent: true, bodyHash: hash }).expect(200)).body;
    expect(ex.status).toBe('executed');
    const paid = await api(app).post(`/v1/admin/offers/${offerId}/sales/${s.id}/paid`).set(auth(t.uniteAdmin)).send({ paymentReference: 'UTR123456', invoiceNumber: 'US/26-27/0412' }).expect(200);
    expect(paid.body.commission.status).toBe('earned');
    const journal = await pool.query("select action from commission_journal j join commission_entries e on e.id = j.entry_id where e.offer_sale_id = $1 order by j.created_at", [s.id]);
    expect(journal.rows.map((r) => r.action)).toEqual(['entry.estimated', 'entry.eligible', 'entry.earned']);
    // the partner's earnings show it under the offer; finance sees it in the approval queue
    const earn = await api(app).get('/v1/earnings').set(auth(t.asha)).expect(200);
    expect(earn.body.lines.find((l: any) => l.description.startsWith('Sale '))).toMatchObject({ status: 'earned', project: expect.stringMatching(/^DO-\d{4}-\d{6}: Sell rooftop packages/) });
    const q = await api(app).get('/v1/finance/approvals').set(auth(t.finance)).expect(200);
    expect(q.body.entries.some((e: any) => e.id === paid.body.commission.id)).toBe(true);
    // a paid sale cannot be moved again
    await api(app).post(`/v1/admin/offers/${offerId}/sales/${s.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'lost', lostReason: 'Changed mind' }).expect(409);
  });

  it('Unite sees results per partner; a lost sale frees the buyer; withdrawing is only for early sales', async () => {
    const s2 = (await api(app).post(`/v1/offers/${offerId}/sales`).set(auth(t.asha)).set(idem()).send(sale({ buyerName: 'Western Auto Components', buyerCity: 'Pune' })).expect(201)).body;
    await api(app).post(`/v1/admin/offers/${offerId}/sales/${s2.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'lost', lostReason: 'Chose a cheaper supplier' }).expect(200);
    await api(app).post(`/v1/offers/${offerId}/sales`).set(auth(t.asha)).set(idem()).send(sale({ buyerName: 'Western Auto Components', buyerCity: 'Pune' })).expect(201); // can be registered again
    const det = await api(app).get(`/v1/admin/offers/${offerId}`).set(auth(t.uniteAdmin)).expect(200);
    expect(det.body.results).toEqual([expect.objectContaining({ partner: 'Volt EPC', leads: 3, open: 1, won: 1, paid: 1, lost: 1, wonValue: 2_00_00_000_00, commission: 6_78_000_00 })]);
    expect(det.body.papers[0]).toMatchObject({ partner: 'Volt EPC', contract: expect.objectContaining({ status: 'executed' }) });
    const list = await api(app).get('/v1/admin/offers').set(auth(t.uniteAdmin)).expect(200);
    expect(list.body.find((o: any) => o.id === offerId)).toMatchObject({ leads: 3, wonValue: 2_00_00_000_00 });
    const s3 = (await api(app).get(`/v1/offers/${offerId}/sales`).set(auth(t.asha)).expect(200)).body.find((x: any) => x.status === 'registered');
    await api(app).post(`/v1/offers/${offerId}/sales/${s3.id}/withdraw`).set(auth(t.asha)).expect(200);
    const paidSale = (await api(app).get(`/v1/offers/${offerId}/sales`).set(auth(t.asha)).expect(200)).body.find((x: any) => x.status === 'paid');
    await api(app).post(`/v1/offers/${offerId}/sales/${paidSale.id}/withdraw`).set(auth(t.asha)).expect(409);
  });

  it('fixed-fee and profit-share selections get a drafted agreement but no commission agreement', async () => {
    const deccan = (await one("select id from organizations where display_name = 'Deccan Distributors'")).id;
    const o = (await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send({
      title: 'Run an O&M desk in Karnataka', summary: 'Local office and trained technicians for preventive maintenance across our plants in Karnataka.', kind: 'local_presence', sector: 'solar', regions: ['IN-KA'],
      target: { mode: 'selected', organizationIds: [deccan] }, pricing: 'partner_quote', rewardModels: ['fixed_fee', 'profit_share'], deadline: new Date(Date.now() + 7 * 86400_000).toISOString(),
    }).expect(201)).body;
    const r = await api(app).post(`/v1/offers/${o.id}/respond`).set(auth(t.deepak)).set(idem()).send({ mode: 'proposal', price: 5_00_000_00, priceUnit: 'per month', reward: { model: 'profit_share', bps: 1500 }, message: 'Hosur team; we propose a lower fee plus a share of savings.' }).expect(200);
    const sel = await api(app).post(`/v1/admin/offers/${o.id}/responses/${r.body.id}/select`).set(auth(t.uniteAdmin)).send({ note: 'Good local coverage' }).expect(200);
    expect(sel.body.contract.code).toMatch(/^CTR-/);
    expect(sel.body.commissionAgreement).toBeNull();
    const c = await one('select v.body from contract_versions v where v.contract_id = $1', [sel.body.contract.id]);
    expect(c.body).toMatch(/Profit share · 15%/);
    expect(c.body).toMatch(/must be set out in an annex before signature/);
  });
});
