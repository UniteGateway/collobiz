import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('V2 Phase 3 — country desks and opportunity-to-revenue intelligence', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('a country desk joins the market facts, representatives, opportunities and my enquiries', async () => {
    await api(app).get('/v1/global/desks/IN').set(auth(t.asha)).expect(400);
    await api(app).get('/v1/global/desks/XX').set(auth(t.asha)).expect(400);
    const d = (await api(app).get('/v1/global/desks/ae').set(auth(t.asha)).expect(200)).body;
    expect(d).toMatchObject({ country: 'AE', name: 'United Arab Emirates', currency: 'AED', languages: 'Arabic, English', checklistLink: expect.stringContaining('destination=AE') });
    expect(Array.isArray(d.representatives) && Array.isArray(d.opportunities) && Array.isArray(d.enquiries)).toBe(true);
    expect(d.pendingApplications).toEqual([]); // partners do not see other companies' applications
  });

  it('revenue intelligence keeps pipeline, booked, invoiced and collected apart', async () => {
    await api(app).get('/v1/admin/analytics/revenue').set(auth(t.asha)).expect(403);
    const r = (await api(app).get('/v1/admin/analytics/revenue').set(auth(t.finance)).expect(200)).body;
    expect(r.funnel.map((f: any) => f.kind)).toEqual(['pipeline', 'pipeline', 'pipeline', 'pipeline', 'booked', 'invoiced', 'collected', 'settled']);
    // Demo invoices: ₹5.4 crore invoiced; ₹3.2 crore collected (one paid in full, one 60%).
    expect(r.totals).toMatchObject({ invoiced: 5_40_00_000_00, collected: 3_20_00_000_00, outstanding: 2_20_00_000_00 });
    expect(r.aging.reduce((a: number, b: any) => a + b.amount, 0)).toBe(2_20_00_000_00);
    expect(r.aging.find((b: any) => b.label === '1–30 days overdue').amount).toBe(80_00_000_00);
    expect(r.losses.deals.length).toBeGreaterThan(0);
    expect(r.bySector[0]).toHaveProperty('label');
    expect(r.note).toMatch(/must not be added together/);
  });
});
