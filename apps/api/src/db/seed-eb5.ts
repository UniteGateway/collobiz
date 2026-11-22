/**
 * GO EB5 demo data. Everything is labelled demo: staff accounts (with two-step sign-in), one approved demo partner,
 * two demo prospects and the Texas Solar + BESS project as PROPOSED ONLY (no claims verified). The `go_eb5` feature
 * flag is switched on for the demo environment only. Legal gates stay unapproved. Idempotent.
 */
import { eq, sql } from 'drizzle-orm';
import { EB5_DEFAULT_SETTINGS } from '@collabiz/types';
import type { Db } from './client';
import * as s from './schema';
import type { SeedRefs } from './seed';
import { DEMO_PASSWORD, DEMO_TOTP_SECRET } from './seed';
import { encryptField, hashPassword, randomToken, sha256 } from '../common/crypto';
import { config } from '../config';

async function demoUser(db: Db, email: string, fullName: string, mfa: boolean) {
  const [found] = await db.select().from(s.users).where(sql`lower(${s.users.email}) = ${email}`).limit(1);
  if (found) return found.id;
  const [u] = await db.insert(s.users).values({ email, fullName, passwordHash: await hashPassword(DEMO_PASSWORD), emailVerifiedAt: new Date(), ...(mfa ? { mfaSecretEnc: encryptField(DEMO_TOTP_SECRET), mfaEnabledAt: new Date() } : {}) }).returning();
  await db.update(s.users).set({ authSubject: `local:${u.id}` }).where(eq(s.users.id, u.id));
  return u.id;
}
const h = (v: string) => sha256(`eb5:${config().FIELD_ENCRYPTION_KEY}:${v}`);

export async function eb5Demo(db: Db, refs: SeedRefs) {
  await db.insert(s.featureFlags).values({ key: 'go_eb5', enabled: true, description: 'GO EB5 consultancy module (demo environment)' }).onConflictDoNothing();
  await db.insert(s.eb5Settings).values({ id: 1, values: EB5_DEFAULT_SETTINGS }).onConflictDoNothing();
  const [have] = await db.select({ id: s.eb5Leads.id }).from(s.eb5Leads).where(eq(s.eb5Leads.demo, true)).limit(1);
  if (have || !refs.orgs.meera) return;
  const admin = await demoUser(db, 'citrus.admin@goeb5.example', 'Demo CITRUS360 Admin', true);
  const manager = await demoUser(db, 'manager@goeb5.example', 'Demo GO EB5 Manager', true);
  const attorney = await demoUser(db, 'attorney@goeb5.example', 'Demo U.S. Immigration Attorney', true);
  const client = await demoUser(db, 'client@goeb5.example', 'Arjun Mehra', false);
  const by = refs.users.superadmin;
  const grant = [[admin, 'citrus_admin'], [manager, 'business_manager'], [attorney, 'attorney'], [refs.users.finance, 'finance'], [refs.users.compliance, 'compliance']] as const;
  await db.insert(s.eb5Roles).values(grant.filter(([u]) => u).map(([userId, role]) => ({ userId, role, grantedBy: by }))).onConflictDoNothing();
  const [p] = await db.insert(s.eb5Partners).values({ orgId: refs.orgs.meera, kind: 'business_consultant', role: 'bd_partner', jurisdiction: 'India', specialization: 'Demo partner — business owners in Mumbai and Pune exploring U.S. options', contactEmail: 'meera@consult.example',
    i956kStatus: 'pending', agreementStatus: 'signed', complianceStatus: 'approved', complianceNote: 'DEMO record — approved for testing only', reviewedBy: refs.users.compliance, reviewedAt: new Date(), linkToken: randomToken(12), createdBy: refs.users.meera }).onConflictDoNothing().returning();
  const lead = (code: string, name: string, email: string, phone: string, extra: Partial<typeof s.eb5Leads.$inferInsert>) => ({
    code, source: 'partner', fullName: name, country: 'India', city: 'Pune', contactEnc: encryptField(JSON.stringify({ email, phone })), emailHash: h(email), phoneHash: h(phone.replace(/\D/g, '').slice(-10)),
    readiness: 'Funds identified', timeline: '6–12 months', contactPreference: 'Video call', consentAt: new Date(), consentText: 'DEMO — sample prospect for testing; consent recorded for the demo only.',
    assignedManagerId: manager, demo: true, history: [{ at: new Date().toISOString(), by: null, stage: 0, note: 'Demo lead' }], ...extra,
  });
  await db.insert(s.eb5Leads).values([
    lead('EB5L-2026-100001', 'Arjun Mehra', 'client@goeb5.example', '+91 90000 00001', { partnerId: p?.id ?? null, introducedBy: refs.users.meera, clientUserId: client, attorneyUserId: attorney, stage: 4, notes: 'Demo: completed first consultation.' }),
    lead('EB5L-2026-100002', 'Kavya Rao', 'kavya.demo@example.com', '+91 90000 00002', { partnerId: p?.id ?? null, introducedBy: refs.users.meera, stage: 1 }),
  ] as never);
  await db.insert(s.eb5Projects).values({ name: 'Texas Solar + BESS (PROPOSED)', sponsor: 'To be confirmed', location: 'Texas, USA', sector: 'Renewable energy — solar with battery storage',
    description: 'PROPOSED ONLY — a candidate project for EB-5 discussion. Not USCIS-approved, not confirmed as a targeted employment area or rural, and not offering-ready. No claim may be shown to clients until supported by independent evidence and verified by compliance.',
    offeringStatus: 'proposed', demo: true, createdBy: by });
}
