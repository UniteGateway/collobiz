/** Stage-specific demo data, appended as stages are delivered. Must stay idempotent. */
import { and, eq, sql } from 'drizzle-orm';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Db } from './client';
import type { SeedRefs } from './seed';
import * as s from './schema';
import { canonicalJson, encryptField, sha256 } from '../common/crypto';
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

async function stage06(db: Db, refs: SeedRefs) {
  const have = await db.select({ id: s.leadClaims.id }).from(s.leadClaims).limit(1);
  if (have.length) return;
  const mk = async (orgKey: string, userKey: string, oppCode: string, customer: { legalName: string; taxId: string; city: string; contactName: string }, status: string, consentScope: string) => {
    const [o] = await db.select().from(s.opportunities).where(eq(s.opportunities.code, oppCode)).limit(1);
    const [c] = await db.insert(s.customers).values({ organizationId: refs.orgs[orgKey], ...customer, consentProvenance: { method: 'written_email', obtainedAt: new Date().toISOString(), disclosureScope: consentScope } }).returning();
    const snapshot = { code: oppCode, customer, sector: o.sector, consent: { method: 'written_email', disclosureScope: consentScope }, seeded: true };
    const now = new Date();
    await db.insert(s.leadClaims).values({ opportunityId: o.id, introducerOrgId: refs.orgs[orgKey], introducerUserId: refs.users[userKey], customerId: c.id, evidenceSummary: 'Buyer requested introduction by email (demo seed).', evidenceSnapshot: snapshot, evidenceHash: sha256(canonicalJson(snapshot)), consent: snapshot.consent, status, protectedFrom: now, protectedUntil: new Date(now.getTime() + 90 * 86400_000), certificateCode: `CZL-2026-${String(10000000 + Math.floor(Math.random() * 89999999))}` });
    return o;
  };
  await mk('meera', 'meera', 'OPP-2026-00005', { legalName: 'Karnataka Textile Cluster Association', taxId: '29AAATK1111A1Z1', city: 'Bengaluru', contactName: 'R. Shetty' }, 'protected', 'unite_and_approved_partners');
  // A fresh partner lead currently inside its Unite first-review window.
  const [gc] = await db.select().from(s.groupCompanies).where(eq(s.groupCompanies.organizationId, refs.orgs.uniteSolar)).limit(1);
  const now = new Date();
  const [o] = await db.insert(s.opportunities).values({ code: 'OPP-2026-00006', title: 'Rooftop solar 800 kW — Sri Ganesh Textiles, Coimbatore', summary: 'Spinning mill wants 800 kW rooftop solar under CAPEX model; roof survey done.', sector: 'solar', kind: 'project', route: 'partner_originated', source: 'partner_lead', city: 'Coimbatore', region: 'IN-TN', estimatedValue: 3_20_00_000_00, visibility: 'private', ownerOrgId: refs.orgs.meera, groupCompanyOrgId: refs.orgs.uniteSolar, buyerConfidential: true, status: 'unite_priority_review', version: 6, createdBy: refs.users.meera }).returning();
  const evs = ['draft', 'submitted', 'consent_check', 'duplicate_review', 'verified', 'unite_priority_review'];
  await db.insert(s.opportunityEvents).values(evs.map((st, i) => ({ opportunityId: o.id, version: i + 1, fromStatus: i ? evs[i - 1] : null, toStatus: st, reason: 'Seeded (demo)', actorUserId: refs.users.meera })));
  const [c] = await db.insert(s.customers).values({ organizationId: refs.orgs.meera, legalName: 'Sri Ganesh Textiles Pvt Ltd', taxId: '33AABCS2222B1Z2', city: 'Coimbatore', contactName: 'K. Ganesan', contactEmail: 'md@sriganesh.example', consentProvenance: { method: 'signed_letter', obtainedAt: now.toISOString(), disclosureScope: 'unite_only' } }).returning();
  const snap = { code: o.code, customer: { legalName: c.legalName, taxId: c.taxId, city: c.city }, sector: 'solar', seeded: true };
  await db.insert(s.leadClaims).values({ opportunityId: o.id, introducerOrgId: refs.orgs.meera, introducerUserId: refs.users.meera, customerId: c.id, evidenceSummary: 'Signed letter of authority from the managing director.', evidenceSnapshot: snap, evidenceHash: sha256(canonicalJson(snap)), consent: { method: 'signed_letter', obtainedAt: now.toISOString(), disclosureScope: 'unite_only' }, status: 'protected', protectedFrom: now, protectedUntil: new Date(now.getTime() + 90 * 86400_000), certificateCode: 'CZL-2026-00000006' });
  await db.insert(s.routingEvents).values({ opportunityId: o.id, groupCompanyOrgId: refs.orgs.uniteSolar, startAt: now, dueAt: new Date(now.getTime() + 24 * 3600_000), slaMinutes: gc.slaMinutes, calendar: gc.calendar });
}

