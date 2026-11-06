import type { INestApplication } from '@nestjs/common';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('Stage 07 — CRM & pipeline (gate: sales stage transitions and activity audit)', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pipe: any;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pipe = (await api(app).get('/v1/crm/pipeline').set(auth(t.asha)).expect(200)).body; });
  afterAll(() => app?.close());
  const deal = (title: string) => pipe.columns.flatMap((c: any) => c.deals).find((d: any) => d.title.startsWith(title));

  it('053 pipeline groups deals by stage with metrics; scoped to the tenant', async () => {
    expect(pipe.columns.map((c: any) => c.stage)).toEqual(['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']);
    expect(pipe.metrics.open).toBe(3);
    expect(pipe.metrics.winRate).toBe(0);
    const other = await api(app).get('/v1/crm/pipeline').set(auth(t.ravi)).expect(200);
    expect(other.body.metrics.open).toBe(0);
  });

  it('stage moves are versioned, audited and written to the activity history', async () => {
    const d = deal('400 kW');
    await api(app).post(`/v1/crm/deals/${d.id}/move`).set(auth(t.asha)).send({ stage: 'proposal', note: 'Sent techno-commercial offer', expectedVersion: 99 }).expect(409);
    const r = await api(app).post(`/v1/crm/deals/${d.id}/move`).set(auth(t.asha)).send({ stage: 'proposal', note: 'Sent techno-commercial offer', expectedVersion: d.version }).expect(200);
    expect(r.body.version).toBe(d.version + 1);
    const c = await api(app).get(`/v1/crm/customers/${d.customerId}`).set(auth(t.asha)).expect(200);
    expect(c.body.activities.find((a: any) => a.kind === 'stage_change').body).toMatch(/qualified → proposal — Sent techno-commercial offer/);
    const a = await api(app).get(`/v1/admin/audit?objectId=${d.id}`).set(auth(t.compliance)).expect(200);
    expect(a.body[0]).toMatchObject({ action: 'crm.deal_stage_changed' });
  });

  it('lost requires a reason; won/lost are terminal', async () => {
    const d = deal('O&M renewal');
    await api(app).post(`/v1/crm/deals/${d.id}/move`).set(auth(t.asha)).send({ stage: 'lost' }).expect(400);
    await api(app).post(`/v1/crm/deals/${d.id}/move`).set(auth(t.asha)).send({ stage: 'won', note: 'PO received' }).expect(200);
    await api(app).post(`/v1/crm/deals/${d.id}/move`).set(auth(t.asha)).send({ stage: 'negotiation' }).expect(400);
    const p = await api(app).get('/v1/crm/pipeline').set(auth(t.asha)).expect(200);
    expect(p.body.metrics.winRate).toBe(50);
  });

  it('customers, deals, tasks and activities are invisible across tenants (404)', async () => {
    const d = deal('1.5 MW');
    await api(app).get(`/v1/crm/customers/${d.customerId}`).set(auth(t.ravi)).expect(404);
    await api(app).post(`/v1/crm/deals/${d.id}/move`).set(auth(t.ravi)).send({ stage: 'won' }).expect(404);
    await api(app).post('/v1/crm/activities').set(auth(t.ravi)).send({ subjectType: 'deal', subjectId: d.id, kind: 'note', body: 'sneaky' }).expect(404);
    await api(app).post('/v1/crm/tasks').set(auth(t.ravi)).send({ title: 'Probe another tenant', dueAt: new Date().toISOString(), dealId: d.id }).expect(404);
    const tasks = await api(app).get('/v1/crm/tasks').set(auth(t.ravi)).expect(200);
    expect(tasks.body).toHaveLength(0);
  });

  it('028 tasks: assign within org only, notify assignee, complete and log', async () => {
    const d = deal('1.5 MW');
    const me = await api(app).get('/v1/auth/me').set(auth(t.ravi));
    await api(app).post('/v1/crm/tasks').set(auth(t.asha)).send({ title: 'Assign outside org', dueAt: new Date().toISOString(), assigneeUserId: me.body.id }).expect(400);
    const rohit = (await api(app).get('/v1/orgs/current/members').set(auth(t.asha))).body.find((m: any) => m.email === 'rohit@voltepc.example');
    const r = await api(app).post('/v1/crm/tasks').set(auth(t.asha)).send({ title: 'Collect roof structural report', dueAt: new Date(Date.now() + 86400_000).toISOString(), assigneeUserId: rohit.userId, dealId: d.id, customerId: d.customerId }).expect(201);
    const n = await api(app).get('/v1/me/notifications').set(auth(t.rohit)).expect(200);
    expect(n.body[0].title).toMatch(/Collect roof structural report/);
    await api(app).patch(`/v1/crm/tasks/${r.body.id}`).set(auth(t.asha)).send({ status: 'done' }).expect(200);
    const window = await api(app).get(`/v1/crm/tasks?from=${new Date(Date.now() - 7 * 86400_000).toISOString()}&to=${new Date(Date.now() + 7 * 86400_000).toISOString()}`).set(auth(t.asha)).expect(200);
    expect(window.body.find((x: any) => x.id === r.body.id).status).toBe('done');
  });

  it('030 activity centre merges CRM activity and audit trail with task counts', async () => {
    const r = await api(app).get('/v1/crm/activity').set(auth(t.asha)).expect(200);
    expect(r.body.items.some((i: any) => i.source === 'crm')).toBe(true);
    expect(r.body.items.some((i: any) => i.source === 'audit')).toBe(true);
    expect(r.body.tasks.overdue).toBeGreaterThanOrEqual(1);
  });

  it('a registered lead opens a CRM deal; 054 timeline merges lead lifecycle and CRM history', async () => {
    const lead = await api(app).post('/v1/leads').set(auth(t.asha)).set('Idempotency-Key', 'crm-lead-0001').send({
      customer: { legalName: 'Sahyadri Dairy Co-op', taxId: '27AAASD4444D1Z4', contactName: 'R. More', city: 'Satara', country: 'IN' }, sector: 'solar', productOrProject: '300 kW rooftop solar', estimatedValue: 1_35_00_000_00,
      requirements: 'Dairy plant roof, 300 kW with export limiting.', consent: { method: 'meeting_minutes', obtainedAt: new Date(Date.now() - 86400_000).toISOString(), disclosureScope: 'unite_only' }, evidenceSummary: 'Signed minutes from board meeting.',
    }).expect(201);
    const p = await api(app).get('/v1/crm/pipeline').set(auth(t.asha)).expect(200);
    const d = p.body.columns[0].deals.find((x: any) => x.leadClaimId === lead.body.claim.id);
    expect(d).toMatchObject({ stage: 'new', title: '300 kW rooftop solar' });
    await api(app).post('/v1/crm/activities').set(auth(t.asha)).send({ subjectType: 'lead', subjectId: lead.body.claim.id, kind: 'call', body: 'Called MD; site visit agreed for Monday.' }).expect(201);
    const tl = await api(app).get(`/v1/leads/${lead.body.claim.id}/timeline`).set(auth(t.asha)).expect(200);
    const kinds = tl.body.items.map((i: any) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['status', 'routing', 'system', 'call']));
    expect(tl.body.deal.id).toBe(d.id);
    await api(app).get(`/v1/leads/${lead.body.claim.id}/timeline`).set(auth(t.ravi)).expect(404);
  });
});
