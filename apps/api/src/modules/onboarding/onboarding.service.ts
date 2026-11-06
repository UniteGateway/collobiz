import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { assertTransition, KybMachine, type KybState, KYB_DOC_TYPES } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { agreementAcceptances, agreementTemplates, bankProfiles, kybDocuments, kybReviews, memberships, organizations, partnerProfiles, riskFlags, users } from '../../db/schema';
import { AuditService } from '../../common/audit.service';
import { StorageService } from '../../common/adapters';
import { encryptField, maskTail, sha256 } from '../../common/crypto';
import type { RequestContext } from '../../common/context';

export const STEPS = ['account_type', 'details', 'industries', 'coverage', 'profile', 'documents', 'bank_tax', 'agreements'] as const;
export type Step = (typeof STEPS)[number];
/** Minimum documents per account kind before submission. */
export const REQUIRED_DOCS: Record<'individual' | 'company', string[]> = {
  individual: ['pan', 'identity_proof', 'address_proof'],
  company: ['pan', 'incorporation_certificate', 'address_proof'],
};
/** Placeholder sanctions screening list (§7.3) — replace with a licensed screening provider before launch. */
const SCREENED_COUNTRIES = new Set(['KP', 'IR', 'SY', 'CU']);

@Injectable()
export class OnboardingService {
  constructor(@InjectDb() private db: Db, private audit: AuditService, private storage: StorageService) {}

  /** 013 — choose account type; creates the partner organization and owner membership. */
  async chooseAccountType(ctx: RequestContext, kind: 'individual' | 'company', partnerTypes: string[]) {
    const [user] = await this.db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    if (!user.emailVerifiedAt) throw new ForbiddenException('Verify your email before starting partner onboarding');
    const existing = ctx.memberships.find((m) => m.role === 'org_owner' && (m.orgType === 'partner_company' || m.orgType === 'partner_individual'));
    if (existing) {
      const [org] = await this.db.select().from(organizations).where(eq(organizations.id, existing.organizationId)).limit(1);
      if (org.verificationStatus !== 'not_started') throw new ConflictException('Your partner account has already been submitted for verification');
      const type = kind === 'company' ? 'partner_company' : 'partner_individual';
      await this.db.update(organizations).set({ type, partnerTypes, updatedAt: new Date() }).where(eq(organizations.id, org.id));
      await this.db.update(partnerProfiles).set({ kind, updatedAt: new Date() }).where(eq(partnerProfiles.organizationId, org.id));
      await this.audit.record({ ...ctx, orgId: org.id }, { action: 'onboarding.account_type_changed', objectType: 'organization', objectId: org.id, before: { type: org.type }, after: { type, partnerTypes } });
      return { organizationId: org.id };
    }
    return this.db.transaction(async (tx) => {
      const [org] = await tx.insert(organizations).values({
        legalName: kind === 'individual' ? `${user.fullName} (Individual)` : `${user.fullName} — company (pending details)`,
        displayName: user.fullName, type: kind === 'company' ? 'partner_company' : 'partner_individual', partnerTypes, createdBy: user.id,
      }).returning();
      await tx.insert(memberships).values({ userId: user.id, organizationId: org.id, role: 'org_owner', status: 'active' });
      await tx.insert(partnerProfiles).values({ organizationId: org.id, kind, completedSteps: ['account_type'] });
      await this.audit.record({ ...ctx, orgId: org.id }, { action: 'onboarding.organization_created', objectType: 'organization', objectId: org.id, after: { kind, partnerTypes } }, tx as unknown as Db);
      return { organizationId: org.id };
    });
  }

