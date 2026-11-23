/**
 * UNITE INDUSTRY CLUB — legal drafts, Terms and Conditions, and virtual agreements (tested in test/club-agreements.e2e.ts).
 *
 *  - Templates live in `agreement_templates` (requiredFor 'club'). The text in packages/types/src/club-legal.ts is the
 *    source; a changed text becomes a NEW version (the old one is retired), so accepted and signed versions never change.
 *  - Counsel approval is recorded per version by a super admin (who, when, note). Until then every document generated
 *    from that version carries the pilot-draft notice and the agreement is flagged `pilotDraft`.
 *  - Agreements are ordinary Contracts: approved text, SHA-256-bound typed signatures (or uploaded wet-ink copies),
 *    certificate, vault. The brand licence is issued when Unite approves a product; the product is listed only when both
 *    parties have signed it.
 *  - Member-to-member agreements (NDA, distribution, MoU) are addressed by the other member's club code, so no member
 *    directory is exposed. Unite is not a party to them.
 */
import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, OnModuleInit, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  CLUB_TEMPLATES, CLUB_TEMPLATE_CODES, CounselApprovalSchema, DRAFT_NOTICE, MEMBER_AGREEMENT_TYPES, MemberAgreementSchema, TermsAcceptSchema, countryName, disputeText, marketsLabel, renderTemplate,
  type ClubTemplateCode, type MemberAgreementInput,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { agreementAcceptances, agreementTemplates, catalogItems, clubAgreements, clubProducts, collabJoinProfiles, contracts, contractVersions, groupCompanies, memberships, notifications, organizations, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomDigits, sha256 } from '../../common/crypto';
import { onContractExecuted } from '../../common/contract-hooks';
import { config } from '../../config';

