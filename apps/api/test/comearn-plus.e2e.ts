/**
 * COMEARN part 2 — reverse marketplace (requirements + sealed bids + selection), team formation and commission pool
 * allocations, reputation, CRM hand-off, sales-assistant drafts, featured listings and source links.
 */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

const L = 1e5 * 100; const CR = 1e7 * 100;
const future = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
const req = { title: 'Factory needs a 1 MW rooftop solar plant', category: 'solar', description: 'Two sheds in Patancheru, wants a turnkey EPC partner with financing options.', city: 'Hyderabad', estimatedValuePaise: 3 * CR, closesOn: future,
  customerName: 'Deccan Polymers', contactName: 'Plant head', phone: '9848012345', consent: true };
const bid = (pct: number) => ({ model: 'percent', rateBps: pct * 100, trigger: 'customer_payment', paymentDays: 30, proposal: 'Turnkey EPC with design, supply, installation, net-metering and 5-year O&M.' });

describe('COMEARN part 2', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const get = (p: string, tok: string) => api(app).get(`/v1${p}`).set(auth(tok));
  const post = (p: string, b: object, tok: string) => api(app).post(`/v1${p}`).set(auth(tok)).send(b);
  const put = (p: string, b: object, tok: string) => api(app).put(`/v1${p}`).set(auth(tok)).send(b);
  /** Companies submit; Unite releases (margin 0 here — margin is tested in comearn-review.e2e.ts). */
  const publish = async (id: string) => { await post(`/comearn/opportunities/${id}/status`, { status: 'submit' }, t.asha).expect(200); await post(`/admin/comearn/opportunities/${id}/release`, {}, t.uniteAdmin).expect(200); };
  let reqId = ''; let engId = ''; let ashaBid = '';

  it('a member posts a customer requirement; the customer stays private; the same customer cannot be posted twice', async () => {
    await post('/comearn/requirements', { ...req, consent: false }, t.ravi).expect(400);
    const r = (await post('/comearn/requirements', req, t.ravi).expect(201)).body;
    reqId = r.id; expect(r.status).toBe('open');
    await post('/comearn/requirements', { ...req, customerName: 'Deccan Polymers Pvt Ltd', phone: '+91 98480 12345' }, t.deepak).expect(409);
    const list = (await get('/comearn/requirements', t.asha).expect(200)).body;
    expect(list.items).toHaveLength(1); expect(JSON.stringify(list)).not.toMatch(/Deccan Polymers|9848012345|Plant head/);
  });

  it('only verified businesses bid; bids are sealed; the member sees every offer with track record', async () => {
    await post(`/comearn/requirements/${reqId}/bids`, bid(5), t.vikram).expect(403); // GreenBuild is not verified
    await post(`/comearn/requirements/${reqId}/bids`, bid(5), t.ravi).expect(400); // own requirement
    await post(`/comearn/requirements/${reqId}/bids`, { ...bid(2), rateBps: undefined }, t.asha).expect(400);
    ashaBid = (await post(`/comearn/requirements/${reqId}/bids`, bid(2), t.asha).expect(201)).body.id;
    await post(`/comearn/requirements/${reqId}/bids`, bid(3), t.deepak).expect(201);
    await post(`/comearn/requirements/${reqId}/bids`, bid(4), t.meera).expect(201);
    const asCompany = (await get(`/comearn/requirements/${reqId}`, t.asha).expect(200)).body;
    expect(asCompany.customer).toBeNull(); expect(asCompany.bids).toBeUndefined(); expect(asCompany.myBid.rateBps).toBe(200);
    const asMember = (await get(`/comearn/requirements/${reqId}`, t.ravi).expect(200)).body;
    expect(asMember.bids).toHaveLength(3); expect(asMember.customer.customerName).toBe('Deccan Polymers');
    const four = asMember.bids.find((b: { rateBps: number }) => b.rateBps === 400);
    expect(four.commissionPaise).toBe(12 * L); expect(four.reputation).toMatchObject({ asCompany: null, verified: true });
    expect(asMember.note).toMatch(/not always the right choice/);
  });

  it('selecting a bid creates the engagement with the lead protected and releases the customer only to the winner', async () => {
    await post(`/comearn/requirements/${reqId}/select`, { bidId: ashaBid, confirm: true }, t.asha).expect(403);
    const s = (await post(`/comearn/requirements/${reqId}/select`, { bidId: ashaBid, confirm: true }, t.ravi).expect(200)).body;
    engId = s.engagementId; expect(s.certificateCode).toMatch(/^CEL-/);
    await post(`/comearn/requirements/${reqId}/select`, { bidId: ashaBid, confirm: true }, t.ravi).expect(409);
    const e = (await get(`/comearn/engagements/${engId}`, t.asha).expect(200)).body;
    expect(e).toMatchObject({ side: 'company', stage: 'lead_registered', lead: { customerName: 'Deccan Polymers', phone: '9848012345' } });
    expect(e.stages.filter((x: { done: boolean }) => x.done)).toHaveLength(3);
    await get(`/comearn/engagements/${engId}`, t.deepak).expect(404); // losing bidder sees nothing
    const { rows } = await pool.query(`select status from ce_bids where requirement_id = $1 order by rate_bps`, [reqId]);
    expect(rows.map((r) => r.status)).toEqual(['selected', 'not_selected', 'not_selected']);
    expect((await get('/comearn/requirements', t.deepak).expect(200)).body.items).toHaveLength(0);
    const o = (await pool.query(`select o.status from ce_opportunities o join ce_engagements e on e.opportunity_id = o.id where e.id = $1`, [engId])).rows[0];
    expect(o.status).toBe('private'); // never listed in the marketplace
  });

  it('team formation: suggestions with reasons, shares capped, everyone must accept', async () => {
    await put('/venture-ai/capabilities', { roles: ['engineer'], categories: ['Solar'], countries: ['IN'], certifications: [] }, t.vikram).expect(200);
    await put('/venture-ai/capabilities', { roles: ['sales_agent'], categories: ['Solar'], countries: ['IN'] }, t.deepak).expect(200);
    await get(`/comearn/engagements/${engId}/team-suggestions`, t.asha).expect(403);
    const sug = (await get(`/comearn/engagements/${engId}/team-suggestions`, t.ravi).expect(200)).body;
    const tech = sug.roles.find((r: { role: string }) => r.role === 'technical');
    expect(tech.candidates[0].org).toMatch(/GreenBuild/); expect(tech.candidates[0].reasons.join(' ')).toMatch(/Solar/);
    expect(JSON.stringify(sug)).not.toMatch(/@|\+91/);
    const orgOf = async (email: string) => (await pool.query(`select m.organization_id id from memberships m join users u on u.id = m.user_id where u.email = $1 and m.status = 'active' limit 1`, [email])).rows[0]?.id;
    const vikOrg = await orgOf('vikram@greenbuild.example'); const deeOrg = await orgOf('deepak@deccan.example');
    expect(vikOrg).toBeTruthy();
    await post(`/comearn/engagements/${engId}/team`, { orgId: vikOrg, role: 'technical', sharePct: 95 }, t.ravi).expect(400);
    const v = (await post(`/comearn/engagements/${engId}/team`, { orgId: vikOrg, role: 'technical', sharePct: 15 }, t.ravi).expect(201)).body;
    expect(v.leadSharePct).toBe(85);
    const d = (await post(`/comearn/engagements/${engId}/team`, { orgId: deeOrg, role: 'negotiator', sharePct: 15 }, t.ravi).expect(201)).body;
    await post(`/comearn/engagements/${engId}/team`, { orgId: vikOrg, role: 'technical', sharePct: 10 }, t.ravi).expect(409);
    const inv = (await get('/comearn/team-invitations', t.vikram).expect(200)).body.items[0];
    expect(inv).toMatchObject({ sharePct: 15, roleLabel: 'Technical consultant', potentialPaise: Math.round(6 * L * 0.15) });
    await post(`/comearn/team/${v.id}/respond`, { decision: 'accept' }, t.vikram).expect(200);
    await post(`/comearn/team/${d.id}/respond`, { decision: 'decline' }, t.deepak).expect(200);
    const asTeam = (await get(`/comearn/engagements/${engId}`, t.vikram).expect(200)).body;
    expect(asTeam.side).toBe('team'); expect(asTeam.lead.phone).toBeNull(); expect(asTeam.commissions).toEqual([]);
  });

  it('on payment the lead owes each accepted member their share; both sides record it', async () => {
    for (const s of [{ stage: 'quoted' }, { stage: 'order_confirmed', amountPaise: 3 * CR }, { stage: 'payment_verified', amountPaise: 3 * CR, reference: 'UTR-1' }, { stage: 'commission_approved' }])
      await post(`/comearn/engagements/${engId}/stage`, s, t.asha).expect(200);
    const meeraOrg = (await pool.query(`select m.organization_id id from memberships m join users u on u.id = m.user_id where u.email = 'meera@consult.example' limit 1`)).rows[0].id;
    await post(`/comearn/engagements/${engId}/team`, { orgId: meeraOrg, role: 'other', sharePct: 5 }, t.ravi).expect(409); // locked after payment verified
    await post(`/comearn/engagements/${engId}/stage`, { stage: 'commission_paid', reference: 'NEFT-1', tdsPaise: 30000_00, tdsCertificateRef: 'TDS-Q3-0042' }, t.asha).expect(200);
    const e = (await get(`/comearn/engagements/${engId}`, t.ravi).expect(200)).body;
    expect(e.commissions[0]).toMatchObject({ netPaise: 6 * L - 30000_00, tdsCertificateRef: 'TDS-Q3-0042' });
    expect(e.allocations).toHaveLength(1);
    const a = e.allocations[0]; expect(a.amountPaise).toBe(Math.floor((6 * L - 30000_00) * 0.15));
    await post(`/comearn/allocations/${a.id}/confirm`, {}, t.vikram).expect(409);
    await post(`/comearn/allocations/${a.id}/paid`, { reference: 'IMPS-77' }, t.vikram).expect(404);
    await post(`/comearn/allocations/${a.id}/paid`, { reference: 'IMPS-77' }, t.ravi).expect(200);
    await post(`/comearn/allocations/${a.id}/confirm`, {}, t.vikram).expect(200);
    expect((await get('/comearn/team-earnings', t.vikram).expect(200)).body.items[0]).toMatchObject({ status: 'confirmed', reference: 'IMPS-77' });
  });

  it('reputation, CRM hand-off and sales-assistant drafts come from the record only', async () => {
    const ashaOrg = (await pool.query(`select org_id from ce_opportunities o join ce_engagements e on e.opportunity_id = o.id where e.id = $1`, [engId])).rows[0].org_id;
    const rep = (await get(`/comearn/reputation/${ashaOrg}`, t.ravi).expect(200)).body;
    expect(rep.asCompany).toMatchObject({ paid: 1, onTimePct: 100 }); expect(rep.asEarner).toBeNull();
    const c1 = (await post(`/comearn/engagements/${engId}/crm`, {}, t.asha).expect(201)).body;
    expect(c1.existed).toBe(false);
    expect((await post(`/comearn/engagements/${engId}/crm`, {}, t.asha).expect(201)).body).toMatchObject({ dealId: c1.dealId, existed: true });
    await post(`/comearn/engagements/${engId}/crm`, {}, t.meera).expect(404);
    const d = (await post(`/comearn/engagements/${engId}/assist`, { kind: 'introduction' }, t.ravi).expect(200)).body;
    expect(d.provider).toBe('template'); expect(d.text).toMatch(/Plant head/); expect(d.label).toMatch(/send it yourself/);
  });

  it('featured listings sort first (admin only); opportunities keep the module they came from', async () => {
    const base = { type: 'dealer_development', category: 'industrial', description: 'Appoint dealers for our transformers in Andhra Pradesh and Telangana.', territory: 'AP & Telangana', model: 'fixed', fixedPaise: 25_000_00, trigger: 'agreement_signed', paymentDays: 30 };
    const a = (await post('/comearn/opportunities', { ...base, title: 'Transformer dealers — first listing' }, t.asha).expect(201)).body;
    const b = (await post('/comearn/opportunities', { ...base, title: 'Distributors for Venture AI product', source: { module: 'venture_ai', id: 'VR-2026-000001' } }, t.asha).expect(201)).body;
    for (const x of [a, b]) await publish(x.id);
    await put(`/admin/comearn/opportunities/${a.id}/feature`, { until: future }, t.asha).expect(403);
    await put(`/admin/comearn/opportunities/${a.id}/feature`, { until: future }, t.uniteAdmin).expect(200);
    const list = (await get('/comearn/opportunities?category=industrial', t.ravi).expect(200)).body.items;
    expect(list[0]).toMatchObject({ id: a.id, featured: true });
    expect(list.find((x: { id: string }) => x.id === b.id).source).toEqual({ module: 'venture_ai', id: 'VR-2026-000001' });
  });
});
