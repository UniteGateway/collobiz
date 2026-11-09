/**
 * Production bootstrap for a fresh pilot/production database. Safe to run in production (unlike the demo seed) and safe to
 * run again: every step is idempotent. Creates no demo companies, people, offers or money.
 *
 *   node dist/db/bootstrap.js --platform-name "Unite Group Pvt Ltd"           # 1. platform organization, agreements, business catalogue
 *   node dist/db/bootstrap.js --super-admin owner@unitegroup.in               # 2. after that person registered on the web app
 *   node dist/db/bootstrap.js --agreements /path/to/reviewed --legal-reviewed # 3. publish lawyer-approved agreement texts
 *
 * (Development: node -r @swc-node/register src/db/bootstrap.ts …)
 *
 * Agreements directory: one `<code>.md` file per agreement (partner_terms.md, lead_registration.md, privacy_notice.md);
 * the first line is `# Title`, the rest is the text partners accept. A changed text becomes a new active version and the
 * previous version is retired — partners are then asked to accept the new version.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { and, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createPool, type Db } from './client';
import * as s from './schema';
import { sha256 } from '../common/crypto';
import { AuditService } from '../common/audit.service';
import { AGREEMENTS } from './seed-stages';
import { VENTURES } from './ventures-data';

export interface BootstrapOptions { platformName?: string; superAdmin?: string; agreementsDir?: string; legalReviewed?: boolean }
type Log = (m: string) => void;

export async function ensurePlatform(db: Db, legalName: string | undefined, log: Log) {
  const [found] = await db.select().from(s.organizations).where(eq(s.organizations.type, 'platform')).limit(1);
  if (found) { log(`Platform organization present: ${found.legalName}`); return found; }
  if (!legalName) throw new Error('No platform organization yet. Run with --platform-name "<registered name of the operating Unite company>"');
  const [o] = await db.insert(s.organizations).values({ legalName, displayName: 'Unite Group (COLLABIZ)', type: 'platform', country: 'IN', verificationStatus: 'verified', membershipLevel: 'strategic' }).returning();
  log(`Created platform organization: ${legalName}`);
  return o;
}

export async function grantSuperAdmin(db: Db, email: string, log: Log) {
  const [u] = await db.select().from(s.users).where(sql`lower(${s.users.email}) = ${email.trim().toLowerCase()}`).limit(1);
  if (!u) throw new Error(`${email} has not registered yet. Ask them to register on the partner web app first, then run this again.`);
  const [p] = await db.select().from(s.organizations).where(eq(s.organizations.type, 'platform')).limit(1);
  if (!p) throw new Error('Run with --platform-name first');
  const r = await db.insert(s.memberships).values({ userId: u.id, organizationId: p.id, role: 'super_admin', status: 'active' }).onConflictDoNothing().returning();
  if (r.length) await new AuditService(db).record(null, { action: 'bootstrap.super_admin_granted', objectType: 'user', objectId: u.id, after: { email: u.email } });
  log(r.length ? `Granted super admin to ${u.email}. They must enrol two-factor authentication at their first admin sign-in.` : `${u.email} is already a super admin`);
}

/** Publishes agreement texts. Without a directory, loads the built-in DRAFT texts only when no agreements exist. */
export async function publishAgreements(db: Db, dir: string | undefined, legalReviewed: boolean, log: Log) {
  const texts = dir
    ? readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => {
        const raw = readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n');
        const [first, ...rest] = raw.split('\n');
        if (!first.startsWith('# ')) throw new Error(`${f}: the first line must be "# <title>"`);
        return { code: f.replace(/\.md$/, ''), title: first.slice(2).trim(), body: rest.join('\n').trim() };
      })
    : (await db.select({ n: sql<number>`count(*)::int` }).from(s.agreementTemplates))[0].n ? [] : AGREEMENTS;
  for (const a of texts) {
    if (!/^[a-z_]+$/.test(a.code)) throw new Error(`Agreement code "${a.code}" must be lower-case letters and underscores`);
    if (a.body.length < 50) throw new Error(`${a.code}: text is too short to be an agreement`);
    const hash = sha256(a.body);
    const [latest] = await db.select().from(s.agreementTemplates).where(eq(s.agreementTemplates.code, a.code)).orderBy(desc(s.agreementTemplates.version)).limit(1);
    if (latest?.bodyHash === hash && latest.status === 'active') {
      if (legalReviewed && !latest.legalReviewed) { await db.update(s.agreementTemplates).set({ legalReviewed: true }).where(eq(s.agreementTemplates.id, latest.id)); log(`${a.code} v${latest.version}: marked legally reviewed`); }
      else log(`${a.code} v${latest.version}: unchanged`);
      continue;
    }
    const version = (latest?.version ?? 0) + 1;
    await db.transaction(async (tx) => {
      await tx.update(s.agreementTemplates).set({ status: 'retired' }).where(and(eq(s.agreementTemplates.code, a.code), eq(s.agreementTemplates.status, 'active')));
      await tx.insert(s.agreementTemplates).values({ code: a.code, version, title: a.title, body: a.body, bodyHash: hash, status: 'active', legalReviewed });
    });
    log(`${a.code} v${version}: published${legalReviewed ? ' (legally reviewed)' : ' (DRAFT — not legally reviewed)'}`);
  }
}

/** Loads the Unite Group business catalogue. Every business starts CLOSED; Unite opens the pilot business in the admin console. */
export async function loadVentures(db: Db, log: Log) {
  const have = new Set((await db.select({ slug: s.uniteVentures.slug }).from(s.uniteVentures)).map((r) => r.slug));
  const rows = VENTURES.filter((v) => !have.has(v.slug)).map((v) => ({
    num: v.num, slug: v.slug, name: v.name, category: v.category, sector: v.sector, tagline: v.tagline, summary: v.summary, stage: v.stage, roles: v.roles,
    open: false, regulatedReason: v.regulated ?? null,
    rewardNote: 'Rewards are set in each offer from this business: commission, revenue share, fixed fee or reseller margin.',
  }));
  if (rows.length) await db.insert(s.uniteVentures).values(rows);
  log(rows.length ? `Loaded ${rows.length} Unite Group businesses (all closed to partners until opened in the admin console)` : 'Unite Group businesses already loaded');
}

export async function bootstrap(db: Db, o: BootstrapOptions, log: Log = console.log) {
  await ensurePlatform(db, o.platformName, log);
  await publishAgreements(db, o.agreementsDir, !!o.legalReviewed, log);
  await loadVentures(db, log);
  if (o.superAdmin) await grantSuperAdmin(db, o.superAdmin, log);
}

function parseArgs(argv: string[]): BootstrapOptions {
  const o: BootstrapOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--platform-name') o.platformName = argv[++i];
    else if (a === '--super-admin') o.superAdmin = argv[++i];
    else if (a === '--agreements') o.agreementsDir = argv[++i];
    else if (a === '--legal-reviewed') o.legalReviewed = true;
    else throw new Error(`Unknown option ${a}`);
  }
  return o;
}

if (require.main === module) {
  let opts: BootstrapOptions;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`${(e as Error).message}. Options: --platform-name "<name>", --super-admin <email>, --agreements <dir>, --legal-reviewed`); process.exit(2); }
  const pool = createPool();
  bootstrap(drizzle(pool, { schema: s }) as unknown as Db, opts)
    .then(() => pool.end())
    .catch(async (e) => { console.error(`Bootstrap stopped: ${e.message}`); await pool.end(); process.exit(1); });
}
