import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { NO_NUMBERS_PDF, SAMPLE_BILL_PDF } from './pdf';

describe('Unite Solar sales desk', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const customer = { name: 'Prakash Jadhav', phone: '98901 23456', city: 'Pune', pincode: '411021' };
  const home = { segment: 'residential', region: 'IN-MH', monthlyUnits: 412, tariff: 950, sanctionedLoadKw: 5 };

  it('kits are public; the overview gives the structure and a personal referral code; only verified partners and Unite quote', async () => {
    const kits = (await api(app).get('/v1/solar/kits').expect(200)).body;
    expect(kits).toHaveLength(14);
    expect(kits.find((k: any) => k.code === 'USK-HY-05')).toMatchObject({ system: 'hybrid', capacityKw: 5, batteryKwh: 10, panelCount: 10 });
    const o = (await api(app).get('/v1/solar/overview').set(auth(t.asha)).expect(200)).body;
    expect(o.referralCode).toBe('ASHA2026');
    expect(o.structure.commission).toMatchObject({ kitPerKw: 2_500_00, ppaPerKw: 1_500_00 });
    expect(o.totals.quotes).toBe(2);
    await api(app).get('/v1/solar/overview').set(auth(t.vikram)).expect(403); // not verified
    const ravi = (await api(app).get('/v1/solar/overview').set(auth(t.ravi)).expect(200)).body;
    expect(ravi.referralCode).toMatch(/^RAVIP\d{3}$/);
    expect(ravi.totals.quotes).toBe(0);
  });

  it('reads a PDF power bill, and says so plainly when it cannot', async () => {
    const r = await api(app).post('/v1/solar/bills').set(auth(t.asha)).attach('file', SAMPLE_BILL_PDF, { filename: 'bill.pdf', contentType: 'application/pdf' }).expect(201);
    expect(r.body.readable).toBe(true);
    expect(r.body.extract).toMatchObject({ monthlyUnits: 412, amount: 391400, tariff: 950, sanctionedLoadKw: 5, discom: 'MSEDCL', segment: 'residential', consumerNo: '170012345678' });
    const blank = await api(app).post('/v1/solar/bills').set(auth(t.asha)).attach('file', NO_NUMBERS_PDF, { filename: 'b.pdf', contentType: 'application/pdf' }).expect(201);
    expect(blank.body.readable).toBe(false);
    expect(blank.body.message).toMatch(/Type the units/);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(64)]);
    const photo = await api(app).post('/v1/solar/bills').set(auth(t.asha)).attach('file', png, { filename: 'bill.png', contentType: 'image/png' }).expect(201);
    expect(photo.body.message).toMatch(/Photos are kept/);
    const row = await one('select delete_after > now() + interval \'89 days\' ok from solar_bills where id = $1', [r.body.id]);
    expect(row.ok).toBe(true);
  });

  let kitQuote: any;
  it('quotes a kit from the bill: right kit, subsidy, savings and commission, all calculated on the server', async () => {
    const bill = (await api(app).post('/v1/solar/bills').set(auth(t.asha)).attach('file', SAMPLE_BILL_PDF, { filename: 'bill.pdf', contentType: 'application/pdf' }).expect(201)).body;
    const pv = (await api(app).post('/v1/solar/preview').set(auth(t.asha)).send({ site: home, model: 'kit', system: 'on_grid' }).expect(200)).body;
    expect(pv.calc).toMatchObject({ capacityKw: 4, recommendedKw: 3.5, subsidy: 78_000_00, total: 2_40_000_00, net: 1_62_000_00, commission: 10_000_00 });
    const body = { customer, consentMethod: 'meeting_minutes', consent: true, site: home, model: 'kit', system: 'on_grid', billId: bill.id };
    await api(app).post('/v1/solar/quotes').set(auth(t.asha)).send({ ...body, consent: false }).expect(400);
    await api(app).post('/v1/solar/quotes').set(auth(t.ravi)).send(body).expect(400); // someone else's bill
    kitQuote = (await api(app).post('/v1/solar/quotes').set(auth(t.asha)).send(body).expect(201)).body;
    expect(kitQuote).toMatchObject({ status: 'draft', model: 'kit', capacityKw: 4, total: 2_40_000_00, commission: 10_000_00, partner: 'Volt EPC' });
    expect(kitQuote.calc.savings.paybackYears).toBeGreaterThan(2);
    expect(kitQuote.bill.extract.monthlyUnits).toBe(412);
    expect(kitQuote.code).toMatch(/^QT-SOL-\d{4}-\d{5}$/);
  });

  it('EPC gives an itemised BOQ with GST; PPA needs the minimum size and has no upfront cost; hybrid gets no subsidy', async () => {
    const site = { segment: 'industrial', region: 'IN-GJ', monthlyUnits: 22000, tariff: 1000 };
    const epc = (await api(app).post('/v1/solar/preview').set(auth(t.asha)).send({ site, model: 'epc', system: 'on_grid' }).expect(200)).body.calc;
    expect(epc.capacityKw).toBe(175);
    expect(epc.lines).toHaveLength(6);
    expect(epc.gst).toBe(Math.round(epc.subtotal * 0.089));
    expect(epc.subsidy).toBe(0);
    const ppa = (await api(app).post('/v1/solar/preview').set(auth(t.asha)).send({ site, model: 'ppa', system: 'on_grid' }).expect(200)).body.calc;
    expect(ppa).toMatchObject({ total: 0, net: 0, ppa: { tariff: 490, termYears: 25 }, commission: 175 * 1_500_00 });
    const small = await api(app).post('/v1/solar/preview').set(auth(t.asha)).send({ site: home, model: 'ppa', system: 'on_grid' }).expect(400);
    expect(small.body.message).toMatch(/at least 50 kW/);
    const hy = (await api(app).post('/v1/solar/preview').set(auth(t.asha)).send({ site: home, model: 'kit', system: 'hybrid' }).expect(200)).body.calc;
    expect(hy).toMatchObject({ system: 'hybrid', capacityKw: 5, subsidy: 0 });
  });

  it('partners see only their quotes and cannot mark orders won; Unite won → projected commission, paid → earned', async () => {
    await api(app).get(`/v1/solar/quotes/${kitQuote.id}`).set(auth(t.ravi)).expect(404);
    expect((await api(app).get('/v1/solar/quotes').set(auth(t.ravi)).expect(200)).body).toHaveLength(0);
    await api(app).post(`/v1/solar/quotes/${kitQuote.id}/status`).set(auth(t.asha)).send({ status: 'accepted' }).expect(409); // must be sent first
    await api(app).post(`/v1/solar/quotes/${kitQuote.id}/status`).set(auth(t.asha)).send({ status: 'sent' }).expect(200);
    await api(app).post(`/v1/solar/quotes/${kitQuote.id}/status`).set(auth(t.asha)).send({ status: 'accepted' }).expect(200);
    await api(app).post(`/v1/solar/quotes/${kitQuote.id}/status`).set(auth(t.asha)).send({ status: 'won' }).expect(403);
    const won = (await api(app).post(`/v1/solar/quotes/${kitQuote.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'won', note: 'Advance received' }).expect(200)).body;
    expect(won.commissionEntry).toMatchObject({ status: 'estimated' });
    const e = await one('select e.status, e.gross, e.base_amount from commission_entries e where e.solar_quote_id = $1', [kitQuote.id]);
    expect(e).toMatchObject({ status: 'estimated', gross: '1000000', base_amount: '24000000' });
    const paid = (await api(app).post(`/v1/solar/quotes/${kitQuote.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'paid' }).expect(200)).body;
    expect(paid.commissionEntry.status).toBe('earned');
    const earn = (await api(app).get('/v1/earnings').set(auth(t.asha)).expect(200)).body;
    expect(JSON.stringify(earn)).toContain(`Solar ${kitQuote.code}`);
  });

  it('referrals: public link → referral → quote by phone → installed makes the reward due → finance records payment; the customer gets a code', async () => {
    const land = (await api(app).get('/v1/public/solar/refer/asha2026').expect(200)).body;
    expect(land.by).toBe('Asha');
    await api(app).get('/v1/public/solar/refer/NOPE999').expect(404);
    const friend = { name: 'Nilesh More', phone: '9765012345', city: 'Pune', region: 'IN-MH', segment: 'residential', monthlyBill: 3_500_00, consent: true };
    await api(app).post('/v1/public/solar/refer/ASHA2026').send({ ...friend, consent: false }).expect(400);
    await api(app).post('/v1/public/solar/refer/ASHA2026').send(friend).expect(201);
    await api(app).post('/v1/public/solar/refer/ASHA2026').send(friend).expect(409);
    const q = (await api(app).post('/v1/solar/quotes').set(auth(t.uniteAdmin)).send({ customer: { ...customer, name: 'Nilesh More', phone: '+91 97650 12345' }, consentMethod: 'recorded_call', consent: true, site: home, model: 'kit', system: 'on_grid' }).expect(201)).body;
    expect(q.referral).toMatchObject({ by: 'Asha Patil', status: 'quoted' });
    expect(q.commission).toBe(0); // Unite's own quote: no partner commission
    for (const s of ['sent', 'accepted', 'won']) await api(app).post(`/v1/solar/quotes/${q.id}/status`).set(auth(t.uniteAdmin)).send({ status: s }).expect(200);
    const inst = (await api(app).post(`/v1/solar/quotes/${q.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'installed' }).expect(200)).body;
    expect(inst.referral).toMatchObject({ status: 'installed', reward: 2_000_00 });
    expect(inst.customerReferralCode).toMatch(/^NILES\d{4}$/);
    const mine = (await api(app).get('/v1/solar/referrals').set(auth(t.asha)).expect(200)).body;
    const r = mine.referrals.find((x: any) => x.name === 'Nilesh'); // referrers see first names only
    expect(r).toMatchObject({ status: 'installed', reward: 2_000_00, phone: '97••••••45' });
    await api(app).post(`/v1/admin/solar/referrals/${r.id}/rewarded`).set(auth(t.uniteAdmin)).expect(403);
    await api(app).post(`/v1/admin/solar/referrals/${r.id}/rewarded`).set(auth(t.finance)).expect(200);
    // A partner cannot use their own code on their own quote.
    const self = await api(app).post('/v1/solar/quotes').set(auth(t.asha)).send({ customer: { ...customer, phone: '9000000001' }, consentMethod: 'meeting_minutes', consent: true, site: home, model: 'kit', system: 'on_grid', referralCode: 'ASHA2026' }).expect(400);
    expect(self.body.message).toMatch(/own referral code/);
  });

  it('only super admins and finance change commission and rewards; new settings price the next quote', async () => {
    const body = { commission: { kitPerKw: 3_000_00, kitMin: 3_000_00, epcTiers: [{ upTo: 1_00_00_000_00, rateBps: 200 }, { upTo: null, rateBps: 150 }], ppaPerKw: 1_500_00 } };
    await api(app).patch('/v1/admin/solar/config').set(auth(t.uniteAdmin)).send(body).expect(403);
    await api(app).patch('/v1/admin/solar/config').set(auth(t.finance)).send({ commission: { ...body.commission, epcTiers: [{ upTo: 100, rateBps: 200 }] } }).expect(400);
    await api(app).patch('/v1/admin/solar/config').set(auth(t.finance)).send(body).expect(200);
    const pv = (await api(app).post('/v1/solar/preview').set(auth(t.asha)).send({ site: home, model: 'kit', system: 'on_grid' }).expect(200)).body.calc;
    expect(pv.commission).toBe(12_000_00);
    const adm = (await api(app).get('/v1/admin/solar').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(adm.canEditMoney).toBe(false);
    expect(adm.totals.won).toBeGreaterThanOrEqual(2);
    await api(app).get('/v1/admin/solar').set(auth(t.asha)).expect(403);
    const k = await api(app).post('/v1/admin/solar/kits').set(auth(t.uniteAdmin)).send({ name: 'Unite Solar 12 kW On-grid kit', system: 'on_grid', capacityKw: 12, panelW: 550, inverterKw: 12, phase: 3, price: 6_40_000_00, warrantyYears: 25, includes: ['Panels', 'Inverter'], description: 'Larger homes and small shops.' }).expect(201);
    await api(app).patch(`/v1/admin/solar/kits/${k.body.id}`).set(auth(t.uniteAdmin)).send({ status: 'retired' }).expect(200);
    expect((await api(app).get('/v1/solar/kits').expect(200)).body).toHaveLength(14);
  });
});