async function stage07(db: Db, refs: SeedRefs) {
  const have = await db.select({ id: s.crmDeals.id }).from(s.crmDeals).limit(1);
  if (have.length) return;
  const P = (lakh: number) => lakh * 1_00_000 * 100;
  const mkCustomer = async (legalName: string, city: string, contactName: string) => (await db.insert(s.customers).values({ organizationId: refs.orgs.volt, legalName, city, contactName, consentProvenance: { method: 'crm_entry', obtainedAt: new Date().toISOString(), disclosureScope: 'restricted' }, restrictedContacts: true }).returning())[0];
  const a = await mkCustomer('Western Auto Components Ltd', 'Pune', 'S. Kale');
  const b = await mkCustomer('Deccan Cold Storage LLP', 'Nashik', 'A. Pawar');
  const deals = await db.insert(s.crmDeals).values([
    { organizationId: refs.orgs.volt, customerId: a.id, title: '1.5 MW rooftop EPC — Plant 2', value: P(62), stage: 'proposal', ownerUserId: refs.users.asha },
    { organizationId: refs.orgs.volt, customerId: a.id, title: 'O&M renewal FY27', value: P(4), stage: 'negotiation', ownerUserId: refs.users.rohit },
    { organizationId: refs.orgs.volt, customerId: b.id, title: '400 kW rooftop + battery', value: P(22), stage: 'qualified', ownerUserId: refs.users.asha },
    { organizationId: refs.orgs.volt, customerId: b.id, title: 'Carport pilot', value: P(3), stage: 'lost', lostReason: 'Customer deferred capex to next year', ownerUserId: refs.users.asha },
  ]).returning();
  await db.insert(s.crmActivities).values(deals.map((d) => ({ organizationId: refs.orgs.volt, subjectType: 'deal', subjectId: d.id, kind: 'system', body: `Seeded in "${d.stage}"`, actorUserId: refs.users.asha })));
  const day = 86400_000;
  await db.insert(s.crmTasks).values([
    { organizationId: refs.orgs.volt, title: 'Send revised BOQ to Western Auto', dueAt: new Date(Date.now() + day), assigneeUserId: refs.users.asha, customerId: a.id, dealId: deals[0].id, createdBy: refs.users.asha },
    { organizationId: refs.orgs.volt, title: 'Site visit — Deccan Cold Storage', dueAt: new Date(Date.now() + 3 * day), assigneeUserId: refs.users.rohit, customerId: b.id, dealId: deals[2].id, createdBy: refs.users.asha },
    { organizationId: refs.orgs.volt, title: 'Call CFO about O&M terms', dueAt: new Date(Date.now() - day), assigneeUserId: refs.users.rohit, customerId: a.id, dealId: deals[1].id, createdBy: refs.users.asha },
  ]);
}

async function stage08(db: Db, refs: SeedRefs) {
  const have = await db.select({ id: s.collaborationTeams.id }).from(s.collaborationTeams).limit(1);
  if (have.length) return;
  const [o] = await db.select().from(s.opportunities).where(eq(s.opportunities.code, 'OPP-2026-00001')).limit(1);
  const text = 'MUTUAL NON-DISCLOSURE UNDERTAKING — DRAFT (demo seed)\nTeam: Chakan Rooftop Consortium\nPurpose: Joint bid for the 2 MW Chakan rooftop EPC.';
  const [t] = await db.insert(s.collaborationTeams).values({ code: 'TM-000001', name: 'Chakan Rooftop Consortium', purpose: 'Joint bid for the 2 MW Chakan rooftop EPC: Volt EPC executes installation, Sunrise supplies balance-of-system electricals.', kind: 'team', opportunityId: o.id, leadOrgId: refs.orgs.volt, status: 'nda_pending', ndaText: text, ndaHash: sha256(text), createdBy: refs.users.asha }).returning();
  await db.insert(s.teamMembers).values([
    { teamId: t.id, organizationId: refs.orgs.volt, role: 'lead', responsibilities: 'Team lead, installation and commissioning', status: 'nda_signed', ndaSignedAt: new Date(), ndaSignedBy: refs.users.asha, ndaTypedName: 'Asha Patil', invitedBy: refs.users.asha },
    { teamId: t.id, organizationId: refs.orgs.sunrise, role: 'procurement', responsibilities: 'Supply of LT panels, cables and transformers', status: 'invited', invitedBy: refs.users.asha, inviteMessage: 'Would you join our bid as the electrical supply partner?' },
  ]);
}

