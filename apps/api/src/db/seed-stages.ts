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
import { VENTURES } from './ventures-data';

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
      await db.insert(s.kybDocuments).values({ organizationId: orgId, docType, fileName: `${docType.replace(/_/g, '-')}.pdf`, objectKey: f.key, sha256: f.sha, size: f.size, mime: 'application/pdf', status: k === 'greenbuild' ? 'pending' : 'accepted', uploadedBy: refs.users[ownerKey] });
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
    await db.insert(s.opportunityEvents).values([{ opportunityId: row.id, version: 1, toStatus: 'draft', reason: 'Drafted by Unite Group', actorUserId: refs.users.uniteAdmin }, { opportunityId: row.id, version: 2, fromStatus: 'draft', toStatus: status, reason: 'Reviewed by Unite Group', actorUserId: refs.users.uniteAdmin }]);
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
  await db.insert(s.opportunityEvents).values(evs.map((st, i) => ({ opportunityId: o.id, version: i + 1, fromStatus: i ? evs[i - 1] : null, toStatus: st, reason: 'Updated by the publisher', actorUserId: refs.users.meera })));
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
  await db.insert(s.crmActivities).values(deals.map((d) => ({ organizationId: refs.orgs.volt, subjectType: 'deal', subjectId: d.id, kind: 'system', body: `Added to the pipeline at ${d.stage.charAt(0).toUpperCase() + d.stage.slice(1)}`, actorUserId: refs.users.asha })));
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
  // 090–092: one order Volt EPC placed with Sunrise, dispatched and on its way, so tracking and goods receipt can be seen.
  const poLines = [{ item: 'LT panel 800 A with ACB incomer', quantity: 1, unit: 'nos', unitPrice: 4_25_000_00 }];
  const [po] = await db.insert(s.purchaseOrders).values({ number: 'PO-2026-100001', buyerOrgId: refs.orgs.volt, supplierOrgId: refs.orgs.sunrise, lines: poLines, subtotal: 4_25_000_00, taxPct: 18, total: 5_01_500_00, deliveryAddress: 'Plot B-14, Chakan MIDC Phase II, Pune 410501', deliveryBy: new Date(Date.now() + 6 * 86400_000).toISOString().slice(0, 10), paymentTerms: '30 days from delivery', status: 'shipped', version: 1, createdBy: refs.users.asha }).returning();
  const day = (d: number) => new Date(Date.now() - d * 86400_000);
  await db.insert(s.poEvents).values([
    { poId: po.id, action: 'po.issued', fromStatus: 'draft', toStatus: 'issued', userId: refs.users.asha, organizationId: refs.orgs.volt, createdAt: day(6) },
    { poId: po.id, action: 'po.accepted', fromStatus: 'issued', toStatus: 'accepted', userId: refs.users.ravi, organizationId: refs.orgs.sunrise, createdAt: day(5) },
    { poId: po.id, action: 'po.in_fulfilment', fromStatus: 'accepted', toStatus: 'in_fulfilment', userId: refs.users.ravi, organizationId: refs.orgs.sunrise, createdAt: day(4) },
    { poId: po.id, action: 'po.shipped', fromStatus: 'in_fulfilment', toStatus: 'shipped', userId: refs.users.ravi, organizationId: refs.orgs.sunrise, createdAt: day(1) },
  ]);
  await db.insert(s.shipments).values({ poId: po.id, carrier: 'Safexpress', trackingNo: 'SFX4471029', dispatchedAt: day(1), eta: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10), events: [{ at: day(1).toISOString(), status: 'Picked up', location: 'Hosur', note: null }, { at: new Date(Date.now() - 6 * 3600_000).toISOString(), status: 'In transit', location: 'Belagavi hub', note: null }] });
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

/** Stage 15 demo content: international listings, reference rates, managed help pages, a country-partner application and an alliance proposal. */
async function stage15(db: Db, refs: SeedRefs) {
  const have = await db.select({ id: s.fxRates.id }).from(s.fxRates).limit(1);
  if (have.length) return;
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(s.fxRates).values([
    { currency: 'USD', inrPerUnit: '84.2000', asOf: today, source: 'Reference rate entered by Unite finance (demo)' },
    { currency: 'AED', inrPerUnit: '22.9300', asOf: today, source: 'Reference rate entered by Unite finance (demo)' },
    { currency: 'EUR', inrPerUnit: '91.4000', asOf: today, source: 'Reference rate entered by Unite finance (demo)' },
    { currency: 'GBP', inrPerUnit: '108.6000', asOf: today, source: 'Reference rate entered by Unite finance (demo)' },
    { currency: 'SAR', inrPerUnit: '22.4500', asOf: today, source: 'Reference rate entered by Unite finance (demo)' },
    { currency: 'KES', inrPerUnit: '0.6500', asOf: today, source: 'Reference rate entered by Unite finance (demo)' },
  ]);
  const in45 = new Date(Date.now() + 45 * 86400_000);
  const intl = [
    { code: 'OPP-2026-00007', title: '5 MW solar carport programme — logistics parks, Dubai', summary: 'Unite Exim is assembling an EPC and supply partner group for carport solar at three logistics parks in Jebel Ali. Indian EPC partners with export experience preferred.', sector: 'solar', country: 'AE', city: 'Dubai', estimatedValue: 18_00_00_000_00, route: 'unite_owned' },
    { code: 'OPP-2026-00008', title: 'Distribution transformers for county electrification — Kenya', summary: 'Supply of 250 distribution transformers (100–315 kVA) for a county electrification programme. Pre-shipment PVoC inspection required.', sector: 'power_equipment', country: 'KE', city: 'Nairobi', estimatedValue: 9_50_00_000_00, route: 'unite_owned' },
  ];
  for (const o of intl) {
    const [row] = await db.insert(s.opportunities).values({ ...o, kind: o.sector === 'solar' ? 'project' : 'product_supply', source: 'unite_listing', deadline: in45, visibility: 'verified_partners', minLevel: 'verified', requiredCertifications: [], ownerOrgId: refs.orgs.uniteExim, groupCompanyOrgId: refs.orgs.uniteExim, status: 'accepted', listed: true, publishedAt: new Date(), createdBy: refs.users.uniteAdmin, version: 2 }).returning();
    await db.insert(s.opportunityEvents).values([{ opportunityId: row.id, version: 1, toStatus: 'draft', reason: 'Drafted by Unite Group', actorUserId: refs.users.uniteAdmin }, { opportunityId: row.id, version: 2, fromStatus: 'draft', toStatus: 'accepted', reason: 'Reviewed by Unite Group', actorUserId: refs.users.uniteAdmin }]);
  }
  const pages = [
    { slug: 'how-lead-protection-works', title: 'How lead protection works', body: 'Register the customer with consent and evidence. Unite Group reviews within 4 business hours, and your certificate shows the protection window.' },
    { slug: 'when-is-commission-earned', title: 'When is commission earned?', body: 'Only when the customer pays for a certified milestone under the contract. Projected amounts are estimates.' },
    { slug: 'forming-a-team', title: 'Forming a collaboration team', body: 'Invite verified partners. They see the team workspace only after accepting and signing the NDA.' },
    { slug: 'are-my-bids-private', title: 'Are my tender bids private?', body: 'Yes. Bids are encrypted and sealed until opening; competitors never see your price, and technical evaluators never see prices.' },
    { slug: 'how-reputation-works', title: 'How is my reputation calculated?', body: 'Only from certified milestones and reviews by companies you worked with on certified projects. It cannot be bought or boosted, and you can appeal a review you believe is wrong.' },
    { slug: 'your-data-rights', title: 'Your data rights', body: 'Export your data, or request correction or deletion, from Settings → Privacy & data. Some records are kept for legal retention periods.' },
  ];
  for (const pg of pages) {
    const [row] = await db.insert(s.contentPages).values({ ...pg, kind: 'help', status: 'published', version: 1, updatedBy: refs.users.superadmin, publishedAt: new Date() }).returning();
    await db.insert(s.contentRevisions).values({ pageId: row.id, version: 1, title: pg.title, body: pg.body, changedBy: refs.users.superadmin, note: 'Initial content (demo)' });
  }
  await db.insert(s.countryPartnerApplications).values({ organizationId: refs.orgs.sunrise, country: 'AE', sectors: ['power_equipment', 'trading'], localEntity: 'Sunrise Trading FZE', localRegistration: 'JAFZA-FZE-204417', teamSize: 6, plan: 'Year one: stock transformers and LT panels in Jebel Ali, serve EPCs building logistics-park solar, and route Indian EPC demand through Unite Exim. Target six orders and two service contracts.', references: [{ name: 'Gulf Logistics Parks LLC', contact: 'procurement@glp.example' }], submittedBy: refs.users.ravi });
  await db.insert(s.allianceProposals).values({ code: 'ALL-2026-30418', kind: 'strategic_alliance', proposerOrgId: refs.orgs.deccan, targetOrgId: refs.orgs.volt, title: 'Southern India rooftop alliance', rationale: 'Deccan stocks switchgear and cables across Karnataka and Tamil Nadu; Volt EPC has proven rooftop delivery. Together we can bid for C&I rooftop programmes in the south with local stock and faster mobilisation.', scope: 'Joint bids for rooftop projects above 1 MW in Karnataka and Tamil Nadu; Deccan supplies BoS materials at agreed partner pricing.', markets: ['IN'], sectors: ['solar', 'power_equipment'], proposerSharePct: 30, durationMonths: 24, createdBy: refs.users.deepak });
}