  private async editable(ctx: RequestContext) {
    if (!ctx.orgId) throw new ForbiddenException('Choose an account type first');
    if (!ctx.orgRoles.includes('org_owner') && !ctx.orgRoles.includes('org_admin')) throw new ForbiddenException('Only owners and admins can edit the partner profile');
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
    const [profile] = await this.db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, ctx.orgId)).limit(1);
    if (!org || !profile) throw new NotFoundException('Partner profile not found');
    if (org.verificationStatus === 'submitted' || org.verificationStatus === 'under_review') throw new ConflictException('Your profile is locked while verification is in progress');
    return { org, profile };
  }

  private async saveStep(ctx: RequestContext, step: Step, patch: Partial<typeof partnerProfiles.$inferInsert>, orgPatch?: Partial<typeof organizations.$inferInsert>, auditAfter?: unknown) {
    const { org, profile } = await this.editable(ctx);
    const steps = Array.from(new Set([...profile.completedSteps, step]));
    await this.db.transaction(async (tx) => {
      await tx.update(partnerProfiles).set({ ...patch, completedSteps: steps, version: profile.version + 1, updatedAt: new Date() }).where(eq(partnerProfiles.organizationId, org.id));
      if (orgPatch) await tx.update(organizations).set({ ...orgPatch, updatedAt: new Date() }).where(eq(organizations.id, org.id));
      // A verified partner editing material details goes back to review (KYB re-verification).
      await this.audit.record(ctx, { action: `onboarding.${step}_saved`, objectType: 'partner_profile', objectId: org.id, after: auditAfter ?? patch }, tx as unknown as Db);
    });
    return this.status(ctx);
  }

  saveIndividual(ctx: RequestContext, b: { displayName: string; profession: string; city: string; country: string; yearsExperience: number; pan?: string }) {
    return this.saveStep(ctx, 'details',
      { profession: b.profession, yearsExperience: b.yearsExperience, ...(b.pan ? { panEnc: encryptField(b.pan), panLast4: b.pan.slice(-4) } : {}) },
      { displayName: b.displayName, legalName: `${b.displayName} (Individual)`, city: b.city, country: b.country },
      { displayName: b.displayName, profession: b.profession, city: b.city, pan: b.pan ? maskTail(b.pan) : undefined });
  }

  async saveCompany(ctx: RequestContext, b: { legalName: string; tradeName?: string; registrationNumber: string; gstin?: string; country: string; city: string; website?: string; employees?: number; annualTurnover?: number }) {
    const r = await this.saveStep(ctx, 'details',
      { tradeName: b.tradeName, registrationNumber: b.registrationNumber, gstin: b.gstin, website: b.website, employees: b.employees, annualTurnover: b.annualTurnover },
      { legalName: b.legalName, displayName: b.tradeName || b.legalName, city: b.city, country: b.country });
    return r;
  }

  saveIndustries(ctx: RequestContext, b: { sectors: string[]; skills: string[]; certifications: string[]; capacityMax?: number }) {
    return this.saveStep(ctx, 'industries', { sectors: b.sectors, skills: b.skills, certifications: b.certifications, capacityMax: b.capacityMax });
  }
  saveCoverage(ctx: RequestContext, b: { regions: string[]; willingToTravel: boolean }) {
    return this.saveStep(ctx, 'coverage', { regions: b.regions, willingToTravel: b.willingToTravel });
  }
  saveProfile(ctx: RequestContext, b: { headline: string; about: string; services: string[]; pastProjects: unknown[]; consentToMatch: boolean }) {
    return this.saveStep(ctx, 'profile', { headline: b.headline, about: b.about, services: b.services, pastProjects: b.pastProjects, consentToMatch: b.consentToMatch });
  }

  // ---------------- 019 KYC / KYB documents ----------------
  async uploadDocument(ctx: RequestContext, docType: string, file: { buffer: Buffer; mimetype: string; originalname: string } | undefined) {
    if (!file) throw new BadRequestException('Attach a file');
    if (!(KYB_DOC_TYPES as readonly string[]).includes(docType)) throw new BadRequestException('Unknown document type');
    const { org } = await this.editable(ctx);
    const stored = await this.storage.put(file.buffer, file.mimetype, `kyb/${org.id}`);
    const dup = await this.db.select({ id: kybDocuments.id }).from(kybDocuments).where(and(eq(kybDocuments.organizationId, org.id), eq(kybDocuments.sha256, stored.sha256), ne(kybDocuments.status, 'superseded'))).limit(1);
    if (dup.length) throw new ConflictException('This exact file was already uploaded');
    // Older pending/rejected document of the same type is superseded (history kept).
    await this.db.update(kybDocuments).set({ status: 'superseded' }).where(and(eq(kybDocuments.organizationId, org.id), eq(kybDocuments.docType, docType), inArray(kybDocuments.status, ['pending', 'rejected'])));
    const [doc] = await this.db.insert(kybDocuments).values({
      organizationId: org.id, docType, fileName: file.originalname.slice(0, 200), objectKey: stored.key, sha256: stored.sha256, size: stored.size, mime: stored.mime, uploadedBy: ctx.userId,
    }).returning();
    const docs = await this.documents(ctx);
    const kind = (await this.db.select({ kind: partnerProfiles.kind }).from(partnerProfiles).where(eq(partnerProfiles.organizationId, org.id)))[0].kind as 'individual' | 'company';
    if (REQUIRED_DOCS[kind].every((t) => docs.some((d) => d.docType === t && d.status !== 'rejected'))) {
      await this.db.update(partnerProfiles).set({ completedSteps: sql`array(select distinct unnest(${partnerProfiles.completedSteps} || array['documents']))` }).where(eq(partnerProfiles.organizationId, org.id));
    }
    await this.audit.record(ctx, { action: 'kyb.document_uploaded', objectType: 'kyb_document', objectId: doc.id, after: { docType, sha256: stored.sha256, size: stored.size } });
    return this.publicDoc(doc);
  }

  async documents(ctx: RequestContext) {
    const rows = await this.db.select().from(kybDocuments).where(and(eq(kybDocuments.organizationId, ctx.orgId!), ne(kybDocuments.status, 'superseded'))).orderBy(desc(kybDocuments.createdAt));
    return rows.map((d) => this.publicDoc(d));
  }

  async removeDocument(ctx: RequestContext, docId: string) {
    const { org } = await this.editable(ctx);
    const [d] = await this.db.select().from(kybDocuments).where(and(eq(kybDocuments.id, docId), eq(kybDocuments.organizationId, org.id))).limit(1);
    if (!d || d.status === 'superseded') throw new NotFoundException('Document not found');
    if (d.status === 'accepted') throw new ConflictException('Accepted documents cannot be removed');
    await this.db.update(kybDocuments).set({ status: 'superseded' }).where(eq(kybDocuments.id, d.id));
    await this.audit.record(ctx, { action: 'kyb.document_removed', objectType: 'kyb_document', objectId: d.id });
    return { removed: true };
  }

  /** Signed, expiring link; issuing it is an audited document access (§6.5). */
  async documentUrl(ctx: RequestContext, docId: string, orgScope: string | null) {
    const conds = [eq(kybDocuments.id, docId)];
    if (orgScope) conds.push(eq(kybDocuments.organizationId, orgScope));
    const [d] = await this.db.select().from(kybDocuments).where(and(...conds)).limit(1);
    if (!d) throw new NotFoundException('Document not found');
    await this.audit.record(ctx, { action: 'kyb.document_accessed', objectType: 'kyb_document', objectId: d.id, organizationId: d.organizationId });
    return { url: this.storage.signedUrl(d.objectKey, 300), expiresInSec: 300 };
  }

  private publicDoc(d: typeof kybDocuments.$inferSelect) {
    return { id: d.id, docType: d.docType, fileName: d.fileName, size: d.size, mime: d.mime, sha256: d.sha256, status: d.status, reviewNote: d.reviewNote, createdAt: d.createdAt };
  }

  // ---------------- 020 Bank & tax ----------------
  async saveBankTax(ctx: RequestContext, b: { accountHolder: string; accountNumber: string; ifsc: string; bankName: string; pan: string; gstRegistered: boolean; gstin?: string; tdsSection?: string }) {
    const { org } = await this.editable(ctx);
    const row = {
      accountHolder: b.accountHolder, accountNumberEnc: encryptField(b.accountNumber), accountLast4: b.accountNumber.slice(-4), ifsc: b.ifsc, bankName: b.bankName,
      panEnc: encryptField(b.pan), panLast4: b.pan.slice(-4), gstRegistered: b.gstRegistered, gstin: b.gstRegistered ? b.gstin : null, tdsSection: b.tdsSection, verified: false, updatedBy: ctx.userId, updatedAt: new Date(),
    };
    await this.db.insert(bankProfiles).values({ organizationId: org.id, ...row }).onConflictDoUpdate({ target: bankProfiles.organizationId, set: row });
    await this.db.update(partnerProfiles).set({ completedSteps: sql`array(select distinct unnest(${partnerProfiles.completedSteps} || array['bank_tax']))` }).where(eq(partnerProfiles.organizationId, org.id));
    await this.audit.record(ctx, { action: 'onboarding.bank_tax_saved', objectType: 'bank_profile', objectId: org.id, after: { bankName: b.bankName, account: maskTail(b.accountNumber), ifsc: b.ifsc, gstRegistered: b.gstRegistered } });
    return this.bankTax(ctx.orgId!);
  }

  async bankTax(orgId: string) {
    const [b] = await this.db.select().from(bankProfiles).where(eq(bankProfiles.organizationId, orgId)).limit(1);
    if (!b) return null;
    return { accountHolder: b.accountHolder, accountMasked: `••••${b.accountLast4}`, ifsc: b.ifsc, bankName: b.bankName, panMasked: `••••••${b.panLast4}`, gstRegistered: b.gstRegistered, gstin: b.gstin, tdsSection: b.tdsSection, verified: b.verified, updatedAt: b.updatedAt };
  }

  // ---------------- 021 Agreements ----------------
  async requiredAgreements(orgId: string | null) {
    const templates = await this.db.select().from(agreementTemplates).where(and(eq(agreementTemplates.requiredFor, 'onboarding'), eq(agreementTemplates.status, 'active'))).orderBy(agreementTemplates.code);
    const accepted = orgId ? await this.db.select().from(agreementAcceptances).where(eq(agreementAcceptances.organizationId, orgId)) : [];
    return templates.map((t) => ({ code: t.code, version: t.version, title: t.title, body: t.body, bodyHash: t.bodyHash, legalReviewed: t.legalReviewed, accepted: accepted.find((a) => a.templateCode === t.code && a.version === t.version) ?? null }));
  }

  async acceptAgreement(ctx: RequestContext, b: { templateCode: string; version: number; typedName: string }, meta: { ip?: string; userAgent?: string }) {
    const { org } = await this.editable(ctx);
    const [t] = await this.db.select().from(agreementTemplates).where(and(eq(agreementTemplates.code, b.templateCode), eq(agreementTemplates.version, b.version), eq(agreementTemplates.status, 'active'))).limit(1);
    if (!t) throw new BadRequestException('Agreement version is not active');
    if (sha256(t.body) !== t.bodyHash) throw new ConflictException('Agreement integrity check failed');
    const [user] = await this.db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    if (b.typedName.trim().toLowerCase() !== user.fullName.trim().toLowerCase()) throw new BadRequestException({ statusCode: 400, message: 'Type your full name exactly as registered', issues: [{ path: 'typedName', message: `Type "${user.fullName}"` }] });
    const [a] = await this.db.insert(agreementAcceptances).values({ organizationId: org.id, userId: ctx.userId, templateCode: t.code, version: t.version, typedName: b.typedName, docHash: t.bodyHash, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 200) })
      .onConflictDoNothing().returning();
    if (!a) throw new ConflictException('Already accepted');
    const required = await this.requiredAgreements(org.id);
    if (required.every((r) => r.accepted)) {
      await this.db.update(partnerProfiles).set({ completedSteps: sql`array(select distinct unnest(${partnerProfiles.completedSteps} || array['agreements']))` }).where(eq(partnerProfiles.organizationId, org.id));
    }
    await this.audit.record(ctx, { action: 'agreement.accepted', objectType: 'agreement_acceptance', objectId: a.id, after: { code: t.code, version: t.version, docHash: t.bodyHash, typedName: b.typedName } });
    return a;
  }

  // ---------------- 022 Status & submission ----------------
  async status(ctx: RequestContext) {
    if (!ctx.orgId) return { organization: null, steps: STEPS.map((s) => ({ step: s, complete: false })), canSubmit: false, history: [] };
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
    const [profile] = await this.db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, ctx.orgId)).limit(1);
    const history = await this.db.select().from(kybReviews).where(eq(kybReviews.organizationId, ctx.orgId)).orderBy(desc(kybReviews.createdAt));
    const docs = await this.documents(ctx);
    const missingDocs = profile ? REQUIRED_DOCS[profile.kind as 'individual' | 'company'].filter((t) => !docs.some((d) => d.docType === t && d.status !== 'rejected')) : [];
    // The documents step is derived from live document state so a rejected document re-opens it.
    const steps = STEPS.map((s) => ({ step: s, complete: s === 'documents' ? !!profile && missingDocs.length === 0 : !!profile?.completedSteps.includes(s) }));
    return {
      organization: { id: org.id, legalName: org.legalName, displayName: org.displayName, type: org.type, verificationStatus: org.verificationStatus, membershipLevel: org.membershipLevel, partnerTypes: org.partnerTypes },
      kind: profile?.kind, steps, missingDocs, canSubmit: steps.every((s) => s.complete) && ['not_started', 'reupload_requested', 'rejected'].includes(org.verificationStatus),
      rejectedDocs: docs.filter((d) => d.status === 'rejected'),
      history: history.map((h) => ({ at: h.createdAt, from: h.fromStatus, to: h.toStatus, reason: h.reason })),
    };
  }

  async submit(ctx: RequestContext) {
    const s = await this.status(ctx);
    if (!s.organization) throw new BadRequestException('Choose an account type first');
    if (!ctx.orgRoles.includes('org_owner')) throw new ForbiddenException('Only the owner can submit for verification');
    const incomplete = s.steps.filter((x) => !x.complete).map((x) => x.step);
    if (incomplete.length) throw new BadRequestException({ statusCode: 400, message: `Complete these steps first: ${incomplete.join(', ')}`, issues: incomplete.map((p) => ({ path: p, message: 'Incomplete' })) });
    const from = s.organization.verificationStatus as KybState;
    assertTransition(KybMachine, from, 'submitted');
    await this.db.transaction(async (tx) => {
      await tx.update(organizations).set({ verificationStatus: 'submitted', updatedAt: new Date() }).where(eq(organizations.id, s.organization!.id));
      await tx.insert(kybReviews).values({ organizationId: s.organization!.id, fromStatus: from, toStatus: 'submitted', actorUserId: ctx.userId });
      await this.audit.record(ctx, { action: 'kyb.submitted', objectType: 'organization', objectId: s.organization!.id, before: { verificationStatus: from }, after: { verificationStatus: 'submitted' } }, tx as unknown as Db);
    });
    await this.autoScreen(s.organization.id);
    return this.status(ctx);
  }

  /** Automatic risk screening on submission (131): duplicate tax IDs across orgs, screened countries. */
  async autoScreen(orgId: string) {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    const [p] = await this.db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, orgId)).limit(1);
    const [bank] = await this.db.select().from(bankProfiles).where(eq(bankProfiles.organizationId, orgId)).limit(1);
    const flags: { kind: string; severity: string; note: string }[] = [];
    const gstins = [p?.gstin, bank?.gstin].filter(Boolean) as string[];
    for (const g of new Set(gstins)) {
      const others = await this.db.select({ id: partnerProfiles.organizationId }).from(partnerProfiles).where(and(eq(partnerProfiles.gstin, g), ne(partnerProfiles.organizationId, orgId)));
      const others2 = await this.db.select({ id: bankProfiles.organizationId }).from(bankProfiles).where(and(eq(bankProfiles.gstin, g), ne(bankProfiles.organizationId, orgId)));
      if (others.length + others2.length) flags.push({ kind: 'duplicate_tax_id', severity: 'high', note: `GSTIN ${g} is also registered to ${others.length + others2.length} other organization(s)` });
    }
    if (SCREENED_COUNTRIES.has(org.country)) flags.push({ kind: 'sanctions_screen', severity: 'high', note: `Country ${org.country} requires enhanced sanctions and trade-control review` });
    for (const f of flags) {
      const exists = await this.db.select({ id: riskFlags.id }).from(riskFlags).where(and(eq(riskFlags.organizationId, orgId), eq(riskFlags.kind, f.kind), eq(riskFlags.status, 'open'))).limit(1);
      if (!exists.length) await this.db.insert(riskFlags).values({ organizationId: orgId, ...f, source: 'automatic' });
    }
    return flags;
  }

  /** 143 — own full profile. */
  async myProfile(ctx: RequestContext) {
    if (!ctx.orgId) throw new NotFoundException('No partner profile yet');
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
    const [p] = await this.db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, ctx.orgId)).limit(1);
    if (!p) throw new NotFoundException('No partner profile yet');
    const { panEnc: _p, ...profile } = p;
    return { organization: org, profile: { ...profile, panMasked: p.panLast4 ? `••••••${p.panLast4}` : null }, bankTax: await this.bankTax(ctx.orgId), documents: await this.documents(ctx), agreements: (await this.requiredAgreements(ctx.orgId)).map(({ body: _b, ...a }) => a) };
  }
}