type Template = typeof agreementTemplates.$inferSelect;
const superAdmin = (ctx: RequestContext) => ctx.platformRoles.includes('super_admin');
const money = (minor: number | null, cur: string) => (minor == null ? 'Not stated' : `${cur} ${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);

@Injectable()
export class ClubLegalService implements OnModuleInit {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  async onModuleInit() {
    await this.syncTemplates();
    onContractExecuted((id) => this.executed(id));
  }

  /** Inserts a new version for any template whose text changed; retires the previous one. */
  async syncTemplates() {
    for (const code of CLUB_TEMPLATE_CODES) {
      const t = CLUB_TEMPLATES[code];
      const hash = sha256(t.body);
      const [latest] = await this.db.select().from(agreementTemplates).where(eq(agreementTemplates.code, code)).orderBy(desc(agreementTemplates.version)).limit(1);
      if (latest && latest.bodyHash === hash) continue;
      await this.db.transaction(async (tx) => {
        if (latest) await tx.update(agreementTemplates).set({ status: 'retired' }).where(eq(agreementTemplates.id, latest.id));
        await tx.insert(agreementTemplates).values({ code, version: (latest?.version ?? 0) + 1, title: t.title, body: t.body, bodyHash: hash, requiredFor: 'club', status: 'active', legalReviewed: false }).onConflictDoNothing();
      });
    }
  }

  async current(code: ClubTemplateCode): Promise<Template> {
    const [t] = await this.db.select().from(agreementTemplates).where(and(eq(agreementTemplates.code, code), eq(agreementTemplates.status, 'active'))).orderBy(desc(agreementTemplates.version)).limit(1);
    if (!t) throw new ConflictException('This agreement template is not available');
    if (sha256(t.body) !== t.bodyHash) throw new ConflictException('Template integrity check failed');
    return t;
  }

  operator() {
    const c = config();
    return { name: c.CLUB_OPERATOR_NAME, address: c.CLUB_OPERATOR_ADDRESS, phone: c.CLUB_OPERATOR_PHONE };
  }

  render(t: Template, vars: Record<string, unknown>) {
    const text = renderTemplate(t.body, vars);
    return t.legalReviewed ? text : `${DRAFT_NOTICE}\n\n${text}`;
  }

  async party(orgId: string) {
    const [o] = await this.db.select({ legalName: organizations.legalName, city: organizations.city, country: organizations.country }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!o) throw new NotFoundException('Organisation not found');
    return { name: o.legalName, address: [o.city, countryName(o.country)].filter(Boolean).join(', '), country: countryName(o.country) };
  }

  async licensorOrgId() {
    const [g] = await this.db.select({ id: groupCompanies.organizationId }).from(groupCompanies).where(ilike(groupCompanies.brandName, '%powertek%')).limit(1);
    const [o] = g ? [g] : await this.db.select({ id: organizations.id }).from(organizations).where(ilike(organizations.displayName, '%powertek%')).limit(1);
    if (!o) throw new ConflictException('Unite Powertek is not set up in COLLABIZ yet, so brand licences cannot be issued');
    return o.id;
  }

  /** Creates the contract (approved text, ready to sign) and its club record. */
  async issue(ctx: RequestContext, a: { type: string; code: ClubTemplateCode; fromOrgId: string; toOrgId: string; title: string; vars: Record<string, unknown>; productId?: string; terms?: Record<string, unknown> }, tx: Db = this.db) {
    const t = await this.current(a.code);
    const ref = `CTR-${new Date().getUTCFullYear()}-${randomDigits(6)}`;
    const text = this.render(t, { ...a.vars, ref });
    const now = new Date();
    const [c] = await tx.insert(contracts).values({ code: ref, kind: 'contract', title: a.title, issuerOrgId: a.fromOrgId, counterpartyOrgId: a.toOrgId, status: 'approved', createdBy: ctx.userId! }).returning();
    await tx.insert(contractVersions).values({
      contractId: c.id, versionNo: 1, body: text, bodyHash: sha256(text), terms: { template: `${t.code} v${t.version}`, pilotDraft: !t.legalReviewed, ...(a.terms ?? {}) },
      changeNote: `Generated from the Unite Industry Club template ${t.title} (version ${t.version})`, authorUserId: ctx.userId!, submittedAt: now, approvedAt: now, approvedBy: ctx.userId!,
      reviewNote: 'Fixed Club template; the values were entered on COLLABIZ. Each party reviews the full text before signing.',
    });
    await tx.insert(clubAgreements).values({ contractId: c.id, type: a.type, templateCode: t.code, templateVersion: t.version, pilotDraft: !t.legalReviewed, fromOrgId: a.fromOrgId, toOrgId: a.toOrgId, productId: a.productId ?? null, variables: a.vars, createdBy: ctx.userId! });
    await this.audit.record(ctx, { action: 'club.agreement_issued', objectType: 'contract', objectId: c.id, after: { type: a.type, template: `${t.code} v${t.version}`, pilotDraft: !t.legalReviewed, to: a.toOrgId } }, tx);
    return { id: c.id, code: ref, pilotDraft: !t.legalReviewed };
  }

  /** Used before product submission and member agreements. */
  async assertTerms(orgId: string) {
    const t = await this.current('club_terms');
    const n = await this.db.$count(agreementAcceptances, and(eq(agreementAcceptances.organizationId, orgId), eq(agreementAcceptances.templateCode, 'club_terms'), eq(agreementAcceptances.version, t.version)));
    if (!n) throw new ForbiddenException(`Accept the Unite Industry Club terms (version ${t.version}) first`);
  }

  async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const ms = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'announcement', title, body: text, link })));
  }

  /** Both parties signed: a brand licence lists its product in the Unite Powertek catalogue. */
  private async executed(contractId: string) {
    const [a] = await this.db.select().from(clubAgreements).where(eq(clubAgreements.contractId, contractId)).limit(1);
    if (!a || a.type !== 'brand_licence' || !a.productId) return;
    const [p] = await this.db.select().from(clubProducts).where(eq(clubProducts.id, a.productId)).limit(1);
    if (!p || p.status !== 'licence_pending' || p.catalogItemId) return; // withdrawn meanwhile, or already listed
    const specs: Record<string, string> = { 'Product line': 'Unite Industry Club', Category: p.category, Brand: p.brandOption === 'unite_powertek' ? 'Unite Powertek' : 'Powered by Unite', 'Club product': p.code, Markets: marketsLabel(p.markets), 'Made in': countryName(p.originCountry) };
    if (p.powerFree && p.powerOffer) specs['Free power option'] = p.powerOffer;
    if (p.certifications.length) specs.Certifications = p.certifications.join(', ');
    if (p.monthlyCapacity) specs['Monthly capacity'] = `${p.monthlyCapacity.toLocaleString('en-IN')}${p.unit ? ` ${p.unit}` : ''}`;
    const [ci] = await this.db.insert(catalogItems).values({
      ownerOrgId: a.fromOrgId, kind: 'product', name: p.brandOption === 'unite_powertek' ? `Unite Powertek ${p.name}` : p.name, sector: p.sector, description: p.description,
      sku: p.code, unit: p.unit ?? null, listPrice: p.mrp ?? null, currency: p.currency, status: 'published', visibility: 'public', specs,
    }).returning({ id: catalogItems.id });
    await this.db.update(clubProducts).set({ status: 'approved', catalogItemId: ci.id, history: sql`history || ${JSON.stringify([{ at: new Date().toISOString(), by: null, status: 'approved', note: 'Brand licence signed by both parties' }])}::jsonb`, updatedAt: new Date() }).where(eq(clubProducts.id, p.id));
    await this.notifyOrg(p.orgId, `${p.name} is now listed`, 'Your brand licence is signed by both parties. The product is in the Unite Powertek catalogue and every COLLABIZ partner can sell it.', '/club/products');
  }
}

@ApiTags('club')
@Controller()
export class ClubAgreementsController {
  constructor(@InjectDb() private db: Db, private legal: ClubLegalService, private audit: AuditService) {}

  private org(ctx: RequestContext) {
    if (!ctx.orgId) throw new ForbiddenException('Create or choose your business account first');
    return ctx.orgId;
  }
  private manager(ctx: RequestContext, orgId: string) {
    return ctx.memberships.some((m) => m.organizationId === orgId && (m.role === 'org_owner' || m.role === 'org_admin'));
  }

  // ------------------------------------------------------------------ Terms and Conditions
  private async termsView() {
    const t = await this.legal.current('club_terms');
    const text = this.legal.render(t, { operator: this.legal.operator() });
    return { t, text, hash: sha256(text) };
  }

  @Public()
  @Get('public/club/terms')
  async publicTerms() {
    const { t, text, hash } = await this.termsView();
    return { title: t.title, version: t.version, body: text, bodyHash: hash, counselApproved: t.legalReviewed, counselApprovedAt: t.legalReviewedAt };
  }

  @Get('club/terms')
  @RequireOrg()
  async terms(@Ctx() ctx: RequestContext) {
    const { t, text, hash } = await this.termsView();
    const [a] = await this.db.select().from(agreementAcceptances).where(and(eq(agreementAcceptances.organizationId, this.org(ctx)), eq(agreementAcceptances.templateCode, 'club_terms'), eq(agreementAcceptances.version, t.version))).limit(1);
    return { title: t.title, version: t.version, body: text, bodyHash: hash, counselApproved: t.legalReviewed, accepted: a ? { by: a.typedName, at: a.acceptedAt } : null, canAccept: this.manager(ctx, ctx.orgId!) };
  }

  @Post('club/terms/accept')
  @RequireOrg()
  @HttpCode(201)
  async accept(@Ctx() ctx: RequestContext, @Body(body(TermsAcceptSchema)) b: z.infer<typeof TermsAcceptSchema>) {
    const orgId = this.org(ctx);
    if (!this.manager(ctx, orgId)) throw new ForbiddenException('The owner or an admin of your business accepts the Club terms');
    const { t, hash } = await this.termsView();
    if (b.version !== t.version) throw new ConflictException('The terms changed since you opened them. Reload and read the current version.');
    const [u] = await this.db.select({ name: users.fullName }).from(users).where(eq(users.id, ctx.userId!)).limit(1);
    if (b.typedName.trim().toLowerCase() !== u.name.trim().toLowerCase()) throw new ConflictException('Type your full name exactly as registered on COLLABIZ');
    const [a] = await this.db.insert(agreementAcceptances).values({ organizationId: orgId, userId: ctx.userId!, templateCode: t.code, version: t.version, typedName: b.typedName, docHash: hash, ip: ctx.ip ?? null }).onConflictDoNothing().returning();
    if (!a) throw new ConflictException('Your business has already accepted this version');
    await this.audit.record(ctx, { action: 'club.terms_accepted', objectType: 'organization', objectId: orgId, after: { version: t.version, docHash: hash, counselApproved: t.legalReviewed } });
    return { accepted: true, version: t.version };
  }

  // ------------------------------------------------------------------ Legal library
  @Public()
  @Get('public/club/legal')
  async library() {
    const ts = await this.db.select().from(agreementTemplates).where(and(eq(agreementTemplates.requiredFor, 'club'), eq(agreementTemplates.status, 'active'))).orderBy(agreementTemplates.code);
    return { items: ts.map((t) => ({ code: t.code, title: t.title, version: t.version, counselApproved: t.legalReviewed, counselApprovedAt: t.legalReviewedAt, body: t.body })), notice: DRAFT_NOTICE };
  }

  @Get('admin/club/templates')
  async templates(@Ctx() ctx: RequestContext) {
    if (!ctx.platformRoles.length) throw new ForbiddenException();
    const ts = await this.db.select().from(agreementTemplates).where(eq(agreementTemplates.requiredFor, 'club')).orderBy(agreementTemplates.code, desc(agreementTemplates.version));
    return { items: ts.map(({ body: _b, ...t }) => t), canApprove: superAdmin(ctx) };
  }

  /** Super admin records that counsel approved this exact version (by hash). Later edits create a new, unapproved version. */
  @Post('admin/club/templates/:code/counsel-approval')
  async counsel(@Ctx() ctx: RequestContext, @Param('code') code: string, @Body(body(CounselApprovalSchema)) b: z.infer<typeof CounselApprovalSchema>) {
    if (!superAdmin(ctx)) throw new ForbiddenException('Only a super admin records counsel approval');
    if (!CLUB_TEMPLATE_CODES.includes(code as ClubTemplateCode)) throw new NotFoundException();
    const t = await this.legal.current(code as ClubTemplateCode);
    if (t.legalReviewed) throw new ConflictException(`Version ${t.version} is already recorded as approved by ${t.legalReviewedBy}`);
    const [u] = await this.db.update(agreementTemplates).set({ legalReviewed: true, legalReviewedBy: b.counsel, legalReviewedAt: new Date(), legalReviewRecordedBy: ctx.userId, legalReviewNote: b.note ?? null }).where(eq(agreementTemplates.id, t.id)).returning();
    await this.audit.record(ctx, { action: 'club.template_counsel_approved', objectType: 'agreement_template', objectId: t.id, after: { code, version: t.version, bodyHash: t.bodyHash, counsel: b.counsel } });
    const { body: _b, ...rest } = u;
    return rest;
  }

  // ------------------------------------------------------------------ Member agreements
  @Get('club/agreements')
  @RequireOrg()
  async mine(@Ctx() ctx: RequestContext) {
    const orgId = this.org(ctx);
    const rows = await this.db.select({ a: clubAgreements, c: contracts }).from(clubAgreements).innerJoin(contracts, eq(contracts.id, clubAgreements.contractId))
      .where(or(eq(clubAgreements.fromOrgId, orgId), eq(clubAgreements.toOrgId, orgId))).orderBy(desc(clubAgreements.createdAt));
    const orgIds = [...new Set(rows.flatMap((r) => [r.a.fromOrgId, r.a.toOrgId]))];
    const names = orgIds.length ? Object.fromEntries((await this.db.select({ id: organizations.id, n: organizations.displayName }).from(organizations).where(inArray(organizations.id, orgIds))).map((o) => [o.id, o.n])) : {};
    const [me] = await this.db.select({ code: collabJoinProfiles.memberCode }).from(collabJoinProfiles).where(eq(collabJoinProfiles.orgId, orgId)).limit(1);
    return {
      memberCode: me?.code ?? null,
      items: rows.map(({ a, c }) => ({
        id: a.id, contractId: c.id, code: c.code, title: c.title, type: a.type, status: c.status, pilotDraft: a.pilotDraft, template: `${a.templateCode} v${a.templateVersion}`,
        direction: a.fromOrgId === orgId ? 'sent' : 'received', otherParty: names[a.fromOrgId === orgId ? a.toOrgId : a.fromOrgId], createdAt: a.createdAt, executedAt: c.executedAt,
      })),
    };
  }

  @Post('club/agreements')
  @RequireOrg()
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(MemberAgreementSchema)) b: MemberAgreementInput) {
    const orgId = this.org(ctx);
    if (!this.manager(ctx, orgId)) throw new ForbiddenException('The owner or an admin of your business creates agreements');
    await this.legal.assertTerms(orgId);
    const [other] = await this.db.select({ orgId: collabJoinProfiles.orgId }).from(collabJoinProfiles).where(eq(collabJoinProfiles.memberCode, b.counterpartyCode)).limit(1);
    if (!other) throw new NotFoundException('No club member has that code. Ask the other business for its club code.');
    if (other.orgId === orgId) throw new ConflictException('Choose another member, not your own business');
    const kind = MEMBER_AGREEMENT_TYPES.find((m) => m.code === b.type)!;
    const [A, B] = await Promise.all([this.legal.party(orgId), this.legal.party(other.orgId)]);
    const common = { dispute: disputeText(b.dispute), termMonths: b.termMonths };
    let vars: Record<string, unknown>;
    if (b.type === 'nda') vars = { ...common, partyA: A, partyB: B, purpose: b.purpose };
    else if (b.type === 'mou') vars = { ...common, partyA: A, partyB: B, purpose: b.purpose, contributionA: b.contributionA, contributionB: b.contributionB, targetDate: b.targetDate };
    else vars = { ...common, principal: A, distributor: B, exclusivity: b.exclusive ? 'exclusive' : 'non-exclusive', territory: marketsLabel(b.territory), products: b.products, currency: b.currency, incoterm: b.incoterm, paymentTerms: b.paymentTerms, minimumTargets: b.minimumTargets ? `4.1 Minimum purchase targets: ${b.minimumTargets}` : 'There are no minimum purchase targets.' };
    const out = await this.legal.issue(ctx, { type: b.type, code: kind.template as ClubTemplateCode, fromOrgId: orgId, toOrgId: other.orgId, title: `${kind.label.replace(/ \(.*\)$/, '')} — ${A.name} and ${B.name}`, vars, terms: { dispute: b.dispute } });
    await this.legal.notifyOrg(other.orgId, `Agreement to review: ${out.code}`, `${A.name} sent you a ${kind.label.toLowerCase()} through the Unite Industry Club. Review the full text before signing.`, `/vault?contract=${out.id}`);
    return out;
  }
}
