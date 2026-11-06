/** Stage-specific demo data, appended as stages are delivered. Must stay idempotent. */
import { and, eq } from 'drizzle-orm';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Db } from './client';
import type { SeedRefs } from './seed';
import * as s from './schema';
import { encryptField, sha256 } from '../common/crypto';
import { config } from '../config';

export const AGREEMENTS = [
  { code: 'partner_terms', title: 'COLLABIZ Partner Terms', body: 'DRAFT — subject to legal review (Master Book §7.2).\n\n1. Eligible partner actions: register leads with buyer consent, apply to opportunities, collaborate in approved teams.\n2. Prohibited: undisclosed side deals, misrepresenting capability, sharing confidential buyer data, recruiting-based fees.\n3. Responsibilities: accurate KYC/KYB information, timely updates, compliance with applicable law.\n4. Termination: either party with notice; immediate suspension for fraud or confidentiality breach.\n5. No earnings are guaranteed. Commissions are payable only on defined contractual triggers.' },
  { code: 'lead_registration', title: 'Lead Registration Agreement', body: 'DRAFT — subject to legal review.\n\n1. Evidence: each registration records date, source and permitted proof of introduction.\n2. Protection: a verified lead receives a conditional protection window stated on its certificate.\n3. Unite-first review: the matching Unite Group company has a timed first-review opportunity (default 4 business hours).\n4. Conflicts are resolved on evidence, timestamps and relationship history by an independent panel, with appeal.\n5. Fee triggers, rates and deductions are set in the opportunity-specific commission addendum.' },
  { code: 'privacy_notice', title: 'Privacy Notice & Data Processing', body: 'DRAFT — subject to DPDP and jurisdictional review.\n\nPurposes: identity verification, opportunity matching (with consent), contract and settlement administration, security and fraud prevention. Rights: access/export, correction, deletion subject to legal retention, consent withdrawal. Contact: privacy team via Help & Support.' },
];

function storeDemoPdf(orgId: string, label: string) {
  const key = `kyb/${orgId}/${randomUUID()}`;
  const path = join(resolve(config().STORAGE_LOCAL_DIR), key);
  mkdirSync(join(path, '..'), { recursive: true });
  const buf = Buffer.from(`%PDF-1.4\n% COLLABIZ demo document: ${label}\n%%EOF\n`);
  writeFileSync(path, buf, { mode: 0o600 });
  return { key, sha: sha256(buf), size: buf.length };
}

