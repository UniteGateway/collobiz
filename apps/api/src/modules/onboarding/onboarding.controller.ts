import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Request } from 'express';
import { z } from 'zod';
import {
  AccountTypeSchema, AgreementAcceptSchema, BankTaxSchema, BusinessProfileSchema, CompanyProfileSchema, ConsentSchema, CoverageSchema, DataRequestSchema,
  IndividualProfileSchema, IndustriesSchema, KybDecisionSchema, KybDocMetaSchema, assertTransition, KybMachine, type KybState,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { bankProfiles, consents, dataRequests, kybAssignments, kybDocuments, kybReviews, memberships, organizations, partnerProfiles, riskFlags, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireCaps, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { MailService, MAX_UPLOAD_BYTES } from '../../common/adapters';
import { Idempotent } from '../../common/idempotency';
import { OnboardingService } from './onboarding.service';

type UploadedFileT = { buffer: Buffer; mimetype: string; originalname: string; size: number };

/** Screens 013–022 and 143 (partner onboarding & profile). */
@ApiTags('onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(private svc: OnboardingService) {}

  @Get('status')
  status(@Ctx() ctx: RequestContext) {
    return this.svc.status(ctx);
  }

  @Post('account-type')
  @HttpCode(200)
  accountType(@Ctx() ctx: RequestContext, @Body(body(AccountTypeSchema)) b: z.infer<typeof AccountTypeSchema>) {
    return this.svc.chooseAccountType(ctx, b.kind, b.partnerTypes);
  }

  @Put('individual')
  @RequireOrg()
  individual(@Ctx() ctx: RequestContext, @Body(body(IndividualProfileSchema)) b: z.infer<typeof IndividualProfileSchema>) {
    if (ctx.orgType !== 'partner_individual') throw new BadRequestException('This account is registered as a company');
    return this.svc.saveIndividual(ctx, b);
  }

  @Put('company')
  @RequireOrg()
  company(@Ctx() ctx: RequestContext, @Body(body(CompanyProfileSchema)) b: z.infer<typeof CompanyProfileSchema>) {
    if (ctx.orgType !== 'partner_company') throw new BadRequestException('This account is registered as an individual');
    return this.svc.saveCompany(ctx, b);
  }

  @Put('industries')
  @RequireOrg()
  industries(@Ctx() ctx: RequestContext, @Body(body(IndustriesSchema)) b: z.infer<typeof IndustriesSchema>) {
    return this.svc.saveIndustries(ctx, b);
  }

  @Put('coverage')
  @RequireOrg()
  coverage(@Ctx() ctx: RequestContext, @Body(body(CoverageSchema)) b: z.infer<typeof CoverageSchema>) {
    return this.svc.saveCoverage(ctx, b);
  }

  @Put('profile')
  @RequireOrg()
  profile(@Ctx() ctx: RequestContext, @Body(body(BusinessProfileSchema)) b: z.infer<typeof BusinessProfileSchema>) {
    return this.svc.saveProfile(ctx, b);
  }

  @Get('kyb/documents')
  @RequireOrg()
  documents(@Ctx() ctx: RequestContext) {
    return this.svc.documents(ctx);
  }

  @Post('kyb/documents')
  @RequireOrg()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(@Ctx() ctx: RequestContext, @UploadedFile() file: UploadedFileT, @Body() raw: Record<string, string>) {
    const meta = body(KybDocMetaSchema).transform(raw);
    return this.svc.uploadDocument(ctx, meta.docType, file);
  }

  @Delete('kyb/documents/:id')
  @RequireOrg()
  remove(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.removeDocument(ctx, id);
  }

  @Get('kyb/documents/:id/url')
  @RequireOrg()
  url(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.documentUrl(ctx, id, ctx.orgId);
  }

  @Get('bank-tax')
  @RequireOrg()
  bank(@Ctx() ctx: RequestContext) {
    return this.svc.bankTax(ctx.orgId!);
  }

  @Put('bank-tax')
  @RequireOrg()
  saveBank(@Ctx() ctx: RequestContext, @Body(body(BankTaxSchema)) b: z.infer<typeof BankTaxSchema>) {
    return this.svc.saveBankTax(ctx, b);
  }

  @Get('agreements')
  agreements(@Ctx() ctx: RequestContext) {
    return this.svc.requiredAgreements(ctx.orgId);
  }

  @Post('agreements/accept')
  @RequireOrg()
  @HttpCode(201)
  accept(@Ctx() ctx: RequestContext, @Body(body(AgreementAcceptSchema)) b: z.infer<typeof AgreementAcceptSchema>, @Req() req: Request) {
    return this.svc.acceptAgreement(ctx, b, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Post('submit')
  @RequireOrg()
  @Idempotent()
  @HttpCode(200)
  submit(@Ctx() ctx: RequestContext) {
    return this.svc.submit(ctx);
  }
}

@ApiTags('onboarding')
@Controller('profile')
export class ProfileController {
  constructor(private svc: OnboardingService) {}
  /** Screen 143 — My Partner Profile. */
  @Get()
  @RequireOrg()
  mine(@Ctx() ctx: RequestContext) {
    return this.svc.myProfile(ctx);
  }
}

/** Screen 130 — Partner Verification Queue; screen 022 admin side (decision with reasons, previous values, actor/time). */
@ApiTags('admin')
@Controller('admin/verification')
export class AdminVerificationController {
  constructor(@InjectDb() private db: Db, private svc: OnboardingService, private audit: AuditService, private mail: MailService) {}

  @Get('queue')
  @RequireCaps('kyb.review')
  async queue(@Query('status') status = 'submitted,under_review') {
    const statuses = status.split(',').filter(Boolean);
    const rows = await this.db.select({
      id: organizations.id, legalName: organizations.legalName, displayName: organizations.displayName, type: organizations.type, country: organizations.country, city: organizations.city,
      verificationStatus: organizations.verificationStatus, partnerTypes: organizations.partnerTypes, updatedAt: organizations.updatedAt,
      reviewerId: kybAssignments.reviewerId, reviewerName: users.fullName,
      openFlags: sql<number>`(select count(*)::int from risk_flags f where f.organization_id = ${organizations.id} and f.status = 'open')`,
      submittedAt: sql<string>`(select max(created_at) from kyb_reviews r where r.organization_id = ${organizations.id} and r.to_status = 'submitted')`,
    }).from(organizations)
      .leftJoin(kybAssignments, eq(kybAssignments.organizationId, organizations.id)).leftJoin(users, eq(users.id, kybAssignments.reviewerId))
      .where(inArray(organizations.verificationStatus, statuses)).orderBy(asc(organizations.updatedAt));
    return rows;
  }

  @Get(':orgId')
  @RequireCaps('kyb.review')
  async dossier(@Param('orgId', ParseUUIDPipe) orgId: string) {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) throw new NotFoundException();
    const [p] = await this.db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, orgId)).limit(1);
    const docs = await this.db.select().from(kybDocuments).where(and(eq(kybDocuments.organizationId, orgId), sql`${kybDocuments.status} <> 'superseded'`)).orderBy(desc(kybDocuments.createdAt));
    const owners = await this.db.select({ id: users.id, fullName: users.fullName, email: users.email, role: memberships.role, emailVerified: sql<boolean>`${users.emailVerifiedAt} is not null` })
      .from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    const history = await this.db.select({ at: kybReviews.createdAt, from: kybReviews.fromStatus, to: kybReviews.toStatus, reason: kybReviews.reason, riskLevel: kybReviews.riskLevel, actor: users.fullName })
      .from(kybReviews).leftJoin(users, eq(users.id, kybReviews.actorUserId)).where(eq(kybReviews.organizationId, orgId)).orderBy(desc(kybReviews.createdAt));
    const flags = await this.db.select().from(riskFlags).where(eq(riskFlags.organizationId, orgId)).orderBy(desc(riskFlags.createdAt));
    const [assignment] = await this.db.select().from(kybAssignments).where(eq(kybAssignments.organizationId, orgId)).limit(1);
    const { panEnc: _x, ...profile } = p ?? ({} as typeof partnerProfiles.$inferSelect);
    return {
      organization: org, profile: p ? { ...profile, panMasked: p.panLast4 ? `••••••${p.panLast4}` : null } : null, people: owners,
      documents: docs.map((d) => ({ id: d.id, docType: d.docType, fileName: d.fileName, size: d.size, mime: d.mime, sha256: d.sha256, status: d.status, reviewNote: d.reviewNote, createdAt: d.createdAt })),
      bankTax: await this.svc.bankTax(orgId), agreements: (await this.svc.requiredAgreements(orgId)).map(({ body: _b, ...a }) => a), history, flags, assignment: assignment ?? null,
    };
  }

  @Get('documents/:docId/url')
  @RequireCaps('kyb.review')
  docUrl(@Ctx() ctx: RequestContext, @Param('docId', ParseUUIDPipe) docId: string) {
    return this.svc.documentUrl(ctx, docId, null);
  }

  /** Claim for review: submitted → under_review, reviewer assigned. */
  @Post(':orgId/claim')
  @RequireCaps('kyb.review')
  @HttpCode(200)
  async claim(@Ctx() ctx: RequestContext, @Param('orgId', ParseUUIDPipe) orgId: string) {
    const org = await this.assertNotOwnOrg(ctx, orgId);
    const from = org.verificationStatus as KybState;
    if (from !== 'under_review') {
      assertTransition(KybMachine, from, 'under_review');
      await this.db.update(organizations).set({ verificationStatus: 'under_review', updatedAt: new Date() }).where(eq(organizations.id, orgId));
      await this.db.insert(kybReviews).values({ organizationId: orgId, fromStatus: from, toStatus: 'under_review', actorUserId: ctx.userId });
    }
    await this.db.insert(kybAssignments).values({ organizationId: orgId, reviewerId: ctx.userId }).onConflictDoUpdate({ target: kybAssignments.organizationId, set: { reviewerId: ctx.userId, claimedAt: new Date() } });
    await this.audit.record(ctx, { action: 'kyb.claimed', objectType: 'organization', objectId: orgId, before: { verificationStatus: from }, after: { verificationStatus: 'under_review', reviewer: ctx.userId } });
    return { status: 'under_review' };
  }

  @Post('documents/:docId/review')
  @RequireCaps('kyb.review')
  @HttpCode(200)
  async reviewDoc(@Ctx() ctx: RequestContext, @Param('docId', ParseUUIDPipe) docId: string, @Body(body(z.object({ status: z.enum(['accepted', 'rejected']), note: z.string().trim().max(1000).optional() }).refine((v) => v.status === 'accepted' || (v.note?.length ?? 0) >= 5, { message: 'Explain why the document is rejected', path: ['note'] }))) b: { status: string; note?: string }) {
    const [d] = await this.db.select().from(kybDocuments).where(eq(kybDocuments.id, docId)).limit(1);
    if (!d) throw new NotFoundException();
    await this.assertNotOwnOrg(ctx, d.organizationId);
    await this.db.update(kybDocuments).set({ status: b.status, reviewNote: b.note ?? null }).where(eq(kybDocuments.id, docId));
    await this.audit.record(ctx, { action: `kyb.document_${b.status}`, objectType: 'kyb_document', objectId: docId, organizationId: d.organizationId, reason: b.note, before: { status: d.status }, after: { status: b.status } });
    return { id: docId, status: b.status };
  }

  /** Verified / rejected / re-upload requested — reason mandatory; no self-approval (§4.3, §7.4). */
  @Post(':orgId/decision')
  @RequireCaps('kyb.review')
  @Idempotent()
  @HttpCode(200)
  async decide(@Ctx() ctx: RequestContext, @Param('orgId', ParseUUIDPipe) orgId: string, @Body(body(KybDecisionSchema)) b: z.infer<typeof KybDecisionSchema>) {
    const org = await this.assertNotOwnOrg(ctx, orgId);
    const from = org.verificationStatus as KybState;
    assertTransition(KybMachine, from, b.decision);
    if (b.decision === 'verified') {
      const docs = await this.db.select().from(kybDocuments).where(and(eq(kybDocuments.organizationId, orgId), sql`${kybDocuments.status} <> 'superseded'`));
      if (docs.some((d) => d.status !== 'accepted')) throw new BadRequestException('Accept or reject every document before verifying');
      const open = await this.db.select({ id: riskFlags.id }).from(riskFlags).where(and(eq(riskFlags.organizationId, orgId), eq(riskFlags.status, 'open'), eq(riskFlags.severity, 'high')));
      if (open.length) throw new BadRequestException('Clear open high-severity risk flags before verifying');
    }
    const before = { verificationStatus: from, membershipLevel: org.membershipLevel };
    const after = { verificationStatus: b.decision, membershipLevel: b.decision === 'verified' && org.membershipLevel === 'registered' ? 'verified' : org.membershipLevel };
    await this.db.transaction(async (tx) => {
      await tx.update(organizations).set({ ...after, updatedAt: new Date() }).where(eq(organizations.id, orgId));
      await tx.insert(kybReviews).values({ organizationId: orgId, fromStatus: from, toStatus: b.decision, reason: b.reason, riskLevel: b.riskLevel, actorUserId: ctx.userId });
      if (b.decision === 'verified') await tx.update(bankProfiles).set({ verified: true }).where(eq(bankProfiles.organizationId, orgId));
      await tx.delete(kybAssignments).where(eq(kybAssignments.organizationId, orgId));
      await this.audit.record(ctx, { action: `kyb.${b.decision}`, objectType: 'organization', objectId: orgId, reason: b.reason, before, after }, tx as unknown as Db);
    });
    const owners = await this.db.select({ email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.organizationId, orgId), eq(memberships.role, 'org_owner')));
    for (const o of owners) await this.mail.send('email', o.email, `COLLABIZ verification: ${b.decision.replace('_', ' ')}`, `Your partner verification status is now "${b.decision}". Note from reviewer: ${b.reason}`);
    return { organizationId: orgId, ...after };
  }

  private async assertNotOwnOrg(ctx: RequestContext, orgId: string) {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) throw new NotFoundException();
    if (ctx.memberships.some((m) => m.organizationId === orgId)) throw new ForbiddenException('You cannot review an organization you belong to');
    return org;
  }
}

