import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

/** Unite Group businesses: every venture can be promoted, regulated ones stay locked, partners ask, Unite approves. */
describe('Unite Group businesses (ventures)', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  let n = 0;
  const idem = () => ({ 'Idempotency-Key': `v-${++n}-${Date.now()}` });
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('all 55 businesses (47 portfolio + BIZO + 5 Unite brand products + Sunora Paints + UNIECO) are loaded across sectors, not only solar; regulated ones are hidden from partners and the public', async () => {
    const admin = await api(app).get('/v1/admin/ventures').set(auth(t.uniteAdmin)).expect(200);
    expect(admin.body).toHaveLength(55);
    expect(new Set(admin.body.map((v: any) => v.sector)).size).toBeGreaterThanOrEqual(10);
    expect(admin.body.filter((v: any) => v.regulated).map((v: any) => v.slug)).toEqual(expect.arrayContaining(['unite-digital-bank', 'bestpe', 'universal-trade-coin', 'payslip-app']));
    const partner = await api(app).get('/v1/ventures').set(auth(t.asha)).expect(200);
    expect(partner.body.length).toBe(55 - admin.body.filter((v: any) => v.regulated).length);
    expect(partner.body.some((v: any) => v.slug === 'universal-trade-coin')).toBe(false);
    await api(app).get('/v1/ventures/universal-trade-coin').set(auth(t.asha)).expect(404);
    const pub = await api(app).get('/v1/public/ventures').expect(200);
    expect(pub.body.every((v: any) => v.open)).toBe(true);
    expect(pub.body.map((v: any) => v.slug)).toEqual(expect.arrayContaining(['wakin', 'nano-bazar', 'unite-learning', 'solcart', 'unite-powertek']));
    expect(pub.body.every((v: any) => !('roles' in v) && !('rating' in v) && !('regulatedReason' in v))).toBe(true);
    expect(admin.body.find((v: any) => v.slug === 'unite-powertek')).toMatchObject({ company: 'Powertek', stage: 'live' });
  });

  it('a verified partner asks to promote an open business with roles it needs; closed or regulated ones are refused', async () => {
    await api(app).post('/v1/ventures/zuppo/interest').set(auth(t.ravi)).send({ roles: ['recruit_members'], message: 'We can bring personal shoppers in Ahmedabad.' }).expect(409); // coming soon
    await api(app).post('/v1/ventures/bestpe/interest').set(auth(t.ravi)).send({ roles: ['recruit_merchants'], message: 'We know many small merchants in Gujarat.' }).expect(404); // regulated: hidden
    await api(app).post('/v1/ventures/nano-bazar/interest').set(auth(t.vikram)).send({ roles: ['recruit_merchants'], message: 'Our unverified company wants to recruit merchants.' }).expect(403);
    await api(app).post('/v1/ventures/nano-bazar/interest').set(auth(t.ravi)).send({ roles: ['create_content'], message: 'We can make videos for Nano Bazar sellers.' }).expect(400); // not a role it needs
    const ok = await api(app).post('/v1/ventures/nano-bazar/interest').set(auth(t.ravi)).send({ roles: ['recruit_merchants'], regions: ['IN-GJ'], message: 'We supply 300 shops in Ahmedabad and can onboard them as Nano Bazar sellers.' }).expect(200);
    expect(ok.body.status).toBe('pending');
    const note = await one("select count(*)::int n from notifications n join users u on u.id = n.user_id where n.kind = 'venture' and u.email = 'unite.admin@collabiz.local'");
    expect(note.n).toBeGreaterThan(0);
    const me = await api(app).get('/v1/ventures/nano-bazar').set(auth(t.ravi)).expect(200);
    expect(me.body.myInterest.status).toBe('pending');
  });

  it('Unite approves promoters; an offer for the business can go to its approved promoters only', async () => {
    const v = (await api(app).get('/v1/admin/ventures').set(auth(t.uniteAdmin)).expect(200)).body.find((x: any) => x.slug === 'nano-bazar');
    const det = await api(app).get(`/v1/admin/ventures/${v.id}`).set(auth(t.uniteAdmin)).expect(200);
    const req = det.body.interests.find((i: any) => i.partner === 'Sunrise Traders');
    await api(app).post(`/v1/admin/ventures/${v.id}/interests/${req.id}/decide`).set(auth(t.asha)).send({ decision: 'approved', note: 'Partner trying' }).expect(403);
    await api(app).post(`/v1/admin/ventures/${v.id}/interests/${req.id}/decide`).set(auth(t.uniteAdmin)).send({ decision: 'approved', note: 'Strong Gujarat retail network' }).expect(200);
    await api(app).post(`/v1/admin/ventures/${v.id}/interests/${req.id}/decide`).set(auth(t.uniteAdmin)).send({ decision: 'declined', note: 'Changed mind' }).expect(409);
    const pre = await api(app).post('/v1/admin/offers/audience').set(auth(t.uniteAdmin)).send({ target: { mode: 'promoters' }, ventureId: v.id }).expect(200);
    expect(pre.body.partners.map((p: any) => p.name)).toEqual(['Sunrise Traders']);
    const o = await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send({
      ventureId: v.id, title: 'Onboard 50 shops to Nano Bazar in Ahmedabad', summary: 'Bring local shops online on Nano Bazar; a fixed fee is paid for every shop that publishes its first ten products.', kind: 'marketing', sector: 'local_commerce', regions: ['IN-GJ'],
      target: { mode: 'promoters' }, pricing: 'unite_price', uniteReward: { model: 'fixed_fee', amount: 500_00 }, rewardModels: ['fixed_fee'], maxSelections: 3, deadline: new Date(Date.now() + 10 * 86400_000).toISOString(),
    }).expect(201);
    expect(o.body).toMatchObject({ recipients: 1, venture: { slug: 'nano-bazar', name: 'Nano Bazar' } });
    const mine = await api(app).get('/v1/offers').set(auth(t.ravi)).expect(200);
    expect(mine.body.find((x: any) => x.id === o.body.id).venture.name).toBe('Nano Bazar');
    expect((await api(app).get('/v1/offers').set(auth(t.asha)).expect(200)).body.find((x: any) => x.id === o.body.id)).toBeUndefined();
    const vd = await api(app).get('/v1/ventures/nano-bazar').set(auth(t.ravi)).expect(200);
    expect(vd.body.offers.map((x: any) => x.id)).toContain(o.body.id);
    await api(app).post('/v1/admin/offers/audience').set(auth(t.uniteAdmin)).send({ target: { mode: 'promoters' } }).expect(400); // no business chosen
  });

  it('closed or regulated businesses cannot be offered or opened; a super admin records clearance first', async () => {
    const list = (await api(app).get('/v1/admin/ventures').set(auth(t.uniteAdmin)).expect(200)).body;
    const zuppo = list.find((x: any) => x.slug === 'zuppo');
    const udb = list.find((x: any) => x.slug === 'unite-digital-bank');
    const base = { title: 'Pilot offer for a closed business', summary: 'This offer should be refused because the business is not open to partners yet.', kind: 'marketing', sector: 'local_commerce', target: { mode: 'all' }, pricing: 'partner_quote', rewardModels: ['fixed_fee'], deadline: new Date(Date.now() + 5 * 86400_000).toISOString() };
    await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send({ ...base, ventureId: zuppo.id }).expect(409);
    await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send({ ...base, ventureId: udb.id, sector: 'financial_services' }).expect(409);
    const refused = await api(app).patch(`/v1/admin/ventures/${udb.id}`).set(auth(t.uniteAdmin)).send({ open: true }).expect(409);
    expect(refused.body.message).toMatch(/needs regulatory review/);
    await api(app).post(`/v1/admin/ventures/${udb.id}/clearance`).set(auth(t.uniteAdmin)).send({ note: 'Legal opinion received from counsel' }).expect(403); // super admin only
    await api(app).post(`/v1/admin/ventures/${udb.id}/clearance`).set(auth(t.superadmin)).send({ note: 'Bank partner agreement and legal opinion on file (ref LO-2026-118)' }).expect(200);
    await api(app).patch(`/v1/admin/ventures/${udb.id}`).set(auth(t.uniteAdmin)).send({ open: true, stage: 'pilot' }).expect(200);
    expect((await api(app).get('/v1/ventures').set(auth(t.asha)).expect(200)).body.some((v: any) => v.slug === 'unite-digital-bank')).toBe(true);
    // opening a coming-soon business; a group company admin cannot change another company's business
    await api(app).patch(`/v1/admin/ventures/${zuppo.id}`).set(auth(t.uniteAdmin)).send({ open: true }).expect(200);
    const powertek = list.find((x: any) => x.slug === 'unite-powertek');
    await api(app).patch(`/v1/admin/ventures/${powertek.id}`).set(auth(t.uniteAdmin)).send({ stage: 'pilot' }).expect(403); // Unite Solar admin, Powertek business
    const audit = await one("select count(*)::int n from audit_events where action in ('venture.cleared', 'venture.updated')");
    expect(audit.n).toBeGreaterThanOrEqual(3);
  });

  it('the new sectors work in offers (Unite Learning in Education)', async () => {
    const v = (await api(app).get('/v1/admin/ventures').set(auth(t.uniteAdmin)).expect(200)).body.find((x: any) => x.slug === 'unite-learning');
    const o = await api(app).post('/v1/admin/offers').set(auth(t.uniteAdmin)).set(idem()).send({
      ventureId: v.id, title: 'Bring colleges to Unite Learning AI-tools programmes', summary: 'Introduce colleges and schools to Unite Learning technology and AI-tools programmes; fixed fee per signed institution.', kind: 'marketing', sector: 'education',
      target: { mode: 'all' }, pricing: 'unite_price', uniteReward: { model: 'fixed_fee', amount: 25_000_00 }, rewardModels: ['fixed_fee'], maxSelections: 10, deadline: new Date(Date.now() + 10 * 86400_000).toISOString(),
    }).expect(201);
    expect(o.body.sector).toBe('education');
  });
  it('public product pages list every non-locked business and take enquiries that reach the business admin', async () => {
    const all = await api(app).get('/v1/public/products').expect(200);
    const admin = await api(app).get('/v1/admin/ventures').set(auth(t.uniteAdmin)).expect(200);
    expect(all.body.length).toBe(admin.body.filter((v: any) => !v.regulated || v.cleared).length);
    expect(all.body.some((v: any) => !v.open)).toBe(true); // coming-soon businesses are shown too
    expect(all.body.some((v: any) => v.slug === 'universal-trade-coin')).toBe(false);
    expect(all.body.every((v: any) => !('roles' in v) && !('rewardNote' in v))).toBe(true);
    await api(app).get('/v1/public/products/bestpe').expect(404);
    const p = await api(app).get('/v1/public/products/sunite').expect(200);
    expect(p.body.related.every((x: any) => x.sector === p.body.sector && x.slug !== 'sunite')).toBe(true);
    const good = { kind: 'customer', name: 'Neha Shah', email: 'neha@example.com', phone: '+91 98200 11111', city: 'Surat', message: 'Please share a demo for our EPC team of 12 people.', consent: true };
    await api(app).post('/v1/public/products/sunite/enquiries').send({ ...good, website: 'spam.example' }).expect(400);
    await api(app).post('/v1/public/products/sunite/enquiries').send({ ...good, consent: false }).expect(400);
    await api(app).post('/v1/public/products/bestpe/enquiries').send(good).expect(404);
    const r = await api(app).post('/v1/public/products/sunite/enquiries').send(good).expect(201);
    expect(r.body.reference).toMatch(/^BIZ-\d{4}-\d{6}$/);
    const v = await one("select id from unite_ventures where slug = 'sunite'");
    const detail = await api(app).get(`/v1/admin/ventures/${v.id}`).set(auth(t.uniteAdmin)).expect(200);
    const e = detail.body.enquiries.find((x: any) => x.reference === r.body.reference);
    expect(e).toMatchObject({ kind: 'customer', name: 'Neha Shah', city: 'Surat', status: 'open' });
    await api(app).post(`/v1/admin/ventures/${v.id}/enquiries/${e.id}/status`).set(auth(t.asha)).send({ status: 'handled' }).expect(403);
    await api(app).post(`/v1/admin/ventures/${v.id}/enquiries/${e.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'handled' }).expect(201);
    expect((await one('select status from enquiries where id = $1', [e.id])).status).toBe('handled');
    const note = await one("select count(*)::int n from notifications where title like 'New enquiry for SUNITE%'");
    expect(note.n).toBeGreaterThan(0);
  });
  it('Wave 1: product-page solar leads, partner link attribution, CRM hand-off and micro-contracts posted through XPERT', async () => {
    // Partner link (Digital Seed): every partner has a personal code; a product link carries it.
    const mine = await api(app).get('/v1/ventures/sunite').set(auth(t.asha)).expect(200);
    expect(mine.body.myLink.path).toMatch(/^\/businesses\/sunite\?ref=[A-Z0-9]+$/);
    const code = mine.body.myLink.code;
    // Solar lead from SunX, under the partner's code, with a PDF bill and a roof photo
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
    const lead = (extra: Record<string, string> = {}) => {
      const f: Record<string, string> = { source: 'sunx', ref: code, name: 'Kiran Rao', phone: '9876501234', city: 'Vijayawada', region: 'IN-AP', segment: 'residential', siteType: 'Independent house', monthlyBill: '4200', consent: 'true', ...extra };
      let r = api(app).post('/v1/public/solar/leads');
      for (const [k, v] of Object.entries(f)) r = r.field(k, v);
      return r;
    };
    await lead({ website: 'bot' }).expect(400);
    await lead({ consent: 'false' }).expect(400);
    await lead({ source: 'bestpe' }).expect(400);
    const ok = await lead().attach('bill', pdf, { filename: 'bill.pdf', contentType: 'application/pdf' }).attach('roof', png, { filename: 'roof.png', contentType: 'image/png' }).expect(201);
    expect(ok.body.reference).toMatch(/^SOL-/);
    const row = await one("select r.source, r.monthly_bill, r.bill_id, r.roof_photo_id, r.consent_at, c.code from solar_referrals r join solar_referral_codes c on c.id = r.code_id where r.phone10 = '9876501234'");
    expect(row).toMatchObject({ source: 'sunx', code, monthly_bill: '420000' });
    expect(row.bill_id && row.roof_photo_id && row.consent_at).toBeTruthy();
    await lead({ name: 'Kiran R' }).expect(409); // same phone: duplicate
    // Without a partner link the lead goes to the product's house code (no referral reward)
    await lead({ ref: '', phone: '9876501299', source: 'sungate', siteType: 'Apartment / housing society' }).expect(201);
    expect((await one("select c.code, c.owner_user_id from solar_referrals r join solar_referral_codes c on c.id = r.code_id where r.phone10 = '9876501299'"))).toMatchObject({ code: 'SUNGATE', owner_user_id: null });
    // Business enquiry through the partner link is attributed and shown to the partner
    const good = { kind: 'customer', name: 'Ritu Jain', email: 'ritu@example.com', message: 'We need a solar operating system for 40 installs a month.', consent: true, ref: code };
    const enq = await api(app).post('/v1/public/products/sunite/enquiries').send(good).expect(201);
    const after = await api(app).get('/v1/ventures/sunite').set(auth(t.asha)).expect(200);
    expect(after.body.myLink.enquiries).toBeGreaterThanOrEqual(1);
    // LeadDNA hand-off: the operating company's CRM gets a customer and a deal, with the introducer on record
    const v = await one("select id, group_company_org_id from unite_ventures where slug = 'sunite'");
    const detail = await api(app).get(`/v1/admin/ventures/${v.id}`).set(auth(t.uniteAdmin)).expect(200);
    const e = detail.body.enquiries.find((x: any) => x.reference === enq.body.reference);
    expect(e.introducedBy).toBeTruthy();
    await api(app).post(`/v1/admin/ventures/${v.id}/enquiries/${e.id}/convert`).set(auth(t.asha)).expect(403);
    const conv = await api(app).post(`/v1/admin/ventures/${v.id}/enquiries/${e.id}/convert`).set(auth(t.uniteAdmin)).expect(201);
    await api(app).post(`/v1/admin/ventures/${v.id}/enquiries/${e.id}/convert`).set(auth(t.uniteAdmin)).expect(409);
    const deal = await one('select organization_id, stage, title from crm_deals where id = $1', [conv.body.dealId]);
    expect(deal).toMatchObject({ organization_id: v.group_company_org_id, stage: 'new' });
    const notes = await pool.query("select body from crm_activities where subject_id = $1", [conv.body.dealId]);
    expect(notes.rows.some((n: any) => /Introduced by .* Any reward follows their signed agreement/.test(n.body))).toBe(true);
    expect(notes.rows.some((n: any) => n.body.includes(enq.body.reference))).toBe(true);
    // XPERT: work posted through the XPERT page is a normal micro-contract tagged with its source
    const day = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const job = { source: 'xpert', kind: 'site_survey', state: 'AP', title: 'Rooftop survey for 3 homes in Vijayawada', scope: 'Measure the roof, shading and meter location for three homes and upload photos.', acceptance: 'Survey sheet and photos for all three homes', quantity: 3, unit: 'surveys', priceRs: 1500, due: day };
    const m = await api(app).post('/v1/micro').set(auth(t.asha)).set(idem()).send(job).expect(201);
    expect(m.body.source).toBe('xpert');
    const xp = await api(app).get('/v1/public/products/xpert').expect(200);
    expect(xp.body.work.open).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(xp.body.work)).not.toContain('Vijayawada'); // counts only
  });
  it('Wave 2: property projects and site visits, ROOFZ roof offers, courses on learning pages, member links', async () => {
    const pd = await api(app).get('/v1/public/products/prodeal').expect(200);
    expect(pd.body.showcase.kind).toBe('property');
    expect(pd.body.showcase.items.length).toBeGreaterThan(0);
    const proj = pd.body.showcase.items[0];
    expect(Object.keys(proj).sort()).toEqual(['available', 'city', 'id', 'kind', 'name', 'priceFrom', 'priceTo', 'reraNumber', 'region'].sort()); // no commission or buyer data
    const base = { kind: 'customer', name: 'Anil Kumar', email: 'anil@example.com', message: 'Looking for a plot near the highway for a warehouse.', consent: true };
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await api(app).post('/v1/public/products/prodeal/enquiries').send({ ...base, projectId: '00000000-0000-4000-8000-000000000000', visitDate: soon }).expect(400);
    await api(app).post('/v1/public/products/prodeal/enquiries').send({ ...base, projectId: proj.id, visitDate: '2020-01-01' }).expect(400);
    await api(app).post('/v1/public/products/wakin/enquiries').send({ ...base, projectId: proj.id }).expect(400); // not a property business
    const ok = await api(app).post('/v1/public/products/prodeal/enquiries').send({ ...base, projectId: proj.id, visitDate: soon }).expect(201);
    const v = await one("select id from unite_ventures where slug = 'prodeal'");
    const d = await api(app).get(`/v1/admin/ventures/${v.id}`).set(auth(t.uniteAdmin)).expect(200);
    expect(d.body.enquiries.find((x: any) => x.reference === ok.body.reference).details).toMatchObject({ projectId: proj.id, projectName: proj.name, visitDate: soon });
    expect((await api(app).get('/v1/public/products/unitif').expect(200)).body.showcase.kind).toBe('property');
    // Learning pages list the published COLLABIZ courses
    const ul = await api(app).get('/v1/public/products/unite-learning').expect(200);
    expect(ul.body.showcase.kind).toBe('courses');
    expect(ul.body.showcase.items.length).toBeGreaterThan(0);
    expect(ul.body.showcase.items[0]).not.toHaveProperty('questions'); // no answers leak
    expect((await api(app).get('/v1/public/products/wakin').expect(200)).body.showcase).toBeNull();
    // ROOFZ: roof owners offer their roof; the lead goes to the Unite Solar desk under the ROOFZ house code
    let r = api(app).post('/v1/public/solar/leads');
    for (const [k, val] of Object.entries({ source: 'roofz', name: 'Meena Iyer', phone: '9876577001', city: 'Chennai', region: 'IN-TN', segment: 'commercial', siteType: 'Factory or warehouse', intent: 'lease_roof', roofAreaSqft: '12000', consent: 'true' })) r = r.field(k, val);
    await r.expect(201);
    const row = await one("select r.source, r.details, c.code from solar_referrals r join solar_referral_codes c on c.id = r.code_id where r.phone10 = '9876577001'");
    expect(row).toMatchObject({ source: 'roofz', code: 'ROOFZ' });
    expect(row.details).toMatchObject({ intent: 'lease_roof', roofAreaSqft: 12000 });
  });
});
