import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import type { SeedRefs } from '../src/db/seed';

describe('Stage 10 — contracts & documents (gate: approved agreement version is immutable)', () => {
  let app: INestApplication;
  let refs: SeedRefs;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  let tenderId: string;
  let loi: any;
  let amendment: any;
  let k = 0;
  const key = () => `stage10-key-${++k}-${Date.now()}`;

  /** Runs a minimal tender to award through the public API: Volt wins at ₹8,40,000. */
  async function awardedTender() {
    const r = await api(app).post('/v1/tenders').set(auth(t.uniteAdmin)).send({ title: 'Cable laying for Chakan rooftop', scope: 'Supply and lay 2 km of 4C x 300 sq mm armoured cable with terminations and testing.', sector: 'solar', closesAt: new Date(Date.now() + 2 * 86400_000).toISOString() }).expect(201);
    const id = r.body.id;
    await api(app).post(`/v1/tenders/${id}/documents`).set(auth(t.uniteAdmin)).field('title', 'Cable schedule').attach('file', Buffer.from('%PDF-1.4 cables'), { filename: 'cables.pdf', contentType: 'application/pdf' }).expect(201);
    await api(app).post(`/v1/tenders/${id}/evaluators`).set(auth(t.uniteAdmin)).send({ userId: refs.users.evaluator, role: 'both' }).expect(201);
    await api(app).post(`/v1/tenders/${id}/publish`).set(auth(t.uniteAdmin)).expect(200);
    await api(app).put(`/v1/tenders/${id}/bid`).set(auth(t.asha)).send({ technical: { approach: 'Trenching with HDD crossings under the access road and megger testing.', experience: '30 km of LT cabling laid in 2025.', timelineWeeks: 3 }, commercial: { amount: 8_40_000_00, validityDays: 60, paymentTerms: '50% on laying, 50% on testing' } }).expect(200);
    await api(app).post(`/v1/tenders/${id}/bid/submit`).set(auth(t.asha)).set('Idempotency-Key', key()).expect(200);
    await pool.query("update tenders set closes_at = now() - interval '1 minute' where id = $1", [id]);
    await api(app).post(`/v1/tenders/${id}/close`).set(auth(t.uniteAdmin)).expect(200);
    await api(app).post(`/v1/tenders/${id}/open`).set(auth(t.uniteAdmin)).expect(200);
    const bidId = (await api(app).get(`/v1/tenders/${id}/technical`).set(auth(t.evaluator)).expect(200)).body.bids[0].id;
    await api(app).post(`/v1/tenders/${id}/bids/${bidId}/scores`).set(auth(t.evaluator)).send({ kind: 'technical', score: 80, comment: 'Sound method' }).expect(201);
    await api(app).post(`/v1/tenders/${id}/technical/complete`).set(auth(t.uniteAdmin)).expect(200);
    await api(app).post(`/v1/tenders/${id}/bids/${bidId}/scores`).set(auth(t.evaluator)).send({ kind: 'commercial', score: 85, comment: 'Fair price' }).expect(201);
    await api(app).post(`/v1/tenders/${id}/award`).set(auth(t.uniteAdmin)).set('Idempotency-Key', key()).send({ bidId, reason: 'Only qualified bid, price within budget.' }).expect(200);
    return id;
  }

  beforeAll(async () => {
    await resetDatabase(); refs = await seed(); app = await bootApp(); t = await loginAll(app);
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    tenderId = await awardedTender();
  });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('074 award documents: only the issuer drafts them, only after award, one per kind, prefilled from the award', async () => {
    const seeded = (await pool.query("select id from tenders where code = 'TND-2026-000001'")).rows[0].id;
    await api(app).post(`/v1/tenders/${seeded}/contracts`).set(auth(t.uniteAdmin)).send({ kind: 'loi' }).expect(409); // not awarded
    await api(app).post(`/v1/tenders/${tenderId}/contracts`).set(auth(t.asha)).send({ kind: 'loi' }).expect(404); // winner is not the issuer
    const r = await api(app).post(`/v1/tenders/${tenderId}/contracts`).set(auth(t.uniteAdmin)).send({ kind: 'loi' }).expect(201);
    loi = r.body;
    expect(loi).toMatchObject({ kind: 'loi', status: 'draft', value: 8_40_000_00, counterparty: 'Volt EPC', issuer: 'Unite Solar', party: 'issuer' });
    expect(loi.code).toMatch(/^CTR-\d{4}-\d{6}$/);
    expect(loi.versions[0].body).toMatch(/LETTER OF INTENT[\s\S]*SUBJECT TO LEGAL REVIEW[\s\S]*INR 8,40,000\.00/);
    expect(loi.permissions).toMatchObject({ edit: true, submit: true, review: false, sign: false });
    await api(app).post(`/v1/tenders/${tenderId}/contracts`).set(auth(t.uniteAdmin)).send({ kind: 'loi' }).expect(409);
    // The counterparty cannot see an internal draft
    await api(app).get(`/v1/contracts/${loi.id}`).set(auth(t.asha)).expect(404);
    expect((await api(app).get('/v1/contracts').set(auth(t.asha)).expect(200)).body.map((c: any) => c.id)).not.toContain(loi.id);
    await api(app).get(`/v1/contracts/${loi.id}`).set(auth(t.ravi)).expect(404);
  });

  it('drafts are editable until submitted; review needs a second person; rejection forces a new version', async () => {
    const edited = loi.versions[0].body + '\nSpecial condition: site access only between 08:00 and 18:00.';
    let r = await api(app).put(`/v1/contracts/${loi.id}/draft`).set(auth(t.uniteAdmin)).send({ body: edited, terms: { value: 8_40_000_00 } }).expect(200);
    expect(r.body.versions).toHaveLength(1); // edited in place before submission
    await api(app).put(`/v1/contracts/${loi.id}/draft`).set(auth(t.uniteAdmin)).send({ body: 'too short' }).expect(400);
    r = await api(app).post(`/v1/contracts/${loi.id}/submit`).set(auth(t.uniteAdmin)).expect(200);
    expect(r.body.status).toBe('in_review');
    expect(r.body.permissions.reviewBlockedReason).toMatch(/another approver/);
    await api(app).put(`/v1/contracts/${loi.id}/draft`).set(auth(t.uniteAdmin)).send({ body: edited + ' more' }).expect(409);
    await api(app).post(`/v1/contracts/${loi.id}/review`).set(auth(t.uniteAdmin)).send({ decision: 'approve' }).expect(403); // author
    await api(app).post(`/v1/contracts/${loi.id}/review`).set(auth(t.asha)).send({ decision: 'approve' }).expect(404); // counterparty cannot even see it
    await api(app).post(`/v1/contracts/${loi.id}/review`).set(auth(t.evaluator)).send({ decision: 'reject' }).expect(400);
    r = await api(app).post(`/v1/contracts/${loi.id}/review`).set(auth(t.evaluator)).send({ decision: 'reject', note: 'State the 30-day lapse explicitly.' }).expect(200);
    expect(r.body.status).toBe('draft');
    // A submitted version's text cannot change — not through the API and not through SQL
    const v1 = r.body.versions[0];
    await expect(pool.query("update contract_versions set body = body || ' tampered' where id = $1", [v1.id])).rejects.toThrow(/submitted for review/);
    r = await api(app).put(`/v1/contracts/${loi.id}/draft`).set(auth(t.uniteAdmin)).send({ body: edited + '\nThis letter lapses 30 days after issue.', changeNote: 'Lapse clause per review' }).expect(200);
    expect(r.body.versions.map((v: any) => v.versionNo)).toEqual([1, 2]);
    expect(r.body.versions[0]).toMatchObject({ locked: true, rejectedBy: 'Lakshmi Rao (Unite Solar Tender Evaluator)' });
    await api(app).post(`/v1/contracts/${loi.id}/submit`).set(auth(t.uniteAdmin)).expect(200);
    r = await api(app).post(`/v1/contracts/${loi.id}/review`).set(auth(t.evaluator)).send({ decision: 'approve', note: 'Approved' }).expect(200);
    expect(r.body).toMatchObject({ status: 'approved', approvedVersionId: r.body.versions[1].id });
    loi = r.body;
  });

  it('GATE: an approved version cannot be changed or deleted by any path', async () => {
    const v2 = loi.versions[1];
    await api(app).put(`/v1/contracts/${loi.id}/draft`).set(auth(t.uniteAdmin)).send({ body: v2.body + ' edit' }).expect(409);
    await api(app).post(`/v1/contracts/${loi.id}/submit`).set(auth(t.uniteAdmin)).expect(409);
    await expect(pool.query("update contract_versions set body = 'replaced', body_hash = 'x' where id = $1", [v2.id])).rejects.toThrow(/approved and immutable/);
    await expect(pool.query('update contract_versions set review_note = $2 where id = $1', [v2.id, 'quiet change'])).rejects.toThrow(/approved and immutable/);
    await expect(pool.query('delete from contract_versions where id = $1', [v2.id])).rejects.toThrow(/cannot be deleted/);
    const row = (await pool.query('select body, body_hash from contract_versions where id = $1', [v2.id])).rows[0];
    expect(row.body).toBe(v2.body);
    expect(row.body_hash).toBe(v2.bodyHash);
  });

  it('signing binds to the approved hash; both parties sign to execute; signatures are append-only', async () => {
    const seen = await api(app).get(`/v1/contracts/${loi.id}`).set(auth(t.asha)).expect(200);
    expect(seen.body.party).toBe('counterparty');
    expect(seen.body.versions.map((v: any) => v.versionNo)).toEqual([2]); // rejected internal version hidden
    expect(seen.body.permissions.sign).toBe(true);
    const hash = seen.body.versions[0].bodyHash;
    await api(app).post(`/v1/contracts/${loi.id}/sign`).set(auth(t.asha)).set('Idempotency-Key', key()).send({ typedName: 'Asha Patil', consent: true, bodyHash: '0'.repeat(64) }).expect(409);
    await api(app).post(`/v1/contracts/${loi.id}/sign`).set(auth(t.asha)).set('Idempotency-Key', key()).send({ typedName: 'Asha Patil', bodyHash: hash }).expect(400); // no consent
    await api(app).post(`/v1/contracts/${loi.id}/sign`).set(auth(t.rohit)).set('Idempotency-Key', key()).send({ typedName: 'Rohit Deshmukh', consent: true, bodyHash: hash }).expect(403);
    await api(app).post(`/v1/contracts/${loi.id}/sign`).set(auth(t.asha)).send({ typedName: 'Asha Patil', consent: true, bodyHash: hash }).expect(400); // idempotency key required
    let r = await api(app).post(`/v1/contracts/${loi.id}/sign`).set(auth(t.asha)).set('Idempotency-Key', key()).send({ typedName: 'Asha Patil', title: 'Director', consent: true, bodyHash: hash }).expect(200);
    expect(r.body.status).toBe('partially_signed');
    await api(app).post(`/v1/contracts/${loi.id}/sign`).set(auth(t.asha)).set('Idempotency-Key', key()).send({ typedName: 'Asha Patil', consent: true, bodyHash: hash }).expect(409);
    r = await api(app).post(`/v1/contracts/${loi.id}/sign`).set(auth(t.uniteAdmin)).set('Idempotency-Key', key()).send({ typedName: 'Sanjay Kulkarni', consent: true, bodyHash: hash }).expect(200);
    expect(r.body).toMatchObject({ status: 'executed' });
    expect(r.body.signatures.map((s: any) => s.organization)).toEqual(['Volt EPC', 'Unite Solar']);
    expect(r.body.signatures.every((s: any) => s.bodyHash === hash)).toBe(true);
    await expect(pool.query("update contract_signatures set typed_name = 'Someone Else' where contract_id = $1", [loi.id])).rejects.toThrow(/append-only/);
    await expect(pool.query('delete from contract_signatures where contract_id = $1', [loi.id])).rejects.toThrow(/append-only/);
    loi = r.body;
  });

  it('downloads carry the hash; the counterparty cannot fetch internal versions', async () => {
    const v2 = loi.versions.find((v: any) => v.versionNo === 2);
    const d = await api(app).get(`/v1/contracts/${loi.id}/versions/${v2.id}/text`).set(auth(t.asha)).expect(200);
    expect(d.headers['x-content-sha256']).toBe(v2.bodyHash);
    expect(d.text).toContain(`SHA-256 ${v2.bodyHash}`);
    const full = await api(app).get(`/v1/contracts/${loi.id}`).set(auth(t.uniteAdmin)).expect(200);
    await api(app).get(`/v1/contracts/${loi.id}/versions/${full.body.versions[0].id}/text`).set(auth(t.asha)).expect(404);
  });

  it('amendments supersede the original only once executed', async () => {
    await api(app).post(`/v1/contracts/${loi.id}/amend`).set(auth(t.asha)).expect(403);
    let r = await api(app).post(`/v1/contracts/${loi.id}/amend`).set(auth(t.uniteAdmin)).expect(201);
    amendment = r.body;
    expect(amendment).toMatchObject({ status: 'draft', supersedesId: loi.id });
    expect(amendment.versions[0].body).toContain(`amends ${loi.code}`);
    await api(app).post(`/v1/contracts/${loi.id}/amend`).set(auth(t.uniteAdmin)).expect(409);
    await api(app).put(`/v1/contracts/${amendment.id}/draft`).set(auth(t.uniteAdmin)).send({ body: amendment.versions[0].body + '\nAmendment 1: value revised for an additional 200 m of cable.', terms: { value: 9_20_000_00 } }).expect(200);
    await api(app).post(`/v1/contracts/${amendment.id}/submit`).set(auth(t.uniteAdmin)).expect(200);
    r = await api(app).post(`/v1/contracts/${amendment.id}/review`).set(auth(t.evaluator)).send({ decision: 'approve' }).expect(200);
    const hash = r.body.versions[0].bodyHash;
    expect((await api(app).get(`/v1/contracts/${loi.id}`).set(auth(t.asha)).expect(200)).body.status).toBe('executed'); // still in force
    await api(app).post(`/v1/contracts/${amendment.id}/sign`).set(auth(t.uniteAdmin)).set('Idempotency-Key', key()).send({ typedName: 'Sanjay Kulkarni', consent: true, bodyHash: hash }).expect(200);
    r = await api(app).post(`/v1/contracts/${amendment.id}/sign`).set(auth(t.asha)).set('Idempotency-Key', key()).send({ typedName: 'Asha Patil', consent: true, bodyHash: hash }).expect(200);
    expect(r.body).toMatchObject({ status: 'executed', value: 9_20_000_00 });
    const orig = await api(app).get(`/v1/contracts/${loi.id}`).set(auth(t.asha)).expect(200);
    expect(orig.body).toMatchObject({ status: 'superseded', supersededById: amendment.id });
    expect(orig.body.permissions.amend).toBe(false);
  });

  it('termination: issuer only, executed only, with a reason', async () => {
    await api(app).post(`/v1/contracts/${loi.id}/terminate`).set(auth(t.uniteAdmin)).send({ reason: 'Superseded contracts cannot be terminated' }).expect(409);
    await api(app).post(`/v1/contracts/${amendment.id}/terminate`).set(auth(t.asha)).send({ reason: 'Counterparty attempts termination' }).expect(403);
    await api(app).post(`/v1/contracts/${amendment.id}/terminate`).set(auth(t.uniteAdmin)).send({ reason: 'short' }).expect(400);
    const r = await api(app).post(`/v1/contracts/${amendment.id}/terminate`).set(auth(t.uniteAdmin)).send({ reason: 'Project descoped by the customer; settlement per clause 5.' }).expect(200);
    expect(r.body).toMatchObject({ status: 'terminated', terminationReason: 'Project descoped by the customer; settlement per clause 5.' });
  });

  it('148 vault gathers my organization’s contracts, agreements, KYB documents, NDAs and certificates — and nobody else’s', async () => {
    const v = await api(app).get('/v1/vault').set(auth(t.asha)).expect(200);
    expect(v.body.contracts.map((c: any) => c.id)).toEqual(expect.arrayContaining([loi.id, amendment.id]));
    expect(v.body.agreements.length).toBeGreaterThan(0);
    expect(v.body.agreements[0]).toMatchObject({ docHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(v.body.ndas.map((n: any) => n.code)).toContain('TM-000001');
    expect(Array.isArray(v.body.verification)).toBe(true);
    expect(v.body.verification.every((d: any) => d.objectKey === undefined)).toBe(true);
    expect(Array.isArray(v.body.certificates)).toBe(true);
    const other = await api(app).get('/v1/vault').set(auth(t.ravi)).expect(200);
    expect(other.body.contracts.map((c: any) => c.id)).not.toContain(loi.id);
    expect(other.body.ndas.map((n: any) => n.code)).not.toContain('TM-000001'); // Sunrise was invited but never signed
    const audit = await pool.query("select action from audit_events where object_id = $1 order by seq", [loi.id]);
    expect(audit.rows.map((r) => r.action)).toEqual(expect.arrayContaining(['contract.created', 'contract.in_review', 'contract.approved', 'contract.partially_signed', 'contract.executed', 'contract.signed', 'contract.superseded']));
  });
});