/** Direct offers: partner capacity and two offers from Unite Group companies (one with fixed terms, one asking for quotes). */
export async function offersDemo(db: Db, refs: SeedRefs) {
  await db.insert(s.partnerCapacity).values([
    { organizationId: refs.orgs.volt, hasOffice: true, officeLocations: ['Pune', 'Nashik'], totalManpower: 48, idleManpower: 12, idleSkills: ['Rooftop installation', 'Electrical BoS'], lookingFor: ['project_work', 'manpower', 'sell_products'], notes: 'Two installation crews free from December.', updatedBy: refs.users.asha },
    { organizationId: refs.orgs.sunrise, hasOffice: true, officeLocations: ['Ahmedabad', 'Dubai (Jebel Ali)'], totalManpower: 22, idleManpower: 4, idleSkills: ['Sales', 'Logistics'], lookingFor: ['sell_products', 'local_presence', 'distribution'], updatedBy: refs.users.ravi },
    { organizationId: refs.orgs.deccan, hasOffice: true, officeLocations: ['Bengaluru', 'Hosur'], totalManpower: 30, idleManpower: 6, idleSkills: ['Warehouse', 'Field sales'], lookingFor: ['sell_products', 'distribution', 'marketing'], updatedBy: refs.users.deepak },
    { organizationId: refs.orgs.meera, hasOffice: false, totalManpower: 3, idleManpower: 2, idleSkills: ['Energy audits', 'Procurement advisory'], lookingFor: ['marketing', 'partnership'], updatedBy: refs.users.meera },
  ]);
  const day = 86400_000;
  const [sell] = await db.insert(s.directOffers).values({
    code: 'DO-2026-100001', issuerOrgId: refs.orgs.uniteSolar, title: 'Sell rooftop solar packages to factories in your region',
    summary: 'Unite Solar supplies 100 kW–1 MW rooftop packages (design, Tier-1 modules, installation, monitoring). Introduce and close factory customers in your region; Unite Solar prices, contracts and delivers. You earn commission when the customer pays.',
    kind: 'sell_products', sector: 'solar', regions: ['IN-MH', 'IN-KA', 'IN-GJ', 'IN-TN'], targetMode: 'all', pricing: 'unite_price', unitePrice: 42_000_00, priceUnit: 'per kW',
    uniteRewardModel: 'commission', uniteRewardBps: 300, rewardModels: ['commission'], maxSelections: 10, deadline: new Date(Date.now() + 21 * day), createdBy: refs.users.uniteAdmin,
  }).returning();
  const [setup] = await db.insert(s.directOffers).values({
    code: 'DO-2026-100002', issuerOrgId: refs.orgs.uniteSolar, title: 'Run an O&M service desk for our Karnataka and Tamil Nadu plants',
    summary: 'We need a partner with a local office and trained people to run module cleaning, preventive maintenance and first-response breakdown visits across 14 MW of plants. We offer a fixed monthly fee of ₹6,50,000; or quote your own monthly price and the reward model you prefer.',
    kind: 'local_presence', sector: 'solar', regions: ['IN-KA', 'IN-TN'], targetMode: 'selected', pricing: 'either',
    uniteRewardModel: 'fixed_fee', uniteRewardAmount: 6_50_000_00, rewardModels: ['fixed_fee', 'profit_share', 'revenue_share'], needsOffice: true, minManpower: 4, exclusive: true, maxSelections: 1,
    deadline: new Date(Date.now() + 10 * day), createdBy: refs.users.uniteAdmin,
  }).returning();
  const partners = [refs.orgs.volt, refs.orgs.sunrise, refs.orgs.deccan, refs.orgs.meera];
  await db.insert(s.directOfferRecipients).values(partners.map((o) => ({ offerId: sell.id, organizationId: o })));
  await db.insert(s.directOfferRecipients).values([refs.orgs.volt, refs.orgs.deccan].map((o) => ({ offerId: setup.id, organizationId: o, status: o === refs.orgs.deccan ? 'responded' : 'sent' })));
  await db.insert(s.directOfferResponses).values({ offerId: setup.id, organizationId: refs.orgs.deccan, submittedBy: refs.users.deepak, mode: 'proposal', price: 5_80_000_00, priceUnit: 'per month', rewardModel: 'profit_share', rewardBps: 1500, manpower: 6, hasOffice: true, officeLocation: 'Hosur', startDate: new Date(Date.now() + 30 * day).toISOString().slice(0, 10), message: 'Our Hosur warehouse team can cover both states with two vans; we propose a lower monthly fee plus 15% of savings from improved plant availability.' });
}

/** Direct-offer follow-through: Volt EPC selected on the rooftop sales offer, its agreement drafted, two buyers registered. */
export async function offerSalesDemo(db: Db, refs: SeedRefs) {
  const [o] = await db.select().from(s.directOffers).where(eq(s.directOffers.code, 'DO-2026-100001')).limit(1);
  if (!o) return;
  const [exists] = await db.select({ id: s.offerSales.id }).from(s.offerSales).where(eq(s.offerSales.offerId, o.id)).limit(1);
  if (exists) return;
  const now = new Date();
  const terms = { offer: o.code, partnerOrgId: refs.orgs.volt, mode: 'accept_terms', price: o.unitePrice, priceUnit: o.priceUnit, rewardModel: 'commission', rewardBps: 300, selectedAt: now.toISOString() };
  const [r] = await db.insert(s.directOfferResponses).values({ offerId: o.id, organizationId: refs.orgs.volt, submittedBy: refs.users.asha, mode: 'accept_terms', price: o.unitePrice, priceUnit: o.priceUnit, rewardModel: 'commission', rewardBps: 300, hasOffice: true, officeLocation: 'Pune', message: 'Accepted. Our Pune sales team covers the Chakan, Talegaon and Kolhapur industrial belts.', status: 'selected', termsHash: sha256(JSON.stringify(terms)), decidedBy: refs.users.uniteAdmin, decisionNote: 'Strong Maharashtra network', decidedAt: now }).returning();
  await db.update(s.directOfferRecipients).set({ status: 'selected' }).where(and(eq(s.directOfferRecipients.offerId, o.id), eq(s.directOfferRecipients.organizationId, refs.orgs.volt)));
  const body = `AGREEMENT — ${o.title}\n\nBetween Unite Solar and Volt EPC, arising from direct offer ${o.code}.\n\n1. Scope. Introduce factory customers for rooftop solar packages; Unite Solar prices, contracts and delivers.\n\n2. Price. ₹42,000 per kW.\n\n3. Partner reward. Commission on sales · 3%. Earned only on sales registered under this offer and only when the customer has paid.\n\nDRAFT generated from the selected response.`;
  const [c] = await db.insert(s.contracts).values({ code: 'CTR-2026-410001', kind: 'contract', title: `Agreement — ${o.title}`, issuerOrgId: o.issuerOrgId, counterpartyOrgId: refs.orgs.volt, offerId: o.id, offerResponseId: r.id, createdBy: refs.users.uniteAdmin }).returning();
  await db.insert(s.contractVersions).values({ contractId: c.id, versionNo: 1, body, terms: { paymentTerms: '₹42,000 per kW' }, bodyHash: sha256(body), changeNote: `Generated from direct offer ${o.code}`, authorUserId: refs.users.uniteAdmin });
  const [pol] = await db.select().from(s.commissionPolicies).where(and(eq(s.commissionPolicies.code, 'INTRODUCER-STD'), eq(s.commissionPolicies.status, 'active'))).limit(1);
  let agreementId: string | null = null;
  if (pol) {
    const t = { policy: { code: `OFFER-${o.code}`, version: 1, name: `Direct offer ${o.code} — Commission on sales · 3%`, basis: 'percent', rateBps: 300, flatAmount: null, tiers: null, tdsBps: pol.tdsBps, clawbackDays: pol.clawbackDays, trigger: 'Customer payment for a sale registered under the offer' }, shareBps: 10000, gstRegistered: true, projectValue: 0 };
    const [a] = await db.insert(s.commissionAgreements).values({ code: 'CA-2026-410001', beneficiaryOrgId: refs.orgs.volt, payerOrgId: o.issuerOrgId, offerId: o.id, offerResponseId: r.id, policyId: pol.id, terms: t, termsHash: sha256(canonicalJson(t)), createdBy: refs.users.uniteAdmin }).returning();
    agreementId = a.id;
  }
  const hist = (st: string, note: string) => ({ at: now.toISOString(), status: st, note, by: refs.users.uniteAdmin });
  await db.insert(s.offerSales).values({ code: 'OS-2026-410001', offerId: o.id, responseId: r.id, partnerOrgId: refs.orgs.volt, buyerName: 'Talegaon Plastics Pvt Ltd', buyerKey: 'talegaon plastics|talegaon', buyerCity: 'Talegaon', contactName: 'N. Kulkarni', description: '400 kW rooftop on two moulding sheds', estimatedValue: 1_70_00_000_00, consentMethod: 'meeting_minutes', status: 'quoted', history: [hist('registered', 'Registered by the partner'), hist('quoted', 'Quote US/Q-2611 sent')], createdBy: refs.users.asha });
  const [won] = await db.insert(s.offerSales).values({ code: 'OS-2026-410002', offerId: o.id, responseId: r.id, partnerOrgId: refs.orgs.volt, buyerName: 'Chakan Precision Forgings', buyerKey: 'chakan precision forgings|chakan', buyerCity: 'Chakan', contactName: 'S. Pawar', description: '250 kW rooftop', estimatedValue: 1_00_00_000_00, consentMethod: 'written_email', status: 'won', saleValue: 1_05_00_000_00, history: [hist('registered', 'Registered by the partner'), hist('won', 'Order signed')], createdBy: refs.users.asha }).returning();
  if (agreementId) {
    // 3% of ₹1.05 Cr = ₹3,15,000; GST 18% = ₹56,700; TDS 5% = ₹15,750 → payable ₹3,55,950
    await db.insert(s.commissionEntries).values({ agreementId, beneficiaryOrgId: refs.orgs.volt, offerSaleId: won.id, description: 'Sale OS-2026-410002: Chakan Precision Forgings', baseAmount: 1_05_00_000_00, gross: 3_15_000_00, share: 3_15_000_00, deductions: [], taxable: 3_15_000_00, gst: 56_700_00, tds: 15_750_00, payable: 3_55_950_00 });
  }
}