/** Screen 131 — Partner Risk & Compliance Review (+ data-rights queue). */
@ApiTags('admin')
@Controller('admin/risk')
export class AdminRiskController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  @Get()
  @RequireCaps('kyb.review')
  async overview(@Query('status') status = 'open') {
    const flags = await this.db.select({ id: riskFlags.id, organizationId: riskFlags.organizationId, orgName: organizations.displayName, verificationStatus: organizations.verificationStatus, kind: riskFlags.kind, severity: riskFlags.severity, note: riskFlags.note, source: riskFlags.source, status: riskFlags.status, createdAt: riskFlags.createdAt, clearNote: riskFlags.clearNote })
      .from(riskFlags).innerJoin(organizations, eq(organizations.id, riskFlags.organizationId)).where(status === 'all' ? undefined : eq(riskFlags.status, status)).orderBy(desc(riskFlags.createdAt));
    const [counts] = await this.db.execute<{ high: number; medium: number; low: number; orgs: number }>(sql`select
      count(*) filter (where severity='high')::int as high, count(*) filter (where severity='medium')::int as medium, count(*) filter (where severity='low')::int as low,
      count(distinct organization_id)::int as orgs from risk_flags where status='open'`).then((r) => r.rows);
    return { counts, flags };
  }

  @Post('flags')
  @RequireCaps('kyb.review')
  @HttpCode(201)
  async flag(@Ctx() ctx: RequestContext, @Body(body(z.object({ organizationId: z.string().uuid(), kind: z.enum(['sanctions_screen', 'document_mismatch', 'adverse_media', 'duplicate_tax_id', 'manual']), severity: z.enum(['low', 'medium', 'high']), note: z.string().trim().min(5).max(2000) }))) b: { organizationId: string; kind: string; severity: string; note: string }) {
    const [f] = await this.db.insert(riskFlags).values({ ...b, source: 'manual', createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'risk.flag_raised', objectType: 'organization', objectId: b.organizationId, reason: b.note, after: { kind: b.kind, severity: b.severity } });
    return f;
  }

  @Post('flags/:id/clear')
  @RequireCaps('kyb.review')
  @HttpCode(200)
  async clear(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ note: z.string().trim().min(5).max(2000) }))) b: { note: string }) {
    const [f] = await this.db.select().from(riskFlags).where(eq(riskFlags.id, id)).limit(1);
    if (!f || f.status !== 'open') throw new NotFoundException('Open flag not found');
    if (f.createdBy === ctx.userId) throw new ForbiddenException('A different reviewer must clear a flag you raised');
    await this.db.update(riskFlags).set({ status: 'cleared', clearedBy: ctx.userId, clearNote: b.note, clearedAt: new Date() }).where(eq(riskFlags.id, id));
    await this.audit.record(ctx, { action: 'risk.flag_cleared', objectType: 'organization', objectId: f.organizationId, reason: b.note, before: { status: 'open' }, after: { status: 'cleared' } });
    return { id, status: 'cleared' };
  }

  @Get('data-requests')
  @RequireCaps('kyb.review')
  requests() {
    return this.db.select({ id: dataRequests.id, kind: dataRequests.kind, details: dataRequests.details, status: dataRequests.status, dueAt: dataRequests.dueAt, createdAt: dataRequests.createdAt, legalHold: dataRequests.legalHold, email: users.email, fullName: users.fullName })
      .from(dataRequests).innerJoin(users, eq(users.id, dataRequests.userId)).orderBy(asc(dataRequests.dueAt));
  }

  @Post('data-requests/:id/resolve')
  @RequireCaps('kyb.review')
  @HttpCode(200)
  async resolve(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ status: z.enum(['in_progress', 'completed', 'rejected']), resolution: z.string().trim().min(5).max(2000), legalHold: z.boolean().default(false) }))) b: { status: string; resolution: string; legalHold: boolean }) {
    const [r] = await this.db.select().from(dataRequests).where(eq(dataRequests.id, id)).limit(1);
    if (!r) throw new NotFoundException();
    if (r.userId === ctx.userId) throw new ForbiddenException('You cannot resolve your own data request');
    await this.db.update(dataRequests).set({ status: b.status, resolution: b.resolution, legalHold: b.legalHold, resolvedBy: ctx.userId, resolvedAt: b.status === 'in_progress' ? null : new Date() }).where(eq(dataRequests.id, id));
    await this.audit.record(ctx, { action: `privacy.request_${b.status}`, objectType: 'data_request', objectId: id, reason: b.resolution, before: { status: r.status }, after: { status: b.status, legalHold: b.legalHold } });
    return { id, status: b.status };
  }
}

