/**
 * Unite Solar Franchise Network end to end — acceptance criteria 1–15:
 * package prices and totals (1–7), marketing for every partner (8), demo materials (9), the 10% product cap (10), LeadDNA
 * gating (11), inventory/order reconciliation (12), territory conflicts (13), and the full lifecycle (15). Regressions (14)
 * are covered by the rest of the suite.
 */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { idemKey } from './flows';

const L = 100_000_00;
describe('Unite Solar Franchise Network', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const post = (p: string, tok: string, b: object = {}) => api(app).post(`/v1${p}`).set(auth(tok)).set('Idempotency-Key', idemKey('net')).send(b);
  const get = (p: string, tok: string) => api(app).get(`/v1${p}`).set(auth(tok));
  const today = () => new Date().toISOString().slice(0, 10);
  const territory = async (name: string) => (await one('select id from franchise_territories where name = $1', [name])).id as string;
  const product = async (sku: string) => one('select * from solar_products where sku = $1', [sku]);

  /** Agreement drafted by Unite, reviewed by a second admin, signed by both parties. */
  async function sign(unitId: string, partnerTok: string, name: string) {
    const a = (await post(`/admin/franchise/${unitId}/agreement`, t.uniteAdmin, { termYears: 3, territory: 'As allocated in COLLABIZ', exclusive: true, startDate: today(), noticeDays: 90 }).expect(201)).body;
    await post(`/contracts/${a.contractId}/submit`, t.uniteAdmin).expect(200);
    const ap = (await post(`/contracts/${a.contractId}/review`, t.evaluator, { decision: 'approve' }).expect(200)).body;
    const hash = ap.versions[ap.versions.length - 1].bodyHash;
    await post(`/contracts/${a.contractId}/sign`, partnerTok, { typedName: name, consent: true, bodyHash: hash }).expect(200);
    await post(`/contracts/${a.contractId}/sign`, t.uniteAdmin, { typedName: 'Sanjay Kulkarni', consent: true, bodyHash: hash }).expect(200);
  }
  async function pay(unitId: string, partnerTok: string) {
    const d = (await get(`/network/units/${unitId}/dashboard`, partnerTok).expect(200)).body;
    await post(`/network/units/${unitId}/payment`, partnerTok, { reference: `UTR${unitId.slice(0, 8)}`, amount: d.unit.pricing.total, method: 'bank_transfer' }).expect(200);
    await post(`/admin/network/units/${unitId}/payment`, t.finance, { decision: 'verify' }).expect(200);
  }
  async function applyAndApprove(tok: string, b: object) {
    const u = (await post('/network/applications', tok, b).expect(201)).body;
    await post(`/network/applications/${u.id}/submit`, tok).expect(200);
    await post(`/admin/network/applications/${u.id}/decision`, t.uniteAdmin, { decision: 'approve' }).expect(200);
    return u.id as string;
  }

  it('1–7: packages, prices and totals come from the server', async () => {
    const pk = (await get('/network/packages', t.asha).expect(200)).body as { code: string; price: number; leadDnaIncluded: boolean; stockAllocation: number; storePackage: number; pricing: { subtotal: number; gst: number; total: number }; pricingWithLeadDna: { subtotal: number } | null; maxProductCommissionBps: number }[];
    const by = (c: string) => pk.find((p) => p.code === c)!;
    expect(by('basic_franchise').pricing.subtotal).toBe(2 * L);
    expect(by('basic_franchise').pricingWithLeadDna!.subtotal).toBe(7 * L);
    expect(by('master_franchise').pricing.subtotal).toBe(5 * L);
    expect(by('master_franchise').pricingWithLeadDna!.subtotal).toBe(10 * L);
    expect(by('district_franchise').pricing.subtotal).toBe(10 * L);
    expect(by('district_franchise').leadDnaIncluded).toBe(true);
    expect(by('district_franchise').pricingWithLeadDna!.subtotal).toBe(10 * L); // included, never charged twice
    expect(by('store_with_stock')).toMatchObject({ price: 5 * L, stockAllocation: 4 * L, storePackage: 1 * L });
    expect(by('store_without_stock').pricing.subtotal).toBe(1.5 * L);
    expect(by('store_without_stock').pricingWithLeadDna).toBeNull();
    expect(by('basic_franchise').pricing.total).toBe(2 * L + 0.18 * 2 * L); // GST extra (finance can switch to inclusive)
    expect(pk.every((p) => p.maxProductCommissionBps <= 1000)).toBe(true);
    // Administrators edit packages as new versions; invalid edits are refused.
    await post('/admin/network/packages/basic_franchise', t.asha, { price: 3 * L }).expect(403);
    await post('/admin/network/packages/basic_franchise', t.uniteAdmin, { maxProductCommissionBps: 1200 }).expect(400);
    await post('/admin/network/packages/store_with_stock', t.uniteAdmin, { stockAllocation: 3 * L }).expect(400); // 3 + 1 ≠ 5
    const v2 = (await post('/admin/network/packages/basic_franchise', t.uniteAdmin, { benefits: ['Franchise rights', 'Business support', 'Quarterly review'] }).expect(200)).body;
    expect(v2.version).toBe(2);
    // A store package does not offer LeadDNA.
    await post('/network/applications', t.meera, { packageCode: 'store_without_stock', leadDnaAddon: true, state: 'Karnataka', district: 'Dharwad', city: 'Hubballi', pincode: '580020', message: 'Electrical shop near the bus stand.' }).expect(400);
  });

  let ashaUnit: string, raviApp: string;
  it('13: application, review and territory conflicts (no two exclusive grants overlap)', async () => {
    const ghatkesar = await territory('Ghatkesar mandal');
    const app1 = { packageCode: 'basic_franchise', leadDnaAddon: true, territoryId: ghatkesar, state: 'Telangana', district: 'Medchal-Malkajgiri', city: 'Ghatkesar', pincode: '501301', message: 'EPC contractor expanding to residential rooftop solar.' };
    // Wrong level is refused (a city territory for a mandal-level package).
    await post('/network/applications', t.asha, { ...app1, territoryId: await territory('Warangal city') }).expect(400);
    const a = (await post('/network/applications', t.asha, app1).expect(201)).body;
    expect(a.status).toBe('draft');
    expect(a.pricing).toMatchObject({ subtotal: 7 * L, packageVersion: 2 });
    ashaUnit = a.id;
    // Drafts are editable; the price is always recomputed on the server.
    const ed = (await post(`/network/applications/${a.id}`, t.asha, { ...app1, message: 'EPC contractor (Volt EPC) expanding to residential rooftop solar.' }).expect(200)).body;
    expect(ed.pricing.total).toBe(7 * L * 1.18);
    const r = (await post('/network/applications', t.ravi, { ...app1, city: 'Ghatkesar town', leadDnaAddon: false }).expect(201)).body;
    raviApp = r.id;
    await post(`/network/applications/${a.id}/submit`, t.asha).expect(200);
    await post(`/network/applications/${r.id}/submit`, t.ravi).expect(200);
    await post(`/admin/network/applications/${a.id}/decision`, t.asha, { decision: 'approve' }).expect(403);
    await post(`/admin/network/applications/${a.id}/decision`, t.uniteAdmin, { decision: 'approve' }).expect(200);
    expect((await one('select status, unit_id from franchise_territories where id = $1', [ghatkesar]))).toMatchObject({ status: 'reserved', unit_id: a.id });
    await post(`/admin/network/applications/${r.id}/decision`, t.uniteAdmin, { decision: 'approve' }).expect(409);
    // A district territory drawn over a reserved mandal in the same district is refused.
    await post('/admin/network/territories', t.uniteAdmin, { level: 'district', name: 'Medchal-Malkajgiri district', state: 'Telangana', district: 'Medchal-Malkajgiri', pincodes: [], exclusive: true }).expect(409);
    // Returned for changes → the applicant picks another territory and package, and resubmits.
    await post(`/admin/network/applications/${r.id}/decision`, t.uniteAdmin, { decision: 'return' }).expect(400); // a reason is required
    await post(`/admin/network/applications/${r.id}/decision`, t.uniteAdmin, { decision: 'return', note: 'Ghatkesar is taken; Nalgonda district is open.' }).expect(200);
    await post(`/network/applications/${r.id}`, t.ravi, { packageCode: 'district_franchise', leadDnaAddon: false, territoryId: await territory('Nalgonda district'), state: 'Telangana', district: 'Nalgonda', city: 'Nalgonda', pincode: '508001', message: 'Distributor taking district rights for Nalgonda.' }).expect(200);
    await post(`/network/applications/${r.id}/submit`, t.ravi).expect(200);
    await post(`/admin/network/applications/${r.id}/decision`, t.uniteAdmin, { decision: 'approve' }).expect(200);
    // Unverified businesses cannot submit.
    await post('/network/applications', t.vikram, { ...app1, territoryId: undefined, packageCode: 'store_without_stock', leadDnaAddon: false, city: 'Uppal' }).expect((res) => expect([403, 201]).toContain(res.status));
    const vk = await one("select id from franchise_units where city = 'Uppal'");
    if (vk) await post(`/network/applications/${vk.id}/submit`, t.vikram).expect(403);
    // Partners cannot see each other's records.
    await get(`/network/units/${a.id}/dashboard`, t.meera).expect(404);
  });

  it('11 + 15: payment initiation never activates; activation needs agreement + verified payment; LeadDNA only when entitled', async () => {
    expect((await get('/network/leaddna', t.asha).expect(200)).body.entitled).toBe(false);
    await post('/network/leaddna/session', t.asha).expect(403);
    await post(`/admin/network/units/${ashaUnit}/activate`, t.uniteAdmin).expect(409);
    await sign(ashaUnit, t.asha, 'Asha Menon');
    await post(`/network/units/${ashaUnit}/payment`, t.asha, { reference: 'UTR123456', amount: 7 * L, method: 'bank_transfer' }).expect(400); // GST missing
    await post(`/network/units/${ashaUnit}/payment`, t.asha, { reference: 'UTR123456', amount: 7 * L * 1.18, method: 'bank_transfer' }).expect(200);
    const blocked = await post(`/admin/network/units/${ashaUnit}/activate`, t.uniteAdmin).expect(409);
    expect(blocked.body.message).toMatch(/finance must verify the payment/);
    expect((await get('/network/leaddna', t.asha).expect(200)).body.entitled).toBe(false);
    await post(`/admin/network/units/${ashaUnit}/payment`, t.uniteAdmin, { decision: 'verify' }).expect(403); // finance only
    await post(`/admin/network/units/${ashaUnit}/payment`, t.finance, { decision: 'verify' }).expect(200);
    const act = (await post(`/admin/network/units/${ashaUnit}/activate`, t.uniteAdmin).expect(200)).body;
    expect(act.status).toBe('live');
    expect(await one("select status, expires_on from franchise_territories where name = 'Ghatkesar mandal'")).toMatchObject({ status: 'allocated' });
    const ld = (await get('/network/leaddna', t.asha).expect(200)).body;
    expect(ld).toMatchObject({ entitled: true, source: 'addon', connection: 'not_configured' });
    expect(JSON.stringify(ld)).not.toMatch(/key|secret|token/i);
    await post('/network/leaddna/session', t.asha).expect(503); // entitled, but the connector is not configured
    // District Franchise: LeadDNA included.
    await sign(raviApp, t.ravi, 'Ravi Patel');
    await pay(raviApp, t.ravi);
    await post(`/admin/network/units/${raviApp}/activate`, t.uniteAdmin).expect(200);
    expect((await get('/network/leaddna', t.ravi).expect(200)).body).toMatchObject({ entitled: true, source: 'package' });
    // Store partners: standard lead capture only, unless an admin grants it.
    expect((await get('/network/leaddna', t.deepak).expect(200)).body.entitled).toBe(false);
  });

  let meeraUnit: string;
  it('10 + 15: store without stock — no inventory; Unite fulfils; capped commission qualifies only after payment and acceptance; settlement', async () => {
    meeraUnit = await applyAndApprove(t.meera, { packageCode: 'store_without_stock', leadDnaAddon: false, state: 'Karnataka', district: 'Dharwad', city: 'Hubballi', pincode: '580020', message: 'Solar display counter in our consulting office.' });
    await sign(meeraUnit, t.meera, 'Meera Iyer');
    await pay(meeraUnit, t.meera);
    await post(`/admin/network/units/${meeraUnit}/allocations`, t.uniteAdmin, { lines: [{ productId: (await product('US-SPD')) ?.id ?? (await product('US-ALD-SPD')).id, qty: 1 }] }).expect(409); // no phantom stock
    await post(`/admin/network/units/${meeraUnit}/activate`, t.uniteAdmin).expect(200);
    const inv = (await get(`/network/units/${meeraUnit}/inventory`, t.meera).expect(200)).body;
    expect(inv.enabled).toBe(false);
    // The 10% cap: products above 10% commission or margin are refused.
    const base = { sku: 'US-TEST-1', name: 'Test product', category: 'allied', brand: 'Unite Solar', hsn: '8536', gstBps: 1800, specification: 'Test specification', warrantyMonths: 12, mrp: 10_000_00, customerPrice: 10_000_00, partnerPrice: 9_000_00, commissionBps: 1000 };
    await post('/admin/network/products', t.uniteAdmin, { ...base, commissionBps: 1200 }).expect(400);
    await post('/admin/network/products', t.uniteAdmin, { ...base, partnerPrice: 8_500_00 }).expect(400); // 15% margin
    await post('/admin/network/products', t.uniteAdmin, base).expect(201);
    const kit = await product('US-KIT-3K');
    await post(`/network/units/${meeraUnit}/sales`, t.meera, { customerName: 'Prakash Hegde', customerPhone: '9845012345', pincode: '580020', fulfilment: 'from_stock', lines: [{ productId: kit.id, qty: 1 }] }).expect(400);
    const o = (await post(`/network/units/${meeraUnit}/sales`, t.meera, { customerName: 'Prakash Hegde', customerPhone: '9845012345', pincode: '580020', fulfilment: 'unite', lines: [{ productId: kit.id, qty: 2 }] }).expect(201)).body;
    expect(o).toMatchObject({ status: 'confirmed', fulfilmentStatus: 'requested', subtotal: 2 * kit.customer_price });
    const c = await one('select * from network_commissions where order_id = $1', [o.id]);
    expect(c).toMatchObject({ stream: 'product', status: 'pending', rate_bps: 900, amount: String(Math.round((2 * kit.customer_price * 900) / 10000)) });
    expect(Number(c.rate_bps)).toBeLessThanOrEqual(1000);
    await post(`/admin/network/commissions/${c.id}/status`, t.uniteAdmin, { to: 'qualified' }).expect(409); // not paid / accepted
    await post(`/network/orders/${o.id}/accept`, t.meera, { acceptedBy: 'Prakash Hegde' }).expect(409); // not delivered
    await post(`/admin/network/orders/${o.id}/fulfilment`, t.uniteAdmin, { status: 'installed' }).expect(409);
    await post(`/admin/network/orders/${o.id}/fulfilment`, t.uniteAdmin, { status: 'dispatched' }).expect(200);
    await post(`/admin/network/orders/${o.id}/fulfilment`, t.uniteAdmin, { status: 'installed' }).expect(200);
    await post(`/network/orders/${o.id}/accept`, t.meera, { acceptedBy: 'Prakash Hegde' }).expect(200);
    expect((await one('select status from network_commissions where id = $1', [c.id])).status).toBe('pending');
    await post(`/admin/network/orders/${o.id}/payment-verified`, t.finance, { reference: 'RZP-PAY-001' }).expect(200);
    expect((await one('select status from network_commissions where id = $1', [c.id])).status).toBe('qualified');
    await post(`/admin/network/commissions/${c.id}/status`, t.uniteAdmin, { to: 'approved' }).expect(200);
    await post('/admin/network/settlements', t.uniteAdmin, { orgId: (await one("select franchisee_org_id from franchise_units where id = $1", [meeraUnit])).franchisee_org_id }).expect(403);
    const meeraOrg = (await one('select franchisee_org_id from franchise_units where id = $1', [meeraUnit])).franchisee_org_id;
    const s = (await post('/admin/network/settlements', t.finance, { orgId: meeraOrg }).expect(201)).body;
    expect(s.amount).toBe(Number(c.amount));
    await post(`/admin/network/settlements/${s.id}/paid`, t.finance, { reference: 'NEFT-0001' }).expect(403); // maker-checker
    await post(`/admin/network/settlements/${s.id}/paid`, t.finance2, { reference: 'NEFT-0001' }).expect(200);
    await post(`/network/orders/${o.id}/cancel`, t.meera, { reason: 'Customer changed mind' }).expect(409); // already settled
    const e = (await get('/network/earnings', t.meera).expect(200)).body;
    expect(e.streams).toHaveLength(5);
    expect(e.streams.find((x: { stream: string }) => x.stream === 'product').totals.paid).toBe(Number(c.amount));
    expect(e.disclaimer).toMatch(/not a guaranteed/i);
    // A cancelled (unsettled) order reverses its commission.
    const o2 = (await post(`/network/units/${meeraUnit}/sales`, t.meera, { customerName: 'Shanta Rao', pincode: '580021', fulfilment: 'unite', lines: [{ productId: kit.id, qty: 1 }] }).expect(201)).body;
    await post(`/network/orders/${o2.id}/cancel`, t.meera, { reason: 'Customer changed mind' }).expect(200);
    expect((await one('select status from network_commissions where order_id = $1', [o2.id])).status).toBe('reversed');
  });

  it('4 + 12: store with stock — ₹4 lakh allocated at partner price, received, sold with locks; never negative; reconciles', async () => {
    const unit = await applyAndApprove(t.deepak, { packageCode: 'store_with_stock', leadDnaAddon: false, state: 'Karnataka', district: 'Tumakuru', city: 'Tumakuru', pincode: '572101', message: 'Second showroom for solar kits in Tumakuru.' });
    await sign(unit, t.deepak, 'Deepak Rao');
    const [k, inv, pv, spd] = await Promise.all(['US-KIT-3K', 'US-INV-5K', 'US-PV-545', 'US-ALD-SPD'].map(product));
    await post(`/admin/network/units/${unit}/allocations`, t.uniteAdmin, { lines: [{ productId: spd.id, qty: 1 }] }).expect(409); // before payment
    await pay(unit, t.deepak);
    const serials = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}-${i + 1}`);
    await post(`/admin/network/units/${unit}/allocations`, t.uniteAdmin, { lines: [{ productId: pv.id, qty: 3 }] }).expect(400); // serials required
    const lines = [{ productId: k.id, qty: 2 }, { productId: inv.id, qty: 1, serials: serials('INV', 1) }, { productId: pv.id, qty: 3, serials: serials('PV', 3) }, { productId: spd.id, qty: 3 }];
    const n = (x: string | number) => Number(x);
    const value = 2 * n(k.partner_price) + n(inv.partner_price) + 3 * n(pv.partner_price) + 3 * n(spd.partner_price);
    expect(value).toBe(4 * L);
    const a = (await post(`/admin/network/units/${unit}/allocations`, t.uniteAdmin, { lines }).expect(201)).body;
    expect(a).toMatchObject({ value: 4 * L, status: 'dispatched' });
    await post(`/admin/network/units/${unit}/allocations`, t.uniteAdmin, { lines: [{ productId: spd.id, qty: 1 }] }).expect(409); // entitlement used up
    await post(`/admin/network/units/${unit}/activate`, t.uniteAdmin).expect(409); // stock not received
    await post(`/network/units/${unit}/allocations/${a.id}/receive`, t.deepak).expect(200);
    await post(`/network/units/${unit}/allocations/${a.id}/receive`, t.deepak).expect(409);
    await post(`/admin/network/units/${unit}/activate`, t.uniteAdmin).expect(200);
    // Two simultaneous sales of 2 of the 3 modules: exactly one succeeds; stock never goes negative.
    const sale = (qty: number) => post(`/network/units/${unit}/sales`, t.deepak, { customerName: 'Walk-in customer', pincode: '572101', fulfilment: 'from_stock', lines: [{ productId: pv.id, qty }] });
    const [r1, r2] = await Promise.all([sale(2), sale(2)]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect((await one('select qty from store_inventory where unit_id = $1 and product_id = $2', [unit, pv.id])).qty).toBe(1);
    const ok = r1.status === 201 ? r1.body : r2.body;
    expect(ok.lines[0].earning).toMatchObject({ kind: 'margin', amount: 2 * (n(pv.customer_price) - n(pv.partner_price)) });
    expect(await one('select count(*)::int n from network_commissions where order_id = $1', [ok.id])).toEqual({ n: 0 }); // margin, not margin + commission
    await sale(5).expect(409);
    await post(`/network/units/${unit}/inventory/movements`, t.deepak, { productId: spd.id, kind: 'damage', qty: 1, note: 'Cracked housing on unpacking' }).expect(200);
    await post(`/network/units/${unit}/inventory/movements`, t.deepak, { productId: spd.id, kind: 'damage', qty: 5, note: 'Over-report' }).expect(409);
    await post(`/network/orders/${ok.id}/cancel`, t.deepak, { reason: 'Customer returned the goods' }).expect(200);
    const iv = (await get(`/network/units/${unit}/inventory`, t.deepak).expect(200)).body;
    expect(iv.reconciliation.ok).toBe(true);
    expect(iv.items.find((x: { sku: string }) => x.sku === 'US-PV-545').qty).toBe(3);
    expect(iv.allocated).toBe(4 * L);
    expect(iv.remainingAllocation).toBe(0);
    // The seeded demo store reconciles too.
    const demo = (await one("select id from franchise_units where code = 'US-DEMO-01'")).id;
    expect((await get(`/network/units/${demo}/inventory`, t.deepak).expect(200)).body.reconciliation.ok).toBe(true);
  });

  it('commission streams: district 25% of net profit, inter-franchise 12.5% of the pool, solar park ≤ 2%, investment after compliance', async () => {
    const d = (await post('/admin/network/commissions/district', t.uniteAdmin, { unitId: raviApp, period: '2026-10', revenue: 50 * L, directCosts: 30 * L, approvedExpenses: 5 * L }).expect(201)).body;
    expect(d).toMatchObject({ base: 15 * L, rateBps: 2500, amount: 3.75 * L });
    await post('/admin/network/commissions/district', t.uniteAdmin, { unitId: raviApp, period: '2026-10', revenue: 50 * L, directCosts: 30 * L, approvedExpenses: 5 * L }).expect(409); // no duplicates
    await post('/admin/network/commissions/district', t.uniteAdmin, { unitId: ashaUnit, period: '2026-10', revenue: L, directCosts: 0, approvedExpenses: 0 }).expect(409); // basic franchise
    await post(`/admin/network/commissions/${d.id}/status`, t.uniteAdmin, { to: 'qualified' }).expect(200);
    await post(`/admin/network/commissions/${d.id}/status`, t.uniteAdmin, { to: 'approved' }).expect(403); // maker cannot approve
    await post(`/admin/network/commissions/${d.id}/status`, t.evaluator, { to: 'approved' }).expect(200);

    const i = (await post('/admin/network/commissions/inter-franchise', t.uniteAdmin, { originUnitId: ashaUnit, executingUnitId: raviApp, leadReference: 'LEAD-GHT-0042', projectReference: 'PRJ-NLG-0007', eligiblePool: 4 * L, poolBasis: 'Unite gross margin on the 40 kW project' }).expect(201)).body;
    expect(i).toMatchObject({ rateBps: 1250, amount: 50_000_00, base: 4 * L });
    await post(`/admin/network/commissions/${i.id}/status`, t.uniteAdmin, { to: 'qualified' }).expect(409);
    await post(`/admin/network/commissions/${i.id}/payment-verified`, t.finance, { reference: 'UTR-PRJ-7' }).expect(200);
    await post(`/admin/network/commissions/${i.id}/status`, t.uniteAdmin, { to: 'qualified' }).expect(200);

    const orgs = Object.fromEntries((await pool.query("select display_name n, id from organizations where display_name in ('Volt EPC', 'Meera Iyer Consulting', 'Deccan Distributors')")).rows.map((r) => [r.n, r.id]));
    await post('/admin/network/commissions/solar-park', t.uniteAdmin, { projectReference: 'SP-NLG-01', projectName: '10 MW Nalgonda solar park', eligibleValue: 400 * L, poolBps: 250, contributors: [{ orgId: orgs['Volt EPC'], bps: 100, role: 'Land aggregation' }] }).expect(400);
    await post('/admin/network/commissions/solar-park', t.uniteAdmin, { projectReference: 'SP-NLG-01', projectName: '10 MW Nalgonda solar park', eligibleValue: 400 * L, poolBps: 200, contributors: [{ orgId: orgs['Volt EPC'], bps: 120, role: 'Land aggregation' }, { orgId: orgs['Meera Iyer Consulting'], bps: 100, role: 'Approvals' }] }).expect(400);
    const sp = (await post('/admin/network/commissions/solar-park', t.uniteAdmin, { projectReference: 'SP-NLG-01', projectName: '10 MW Nalgonda solar park', eligibleValue: 400 * L, poolBps: 200, contributors: [{ orgId: orgs['Volt EPC'], bps: 120, role: 'Land aggregation' }, { orgId: orgs['Meera Iyer Consulting'], bps: 80, role: 'Approvals' }] }).expect(201)).body;
    expect(sp.map((x: { amount: number }) => x.amount)).toEqual([4.8 * L, 3.2 * L]);
    await post('/admin/network/commissions/solar-park', t.uniteAdmin, { projectReference: 'SP-NLG-01', projectName: '10 MW Nalgonda solar park', eligibleValue: 400 * L, poolBps: 200, contributors: [{ orgId: orgs['Deccan Distributors'], bps: 10, role: 'Evacuation study' }] }).expect(400); // pool full

    const blocked = (await post('/admin/network/commissions/investment', t.uniteAdmin, { orgId: orgs['Meera Iyer Consulting'], investmentReference: 'INV-0001', investor: 'Overseas fund (restricted route)', realised: 100 * L, bps: 200, legallyRestricted: true }).expect(201)).body;
    expect(blocked).toMatchObject({ status: 'blocked', compliance: 'blocked' });
    await post(`/admin/network/commissions/${blocked.id}/compliance`, t.compliance, { decision: 'cleared', note: 'Attempt to clear' }).expect(409);
    const inv = (await post('/admin/network/commissions/investment', t.uniteAdmin, { orgId: orgs['Meera Iyer Consulting'], investmentReference: 'INV-0002', investor: 'Domestic family office', realised: 100 * L, bps: 200, legallyRestricted: false }).expect(201)).body;
    expect(inv.amount).toBe(2 * L);
    await post('/admin/network/commissions/investment', t.uniteAdmin, { orgId: orgs['Meera Iyer Consulting'], investmentReference: 'INV-0003', investor: 'X', realised: L, bps: 300, legallyRestricted: false }).expect(400);
    await post(`/admin/network/commissions/${inv.id}/status`, t.uniteAdmin, { to: 'qualified' }).expect(409);
    await post(`/admin/network/commissions/${inv.id}/compliance`, t.uniteAdmin, { decision: 'cleared', note: 'KYC and FEMA check done' }).expect(403);
    await post(`/admin/network/commissions/${inv.id}/compliance`, t.compliance, { decision: 'cleared', note: 'KYC and FEMA check done' }).expect(200);
    await post(`/admin/network/commissions/${inv.id}/status`, t.uniteAdmin, { to: 'qualified' }).expect(200);
    await post(`/admin/network/commissions/${inv.id}/status`, t.uniteAdmin, { to: 'reversed' }).expect(400); // reason needed
    await post(`/admin/network/commissions/${inv.id}/status`, t.uniteAdmin, { to: 'reversed', note: 'Investor withdrew' }).expect(200);

    const e = (await get('/network/earnings', t.asha).expect(200)).body;
    const s = (k: string) => e.streams.find((x: { stream: string }) => x.stream === k);
    expect(s('inter_franchise').totals.pending).toBe(50_000_00);
    expect(s('solar_park').entries[0]).toMatchObject({ rateBps: 120, base: 400 * L });
    expect((await get('/network/earnings', t.ravi).expect(200)).body.streams.find((x: { stream: string }) => x.stream === 'district_profit').totals.approved).toBe(3.75 * L);
    const audit = await one("select count(*)::int n from audit_events where action like 'network.commission.%'");
    expect(audit.n).toBeGreaterThan(8);
  });

  it('8 + 9: marketing for every partner, demo materials tracked from request to return', async () => {
    for (const tok of [t.asha, t.meera, t.deepak, t.ravi]) {
      const m = (await get('/network/marketing', tok).expect(200)).body;
      expect(m.referralLink).toMatch(/\/refer\/[A-Z0-9]+$/);
      expect(m.campaigns).toHaveLength(4);
    }
    await get('/network/marketing', t.vikram).expect((r) => expect([403]).toContain(r.status));
    const { materials } = (await get('/network/demo', t.meera).expect(200)).body;
    const stand = materials.find((m: { name: string }) => m.name === 'Unite Solar display stand');
    await post(`/network/units/${meeraUnit}/demo-requests`, t.meera, { materialId: stand.id, qty: 3 }).expect(400);
    const r = (await post(`/network/units/${meeraUnit}/demo-requests`, t.meera, { materialId: stand.id, qty: 1 }).expect(201)).body;
    await post(`/network/demo/${r.id}/status`, t.meera, { to: 'approved' }).expect(409);
    for (const to of ['approved', 'dispatched', 'delivered']) await post(`/network/demo/${r.id}/status`, t.uniteAdmin, { to }).expect(200);
    await post(`/network/demo/${r.id}/status`, t.meera, { to: 'confirmed' }).expect(200);
    await post(`/network/demo/${r.id}/status`, t.meera, { to: 'damaged' }).expect(400);
    await post(`/network/demo/${r.id}/status`, t.meera, { to: 'damaged', note: 'Side panel dented in transit' }).expect(200);
    await post(`/network/demo/${r.id}/status`, t.meera, { to: 'returned', note: 'Returned to Hubballi depot' }).expect(200);
    expect((await one('select status, jsonb_array_length(history) n from demo_allocations where id = $1', [r.id]))).toEqual({ status: 'returned', n: 7 });
    const sr = (await post(`/network/units/${meeraUnit}/service-requests`, t.meera, { kind: 'subsidy_guidance', customerName: 'Prakash Hegde', details: 'PM Surya Ghar subsidy application help for 3 kW.' }).expect(201)).body;
    await post(`/admin/network/service-requests/${sr.id}`, t.uniteAdmin, { status: 'resolved' }).expect(400);
    await post(`/admin/network/service-requests/${sr.id}`, t.uniteAdmin, { status: 'resolved', resolution: 'Application filed on the national portal.' }).expect(200);
  });

  it('admin reports by state, district, PIN, type and partner; partners are kept out', async () => {
    await get('/admin/network/dashboard', t.asha).expect(403);
    const all = (await get('/admin/network/dashboard', t.uniteAdmin).expect(200)).body;
    expect(all.kpis.active).toBeGreaterThanOrEqual(5);
    expect(all.byPackage).toHaveLength(5);
    expect(all.commissions).toHaveLength(5);
    const tg = (await get('/admin/network/dashboard?state=Telangana', t.uniteAdmin).expect(200)).body;
    expect(tg.byPartner.every((p: { state: string }) => p.state === 'Telangana')).toBe(true);
    const ka = (await get('/admin/network/dashboard?type=store_with_stock&pincode=572101', t.finance).expect(200)).body;
    expect(ka.byPartner).toHaveLength(1);
    expect(ka.kpis.stockValue).toBeGreaterThan(0);
    // Territory renewal and expiry are administrator actions with an audit trail.
    const g = await territory('Ghatkesar mandal');
    await post(`/admin/network/territories/${g}/action`, t.uniteAdmin, { action: 'renew', expiresOn: '2035-03-31', note: 'Renewed on performance' }).expect(200);
    expect((await one('select expires_on from franchise_territories where id = $1', [g])).expires_on).toBe('2035-03-31');
  });
});