/** Unite Group businesses from the Master Concept Portfolio; skips any already present (safe on existing databases). */
export async function venturesDemo(db: Db, refs: SeedRefs) {
  const have = new Set((await db.select({ slug: s.uniteVentures.slug }).from(s.uniteVentures)).map((r) => r.slug));
  const rows = VENTURES.filter((v) => !have.has(v.slug)).map((v) => ({
    num: v.num, slug: v.slug, name: v.name, category: v.category, sector: v.sector, tagline: v.tagline, summary: v.summary, stage: v.stage, roles: v.roles,
    open: v.open && !v.regulated, regulatedReason: v.regulated ?? null, groupCompanyOrgId: v.company ? refs.orgs[v.company] ?? null : null,
    rewardNote: 'Rewards are set in each offer from this business: commission, revenue share, fixed fee or reseller margin.',
  }));
  if (rows.length) await db.insert(s.uniteVentures).values(rows);
  // Demo: Volt EPC promotes SOLCART (approved) and has asked to promote WAKIN; the rooftop sales offer belongs to SOLCART.
  const [solcart] = await db.select().from(s.uniteVentures).where(eq(s.uniteVentures.slug, 'solcart')).limit(1);
  const [wakin] = await db.select().from(s.uniteVentures).where(eq(s.uniteVentures.slug, 'wakin')).limit(1);
  const [already] = await db.select({ id: s.ventureInterests.id }).from(s.ventureInterests).limit(1);
  if (solcart && wakin && !already && refs.orgs.volt) {
    await db.insert(s.ventureInterests).values([
      { ventureId: solcart.id, organizationId: refs.orgs.volt, roles: ['sell_products', 'deliver_services'], regions: ['IN-MH'], message: 'We install rooftop systems across Pune and Nashik and can sell SOLCART kits with installation.', status: 'approved', decidedBy: refs.users.uniteAdmin, decisionNote: 'Approved for Maharashtra', decidedAt: new Date(), createdBy: refs.users.asha },
      { ventureId: wakin.id, organizationId: refs.orgs.volt, roles: ['recruit_members'], regions: ['IN-MH'], message: 'We hire installers and electricians every quarter and can bring other EPC employers to WAKIN hiring drives.', status: 'pending', createdBy: refs.users.asha },
    ]);
    await db.update(s.directOffers).set({ ventureId: solcart.id }).where(eq(s.directOffers.code, 'DO-2026-100001'));
  }
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
  await stage15(db, refs);
  await offersDemo(db, refs);
  await offerSalesDemo(db, refs);
  await venturesDemo(db, refs);
  await growthDemo(db, refs);
  await groupCompaniesDemo(db, refs);
  await franchiseDemo(db, refs);
  await propertyDemo(db, refs);
  await solarDemo(db, refs);
  await v2Demo(db, refs);
  await xchangeDemo(db, refs);
  await phase2Demo(db, refs);
  await bankDemo(db, refs);
}

/** Demo pilot check-ins (spread over three weeks) so the admin results page has something to show. Not part of the test seed. */
export async function pilotDemo(db: Db, refs: SeedRefs) {
  const [any] = await db.select({ id: s.pilotFeedback.id }).from(s.pilotFeedback).limit(1);
  if (any) return;
  const ago = (d: number) => new Date(Date.now() - d * 86400_000);
  const rows: (typeof s.pilotFeedback.$inferInsert)[] = [
    { userId: refs.users.asha, organizationId: refs.orgs.volt, usefulness: 4, ease: 3, recommend: 8, used: ['offers', 'ventures', 'contracts'], mostValuable: 'Getting the SOLCART offer straight in our dashboard instead of chasing it on WhatsApp.', blockers: 'It took us a while to find where to register a sale under the offer.', wishlist: 'Show the commission we will earn on the sale form itself.', continueUse: 'yes', contactOk: true, platform: 'web', createdAt: ago(16) },
    { userId: refs.users.ravi, organizationId: refs.orgs.sunrise, usefulness: 3, ease: 4, recommend: 6, used: ['offers', 'opportunities'], wishlist: 'Gujarati and Hindi language.', continueUse: 'maybe', contactOk: false, platform: 'mobile', createdAt: ago(14) },
    { userId: refs.users.meera, organizationId: refs.orgs.meera, usefulness: 5, ease: 4, recommend: 9, used: ['leads', 'ventures'], mostValuable: 'Lead certificates — finally proof that I introduced the customer first.', continueUse: 'yes', contactOk: true, platform: 'web', createdAt: ago(9) },
    { userId: refs.users.deepak, organizationId: refs.orgs.deccan, usefulness: 4, ease: 3, recommend: 9, used: ['offers', 'mobile', 'messages'], blockers: 'Two-factor code on a new phone was confusing.', continueUse: 'yes', contactOk: true, platform: 'mobile', createdAt: ago(7) },
    { userId: refs.users.asha, organizationId: refs.orgs.volt, usefulness: 5, ease: 4, recommend: 10, used: ['offers', 'commissions', 'contracts'], mostValuable: 'Saw our commission move to Earned the day the customer paid.', continueUse: 'yes', contactOk: true, platform: 'web', createdAt: ago(2) },
  ];
  await db.insert(s.pilotFeedback).values(rows.filter((r) => r.userId && r.organizationId));
}

