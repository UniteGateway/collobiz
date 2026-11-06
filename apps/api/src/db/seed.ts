/**
 * Idempotent demo seed. All organizations and people are DEMO DATA (A-06); legal entity codes are placeholders (B-01).
 * Demo password for every account: Collabiz#2026  ·  Admin TOTP secret (dev only): see DEMO_TOTP_SECRET.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, sql } from 'drizzle-orm';
import * as schema from './schema';
import { createPool, type Db } from './client';
import { encryptField, hashPassword } from '../common/crypto';
import { seedStages } from './seed-stages';

export const DEMO_PASSWORD = 'Collabiz#2026';
export const DEMO_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const { users, organizations, memberships } = schema;

export interface SeedRefs {
  orgs: Record<string, string>;
  users: Record<string, string>;
}

async function org(db: Db, key: string, v: typeof organizations.$inferInsert, refs: SeedRefs) {
  const [found] = await db.select().from(organizations).where(eq(organizations.legalName, v.legalName)).limit(1);
  refs.orgs[key] = found?.id ?? (await db.insert(organizations).values(v).returning())[0].id;
}
async function user(db: Db, key: string, email: string, fullName: string, refs: SeedRefs, opts: { mfa?: boolean; phone?: string } = {}) {
  const [found] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (found) return (refs.users[key] = found.id);
  const [u] = await db.insert(users).values({
    email, fullName, phone: opts.phone, passwordHash: await hashPassword(DEMO_PASSWORD), emailVerifiedAt: new Date(),
    ...(opts.mfa ? { mfaSecretEnc: encryptField(DEMO_TOTP_SECRET), mfaEnabledAt: new Date() } : {}),
  }).returning();
  await db.update(users).set({ authSubject: `local:${u.id}` }).where(eq(users.id, u.id));
  refs.users[key] = u.id;
}
async function member(db: Db, userKey: string, orgKey: string, role: string, refs: SeedRefs) {
  const [m] = await db.select().from(memberships).where(and(eq(memberships.userId, refs.users[userKey]), eq(memberships.organizationId, refs.orgs[orgKey]), eq(memberships.role, role))).limit(1);
  if (!m) await db.insert(memberships).values({ userId: refs.users[userKey], organizationId: refs.orgs[orgKey], role, status: 'active' });
}

export async function seedIdentity(db: Db): Promise<SeedRefs> {
  const refs: SeedRefs = { orgs: {}, users: {} };
  // ---- Unite Group / platform ----
  await org(db, 'platform', { legalName: 'Unite Group — COLLABIZ Operations (placeholder entity)', displayName: 'Unite Group (COLLABIZ Ops)', type: 'platform', country: 'IN', city: 'Hyderabad', verificationStatus: 'verified', membershipLevel: 'strategic' }, refs);
  await org(db, 'uniteSolar', { legalName: 'Unite Solar (placeholder legal entity)', displayName: 'Unite Solar', type: 'group_company', country: 'IN', city: 'Hyderabad', verificationStatus: 'verified', membershipLevel: 'strategic' }, refs);
  await org(db, 'powertek', { legalName: 'Powertek (placeholder legal entity)', displayName: 'Powertek', type: 'group_company', country: 'IN', city: 'Pune', verificationStatus: 'verified', membershipLevel: 'strategic' }, refs);
  await org(db, 'uniteExim', { legalName: 'Unite Exim (placeholder legal entity)', displayName: 'Unite Exim', type: 'group_company', country: 'IN', city: 'Mumbai', verificationStatus: 'verified', membershipLevel: 'strategic' }, refs);
  // ---- Demo partners ----
  await org(db, 'volt', { legalName: 'Volt EPC Private Limited', displayName: 'Volt EPC', type: 'partner_company', country: 'IN', city: 'Pune', verificationStatus: 'verified', membershipLevel: 'verified', partnerTypes: ['contractor'] }, refs);
  await org(db, 'sunrise', { legalName: 'Sunrise Electricals & Traders LLP', displayName: 'Sunrise Traders', type: 'partner_company', country: 'IN', city: 'Ahmedabad', verificationStatus: 'verified', membershipLevel: 'certified', partnerTypes: ['trader', 'distributor'] }, refs);
  await org(db, 'meera', { legalName: 'Meera Iyer (Individual Consultant)', displayName: 'Meera Iyer Consulting', type: 'partner_individual', country: 'IN', city: 'Bengaluru', verificationStatus: 'verified', membershipLevel: 'verified', partnerTypes: ['consultant'] }, refs);
  await org(db, 'greenbuild', { legalName: 'GreenBuild Infra Projects Pvt Ltd', displayName: 'GreenBuild Infra', type: 'partner_company', country: 'IN', city: 'Chennai', verificationStatus: 'submitted', membershipLevel: 'registered', partnerTypes: ['contractor', 'developer'] }, refs);

  await user(db, 'superadmin', 'superadmin@collabiz.local', 'Arjun Mehta (Super Admin)', refs, { mfa: true });
  await user(db, 'compliance', 'compliance@collabiz.local', 'Priya Nair (Compliance)', refs, { mfa: true });
  await user(db, 'finance', 'finance@collabiz.local', 'Karan Shah (Finance)', refs, { mfa: true });
  await user(db, 'finance2', 'finance2@collabiz.local', 'Divya Rao (Finance Approver 2)', refs, { mfa: true });
  await user(db, 'uniteAdmin', 'unite.admin@collabiz.local', 'Sanjay Kulkarni (Unite Solar Admin)', refs, { mfa: true });
  await user(db, 'routing', 'routing@collabiz.local', 'Neha Gupta (Routing Owner)', refs, { mfa: true });
  await user(db, 'evaluator', 'evaluator@collabiz.local', 'Lakshmi Rao (Unite Solar Tender Evaluator)', refs, { mfa: true });
  await user(db, 'asha', 'asha@voltepc.example', 'Asha Patil', refs, { phone: '+91 98200 11111' });
  await user(db, 'rohit', 'rohit@voltepc.example', 'Rohit Deshmukh', refs);
  await user(db, 'ravi', 'ravi@sunrise.example', 'Ravi Patel', refs, { phone: '+91 98250 22222' });
  await user(db, 'meera', 'meera@consult.example', 'Meera Iyer', refs);
  await user(db, 'vikram', 'vikram@greenbuild.example', 'Vikram Raj', refs);

  await member(db, 'superadmin', 'platform', 'super_admin', refs);
  await member(db, 'compliance', 'platform', 'compliance', refs);
  await member(db, 'finance', 'platform', 'finance', refs);
  await member(db, 'finance2', 'platform', 'finance', refs);
  await member(db, 'uniteAdmin', 'uniteSolar', 'unite_admin', refs);
  await member(db, 'routing', 'platform', 'routing_owner', refs);
  await member(db, 'evaluator', 'uniteSolar', 'unite_admin', refs);
  await member(db, 'asha', 'volt', 'org_owner', refs);
  await member(db, 'rohit', 'volt', 'org_member', refs);
  await member(db, 'ravi', 'sunrise', 'org_owner', refs);
  await member(db, 'meera', 'meera', 'org_owner', refs);
  await member(db, 'vikram', 'greenbuild', 'org_owner', refs);
  return refs;
}

export async function seedAll(db: Db) {
  const refs = await seedIdentity(db);
  await seedStages(db, refs);
  return refs;
}

if (require.main === module) {
  // Demo accounts use a published password and TOTP secret — never allow them into production.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error('Refusing to load demo seed data with NODE_ENV=production (set ALLOW_DEMO_SEED=true only for an isolated demo environment).');
    process.exit(1);
  }
  const pool = createPool();
  seedAll(drizzle(pool, { schema }))
    .then((r) => console.info(`Seeded ${Object.keys(r.orgs).length} organizations, ${Object.keys(r.users).length} users. Demo password: ${DEMO_PASSWORD}`))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
