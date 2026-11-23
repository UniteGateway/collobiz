/** UNITE INDUSTRY CLUB — Terms and Conditions, legal drafts with counsel approval, and member-to-member virtual agreements. */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('Unite Industry Club agreements', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const get = (path: string, tok?: string) => (tok ? api(app).get(`/v1${path}`).set(auth(tok)) : api(app).get(`/v1${path}`));
  const post = (path: string, tok: string, b: object = {}) => api(app).post(`/v1${path}`).set(auth(tok)).send(b);
  const join = (tok: string, country = 'IN') => api(app).put('/v1/join/profile').set(auth(tok)).send({ sector: 'manufacturing', intents: ['solar_products', 'export_import'], country }).expect(200);

  it('publishes the Terms and Conditions and the legal drafts, clearly marked until counsel approves', async () => {
    const terms = (await get('/public/club/terms').expect(200)).body;
    expect(terms.title).toMatch(/Membership Terms and Conditions/);
    expect(terms.counselApproved).toBe(false);
    expect(terms.body).toMatch(/^PILOT DRAFT/);
    expect(terms.body).toMatch(/Unite Developers Global Inc\./); // operator filled in, no blanks
    expect(terms.body).not.toMatch(/\{\{/);
    const lib = (await get('/public/club/legal').expect(200)).body.items.map((x: { code: string }) => x.code);
    expect(lib).toEqual(expect.arrayContaining(['club_terms', 'club_brand_licence', 'club_nda', 'club_distribution', 'club_mou']));
  });

  it('only the owner or an admin accepts the terms, typing the registered name; acceptance is per version', async () => {
    const v = (await get('/club/terms', t.asha).expect(200)).body.version;
    await post('/club/terms/accept', t.rohit, { typedName: 'Rohit', version: v }).expect(403);
    await post('/club/terms/accept', t.asha, { typedName: 'Someone Else', version: v }).expect(409);
    await post('/club/terms/accept', t.asha, { typedName: 'Asha Patil', version: v + 1 }).expect(409);
    await post('/club/terms/accept', t.asha, { typedName: 'Asha Patil', version: v }).expect(201);
    await post('/club/terms/accept', t.asha, { typedName: 'Asha Patil', version: v }).expect(409);
    expect((await get('/club/terms', t.asha).expect(200)).body.accepted.by).toBe('Asha Patil');
  });

  let ndaId: string;
  it('members send each other agreements by club code — NDA, distribution for any countries, MoU', async () => {
    await join(t.asha); await join(t.ravi, 'AE');
    const ravi = (await get('/club/agreements', t.ravi).expect(200)).body.memberCode;
    expect(ravi).toMatch(/^UIC-\d{6}$/);
    const nda = { type: 'nda', counterpartyCode: ravi, dispute: 'uae', termMonths: 24, purpose: 'Evaluate a joint solar cold-chain product for the Gulf market.' };
    // Ravi has not accepted the terms, but Asha has; Asha's own terms are what matter for sending
    await post('/club/agreements', t.asha, { ...nda, counterpartyCode: 'UIC-000000' }).expect(404);
    const sent = (await post('/club/agreements', t.asha, nda).expect(201)).body;
    expect(sent.pilotDraft).toBe(true);
    ndaId = sent.id;
    const body = (await pool.query('select body from contract_versions where contract_id = $1', [sent.id])).rows[0].body as string;
    expect(body).toMatch(/MUTUAL NON-DISCLOSURE AGREEMENT/); expect(body).toMatch(/Volt EPC Private Limited/); expect(body).toMatch(/Sunrise Electricals & Traders LLP/);
    expect(body).toMatch(/Dubai International Arbitration Centre/); expect(body).toMatch(/24 months/); expect(body).not.toMatch(/\{\{/);
    // Distribution into several countries, any currency and Incoterm
    await post('/club/agreements', t.asha, { type: 'distribution', counterpartyCode: ravi, dispute: 'singapore', termMonths: 36, products: 'Solar cold rooms 5 MT and 10 MT', territory: ['AE', 'XX'], currency: 'USD', incoterm: 'CIF', paymentTerms: '30% advance, balance against documents' }).expect(400);
    const dist = (await post('/club/agreements', t.asha, { type: 'distribution', counterpartyCode: ravi, dispute: 'singapore', termMonths: 36, products: 'Solar cold rooms 5 MT and 10 MT', territory: ['AE', 'SA', 'KE'], exclusive: true, currency: 'USD', incoterm: 'CIF', paymentTerms: '30% advance, balance against documents' }).expect(201)).body;
    const dBody = (await pool.query('select body from contract_versions where contract_id = $1', [dist.id])).rows[0].body as string;
    expect(dBody).toMatch(/exclusive distributor/); expect(dBody).toMatch(/United Arab Emirates, Saudi Arabia, Kenya/); expect(dBody).toMatch(/CIF \(Incoterms/);
    // Both sides see it in their list; nobody else does
    const mine = (await get('/club/agreements', t.ravi).expect(200)).body.items;
    expect(mine.map((x: { direction: string }) => x.direction)).toEqual(['received', 'received']);
    expect((await get('/club/agreements', t.meera).expect(200)).body.items).toHaveLength(0);
    // Only owners/admins create agreements
    await post('/club/agreements', t.rohit, nda).expect(403);
  });

  it('agreements are signed in Contracts, bound to the exact text; Unite is not a party', async () => {
    const c = (await get(`/contracts/${ndaId}`, t.ravi).expect(200)).body;
    const hash = c.versions.find((v: { approvedAt: string | null }) => v.approvedAt).bodyHash;
    const sign = (tok: string, name: string, h = hash) => api(app).post(`/v1/contracts/${ndaId}/sign`).set(auth(tok)).set('Idempotency-Key', `nda-${name}-${h.slice(0, 6)}`).send({ typedName: name, consent: true, bodyHash: h });
    await sign(t.ravi, 'Ravi Patel', 'a'.repeat(64)).expect(409); // signed text must be the text shown
    await sign(t.ravi, 'Ravi Patel').expect(200);
    await sign(t.asha, 'Asha Patil').expect(200);
    expect((await get(`/contracts/${ndaId}`, t.asha).expect(200)).body.status).toBe('executed');
    await get(`/contracts/${ndaId}`, t.meera).expect(404);
  });

  it('counsel approval is recorded by a super admin for an exact version; later documents drop the draft notice', async () => {
    await post('/admin/club/templates/club_nda/counsel-approval', t.uniteAdmin, { counsel: 'Adv. K. Rao' }).expect(403);
    const r = (await post('/admin/club/templates/club_nda/counsel-approval', t.superadmin, { counsel: 'Adv. K. Rao, Hyderabad', note: 'Approved for pilot use.' }).expect(201)).body;
    expect(r.legalReviewed).toBe(true); expect(r.legalReviewedBy).toMatch(/K\. Rao/);
    await post('/admin/club/templates/club_nda/counsel-approval', t.superadmin, { counsel: 'Again' }).expect(409);
    const ravi = (await get('/club/agreements', t.ravi).expect(200)).body.memberCode;
    const again = (await post('/club/agreements', t.asha, { type: 'nda', counterpartyCode: ravi, dispute: 'india', termMonths: 12, purpose: 'Share pricing for a joint tender in Telangana.' }).expect(201)).body;
    expect(again.pilotDraft).toBe(false);
    const body = (await pool.query('select body from contract_versions where contract_id = $1', [again.id])).rows[0].body as string;
    expect(body).not.toMatch(/PILOT DRAFT/);
    const a = await pool.query("select action from audit_events where action like 'club.%' order by seq");
    expect(a.rows.map((x) => x.action)).toEqual(expect.arrayContaining(['club.terms_accepted', 'club.agreement_issued', 'club.template_counsel_approved']));
  });
});