/** Growth Desk demo: fictional contacts (example domains) with sources and lawful bases, seven agents, first runs and a small funnel. */
export async function growthDemo(db: Db, refs: SeedRefs) {
  const [any] = await db.select({ id: s.growthAgents.id }).from(s.growthAgents).limit(1);
  if (any || !refs.users.uniteAdmin) return;
  const { GrowthDeskService } = await import('../modules/growth-desk/growth-desk.controller');
  type C = typeof s.growthContacts.$inferInsert;
  const c = (organizationName: string, sector: string, region: string | null, city: string | null, o: Partial<C> = {}): C => ({
    organizationName, sector, region, city, country: 'IN', kind: 'company', source: 'public_registry', sourceDetail: 'MCA company master data, active companies', lawfulBasis: 'legitimate_interest_b2b',
    contactName: null, email: null, createdBy: refs.users.uniteAdmin, ...o,
  });
  const contacts: C[] = [
    c('Shree Ganesh Polymers', 'manufacturing', 'IN-MH', 'Pune', { contactName: 'Anil Deshpande', email: 'anil@ganeshpolymers.example', source: 'inbound_form', sourceDetail: 'Website enquiry about factory rooftop solar, 12 Oct 2026', lawfulBasis: 'consent', consentEvidence: 'Enquiry form with consent tick, ref ENQ-2026-1042' }),
    c('Kaveri Textiles', 'manufacturing', 'IN-KA', 'Mysuru', { contactName: 'Lakshmi Rao', email: 'lakshmi@kaveritextiles.example', source: 'event', sourceDetail: 'Intersolar India 2026 stall sign-up', lawfulBasis: 'consent', consentEvidence: 'Event sign-up sheet, 3 Oct 2026' }),
    c('Narmada Cold Storage', 'agri_food', 'IN-GJ', 'Vadodara', { contactName: 'Hitesh Patel', email: 'hitesh@narmadacold.example' }),
    c('Rajhans Auto Components', 'manufacturing', 'IN-MH', 'Aurangabad', { contactName: 'Sameer Kulkarni', email: 'sameer@rajhansauto.example' }),
    c('Deccan Paper Mills', 'manufacturing', 'IN-TG', 'Hyderabad', { email: 'info@deccanpaper.example' }),
    c('Sabarmati Pharma', 'manufacturing', 'IN-GJ', 'Ahmedabad', { contactName: 'Nisha Shah', email: 'nisha@sabarmatipharma.example', source: 'partner_referral', sourceDetail: 'Referred by Volt EPC with the buyer’s agreement (meeting minutes)', lawfulBasis: 'consent', consentEvidence: 'Meeting minutes 28 Oct 2026 uploaded by Volt EPC' }),
    c('Coastal Ice Factory', 'agri_food', 'IN-KL', 'Kochi', { email: 'office@coastalice.example' }),
    c('Mahalaxmi Steel Fabricators', 'manufacturing', 'IN-MH', 'Nashik', { contactName: 'Prakash Jadhav', email: 'prakash@mahalaxmisteel.example', lawfulBasis: 'none', sourceDetail: 'Business card from a trade fair — consent not recorded' }),
    c('Vindhya Infra Projects', 'construction_epc', 'IN-MP', 'Indore', { contactName: 'Rohit Tiwari', email: 'rohit@vindhyainfra.example', source: 'licensed_directory', sourceDetail: 'Licensed EPC contractor directory 2026' }),
    c('Konkan Power Contractors', 'construction_epc', 'IN-MH', 'Ratnagiri', { contactName: 'Mahesh Sawant', email: 'mahesh@konkanpower.example', source: 'licensed_directory', sourceDetail: 'Licensed EPC contractor directory 2026' }),
    c('Thar Solar Parks', 'solar', 'IN-RJ', 'Jodhpur', { contactName: 'Vikas Choudhary', email: 'vikas@tharsolar.example', source: 'existing_customer', sourceDetail: 'Bought inverters from Unite Solar in 2025', lawfulBasis: 'existing_relationship' }),
    c('Bharat Grid Services', 'power_equipment', 'IN-UP', 'Lucknow', { contactName: 'Amit Verma', email: 'amit@bharatgrid.example', source: 'public_registry', sourceDetail: 'State tender portal — registered electrical contractors' }),
    c('Sunbelt Solar Installers', 'solar', 'IN-KA', 'Bengaluru', { contactName: 'Farah Khan', email: 'farah@sunbeltsolar.example', source: 'event', sourceDetail: 'Installer meet-up, Bengaluru, Sep 2026', lawfulBasis: 'consent', consentEvidence: 'Meet-up registration with updates opt-in' }),
    c('Green Roof Installers Co-op', 'solar', 'IN-GJ', 'Surat', { contactName: 'Jignesh Mehta', email: 'jignesh@greenroofcoop.example', source: 'inbound_form', sourceDetail: '“Become a partner” form on the website', lawfulBasis: 'consent', consentEvidence: 'Website form with consent tick, ref PRT-2026-0311' }),
    c('Sahyadri Electricals', 'construction_epc', 'IN-MH', 'Kolhapur', { contactName: 'Ganesh Patil', email: 'ganesh@sahyadrielec.example', source: 'licensed_directory', sourceDetail: 'Licensed EPC contractor directory 2026' }),
    c('Al Noor Trading LLC', 'trading', null, 'Dubai', { country: 'AE', contactName: 'Imran Siddiqui', email: 'imran@alnoortrading.example', source: 'licensed_directory', sourceDetail: 'Licensed import-buyer database (solar equipment, GCC)', tags: ['importer'] }),
    c('Nairobi Solar Supplies', 'solar', null, 'Nairobi', { country: 'KE', contactName: 'Grace Wanjiru', email: 'grace@nairobisolar.example', source: 'event', sourceDetail: 'Solar Africa Expo 2026 meeting', lawfulBasis: 'consent', consentEvidence: 'Business-card exchange with request for price list', tags: ['importer'] }),
    c('Lagos Energy Imports', 'trading', null, 'Lagos', { country: 'NG', contactName: 'Tunde Adebayo', email: 'tunde@lagosenergy.example', source: 'licensed_directory', sourceDetail: 'Licensed import-buyer database (West Africa)', tags: ['importer'] }),
    c('Dhaka Power Traders', 'trading', null, 'Dhaka', { country: 'BD', email: 'sales@dhakapower.example', source: 'licensed_directory', sourceDetail: 'Licensed import-buyer database (South Asia)', tags: ['importer'] }),
    c('Colombo Renewables', 'solar', null, 'Colombo', { country: 'LK', contactName: 'Dilan Perera', email: 'dilan@colomborenew.example', source: 'existing_customer', sourceDetail: 'Ordered mounting structures through Unite Exim in 2025', lawfulBasis: 'existing_relationship', tags: ['importer'] }),
    c('Gulf Bright Energy', 'solar', null, 'Sharjah', { country: 'AE', contactName: 'Omar Haddad', email: 'omar@gulfbright.example', lawfulBasis: 'none', source: 'manual', sourceDetail: 'Found on a social network — not usable without consent' }),
    c('Ahmedabad Kirana Merchants Association', 'local_commerce', 'IN-GJ', 'Ahmedabad', { kind: 'association', contactName: 'Bharat Joshi', email: 'secretary@akma.example', source: 'public_registry', sourceDetail: 'Registered trade association list, Gujarat' }),
    c('Bengaluru Traders Federation', 'local_commerce', 'IN-KA', 'Bengaluru', { kind: 'association', contactName: 'Suresh Gowda', email: 'office@btfed.example', source: 'event', sourceDetail: 'Small-business digitisation seminar, Aug 2026', lawfulBasis: 'consent', consentEvidence: 'Seminar registration with updates opt-in' }),
    c('Pune Retailers Guild', 'local_commerce', 'IN-MH', 'Pune', { kind: 'association', email: 'contact@puneretail.example' }),
    c('Sri Venkateswara Engineering College', 'education', 'IN-AP', 'Tirupati', { kind: 'institution', contactName: 'Dr. K. Srinivas', email: 'placements@svec.example', source: 'inbound_form', sourceDetail: 'Enquiry about AI-tools workshops', lawfulBasis: 'consent', consentEvidence: 'Enquiry form ref EDU-2026-077' }),
    c('Nirma Polytechnic', 'education', 'IN-GJ', 'Ahmedabad', { kind: 'institution', contactName: 'Prof. Meghna Desai', email: 'tpo@nirmapoly.example', source: 'public_registry', sourceDetail: 'AICTE approved institutions list' }),
    c('Vidya Bharati Junior College', 'education', 'IN-MH', 'Nagpur', { kind: 'institution', email: 'principal@vidyabharati.example', source: 'public_registry', sourceDetail: 'State board institutions list' }),
    c('Kerala Institute of Technology', 'education', 'IN-KL', 'Thrissur', { kind: 'institution', contactName: 'Dr. Anitha Menon', email: 'anitha@kit.example', optedOutAt: new Date(Date.now() - 20 * 86400_000), source: 'event', sourceDetail: 'Education fair 2026', lawfulBasis: 'consent', consentEvidence: 'Education fair sign-up' }),
    c('Meridian Family Office', 'financial_services', 'IN-MH', 'Mumbai', { kind: 'investor', contactName: 'Rhea Kapoor', email: 'rhea@meridianfo.example', source: 'opt_in_list', sourceDetail: 'Asked to receive renewable-energy investment updates', lawfulBasis: 'consent', consentEvidence: 'Signed opt-in form 14 Sep 2026' }),
    c('Horizon Angels Network', 'financial_services', 'IN-KA', 'Bengaluru', { kind: 'investor', email: 'deals@horizonangels.example', source: 'public_registry', sourceDetail: 'Public list of angel networks' }),
  ];
  const ins = await db.insert(s.growthContacts).values(contacts).returning();
  await db.insert(s.growthSuppressions).values({ email: 'anitha@kit.example', reason: 'unsubscribed' }).onConflictDoNothing();
  const ven = async (slug: string) => (await db.select({ id: s.uniteVentures.id }).from(s.uniteVentures).where(eq(s.uniteVentures.slug, slug)).limit(1))[0]?.id ?? null;
  const by = refs.users.uniteAdmin;
  const A = (o: Partial<typeof s.growthAgents.$inferInsert> & Pick<typeof s.growthAgents.$inferInsert, 'name' | 'product' | 'audience' | 'sectors' | 'pitch' | 'callToAction'>) =>
    ({ code: `AG-${Math.floor(100000 + Math.random() * 899999)}`, regions: [], countries: ['IN'], cadence: 'weekly', status: 'active', minScore: 45, maxLeadsPerRun: 25, dailySendCap: 40, createdBy: by, ...o });
  const agents = await db.insert(s.growthAgents).values([
    A({ name: 'SOLCART — factory rooftop solar', ventureId: await ven('solcart'), product: 'SOLCART rooftop solar kits with local installation', audience: 'buyers', sectors: ['manufacturing', 'agri_food'], regions: ['IN-MH', 'IN-GJ', 'IN-KA'],
      pitch: 'SOLCART supplies complete rooftop solar kits — panels, inverters, structures and batteries — with installation by a verified local installer and a single point of contact for service. Factories typically use rooftop solar to cut daytime grid consumption; we prepare a site-specific estimate before any commitment.',
      callToAction: 'If you would like a free roof assessment and estimate, reply with a convenient time for a 15-minute call.' }),
    A({ name: 'Unite Powertek — equipment for EPC contractors', ventureId: await ven('unite-powertek'), product: 'Transformers, switchgear and solar structures from Unite Powertek', audience: 'buyers', sectors: ['construction_epc', 'power_equipment'],
      pitch: 'Unite Powertek manufactures distribution transformers, LT/HT panels and solar mounting structures, with a digital catalogue, dispatch tracking and on-site commissioning support for EPC contractors.',
      callToAction: 'Reply with your next project’s bill of materials and we will send a quotation within two working days.' }),
    A({ name: 'Unite Exim — solar equipment importers', product: 'Solar modules, inverters and structures for export from India', audience: 'trade', sectors: ['solar', 'trading'], countries: ['AE', 'KE', 'NG', 'BD', 'LK'],
      pitch: 'Unite Exim exports solar modules, inverters and mounting structures from Indian manufacturers, handling quality inspection, export documentation and shipping coordination.',
      callToAction: 'Reply with the products and quantities you import each quarter and we will share a price list and lead times.' }),
    A({ name: 'Nano Bazar — merchant associations', ventureId: await ven('nano-bazar'), product: 'Nano Bazar digital storefronts for local shops', audience: 'associations', sectors: ['local_commerce'],
      pitch: 'Nano Bazar gives local shops an online storefront with zero sales commission. Merchants keep control of their products and prices, and nearby customers can find them online. We run free onboarding sessions for association members.',
      callToAction: 'Would your association like to host a free one-hour onboarding session for members? Reply with a suitable date.' }),
    A({ name: 'Unite Learning — colleges and institutes', ventureId: await ven('unite-learning'), product: 'Unite Learning AI-tools and technology programmes', audience: 'buyers', sectors: ['education'],
      pitch: 'Unite Learning runs practical technology and AI-tools programmes for colleges, with project work and placement-oriented training delivered on campus or online.',
      callToAction: 'Reply to receive the programme brochure and arrange a short call with our academic team.' }),
    A({ name: 'SOLCART — installer partners', ventureId: await ven('solcart'), product: 'SOLCART installation partner programme', audience: 'partners', sectors: ['solar', 'construction_epc'], regions: ['IN-KA', 'IN-GJ', 'IN-MH'],
      pitch: 'We are building a network of verified installation partners to fit SOLCART orders in their area. Partners receive installation work orders through COLLABIZ, with agreed rates and payment tracked in the app.',
      callToAction: 'If you install rooftop solar and would like to receive SOLCART orders, reply and we will send the partner sign-up link.' }),
    A({ name: 'Power Partner — opt-in investors', product: 'Power Partner renewable PPA projects (information only)', audience: 'investors', sectors: ['financial_services'], status: 'draft', cadence: 'manual',
      pitch: 'Power Partner connects industries that want renewable power under long-term agreements with investors who fund the plants, with Unite as the EPC contractor. This note shares general information only and is not an offer of securities.',
      callToAction: 'If you would like to receive the information pack, reply and our team will contact you after the regulatory review is complete.' }),
  ]).returning();
  const svc = new GrowthDeskService(db, null as never, null as never);
  for (const a of agents.slice(0, 6)) if (a.status === 'active') await svc.run(a, 'manual', by);
  // A small funnel so the dashboard is not empty: approve two drafts, one replied, one meeting, one won.
  const msgs = await db.select().from(s.growthMessages).where(eq(s.growthMessages.status, 'draft')).orderBy(s.growthMessages.createdAt);
  const pick = (org: string) => msgs.find((m) => ins.find((x) => x.id === m.contactId)?.organizationName === org);
  const step = async (org: string, lead: string, sent: boolean) => {
    const m = pick(org); if (!m) return;
    await db.update(s.growthMessages).set({ status: sent ? 'sent' : 'approved', approvedBy: by, approvedAt: new Date(), sentAt: sent ? new Date(Date.now() - 5 * 86400_000) : null }).where(eq(s.growthMessages.id, m.id));
    await db.update(s.growthLeads).set({ status: lead, decidedBy: by }).where(eq(s.growthLeads.id, m.leadId));
  };
  await step('Shree Ganesh Polymers', 'meeting', true);
  await step('Sabarmati Pharma', 'won', true);
  await step('Thar Solar Parks', 'replied', true);
  await step('Kaveri Textiles', 'approved', false);
}