async function stage09(db: Db, refs: SeedRefs) {
  const have = await db.select({ id: s.tenders.id }).from(s.tenders).limit(1);
  if (have.length) return;
  const closesAt = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  const [t] = await db.insert(s.tenders).values({
    code: 'TND-2026-000001', issuerOrgId: refs.orgs.uniteSolar, title: 'O&M services for 5 MW Shirur ground-mount plant', sector: 'solar', workPackage: 'Annual O&M (module cleaning, preventive maintenance, SCADA monitoring)',
    scope: 'Three-year operations and maintenance contract for the 5 MW Shirur ground-mount solar plant: fortnightly module cleaning, quarterly preventive maintenance of inverters and transformers, 24x7 SCADA monitoring and a 4-hour breakdown response.',
    budget: 4_500_000_00, closesAt, eligibility: { minLevel: 'verified', sectors: ['solar'], certifications: [] }, techWeight: 70, minTechScore: 60, status: 'published', publishedAt: new Date(), createdBy: refs.users.uniteAdmin,
  }).returning();
  const doc = storeDemoPdf(refs.orgs.uniteSolar, 'Tender scope of work');
  await db.insert(s.tenderDocuments).values({ tenderId: t.id, title: 'Scope of work & technical specification', fileName: 'TND-2026-000001-scope.pdf', objectKey: doc.key, sha256: doc.sha, size: doc.size, mime: 'application/pdf', uploadedBy: refs.users.uniteAdmin });
  await db.insert(s.tenderEvaluators).values([
    { tenderId: t.id, userId: refs.users.evaluator, role: 'technical', addedBy: refs.users.uniteAdmin },
    { tenderId: t.id, userId: refs.users.uniteAdmin, role: 'commercial', addedBy: refs.users.uniteAdmin },
  ]);
}

async function stage11(db: Db, refs: SeedRefs) {
  const have = await db.select({ id: s.projects.id }).from(s.projects).limit(1);
  if (have.length) return;
  const [p] = await db.insert(s.projects).values({
    code: 'PRJ-2026-000001', title: '2 MW Chakan rooftop EPC', description: 'Design, supply, installation and commissioning of a 2 MW rooftop plant across three sheds.',
    ownerOrgId: refs.orgs.uniteSolar, leadOrgId: refs.orgs.volt, value: 9_00_00_000_00, site: 'Chakan MIDC, Pune', region: 'IN-MH', startDate: '2026-10-01', endDate: '2027-02-28', status: 'active', createdBy: refs.users.uniteAdmin,
  }).returning();
  await db.insert(s.projectMembers).values([
    { projectId: p.id, organizationId: refs.orgs.uniteSolar, role: 'owner', scope: 'Client: approves baseline, inspects, certifies and pays', addedBy: refs.users.uniteAdmin },
    { projectId: p.id, organizationId: refs.orgs.volt, role: 'lead', scope: 'EPC execution', allocatedValue: 9_00_00_000_00, addedBy: refs.users.uniteAdmin },
    { projectId: p.id, organizationId: refs.orgs.sunrise, role: 'subcontractor', scope: 'LT panels, cabling and transformer supply', allocatedValue: 1_80_00_000_00, addedBy: refs.users.asha },
  ]);
  const [m1] = await db.insert(s.milestones).values([
    { projectId: p.id, seq: 1, title: 'Structure & module mounting — Shed A', dueDate: '2026-11-30', amount: 3_60_00_000_00, status: 'in_progress', progressPct: 60, requiresInspection: 'both' },
    { projectId: p.id, seq: 2, title: 'Electrical BoS & LT panels', dueDate: '2027-01-15', amount: 3_00_00_000_00, assignedOrgId: refs.orgs.sunrise, status: 'planned' },
    { projectId: p.id, seq: 3, title: 'Commissioning & net-metering', dueDate: '2027-02-20', amount: 2_40_00_000_00, status: 'planned' },
  ]).returning();
  await db.insert(s.projectUpdates).values({ projectId: p.id, milestoneId: m1.id, organizationId: refs.orgs.volt, authorUserId: refs.users.asha, note: 'Purlins fixed on Shed A; 60% of modules mounted. Rain stopped work for two days.', progressPct: 60 });
  await db.insert(s.projectMaterials).values([
    { projectId: p.id, item: 'Mono PERC 545 Wp modules', quantity: 3670, unit: 'nos', supplier: 'Unite Solar', status: 'delivered', deliveredQty: 3670, neededBy: '2026-10-20' },
    { projectId: p.id, item: 'String inverters 100 kW', quantity: 20, unit: 'nos', status: 'ordered', neededBy: '2026-12-10' },
  ]);
  await db.insert(s.projectChangeLog).values({ projectId: p.id, entity: 'project', entityId: p.id, field: 'status', before: 'planning', after: 'active', reason: 'Baseline schedule approved by the owner (demo seed)', userId: refs.users.uniteAdmin, organizationId: refs.orgs.uniteSolar });
}

