import type { INestApplication } from '@nestjs/common';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

/** UI recovery (Phase C): data contracts behind the redesigned priority screens. */
describe('Recovery — partner home and public figures', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); });
  afterAll(() => app?.close());

  it('023 home returns figures, next actions, pipeline, recommendations and readable activity', async () => {
    const r = await api(app).get('/v1/me/home').set(auth(t.asha)).expect(200);
    expect(Object.keys(r.body).sort()).toEqual(['actions', 'activity', 'figures', 'pipeline', 'recommendations']);
    expect(r.body.figures).toMatchObject({ activeProjects: 1, pipelineValue: expect.any(Number), projected: expect.any(Number) });
    for (const a of r.body.activity) expect(a.text).not.toMatch(/[._]/); // plain language, never raw audit codes
  });

  it('023 next actions are specific to the active organization', async () => {
    const ravi = await api(app).get('/v1/me/home').set(auth(t.ravi)).expect(200);
    expect(ravi.body.actions).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'team', title: 'Join Chakan Rooftop Consortium', href: '/collaboration/requests' })]));
    const asha = await api(app).get('/v1/me/home').set(auth(t.asha)).expect(200);
    expect(asha.body.actions.find((a: any) => a.kind === 'team')).toBeUndefined(); // Volt leads that team
    const admin = await api(app).get('/v1/me/home').set(auth(t.superadmin)).expect(200); // platform org: nothing from partner organizations leaks in
    expect(admin.body.actions).toEqual([]); expect(admin.body.figures.activeProjects).toBe(0);
  });

  it('032 031 paged marketplace returns a page, the total, per-source counts and honours sort', async () => {
    const r = await api(app).get('/v1/opportunities?paged=true&limit=2').set(auth(t.asha)).expect(200);
    expect(r.body.items).toHaveLength(2);
    expect(r.body.total).toBeGreaterThan(2);
    expect(r.body.counts.all).toBe(r.body.total);
    expect(r.body.counts.unite + r.body.counts.exchange).toBeLessThanOrEqual(r.body.counts.all);
    const p2 = await api(app).get('/v1/opportunities?paged=true&limit=2&offset=2').set(auth(t.asha)).expect(200);
    expect(p2.body.items.map((o: any) => o.id)).not.toContain(r.body.items[0].id);
    const byValue = await api(app).get('/v1/opportunities?paged=true&sort=value&limit=50').set(auth(t.asha)).expect(200);
    const values = byValue.body.items.map((o: any) => o.estimatedValue ?? -1);
    expect(values).toEqual([...values].sort((a: number, b: number) => b - a));
    const unite = await api(app).get('/v1/opportunities?paged=true&scope=unite').set(auth(t.asha)).expect(200);
    expect(unite.body.total).toBe(r.body.counts.unite);
    expect(unite.body.items.every((o: any) => o.route === 'unite_owned')).toBe(true);
    // The plain array form used by other screens is unchanged.
    expect(Array.isArray((await api(app).get('/v1/opportunities').set(auth(t.asha)).expect(200)).body)).toBe(true);
  });

  it('036 eligibility labels are written for people, not codes', async () => {
    const [o] = (await api(app).get('/v1/opportunities?q=OPP-2026-00003').set(auth(t.asha)).expect(200)).body;
    const e = await api(app).get(`/v1/opportunities/${o.id}/eligibility`).set(auth(t.asha)).expect(200);
    const level = e.body.checks.find((c: any) => c.key === 'level');
    expect(level.label).toBe('Membership level');
    expect(level.detail).toMatch(/^Requires Verified partner or above · you are \w+ partner$/);
    expect(e.body.checks.find((c: any) => c.key === 'certifications').detail).toBe('Missing: ISO45001');
  });

  it('137 paged tender register: search, stage groups, summary and integrity exceptions; platform only', async () => {
    await api(app).get('/v1/admin/tenders?paged=true').set(auth(t.asha)).expect(403);
    const r = await api(app).get('/v1/admin/tenders?paged=true&limit=5').set(auth(t.superadmin)).expect(200);
    expect(Object.keys(r.body.summary).sort()).toEqual(['all', 'awarded', 'cancelled', 'closingSoon', 'draft', 'evaluating', 'live']);
    expect(r.body.total).toBe(r.body.summary.all);
    expect(Array.isArray(r.body.attention)).toBe(true);
    const live = await api(app).get('/v1/admin/tenders?paged=true&stage=live').set(auth(t.superadmin)).expect(200);
    expect(live.body.total).toBe(r.body.summary.live);
    expect(live.body.items.every((x: any) => x.status === 'published')).toBe(true);
    if (r.body.items[0]) {
      const code = r.body.items[0].code;
      const found = await api(app).get(`/v1/admin/tenders?paged=true&q=${code}`).set(auth(t.superadmin)).expect(200);
      expect(found.body.items.map((x: any) => x.code)).toContain(code);
    }
    const none = await api(app).get('/v1/admin/tenders?paged=true&q=zz-no-such-tender').set(auth(t.superadmin)).expect(200);
    expect(none.body).toMatchObject({ total: 0, items: [] });
  });

  it('guest sign-in flag is public and exposes nothing but demo mode', async () => {
    const r = await api(app).get('/v1/public/demo').expect(200);
    expect(Object.keys(r.body)).toEqual(['demoMode']);
  });
});