/** Unite Group companies for the workspace (names from the group's own company list; legal entity codes are placeholders until confirmed). */
export async function groupCompaniesDemo(db: Db, refs: SeedRefs) {
  const C: [key: string, name: string, legal: string, category: string, country: string, city: string | null, sectors: string[], description: string][] = [
    ['uniteGroupInc', 'Unite Group Inc.', 'Unite Group Inc.', 'parent', 'XX', null, ['consulting'], 'Group holding company and global investments.'],
    ['uniteDevelopers', 'Unite Developers Global Inc.', 'Unite Developers Global Inc.', 'operating', 'IN', null, ['solar', 'infrastructure', 'construction_epc'], 'Renewable energy, infrastructure and EPC projects.'],
    ['uniteGreenInfra', 'Unite Green Infra', 'Unite Green Infra Pvt. Ltd.', 'infra', 'IN', null, ['infrastructure'], 'Green infrastructure and projects.'],
    ['uniteGlobalInfra', 'Unite Global Infra Projects', 'Unite Global Infra Projects Pvt. Ltd.', 'projects', 'IN', null, ['infrastructure', 'construction_epc'], 'Large infrastructure and energy projects.'],
    ['unitif', 'UNITIF Green Industrial Parks', 'UNITIF Green Industrial Parks', 'jv', 'IN', null, ['real_estate', 'infrastructure'], 'Green industrial parks.'],
    ['uniteGreenEnergyLlc', 'Unite Green Energy Projects', 'Unite Green Energy Projects LLC', 'international', 'GE', null, ['solar'], 'Utility-scale renewable energy projects.'],
    ['films99', '99Films', '99Films', 'media', 'US', null, ['media'], 'Content, films and creative ecosystem.'],
    ['uniteAqua', 'Unite Aqua', 'Unite Aqua', 'business', 'IN', null, ['infrastructure'], 'Water and sustainability solutions.'],
    ['evPanther', 'EV Panther', 'EV Panther', 'business', 'IN', null, ['ev'], 'EV mobility and charging solutions.'],
    ['uniteCement', 'Unite Cement', 'Unite Cement', 'business', 'IN', null, ['manufacturing'], 'Cement manufacturing and OEM supply.'],
    ['uniteSteel', 'Unite Steel', 'Unite Steel', 'business', 'IN', null, ['manufacturing'], 'Steel and fabrication solutions.'],
    ['uniteDigitalBank', 'Unite Digital Bank', 'Unite Digital Bank', 'fintech', 'XX', null, ['financial_services'], 'Digital banking and green finance (subject to regulatory approval).'],
  ];
  for (const [key, name, legal, category, country, city, sectors, description] of C) {
    const [found] = await db.select({ id: s.organizations.id }).from(s.organizations).where(and(eq(s.organizations.legalName, legal), eq(s.organizations.type, 'group_company'))).limit(1);
    const orgId = found?.id ?? (await db.insert(s.organizations).values({ legalName: legal, displayName: name, type: 'group_company', country, city, verificationStatus: 'verified', membershipLevel: 'strategic' }).returning())[0].id;
    refs.orgs[key] = orgId;
    await db.insert(s.groupCompanies).values({ organizationId: orgId, legalEntityCode: `UG-${key.toUpperCase()}-PLACEHOLDER`, brandName: name, sectors, description, category, receivesLeads: false, listedPublicly: false }).onConflictDoNothing();
  }
  const set = async (key: string, category: string, description?: string) => {
    if (refs.orgs[key]) await db.update(s.groupCompanies).set({ category, ...(description ? { description } : {}) }).where(eq(s.groupCompanies.organizationId, refs.orgs[key]));
  };
  await set('uniteSolar', 'business', 'Solar products, rooftop and utility-scale EPC, O&M and the franchise network.');
  await set('powertek', 'manufacturing', 'Transformers, switchgear, panels, EV charging and BESS manufacturing.');
  await set('uniteExim', 'trade', 'Global trade and commodity exports and imports.');
  const parent = refs.orgs.uniteGroupInc;
  if (parent) await db.update(s.groupCompanies).set({ parentOrgId: parent }).where(and(sql`${s.groupCompanies.organizationId} <> ${parent}`, sql`${s.groupCompanies.parentOrgId} is null`));
}