async function stage11b(db: Db, refs: SeedRefs) {
  const [hasProfile] = await db.select({ id: s.partnerProfiles.organizationId }).from(s.partnerProfiles).where(eq(s.partnerProfiles.organizationId, refs.orgs.deccan)).limit(1);
  if (!hasProfile) {
    await db.insert(s.partnerProfiles).values({ organizationId: refs.orgs.deccan, kind: 'company', registrationNumber: 'U31900KA2012PTC000777', sectors: ['power_equipment', 'solar'], skills: ['Switchgear', 'Cables'], certifications: ['ISO9001'], regions: ['IN-KA', 'IN-TN'], headline: 'Authorised electrical distributor for Karnataka and Tamil Nadu', about: 'Stockist of switchgear, cables and transformers with warehouses in Bengaluru and Hosur.', services: ['Distribution'], consentToMatch: true, completedSteps: ['account_type', 'details', 'industries', 'coverage', 'profile', 'documents', 'bank_tax', 'agreements'] } as typeof s.partnerProfiles.$inferInsert);
  }
  const have = await db.select({ id: s.supplierProducts.id }).from(s.supplierProducts).limit(1);
  if (have.length) return;
  await db.insert(s.supplierProducts).values([
    { supplierOrgId: refs.orgs.sunrise, name: '630 kVA oil-cooled distribution transformer', sector: 'power_equipment', description: '11/0.433 kV, ONAN, BIS-certified, with OLTC option. Type-tested at CPRI.', sku: 'SR-TX-630', unit: 'nos', price: 9_80_000_00, moq: 1, leadTimeDays: 21, stock: 'made_to_order', createdBy: refs.users.ravi },
    { supplierOrgId: refs.orgs.sunrise, name: 'LT panel 800 A with ACB incomer', sector: 'power_equipment', description: 'Form 3b LT panel, 800 A ACB incomer, MCCB outgoings, powder-coated CRCA.', sku: 'SR-LT-800', unit: 'nos', price: 4_25_000_00, moq: 1, leadTimeDays: 14, stock: 'made_to_order', createdBy: refs.users.ravi },
    { supplierOrgId: refs.orgs.sunrise, name: '4C x 300 sq mm XLPE armoured cable', sector: 'power_equipment', description: '1.1 kV aluminium, XLPE insulated, steel-wire armoured, IS 7098.', sku: 'SR-CBL-4C300', unit: 'm', price: 1_450_00, moq: 100, leadTimeDays: 5, stock: 'in_stock', createdBy: refs.users.ravi },
    { supplierOrgId: refs.orgs.deccan, name: 'MCCB 250 A 4P', sector: 'power_equipment', description: '36 kA breaking capacity, thermal-magnetic release.', sku: 'DD-MCCB-250', unit: 'nos', price: 18_500_00, moq: 5, leadTimeDays: 3, stock: 'in_stock', createdBy: refs.users.deepak },
  ]);
  await db.insert(s.tradeRequirements).values({ code: 'REQ-2026-000001', buyerOrgId: refs.orgs.volt, title: 'Cabling for 2 MW Chakan rooftop', sector: 'power_equipment', description: 'Aluminium armoured cable for inverter-to-LT panel runs.', items: [{ item: '4C x 300 sq mm XLPE armoured cable', quantity: 1800, unit: 'm' }, { item: '4C x 95 sq mm XLPE armoured cable', quantity: 600, unit: 'm' }], deliveryLocation: 'Chakan MIDC, Pune', region: 'IN-MH', neededBy: '2026-12-10', closesAt: new Date(Date.now() + 10 * 86400_000), createdBy: refs.users.asha });
}

