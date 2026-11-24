/**
 * COLLABIZ VENTURE AI — the Solar Conveyor pilot workflow end to end (opportunity → evidence → score → finance → conveyor sizing →
 * submit → Unite approval → Venture Room → role matching → consent-based invitations → tasks → human approvals → agents) and the
 * controls: permissions, no contact leaks, blocked checks, kill switch, budget, labelled rules output and sample pilots.
 */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

const CR = 1e7 * 100; // ₹1 crore in paise
const all = (v: number, evidence = 'some') => Object.fromEntries(['market_demand', 'profitability', 'supplier_readiness', 'competitive_advantage', 'capital_availability', 'member_capability', 'scalability', 'regulatory_readiness'].map((k) => [k, { value: v, evidence }]));
const opportunity = {
  title: 'Solar Conveyor for quarries in Telangana', type: 'combination',
  problem: 'Quarry conveyors run 10 hours a day on diesel or grid power and power is a large share of operating cost.',
  marketGap: 'Conveyor makers and solar EPC firms sell separately; nobody sells a packaged solar-assisted conveyor.',
  targetCustomers: 'Quarries and aggregate plants', proposedSolution: 'Package a conveyor, PV array, LFP battery and drives with monitoring as one product.',
  investmentPaise: 2 * CR, countries: ['IN'],
  roles: [{ role: 'manufacturer', count: 1, categories: ['Conveyors'] }, { role: 'investor', count: 1 }, { role: 'distributor', count: 2 }],
  evidence: [{ kind: 'assumption', statement: 'Quarries run conveyors on most days of the year' }],
};