/** Franchise demo: Unite Solar franchising, units at each stage, two months of reported sales for the live store. */
export async function franchiseDemo(db: Db, refs: SeedRefs) {
  const [any] = await db.select({ id: s.franchiseUnits.id }).from(s.franchiseUnits).limit(1);
  if (any || !refs.orgs.uniteSolar || !refs.orgs.volt) return;
  await db.update(s.groupCompanies).set({ franchiseOpen: true }).where(eq(s.groupCompanies.organizationId, refs.orgs.uniteSolar));
  const now = new Date().toISOString();
  const all = { site: now, agreement: now, fee: now, training: now, branding: now, stock: now, launch: now };
  const m = (off: number) => { const d = new Date(); d.setMonth(d.getMonth() + off); return d.toISOString().slice(0, 7); };
  const U = (o: Partial<typeof s.franchiseUnits.$inferInsert> & Pick<typeof s.franchiseUnits.$inferInsert, 'franchiseeOrgId' | 'city' | 'region' | 'status' | 'appliedBy'>) => ({
    code: `FR-2026-${Math.floor(10000 + Math.random() * 89999)}`, brandOrgId: refs.orgs.uniteSolar, format: 'store', message: 'We have a showroom on a main road with parking, an installation team and existing solar customers in the city.', ...o,
  });
  const units = await db.insert(s.franchiseUnits).values([
    U({ franchiseeOrgId: refs.orgs.volt, city: 'Pune', region: 'IN-MH', status: 'live', fee: 5_00_000_00, royaltyBps: 300, monthlyTarget: 25_00_000_00, checklist: all, appliedBy: refs.users.asha, openedAt: new Date(Date.now() - 70 * 86400_000), format: 'experience_centre' }),
    ...(refs.orgs.sunrise ? [U({ franchiseeOrgId: refs.orgs.sunrise, city: 'Ahmedabad', region: 'IN-GJ', status: 'setup', fee: 3_00_000_00, royaltyBps: 300, monthlyTarget: 15_00_000_00, checklist: { site: now, agreement: now, fee: now, training: now }, appliedBy: refs.users.ravi })] : []),
    ...(refs.orgs.meera ? [U({ franchiseeOrgId: refs.orgs.meera, city: 'Mysuru', region: 'IN-KA', status: 'approved', fee: 1_50_000_00, royaltyBps: 400, monthlyTarget: 6_00_000_00, format: 'kiosk', appliedBy: refs.users.meera })] : []),
    ...(refs.orgs.deccan && refs.users.deepak ? [U({ franchiseeOrgId: refs.orgs.deccan, city: 'Bengaluru', region: 'IN-KA', status: 'applied', format: 'service_point', appliedBy: refs.users.deepak, message: 'Our distribution warehouse in Peenya can host a SOLCART service point with two trained technicians.' })] : []),
  ]).returning();
  const live = units[0];
  await db.insert(s.franchiseReports).values([
    { unitId: live.id, month: m(-2), sales: 21_40_000_00, orders: 18, royalty: Math.round(21_40_000_00 * 0.03), submittedBy: refs.users.asha },
    { unitId: live.id, month: m(-1), sales: 27_85_000_00, orders: 23, royalty: Math.round(27_85_000_00 * 0.03), submittedBy: refs.users.asha },
  ]);
}

/** Real-estate demo: an industrial park (no RERA needed) and a residential project with a clearly fake demo RERA number. */
export async function propertyDemo(db: Db, refs: SeedRefs) {
  const [any] = await db.select({ id: s.propertyProjects.id }).from(s.propertyProjects).limit(1);
  const owner = refs.orgs.unitif ?? refs.orgs.uniteSolar;
  const res = refs.orgs.uniteDevelopers ?? refs.orgs.uniteSolar;
  if (any || !owner || !refs.users.uniteAdmin) return;
  const [park, homes] = await db.insert(s.propertyProjects).values([
    { code: 'PRJ-10001', ownerOrgId: owner, name: 'UNITIF Green Industrial Park — Phase 1', kind: 'industrial_park', city: 'Kurnool', region: 'IN-AP', commissionBps: 150, openToPartners: true, createdBy: refs.users.uniteAdmin,
      description: 'Plug-and-play industrial plots with shared rooftop solar, water recycling and an internal substation, close to the national highway. Suited to MSME manufacturing and warehousing.' },
    { code: 'PRJ-10002', ownerOrgId: res, name: 'Unite Green Residency (demo)', kind: 'residential', city: 'Hyderabad', region: 'IN-TG', reraNumber: 'DEMO-RERA-0001', commissionBps: 200, openToPartners: true, createdBy: refs.users.uniteAdmin,
      description: 'Solar-powered residential apartments with EV charging, rainwater harvesting and a rooftop garden. Demonstration project with a placeholder RERA number.' },
  ]).returning();
  await db.insert(s.propertyUnits).values([
    ...Array.from({ length: 12 }, (_, i) => ({ projectId: park.id, unitNo: `P-${String(i + 1).padStart(2, '0')}`, unitType: i < 9 ? 'plot' : 'shed', areaSqft: i < 9 ? 10_000 + i * 2_500 : 8_000, price: (i < 9 ? 45_00_000_00 + i * 9_00_000_00 : 1_20_00_000_00), status: i === 2 ? 'sold' : i === 5 ? 'booked' : 'available', buyerName: i === 2 ? 'Rajhans Auto Components' : i === 5 ? 'Narmada Cold Storage' : null, soldAt: i === 2 ? new Date() : null, bookedAt: i === 2 || i === 5 ? new Date() : null })),
    ...Array.from({ length: 10 }, (_, i) => ({ projectId: homes.id, unitNo: `A-${101 + i}`, unitType: 'flat', areaSqft: i % 2 ? 1450 : 1180, price: i % 2 ? 98_00_000_00 : 79_00_000_00, status: i === 0 ? 'sold' : 'available', buyerName: i === 0 ? 'A. Sharma' : null, soldAt: i === 0 ? new Date() : null, bookedAt: i === 0 ? new Date() : null })),
  ]);
  if (refs.orgs.volt && refs.users.asha) {
    await db.update(s.propertyUnits).set({ status: 'held', heldByOrgId: refs.orgs.volt, heldByUserId: refs.users.asha, heldUntil: new Date(Date.now() + 30 * 3600_000), buyerName: 'Shree Ganesh Polymers', buyerCity: 'Pune', consentMethod: 'meeting_minutes' })
      .where(and(eq(s.propertyUnits.projectId, park.id), eq(s.propertyUnits.unitNo, 'P-04')));
  }
}

