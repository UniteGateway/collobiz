/**
 * COLLABIZ POWERTRADE — the three first journeys (steel manufacturer, transformer manufacturer, retail store partner) and the
 * controls: eligibility, provenance, separate legs, documents, tax review, attributable approvals, verified and collected
 * benefits only, approved allocations, permissions and ACTION OS priorities.
 */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

const L = 1e5 * 100; // ₹1 lakh in paise
describe('COLLABIZ POWERTRADE', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const get = (p: string, tok: string) => api(app).get(`/v1${p}`).set(auth(tok));
  const post = (p: string, b: object, tok: string) => api(app).post(`/v1${p}`).set(auth(tok)).send(b);
  const put = (p: string, b: object, tok: string) => api(app).put(`/v1${p}`).set(auth(tok)).send(b);
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];

  it('steel manufacturer joins: profile, electricity profile and products; only owners and admins can change them', async () => {
    expect((await get('/powertrade/dashboard', t.vikram).expect(200)).body).toEqual({ joined: false });
    await post('/powertrade/energy-needs', { monthlyUnits: 1 }, t.vikram).expect(400);
    await put('/powertrade/profile', { industry: 'Steel', state: 'Maharashtra', interests: ['buy_power', 'supply_unite', 'find_customers'] }, t.vikram).expect(200);
    await put('/powertrade/profile', { industry: 'EPC', state: 'Maharashtra', interests: ['buy_power'] }, t.rohit).expect(403); // org member, not admin
    const n = (await post('/powertrade/energy-needs', { monthlyUnits: 1_500_000, tariffPaisePerKwh: 850, contractDemandKva: 3000, voltageKv: 33, consumerCategory: 'ht_industrial', preferredSources: ['solar', 'solar_wind'], ppaYears: 15 }, t.vikram).expect(201)).body;
    expect(n.presentMonthlyBillPaise).toBe(1_500_000 * 850);
    await post('/powertrade/business-contributions', { kind: 'product', title: 'Solar module mounting structures', keywords: ['steel', 'mounting', 'structure'], capacity: '400 t/month', locations: 'Pune, Nashik' }, t.vikram).expect(201);
    const d = (await get('/powertrade/dashboard', t.vikram).expect(200)).body;
    expect(d).toMatchObject({ joined: true, profile: { industry: 'Steel' }, energy: { monthlyUnits: 1_500_000 } });
    expect(d.contributions).toHaveLength(1);
  });

  it('compares power options with eligibility, provenance and ranking — captive status is never assumed', async () => {
    const base = { arrangements: ['rooftop_resco', 'third_party', 'group_captive', 'captive'], ppaPaisePerKwh: 400, capacityMw: 8, sourceState: 'MH', cufPct: 22, objective: 'max_savings' };
    const r = (await post('/powertrade/power-scenarios/compare', base, t.vikram).expect(200)).body;
    const row = (a: string) => r.rows.find((x: { arrangement: string }) => x.arrangement === a);
    expect(row('third_party').eligible).toBe(true);
    expect(row('third_party').charges.length).toBeGreaterThan(3);
    expect(row('third_party').charges.every((c: { provenance: string }) => c.provenance === 'illustrative')).toBe(true);
    expect(row('third_party').landedPaisePerKwh).toBeGreaterThan(400); // network charges and losses on top of the PPA rate
    expect(row('group_captive').eligible).toBe(false); // ownership not given → unresolved
    expect(r.ranked).not.toContain('group_captive');
    expect(r.illustrative).toBe(true);
    expect(r.note).toMatch(/not executable|No offer is executable/);
    const withEquity = (await post('/powertrade/power-scenarios/compare', { ...base, ownershipPct: 30 }, t.vikram).expect(200)).body;
    expect(withEquity.rows.find((x: { arrangement: string }) => x.arrangement === 'group_captive').eligible).toBe(true);
    // A small shop is below the open-access threshold
    await put('/powertrade/profile', { industry: 'Retail electronics store', state: 'Telangana', interests: ['buy_power', 'distributor', 'find_customers'] }, t.ravi).expect(200);
    await post('/powertrade/energy-needs', { monthlyUnits: 20_000, tariffPaisePerKwh: 900, contractDemandKva: 60, voltageKv: 0.44, consumerCategory: 'lt_commercial', preferredSources: ['solar'], rooftopKwp: 40 }, t.ravi).expect(201);
    const small = (await post('/powertrade/power-scenarios/compare', { ...base, arrangements: ['rooftop_resco', 'third_party'], capacityMw: 0.04, sourceState: 'TS' }, t.ravi).expect(200)).body;
    expect(small.rows.find((x: { arrangement: string }) => x.arrangement === 'third_party').eligible).toBe(false);
    expect(small.ranked).toEqual(['rooftop_resco']);
  });

  it('matches energy and business opportunities from live records, with reasons; reverse matching reads plain words', async () => {
    const asha = await one("select u.id, m.organization_id org from users u join memberships m on m.user_id = u.id where u.email = 'asha@voltepc.example' limit 1");
    await pool.query(`insert into trade_requirements (code, buyer_org_id, title, sector, description, items, delivery_location, region, closes_at, created_by) values
      ('RFQ-PT-1', $1, 'Module mounting structures for 12 MW ground-mount plant', 'solar', 'Hot-dip galvanised steel structures', '[{"item":"Mounting structure","quantity":12,"unit":"MW"}]', 'Solapur', 'Maharashtra', now() + interval '20 days', $2)`, [asha.org, asha.id]);
    await pool.query(`insert into energy_listings (code, side, category, org_id, title, state, district, source, capacity_mw, available_mw, tariff_rs_kwh, models, description, status, created_by) values
      ('GP-PT-1', 'plant', 'solar', $1, '25 MW solar park — open access', 'Maharashtra', 'Solapur', 'solar', 25, 10, 3.9, '{third_party,group_captive}', 'Grid-connected solar park', 'live', $2)`, [asha.org, asha.id]);
    const m = (await get('/powertrade/matches/recommended', t.vikram).expect(200)).body;
    const titles = m.items.map((x: { title: string }) => x.title);
    expect(titles).toEqual(expect.arrayContaining(['25 MW solar park — open access', 'Rooftop solar (EPC or RESCO)', 'Module mounting structures for 12 MW ground-mount plant']));
    const rfq = m.items.find((x: { title: string }) => x.title.startsWith('Module mounting'));
    expect(rfq.reasons[0]).toMatch(/steel|mounting|structure/);
    expect(JSON.stringify(m)).not.toMatch(/\d+% (match|fit)/); // no percentages as proof
    const rev = (await post('/powertrade/matches/reverse', { text: 'I have a steel factory consuming 15 lakh units per month. I manufacture structural steel and want cheaper electricity plus more customers.' }, t.vikram).expect(200)).body;
    expect(rev.parsed).toMatchObject({ monthlyUnits: 1_500_000, industry: 'steel' });
    expect(rev.suggestedModels).toEqual(expect.arrayContaining(['discounted_ppa', 'solar_integration', 'product_for_power']));
    expect(rev.items.length).toBeGreaterThan(1);
  });

  let cid: string;
  it('transformer manufacturer: Product-for-Power keeps supply and power separate, needs documents and tax review, and every move is attributed', async () => {
    await put('/powertrade/profile', { industry: 'Transformer manufacturer', state: 'Telangana', interests: ['supply_unite', 'buy_power'] }, t.deepak).expect(200);
    const volt = (await one("select organization_id id from memberships m join users u on u.id = m.user_id where u.email = 'asha@voltepc.example' limit 1")).id;
    const p = { model: 'product_for_power', title: '2 × 5 MVA transformers with a separate solar PPA', summary: 'Supply ₹1 Cr of transformers under a supply agreement; separately agreed ₹10 L rebate; renewable power under its own PPA.', counterpartyOrgId: volt };
    await post('/powertrade/collaborations', p, t.deepak).expect(400); // needs both values
    await post('/powertrade/collaborations', { ...p, supplyValuePaise: 100 * L, benefitValuePaise: 120 * L }, t.deepak).expect(400); // benefit > supply
    const c = (await post('/powertrade/collaborations', { ...p, supplyValuePaise: 100 * L, benefitValuePaise: 10 * L, powerTariffPaisePerKwh: 420, powerUnitsPerMonth: 200_000 }, t.deepak).expect(201)).body;
    cid = c.id;
    expect(c.required.map((d: { docType: string }) => d.docType)).toEqual(expect.arrayContaining(['supply_agreement', 'ppa', 'benefit_agreement', 'tax_review']));
    await post(`/powertrade/collaborations/${cid}/transition`, { to: 'contracted' }, t.deepak).expect(409); // not an allowed move
    await post(`/powertrade/collaborations/${cid}/transition`, { to: 'submitted' }, t.deepak).expect(200);
    await post(`/powertrade/collaborations/${cid}/transition`, { to: 'under_review' }, t.asha).expect(200); // counterparty
    await get(`/powertrade/collaborations/${cid}`, t.meera).expect(404); // not a party
    await post(`/powertrade/collaborations/${cid}/transition`, { to: 'approved' }, t.deepak).expect(403);
    const missing = (await post(`/powertrade/collaborations/${cid}/transition`, { to: 'approved' }, t.uniteAdmin).expect(409)).body;
    expect(missing.missing.length).toBeGreaterThan(0);
    await post(`/powertrade/collaborations/${cid}/documents`, { docType: 'supply_agreement', status: 'provided' }, t.deepak).expect(400); // reference needed
    await post(`/powertrade/collaborations/${cid}/documents`, { docType: 'supply_agreement', status: 'accepted' }, t.deepak).expect(403);
    for (const d of ['supply_agreement', 'purchase_order', 'ppa', 'benefit_agreement', 'tax_review']) {
      await post(`/powertrade/collaborations/${cid}/documents`, { docType: d, status: 'provided', reference: `VAULT-${d}` }, t.deepak).expect(200);
      await post(`/powertrade/collaborations/${cid}/documents`, { docType: d, status: 'accepted' }, t.uniteAdmin).expect(200);
    }
    expect((await post(`/powertrade/collaborations/${cid}/transition`, { to: 'approved' }, t.uniteAdmin).expect(409)).body.message).toMatch(/Tax review/);
    await post(`/powertrade/collaborations/${cid}/tax-review`, { result: 'cleared', note: 'Separate supplies; GST on transformer invoice and on the rebate credit note.' }, t.deepak).expect(403);
    await post(`/powertrade/collaborations/${cid}/tax-review`, { result: 'cleared', note: 'Separate supplies; GST on transformer invoice and on the rebate credit note.' }, t.finance).expect(200);
    await post(`/powertrade/collaborations/${cid}/transition`, { to: 'approved', note: 'Technical, regulatory and tax checks done' }, t.uniteAdmin).expect(200);
    await post(`/powertrade/collaborations/${cid}/transition`, { to: 'contracted' }, t.deepak).expect(200);
    await post(`/powertrade/collaborations/${cid}/transition`, { to: 'in_progress' }, t.deepak).expect(200);
    await post(`/powertrade/collaborations/${cid}/transition`, { to: 'completed' }, t.deepak).expect(409); // invoice, settlement and reconciliation not accepted yet
    const v = (await get(`/powertrade/collaborations/${cid}`, t.asha).expect(200)).body;
    expect(v.history.map((h: { to: string }) => h.to)).toEqual(['draft', 'submitted', 'under_review', 'under_review', 'approved', 'contracted', 'in_progress']);
    const approver = (await one("select full_name from users where email = 'unite.admin@collabiz.local'")).full_name;
    expect(v.history.find((h: { to: string }) => h.to === 'approved')).toMatchObject({ byName: approver, note: 'Technical, regulatory and tax checks done' });
    expect(v.supplyValuePaise).toBe(100 * L); expect(v.benefitValuePaise).toBe(10 * L); expect(v.powerTariffPaisePerKwh).toBe(420); // separate legs kept
  });

  it('retail store partner: only verified, collected benefits can support the power expense, and only with approval', async () => {
    const b = (await post('/powertrade/benefits', { source: 'commission', description: 'Unite Solar product sales commission — October', grossPaise: 3 * L, taxesPaise: 0.54 * L }, t.ravi).expect(201)).body;
    const ant = (await post('/powertrade/benefits', { source: 'referral', description: 'Expected referral on an industrial lead', grossPaise: 2 * L, status: 'anticipated' }, t.ravi).expect(201)).body;
    await post('/powertrade/allocations', { benefitId: b.id, period: '2026-11', amountPaise: 1 * L }, t.ravi).expect(409); // not collected
    await post(`/powertrade/benefits/${b.id}/verify`, {}, t.ravi).expect(403);
    await post(`/powertrade/benefits/${ant.id}/verify`, {}, t.finance).expect(409); // anticipated is not earned
    await post(`/powertrade/benefits/${b.id}/collect`, { collectedPaise: 1 * L, reference: 'NEFT-001' }, t.finance).expect(409); // verify first
    await post(`/powertrade/benefits/${b.id}/verify`, {}, t.finance).expect(200);
    await post(`/powertrade/benefits/${b.id}/collect`, { collectedPaise: 3 * L, reference: 'NEFT-001' }, t.finance).expect(400); // more than net (₹2.46 L)
    await post(`/powertrade/benefits/${b.id}/collect`, { collectedPaise: 1 * L, reference: 'NEFT-001' }, t.finance).expect(200); // partial
    await post('/powertrade/allocations', { benefitId: b.id, period: '2026-11', amountPaise: 1.5 * L }, t.ravi).expect(400); // only ₹1 L collected
    const a = (await post('/powertrade/allocations', { benefitId: b.id, period: '2026-11', amountPaise: 1 * L }, t.ravi).expect(201)).body;
    await post('/powertrade/allocations', { benefitId: b.id, period: '2026-11', amountPaise: 1 }, t.ravi).expect(400); // nothing left
    await post(`/powertrade/allocations/${a.id}/decide`, { decision: 'approve' }, t.ravi).expect(403);
    await post(`/powertrade/allocations/${a.id}/decide`, { decision: 'approve' }, t.finance).expect(200);
    const s = (await post('/powertrade/savings', { period: '2026-11', baselinePaise: 1.8 * L, actualPaise: 1.3 * L, evidence: 'DISCOM bill Nov 2026 vs Nov 2025' }, t.ravi).expect(201)).body;
    await post(`/powertrade/savings/${s.id}/verify`, {}, t.finance).expect(200);
    const f = (await get('/powertrade/finance/summary?period=2026-11', t.ravi).expect(200)).body;
    expect(f.savings.verified).toBe(0.5 * L);
    expect(f.benefits).toMatchObject({ anticipated: 2 * L, collected: 1 * L });
    expect(f.powerExpense).toMatchObject({ expensePaise: 1.3 * L, approvedSupportPaise: 1 * L, netEconomicExpensePaise: 0.3 * L, basis: 'Bill recorded for the month' });
    expect(f.sales.note).toMatch(/not profit/);
  });

  it('admins see review queues (sample records excluded); members get POWERTRADE priorities in ACTION OS', async () => {
    await get('/admin/powertrade/overview', t.ravi).expect(403);
    const o = (await get('/admin/powertrade/overview', t.uniteAdmin).expect(200)).body;
    expect(o.counts.profiles).toBe(3);
    const ac = (await get('/action-os/dashboard', t.asha).expect(200)).body;
    expect(ac.sources.find((s: { key: string }) => s.key === 'powertrade')).toMatchObject({ ok: true });
    expect(JSON.stringify(ac.items)).toContain(cid);
  });
});
