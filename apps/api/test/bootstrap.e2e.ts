import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema';
import { bootstrap } from '../src/db/bootstrap';
import { api, auth, bootApp, resetDatabase } from './helpers';

/** Production bootstrap on an EMPTY database (no demo seed): platform org, agreements, closed business catalogue, first super admin. */
describe('Production bootstrap (fresh database, no demo data)', () => {
  let app: INestApplication;
  let pool: Pool;
  let db: any;
  const logs: string[] = [];
  const log = (m: string) => logs.push(m);
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); pool = new Pool({ connectionString: process.env.DATABASE_URL }); db = drizzle(pool, { schema }); app = await bootApp(); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('refuses to start without the operating company name, then creates it with agreements and every business closed', async () => {
    await expect(bootstrap(db, {}, log)).rejects.toThrow(/--platform-name/);
    await bootstrap(db, { platformName: 'Unite Group Operations Pvt Ltd' }, log);
    expect(await one("select legal_name, type from organizations where type = 'platform'")).toEqual({ legal_name: 'Unite Group Operations Pvt Ltd', type: 'platform' });
    expect((await one('select count(*)::int n from users')).n).toBe(0); // no demo people
    const ag = (await pool.query("select code, version, status, legal_reviewed from agreement_templates order by code")).rows;
    expect(ag.map((a) => a.code)).toEqual(['lead_registration', 'partner_terms', 'privacy_notice']);
    expect(ag.every((a) => a.status === 'active' && a.legal_reviewed === false)).toBe(true);
    expect(await one('select count(*)::int n, count(*) filter (where open)::int open from unite_ventures')).toEqual({ n: 47, open: 0 });
    // Running again changes nothing.
    await bootstrap(db, {}, log);
    expect((await one('select count(*)::int n from organizations')).n).toBe(1);
    expect((await one('select count(*)::int n from agreement_templates')).n).toBe(3);
  });

  it('a partner can register and sees the agreements; the first super admin is granted only after registering', async () => {
    await expect(bootstrap(db, { superAdmin: 'owner@unite.example' }, log)).rejects.toThrow(/has not registered yet/);
    const reg = await api(app).post('/v1/auth/register').send({ email: 'owner@unite.example', fullName: 'Pilot Owner', password: 'Secure123pass', acceptTerms: true, client: 'mobile' }).expect(201);
    expect(reg.body.accessToken).toBeTruthy();
    await bootstrap(db, { superAdmin: 'Owner@Unite.example' }, log);
    expect(await one("select m.role from memberships m join users u on u.id = m.user_id join organizations o on o.id = m.organization_id where u.email = 'owner@unite.example' and o.type = 'platform'")).toEqual({ role: 'super_admin' });
    expect((await one("select count(*)::int n from audit_events where action = 'bootstrap.super_admin_granted'")).n).toBe(1);
    await bootstrap(db, { superAdmin: 'owner@unite.example' }, log); // idempotent
    expect((await one("select count(*)::int n from memberships where role = 'super_admin'")).n).toBe(1);
    expect(logs.at(-1)).toMatch(/already a super admin/);
    const partner = await api(app).post('/v1/auth/register').send({ email: 'first.partner@example.com', fullName: 'First Partner', password: 'Secure123pass', acceptTerms: true, client: 'mobile' }).expect(201);
    const ags = await api(app).get('/v1/onboarding/agreements').set(auth(partner.body.accessToken)).expect(200);
    expect(ags.body.map((a: any) => a.title)).toEqual(['Lead Registration Agreement', 'COLLABIZ Partner Terms', 'Privacy Notice & Data Processing']);
  });

  it('publishes lawyer-approved texts as new versions and retires the drafts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agreements-'));
    writeFileSync(join(dir, 'partner_terms.md'), '# COLLABIZ Partner Terms\n\n1. These are the reviewed partner terms approved by counsel for the pilot, replacing the draft.\n2. Earnings are not guaranteed.');
    writeFileSync(join(dir, 'privacy_notice.md'), '# Privacy Notice\r\n\r\nReviewed privacy notice naming the data fiduciary, grievance officer and contact address for the pilot.');
    await bootstrap(db, { agreementsDir: dir, legalReviewed: true }, log);
    const pt = (await pool.query("select version, status, legal_reviewed from agreement_templates where code = 'partner_terms' order by version")).rows;
    expect(pt).toEqual([{ version: 1, status: 'retired', legal_reviewed: false }, { version: 2, status: 'active', legal_reviewed: true }]);
    expect(await one("select version, status from agreement_templates where code = 'lead_registration'")).toEqual({ version: 1, status: 'active' }); // untouched
    await bootstrap(db, { agreementsDir: dir, legalReviewed: true }, log); // same text again → no new version
    expect((await one("select count(*)::int n from agreement_templates where code = 'partner_terms'")).n).toBe(2);
    writeFileSync(join(dir, 'bad.md'), 'no title line here but long enough text to count as an agreement body for the check');
    await expect(bootstrap(db, { agreementsDir: dir }, log)).rejects.toThrow(/first line must be/);
  });
});