async function stage12(db: Db, refs: SeedRefs) {
  const have = await db.select({ id: s.commissionPolicies.id }).from(s.commissionPolicies).limit(1);
  if (have.length) return;
  const [pol] = await db.insert(s.commissionPolicies).values({ code: 'INTRODUCER-STD', name: 'Introducer commission — standard (demo rate)', basis: 'percent', rateBps: 200, tdsBps: 500, clawbackDays: 90, status: 'active', createdBy: refs.users.superadmin, activatedBy: refs.users.finance2, activatedAt: new Date() }).returning();
  await db.insert(s.commissionPolicies).values({ code: 'EPC-TIERED', name: 'EPC introducer — tiered (draft, pending matrix approval)', sector: 'construction_epc', basis: 'tiered', tiers: [{ upTo: 1_00_00_000_00, rateBps: 250 }, { upTo: null, rateBps: 150 }], tdsBps: 500, status: 'draft', createdBy: refs.users.superadmin });
  const [p] = await db.select().from(s.projects).where(eq(s.projects.code, 'PRJ-2026-000001')).limit(1);
  if (!p) return;
  const ms = await db.select().from(s.milestones).where(eq(s.milestones.projectId, p.id));
  const terms = { policy: { code: pol.code, version: pol.version, name: pol.name, basis: pol.basis, rateBps: pol.rateBps, flatAmount: null, tiers: null, tdsBps: pol.tdsBps, clawbackDays: pol.clawbackDays, trigger: pol.trigger }, shareBps: 10000, gstRegistered: false, projectValue: p.value };
  const [a] = await db.insert(s.commissionAgreements).values({ code: 'CA-2026-000001', beneficiaryOrgId: refs.orgs.meera, payerOrgId: p.ownerOrgId, projectId: p.id, policyId: pol.id, terms, termsHash: sha256(canonicalJson(terms)), createdBy: refs.users.uniteAdmin }).returning();
  for (const m of ms) {
    const gross = Math.round((m.amount * 200) / 10000);
    const tds = Math.round((gross * 500) / 10000);
    const [e] = await db.insert(s.commissionEntries).values({ agreementId: a.id, beneficiaryOrgId: refs.orgs.meera, milestoneId: m.id, description: `Milestone ${m.seq}: ${m.title}`, baseAmount: m.amount, gross, share: gross, taxable: gross, gst: 0, tds, payable: gross - tds }).returning();
    await db.insert(s.commissionJournal).values({ entryId: e.id, action: 'entry.estimated', toStatus: 'estimated', amount: e.payable, note: 'Projected from the project schedule (demo seed)' });
  }
}

