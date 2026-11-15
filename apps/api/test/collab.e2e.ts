/**
 * The core COLLABIZ journey, end to end on the real API:
 * What I have → What I need → Matching → Application → Proposal → Agreement → Execution → Earnings.
 * Sunrise Traders (verified) has an office and a trained team and publishes "40 seats seeking support contracts".
 * Deccan Distributors needs an outsourced support team, finds the offer through matching, applies, negotiates, and pays.
 */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { idemKey } from './flows';

const day = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
describe('COLLAB core journey', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const post = (path: string, tok: string, b: object = {}) => api(app).post(`/v1${path}`).set(auth(tok)).set('Idempotency-Key', idemKey('collab')).send(b);

  let officeId: string;
  it('1–2: owners and admins declare what they have and what they need; members cannot', async () => {
    const asset = { kind: 'office', title: 'Hyderabad office, 40 workstations', description: 'Fitted office with 40 workstations, 100 Mbps fibre and power backup.', city: 'Hyderabad', region: 'Telangana', capacity: 40, sectors: ['technology'], models: ['bpo_contract'] };
    officeId = (await post('/collab/assets', t.ravi, asset).expect(201)).body.id;
    await post('/collab/assets', t.ravi, { ...asset, kind: 'team', title: '30 trained support agents', description: 'English and Telugu speaking agents, two shifts, CRM trained.', capacity: 30 }).expect(201);
    await post('/collab/assets', t.ravi, { ...asset, kind: 'spaceship' }).expect(400);
    await post('/collab/assets', t.rohit, asset).expect(403); // Volt EPC member, not owner/admin
    await post('/collab/needs', t.ravi, { kind: 'outsourcing_contracts', description: 'Customer-support contracts for our Hyderabad team.', sectors: ['technology'], regions: ['Telangana'] }).expect(201);
    await post('/collab/needs', t.deepak, { kind: 'service_provider', description: 'An English-speaking support team for our dealer helpline.', sectors: ['technology'], regions: ['Telangana'], zeroUpfrontOnly: true }).expect(201);
    const p = (await api(app).get('/v1/collab/profile').set(auth(t.ravi)).expect(200)).body;
    expect(p.assets).toHaveLength(2); expect(p.needs).toHaveLength(1); expect(p.canEdit).toBe(true);
  });

  let offerId: string;
  it('4: a verified business publishes an offer; it is invisible until a moderator approves it with the checks done', async () => {
    const offer = { category: 'bpo_contract', side: 'offering', title: '40 seats and 30 trained agents for customer support', summary: 'Ready-to-go support desk in Hyderabad: 40 workstations, 30 trained agents, two shifts, CRM experience. Seeking customer-support contracts.', sector: 'technology', city: 'Hyderabad', region: 'Telangana', estimatedValue: 24_00_000_00, upfrontRequired: false, expiresOn: day(60), assetIds: [officeId] };
    await post('/business-offers', t.vikram, { ...offer, assetIds: [], submit: true }).expect(403); // unverified publisher
    await post('/business-offers', t.ravi, { ...offer, upfrontRequired: true }).expect(400);
    await post('/business-offers', t.ravi, { ...offer, assetIds: ['00000000-0000-4000-8000-000000000000'] }).expect(400);
    const o = (await post('/business-offers', t.ravi, { ...offer, submit: true }).expect(201)).body;
    offerId = o.id;
    expect(o).toMatchObject({ status: 'pending_verification', categoryLabel: 'BPO / customer-support contract', isOwner: true });
    await post('/business-offers', t.ravi, offer).expect(409); // duplicate
    await api(app).get(`/v1/business-offers/${offerId}`).set(auth(t.deepak)).expect(404);
    expect((await api(app).get('/v1/business-offers').set(auth(t.deepak)).expect(200)).body.items).toHaveLength(0);
    await post(`/admin/business-offers/${offerId}/moderate`, t.ravi, { decision: 'approve', checks: ['publisher_kyb_verified'] }).expect(403);
    await post(`/admin/business-offers/${offerId}/moderate`, t.superadmin, { decision: 'approve', checks: [] }).expect(400);
    const m = (await post(`/admin/business-offers/${offerId}/moderate`, t.superadmin, { decision: 'approve', checks: ['publisher_kyb_verified', 'duplicate_check_done'] }).expect(200)).body;
    expect(m.status).toBe('active');
    expect(m.checks).toEqual(['Publisher’s business verification (KYB) is complete', 'Checked for duplicate listings']);
    const list = (await api(app).get('/v1/business-offers?zeroUpfront=1&category=bpo_contract').set(auth(t.deepak)).expect(200)).body;
    expect(list.items.map((x: any) => x.id)).toEqual([offerId]);
    // One canonical opportunity record: the same offer is in the main marketplace too.
    expect((await pool.query("select route, status, listed from opportunities where id = $1", [offerId])).rows[0]).toEqual({ route: 'partner_listing', status: 'qualification', listed: true });
  });

  it('3: matching explains why — Deccan’s need finds the offer; Sunrise (a competitor with seats) is not matched to its own kind', async () => {
    const d = (await api(app).get('/v1/collab/matches').set(auth(t.deepak)).expect(200)).body;
    const hit = d.offers.find((x: any) => x.offer.id === offerId);
    expect(hit.reasons.map((r: any) => r.code)).toEqual(expect.arrayContaining(['need', 'sector', 'region', 'zero_upfront']));
    expect(hit.score).toBe(hit.reasons.reduce((s: number, r: any) => s + r.points, 0));
    expect(d.partners.map((p: any) => p.resource.title)).toContain('30 trained support agents'); // reverse match on Deccan's need
    const s = (await api(app).get('/v1/collab/matches').set(auth(t.ravi)).expect(200)).body;
    expect(s.offers.find((x: any) => x.offer.id === offerId)).toBeUndefined(); // own offer
    expect((await api(app).get('/v1/collab/matches').set(auth(t.meera)).expect(200)).body.empty).toBe(true);
  });

  let appId: string;
  it('5: application; proposals open only after the publisher shortlists', async () => {
    appId = (await post(`/opportunities/${offerId}/apply`, t.deepak, { message: 'We need a support desk for 1,200 dealers, Mon–Sat, 9am–7pm IST.', proposedValue: 18_00_000_00 }).expect(201)).body.id;
    const room0 = (await api(app).get(`/v1/collab/applications/${appId}/room`).set(auth(t.deepak)).expect(200)).body;
    expect(room0).toMatchObject({ side: 'applicant', stage: 'application', can: { propose: false } });
    await api(app).get(`/v1/collab/applications/${appId}/room`).set(auth(t.asha)).expect(404); // not a party
    await post(`/collab/applications/${appId}/proposals`, t.deepak, terms()).expect(409);
    await post(`/opportunities/${offerId}/applications/${appId}/decision`, t.ravi, { status: 'shortlisted', reason: 'Good fit for our second shift' }).expect(200);
  });

  const terms = (over: object = {}) => ({ scope: 'Inbound dealer support desk: calls, WhatsApp and email, 12 agents, Mon–Sat 9am–7pm IST.', deliverables: 'Daily call log, weekly SLA report, monthly QA scorecard', pricingModel: 'monthly_retainer', value: 21_60_000_00, paymentTerms: 'Monthly in arrears, 15 days', durationMonths: 12, startDate: day(20), payer: 'applicant', ...over });
  let contractId: string;
  it('6–7: proposal rounds alternate; only the receiver accepts; acceptance generates an approved agreement in Contracts', async () => {
    const r1 = (await post(`/collab/applications/${appId}/proposals`, t.deepak, terms({ value: 18_00_000_00 })).expect(201)).body;
    await post(`/collab/applications/${appId}/proposals`, t.deepak, terms()).expect(409); // not their turn
    await post(`/collab/proposals/${r1.id}/accept`, t.deepak).expect(403); // own proposal
    await post(`/collab/applications/${appId}/proposals`, t.ravi, terms({ pricingModel: 'barter' })).expect(400);
    const r2 = (await post(`/collab/applications/${appId}/proposals`, t.ravi, terms()).expect(201)).body; // counter at 21.6 lakh
    expect((await pool.query('select status from business_offers where opportunity_id = $1', [offerId])).rows[0].status).toBe('negotiating');
    const room = (await api(app).get(`/v1/collab/applications/${appId}/room`).set(auth(t.deepak)).expect(200)).body;
    expect(room.rounds.map((x: any) => x.status)).toEqual(['superseded', 'sent']);
    expect(room.can).toMatchObject({ accept: true, propose: true });
    expect(room.money).toEqual({ pipelineValue: 21_60_000_00, contractValue: 0, invoiced: 0, collected: 0 });
    const acc = (await post(`/collab/proposals/${r2.id}/accept`, t.deepak).expect(200)).body;
    contractId = acc.contractId;
    await post(`/collab/proposals/${r2.id}/accept`, t.deepak).expect(409);
    const c = (await api(app).get(`/v1/contracts/${contractId}`).set(auth(t.ravi)).expect(200)).body;
    expect(c).toMatchObject({ status: 'approved', value: 21_60_000_00 });
    expect((await pool.query('select issuer_org_id = (select id from organizations where display_name = $2) as payer_issues from contracts where id = $1', [contractId, 'Deccan Distributors'])).rows[0].payer_issues).toBe(true);
    expect((await pool.query('select status from opportunity_applications where id = $1', [appId])).rows[0].status).toBe('accepted');
  });

  let projectId: string;
  it('8: both sign, the client starts the project, the provider delivers, the client certifies and pays — earnings stay separated', async () => {
    const c = (await api(app).get(`/v1/contracts/${contractId}`).set(auth(t.deepak)).expect(200)).body;
    const hash = c.versions[c.versions.length - 1].bodyHash;
    await post(`/contracts/${contractId}/sign`, t.ravi, { typedName: 'Ravi Shah', consent: true, bodyHash: hash }).expect(200);
    expect((await post(`/contracts/${contractId}/sign`, t.deepak, { typedName: 'Deepak Rao', consent: true, bodyHash: hash }).expect(200)).body.status).toBe('executed');
    await post(`/contracts/${contractId}/project`, t.ravi, { startDate: day(20), endDate: day(385) }).expect(403); // provider cannot start it
    projectId = (await post(`/contracts/${contractId}/project`, t.deepak, { startDate: day(20), endDate: day(385) }).expect(201)).body.id;
    const ms = [];
    for (let i = 1; i <= 12; i++) ms.push((await post(`/projects/${projectId}/milestones`, t.ravi, { title: `Month ${i} support desk`, dueDate: day(20 + 30 * i), amount: 1_80_000_00, requiresInspection: 'none' }).expect(201)).body);
    const m = ms[0];
    await post(`/projects/${projectId}/activate`, t.deepak).expect(200);
    await post(`/projects/${projectId}/milestones/${m.id}/start`, t.ravi).expect(200);
    await api(app).post(`/v1/projects/${projectId}/updates`).set(auth(t.ravi)).field('note', 'Month 1 complete: 9,840 calls, 94% answered within 30 s.').field('progressPct', '100').field('milestoneId', m.id)
      .attach('files', Buffer.from('%PDF-1.4 sla report'), { filename: 'sla.pdf', contentType: 'application/pdf' }).expect(201);
    await post(`/projects/${projectId}/milestones/${m.id}/submit`, t.ravi, { note: 'Month 1 SLA report attached for certification.' }).expect(200);
    await post(`/projects/${projectId}/milestones/${m.id}/certify`, t.deepak, { decision: 'certify', note: 'SLA met for month 1' }).expect(200);
    const inv = (await post(`/projects/${projectId}/milestones/${m.id}/invoice`, t.ravi).expect(201)).body;
    let w = (await api(app).get('/v1/collab/workspace').set(auth(t.ravi)).expect(200)).body;
    expect(w.items[0]).toMatchObject({ side: 'publisher', role: 'provider', stage: 'execution', money: { pipelineValue: 0, contractValue: 21_60_000_00, invoiced: 1_80_000_00, collected: 0 } });
    expect(w.totals.toReceive).toBe(1_80_000_00);
    await post(`/projects/${projectId}/invoices/${inv.id}/paid`, t.deepak, { paymentReference: 'UTR-DECCAN-0001' }).expect(200);
    w = (await api(app).get('/v1/collab/workspace').set(auth(t.ravi)).expect(200)).body;
    expect(w.items[0].money.collected).toBe(1_80_000_00);
    expect(w.totals.toReceive).toBe(0);
    const d = (await api(app).get('/v1/collab/workspace').set(auth(t.deepak)).expect(200)).body;
    expect(d.items[0]).toMatchObject({ side: 'applicant', role: 'client' });
    expect(d.totals.toPay).toBe(0);
  });

  it('lifecycle: closing, expiry and renewal; regulated categories are discovery only', async () => {
    await pool.query("update business_offers set expires_on = current_date - 1 where opportunity_id = $1", [offerId]);
    expect((await api(app).get('/v1/business-offers').set(auth(t.deepak)).expect(200)).body.items).toHaveLength(0);
    const mine = (await api(app).get('/v1/business-offers/mine').set(auth(t.ravi)).expect(200)).body;
    expect(mine[0]).toMatchObject({ status: 'expired', applicants: 1 });
    expect((await post(`/business-offers/${offerId}/renew`, t.ravi, { expiresOn: day(90) }).expect(200)).body).toMatchObject({ status: 'pending_verification', renewals: 1 });
    const sale = (await post('/business-offers', t.asha, { category: 'business_for_sale', side: 'offering', title: 'Profitable EPC business for sale', summary: 'Operating EPC firm with order book, team and equipment, seeking a buyer for a majority stake.', sector: 'construction_epc', upfrontRequired: false, expiresOn: day(30), submit: true }).expect(201)).body;
    expect(sale.regulated).toBe(true);
    expect(sale.notice).toMatch(/discovery only/);
  });
});
