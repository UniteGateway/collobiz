import type { INestApplication } from '@nestjs/common';
import { api, bootApp, resetDatabase } from './helpers';

describe('Stage 01 — foundation', () => {
  let app: INestApplication;
  beforeAll(async () => {
    await resetDatabase();
    app = await bootApp();
  });
  afterAll(() => app?.close());

  it('GET /v1/health reports database ok', async () => {
    const r = await api(app).get('/v1/health').expect(200);
    expect(r.body.status).toBe('ok');
    expect(r.body.checks.database).toBe('ok');
    expect(r.headers['x-request-id']).toBeTruthy();
  });

  it('GET /v1/meta/screens exposes all 165 screens', async () => {
    const r = await api(app).get('/v1/meta/screens').expect(200);
    expect(r.body.screens).toHaveLength(165);
    expect(r.body.families).toHaveLength(16);
    expect(r.body.screens[0]).toMatchObject({ id: '001', title: 'Website homepage' });
  });

  it('regulated modules are disabled by default (§7.3)', async () => {
    const r = await api(app).get('/v1/meta/features').expect(200);
    expect(r.body.investorDataRoom).toBe(false);
    expect(r.body.financeIntroductions).toBe(false);
  });

  it('unknown routes return 404 without leaking details', async () => {
    const r = await api(app).get('/v1/does-not-exist').expect(404);
    expect(JSON.stringify(r.body)).not.toMatch(/stack|at /);
  });

  it('download links require a valid signature', async () => {
    await api(app).get('/v1/files/download?key=x&expires=9999999999&sig=bad').expect(400);
  });

  it('oversized and malformed bodies are client errors, not 500s', async () => {
    await api(app).post('/v1/public/enquiries').set('Content-Type', 'application/json').send(JSON.stringify({ x: 'a'.repeat(2_000_000) })).expect(413);
    const r = await api(app).post('/v1/public/enquiries').set('Content-Type', 'application/json').send('{"name": ').expect(400);
    expect(JSON.stringify(r.body)).not.toMatch(/ at \w|node_modules/);
  });

  it('sets security headers', async () => {
    const r = await api(app).get('/v1/health');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('Stage 01 — contact enquiries (screen 010)', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await bootApp(); });
  afterAll(() => app?.close());

  it('creates an enquiry with a reference', async () => {
    const r = await api(app).post('/v1/public/enquiries').send({ name: 'Asha Rao', email: 'asha@example.com', topic: 'partnership', message: 'We are a solar EPC firm interested in joining.', consent: true }).expect(201);
    expect(r.body.reference).toMatch(/^ENQ-\d{4}-\d{6}$/);
  });
  it('rejects invalid input with field issues', async () => {
    const r = await api(app).post('/v1/public/enquiries').send({ name: 'A', email: 'bad', topic: 'x', message: 'short', consent: false }).expect(400);
    const paths = r.body.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'email', 'topic', 'message', 'consent']));
  });
});
