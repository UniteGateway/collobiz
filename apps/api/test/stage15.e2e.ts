import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

/** Stages 15–16 gate — governed expansion: decisions by the right party, guidance labelled as guidance, regulated features off. */
describe('Stages 15–16 — international, alliances, regional settings, content and analytics', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('119 global portal lists international listings and market counts', async () => {
    const r = await api(app).get('/v1/global/overview').set(auth(t.asha)).expect(200);
    expect(r.body.opportunities.map((o: any) => o.code)).toEqual(expect.arrayContaining(['OPP-2026-00007', 'OPP-2026-00008']));
    expect(r.body.opportunities.every((o: any) => o.country !== 'IN')).toBe(true);
    expect(r.body.markets.find((m: any) => m.country === 'AE')).toMatchObject({ name: 'United Arab Emirates', opportunities: 1 });
  });

  it('120/121 country partnership: verified applicants only; staff decide, never their own org; exclusivity enforced', async () => {
    const plan = 'Year one: build a local stockist network, serve EPC contractors and route demand through Unite Exim with monthly reporting.';
    await api(app).post('/v1/global/country-partner/applications').set(auth(t.vikram)).send({ country: 'KE', sectors: ['solar'], localEntity: 'GreenBuild East Africa Ltd', localRegistration: 'PVT-KE-1182', teamSize: 4, plan }).expect(403);
    await api(app).post('/v1/global/country-partner/applications').set(auth(t.asha)).send({ country: 'IN', sectors: ['solar'], localEntity: 'Volt EPC', localRegistration: 'X-1', teamSize: 4, plan }).expect(400);
    const a = await api(app).post('/v1/global/country-partner/applications').set(auth(t.asha)).send({ country: 'KE', sectors: ['solar'], localEntity: 'Volt EPC Kenya Ltd', localRegistration: 'PVT-KE-2207', teamSize: 8, plan }).expect(201);
    await api(app).post('/v1/global/country-partner/applications').set(auth(t.asha)).send({ country: 'KE', sectors: ['solar'], localEntity: 'Volt EPC Kenya Ltd', localRegistration: 'PVT-KE-2207', teamSize: 8, plan }).expect(409);
    await api(app).post(`/v1/admin/global/country-partner/applications/${a.body.id}/decision`).set(auth(t.asha)).send({ decision: 'approved', reason: 'Approving my own company application' }).expect(403);
    // A staff member who also belongs to the applicant cannot decide
    const voltId = (await one("select id from organizations where display_name = 'Volt EPC'")).id;
    const sa = (await one("select id from users where email = 'superadmin@collabiz.local'")).id;
    await pool.query("insert into memberships (user_id, organization_id, role) values ($1, $2, 'org_member')", [sa, voltId]);
    const t2 = await loginAll(app);
    await api(app).post(`/v1/admin/global/country-partner/applications/${a.body.id}/decision`).set(auth(t2.superadmin)).send({ decision: 'approved', reason: 'Strong rooftop delivery record in India' }).expect(403);
    await pool.query("delete from memberships where user_id = $1 and organization_id = $2", [sa, voltId]);
    const dec = await api(app).post(`/v1/admin/global/country-partner/applications/${a.body.id}/decision`).set(auth(t.uniteAdmin)).send({ decision: 'approved', reason: 'Strong rooftop delivery record in India', exclusive: true, months: 24 });
    expect(dec.status).toBe(200);
    expect((await one('select membership_level from organizations where id = $1', [voltId])).membership_level).toBe('country_partner');
    const terr = await api(app).get('/v1/global/territory').set(auth(t.asha)).expect(200);
    expect(terr.body.territories[0]).toMatchObject({ country: 'KE', countryName: 'Kenya', exclusive: true });
    expect(terr.body.opportunities.map((o: any) => o.code)).toContain('OPP-2026-00008');
    // A second exclusive grant for the same country and sector is refused
    const b = await api(app).post('/v1/global/country-partner/applications').set(auth(t.meera)).send({ country: 'KE', sectors: ['solar'], localEntity: 'Meera Consulting Kenya', localRegistration: 'PVT-KE-9001', teamSize: 2, plan }).expect(201);
    await api(app).post(`/v1/admin/global/country-partner/applications/${b.body.id}/decision`).set(auth(t.uniteAdmin)).send({ decision: 'approved', reason: 'Second partner for the same market', exclusive: true }).expect(409);
    await api(app).post(`/v1/admin/global/country-partner/applications/${a.body.id}/decision`).set(auth(t.uniteAdmin)).send({ decision: 'rejected', reason: 'Deciding twice should fail' }).expect(409);
  });

  it('122/126 import/export: direction must match India; routed to Unite Exim; checklist is labelled guidance', async () => {
    await api(app).post('/v1/global/enquiries').set(auth(t.ravi)).send({ direction: 'import', product: 'Distribution transformers', quantity: '20 units', originCountry: 'IN', destinationCountry: 'AE' }).expect(400);
    const e = await api(app).post('/v1/global/enquiries').set(auth(t.ravi)).send({ direction: 'export', product: 'Distribution transformers 250 kVA', hsCode: '850423', quantity: '20 units', originCountry: 'IN', destinationCountry: 'KE', incoterm: 'CIF' }).expect(201);
    expect(e.body).toMatchObject({ routedTo: 'Unite Exim', status: 'open' });
    expect(e.body.code).toMatch(/^XB-\d{4}-\d{6}$/);
    const c = await api(app).get(`/v1/global/compliance?enquiryId=${e.body.id}`).set(auth(t.ravi)).expect(200);
    expect(c.body.items.map((i: any) => i.key)).toEqual(expect.arrayContaining(['iec', 'gst_lut', 'pvoc']));
    expect(c.body.items.map((i: any) => i.key)).not.toContain('saber');
    expect(c.body.disclaimer).toMatch(/not legal or customs advice/);
    await api(app).put(`/v1/global/enquiries/${e.body.id}/checklist`).set(auth(t.ravi)).send({ done: ['iec', 'made-up'] }).expect(200).expect((r) => expect(r.body.done).toEqual(['iec']));
    await api(app).get(`/v1/global/compliance?enquiryId=${e.body.id}`).set(auth(t.asha)).expect(404);
    await api(app).post(`/v1/global/enquiries/${e.body.id}/respond`).set(auth(t.asha)).send({ response: 'Trying to answer an enquiry not routed to me.' }).expect(404);
    // Unite Exim handles routed enquiries: give Sanjay an Exim membership and act as Exim.
    const exim = (await one("select id from organizations where display_name = 'Unite Exim'")).id;
    const sanjay = (await one("select id from users where email = 'unite.admin@collabiz.local'")).id;
    await pool.query("insert into memberships (user_id, organization_id, role) values ($1, $2, 'org_admin') on conflict do nothing", [sanjay, exim]);
    await api(app).post(`/v1/global/enquiries/${e.body.id}/respond`).set(auth(t.uniteAdmin, exim)).send({ response: 'We can consolidate in Mundra and arrange PVoC inspection; indicative freight shared separately.' }).expect(200);
    expect((await api(app).get('/v1/global/enquiries').set(auth(t.ravi)).expect(200)).body[0]).toMatchObject({ status: 'quoted', mine: true });
  });

  it('123 alliances: only the receiving organization decides; acceptance points to Contracts', async () => {
    const list = await api(app).get('/v1/alliances').set(auth(t.asha)).expect(200);
    const incoming = list.body.proposals.find((p: any) => p.code === 'ALL-2026-30418');
    expect(incoming).toMatchObject({ incoming: true, proposer: 'Deccan Distributors' });
    await api(app).post(`/v1/alliances/${incoming.id}/decision`).set(auth(t.deepak)).send({ decision: 'accepted', reason: 'Accepting my own proposal' }).expect(403);
    await api(app).post(`/v1/alliances/${incoming.id}/decision`).set(auth(t.meera)).send({ decision: 'accepted', reason: 'Not a party' }).expect(404);
    await api(app).post(`/v1/alliances/${incoming.id}/decision`).set(auth(t.asha)).send({ decision: 'in_discussion', reason: 'Interested; let us meet next week' }).expect(200);
    const acc = await api(app).post(`/v1/alliances/${incoming.id}/decision`).set(auth(t.asha)).send({ decision: 'accepted', reason: 'Agreed in principle' }).expect(200);
    expect(acc.body.next).toMatch(/nothing is binding until both parties sign/);
    await api(app).post(`/v1/alliances/${incoming.id}/decision`).set(auth(t.asha)).send({ decision: 'declined', reason: 'Changing my mind' }).expect(409);
    const target = list.body.targets.find((x: any) => x.name === 'Sunrise Traders');
    await api(app).post('/v1/alliances').set(auth(t.vikram)).send({ kind: 'distribution', targetOrgId: target.id, title: 'Distribution deal', rationale: 'We would like to distribute your products across Karnataka state.', scope: 'Exclusive distribution in Karnataka for two years', markets: ['IN'], sectors: ['trading'], durationMonths: 24 }).expect(403);
    await api(app).post('/v1/alliances').set(auth(t.asha)).send({ kind: 'distribution', targetOrgId: target.id, title: 'Gulf distribution of rooftop kits', rationale: 'Volt EPC kits paired with Sunrise’s Gulf logistics for EPCs building carport solar.', scope: 'Sunrise distributes Volt rooftop kits in the UAE for two years', markets: ['AE'], sectors: ['solar'], proposerSharePct: 60, durationMonths: 24 }).expect(201);
  });

  it('125 investor data room stays switched off pending regulatory review', async () => {
    const r = await api(app).get('/v1/data-room').set(auth(t.meera)).expect(200);
    expect(r.body).toMatchObject({ featureDisabled: true });
    expect(r.body.reason).toMatch(/regulatory review/);
  });

  it('146 regional settings: available languages only; currencies need a dated rate; money stays in INR', async () => {
    const r = await api(app).get('/v1/me/regional').set(auth(t.asha)).expect(200);
    expect(r.body.preferences.currency).toBe('INR');
    expect(r.body.rates.find((x: any) => x.currency === 'USD').inrPerUnit).toBeGreaterThan(0);
    expect(r.body.note).toMatch(/settled in INR/);
    await api(app).put('/v1/me/regional').set(auth(t.asha)).send({ language: 'hi-IN', currency: 'USD', timezone: 'Asia/Kolkata', dateStyle: 'dmy' }).expect(400);
    await api(app).put('/v1/me/regional').set(auth(t.asha)).send({ language: 'en-IN', currency: 'NGN', timezone: 'Asia/Kolkata', dateStyle: 'dmy' }).expect(400); // no rate
    await api(app).put('/v1/me/regional').set(auth(t.asha)).send({ language: 'en-IN', currency: 'USD', timezone: 'Mars/Olympus', dateStyle: 'dmy' }).expect(400);
    const ok = await api(app).put('/v1/me/regional').set(auth(t.asha)).send({ language: 'en-IN', currency: 'AED', timezone: 'Asia/Dubai', dateStyle: 'ymd' }).expect(200);
    expect(ok.body.preferences).toMatchObject({ currency: 'AED', timezone: 'Asia/Dubai' });
    await api(app).post('/v1/admin/fx-rates').set(auth(t.asha)).send({ currency: 'NGN', inrPerUnit: 0.055, asOf: '2026-11-08', source: 'Partner guess' }).expect(403);
    await api(app).post('/v1/admin/fx-rates').set(auth(t.finance)).send({ currency: 'NGN', inrPerUnit: 0.055, asOf: '2026-11-08', source: 'Reference rate entered by Unite finance' }).expect(201);
  });

  it('142 content: versioned with history; policy pages need a super admin; help reads published pages', async () => {
    await api(app).put('/v1/admin/content').set(auth(t.asha)).send({ slug: 'refund-policy', kind: 'policy', title: 'Refunds', body: 'Partners can never be charged recruitment fees.' }).expect(403);
    const d = await api(app).put('/v1/admin/content').set(auth(t.uniteAdmin)).send({ slug: 'partner-fees-policy', kind: 'policy', title: 'Partner fees', body: 'COLLABIZ never charges partners recruitment fees.', publish: true }).expect(403);
    expect(d.body.message).toMatch(/super admin/);
    const v1 = await api(app).put('/v1/admin/content').set(auth(t.uniteAdmin)).send({ slug: 'partner-fees-policy', kind: 'policy', title: 'Partner fees', body: 'COLLABIZ never charges partners recruitment fees.' }).expect(200);
    expect(v1.body).toMatchObject({ status: 'draft', version: 1 });
    await api(app).get('/v1/public/content/partner-fees-policy').expect(404); // drafts are not public
    const v2 = await api(app).put('/v1/admin/content').set(auth(t.superadmin)).send({ slug: 'partner-fees-policy', kind: 'policy', title: 'Partner fees', body: 'COLLABIZ never charges partners any recruitment or listing fees.', note: 'Legal review', publish: true }).expect(200);
    expect(v2.body).toMatchObject({ status: 'published', version: 2 });
    expect((await api(app).get('/v1/public/content/partner-fees-policy').expect(200)).body.body).toMatch(/listing fees/);
    expect((await api(app).get(`/v1/admin/content/${v2.body.id}/revisions`).set(auth(t.superadmin)).expect(200)).body.map((r: any) => r.version)).toEqual([2, 1]);
    const help = await api(app).get('/v1/help/articles').set(auth(t.meera)).expect(200);
    expect(help.body.map((h: any) => h.id)).toContain('how-reputation-works'); // from managed content
  });

  it('139 analytics: staff only; aggregates with a monthly series', async () => {
    await api(app).get('/v1/admin/analytics').set(auth(t.asha)).expect(403);
    const r = await api(app).get('/v1/admin/analytics?months=6').set(auth(t.superadmin)).expect(200);
    expect(r.body.funnel.verified).toBeGreaterThan(0);
    expect(r.body.funnel.registered).toBeGreaterThanOrEqual(r.body.funnel.verified);
    expect(r.body.series).toHaveLength(6);
    expect(r.body.projects.certified).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(r.body)).not.toMatch(/@/); // no emails or personal identifiers
  });
});
