import './solbid-env';
import type { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

const SECRET = 'test-solbid-shared-secret';
const hmac = (s: string) => createHmac('sha256', SECRET).update(s).digest('hex');

/** SOLBID hand-off: signed calls out, signed updates in, customer consent recorded, outcome only as shared. */
describe('SOLBID integration', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  let fake: http.Server;
  const calls: { method: string; url: string; body: string; ok: boolean }[] = [];
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => {
    await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // A fake SOLBID that verifies signatures exactly like SOLBID's integrations module.
    fake = http.createServer((req, res) => {
      let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
        const ts = String(req.headers['x-collabiz-timestamp']); const sig = String(req.headers['x-collabiz-signature']);
        const ok = sig === hmac(`${ts}.${req.method}.${req.url}.${body}`) && Math.abs(Date.now() - Number(ts)) < 300_000;
        if (req.url === '/api/v1/public/stats') { res.writeHead(200, { 'content-type': 'application/json' }).end('{"openProjects":2,"openCapacityKw":2005,"live":[]}'); return; } // public, unsigned
        calls.push({ method: req.method!, url: req.url!, body, ok });
        if (!ok) { res.writeHead(401).end('{"message":"Invalid signature"}'); return; }
        if (req.method === 'POST') { res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ externalRef: JSON.parse(body).externalRef, status: 'INVITED' })); return; }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ externalRef: 'x', status: 'CLAIMED', shareOutcome: true, project: { code: 'SB-1001', status: 'OPEN', bids: 3 } }));
      });
    });
    await new Promise<void>((r) => fake.listen(45992, '127.0.0.1', r));
  });
  afterAll(async () => { fake.close(); await pool?.end(); await app?.close(); });

  const event = (payload: object, opts: { ts?: number; secret?: string } = {}) => {
    const raw = JSON.stringify(payload); const ts = String(opts.ts ?? Date.now());
    const sig = createHmac('sha256', opts.secret ?? SECRET).update(`${ts}.${raw}`).digest('hex');
    return api(app).post('/v1/public/integrations/solbid/events').set('content-type', 'application/json').set('x-solbid-timestamp', ts).set('x-solbid-signature', sig).send(raw);
  };

  it('hands a consented solar referral to SOLBID with a signed request, and only once', async () => {
    // A partner-link solar lead from the SunX page
    const code = (await api(app).get('/v1/ventures/sunite').set(auth(t.asha)).expect(200)).body.myLink.code;
    let r = api(app).post('/v1/public/solar/leads');
    for (const [k, v] of Object.entries({ source: 'sunx', ref: code, name: 'Kiran Rao', phone: '9876501234', city: 'Hyderabad', region: 'IN-TG', segment: 'commercial', siteType: 'Shop or office', monthlyBill: '42000', consent: 'true' })) r = r.field(k, v);
    await r.expect(201);
    const ref = await one("select id from solar_referrals where phone10 = '9876501234'");
    const body = { capacityKw: 40, model: 'EPC', consentNote: 'Customer agreed on a call on 22 Nov to receive sealed bids on SOLBID.' };
    await api(app).post(`/v1/admin/solbid/referrals/${ref.id}`).set(auth(t.asha)).send(body).expect(403);
    await api(app).post(`/v1/admin/solbid/referrals/${ref.id}`).set(auth(t.uniteAdmin)).send({ ...body, consentNote: 'ok' }).expect(400);
    const sent = await api(app).post(`/v1/admin/solbid/referrals/${ref.id}`).set(auth(t.uniteAdmin)).send(body).expect(201);
    expect(sent.body.ref).toMatch(/^CZ-SOL-[0-9A-F]{8}$/);
    const out = calls.find((c) => c.method === 'POST')!;
    expect(out.ok).toBe(true); // SOLBID accepted the signature
    expect(out.url).toBe('/api/v1/integrations/collabiz/intakes');
    const p = JSON.parse(out.body);
    expect(p).toMatchObject({ externalRef: sent.body.ref, customer: { name: 'Kiran Rao', mobile: '9876501234' }, requirement: { category: 'Commercial', model: 'EPC', capacity: 40, unit: 'kW', state: 'Telangana', city: 'Hyderabad', monthlyBill: 42000 } });
    expect(p.introducer.code).toBe(code);
    expect(JSON.stringify(p)).not.toMatch(/bill_id|roof|billId/); // no files or file references leave COLLABIZ
    expect(await one('select solbid_status, solbid_consent_note from solar_referrals where id = $1', [ref.id])).toMatchObject({ solbid_status: 'invited', solbid_consent_note: body.consentNote });
    await api(app).post(`/v1/admin/solbid/referrals/${ref.id}`).set(auth(t.uniteAdmin)).send(body).expect(409);
    // Status pulled back from SOLBID (signed GET)
    const st = await api(app).get(`/v1/admin/solbid/referrals/${ref.id}`).set(auth(t.uniteAdmin)).expect(200);
    expect(st.body).toMatchObject({ status: 'confirmed', project: { code: 'SB-1001', bids: 3 } });
    expect(calls.filter((c) => c.method === 'GET').every((c) => c.ok)).toBe(true);
  });

  it('accepts only signed, fresh updates from SOLBID and records the outcome for the introducer without paying anything', async () => {
    const r = await one("select id, solbid_ref from solar_referrals where phone10 = '9876501234'");
    const awarded = { event: 'project.awarded', at: new Date().toISOString(), externalRef: r.solbid_ref, project: { code: 'SB-1001', status: 'AWARDED', bids: 3 }, shareOutcome: true, contractValue: 1840000 };
    await event(awarded, { secret: 'wrong-secret-xxxxxxxx' }).expect(401);
    await event(awarded, { ts: Date.now() - 10 * 60_000 }).expect(401);
    await event(awarded).expect(200);
    const row = await one('select solbid_status, solbid_outcome, status, reward from solar_referrals where id = $1', [r.id]);
    expect(row).toMatchObject({ solbid_status: 'awarded', status: 'new', reward: null }); // nothing paid or marked installed automatically
    expect(row.solbid_outcome).toMatchObject({ contractValue: 1840000, lastEvent: 'project.awarded' });
    const note = await one("select count(*)::int n from notifications where title like 'SOLBID update for your referral%' and body like '%signed agreement%'");
    expect(note.n).toBeGreaterThan(0);
    // Without the customer's consent the contract value is not kept
    await event({ ...awarded, event: 'project.completed', shareOutcome: false, contractValue: 1840000 }).expect(200);
    expect((await one('select solbid_status, solbid_outcome from solar_referrals where id = $1', [r.id]))).toMatchObject({ solbid_status: 'completed', solbid_outcome: { contractValue: null } });
    await event({ ...awarded, externalRef: 'CZ-SOL-UNKNOWN' }).expect(200); // unknown references are ignored
  });

  it('shows SOLBID\'s anonymised public board', async () => {
    const b = await api(app).get('/v1/public/solbid/board').expect(200);
    expect(b.body).toMatchObject({ connected: true, available: true, openProjects: 2 });
  });
});