describe('COLLABIZ VENTURE AI', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const get = (p: string, tok: string) => api(app).get(`/v1${p}`).set(auth(tok));
  const post = (p: string, b: object, tok: string) => api(app).post(`/v1${p}`).set(auth(tok)).send(b);
  const put = (p: string, b: object, tok: string) => api(app).put(`/v1${p}`).set(auth(tok)).send(b);
  let oppId = ''; let roomId = ''; let vikramCap = ''; let inviteId = '';

  it('members publish capability profiles; only owners and admins can change them; verified facts need a source', async () => {
    await put('/venture-ai/capabilities', { roles: ['manufacturer'], categories: ['Conveyors', 'Structures'], countries: ['IN'], spareCapacity: '30% of fabrication shop', certifications: ['ISO 9001'] }, t.vikram).expect(200);
    await put('/venture-ai/capabilities', { roles: ['investor'], categories: [], countries: ['IN'], investmentMinPaise: 50 * 1e5 * 100, investmentMaxPaise: 5 * CR }, t.deepak).expect(200);
    await put('/venture-ai/capabilities', { roles: ['distributor'], categories: [], countries: ['IN'] }, t.ravi).expect(200);
    await put('/venture-ai/capabilities', { roles: ['installer'], categories: [], countries: ['IN'] }, t.rohit).expect(403); // org member
    const bad = await put('/venture-ai/capabilities', { roles: ['investor'], categories: [], countries: ['IN'], investmentMinPaise: 10, investmentMaxPaise: 5 }, t.deepak).expect(400);
    expect(bad.body.fields?.investmentMaxPaise).toBeTruthy();
    vikramCap = (await get('/venture-ai/capabilities', t.vikram).expect(200)).body.capability.id;
    await post('/venture-ai/opportunities', { ...opportunity, evidence: [{ kind: 'verified', statement: 'Quarry output grew last year' }] }, t.asha).expect(400);
  });

  it('Solar Conveyor: create, score, model, size and submit; drafts are private', async () => {
    const o = (await post('/venture-ai/opportunities', opportunity, t.asha).expect(201)).body;
    oppId = o.id; expect(o.status).toBe('draft');
    await get(`/venture-ai/opportunities/${oppId}`, t.vikram).expect(404); // drafts are only visible to the proposer
    await post(`/venture-ai/opportunities/${oppId}/submit`, {}, t.asha).expect(400); // not scored yet
    await post(`/venture-ai/opportunities/${oppId}/evidence`, { kind: 'verified', statement: 'A pilot quarry shared 12 months of power bills', source: 'Pilot customer bills', sourceDate: '2026-10-01' }, t.asha).expect(201);
    await post(`/venture-ai/opportunities/${oppId}/evidence`, { kind: 'assumption', statement: 'Vikram can fabricate one conveyor' }, t.vikram).expect(404);

    const s = (await post(`/venture-ai/opportunities/${oppId}/score`, { criteria: all(82, 'some'), checks: { safety: 'pending' } }, t.asha).expect(200)).body;
    expect(s).toMatchObject({ score: 82, classification: 'priority' });
    const f = (await post(`/venture-ai/opportunities/${oppId}/finance`, { unitPricePaise: 60 * 1e5 * 100, unitCostPaise: 40 * 1e5 * 100, year1Units: 10, growthPct: 30, fixedCostsPerYearPaise: 50 * 1e5 * 100, capexPaise: 1 * CR }, t.asha).expect(200)).body;
    expect(f.version).toBe(1); expect(f.result.years).toHaveLength(5); expect(f.sensitivity.length).toBeGreaterThan(1);
    const c = (await post(`/venture-ai/opportunities/${oppId}/conveyor`, { motorKw: 22, hoursPerDay: 10 }, t.asha).expect(200)).body;
    expect(c).toMatchObject({ energyKwhPerDay: 154, solarKwp: 39.5 }); expect(c.notes[0]).toMatch(/not certified engineering/);

    await post(`/venture-ai/opportunities/${oppId}/submit`, {}, t.asha).expect(200);
    await post(`/venture-ai/opportunities/${oppId}/submit`, {}, t.asha).expect(409);
    const d = (await get(`/venture-ai/opportunities/${oppId}`, t.asha).expect(200)).body;
    expect(d.status).toBe('in_review'); expect(d.evidence).toHaveLength(2); expect(d.concept.conveyor.result.batteryKwh).toBe(38.5);
  });

  it('a failed mandatory check blocks approval; only Unite admins decide', async () => {
    const o = (await post('/venture-ai/opportunities', { ...opportunity, title: 'Unsafe conveyor variant' }, t.asha).expect(201)).body;
    await post(`/venture-ai/opportunities/${o.id}/score`, { criteria: all(95, 'strong'), checks: { safety: 'fail' } }, t.asha).expect(200);
    await post(`/venture-ai/opportunities/${o.id}/submit`, {}, t.asha).expect(200);
    await post(`/admin/venture-ai/opportunities/${o.id}/decide`, { decision: 'approve' }, t.asha).expect(403);
    await post(`/admin/venture-ai/opportunities/${o.id}/decide`, { decision: 'approve' }, t.uniteAdmin).expect(409);
    await post(`/admin/venture-ai/opportunities/${o.id}/decide`, { decision: 'reject', note: 'Safety check failed' }, t.uniteAdmin).expect(200);
  });

  it('approval opens a Venture Room; matches explain the percentage and never leak contacts or the proposer', async () => {
    const r = (await post(`/admin/venture-ai/opportunities/${oppId}/decide`, { decision: 'approve' }, t.uniteAdmin).expect(200)).body;
    roomId = r.ventureId; expect(roomId).toBeTruthy();
    const m = (await get(`/venture-ai/opportunities/${oppId}/matches`, t.asha).expect(200)).body;
    const role = (k: string) => m.roles.find((x: { role: string }) => x.role === k);
    expect(role('manufacturer').candidates[0]).toMatchObject({ capabilityId: vikramCap });
    expect(role('manufacturer').candidates[0].reasons.join(' ')).toMatch(/Conveyors/);
    expect(role('investor').candidates).toHaveLength(1);
    const text = JSON.stringify(m);
    expect(text).not.toMatch(/@|example\.|phone|email/i);
    expect(role('manufacturer').candidates.every((c: { org: string }) => !/Volt/.test(c.org))).toBe(true);
  });

  it('invitations need consent: non-members cannot see the room until they accept', async () => {
    await post(`/venture-ai/rooms/${roomId}/invitations`, { capabilityId: vikramCap, role: 'manufacturer', message: 'Would you fabricate the pilot conveyor?' }, t.rohit).expect(403);
    await post(`/venture-ai/rooms/${roomId}/invitations`, { capabilityId: vikramCap, role: 'investor', message: 'Would you invest in the pilot conveyor?' }, t.asha).expect(400); // not his role
    inviteId = (await post(`/venture-ai/rooms/${roomId}/invitations`, { capabilityId: vikramCap, role: 'manufacturer', message: 'Would you fabricate the pilot conveyor?', earningsNote: 'Manufacturing margin per unit', risksNote: 'Pilot volumes are small' }, t.asha).expect(201)).body.id;
    await post(`/venture-ai/rooms/${roomId}/invitations`, { capabilityId: vikramCap, role: 'manufacturer', message: 'Would you fabricate the pilot conveyor?' }, t.asha).expect(409);
    await get(`/venture-ai/rooms/${roomId}`, t.vikram).expect(404);
    const dash = (await get('/venture-ai/dashboard', t.vikram).expect(200)).body;
    expect(dash.invitations[0]).toMatchObject({ id: inviteId, role: 'manufacturer', risksNote: 'Pilot volumes are small' });
    await post(`/venture-ai/invitations/${inviteId}/respond`, { decision: 'accept' }, t.ravi).expect(404); // not his invitation
    await post(`/venture-ai/invitations/${inviteId}/respond`, { decision: 'accept' }, t.vikram).expect(200);
    await post(`/venture-ai/invitations/${inviteId}/respond`, { decision: 'decline' }, t.vikram).expect(409);
    const room = (await get(`/venture-ai/rooms/${roomId}`, t.vikram).expect(200)).body;
    expect(room.myRole).toBe('manufacturer'); expect(room.owner).toBe(false);
    expect(room.members.map((x: { status: string }) => x.status).sort()).toEqual(['accepted', 'owner']);
  });

  it('tasks and human approvals: the requester can never approve their own request', async () => {
    const owner = (await get(`/venture-ai/rooms/${roomId}`, t.asha).expect(200)).body;
    const vik = owner.members.find((x: { role: string }) => x.role === 'manufacturer');
    const task = (await post(`/venture-ai/rooms/${roomId}/tasks`, { title: 'Fabricate pilot frame', assigneeMemberId: vik.id, milestone: true }, t.asha).expect(201)).body;
    await post(`/venture-ai/tasks/${task.id}/done`, {}, t.ravi).expect(404);
    await post(`/venture-ai/tasks/${task.id}/done`, {}, t.vikram).expect(200);
    const a = (await post(`/venture-ai/rooms/${roomId}/approvals`, { kind: 'purchase_order', title: 'PO for pilot conveyor frame', amountPaise: 4 * 1e5 * 100 }, t.vikram).expect(201)).body;
    await post(`/venture-ai/approvals/${a.id}/decide`, { decision: 'approve' }, t.vikram).expect(403); // not the owner
    const b = (await post(`/venture-ai/rooms/${roomId}/approvals`, { kind: 'binding_agreement', title: 'Sign the pilot MoU' }, t.asha).expect(201)).body;
    await post(`/venture-ai/approvals/${b.id}/decide`, { decision: 'approve' }, t.asha).expect(403); // own request
    await post(`/venture-ai/approvals/${a.id}/decide`, { decision: 'approve', note: 'Within pilot budget' }, t.asha).expect(200);
    await post(`/venture-ai/approvals/${a.id}/decide`, { decision: 'approve' }, t.asha).expect(409);
  });

  it('agents: rules output is labelled; the kill switch and missing budget block runs; only super admins change settings', async () => {
    const r = (await post(`/venture-ai/rooms/${roomId}/agent-runs`, { agent: 'strategy', instruction: 'Plan the first 120 days of the pilot' }, t.asha).expect(201)).body;
    expect(r.status).toBe('completed'); expect(r.provider).toBe('rules'); expect(r.output).toMatch(/rules|template/i);
    await post(`/venture-ai/rooms/${roomId}/agent-runs`, { agent: 'legal', instruction: 'Outline the MoU' }, t.ravi).expect(404);
    await put('/admin/venture-ai/settings', { killSwitch: true, monthlyBudgetPaise: 0 }, t.uniteAdmin).expect(403);
    await put('/admin/venture-ai/settings', { killSwitch: true, monthlyBudgetPaise: 0 }, t.superadmin).expect(200);
    const blocked = (await post(`/venture-ai/rooms/${roomId}/agent-runs`, { agent: 'legal', instruction: 'Outline the MoU' }, t.vikram).expect(201)).body;
    expect(blocked).toMatchObject({ status: 'blocked' }); expect(blocked.error).toMatch(/kill switch/);
    await put('/admin/venture-ai/settings', { killSwitch: false, monthlyBudgetPaise: 0 }, t.superadmin).expect(200);
    const o = (await get('/admin/venture-ai/overview', t.uniteAdmin).expect(200)).body;
    expect(o.runs.length).toBe(2); expect(o.provider).toBe('rules');
    await get('/admin/venture-ai/overview', t.asha).expect(403);
  });

  it('pilots are created once, marked Sample and left out of the counts', async () => {
    await post('/admin/venture-ai/pilots', {}, t.asha).expect(403);
    const p = (await post('/admin/venture-ai/pilots', {}, t.uniteAdmin).expect(201)).body;
    expect(p.created).toBe(6);
    expect((await post('/admin/venture-ai/pilots', {}, t.uniteAdmin).expect(201)).body.created).toBe(0);
    const { rows } = await pool.query(`select title, sample, concept, origin from vai_opportunities where origin = 'pilot'`);
    expect(rows.every((x) => x.sample)).toBe(true);
    const conveyor = rows.find((x) => /Solar Conveyor/.test(x.title));
    expect(conveyor.concept.conveyor.result.solarKwp).toBe(39.5);
    const ev = await pool.query(`select distinct kind from vai_evidence e join vai_opportunities o on o.id = e.opportunity_id where o.origin = 'pilot'`);
    expect(ev.rows.map((x) => x.kind)).toEqual(['assumption']); // pilots claim no verified facts
    const o = (await get('/admin/venture-ai/overview', t.uniteAdmin).expect(200)).body;
    expect(o.counts.opportunities).toBe(2); // only the two real opportunities
  });
});
