import type { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('WhatsApp opt-in, TReDS preparation, tender feed import — providers not connected', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('records WhatsApp consent with its text; sending is not connected', async () => {
    const before = (await api(app).get('/v1/me/whatsapp').set(auth(t.asha)).expect(200)).body;
    expect(before).toMatchObject({ optIn: false, connected: false });
    expect(before.templates.map((x: any) => x.key)).toEqual(['lead_update', 'payment', 'approval', 'opportunity']);
    await api(app).put('/v1/me/whatsapp').set(auth(t.asha)).send({ optIn: true, number: '080-41234567', kinds: ['payment'] }).expect(400);
    const on = (await api(app).put('/v1/me/whatsapp').set(auth(t.asha)).send({ optIn: true, number: '+91 98220 11223', kinds: ['payment', 'approval'] }).expect(200)).body;
    expect(on).toMatchObject({ optIn: true, number: '9822011223', kinds: ['payment', 'approval'] });
    expect((await one("select opt_in_text from channel_preferences where whatsapp_number = '9822011223'")).opt_in_text).toMatch(/replying STOP/);
    expect((await api(app).put('/v1/me/whatsapp').set(auth(t.asha)).send({ optIn: false }).expect(200)).body).toMatchObject({ optIn: false, number: '', kinds: [] });
    expect((await one("select count(*)::int n from audit_events where action like 'consent.whatsapp%'")).n).toBe(2);
  });

  it('TReDS: checks explain readiness; a ready invoice gives upload details; COLLABIZ handles no money', async () => {
    const inv = await one("select i.id, i.project_id from project_invoices i where number = 'INV-2026-900003'");
    const url = `/v1/projects/${inv.project_id}/invoices/${inv.id}/treds`;
    await api(app).get(url).set(auth(t.ravi)).expect(404); // not Sunrise's invoice
    const v = (await api(app).get(url).set(auth(t.asha)).expect(200)).body;
    expect(v.checks.filter((c: any) => !c.ok)).toEqual([]);
    expect(v.eligible).toBe(true);
    expect(v.note).toMatch(/does not finance invoices or handle the money/);
    await api(app).post(url).set(auth(t.rohit)).send({ platform: 'rxil' }).expect(403);
    const r = (await api(app).post(url).set(auth(t.asha)).send({ platform: 'rxil' }).expect(200)).body;
    expect(r).toMatchObject({ platform: 'RXIL', connected: false });
    expect(r.csv).toMatch(/"INV-2026-900003".*"27AABCV1234F1ZO","UDYAM-MH-26-0012345","Unite Solar/);
    // The overdue, part-paid invoice fails the due-date check with a reason
    const od = await one("select id, project_id from project_invoices where number = 'INV-2026-900002'");
    const odv = (await api(app).get(`/v1/projects/${od.project_id}/invoices/${od.id}/treds`).set(auth(t.asha)).expect(200)).body;
    expect(odv.checks.filter((c: any) => !c.ok).map((c: any) => c.key)).toEqual(expect.arrayContaining(['clean', 'due'])); // the open dispute names this invoice
    await api(app).post(`/v1/projects/${od.project_id}/invoices/${od.id}/treds`).set(auth(t.asha)).send({ platform: 'rxil' }).expect(400);
  });

  it('tender feed: Unite imports an RSS file, sectors guessed, duplicates skipped; auto-fetch not connected', async () => {
    const feed = readFileSync(join(__dirname, 'fixtures', 'tender-feed.xml'));
    await api(app).post('/v1/admin/tender-feed').set(auth(t.asha)).attach('file', feed, { filename: 'cppp.xml' }).expect(403);
    expect((await api(app).post('/v1/admin/tender-feed').set(auth(t.uniteAdmin)).field('source', 'CPPP').attach('file', feed, { filename: 'cppp.xml' }).expect(201)).body).toEqual({ source: 'CPPP', added: 3, skipped: 0 });
    expect((await api(app).post('/v1/admin/tender-feed').set(auth(t.uniteAdmin)).field('source', 'CPPP').attach('file', feed, { filename: 'cppp.xml' }).expect(201)).body).toEqual({ source: 'CPPP', added: 0, skipped: 3 });
    const l = (await api(app).get('/v1/admin/tender-leads').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(l.autoFetch.connected).toBe(false);
    const solar = l.leads.find((x: any) => x.externalId === '2026_MSEDC_101');
    expect(solar).toMatchObject({ sector: 'solar', buyer: 'MSEDCL', status: 'new' });
    expect(new Date(solar.closesAt).toISOString().slice(0, 10)).toBe('2026-11-28');
    expect(solar.matchingPartners).toBeGreaterThan(0);
    expect(l.leads.find((x: any) => x.externalId === '2026_GAD_12').sector).toBeNull();
    expect((await api(app).post(`/v1/admin/tender-leads/${solar.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'shortlisted' }).expect(200)).body.status).toBe('shortlisted');
    expect((await api(app).post('/v1/admin/tender-feed/fetch').set(auth(t.uniteAdmin)).expect(503)).body.message).toMatch(/not connected yet/);
  });
});
