/** Stage-specific demo data, appended as stages are delivered. Must stay idempotent. */
import { and, eq, sql } from 'drizzle-orm';
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

async function stage04(db: Db, refs: SeedRefs) {
  const gcs: [string, string, string, string[], string][] = [
    ['uniteSolar', 'UG-SOLAR-PLACEHOLDER', 'Unite Solar', ['solar', 'construction_epc'], 'Rooftop and utility-scale solar EPC, solar products and O&M.'],
    ['powertek', 'UG-POWERTEK-PLACEHOLDER', 'Powertek', ['power_equipment', 'manufacturing'], 'Transformers, switchgear and power equipment with installation and service.'],
    ['uniteExim', 'UG-EXIM-PLACEHOLDER', 'Unite Exim', ['trading', 'logistics'], 'Import-export trading desk and international logistics coordination.'],
  ];
  for (const [k, code, brand, sectors, description] of gcs) {
    await db.insert(s.groupCompanies).values({ organizationId: refs.orgs[k], legalEntityCode: code, brandName: brand, sectors, description }).onConflictDoNothing();
  }
  const have = await db.select({ id: s.catalogItems.id }).from(s.catalogItems).limit(1);
  if (have.length) return;
  const P = (rupees: number) => rupees * 100;
  const items: (typeof s.catalogItems.$inferInsert)[] = [
    { ownerOrgId: refs.orgs.uniteSolar, kind: 'product', name: 'Mono PERC Solar Module 545 Wp', sector: 'solar', description: 'Tier-1 bifacial mono PERC module, 25-year linear performance warranty, IEC 61215/61730 certified.', sku: 'US-MOD-545', unit: 'module', listPrice: P(13500), priceVisibility: 'verified_partners', visibility: 'public', status: 'published', specs: { 'Power': '545 Wp', 'Efficiency': '21.1%', 'Warranty': '25 years' } },
    { ownerOrgId: refs.orgs.uniteSolar, kind: 'service', name: 'Rooftop Solar EPC (C&I, 100 kW–2 MW)', sector: 'solar', description: 'Design, engineering, procurement, installation and commissioning of commercial rooftop solar plants with net-metering liaison.', unit: 'kWp', listPrice: P(42000), priceVisibility: 'public', visibility: 'public', status: 'published', specs: { 'Capacity range': '100 kW – 2 MW', 'Timeline': '8–14 weeks' } },
    { ownerOrgId: refs.orgs.uniteSolar, kind: 'service', name: 'Solar O&M Annual Maintenance Contract', sector: 'solar', description: 'Preventive maintenance, cleaning schedules, inverter monitoring and performance reporting for operating plants.', unit: 'kWp / year', listPrice: P(600), priceVisibility: 'certified_partners', visibility: 'partners', status: 'published', specs: { 'Response SLA': '48 hours' } },
    { ownerOrgId: refs.orgs.powertek, kind: 'product', name: 'Distribution Transformer 1000 kVA', sector: 'power_equipment', description: 'Oil-immersed 11 kV / 433 V distribution transformer, BIS certified, energy-efficiency level 2.', sku: 'PT-DT-1000', unit: 'unit', listPrice: P(1150000), priceVisibility: 'verified_partners', visibility: 'public', status: 'published', specs: { 'Rating': '1000 kVA', 'Cooling': 'ONAN' } },
    { ownerOrgId: refs.orgs.powertek, kind: 'product', name: 'LT Switchgear Panel (PCC)', sector: 'power_equipment', description: 'Power control centre panels built to IEC 61439 with ACB incomers and metering.', unit: 'panel', priceVisibility: 'on_request', visibility: 'public', status: 'published', specs: { 'Standard': 'IEC 61439' } },
    { ownerOrgId: refs.orgs.powertek, kind: 'service', name: 'Substation Commissioning & Testing', sector: 'power_equipment', description: 'Pre-commissioning tests, relay settings and energisation support for HT substations up to 66 kV.', unit: 'project', priceVisibility: 'on_request', visibility: 'partners', status: 'published', specs: {} },
    { ownerOrgId: refs.orgs.uniteExim, kind: 'service', name: 'Import Sourcing & Customs Coordination', sector: 'trading', description: 'Supplier sourcing, inspection, freight booking and customs documentation for equipment imports.', unit: 'shipment', listPrice: P(35000), priceVisibility: 'verified_partners', visibility: 'public', status: 'published', specs: { 'Ports': 'Nhava Sheva, Mundra, Chennai' } },
    { ownerOrgId: refs.orgs.uniteExim, kind: 'product', name: 'Internal pricing sheet — FY27 (confidential)', sector: 'trading', description: 'Internal draft price list not visible to partners or the public.', unit: 'sheet', listPrice: P(1), priceVisibility: 'on_request', visibility: 'private', status: 'draft', specs: {} },
  ];
  await db.insert(s.catalogItems).values(items);
  await db.insert(s.successStories).values([
    { title: '1.2 MW rooftop solar for a Pune auto-components plant', sector: 'solar', summary: 'A consultant-registered lead, accepted by Unite Solar in first review and executed with Volt EPC as installation partner.', body: 'Meera Iyer registered the lead with buyer consent. Unite Solar accepted it within the four-business-hour review window, formed a team with Volt EPC for installation, and commissioned the plant in eleven weeks. Commission was settled after the customer payment milestone.', metrics: [{ label: 'Capacity', value: '1.2 MW' }, { label: 'Delivery', value: '11 weeks' }, { label: 'Partners', value: '3' }], partnerOrgIds: [refs.orgs.volt, refs.orgs.meera], partnerConsent: true, status: 'published', publishedAt: new Date() },
    { title: 'Transformer supply for an industrial park in Gujarat', sector: 'power_equipment', summary: 'Sunrise Traders sourced Powertek transformers for a developer, with transparent distributor margin tracking.', body: 'Sunrise Traders submitted a buyer requirement, Powertek quoted through the platform, and the order was delivered in six weeks with milestone-based payment.', metrics: [{ label: 'Units', value: '6 transformers' }, { label: 'Lead time', value: '6 weeks' }], partnerOrgIds: [refs.orgs.sunrise], partnerConsent: true, status: 'published', publishedAt: new Date() },
  ]);
}