/** Screen 149 — Privacy, Consent & Data Rights. */
@ApiTags('privacy')
@Controller('privacy')
export class PrivacyController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  @Get('consents')
  async consents(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select().from(consents).where(eq(consents.userId, ctx.userId)).orderBy(desc(consents.createdAt));
    const purposes = ['matching', 'marketing', 'analytics', 'data_sharing'] as const;
    const defaults: Record<string, boolean> = { matching: true, marketing: false, analytics: false, data_sharing: false };
    return {
      current: purposes.map((p) => ({ purpose: p, granted: rows.find((r) => r.purpose === p)?.granted ?? defaults[p], updatedAt: rows.find((r) => r.purpose === p)?.createdAt ?? null })),
      history: rows.slice(0, 50),
    };
  }

  @Post('consents')
  @HttpCode(201)
  async setConsent(@Ctx() ctx: RequestContext, @Body(body(ConsentSchema)) b: z.infer<typeof ConsentSchema>) {
    const [c] = await this.db.insert(consents).values({ userId: ctx.userId, purpose: b.purpose, granted: b.granted }).returning();
    if (b.purpose === 'matching' && ctx.orgId && ctx.orgRoles.includes('org_owner')) {
      await this.db.update(partnerProfiles).set({ consentToMatch: b.granted }).where(eq(partnerProfiles.organizationId, ctx.orgId));
    }
    await this.audit.record(ctx, { action: 'privacy.consent_changed', objectType: 'user', objectId: ctx.userId, after: b });
    return c;
  }

  @Get('requests')
  requests(@Ctx() ctx: RequestContext) {
    return this.db.select().from(dataRequests).where(eq(dataRequests.userId, ctx.userId)).orderBy(desc(dataRequests.createdAt));
  }

  @Post('requests')
  @HttpCode(201)
  async request(@Ctx() ctx: RequestContext, @Body(body(DataRequestSchema)) b: z.infer<typeof DataRequestSchema>) {
    const open = await this.db.select({ id: dataRequests.id }).from(dataRequests).where(and(eq(dataRequests.userId, ctx.userId), eq(dataRequests.kind, b.kind), inArray(dataRequests.status, ['open', 'in_progress'])));
    if (open.length) throw new BadRequestException('You already have an open request of this kind');
    const [r] = await this.db.insert(dataRequests).values({ userId: ctx.userId, kind: b.kind, details: b.details, dueAt: new Date(Date.now() + 30 * 86400_000) }).returning();
    await this.audit.record(ctx, { action: 'privacy.request_created', objectType: 'data_request', objectId: r.id, after: { kind: b.kind } });
    return r;
  }

  /** Immediate machine-readable export of the caller's own personal data (export right). */
  @Get('export')
  async export(@Ctx() ctx: RequestContext) {
    const [u] = await this.db.select({ id: users.id, email: users.email, fullName: users.fullName, phone: users.phone, locale: users.locale, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.id, ctx.userId));
    const ms = await this.db.select({ organization: organizations.displayName, role: memberships.role, status: memberships.status, since: memberships.createdAt }).from(memberships).innerJoin(organizations, eq(organizations.id, memberships.organizationId)).where(eq(memberships.userId, ctx.userId));
    const cs = await this.db.select().from(consents).where(eq(consents.userId, ctx.userId));
    await this.audit.record(ctx, { action: 'privacy.export_downloaded', objectType: 'user', objectId: ctx.userId });
    return { generatedAt: new Date().toISOString(), user: u, memberships: ms, consents: cs };
  }
}
