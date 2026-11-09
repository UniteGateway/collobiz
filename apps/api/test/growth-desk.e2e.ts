import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { resetConfigForTests } from '../src/config';

/** AI Growth Desk: lawful contacts only, explainable scores, drafts need approval, blocked claims, investor clearance, opt-out. */
describe('AI Growth Desk', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); delete process.env.GROWTH_SENDING_ENABLED; resetConfigForTests(); });
  const agentByName = async (name: string) => (await api(app).get('/v1/admin/growth').set(auth(t.uniteAdmin)).expect(200)).body.agents.find((a: any) => a.name === name);

  it('only Unite admins use it; demo agents never touch contacts without a lawful basis or who opted out', async () => {
    await api(app).get('/v1/admin/growth').set(auth(t.asha)).expect(403);
    await api(app).get('/v1/admin/growth').set(auth(t.finance)).expect(403);
    const d = await api(app).get('/v1/admin/growth').set(auth(t.uniteAdmin)).expect(200);
    expect(d.body).toMatchObject({ sendingEnabled: false, provider: 'rules' });
    expect(d.body.totals.agents).toBe(7);
    expect(d.body.totals.awaitingApproval).toBeGreaterThan(0);
    const leadOrgs = (await pool.query('select c.organization_name n from growth_leads l join growth_contacts c on c.id = l.contact_id')).rows.map((r) => r.n);
    expect(leadOrgs).toEqual(expect.arrayContaining(['Shree Ganesh Polymers', 'Al Noor Trading LLC', 'Sri Venkateswara Engineering College']));
    expect(leadOrgs).not.toContain('Mahalaxmi Steel Fabricators'); // no lawful basis
    expect(leadOrgs).not.toContain('Gulf Bright Energy'); // no lawful basis (social network)
    expect(leadOrgs).not.toContain('Kerala Institute of Technology'); // opted out
    const m = await one("select body, subject, provider, prompt_version, sources from growth_messages where status = 'draft' limit 1");
    expect(m.body).toMatch(/To stop receiving messages from Unite Group, open http.*\/unsubscribe\?token=/);
    expect(m.body).toMatch(/Why you received this/);
    expect(m).toMatchObject({ provider: 'rules', prompt_version: 'growth-rules-v1' });
    expect(m.sources.length).toBeGreaterThan(1);
  });

  it('agents explain their scores, skip what they must, and never create the same lead twice', async () => {
    const bad = await api(app).post('/v1/admin/growth/agents').set(auth(t.uniteAdmin)).send({ name: 'Bad pitch', product: 'Solar plants', audience: 'buyers', sectors: ['manufacturing'], pitch: 'Guaranteed savings of forty percent with assured returns for every factory owner.', callToAction: 'Call us' }).expect(400);
    expect(bad.body.issues[0].message).toMatch(/guaranteed/);
    const a = await api(app).post('/v1/admin/growth/agents').set(auth(t.uniteAdmin)).send({ name: 'Maharashtra factories test', product: 'Rooftop solar for factories', audience: 'buyers', sectors: ['manufacturing'], regions: ['IN-MH'], pitch: 'Rooftop solar for factories with installation by verified local partners and a site estimate before any commitment.', callToAction: 'Reply for a free roof assessment.', minScore: 40 }).expect(201);
    expect(a.body.status).toBe('draft');
    const run = await api(app).post(`/v1/admin/growth/agents/${a.body.id}/run`).set(auth(t.uniteAdmin)).expect(200);
    expect(run.body.created).toBeGreaterThan(0);
    expect(run.body.skipped.no_lawful_basis).toBe(1); // Mahalaxmi
    const det = await api(app).get(`/v1/admin/growth/agents/${a.body.id}`).set(auth(t.uniteAdmin)).expect(200);
    const top = det.body.leads[0];
    expect(top.reasons.join(' ')).toMatch(/Located in Maharashtra/);
    expect(det.body.leads.every((l: any) => l.score >= 40)).toBe(true);
    expect(det.body.runs[0].skipped.map((s: any) => s.reason)).toContain('No lawful basis to contact');
    const again = await api(app).post(`/v1/admin/growth/agents/${a.body.id}/run`).set(auth(t.uniteAdmin)).expect(200);
    expect(again.body.created).toBe(0);
    expect(again.body.skipped.already_lead).toBe(run.body.created);
  });

  it('investor agents reach only consented investors, and only after a super admin clears them', async () => {
    const inv = await agentByName('Power Partner — opt-in investors');
    expect(inv.needsClearance).toBe(true);
    await api(app).post(`/v1/admin/growth/agents/${inv.id}/run`).set(auth(t.uniteAdmin)).expect(409);
    await api(app).patch(`/v1/admin/growth/agents/${inv.id}`).set(auth(t.uniteAdmin)).send({ status: 'active' }).expect(409);
    await api(app).post(`/v1/admin/growth/agents/${inv.id}/clearance`).set(auth(t.uniteAdmin)).send({ note: 'Legal opinion received' }).expect(403);
    await api(app).post(`/v1/admin/growth/agents/${inv.id}/clearance`).set(auth(t.superadmin)).send({ note: 'Counsel opinion LO-2026-131: information-only outreach to opted-in investors' }).expect(200);
    const run = await api(app).post(`/v1/admin/growth/agents/${inv.id}/run`).set(auth(t.uniteAdmin)).expect(200);
    expect(run.body.created).toBe(1);
    expect(run.body.skipped.investor_needs_consent).toBe(1); // Horizon Angels: public list, no consent
    const det = await api(app).get(`/v1/admin/growth/agents/${inv.id}`).set(auth(t.uniteAdmin)).expect(200);
    expect(det.body.leads.map((l: any) => l.contact.organizationName)).toEqual(['Meridian Family Office']);
  });

  it('every message needs approval; edits are re-checked for blocked wording and must keep the unsubscribe link', async () => {
    const solcart = await agentByName('SOLCART — factory rooftop solar');
    const det = await api(app).get(`/v1/admin/growth/agents/${solcart.id}`).set(auth(t.uniteAdmin)).expect(200);
    const lead = det.body.leads.find((l: any) => l.message?.status === 'draft');
    const m = lead.message;
    await api(app).patch(`/v1/admin/growth/messages/${m.id}`).set(auth(t.uniteAdmin)).send({ subject: m.subject, body: 'Hello, a shorter message without the opt-out link but long enough to pass the length check.' }).expect(400);
    const risky = await api(app).patch(`/v1/admin/growth/messages/${m.id}`).set(auth(t.uniteAdmin)).send({ subject: m.subject, body: m.body.replace('Kind regards', 'Savings are guaranteed. Kind regards') }).expect(200);
    expect(risky.body.status).toBe('blocked');
    await api(app).post(`/v1/admin/growth/messages/${m.id}/decide`).set(auth(t.uniteAdmin)).send({ decision: 'approve' }).expect(409);
    const fixed = await api(app).patch(`/v1/admin/growth/messages/${m.id}`).set(auth(t.uniteAdmin)).send({ subject: m.subject, body: m.body.replace('Kind regards', 'Thank you. Kind regards') }).expect(200);
    expect(fixed.body).toMatchObject({ status: 'draft', edited: true });
    await api(app).post(`/v1/admin/growth/messages/${m.id}/decide`).set(auth(t.uniteAdmin)).send({ decision: 'approve' }).expect(200);
    await api(app).post(`/v1/admin/growth/messages/${m.id}/decide`).set(auth(t.uniteAdmin)).send({ decision: 'reject' }).expect(409); // already decided
    expect((await one('select status from growth_leads where id = $1', [lead.id])).status).toBe('approved');
    const off = await api(app).post(`/v1/admin/growth/agents/${solcart.id}/send`).set(auth(t.uniteAdmin)).expect(409);
    expect(off.body.message).toMatch(/switched off/);
    await api(app).post(`/v1/admin/growth/leads/${lead.id}/status`).set(auth(t.uniteAdmin)).send({ status: 'won' }).expect(409); // approved → won is not allowed
  });

  it('the lead database records source and lawful basis; imports skip duplicates, invalid rows and opted-out addresses', async () => {
    const base = { organizationName: 'Test Foods Pvt Ltd', sector: 'agri_food', source: 'event', sourceDetail: 'Food processing expo 2026' };
    await api(app).post('/v1/admin/growth/contacts').set(auth(t.uniteAdmin)).send({ ...base, email: 'ops@testfoods.example', lawfulBasis: 'consent' }).expect(400); // consent without evidence
    await api(app).post('/v1/admin/growth/contacts').set(auth(t.uniteAdmin)).send({ ...base, email: 'ops@testfoods.example', lawfulBasis: 'consent', consentEvidence: 'Expo sign-up sheet' }).expect(201);
    await api(app).post('/v1/admin/growth/contacts').set(auth(t.uniteAdmin)).send({ ...base, email: 'OPS@testfoods.example', lawfulBasis: 'legitimate_interest_b2b' }).expect(409); // duplicate (case-insensitive)
    await api(app).post('/v1/admin/growth/contacts').set(auth(t.uniteAdmin)).send({ ...base, organizationName: 'KIT again', email: 'anitha@kit.example', lawfulBasis: 'legitimate_interest_b2b' }).expect(409); // suppressed
    const imp = await api(app).post('/v1/admin/growth/contacts/import').set(auth(t.uniteAdmin)).send({
      defaults: { source: 'licensed_directory', sourceDetail: 'Licensed MSME directory, Nov 2026', lawfulBasis: 'legitimate_interest_b2b' },
      rows: [
        { organizationName: 'Alpha Castings', sector: 'manufacturing', email: 'info@alphacast.example', region: 'IN-MH', city: 'Pune' },
        { organizationName: 'Beta Foods', sector: 'agri_food', email: 'hello@betafoods.example', tags: 'exporter; organic' },
        { organizationName: 'Alpha Castings dup', sector: 'manufacturing', email: 'INFO@alphacast.example' },
        { organizationName: 'Gamma', sector: 'not_a_sector', email: 'x@gamma.example' },
        { organizationName: 'Anitha again', sector: 'education', email: 'anitha@kit.example' },
      ],
    }).expect(200);
    expect(imp.body).toMatchObject({ created: 2, duplicates: 1, suppressed: 1, invalidCount: 1 });
    expect(imp.body.invalid[0].row).toBe(5);
    expect((await one("select tags from growth_contacts where email = 'hello@betafoods.example'")).tags).toEqual(['exporter', 'organic']);
    const list = await api(app).get('/v1/admin/growth/contacts?basis=opted_out').set(auth(t.uniteAdmin)).expect(200);
    expect(list.body.rows.map((r: any) => r.organizationName)).toEqual(['Kerala Institute of Technology']);
  });

  it('anyone can unsubscribe from the link in a message; the contact is never drafted or approved again', async () => {
    const m = await one("select m.id, m.unsubscribe_token, m.contact_id from growth_messages m where m.status = 'draft' limit 1");
    const info = await api(app).get(`/v1/public/unsubscribe?token=${m.unsubscribe_token}`).expect(200);
    expect(info.body.email).toMatch(/^..•••@/);
    await api(app).get('/v1/public/unsubscribe?token=not-a-real-token-123').expect(404);
    await api(app).post('/v1/public/unsubscribe').send({ token: m.unsubscribe_token }).expect(200);
    const c = await one('select email, opted_out_at from growth_contacts where id = $1', [m.contact_id]);
    expect(c.opted_out_at).not.toBeNull();
    expect((await one('select reason from growth_suppressions where email = $1', [c.email.toLowerCase()])).reason).toBe('unsubscribed');
    expect((await one('select status from growth_messages where id = $1', [m.id])).status).toBe('blocked');
    await api(app).post(`/v1/admin/growth/messages/${m.id}/decide`).set(auth(t.uniteAdmin)).send({ decision: 'approve' }).expect(409);
  });

  it('when sending is switched on: daily cap, suppression re-checked at send time, leads marked contacted', async () => {
    process.env.GROWTH_SENDING_ENABLED = 'true'; resetConfigForTests();
    const ul = await agentByName('Unite Learning — colleges and institutes');
    await api(app).patch(`/v1/admin/growth/agents/${ul.id}`).set(auth(t.uniteAdmin)).send({ dailySendCap: 1 }).expect(200);
    const det = await api(app).get(`/v1/admin/growth/agents/${ul.id}`).set(auth(t.uniteAdmin)).expect(200);
    const drafts = det.body.leads.filter((l: any) => l.message?.status === 'draft');
    expect(drafts.length).toBeGreaterThanOrEqual(2);
    for (const l of drafts) await api(app).post(`/v1/admin/growth/messages/${l.message.id}/decide`).set(auth(t.uniteAdmin)).send({ decision: 'approve' }).expect(200);
    const r = await api(app).post(`/v1/admin/growth/agents/${ul.id}/send`).set(auth(t.uniteAdmin)).expect(200);
    expect(r.body).toMatchObject({ sent: 1, dailyCap: 1 });
    expect(r.body.waitingForTomorrow).toBe(drafts.length - 1);
    const sent = await one("select m.lead_id, c.email from growth_messages m join growth_contacts c on c.id = m.contact_id where m.agent_id = $1 and m.status = 'sent'", [ul.id]);
    expect((await one("select count(*)::int n from outbox_messages where recipient = $1 and body like '%/unsubscribe?token=%'", [sent.email])).n).toBe(1);
    expect((await one('select status from growth_leads where id = $1', [sent.lead_id])).status).toBe('contacted');
    // Opt out a still-approved contact, raise the cap: that message is blocked at send time, not sent.
    const waiting = await one("select m.contact_id, c.email from growth_messages m join growth_contacts c on c.id = m.contact_id where m.agent_id = $1 and m.status = 'approved' limit 1", [ul.id]);
    await pool.query("insert into growth_suppressions (email, reason) values ($1, 'complaint')", [waiting.email.toLowerCase()]);
    await api(app).patch(`/v1/admin/growth/agents/${ul.id}`).set(auth(t.uniteAdmin)).send({ dailySendCap: 50 }).expect(200);
    const r2 = await api(app).post(`/v1/admin/growth/agents/${ul.id}/send`).set(auth(t.uniteAdmin)).expect(200);
    expect(r2.body.blocked).toBe(1);
    expect((await one("select count(*)::int n from outbox_messages where recipient = $1", [waiting.email])).n).toBe(0);
  });

  it('one click creates a draft agent for every open Unite business that has none', async () => {
    const r = await api(app).post('/v1/admin/growth/agents/from-businesses').set(auth(t.uniteAdmin)).expect(200);
    expect(r.body.created).toBeGreaterThan(5);
    const agents = (await pool.query("select a.status, v.regulated_reason, v.cleared_at from growth_agents a join unite_ventures v on v.id = a.venture_id where a.code like 'AG-%'")).rows;
    expect(agents.every((a) => !a.regulated_reason || a.cleared_at)).toBe(true); // no locked finance businesses
    expect((await api(app).post('/v1/admin/growth/agents/from-businesses').set(auth(t.uniteAdmin)).expect(200)).body.created).toBe(0);
    const audit = await one("select count(*)::int n from audit_events where action like 'growth.%'");
    expect(audit.n).toBeGreaterThan(10);
  });
});
