import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

/** Unite Group workspace: staff only, every number computed from real records, one search across apps, integrations without secrets. */
describe('Unite Group workspace', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  const one = async (q: string) => (await pool.query(q)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('is for Unite Group staff only', async () => {
    for (const p of ['/v1/admin/workspace', '/v1/admin/workspace/companies', '/v1/admin/workspace/search?q=solar', '/v1/admin/workspace/integrations']) {
      await api(app).get(p).set(auth(t.asha)).expect(403);
      await api(app).get(p).expect(401);
    }
    await api(app).get('/v1/admin/workspace').set(auth(t.finance)).expect(200);
  });

  it('home numbers match the database, and approvals follow the person’s roles', async () => {
    const h = (await api(app).get('/v1/admin/workspace').set(auth(t.uniteAdmin)).expect(200)).body;
    const db = await one(`select
      (select count(*)::int from group_companies) companies,
      (select count(*)::int from organizations where type in ('partner_company','partner_individual') and verification_status = 'verified') verified,
      (select count(*)::int from projects where status in ('planning','active','on_hold')) projects,
      (select coalesce(sum(value),0)::bigint from projects where status in ('planning','active','on_hold')) portfolio,
      (select count(*)::int from direct_offers where status = 'open') offers,
      (select coalesce(sum(sale_value),0)::bigint from offer_sales where status in ('won','paid')) won`);
    expect(h.kpis).toMatchObject({ groupCompanies: db.companies, partnersVerified: db.verified, liveProjects: db.projects, projectPortfolio: Number(db.portfolio), openOffers: db.offers, salesWonTotal: Number(db.won) });
    expect(h.kpis.groupCompanies).toBe(15);
    expect(h.approvals.map((a: any) => a.key)).toEqual(expect.arrayContaining(['promoters', 'growth']));
    expect(h.approvals.map((a: any) => a.key)).not.toContain('commissions'); // Unite admin cannot approve commission
    const f = (await api(app).get('/v1/admin/workspace').set(auth(t.finance)).expect(200)).body;
    expect(f.approvals.map((a: any) => a.key)).toEqual(['commissions']);
    expect(h.businessLines.length).toBeGreaterThan(0);
    expect(h.businessLines[0].value).toBeGreaterThanOrEqual(h.businessLines.at(-1).value);
  });

  it('lists the group companies with type, country, parent and real activity', async () => {
    const r = (await api(app).get('/v1/admin/workspace/companies').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(r.companies).toHaveLength(15);
    const byName = (n: string) => r.companies.find((c: any) => c.name === n);
    expect(byName('Unite Group Inc.')).toMatchObject({ category: 'parent', parent: null, countryName: 'Global' });
    expect(byName('Unite Green Energy Projects')).toMatchObject({ category: 'international', countryName: 'Georgia', parent: 'Unite Group Inc.' });
    expect(byName('Powertek')).toMatchObject({ category: 'manufacturing' });
    expect(byName('Powertek').products).toBeGreaterThan(0);
    expect(byName('Unite Solar').liveProjects).toBeGreaterThan(0);
    expect(byName('99Films')).toMatchObject({ people: 0, liveProjects: 0, wonSales: 0 }); // nothing recorded → zero, never estimated
    expect(r.totals.countries).toBe(3); // India, Georgia, United States ("Global" is not a country)
    // New companies stay off the public website and out of Unite-first lead routing until their details are confirmed.
    const pub = (await api(app).get('/v1/public/group-companies').expect(200)).body.map((c: any) => c.brandName);
    expect(pub).toEqual(['Powertek', 'Unite Exim', 'Unite Solar']);
    expect((await one("select count(*)::int n from group_companies where receives_leads")).n).toBe(3);
  });

  it('one search across companies, businesses, projects, offers and the lead database', async () => {
    const s = (await api(app).get('/v1/admin/workspace/search?q=solar').set(auth(t.uniteAdmin)).expect(200)).body;
    const keys = s.groups.map((g: any) => g.key);
    expect(keys).toEqual(expect.arrayContaining(['companies', 'businesses']));
    expect(s.groups.find((g: any) => g.key === 'businesses').items.map((i: any) => i.title)).toContain('SOLCART');
    const volt = (await api(app).get('/v1/admin/workspace/search?q=volt').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(volt.groups[0].items[0]).toMatchObject({ title: 'Volt EPC', subtitle: expect.stringMatching(/Verified partner/) });
    const fin = (await api(app).get('/v1/admin/workspace/search?q=ganesh').set(auth(t.finance)).expect(200)).body;
    expect(fin.groups.find((g: any) => g.key === 'leads')).toBeUndefined(); // lead database is for Unite admins only
    const adm = (await api(app).get('/v1/admin/workspace/search?q=ganesh').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(adm.groups.find((g: any) => g.key === 'leads').items[0].title).toBe('Shree Ganesh Polymers');
    expect((await api(app).get('/v1/admin/workspace/search?q=a').set(auth(t.uniteAdmin)).expect(200)).body.groups).toEqual([]);
    expect((await api(app).get('/v1/admin/workspace/search?q=%25%25').set(auth(t.uniteAdmin)).expect(200)).body.groups).toEqual([]); // wildcards are literal
  });

  it('shows which outside systems are connected, never their secrets', async () => {
    const r = (await api(app).get('/v1/admin/workspace/integrations').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(r.find((i: any) => i.key === 'erpnext')).toMatchObject({ connected: false, needs: expect.stringMatching(/ERPNext site/) });
    expect(JSON.stringify(r)).not.toMatch(/secret|password|apikey/i);
    expect(r.every((i: any) => typeof i.connected === 'boolean')).toBe(true);
  });
});
