/** Reusable end-to-end flows through the public API, so later stages start from real upstream state. */
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import { api, auth } from './helpers';
import type { SeedRefs } from '../src/db/seed';

let n = 0;
export const idemKey = (p = 'flow') => `${p}-${++n}-${Date.now()}`;

/** Unite Solar tenders; Volt EPC wins at `amount` (minor units). Returns the tender id. */
export async function awardTender(app: INestApplication, t: Record<string, string>, refs: SeedRefs, pool: Pool, amount = 8_40_000_00, title = 'Cable laying for Chakan rooftop') {
  const r = await api(app).post('/v1/tenders').set(auth(t.uniteAdmin)).send({ title, scope: 'Supply and lay 2 km of 4C x 300 sq mm armoured cable with terminations and testing.', sector: 'solar', closesAt: new Date(Date.now() + 2 * 86400_000).toISOString() }).expect(201);
  const id = r.body.id;
  await api(app).post(`/v1/tenders/${id}/documents`).set(auth(t.uniteAdmin)).field('title', 'Cable schedule').attach('file', Buffer.from('%PDF-1.4 cables'), { filename: 'cables.pdf', contentType: 'application/pdf' }).expect(201);
  await api(app).post(`/v1/tenders/${id}/evaluators`).set(auth(t.uniteAdmin)).send({ userId: refs.users.evaluator, role: 'both' }).expect(201);
  await api(app).post(`/v1/tenders/${id}/publish`).set(auth(t.uniteAdmin)).expect(200);
  await api(app).put(`/v1/tenders/${id}/bid`).set(auth(t.asha)).send({ technical: { approach: 'Trenching with HDD crossings under the access road and megger testing.', experience: '30 km of LT cabling laid in 2025.', timelineWeeks: 3 }, commercial: { amount, validityDays: 60, paymentTerms: '50% on laying, 50% on testing' } }).expect(200);
  await api(app).post(`/v1/tenders/${id}/bid/submit`).set(auth(t.asha)).set('Idempotency-Key', idemKey()).expect(200);
  await pool.query("update tenders set closes_at = now() - interval '1 minute' where id = $1", [id]);
  await api(app).post(`/v1/tenders/${id}/close`).set(auth(t.uniteAdmin)).expect(200);
  await api(app).post(`/v1/tenders/${id}/open`).set(auth(t.uniteAdmin)).expect(200);
  const bidId = (await api(app).get(`/v1/tenders/${id}/technical`).set(auth(t.evaluator)).expect(200)).body.bids[0].id;
  await api(app).post(`/v1/tenders/${id}/bids/${bidId}/scores`).set(auth(t.evaluator)).send({ kind: 'technical', score: 80, comment: 'Sound method' }).expect(201);
  await api(app).post(`/v1/tenders/${id}/technical/complete`).set(auth(t.uniteAdmin)).expect(200);
  await api(app).post(`/v1/tenders/${id}/bids/${bidId}/scores`).set(auth(t.evaluator)).send({ kind: 'commercial', score: 85, comment: 'Fair price' }).expect(201);
  await api(app).post(`/v1/tenders/${id}/award`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).send({ bidId, reason: 'Only qualified bid, price within budget.' }).expect(200);
  return id;
}

/** Award → work order drafted, approved by a second person, signed by both parties. Returns the executed contract. */
export async function executedContract(app: INestApplication, t: Record<string, string>, refs: SeedRefs, pool: Pool, amount?: number) {
  const tenderId = await awardTender(app, t, refs, pool, amount);
  const c = (await api(app).post(`/v1/tenders/${tenderId}/contracts`).set(auth(t.uniteAdmin)).send({ kind: 'work_order' }).expect(201)).body;
  await api(app).post(`/v1/contracts/${c.id}/submit`).set(auth(t.uniteAdmin)).expect(200);
  const ap = (await api(app).post(`/v1/contracts/${c.id}/review`).set(auth(t.evaluator)).send({ decision: 'approve' }).expect(200)).body;
  const hash = ap.versions[ap.versions.length - 1].bodyHash;
  await api(app).post(`/v1/contracts/${c.id}/sign`).set(auth(t.asha)).set('Idempotency-Key', idemKey()).send({ typedName: 'Asha Patil', consent: true, bodyHash: hash }).expect(200);
  const ex = (await api(app).post(`/v1/contracts/${c.id}/sign`).set(auth(t.uniteAdmin)).set('Idempotency-Key', idemKey()).send({ typedName: 'Sanjay Kulkarni', consent: true, bodyHash: hash }).expect(200)).body;
  return { tenderId, contract: ex };
}
