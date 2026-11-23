/** JOIN — any industry joins, picks how it collaborates, and gets a board with live, explained matches. */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('Join as any industry', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const get = (path: string, tok: string) => api(app).get(`/v1${path}`).set(auth(tok));
  const put = (path: string, tok: string, b: object) => api(app).put(`/v1${path}`).set(auth(tok)).send(b);

  it('lists the ways to collaborate publicly', async () => {
    const r = (await api(app).get('/v1/public/join/options').expect(200)).body;
    expect(r.intents.map((i: { code: string }) => i.code)).toEqual(expect.arrayContaining(['free_power', 'barter', 'trading', 'export_import', 'epc_partner']));
  });

  it('suggests collaborations from the industry, and has no board until the member chooses', async () => {
    const p = (await get('/join/profile', t.ravi).expect(200)).body;
    expect(p.profile).toBeNull();
    expect(p.suggested).toContain('free_power');
    await get('/join/board', t.ravi).expect(404);
  });

  it('validates the choices; only the owner or an admin saves them; every change is audited', async () => {
    await put('/join/profile', t.ravi, { sector: 'spaceships', intents: ['barter'] }).expect(400);
    await put('/join/profile', t.ravi, { sector: 'manufacturing', intents: [] }).expect(400);
    await put('/join/profile', t.ravi, { sector: 'manufacturing', intents: ['teleport'] }).expect(400);
    const roles = await pool.query("select u.email, m.role from memberships m join users u on u.id = m.user_id where u.email in ('asha@voltepc.example','rohit@voltepc.example')");
    const rohit = roles.rows.find((r) => r.email.startsWith('rohit'));
    if (rohit && rohit.role !== 'org_owner' && rohit.role !== 'org_admin') await put('/join/profile', t.rohit, { sector: 'solar', intents: ['epc_partner'] }).expect(403);
    const saved = (await put('/join/profile', t.asha, { sector: 'solar', intents: ['epc_partner', 'barter', 'free_power', 'barter'], city: 'Hyderabad' }).expect(200)).body;
    expect(saved.intents).toEqual(['epc_partner', 'barter', 'free_power']); // duplicates dropped
    await put('/join/profile', t.asha, { sector: 'solar', intents: ['epc_partner', 'barter', 'free_power', 'promote', 'jobs_teams'] }).expect(200);
    const a = await pool.query("select action from audit_events where action like 'join.%' order by seq");
    expect(a.rows.map((r) => r.action)).toEqual(['join.profile_created', 'join.profile_updated']);
  });

  it('builds the board: one card per choice with live counts, and explained matches', async () => {
    const b = (await get('/join/board', t.asha).expect(200)).body;
    expect(b.profile.sectorName).toBe('Solar & Renewable Energy');
    expect(b.cards.map((c: { code: string }) => c.code)).toEqual(['epc_partner', 'barter', 'free_power', 'promote', 'jobs_teams']);
    const epc = b.cards.find((c: { code: string }) => c.code === 'epc_partner');
    expect(epc.links.length).toBeGreaterThan(0);
    // Without SOLBID configured the board says so instead of inventing a number.
    const sb = epc.stats.find((s: { label: string }) => s.label.includes('SOLBID'));
    expect(sb.value).toBeNull(); expect(sb.note).toMatch(/not connected|not responding/);
    // Counts match what the member could open itself.
    const promote = b.cards.find((c: { code: string }) => c.code === 'promote');
    const open = (await pool.query("select count(*)::int n from unite_ventures where open and (regulated_reason is null or cleared_at is not null)")).rows[0].n;
    expect(promote.stats[0].value).toBe(open);
    const barter = b.cards.find((c: { code: string }) => c.code === 'barter');
    const own = (await pool.query("select o.id from organizations o join memberships m on m.organization_id = o.id join users u on u.id = m.user_id where u.email = 'asha@voltepc.example' limit 1")).rows[0].id;
    const listings = (await pool.query("select count(*)::int n from xchange_listings where status = 'active' and org_id <> $1", [own])).rows[0].n;
    expect(barter.stats[0].value).toBe(listings);
    // Action cards carry no invented numbers.
    expect(b.cards.find((c: { code: string }) => c.code === 'free_power').stats).toEqual([]);
    // Unite businesses are matched with reasons, and regulated ones stay hidden until cleared.
    expect(b.ventures.length).toBeGreaterThan(0);
    for (const v of b.ventures) expect(v.reasons.length).toBeGreaterThan(0);
    expect(b.ventures.map((v: { slug: string }) => v.slug)).toEqual(expect.arrayContaining(['sunx']));
    const locked = (await pool.query("select slug from unite_ventures where regulated_reason is not null and cleared_at is null")).rows.map((r) => r.slug);
    for (const v of b.ventures) expect(locked).not.toContain(v.slug);
    for (const o of b.offers) expect(o.reasons.length).toBeGreaterThan(0);
    expect(b.note).toMatch(/Matched by rules/);
  });

  it('keeps each business to its own board', async () => {
    await get('/join/board', t.ravi).expect(404); // Sunrise has not joined; it never sees Volt EPC's board
  });
});