/** Unite Solar sales desk and BOGO demo: kit range, online-store products, promotions, quotes, a partner referral code with referrals. */
export async function solarDemo(db: Db, refs: SeedRefs) {
  const [any] = await db.select({ id: s.solarKits.id }).from(s.solarKits).limit(1);
  const owner = refs.orgs.uniteSolar;
  const by = refs.users.uniteAdmin;
  if (any || !owner || !by) return;
  const K = (system: 'on_grid' | 'hybrid' | 'off_grid', kw: number, price: number, battery?: number) => {
    const sys = { on_grid: 'OG', hybrid: 'HY', off_grid: 'OF' }[system];
    const label = { on_grid: 'On-grid', hybrid: 'Hybrid', off_grid: 'Off-grid' }[system];
    return {
      code: `USK-${sys}-${String(kw).padStart(2, '0')}`, ownerOrgId: owner, name: `Unite Solar ${kw} kW ${label} kit`, system, capacityW: kw * 1000, panelW: 550, inverterW: kw * 1000, batteryWh: battery ?? null, phase: kw > 5 ? 3 : 1,
      price, warrantyYears: 25, createdBy: by,
      includes: ['ALMM-listed 550 Wp mono PERC panels', `${kw} kW ${system === 'off_grid' ? 'off-grid' : system === 'hybrid' ? 'hybrid' : 'grid-tied'} inverter`, 'Galvanised mounting structure', 'DC/AC cables, ACDB/DCDB, earthing and lightning arrester', ...(battery ? [`${battery / 1000} kWh lithium battery`] : []), system === 'on_grid' ? 'Net-meter application support' : 'Battery backup during power cuts', 'Installation and 5-year service'],
      description: system === 'on_grid' ? `Rooftop solar for homes and shops using up to about ${Math.round(kw * 120)} units a month. Eligible for PM Surya Ghar subsidy for homes, subject to DISCOM approval.`
        : system === 'hybrid' ? `Solar with battery backup: saves on the bill like on-grid and keeps essential loads running during power cuts.` : `Stand-alone solar with battery for places with no or unreliable grid supply — farms, shops and remote homes.`,
    };
  };
  await db.insert(s.solarKits).values([
    K('on_grid', 1, 72_000_00), K('on_grid', 2, 1_30_000_00), K('on_grid', 3, 1_85_000_00), K('on_grid', 4, 2_40_000_00), K('on_grid', 5, 2_90_000_00), K('on_grid', 6, 3_45_000_00), K('on_grid', 8, 4_50_000_00), K('on_grid', 10, 5_50_000_00),
    K('hybrid', 3, 3_10_000_00, 5000), K('hybrid', 5, 4_60_000_00, 10000), K('hybrid', 8, 6_80_000_00, 15000),
    K('off_grid', 1, 95_000_00, 2500), K('off_grid', 2, 1_65_000_00, 5000), K('off_grid', 3, 2_40_000_00, 7500),
  ]);
  // Retail products for the online store (generic, unbranded).
  const retail: [string, string, number, string][] = [
    ['Solar LED lantern with mobile charging', 'Solar accessories', 1_499_00, '5 W panel, 3 brightness levels, USB phone charging, up to 10 hours of light.'],
    ['Solar home-lighting kit — 3 lights and a fan', 'Solar accessories', 8_999_00, '40 W panel, 3 LED lights, 12 V DC fan and phone charging for homes with frequent power cuts.'],
    ['All-in-one solar street light 30 W', 'Solar accessories', 6_499_00, 'Integrated panel, lithium battery and motion sensor; dusk-to-dawn operation for gates, lanes and farms.'],
    ['Solar water heater 100 litres per day', 'Solar water heating', 22_500_00, 'Evacuated-tube collector for a family of 3–4; saves electric geyser use through the year.'],
    ['BLDC ceiling fan 28 W with remote', 'Energy-efficient appliances', 3_299_00, 'Uses about 60% less power than a regular fan; ideal with solar and inverter backup.'],
    ['LED bulb 9 W — pack of 4', 'Energy-efficient appliances', 399_00, '900 lumen cool-white bulbs, 2-year warranty.'],
    ['Solar power bank 20,000 mAh', 'Solar accessories', 1_899_00, 'Fast-charging power bank with a built-in solar panel and torch for travel and outages.'],
    ['Lithium inverter battery 1.5 kWh', 'Batteries and storage', 38_000_00, 'Wall-mounted lithium battery for home inverters; 3,000+ cycles and 5-year warranty.'],
  ];
  const items = await db.insert(s.catalogItems).values(retail.map(([name, sector, price, description]) => ({ ownerOrgId: owner, kind: 'product', name, sector, description, unit: 'piece', listPrice: price, storePrice: price, priceVisibility: 'public', visibility: 'public', status: 'published', createdBy: by, sku: `US-RT-${name.replace(/[^A-Z0-9]/gi, '').slice(0, 10).toUpperCase()}` }))).returning();
  const day = 86400_000;
  await db.insert(s.promotions).values([
    { code: 'PRM-2026-0001', ownerOrgId: owner, name: 'Festive solar lights', buyQty: 1, getQty: 1, scope: 'sectors', sectors: ['Solar accessories'], channel: 'both', maxFreePerOrder: 2, budgetUnits: 200, budgetValue: 3_00_000_00, startsAt: new Date(Date.now() - 3 * day), endsAt: new Date(Date.now() + 30 * day), status: 'active', createdBy: by, approvedBy: refs.users.finance ?? refs.users.superadmin, approvedAt: new Date(Date.now() - 3 * day),
      terms: 'Buy any solar light, lantern, home-lighting kit or power bank and get one more of the same free. Up to 2 free items per order or bill. While the 200-item offer budget lasts, until the end date. Not combinable with other offers.' },
    { code: 'PRM-2026-0002', ownerOrgId: owner, name: 'Buy one get one — all products', buyQty: 1, getQty: 1, scope: 'all', channel: 'both', maxFreePerOrder: 1, budgetValue: 5_00_000_00, startsAt: new Date(Date.now() + day), endsAt: new Date(Date.now() + 15 * day), status: 'draft', createdBy: by,
      terms: 'Buy any product online or in a participating store and get one more of the same free. One free item per order or bill, while the ₹5 lakh offer budget lasts. Draft — to be approved by finance.' },
  ]);
  if (refs.orgs.volt && refs.users.asha) {
    const [code] = await db.insert(s.solarReferralCodes).values({ code: 'ASHA2026', ownerUserId: refs.users.asha, ownerOrgId: refs.orgs.volt, ownerName: 'Asha Patil' }).returning();
    await db.insert(s.solarReferrals).values([
      { codeId: code.id, name: 'Sunil Joshi', phone10: '9822001122', city: 'Pune', region: 'IN-MH', segment: 'residential', monthlyBill: 4_200_00 },
      { codeId: code.id, name: 'Kaveri Textiles', phone10: '9822003344', city: 'Ichalkaranji', region: 'IN-MH', segment: 'industrial', monthlyBill: 3_80_000_00, status: 'quoted' },
    ]);
    const kits = await db.select().from(s.solarKits);
    const k3 = kits.find((k) => k.code === 'USK-OG-03')!;
    const { quoteSolar, DEFAULT_SOLAR_CONFIG } = await import('@collabiz/types');
    const Q = (customer: { name: string; phone: string; city: string }, site: { segment: 'residential' | 'commercial' | 'industrial'; region: string; monthlyUnits: number; tariff: number; sanctionedLoadKw?: number }, model: 'kit' | 'epc' | 'ppa', status: string, kw?: number, partner = true) => {
      const kit = model === 'kit' ? { id: k3.id, code: k3.code, name: k3.name, system: k3.system, capacityKw: k3.capacityW / 1000, price: k3.price } : null;
      const calc = quoteSolar(DEFAULT_SOLAR_CONFIG, { site, model, system: 'on_grid', capacityKw: kw }, kit);
      return { code: `QT-SOL-2026-${Math.floor(10000 + Math.random() * 89999)}`, ownerOrgId: owner, partnerOrgId: partner ? refs.orgs.volt : null, createdBy: partner ? refs.users.asha : by, customer, phone10: customer.phone.slice(-10), consentMethod: 'meeting_minutes', site, model, system: 'on_grid', kitId: kit?.id ?? null, capacityW: Math.round(calc.capacityKw * 1000), calc, total: calc.total, net: calc.net, commission: partner ? calc.commission : 0, status, validUntil: new Date(Date.now() + 15 * day).toISOString().slice(0, 10) };
    };
    await db.insert(s.solarQuotes).values([
      Q({ name: 'Anand Kulkarni', phone: '9850012345', city: 'Pune' }, { segment: 'residential', region: 'IN-MH', monthlyUnits: 360, tariff: 950, sanctionedLoadKw: 5 }, 'kit', 'sent'),
      Q({ name: 'Shree Ganesh Polymers', phone: '9850054321', city: 'Chakan' }, { segment: 'industrial', region: 'IN-MH', monthlyUnits: 18000, tariff: 1050 }, 'epc', 'accepted', 120),
      Q({ name: 'Deccan Cold Storage', phone: '9850098765', city: 'Nashik' }, { segment: 'commercial', region: 'IN-MH', monthlyUnits: 26000, tariff: 1100 }, 'ppa', 'sent', 180, false),
    ]);
  }
  await db.insert(s.storeOrders).values({
    code: 'STO-2026-100001', customer: { name: 'Meena Shah', phone: '9820456789', address: '12 Lake View Society, Baner Road', city: 'Pune', region: 'IN-MH', pincode: '411045' }, phone10: '9820456789',
    lines: [{ ref: `item:${items[0].id}`, name: items[0].name, sector: items[0].sector, unitPrice: items[0].storePrice, qty: 1, freeQty: 0, freeValue: 0, promotionId: null, promotionName: null, lineTotal: items[0].storePrice }], subtotal: items[0].storePrice!, freeValue: 0,
  });
}

/** V2 demo: a Deal Passport on a protected lead (shared with Volt EPC) and work packages on the Volt-led Unite Solar project. */
export async function v2Demo(db: Db, refs: SeedRefs) {
  const [any] = await db.select({ id: s.workPackages.id }).from(s.workPackages).limit(1);
  if (any || !refs.users.uniteAdmin) return;
  const [proj] = await db.select().from(s.projects).where(eq(s.projects.code, 'PRJ-2026-000001')).limit(1);
  if (proj) {
    const day = 86400_000;
    await db.insert(s.workPackages).values([
      { code: 'WP-2026-000001-101', projectId: proj.id, category: 'civil', title: 'Module mounting foundations', scope: 'Pile foundations, module mounting structures and drainage for the solar array, including soil tests and as-built drawings.', budget: Math.round(proj.value * 0.12), closesAt: new Date(Date.now() + 9 * day), status: 'open', eligibility: { sectors: [], regions: [], certifications: [] }, createdBy: refs.users.asha ?? refs.users.uniteAdmin },
      { code: 'WP-2026-000001-102', projectId: proj.id, category: 'electrical', title: 'HT switchyard and evacuation line', scope: '11 kV switchyard, transformer installation and a 2 km evacuation line up to the DISCOM substation, with CEIG approval.', budget: Math.round(proj.value * 0.18), closesAt: new Date(Date.now() + 14 * day), status: 'draft', eligibility: { sectors: [], regions: [], certifications: [] }, createdBy: refs.users.asha ?? refs.users.uniteAdmin },
    ]);
  }
  const [claim] = await db.select().from(s.leadClaims).where(eq(s.leadClaims.status, 'protected')).limit(1);
  if (claim && refs.orgs.volt && refs.users.meera) {
    const [p] = await db.insert(s.dealPassports).values({ code: 'DP-2026-100001', claimId: claim.id, ownerOrgId: claim.introducerOrgId }).onConflictDoNothing().returning();
    if (p) await db.insert(s.dealPassportParties).values({ passportId: p.id, organizationId: refs.orgs.volt, role: 'execution_partner', ndaHash: 'demo-pending-undertaking', grantedBy: refs.users.meera });
  }
}

