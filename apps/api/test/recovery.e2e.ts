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
});
