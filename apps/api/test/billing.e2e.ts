import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('COLLABIZ plans — Unite sets prices and publishes; companies request; finance activates on payment', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('every company starts on Free; unpriced plans are not offered', async () => {
    const b = (await api(app).get('/v1/billing').set(auth(t.asha)).expect(200)).body;
    expect(b.subscription).toMatchObject({ plan: 'free', status: 'active' });
    expect(b.plans.map((p: any) => p.code)).toEqual(['free']);
    expect(b.comingSoon.map((p: any) => p.code)).toEqual(['growth', 'pro']);
    expect(b.usage.find((u: any) => u.key === 'teamMembers')).toMatchObject({ limit: 3 });
    expect(b.note).toMatch(/not enforced/);
    await api(app).post('/v1/billing/request').set(auth(t.asha)).send({ plan: 'growth', cycle: 'monthly' }).expect(400);
    expect((await api(app).post('/v1/billing/pay-online').set(auth(t.asha)).expect(503)).body.message).toMatch(/payment gateway|not connected/i);
  });

  it('only a super admin prices and publishes; publishing needs a price', async () => {
    const draft = { name: 'Growth', description: 'For active partners.', priceMonthly: 4_999_00, priceYearly: 49_990_00, limits: { leadsPerMonth: 50, teamMembers: 15, gstDocsPerMonth: 200, importsPerMonth: 20 }, features: ['Everything in Free', 'GST JSON'] };
    await api(app).put('/v1/admin/billing/plans/growth').set(auth(t.finance)).send(draft).expect(403);
    await api(app).post('/v1/admin/billing/plans/pro/publish').set(auth(t.superadmin)).expect(400); // no price yet
    expect((await api(app).put('/v1/admin/billing/plans/growth').set(auth(t.superadmin)).send(draft).expect(200)).body).toMatchObject({ priced: true, yearlySavingPct: 17, status: 'draft' });
    expect((await api(app).post('/v1/admin/billing/plans/growth/publish').set(auth(t.superadmin)).expect(200)).body.status).toBe('published');
  });

  it('a company requests; finance activates against a bank reference', async () => {
    await api(app).post('/v1/billing/request').set(auth(t.rohit)).send({ plan: 'growth', cycle: 'yearly' }).expect(403);
    expect((await api(app).post('/v1/billing/request').set(auth(t.asha)).send({ plan: 'growth', cycle: 'yearly' }).expect(200)).body.subscription).toMatchObject({ plan: 'free', status: 'requested', requestedPlan: 'growth' });
    const adm = (await api(app).get('/v1/admin/billing').set(auth(t.finance)).expect(200)).body;
    const req = adm.requests.find((r: any) => r.organization === 'Volt EPC');
    expect(req).toMatchObject({ requested: 'growth', cycle: 'yearly' });
    await api(app).post(`/v1/admin/billing/requests/${req.orgId}/activate`).set(auth(t.finance)).send({ paymentReference: 'UTR HDFC000123', periodEnd: '2020-01-01' }).expect(400);
    await api(app).post(`/v1/admin/billing/requests/${req.orgId}/activate`).set(auth(t.finance)).send({ paymentReference: 'UTR HDFC000123', periodEnd: '2027-11-30' }).expect(200);
    const b = (await api(app).get('/v1/billing').set(auth(t.asha)).expect(200)).body;
    expect(b.subscription).toMatchObject({ plan: 'growth', status: 'active', cycle: 'yearly', periodEnd: '2027-11-30' });
    expect(b.usage.find((u: any) => u.key === 'teamMembers').limit).toBe(15);
    expect((await one("select count(*)::int n from audit_events where action like 'billing.%'")).n).toBe(4);
  });
});