/** XCHANGE demo: offers and needs that form a three-way chain (Volt → Deccan → Sunrise → Volt), idle capacity, and one proposed swap. */
export async function xchangeDemo(db: Db, refs: SeedRefs) {
  if ((await db.select({ id: s.xchangeListings.id }).from(s.xchangeListings).limit(1)).length) return;
  const { volt, sunrise, deccan, meera } = refs.orgs;
  const by = { volt: refs.users.asha, sunrise: refs.users.ravi, deccan: refs.users.deepak, meera: refs.users.meera };
  if (!volt || !sunrise || !deccan || !meera || !by.volt || !by.sunrise || !by.deccan || !by.meera) return;
  const X = (orgId: string, createdBy: string, side: string, category: string, title: string, value: number, region: string, description: string, accepts = ['barter', 'part_cash']) =>
    ({ code: `XL-${Math.floor(100000 + Math.random() * 899999)}`, orgId, createdBy, side, category, title, value, region, description, accepts, valueBasis: 'price_list' });
  const rows = await db.insert(s.xchangeListings).values([
    X(volt, by.volt, 'offer', 'solar_equipment', '540 Wp mono PERC panels — 200 nos (surplus)', 5_00_000_00, 'IN-MH', 'Surplus from a cancelled order, boxed with datasheets and flash test reports. Pune warehouse.'),
    X(volt, by.volt, 'need', 'construction_services', 'Civil works for a rooftop structure', 5_00_000_00, 'IN-MH', 'Foundation and structure work for a 300 kW rooftop in Chakan, about four weeks.'),
    X(sunrise, by.sunrise, 'offer', 'construction_services', 'Civil crew — 12 people, 4 weeks', 5_10_000_00, 'IN-GJ', 'Experienced civil and structure crew with supervisor; travel within Gujarat and Maharashtra.'),
    X(sunrise, by.sunrise, 'need', 'advertising', 'Outdoor advertising in Gujarat', 5_00_000_00, 'IN-GJ', 'Hoardings and radio for our new solar range launch in Ahmedabad and Surat.'),
    X(deccan, by.deccan, 'offer', 'advertising', 'Hoardings and regional radio package', 4_95_000_00, 'IN-KA', 'Twenty hoardings across Karnataka and Gujarat plus a 6-week regional radio campaign.'),
    X(deccan, by.deccan, 'need', 'solar_equipment', 'Solar panels for our warehouse roof', 5_00_000_00, 'IN-KA', 'About 100 kW of panels for our distribution warehouse in Hubballi.'),
    X(meera, by.meera, 'offer', 'warehouse_space', 'Warehouse space — 2,000 sq ft for 3 months', 6_00_000_00, 'IN-KA', 'Covered warehouse with loading bay near Bengaluru ring road; available from next month.', ['barter', 'part_cash', 'cash']),
    X(meera, by.meera, 'need', 'electrical_equipment', 'Inverter and balance-of-system kit', 10_00_000_00, 'IN-KA', 'For a client energy-audit pilot; open to part-cash.'),
  ]).returning();
  const termsKey = (legs: { fromOrgId: string; toOrgId: string; description: string; value: number; cash: number }[]) => JSON.stringify(legs.map((l) => [l.fromOrgId, l.toOrgId, l.description, l.value, l.cash]).sort());
  const legs = [
    { fromOrgId: volt, toOrgId: meera, description: 'Inverter and BOS kit', value: 10_00_000_00, cash: 4_00_000_00 },
    { fromOrgId: meera, toOrgId: volt, description: 'Warehouse space — 2,000 sq ft for 3 months', value: 6_00_000_00, cash: 0, listingId: rows[6].id },
  ];
  const key = termsKey(legs);
  const [d] = await db.insert(s.xchangeDeals).values({ code: 'XD-2026-10001', kind: 'part_cash', termsKey: key, note: 'Part-cash: our inverter kit for your warehouse plus ₹4 lakh.', proposedByOrgId: volt, proposedBy: by.volt }).returning();
  await db.insert(s.xchangeLegs).values(legs.map((l) => ({ ...l, dealId: d.id })));
  await db.insert(s.xchangeApprovals).values({ dealId: d.id, orgId: volt, termsKey: key, approvedBy: by.volt });
}

/** V2 Phase 2 demo: invoices on the completed Volt project (one paid, one part-paid and overdue, one new), a contract dispute and a consortium contribution. */
export async function phase2Demo(db: Db, refs: SeedRefs) {
  if ((await db.select({ id: s.resolutionCases.id }).from(s.resolutionCases).limit(1)).length) return;
  const { volt, uniteSolar } = refs.orgs;
  if (!volt || !uniteSolar || !refs.users.asha || !refs.users.uniteAdmin) return;
  const [proj] = await db.select().from(s.projects).where(eq(s.projects.code, 'PRJ-2025-000014')).limit(1);
  if (proj) {
    const ms = await db.select().from(s.milestones).where(eq(s.milestones.projectId, proj.id)).orderBy(s.milestones.seq);
    const day = 86400_000;
    const ago = (d: number) => new Date(Date.now() - d * day);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const plan = [{ issued: 75, paid: 'full' }, { issued: 50, paid: 'part' }, { issued: 5, paid: 'none' }] as const;
    for (const [i, m] of ms.slice(0, 3).entries()) {
      if ((await db.select({ id: s.projectInvoices.id }).from(s.projectInvoices).where(eq(s.projectInvoices.milestoneId, m.id))).length) continue;
      const p = plan[i];
      const issuedAt = ago(p.issued);
      const [inv] = await db.insert(s.projectInvoices).values({ number: `INV-2026-90000${i + 1}`, projectId: proj.id, milestoneId: m.id, amount: m.amount, issuedByOrgId: volt, issuedAt, dueDate: iso(new Date(issuedAt.getTime() + 30 * day)), status: p.paid === 'full' ? 'paid' : 'issued', paidAt: p.paid === 'full' ? ago(p.issued - 28) : null, paymentReference: p.paid === 'full' ? 'UTR HDFC0026514477' : null }).returning();
      if (p.paid === 'full') await db.insert(s.paymentReceipts).values({ invoiceId: inv.id, amount: m.amount, reference: 'UTR HDFC0026514477', receivedAt: iso(ago(p.issued - 28)), recordedBy: refs.users.uniteAdmin });
      if (p.paid === 'part') await db.insert(s.paymentReceipts).values({ invoiceId: inv.id, amount: Math.round(m.amount * 0.6), reference: 'UTR ICIC0031987720', receivedAt: iso(ago(12)), note: 'Balance held pending as-built drawings', recordedBy: refs.users.uniteAdmin });
    }
    const [c] = await db.insert(s.resolutionCases).values({ code: 'RC-2026-10001', projectId: proj.id, raisedByOrgId: volt, againstOrgId: uniteSolar, subject: 'Balance on Electrical BoS invoice withheld', statement: 'Unite Solar paid 60% of invoice INV-2026-900002 and is holding the balance for as-built drawings, which were shared on site on the handover date. We ask for the balance to be released.', amount: Math.round((ms[1]?.amount ?? 0) * 0.4), createdBy: refs.users.asha }).returning();
    await db.insert(s.resolutionEvents).values({ caseId: c.id, orgId: volt, userId: refs.users.asha, kind: 'statement', body: c.statement });
  }
  const [team] = await db.select().from(s.collaborationTeams).where(eq(s.collaborationTeams.name, 'Chakan Rooftop Consortium')).limit(1);
  if (team) await db.insert(s.teamContributions).values([
    { teamId: team.id, orgId: volt, kind: 'technical', description: 'Design, engineering and net-metering liaison', pledgedValue: 6_00_000_00, deliveredValue: 4_00_000_00, evidence: 'Single-line diagram and structural design shared in the workspace', confirmedByOrgId: volt, createdBy: refs.users.asha },
    { teamId: team.id, orgId: volt, kind: 'equipment', description: 'Lifting equipment and scaffolding for 6 weeks', pledgedValue: 2_50_000_00, createdBy: refs.users.asha },
  ]);
}

/** Bank statement demo: Volt's October statement — its credit is the part payment already recorded on INV-2026-900002. */
export async function bankDemo(db: Db, refs: SeedRefs) {
  if ((await db.select({ id: s.bankStatements.id }).from(s.bankStatements).limit(1)).length) return;
  const { volt } = refs.orgs;
  if (!volt || !refs.users.asha) return;
  const lines = [
    { seq: 1, txnDate: new Date(Date.now() - 12 * 86400_000).toISOString().slice(0, 10), description: 'NEFT-ICIC0031987720-UNITE SOLAR PVT LTD', reference: 'ICIC0031987720', direction: 'credit', amount: 1_20_00_000_00, utr: 'ICIC0031987720', status: 'unmatched', matchReason: 'Already recorded on INV-2026-900002' },
    { seq: 2, txnDate: new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10), description: 'IMPS 612398765432 SITE ADVANCE RETURN', reference: null, direction: 'credit', amount: 25_000_00, utr: '612398765432', status: 'unmatched', matchReason: null },
    { seq: 3, txnDate: new Date(Date.now() - 9 * 86400_000).toISOString().slice(0, 10), description: 'MONTHLY ACCOUNT CHARGES', reference: null, direction: 'debit', amount: 590_00, utr: null, status: 'ignored', matchReason: null },
  ];
  const [st] = await db.insert(s.bankStatements).values({ orgId: volt, uploadedBy: refs.users.asha, fileName: 'volt-hdfc-october.csv', fileHash: 'demo-october-statement', layout: 'debit_credit_columns', periodFrom: lines[0].txnDate, periodTo: lines[2].txnDate, lineCount: 3 }).returning();
  await db.insert(s.bankStatementLines).values(lines.map((l) => ({ ...l, statementId: st.id })));
}
