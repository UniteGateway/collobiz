/** Catalogues, brochures and DPRs per module: admins upload files or add links; viewers see what their visibility allows. */
import type { INestApplication } from '@nestjs/common';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('Module documents', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); });
  afterAll(async () => { await app?.close(); });
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\n%%EOF\n');
  const upload = (tok: string, fields: Record<string, string>, file?: Buffer, name = 'brochure.pdf', path = '/v1/admin/documents') => {
    const r = api(app).post(path).set(auth(tok));
    for (const [k, v] of Object.entries(fields)) r.field(k, v);
    return file ? r.attach('file', file, { filename: name, contentType: 'application/pdf' }) : r;
  };

  let dpr: string, brochure: string;
  it('admins add files and links; partners cannot', async () => {
    await upload(t.asha, { moduleKey: 'unite-solar', title: 'Plan brochure', kind: 'brochure' }, PDF).expect(403);
    await upload(t.uniteAdmin, { moduleKey: 'unite-solar', title: 'No file', kind: 'brochure' }).expect(400);
    await upload(t.uniteAdmin, { moduleKey: 'nowhere', title: 'Bad module', kind: 'brochure', url: '/x' }).expect(400);
    await upload(t.uniteAdmin, { moduleKey: 'unite-solar', title: 'Bad link', kind: 'brochure', url: 'http://insecure.example' }).expect(400);
    await upload(t.uniteAdmin, { moduleKey: 'unite-solar', title: 'Fake', kind: 'brochure' }, Buffer.from('<html>not a pdf</html>')).expect(400);
    brochure = (await upload(t.uniteAdmin, { moduleKey: 'unite-solar', title: 'Unite Solar partner plans', kind: 'brochure', visibility: 'public', sortOrder: '1' }, PDF).expect(201)).body.id;
    dpr = (await upload(t.uniteAdmin, { moduleKey: 'unite-solar', title: '1 MW rooftop DPR — sample format', kind: 'dpr', visibility: 'verified_partners' }, PDF, 'dpr.pdf').expect(201)).body.id;
    await upload(t.uniteAdmin, { moduleKey: 'powertek', title: 'Powertek product catalogue', kind: 'catalogue', url: '/powertek', visibility: 'partners' }).expect(201);
    await upload(t.uniteAdmin, { moduleKey: 'general', title: 'Internal pricing note', kind: 'policy', url: '/help', visibility: 'staff' }).expect(201);
  });

  it('visibility: public for everyone, verified-partner DPRs only for verified partners, staff notes only for staff; general shows everywhere', async () => {
    const anon = (await api(app).get('/v1/documents?module=unite-solar').expect(200)).body;
    expect(anon.map((d: { title: string }) => d.title)).toEqual(['Unite Solar partner plans']);
    const asha = (await api(app).get('/v1/documents?module=unite-solar').set(auth(t.asha)).expect(200)).body; // Volt EPC is verified
    expect(asha.map((d: { kind: string }) => d.kind).sort()).toEqual(['brochure', 'dpr']);
    expect(asha[0]).not.toHaveProperty('objectKey');
    const vikram = (await api(app).get('/v1/documents?module=unite-solar').set(auth(t.vikram)).expect(200)).body;
    expect(vikram.some((d: { kind: string }) => d.kind === 'dpr')).toBe(false);
    await api(app).post(`/v1/documents/${dpr}/open`).set(auth(t.vikram)).expect(404);
    const admin = (await api(app).get('/v1/documents?module=unite-solar').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(admin.some((d: { title: string }) => d.title === 'Internal pricing note')).toBe(true);
  });

  it('opening gives a short-lived signed download that works, counts opens, and links return the link', async () => {
    const o = (await api(app).post(`/v1/documents/${dpr}/open`).set(auth(t.asha)).expect(200)).body;
    expect(o.url).toMatch(/^\/v1\/files\/download\?key=/);
    const file = await api(app).get(o.url).expect(200);
    expect(Buffer.from(file.body).subarray(0, 4).toString()).toBe('%PDF');
    const all = (await api(app).get('/v1/documents?module=all').set(auth(t.asha)).expect(200)).body;
    expect(all.find((d: { id: string }) => d.id === dpr).opens).toBe(1);
    const link = all.find((d: { title: string }) => d.title === 'Powertek product catalogue');
    expect((await api(app).post(`/v1/documents/${link.id}/open`).set(auth(t.asha)).expect(200)).body.url).toBe('/powertek');
  });

  it('replacing the file raises the version; archived documents disappear', async () => {
    const v2 = (await upload(t.uniteAdmin, { moduleKey: 'unite-solar', title: 'Unite Solar partner plans (Nov 2026)', kind: 'brochure', visibility: 'public', sortOrder: '1' }, PDF, 'plans-v2.pdf', `/v1/admin/documents/${brochure}`).expect(200)).body;
    expect(v2).toMatchObject({ version: 2, fileName: 'plans-v2.pdf' });
    await api(app).post(`/v1/admin/documents/${brochure}/status`).set(auth(t.uniteAdmin)).send({ status: 'archived' }).expect(200);
    expect((await api(app).get('/v1/documents?module=unite-solar').expect(200)).body).toHaveLength(0);
    await api(app).get('/v1/admin/documents').set(auth(t.asha)).expect(403);
  });
});