async function stage05(db: Db, refs: SeedRefs) {
  const have = await db.select({ id: s.opportunities.id }).from(s.opportunities).limit(1);
  if (have.length) return;
  const P = (lakh: number) => lakh * 1_00_000 * 100;
  const in30 = new Date(Date.now() + 30 * 86400_000);
  const list: (typeof s.opportunities.$inferInsert & { _ev?: string })[] = [
    { code: 'OPP-2026-00001', title: '2 MW rooftop solar EPC — auto-components plant, Chakan', summary: 'Unite Solar seeks an EPC installation partner for a 2 MW rooftop plant across three sheds. Civil, structure and electrical scope; Unite supplies modules and inverters.', sector: 'solar', kind: 'project', route: 'unite_owned', source: 'unite_listing', city: 'Pune', region: 'IN-MH', lat: 18.76, lng: 73.86, estimatedValue: P(80), deadline: in30, visibility: 'verified_partners', minLevel: 'verified', requiredCertifications: [], ownerOrgId: refs.orgs.uniteSolar, groupCompanyOrgId: refs.orgs.uniteSolar },
    { code: 'OPP-2026-00002', title: 'Distributor for transformers — Rajasthan territory', summary: 'Powertek is appointing an authorised distributor for distribution transformers in Rajasthan with stocking and service capability.', sector: 'power_equipment', kind: 'distributorship', route: 'unite_owned', source: 'unite_listing', city: 'Jaipur', region: 'IN-RJ', lat: 26.91, lng: 75.79, estimatedValue: P(150), deadline: in30, visibility: 'public', minLevel: 'certified', requiredCertifications: ['BIS'], ownerOrgId: refs.orgs.powertek, groupCompanyOrgId: refs.orgs.powertek },
    { code: 'OPP-2026-00003', title: 'Civil foundations for 5 MW ground-mount plant — Tamil Nadu', summary: 'Pile foundations and module mounting structure civil works for a ground-mount plant near Tirunelveli.', sector: 'construction_epc', kind: 'project', route: 'unite_owned', source: 'unite_listing', city: 'Tirunelveli', region: 'IN-TN', lat: 8.71, lng: 77.76, estimatedValue: P(120), deadline: in30, visibility: 'public', minLevel: 'verified', requiredCertifications: ['ISO45001'], ownerOrgId: refs.orgs.uniteSolar, groupCompanyOrgId: refs.orgs.uniteSolar },
    { code: 'OPP-2026-00004', title: 'Import sourcing of HT cables — Gujarat port project', summary: 'Unite Exim needs a trading partner to source and clear 33 kV HT cables for a port expansion.', sector: 'trading', kind: 'product_supply', route: 'unite_owned', source: 'unite_listing', city: 'Mundra', region: 'IN-GJ', lat: 22.84, lng: 69.72, estimatedValue: P(45), deadline: in30, visibility: 'verified_partners', minLevel: 'verified', requiredCertifications: [], ownerOrgId: refs.orgs.uniteExim, groupCompanyOrgId: refs.orgs.uniteExim },
    { code: 'OPP-2026-00005', title: 'Energy audit consultant — textile cluster, Karnataka', summary: 'Partner-originated requirement released by Unite Solar for partner exchange: energy audits for 12 textile units before solar adoption.', sector: 'consulting', kind: 'service', route: 'partner_exchange', source: 'partner_lead', city: 'Bengaluru', region: 'IN-KA', lat: 12.97, lng: 77.59, estimatedValue: P(6), deadline: in30, visibility: 'verified_partners', minLevel: 'verified', requiredCertifications: [], ownerOrgId: refs.orgs.meera, groupCompanyOrgId: refs.orgs.uniteSolar, buyerConfidential: true, _ev: 'released' },
  ];
  for (const { _ev, ...o } of list) {
    const status = _ev ?? 'qualification';
    const [row] = await db.insert(s.opportunities).values({ ...o, status, listed: true, publishedAt: new Date(), createdBy: refs.users.uniteAdmin, version: 2 }).returning();
    await db.insert(s.opportunityEvents).values([{ opportunityId: row.id, version: 1, toStatus: 'draft', reason: 'Seeded', actorUserId: refs.users.uniteAdmin }, { opportunityId: row.id, version: 2, fromStatus: 'draft', toStatus: status, reason: 'Seeded (demo)', actorUserId: refs.users.uniteAdmin }]);
    if (o.code === 'OPP-2026-00001') await db.insert(s.opportunityApplications).values({ opportunityId: row.id, organizationId: refs.orgs.volt, applicantUserId: refs.users.asha, message: 'Volt EPC has commissioned 40 MW of C&I rooftop plants in Maharashtra and can mobilise within two weeks.', proposedValue: P(76) });
  }
  await db.execute(sql`select setval('opportunity_code_seq', 1005)`);
}

export async function seedStages(db: Db, refs: SeedRefs) {
  await stage03(db, refs);
  await stage04(db, refs);
  await stage05(db, refs);
}
