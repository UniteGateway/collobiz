/**
 * Collab follow-ups on the real API: Unite first look (consenting offers go to the matching Unite company for 48 hours
 * before everyone), invitations to apply, and expiry reminders/notices from the offer sweep.
 */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { idemKey } from './flows';

const day = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
describe('Collab follow-ups', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const post = (path: string, tok: string, b: object = {}) => api(app).post(`/v1${path}`).set(auth(tok)).set('Idempotency-Key', idemKey('cf')).send(b);
  const get = (path: string, tok: string) => api(app).get(`/v1${path}`).set(auth(tok));
  const notes = async (email: string, like: string) => (await pool.query("select n.title from notifications n join users u on u.id = n.user_id where u.email = $1 and n.title ilike $2", [email, like])).rows;
  const offer = (title: string, extra: object = {}) => ({ category: 'strategic_partnership', side: 'offering', title, summary: 'Rooftop solar installation crews and a Hyderabad warehouse, seeking partners who bring residential customers.', sector: 'solar', city: 'Hyderabad', region: 'Telangana', upfrontRequired: false, expiresOn: day(60), ...extra });
  const approve = (id: string) => post(`/admin/business-offers/${id}/moderate`, t.superadmin, { decision: 'approve', checks: ['publisher_kyb_verified'] }).expect(200);

  let first: string;
  it('a consenting offer is shown only to the matching Unite company first; others cannot see it', async () => {
    first = (await post('/business-offers', t.ravi, { ...offer('Solar install crews for residential partners', { uniteFirstConsent: true }), submit: true }).expect(201)).body.id;
    await approve(first);
    const own = (await get(`/business-offers/${first}`, t.ravi).expect(200)).body;
    expect(own.uniteFirst).toMatchObject({ open: true, decision: null });
    expect(await notes('ravi@sunrise.example', '%Unite first look for 48 hours%')).toHaveLength(1);
    // Deepak (another partner) cannot see it yet, in the list, the detail or the marketplace.
    expect((await get('/business-offers', t.deepak).expect(200)).body.items.map((i: { id: string }) => i.id)).not.toContain(first);
    await get(`/business-offers/${first}`, t.deepak).expect(404);
    expect((await pool.query('select listed from opportunities where id = $1', [first])).rows[0].listed).toBe(false);
    // Unite Solar (solar sector) gets it and is notified.
    expect((await get('/business-offers', t.uniteAdmin).expect(200)).body.items.map((i: { id: string }) => i.id)).toContain(first);
    const u = (await get(`/business-offers/${first}`, t.uniteAdmin).expect(200)).body;
    expect(u.uniteReview).toBe(true);
    expect(await notes('unite.admin@collabiz.local', 'First look:%')).toHaveLength(1);
    // Invitations wait until the first look ends; only the Unite company decides.
    await post(`/business-offers/${first}/invitations`, t.ravi, { orgId: '00000000-0000-4000-8000-000000000000', message: 'Please take a look at this offer.' }).expect(409);
    await post(`/business-offers/${first}/unite-decision`, t.deepak, { decision: 'pass' }).expect(403);
    await post(`/business-offers/${first}/unite-decision`, t.uniteAdmin, { decision: 'interested' }).expect(400);
  });

  it('interested tells the publisher; passing lists the offer for everyone at once', async () => {
    const r = (await post(`/business-offers/${first}/unite-decision`, t.uniteAdmin, { decision: 'interested', note: 'We can take 2 MW of residential rooftops in Q1.' }).expect(200)).body;
    expect(r.uniteFirst).toMatchObject({ open: true, decision: 'interested' });
    expect(await notes('ravi@sunrise.example', 'Unite Solar is interested%')).toHaveLength(1);
    await get(`/business-offers/${first}`, t.deepak).expect(404);
    await post(`/business-offers/${first}/unite-decision`, t.uniteAdmin, { decision: 'pass' }).expect(200);
    expect((await get(`/business-offers/${first}`, t.deepak).expect(200)).body.uniteFirst).toBeNull();
    expect((await pool.query('select listed from opportunities where id = $1', [first])).rows[0].listed).toBe(true);
    expect(await notes('ravi@sunrise.example', '%now listed for all verified partners%')).toHaveLength(1);
    await post(`/business-offers/${first}/unite-decision`, t.uniteAdmin, { decision: 'pass' }).expect(409);
  });

  it('a lapsed first-look window is released by the sweep; offers without consent list immediately', async () => {
    const lapse = (await post('/business-offers', t.ravi, { ...offer('Solar O&M crews available', { uniteFirstConsent: true }), submit: true }).expect(201)).body.id;
    await approve(lapse);
    await get(`/business-offers/${lapse}`, t.deepak).expect(404);
    await pool.query("update business_offers set unite_review_until = now() - interval '1 minute' where opportunity_id = $1", [lapse]);
    await post('/admin/business-offers/sweep', t.ravi).expect(403);
    expect((await post('/admin/business-offers/sweep', t.superadmin).expect(200)).body.released).toBe(1);
    await get(`/business-offers/${lapse}`, t.deepak).expect(200);
    const plain = (await post('/business-offers', t.ravi, { ...offer('Solar warehouse space to share'), submit: true }).expect(201)).body.id;
    await approve(plain);
    await get(`/business-offers/${plain}`, t.deepak).expect(200);
  });

  it('invitations: verified partners only, once each, declined or applied shows on both sides', async () => {
    const [deccan] = (await pool.query("select o.id from organizations o join memberships m on m.organization_id = o.id join users u on u.id = m.user_id where u.email = 'deepak@deccan.example' limit 1")).rows;
    const [volt] = (await pool.query("select o.id from organizations o join memberships m on m.organization_id = o.id join users u on u.id = m.user_id where u.email = 'asha@voltepc.example' limit 1")).rows;
    const found = (await get('/collab/partners?q=Decc', t.ravi).expect(200)).body;
    expect(found.map((o: { id: string }) => o.id)).toContain(deccan.id);
    const msg = { message: 'Your dealer network would suit our installation crews.' };
    await post(`/business-offers/${first}/invitations`, t.deepak, { orgId: volt.id, ...msg }).expect(403);
    await post(`/business-offers/${first}/invitations`, t.ravi, { orgId: deccan.id, message: 'hi' }).expect(400);
    await post(`/business-offers/${first}/invitations`, t.ravi, { orgId: deccan.id, ...msg }).expect(201);
    await post(`/business-offers/${first}/invitations`, t.ravi, { orgId: deccan.id, ...msg }).expect(409);
    await post(`/business-offers/${first}/invitations`, t.ravi, { orgId: volt.id, ...msg }).expect(201);
    expect(await notes('deepak@deccan.example', '%invited you to apply%')).toHaveLength(1);
    const d = (await get('/collab/invitations', t.deepak).expect(200)).body;
    expect(d.received[0]).toMatchObject({ offerId: first, status: 'sent' });
    expect((await get(`/business-offers/${first}`, t.deepak).expect(200)).body.invitation).toMatchObject({ status: 'sent' });
    await post(`/collab/invitations/${d.received[0].id}/decline`, t.asha, {}).expect(404);
    const a = (await get('/collab/invitations', t.asha).expect(200)).body;
    await post(`/collab/invitations/${a.received[0].id}/decline`, t.asha, { reason: 'Not our region this quarter' }).expect(200);
    await post(`/collab/invitations/${a.received[0].id}/decline`, t.asha, {}).expect(409);
    expect(await notes('ravi@sunrise.example', '%declined your invitation%')).toHaveLength(1);
    // Deccan applies; the invitation then reads "applied" for both sides.
    await post(`/opportunities/${first}/apply`, t.deepak, { message: 'We have 40 dealers who bring residential rooftop customers every month.' }).expect(201);
    const sent = (await get('/collab/invitations', t.ravi).expect(200)).body.sent;
    expect(Object.fromEntries(sent.map((s: { organization: string; status: string }) => [s.status, true]))).toMatchObject({ applied: true, declined: true });
    expect((await get(`/business-offers/${first}`, t.ravi).expect(200)).body.invitations).toHaveLength(2);
  });

  it('expiry: 7-day and 1-day reminders once each, then an expiry notice', async () => {
    await pool.query('update business_offers set expires_on = $2 where opportunity_id = $1', [first, day(5)]);
    expect((await post('/admin/business-offers/sweep', t.superadmin).expect(200)).body.reminders).toBe(1);
    expect((await post('/admin/business-offers/sweep', t.superadmin).expect(200)).body.reminders).toBe(0);
    await pool.query('update business_offers set expires_on = $2 where opportunity_id = $1', [first, day(1)]);
    expect((await post('/admin/business-offers/sweep', t.superadmin).expect(200)).body.reminders).toBe(1);
    expect(await notes('ravi@sunrise.example', `%expires tomorrow%`)).toHaveLength(1);
    await pool.query('update business_offers set expires_on = current_date - 1 where opportunity_id = $1', [first]);
    expect((await post('/admin/business-offers/sweep', t.superadmin).expect(200)).body.expired).toBe(1);
    expect(await notes('ravi@sunrise.example', '%has expired%')).toHaveLength(1);
    const sent = (await get('/collab/invitations', t.ravi).expect(200)).body.sent;
    expect(sent.find((s: { status: string }) => s.status !== 'applied' && s.status !== 'declined')).toBeUndefined();
  });
});
