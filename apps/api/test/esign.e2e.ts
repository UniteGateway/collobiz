import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { awardTender } from './flows';
import type { SeedRefs } from '../src/db/seed';

describe('Signing methods — typed, uploaded wet-ink copy, Aadhaar eSign (not connected), signing certificate', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool; let refs: SeedRefs;
  beforeAll(async () => { await resetDatabase(); refs = await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  let k = 0; const key = () => `esign-${++k}-${Date.now()}`;

  it('a party signs by uploading the signed PDF; the other types; the certificate records both methods', async () => {
    const tenderId = await awardTender(app, t, refs, pool);
    const c = (await api(app).post(`/v1/tenders/${tenderId}/contracts`).set(auth(t.uniteAdmin)).send({ kind: 'work_order' }).expect(201)).body;
    await api(app).post(`/v1/contracts/${c.id}/submit`).set(auth(t.uniteAdmin)).expect(200);
    const ap = (await api(app).post(`/v1/contracts/${c.id}/review`).set(auth(t.evaluator)).send({ decision: 'approve' }).expect(200)).body;
    const hash = ap.versions[ap.versions.length - 1].bodyHash;
    const pdf = Buffer.from('%PDF-1.4 signed copy with wet-ink signature');
    const up = (f: Record<string, string>, file = pdf, name = 'signed.pdf', type = 'application/pdf') => {
      const r = api(app).post(`/v1/contracts/${c.id}/sign-upload`).set(auth(t.asha));
      for (const [kk, v] of Object.entries(f)) r.field(kk, v);
      return r.attach('file', file, { filename: name, contentType: type });
    };
    await up({ typedName: 'Asha Patil', consent: 'true', bodyHash: 'a'.repeat(64) }).expect(409); // not the approved text
    await up({ typedName: 'Asha Patil', bodyHash: hash }).expect(400); // no authority confirmation
    await up({ typedName: 'Asha Patil', consent: 'true', bodyHash: hash }, Buffer.from('not a pdf'), 'x.pdf').expect(400);
    const s1 = (await up({ typedName: 'Asha Patil', title: 'Director', consent: 'true', bodyHash: hash }).expect(200)).body;
    expect(s1.status).toBe('partially_signed');
    const esign = await api(app).post(`/v1/contracts/${c.id}/esign`).set(auth(t.uniteAdmin)).expect(503);
    expect(esign.body.message).toMatch(/eSign.*not connected yet/);
    const s2 = (await api(app).post(`/v1/contracts/${c.id}/sign`).set(auth(t.uniteAdmin)).set('Idempotency-Key', key()).send({ typedName: 'Sanjay Kulkarni', consent: true, bodyHash: hash }).expect(200)).body;
    expect(s2.status).toBe('executed');
    const cert = (await api(app).get(`/v1/contracts/${c.id}/certificate`).set(auth(t.asha)).expect(200)).body;
    expect(cert).toMatchObject({ status: 'executed', intact: true, version: { bodyHash: hash } });
    expect(cert.signatures.map((x: any) => [x.organization, x.method, x.matchesApproved])).toEqual([['Volt EPC', 'wet_ink_upload', true], ['Unite Solar', 'typed', true]]);
    expect(cert.signatures[0].evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(cert.note).toMatch(/not Aadhaar eSign/);
    await api(app).get(`/v1/contracts/${c.id}/certificate`).set(auth(t.ravi)).expect(404);
  });
});