/** Stage 13 demo content: a partner conversation, announcements, an upcoming meeting and a support request (all demo data). */
async function stage13(db: Db, refs: SeedRefs) {
  const ago = (min: number) => new Date(Date.now() - min * 60_000);
  const [t] = await db.insert(s.messageThreads).values({ kind: 'direct', subject: 'Transformer stock for Chakan', retentionDays: 730, createdBy: refs.users.deepak, lastMessageAt: ago(42) }).returning();
  await db.insert(s.threadMembers).values([
    { threadId: t.id, userId: refs.users.deepak, organizationId: refs.orgs.deccan, lastReadAt: ago(40) },
    { threadId: t.id, userId: refs.users.asha, organizationId: refs.orgs.volt, lastReadAt: ago(300) },
  ]);
  const msgs: [string, string, string, number][] = [
    ['deepak', 'deccan', 'Hi Asha — we have two 1000 kVA transformers in our Pune warehouse if the Chakan job needs them.', 380],
    ['asha', 'volt', 'Thanks Deepak. Delivery by the 20th would work. Can you share the test certificates?', 330],
    ['deepak', 'deccan', 'Yes. I will upload the routine test reports to the enquiry today.', 120],
    ['deepak', 'deccan', 'Uploaded. Price holds until Friday; ex-works Pune.', 42],
  ];
  for (const [u, o, body, min] of msgs) await db.insert(s.messages).values({ threadId: t.id, authorUserId: refs.users[u], authorOrgId: refs.orgs[o], bodyEnc: encryptField(body), createdAt: ago(min) });

  await db.insert(s.announcements).values([
    { title: 'New solar tender window opens 15 November', body: 'Unite Solar will publish three C&I rooftop tenders (2–5 MW) for verified partners. Make sure your ISO 45001 certificate and recent project references are on your profile before the window opens.', audience: 'verified_partners', sector: 'solar', important: true, createdBy: refs.users.superadmin, publishedAt: ago(60 * 20) },
    { title: 'Faster commission payouts from December', body: 'Approved commission will now be paid in weekly runs instead of monthly. Nothing changes in how commission is earned: only when the customer pays the certified milestone.', audience: 'partners', important: false, createdBy: refs.users.superadmin, publishedAt: ago(60 * 72) },
  ]);

  const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(11, 0, 0, 0);
  const [m] = await db.insert(s.meetings).values({ title: 'Transformer delivery and test certificates', agenda: 'Confirm delivery date for Chakan, review routine test reports, agree payment terms.', startsAt: start, endsAt: new Date(start.getTime() + 30 * 60_000), organizerUserId: refs.users.asha, organizerOrgId: refs.orgs.volt, roomKey: randomUUID().replace(/-/g, '').slice(0, 16) }).returning();
  await db.insert(s.meetingAttendees).values([
    { meetingId: m.id, userId: refs.users.asha, organizationId: refs.orgs.volt, rsvp: 'accepted' },
    { meetingId: m.id, userId: refs.users.deepak, organizationId: refs.orgs.deccan, rsvp: 'accepted' },
    { meetingId: m.id, userId: refs.users.rohit, organizationId: refs.orgs.volt, rsvp: 'pending' },
  ]);

  const [tk] = await db.insert(s.supportTickets).values({ code: 'TKT-2026-104512', requesterUserId: refs.users.asha, organizationId: refs.orgs.volt, category: 'technical', priority: 'normal', subject: 'Milestone photos upload slowly from site', status: 'in_progress', firstResponseDueAt: new Date(Date.now() + 20 * 3600_000), firstRespondedAt: ago(90), assigneeUserId: refs.users.compliance }).returning();
  await db.insert(s.ticketMessages).values([
    { ticketId: tk.id, authorUserId: refs.users.asha, body: 'Uploading site photos for the Chakan milestone takes several minutes per image on the site’s 4G connection.', createdAt: ago(240) },
    { ticketId: tk.id, authorUserId: refs.users.compliance, fromStaff: true, body: 'Thanks Asha. We are adding automatic image compression before upload; in the meantime you can upload from the office and attach later.', createdAt: ago(90) },
  ]);
  await db.insert(s.notifications).values([
    { userId: refs.users.asha, kind: 'message', title: 'New message from Deepak Rao', body: 'Open the conversation to read it.', link: `/chat/${t.id}`, createdAt: ago(42) },
    { userId: refs.users.asha, kind: 'meeting', title: 'Meeting tomorrow: Transformer delivery and test certificates', body: 'Deepak Rao accepted.', link: `/meetings/${m.id}/room`, createdAt: ago(100) },
    { userId: refs.users.asha, kind: 'support', title: 'Reply on TKT-2026-104512', body: 'We are adding automatic image compression before upload…', link: `/support/tickets?id=${tk.id}`, createdAt: ago(90) },
  ]);
}