async function stage03(db: Db, refs: SeedRefs) {
  for (const a of AGREEMENTS) {
    const exists = await db.select().from(s.agreementTemplates).where(and(eq(s.agreementTemplates.code, a.code), eq(s.agreementTemplates.version, 1))).limit(1);
    if (!exists.length) await db.insert(s.agreementTemplates).values({ code: a.code, version: 1, title: a.title, body: a.body, bodyHash: sha256(a.body) });
  }
  const profiles: Record<string, Partial<typeof s.partnerProfiles.$inferInsert> & { kind: string }> = {
    volt: { kind: 'company', registrationNumber: 'U40106MH2015PTC000001', gstin: '27AABCV1234F1Z5', sectors: ['solar', 'construction_epc', 'infrastructure'], skills: ['Rooftop solar', 'Ground-mount EPC', 'HT/LT electrical'], certifications: ['ISO9001', 'MNRE-Empanelled'], capacityMax: 25_00_00_000_00, regions: ['IN-MH', 'IN-GJ', 'IN-KA'], headline: 'Solar EPC contractor delivering 40 MW+ across Western India', about: 'Volt EPC designs, procures and commissions rooftop and ground-mount solar plants for C&I customers, with in-house civil and electrical teams.', services: ['EPC', 'O&M', 'Design'], employees: 120 },
    sunrise: { kind: 'company', registrationNumber: 'AAB-1234', gstin: '24AAKFS9876K1Z2', sectors: ['power_equipment', 'trading', 'solar'], skills: ['Transformers', 'Switchgear', 'Cables'], certifications: ['ISO9001', 'BIS'], capacityMax: 5_00_00_000_00, regions: ['IN-GJ', 'IN-MH', 'IN-RJ'], headline: 'Authorised distributor of electrical equipment for utilities and EPCs', about: 'Sunrise Traders stocks and distributes transformers, switchgear and cabling with same-week delivery across Gujarat and Maharashtra.', services: ['Distribution', 'Logistics'], employees: 45 },
    meera: { kind: 'individual', profession: 'Energy transition consultant', yearsExperience: 14, sectors: ['consulting', 'solar', 'real_estate'], skills: ['Feasibility studies', 'Tender advisory'], certifications: ['CEM'], capacityMax: 50_00_000_00, regions: ['IN-KA', 'IN-TN'], headline: 'Independent advisor for C&I solar procurement', about: 'Fourteen years advising manufacturers and developers on renewable energy procurement, tenders and project finance readiness.', services: ['Advisory'] },
    greenbuild: { kind: 'company', registrationNumber: 'U45200TN2018PTC000002', gstin: '33AAGCG5555L1Z9', sectors: ['construction_epc', 'infrastructure', 'real_estate'], skills: ['Civil works', 'Industrial sheds'], certifications: ['ISO45001'], capacityMax: 15_00_00_000_00, regions: ['IN-TN', 'IN-KA'], headline: 'Civil and infrastructure contractor for industrial projects', about: 'GreenBuild delivers civil foundations, industrial sheds and site infrastructure for manufacturing and energy projects in South India.', services: ['Civil EPC'], employees: 80 },
  };
  for (const [k, p] of Object.entries(profiles)) {
    const orgId = refs.orgs[k];
    const exists = await db.select().from(s.partnerProfiles).where(eq(s.partnerProfiles.organizationId, orgId)).limit(1);
    if (exists.length) continue;
    await db.insert(s.partnerProfiles).values({ organizationId: orgId, ...p, consentToMatch: true, completedSteps: ['account_type', 'details', 'industries', 'coverage', 'profile', 'documents', 'bank_tax', 'agreements'] });
    await db.insert(s.bankProfiles).values({ organizationId: orgId, accountHolder: k, accountNumberEnc: encryptField('000123456789'), accountLast4: '6789', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', panEnc: encryptField('ABCDE1234F'), panLast4: '234F', gstRegistered: p.kind === 'company', gstin: p.gstin ?? null, tdsSection: '194H', verified: k !== 'greenbuild' });
    const ownerKey = { volt: 'asha', sunrise: 'ravi', meera: 'meera', greenbuild: 'vikram' }[k]!;
    for (const a of AGREEMENTS) await db.insert(s.agreementAcceptances).values({ organizationId: orgId, userId: refs.users[ownerKey], templateCode: a.code, version: 1, typedName: ownerKey, docHash: sha256(a.body) }).onConflictDoNothing();
    for (const docType of p.kind === 'company' ? ['pan', 'incorporation_certificate', 'address_proof', 'gst_certificate'] : ['pan', 'identity_proof', 'address_proof']) {
      const f = storeDemoPdf(orgId, docType);
      await db.insert(s.kybDocuments).values({ organizationId: orgId, docType, fileName: `${docType}.pdf`, objectKey: f.key, sha256: f.sha, size: f.size, mime: 'application/pdf', status: k === 'greenbuild' ? 'pending' : 'accepted', uploadedBy: refs.users[ownerKey] });
    }
    if (k === 'greenbuild') await db.insert(s.kybReviews).values({ organizationId: orgId, fromStatus: 'not_started', toStatus: 'submitted', actorUserId: refs.users.vikram });
    else await db.insert(s.kybReviews).values({ organizationId: orgId, fromStatus: 'under_review', toStatus: 'verified', reason: 'Demo seed: documents verified', riskLevel: 'low', actorUserId: refs.users.compliance });
  }
}

export async function seedStages(db: Db, refs: SeedRefs) {
  await stage03(db, refs);
}
