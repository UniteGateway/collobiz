/**
 * COLLABIZ COMEARN — a verified company offers a commission; a member joins, accepts the frozen terms, registers a protected lead;
 * the company records quotation, order, verified payment (server computes the commission), approval and transfer; disputes hold
 * payment; restricted sectors need a licence; platform fee is a super-admin setting that needs legal review.
 */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

const L = 1e5 * 100; const CR = 1e7 * 100;
const opp = { title: '1 MW rooftop solar for factories in Telangana', type: 'sales_conversion', category: 'solar', description: 'Introduce factories that want rooftop solar. We design, supply, install and maintain the plant.', territory: 'Telangana', estimatedValuePaise: 3 * CR, model: 'percent', rateBps: 200, trigger: 'customer_payment', paymentDays: 30 };
const lead = { customerName: 'Deccan Polymers', city: 'Hyderabad', contactName: 'Plant head', phone: '+91 98480 12345', requirement: 'Needs a 1 MW rooftop solar plant on two sheds', estimatedValuePaise: 3 * CR, consent: true };

describe('COLLABIZ COMEARN', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const get = (p: string, tok: string) => api(app).get(`/v1${p}`).set(auth(tok));
  const post = (p: string, b: object, tok: string) => api(app).post(`/v1${p}`).set(auth(tok)).send(b);
  const put = (p: string, b: object, tok: string) => api(app).put(`/v1${p}`).set(auth(tok)).send(b);
  let oppId = ''; let engId = ''; let terms = '';

  it('offer commissions: owners/admins post drafts; only verified businesses publish; potential is an estimate', async () => {
    await post('/comearn/opportunities', { ...opp, rateBps: undefined }, t.asha).expect(400);
    await post('/comearn/opportunities', opp, t.rohit).expect(403); // org member, not admin
    const o = (await post('/comearn/opportunities', opp, t.asha).expect(201)).body;
    oppId = o.id; expect(o).toMatchObject({ status: 'draft', potentialPaise: 6 * L });
    await get(`/comearn/opportunities/${oppId}`, t.ravi).expect(404); // drafts are private
    const g = (await post('/comearn/opportunities', { ...opp, title: 'Steel structures for solar parks' }, t.vikram).expect(201)).body;
    const refused = await post(`/comearn/opportunities/${g.id}/status`, { status: 'live' }, t.vikram).expect(403);
    expect(refused.body.message).toMatch(/verified businesses/);
    await post(`/comearn/opportunities/${oppId}/status`, { status: 'live' }, t.asha).expect(200);
    const list = (await get('/comearn/opportunities?category=solar', t.ravi).expect(200)).body.items;
    expect(list.map((x: { id: string }) => x.id)).toEqual([oppId]);
  });

  it('restricted sectors need a licence number before publishing', async () => {
    const r = (await post('/comearn/opportunities', { ...opp, title: 'Sell plots in our Shadnagar layout', category: 'real_estate', type: 'lead_generation' }, t.asha).expect(201)).body;
    const no = await post(`/comearn/opportunities/${r.id}/status`, { status: 'live' }, t.asha).expect(400);
    expect(no.body.fields.licenceNote).toMatch(/RERA/);
  });

  it('earn commissions: join, accept the frozen terms, register a protected lead', async () => {
    await post(`/comearn/opportunities/${oppId}/join`, {}, t.asha).expect(400); // own company
    const j = (await post(`/comearn/opportunities/${oppId}/join`, {}, t.ravi).expect(201)).body;
    engId = j.id; terms = j.termsHash; expect(j.agreement).toMatch(/2% of the verified business value/);
    await post(`/comearn/opportunities/${oppId}/join`, {}, t.ravi).expect(409);
    await post(`/comearn/engagements/${engId}/lead`, lead, t.ravi).expect(409); // agreement first
    await post(`/comearn/engagements/${engId}/accept`, { termsHash: 'x'.repeat(64), confirm: true }, t.ravi).expect(409);
    await post(`/comearn/engagements/${engId}/accept`, { termsHash: terms, confirm: true }, t.ravi).expect(200);
    await post(`/comearn/engagements/${engId}/lead`, { ...lead, consent: false }, t.ravi).expect(400);
    const l = (await post(`/comearn/engagements/${engId}/lead`, lead, t.ravi).expect(201)).body;
    expect(l.certificateCode).toMatch(/^CEL-/);
    // A second member cannot register the same customer for this opportunity (phone written differently).
    const j2 = (await post(`/comearn/opportunities/${oppId}/join`, {}, t.deepak).expect(201)).body;
    await post(`/comearn/engagements/${j2.id}/accept`, { termsHash: j2.termsHash, confirm: true }, t.deepak).expect(200);
    const dup = await post(`/comearn/engagements/${j2.id}/lead`, { ...lead, customerName: 'Deccan Polymers Pvt Ltd', phone: '9848012345' }, t.deepak).expect(409);
    expect(dup.body.message).toMatch(/already been introduced/); expect(dup.body.message).not.toMatch(/Sunrise|Ravi/);
    await get(`/comearn/engagements/${engId}`, t.deepak).expect(404);
  });

  it('the company records the stages in order; the server computes the commission from the verified payment', async () => {
    await post(`/comearn/engagements/${engId}/stage`, { stage: 'quoted' }, t.ravi).expect(403);
    await post(`/comearn/engagements/${engId}/stage`, { stage: 'order_confirmed', amountPaise: 3 * CR }, t.asha).expect(409); // quote first
    await post(`/comearn/engagements/${engId}/stage`, { stage: 'quoted', note: 'Site visit done, quotation sent' }, t.asha).expect(200);
    await post(`/comearn/engagements/${engId}/stage`, { stage: 'order_confirmed' }, t.asha).expect(400);
    await post(`/comearn/engagements/${engId}/stage`, { stage: 'order_confirmed', amountPaise: 3 * CR, reference: 'PO-7781' }, t.asha).expect(200);
    const v = (await post(`/comearn/engagements/${engId}/stage`, { stage: 'payment_verified', amountPaise: 3 * CR, reference: 'UTR-55120' }, t.asha).expect(200)).body;
    expect(v.commission).toMatchObject({ grossPaise: 6 * L, status: 'pending_approval', platformFeePaise: 0 });
    await post(`/comearn/engagements/${engId}/stage`, { stage: 'payment_verified', amountPaise: 3 * CR, reference: 'UTR-55120' }, t.asha).expect(409); // not twice
    await post(`/comearn/engagements/${engId}/stage`, { stage: 'commission_paid', reference: 'NEFT-1' }, t.asha).expect(409); // approve first
    await post(`/comearn/engagements/${engId}/stage`, { stage: 'commission_approved' }, t.asha).expect(200);
    await post(`/comearn/engagements/${engId}/stage`, { stage: 'commission_paid', reference: 'NEFT-90211', tdsPaise: 7 * L }, t.asha).expect(400); // TDS > commission
    await post(`/comearn/engagements/${engId}/stage`, { stage: 'commission_paid', reference: 'NEFT-90211', tdsPaise: 30000_00 }, t.asha).expect(200);
    const e = (await get(`/comearn/engagements/${engId}`, t.ravi).expect(200)).body;
    expect(e.stage).toBe('commission_paid'); expect(e.stages.every((s: { done: boolean }) => s.done)).toBe(true);
    expect(e.commissions[0]).toMatchObject({ grossPaise: 6 * L, tdsPaise: 30000_00, netPaise: 6 * L - 30000_00, status: 'paid', paymentReference: 'NEFT-90211' });
    expect(e.agreement).toMatch(/Lead protection/);
    await post(`/comearn/commissions/${e.commissions[0].id}/received`, {}, t.ravi).expect(200);
    const h = (await get('/comearn/home', t.ravi).expect(200)).body;
    expect(h).toMatchObject({ earnedPaise: 6 * L - 30000_00, pendingPaise: 0, activeOpportunities: 1 });
    const earn = (await get('/comearn/earnings', t.ravi).expect(200)).body;
    expect(earn.comearn).toHaveLength(1); expect(Array.isArray(earn.uniteLedger)).toBe(true);
  });

  it('a dispute holds the commission until COLLABIZ rules', async () => {
    const o = (await post('/comearn/opportunities', { ...opp, title: 'Transformer orders from EPC contractors', model: 'fixed', rateBps: undefined, fixedPaise: 50_000_00, trigger: 'order_confirmed' }, t.asha).expect(201)).body;
    await post(`/comearn/opportunities/${o.id}/status`, { status: 'live' }, t.asha).expect(200);
    const j = (await post(`/comearn/opportunities/${o.id}/join`, {}, t.ravi).expect(201)).body;
    await post(`/comearn/engagements/${j.id}/accept`, { termsHash: j.termsHash, confirm: true }, t.ravi).expect(200);
    await post(`/comearn/engagements/${j.id}/lead`, { ...lead, customerName: 'Kakatiya Infra', phone: '9000000001' }, t.ravi).expect(201);
    for (const s of [{ stage: 'quoted' }, { stage: 'order_confirmed', amountPaise: 80 * L }]) await post(`/comearn/engagements/${j.id}/stage`, s, t.asha).expect(200);
    const v = (await post(`/comearn/engagements/${j.id}/stage`, { stage: 'payment_verified', amountPaise: 80 * L, reference: 'INV-22' }, t.asha).expect(200)).body;
    expect(v.commission.grossPaise).toBe(50_000_00); // fixed
    await post(`/comearn/engagements/${j.id}/dispute`, { reason: 'Short' }, t.ravi).expect(400);
    const d = (await post(`/comearn/engagements/${j.id}/dispute`, { reason: 'The order value was higher than recorded; please check the invoice.' }, t.ravi).expect(201)).body;
    await post(`/comearn/engagements/${j.id}/stage`, { stage: 'commission_approved' }, t.asha).expect(409);
    await post(`/admin/comearn/disputes/${d.id}/rule`, { ruling: 'Invoice checked; fixed commission applies.', outcome: 'continue' }, t.asha).expect(403);
    await post(`/admin/comearn/disputes/${d.id}/rule`, { ruling: 'Invoice checked; fixed commission applies.', outcome: 'continue' }, t.uniteAdmin).expect(200);
    await post(`/comearn/engagements/${j.id}/stage`, { stage: 'commission_approved' }, t.asha).expect(200);
  });

  it('admin: platform fee is off by default, needs legal review and a super admin; it applies to new commissions', async () => {
    const o = (await get('/admin/comearn/overview', t.uniteAdmin).expect(200)).body;
    expect(o.settings).toMatchObject({ platformFeeBps: 0, restrictedCategories: ['real_estate'] });
    expect(o.counts).toMatchObject({ live: 2, leads: 2 }); // the duplicate customer was refused
    await get('/admin/comearn/overview', t.ravi).expect(403);
    await put('/admin/comearn/settings', { platformFeeBps: 1000, feePayer: 'company', restrictedCategories: ['real_estate'], legalReviewed: true }, t.uniteAdmin).expect(403);
    await put('/admin/comearn/settings', { platformFeeBps: 1000, feePayer: 'company', restrictedCategories: ['real_estate'], legalReviewed: false }, t.superadmin).expect(400);
    await put('/admin/comearn/settings', { platformFeeBps: 1000, feePayer: 'company', restrictedCategories: ['real_estate'], legalReviewed: true }, t.superadmin).expect(200);
    const x = (await post('/comearn/opportunities', { ...opp, title: 'Inverters for rooftop installers', model: 'fixed', rateBps: undefined, fixedPaise: 10_000_00 }, t.asha).expect(201)).body;
    await post(`/comearn/opportunities/${x.id}/status`, { status: 'live' }, t.asha).expect(200);
    const j = (await post(`/comearn/opportunities/${x.id}/join`, {}, t.deepak).expect(201)).body;
    await post(`/comearn/engagements/${j.id}/accept`, { termsHash: j.termsHash, confirm: true }, t.deepak).expect(200);
    await post(`/comearn/engagements/${j.id}/lead`, { ...lead, customerName: 'Sri Sai Solar', phone: '9000000002' }, t.deepak).expect(201);
    for (const s of [{ stage: 'quoted' }, { stage: 'order_confirmed', amountPaise: 5 * L }]) await post(`/comearn/engagements/${j.id}/stage`, s, t.asha).expect(200);
    const v = (await post(`/comearn/engagements/${j.id}/stage`, { stage: 'payment_verified', amountPaise: 5 * L, reference: 'UTR-9' }, t.asha).expect(200)).body;
    expect(v.commission).toMatchObject({ grossPaise: 10_000_00, platformFeeBps: 1000, platformFeePaise: 1_000_00, platformFeePayer: 'company' });
    await post(`/admin/comearn/opportunities/${x.id}/pause`, { reason: 'Checking the product listing' }, t.uniteAdmin).expect(200);
    await get(`/comearn/opportunities/${x.id}`, t.ravi).expect(404);
  });

  it('terms changed after joining: members must re-read before accepting; accepted terms stay frozen', async () => {
    const o = (await post('/comearn/opportunities', { ...opp, title: 'Solar pumps for farmer groups' }, t.asha).expect(201)).body;
    await post(`/comearn/opportunities/${o.id}/status`, { status: 'live' }, t.asha).expect(200);
    const j = (await post(`/comearn/opportunities/${o.id}/join`, {}, t.ravi).expect(201)).body;
    await put(`/comearn/opportunities/${o.id}`, { ...opp, title: 'Solar pumps for farmer groups', rateBps: 150 }, t.asha).expect(200);
    const stale = await post(`/comearn/engagements/${j.id}/accept`, { termsHash: j.termsHash, confirm: true }, t.ravi).expect(409);
    expect(stale.body.message).toMatch(/changed the terms/);
    const { rows } = await pool.query('select stage from ce_engagements where id = $1', [j.id]);
    expect(rows[0].stage).toBe('selected');
  });
});