/** Stage 14 demo content: courses, approved marketing assets, and a completed 2025 project that gives Volt EPC a verified track record. */
async function stage14(db: Db, refs: SeedRefs) {
  const have = await db.select({ id: s.courses.id }).from(s.courses).limit(1);
  if (have.length) return;
  const q = (question: string, options: string[], answer: number) => ({ q: question, options, answer });
  await db.insert(s.courses).values([
    { code: 'CZ-101', title: 'Working with Unite Group on COLLABIZ', summary: 'How Unite-first routing, protected leads and the commission ledger work — the essentials for every partner.', level: 'foundation', minutes: 25,
      modules: [
        { title: 'The Unite-first model', body: 'Business on COLLABIZ flows through four routes: Unite-owned listings, partner-originated leads, the partner exchange and joint execution. Partner-originated opportunities get a timed first review by Unite Group before they can be released to other partners.' },
        { title: 'Protecting your introductions', body: 'Register a customer with written consent and evidence. A sealed, time-stamped certificate protects your introduction for the protection window shown on it. Disputes are decided on evidence, by someone who is not a party.' },
        { title: 'How commission is earned', body: 'Commission moves from projected to eligible to earned to paid. It becomes earned only when the customer pays a certified milestone under the contract — never on signature or invoice alone.' },
      ],
      questions: [
        q('When does commission become earned?', ['When the contract is signed', 'When the customer pays a certified milestone', 'When the partner raises an invoice', 'When Unite approves the lead'], 1),
        q('What protects a registered introduction?', ['A sealed, time-stamped certificate', 'An email to Unite', 'A signed NDA only', 'Nothing until the deal closes'], 0),
        q('Who reviews a partner-originated opportunity first?', ['Any verified partner', 'The customer', 'Unite Group, within a timed window', 'The partner’s own team'], 2),
        q('How many routes can business follow on COLLABIZ?', ['Two', 'Three', 'Four', 'Five'], 2),
      ], passMark: 75 },
    { code: 'CZ-201', title: 'Rooftop solar EPC quality essentials', summary: 'Structure, electrical BoS and commissioning checks that Unite Solar inspects before certifying a milestone.', sector: 'solar', level: 'professional', minutes: 40,
      modules: [
        { title: 'Structure and mounting', body: 'Check purlin spacing against the design, torque on clamps, and roof waterproofing at every penetration. Photograph each shed before modules go up.' },
        { title: 'Electrical balance of system', body: 'String voltages must sit inside the inverter window at the lowest site temperature. Label every string and test insulation resistance before energising.' },
        { title: 'Evidence for certification', body: 'Milestone evidence needs dated photos, test reports and the inspection checklist. Missing evidence is the most common reason a milestone is returned.' },
      ],
      questions: [
        q('What must be tested before energising strings?', ['Module colour', 'Insulation resistance', 'Inverter weight', 'Roof colour'], 1),
        q('Which evidence is required for certification?', ['Dated photos, test reports and the inspection checklist', 'Only an invoice', 'A phone call', 'The purchase order'], 0),
        q('String voltage must stay within the inverter window at…', ['The highest site temperature', 'The lowest site temperature', 'Noon only', 'Any temperature'], 1),
      ], passMark: 70 },
    { code: 'CZ-202', title: 'Bidding well on sealed tenders', summary: 'Prepare compliant technical and commercial envelopes and avoid common disqualification reasons.', level: 'professional', minutes: 30,
      modules: [
        { title: 'Before you bid', body: 'Download every tender document, check eligibility and ask clarifications before the deadline. Clarifications and answers are shared with all bidders.' },
        { title: 'The two envelopes', body: 'Technical evaluators never see prices. Put your method, experience and timeline in the technical envelope; price and payment terms only in the commercial envelope.' },
      ],
      questions: [
        q('Who can see your price before commercial opening?', ['Technical evaluators', 'Other bidders', 'Nobody', 'Platform administrators'], 2),
        q('Where do clarification answers go?', ['Only to you', 'To every bidder', 'Nowhere', 'To the evaluator only'], 1),
      ], passMark: 70 },
  ]);
  await db.insert(s.marketingAssets).values([
    { kind: 'brochure', title: 'Rooftop solar for factories — one-page overview', body: 'Cut daytime power costs with rooftop solar delivered by a verified Unite Group partner. Design, supply, installation and commissioning; Tier-1 modules; performance monitoring from day one.', sector: 'solar', approvedBy: refs.users.superadmin },
    { kind: 'brochure', title: 'Transformer and LT panel supply', body: 'BIS-certified distribution transformers and IEC 61439 panels sourced through Unite Group companies, with milestone-based payment and tracked delivery.', sector: 'power_equipment', approvedBy: refs.users.superadmin },
    { kind: 'social', title: 'LinkedIn — we are now a verified partner', body: 'We’re proud to be a verified partner on COLLABIZ, the Unite Group collaboration network. Verified identity, protected introductions and transparent commissions — talk to us about your next project. #COLLABIZ #UniteGroup', channel: 'linkedin', minLevel: 'verified', approvedBy: refs.users.superadmin },
    { kind: 'social', title: 'WhatsApp — rooftop solar offer', body: 'Planning rooftop solar for your factory? We deliver with Unite Solar as a verified COLLABIZ partner — design to commissioning, with clear milestones. Reply to book a free roof assessment.', channel: 'whatsapp', sector: 'solar', minLevel: 'verified', approvedBy: refs.users.superadmin },
    { kind: 'social', title: 'LinkedIn — certified partner announcement', body: 'Our team has completed COLLABIZ certification for rooftop solar quality. Every milestone we deliver is inspected and certified before invoicing. #CertifiedPartner', channel: 'linkedin', minLevel: 'certified', approvedBy: refs.users.superadmin },
    { kind: 'guide', title: 'Brand guidelines for co-branded material', body: 'Use the Unite Group partner lock-up only with your verified partner badge. Do not alter colours, add price claims or imply Unite Group warranties. Every co-branded piece must carry the standard footer.', approvedBy: refs.users.superadmin },
  ]);
  // A completed 2025 project (matches the published case study) — the source of Volt EPC's verified outcomes.
  const [p] = await db.insert(s.projects).values({ code: 'PRJ-2025-000014', title: '1.2 MW rooftop solar — Pune auto-components plant', description: 'Completed demo project used for verified reputation.', ownerOrgId: refs.orgs.uniteSolar, leadOrgId: refs.orgs.volt,
    value: 5_40_00_000_00, site: 'Chakan, Pune', region: 'IN-MH', startDate: '2025-06-01', endDate: '2025-08-31', status: 'closed', completedAt: new Date('2025-08-28'), closedAt: new Date('2025-09-30'), createdBy: refs.users.uniteAdmin }).returning();
  await db.insert(s.projectMembers).values([
    { projectId: p.id, organizationId: refs.orgs.uniteSolar, role: 'owner', addedBy: refs.users.uniteAdmin },
    { projectId: p.id, organizationId: refs.orgs.volt, role: 'lead', allocatedValue: 5_40_00_000_00, addedBy: refs.users.uniteAdmin },
  ]);
  await db.insert(s.milestones).values([
    { projectId: p.id, seq: 1, title: 'Structure & mounting', dueDate: '2025-07-05', amount: 2_00_00_000_00, status: 'invoiced', progressPct: 100, certifiedAt: new Date('2025-07-03'), certifiedBy: refs.users.uniteAdmin, certifiedAmount: 2_00_00_000_00 },
    { projectId: p.id, seq: 2, title: 'Electrical BoS', dueDate: '2025-08-01', amount: 2_00_00_000_00, status: 'invoiced', progressPct: 100, certifiedAt: new Date('2025-08-06'), certifiedBy: refs.users.uniteAdmin, certifiedAmount: 2_00_00_000_00 },
    { projectId: p.id, seq: 3, title: 'Commissioning & net-metering', dueDate: '2025-08-31', amount: 1_40_00_000_00, status: 'invoiced', progressPct: 100, certifiedAt: new Date('2025-08-27'), certifiedBy: refs.users.uniteAdmin, certifiedAmount: 1_40_00_000_00 },
  ]);
  await db.insert(s.partnerReviews).values({ projectId: p.id, reviewerOrgId: refs.orgs.uniteSolar, reviewerUserId: refs.users.uniteAdmin, subjectOrgId: refs.orgs.volt, quality: 5, timeliness: 4, communication: 5,
    comment: 'Clean installation and complete evidence for every milestone. Electrical work finished five days late after a monsoon delay, but the team kept us informed throughout.' });
}

export async function seedStages(db: Db, refs: SeedRefs) {
  await stage03(db, refs);
  await stage04(db, refs);
  await stage05(db, refs);
  await stage06(db, refs);
  await stage07(db, refs);
  await stage08(db, refs);
  await stage09(db, refs);
  await stage11(db, refs);
  await stage11b(db, refs);
  await stage12(db, refs);
  await stage13(db, refs);
  await stage14(db, refs);
}
