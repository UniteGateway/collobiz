/**
 * Stage 09 — Tenders, RFQs and sealed bids (screens 065–071, 073, 137).
 *
 * Gate: sealed-bid boundaries and evaluator controls.
 *  - Both bid envelopes are AES-256-GCM encrypted at rest and committed with a SHA-256 seal at submission.
 *    Nobody — issuer, evaluators or platform staff — can read bid content before the tender is opened,
 *    and opening is only possible after the closing time.
 *  - Technical envelopes are revealed first, to technical evaluators and the issuer. Commercial envelopes are
 *    revealed only after technical evaluation is complete, and only for technically qualified bids.
 *  - Evaluators must belong to the issuing organization, may not belong to any bidding organization, and can only
 *    score the envelope kinds they are assigned. Each evaluator scores each bid once.
 *  - Platform administrators see tender metadata and counts only, never bid content.
 */
import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  assertTransition, AwardSchema, BidDraftSchema, BidMachine, EvaluatorSchema, MEMBERSHIP_LEVELS, NegotiationSchema, ScoreSchema, ShortlistSchema, TenderCancelSchema, TenderCreateSchema, TenderMachine,
  type BidState, type TenderState,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { auditEvents, bidScores, bids, memberships, negotiationMessages, notifications, organizations, partnerProfiles, tenderDocuments, tenderEvaluators, tenders, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireCaps, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { decryptField, encryptField, randomDigits, sha256 } from '../../common/crypto';
import { Idempotent } from '../../common/idempotency';
import { MAX_UPLOAD_BYTES, StorageService } from '../../common/adapters';

type Tender = typeof tenders.$inferSelect;
type Bid = typeof bids.$inferSelect;
type Role = 'issuer' | 'evaluator' | 'bidder' | 'admin';
type Technical = z.infer<typeof BidDraftSchema>['technical'];
type Commercial = z.infer<typeof BidDraftSchema>['commercial'];

const SEALED_OR_LATER: BidState[] = ['submitted', 'opened', 'technically_qualified', 'disqualified', 'shortlisted', 'awarded', 'not_awarded'];
const EVALUATED: TenderState[] = ['technical_evaluation', 'commercial_evaluation', 'negotiation', 'awarded'];
const COMMERCIAL_OPEN: TenderState[] = ['commercial_evaluation', 'negotiation', 'awarded'];
const QUALIFIED: BidState[] = ['technically_qualified', 'shortlisted', 'awarded', 'not_awarded'];
const levelIdx = (l: string | null | undefined) => (l ? MEMBERSHIP_LEVELS.indexOf(l as (typeof MEMBERSHIP_LEVELS)[number]) : -1);
const seal = (tenderId: string, orgId: string, technical: unknown, commercial: unknown) => sha256(JSON.stringify({ tenderId, orgId, technical, commercial }));
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

@Injectable()
export class TendersService {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  async load(id: string) {
    const [t] = await this.db.select().from(tenders).where(eq(tenders.id, id)).limit(1);
    if (!t) throw new NotFoundException('Tender not found');
    return t;
  }
  evaluators(tenderId: string) {
    return this.db.select({ e: tenderEvaluators, name: users.fullName }).from(tenderEvaluators).innerJoin(users, eq(users.id, tenderEvaluators.userId)).where(eq(tenderEvaluators.tenderId, tenderId));
  }
  isIssuer(ctx: RequestContext, t: Tender) {
    return ctx.memberships.some((m) => m.organizationId === t.issuerOrgId);
  }
  isIssuerAdmin(ctx: RequestContext, t: Tender) {
    return ctx.orgId === t.issuerOrgId && ctx.caps.has('tender.issue');
  }
  assertIssuerAdmin(ctx: RequestContext, t: Tender) {
    if (!this.isIssuerAdmin(ctx, t)) throw new ForbiddenException('Only the issuing organization’s tender managers can do this');
  }
  /** Resolves the caller's role on a tender; anyone without a role gets 404 (no existence leak). */
  async role(ctx: RequestContext, t: Tender): Promise<{ role: Role; evaluator: typeof tenderEvaluators.$inferSelect | null }> {
    const [ev] = await this.db.select().from(tenderEvaluators).where(and(eq(tenderEvaluators.tenderId, t.id), eq(tenderEvaluators.userId, ctx.userId))).limit(1);
    if (ev) return { role: 'evaluator', evaluator: ev };
    if (this.isIssuer(ctx, t)) return { role: 'issuer', evaluator: null };
    if (t.status !== 'draft' && ctx.orgId && (ctx.orgType === 'partner_company' || ctx.orgType === 'partner_individual') && ctx.orgVerificationStatus === 'verified') {
      if (t.status === 'published') return { role: 'bidder', evaluator: null };
      // After closing, only organizations that actually bid can still see the tender.
      const [b] = await this.db.select({ id: bids.id }).from(bids).where(and(eq(bids.tenderId, t.id), eq(bids.organizationId, ctx.orgId))).limit(1);
      if (b) return { role: 'bidder', evaluator: null };
    }
    if (ctx.platformRoles.length && ctx.caps.has('tender.evaluate')) return { role: 'admin', evaluator: null };
    throw new NotFoundException('Tender not found');
  }
  async setTender(ctx: RequestContext, t: Tender, to: TenderState, reason: string | undefined, extra: Partial<Tender> = {}, tx: Db = this.db) {
    assertTransition(TenderMachine, t.status as TenderState, to);
    const [u] = await tx.update(tenders).set({ ...extra, status: to, version: t.version + 1, updatedAt: new Date() }).where(and(eq(tenders.id, t.id), eq(tenders.version, t.version))).returning();
    if (!u) throw new ConflictException('The tender was changed concurrently. Reload and try again.');
    await this.audit.record(ctx, { action: `tender.${to}`, objectType: 'tender', objectId: t.id, reason, before: { status: t.status }, after: { status: to } }, tx);
    return u;
  }
  async setBid(ctx: RequestContext, b: Bid, to: BidState, extra: Partial<Bid> = {}, tx: Db = this.db) {
    assertTransition(BidMachine, b.status as BidState, to);
    const [u] = await tx.update(bids).set({ ...extra, status: to, version: b.version + 1, updatedAt: new Date() }).where(and(eq(bids.id, b.id), eq(bids.version, b.version))).returning();
    if (!u) throw new ConflictException('The bid was changed concurrently. Reload and try again.');
    await this.audit.record(ctx, { action: `bid.${to}`, objectType: 'bid', objectId: b.id, before: { status: b.status }, after: { status: to, tenderId: b.tenderId } }, tx);
    return u;
  }
  /** Bidding is open while published and before the closing time (a passed deadline closes bidding even before the issuer clicks Close). */
  biddingOpen(t: Tender) {
    return t.status === 'published' && t.closesAt.getTime() > Date.now();
  }
  async eligibility(ctx: RequestContext, t: Tender) {
    const [o] = await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId!)).limit(1);
    const [p] = await this.db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, ctx.orgId!)).limit(1);
    const el = t.eligibility as { minLevel?: string; sectors?: string[]; certifications?: string[] };
    const evUsers = (await this.evaluators(t.id)).map((e) => e.e.userId);
    const conflicted = evUsers.length ? await this.db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.organizationId, ctx.orgId!), inArray(memberships.userId, evUsers), eq(memberships.status, 'active'))).limit(1) : [];
    const checks = [
      { key: 'verified', label: 'Verified partner organization', ok: o?.verificationStatus === 'verified' && (o.type === 'partner_company' || o.type === 'partner_individual'), detail: o?.verificationStatus ?? 'unknown' },
      { key: 'not_issuer', label: 'Not the issuing organization', ok: ctx.orgId !== t.issuerOrgId, detail: ctx.orgId === t.issuerOrgId ? 'You issued this tender' : 'OK' },
      { key: 'level', label: `Membership level ${el.minLevel ?? 'registered'} or higher`, ok: levelIdx(o?.membershipLevel) >= levelIdx(el.minLevel ?? 'registered'), detail: o?.membershipLevel ?? 'none' },
      { key: 'sector', label: el.sectors?.length ? `Works in ${el.sectors.join(', ')}` : 'Any sector', ok: !el.sectors?.length || (p?.sectors ?? []).some((s) => el.sectors!.includes(s)), detail: (p?.sectors ?? []).join(', ') || 'No sectors on profile' },
      ...(el.certifications ?? []).map((c) => ({ key: `cert:${c}`, label: `Certification: ${c}`, ok: (p?.certifications ?? []).includes(c), detail: (p?.certifications ?? []).includes(c) ? 'On profile' : 'Missing from profile' })),
      { key: 'no_conflict', label: 'No evaluator conflict of interest', ok: conflicted.length === 0, detail: conflicted.length ? 'A member of your organization is an evaluator on this tender' : 'OK' },
    ];
    return { eligible: checks.every((c) => c.ok), checks };
  }
  async notifyOrg(orgId: string, title: string, bodyText: string, link: string, tx: Db = this.db) {
    const ms = await tx.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    for (const m of ms) await tx.insert(notifications).values({ userId: m.userId, kind: 'tender', title, body: bodyText, link });
  }
  sealedBids(tenderId: string) {
    return this.db.select({ b: bids, org: organizations.displayName }).from(bids).innerJoin(organizations, eq(organizations.id, bids.organizationId))
      .where(and(eq(bids.tenderId, tenderId), inArray(bids.status, SEALED_OR_LATER.filter((s) => s !== 'submitted')))).orderBy(asc(bids.submittedAt));
  }
  scores(tenderId: string) {
    return this.db.select({ s: bidScores, name: users.fullName }).from(bidScores).innerJoin(bids, eq(bids.id, bidScores.bidId)).innerJoin(users, eq(users.id, bidScores.evaluatorUserId)).where(eq(bids.tenderId, tenderId));
  }
  /** Latest price for a bid: the most recent revised amount from negotiation, or the sealed commercial amount. */
  async finalAmount(b: Bid) {
    const [m] = await this.db.select({ a: negotiationMessages.revisedAmount }).from(negotiationMessages).where(and(eq(negotiationMessages.bidId, b.id), sql`${negotiationMessages.revisedAmount} is not null`)).orderBy(desc(negotiationMessages.createdAt)).limit(1);
    const c = JSON.parse(decryptField(b.commercialEnc)) as Commercial;
    return { sealed: c.amount, final: m?.a ?? c.amount };
  }
}

function publicTender(t: Tender) {
  const { version: _v, createdBy: _c, ...rest } = t;
  return rest;
}

@ApiTags('tenders')
@Controller('tenders')
@RequireOrg()
export class TendersController {
  constructor(@InjectDb() private db: Db, private svc: TendersService, private audit: AuditService, private storage: StorageService) {}

  /** 065 — dashboard: tenders I issue, tenders open for bidding, my bids, and tenders I evaluate. */
  @Get()
  async dashboard(@Ctx() ctx: RequestContext) {
    const issued = await this.db.select({ t: tenders, bids: sql<number>`(select count(*)::int from bids b where b.tender_id = ${tenders.id} and b.status <> 'withdrawn' and b.status <> 'draft')` })
      .from(tenders).where(eq(tenders.issuerOrgId, ctx.orgId!)).orderBy(desc(tenders.createdAt));
    const evalRows = await this.db.select({ t: tenders, role: tenderEvaluators.role }).from(tenderEvaluators).innerJoin(tenders, eq(tenders.id, tenderEvaluators.tenderId)).where(eq(tenderEvaluators.userId, ctx.userId)).orderBy(desc(tenders.closesAt));
    const isPartner = ctx.orgType === 'partner_company' || ctx.orgType === 'partner_individual';
    const open = isPartner && ctx.orgVerificationStatus === 'verified'
      ? await this.db.select({ t: tenders, issuer: organizations.displayName }).from(tenders).innerJoin(organizations, eq(organizations.id, tenders.issuerOrgId))
        .where(and(eq(tenders.status, 'published'), ne(tenders.issuerOrgId, ctx.orgId!), sql`${tenders.closesAt} > now()`)).orderBy(asc(tenders.closesAt)).limit(100)
      : [];
    const mine = await this.db.select({ b: bids, t: tenders }).from(bids).innerJoin(tenders, eq(tenders.id, bids.tenderId)).where(eq(bids.organizationId, ctx.orgId!)).orderBy(desc(bids.updatedAt));
    return {
      issued: issued.map((r) => ({ ...publicTender(r.t), bidCount: r.bids })),
      open: open.map((r) => ({ ...publicTender(r.t), issuer: r.issuer, myBid: mine.find((m) => m.b.tenderId === r.t.id && m.b.status !== 'withdrawn')?.b.status ?? null })),
      myBids: mine.map((r) => ({ id: r.b.id, status: r.b.status, submittedAt: r.b.submittedAt, tender: { id: r.t.id, code: r.t.code, title: r.t.title, status: r.t.status, closesAt: r.t.closesAt } })),
      evaluating: evalRows.map((r) => ({ ...publicTender(r.t), evaluatorRole: r.role })),
    };
  }

  /** 066 — create a draft tender / work package. */
  @Post()
  @RequireCaps('tender.issue')
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(TenderCreateSchema)) b: z.infer<typeof TenderCreateSchema>) {
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Only verified organizations can issue tenders');
    if (b.techWeight < 0 || b.techWeight > 100) throw new BadRequestException('Technical weight must be between 0 and 100');
    const code = `TND-${new Date().getUTCFullYear()}-${randomDigits(6)}`;
    const [t] = await this.db.insert(tenders).values({ ...b, code, issuerOrgId: ctx.orgId!, closesAt: new Date(b.closesAt), createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'tender.created', objectType: 'tender', objectId: t.id, after: { code, title: t.title } });
    return publicTender(t);
  }

  @Patch(':id')
  @RequireCaps('tender.issue')
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(TenderCreateSchema.partial())) b: Partial<z.infer<typeof TenderCreateSchema>>) {
    const t = await this.svc.load(id);
    this.svc.assertIssuerAdmin(ctx, t);
    if (t.status !== 'draft') throw new ConflictException('Published tenders cannot be edited. Upload an addendum document instead.');
    const [u] = await this.db.update(tenders).set({ ...b, closesAt: b.closesAt ? new Date(b.closesAt) : undefined, version: t.version + 1, updatedAt: new Date() }).where(and(eq(tenders.id, id), eq(tenders.version, t.version))).returning();
    if (!u) throw new ConflictException('The tender was changed concurrently. Reload and try again.');
    await this.audit.record(ctx, { action: 'tender.updated', objectType: 'tender', objectId: id, after: Object.keys(b) });
    return publicTender(u);
  }

  /** 066 → publish. Requires a future closing time, a scope document, and both technical and commercial evaluators. */
  @Post(':id/publish')
  @RequireCaps('tender.issue')
  @HttpCode(200)
  async publish(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    this.svc.assertIssuerAdmin(ctx, t);
    const problems: string[] = [];
    if (t.closesAt.getTime() < Date.now() + 60 * 60 * 1000) problems.push('The closing time must be at least one hour from now');
    const docs = await this.db.select({ id: tenderDocuments.id }).from(tenderDocuments).where(eq(tenderDocuments.tenderId, id)).limit(1);
    if (!docs.length) problems.push('Upload at least one tender document');
    const evs = await this.svc.evaluators(id);
    if (!evs.some((e) => e.e.role !== 'commercial')) problems.push('Assign at least one technical evaluator');
    if (!evs.some((e) => e.e.role !== 'technical')) problems.push('Assign at least one commercial evaluator');
    if (problems.length) throw new BadRequestException({ message: 'This tender is not ready to publish', problems });
    const u = await this.svc.setTender(ctx, t, 'published', undefined, { publishedAt: new Date() });
    return publicTender(u);
  }

  /** Tender detail, shaped for the caller's role. */
  @Get(':id')
  async detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    const { role, evaluator } = await this.svc.role(ctx, t);
    const [issuer] = await this.db.select({ name: organizations.displayName }).from(organizations).where(eq(organizations.id, t.issuerOrgId));
    const counts = await this.db.select({ status: bids.status, n: sql<number>`count(*)::int` }).from(bids).where(eq(bids.tenderId, id)).groupBy(bids.status);
    const submitted = counts.filter((c) => SEALED_OR_LATER.includes(c.status as BidState)).reduce((a, c) => a + c.n, 0);
    const out: Record<string, unknown> = { ...publicTender(t), issuer: issuer?.name, role, evaluatorRole: evaluator?.role ?? null, biddingOpen: this.svc.biddingOpen(t), bidCount: submitted, canManage: this.svc.isIssuerAdmin(ctx, t) };
    if (role === 'issuer' || role === 'admin' || role === 'evaluator') {
      out.evaluators = (await this.svc.evaluators(id)).map((e) => ({ id: e.e.id, userId: e.e.userId, name: e.name, role: e.e.role }));
      out.version = t.version;
    }
    if (role === 'bidder') {
      out.eligibility = await this.svc.eligibility(ctx, t);
      const [mine] = await this.db.select({ id: bids.id, status: bids.status, submittedAt: bids.submittedAt }).from(bids).where(and(eq(bids.tenderId, id), eq(bids.organizationId, ctx.orgId!), ne(bids.status, 'withdrawn'))).limit(1);
      out.myBid = mine ?? null;
    }
    return out;
  }

  @Get(':id/eligibility')
  async eligibility(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    await this.svc.role(ctx, t);
    return this.svc.eligibility(ctx, t);
  }

  // ---------- 067 documents ----------
  @Get(':id/documents')
  async documents(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    await this.svc.role(ctx, t);
    const rows = await this.db.select().from(tenderDocuments).where(eq(tenderDocuments.tenderId, id)).orderBy(asc(tenderDocuments.createdAt));
    return rows.map(({ objectKey: _k, ...d }) => ({ ...d, addendum: !!t.publishedAt && d.createdAt > t.publishedAt }));
  }

  @Post(':id/documents')
  @RequireCaps('tender.issue')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  @HttpCode(201)
  async upload(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string } | undefined, @Body() raw: Record<string, string>) {
    const t = await this.svc.load(id);
    this.svc.assertIssuerAdmin(ctx, t);
    if (!(t.status === 'draft' || this.svc.biddingOpen(t))) throw new ConflictException('Documents can only be added before the tender closes');
    if (!file) throw new BadRequestException('Attach a file');
    const title = (raw.title ?? '').trim();
    if (title.length < 3) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { title: 'Give the document a title' } });
    const stored = await this.storage.put(file.buffer, file.mimetype, `tenders/${id}`);
    const [d] = await this.db.insert(tenderDocuments).values({ tenderId: id, title: title.slice(0, 200), fileName: file.originalname.slice(0, 200), objectKey: stored.key, sha256: stored.sha256, size: stored.size, mime: stored.mime, uploadedBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: t.status === 'draft' ? 'tender.document_added' : 'tender.addendum_added', objectType: 'tender', objectId: id, after: { file: d.fileName, sha256: d.sha256 } });
    if (t.status === 'published') {
      const bidders = await this.db.selectDistinct({ org: bids.organizationId }).from(bids).where(and(eq(bids.tenderId, id), ne(bids.status, 'withdrawn')));
      for (const b of bidders) await this.svc.notifyOrg(b.org, `Addendum issued: ${t.code}`, `${d.title} was added to ${t.title}. Review it before you submit.`, `/tenders/${id}/documents`);
    }
    const { objectKey: _k, ...out } = d;
    return out;
  }

  @Get(':id/documents/:docId/url')
  async docUrl(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string) {
    const t = await this.svc.load(id);
    await this.svc.role(ctx, t);
    const [d] = await this.db.select().from(tenderDocuments).where(eq(tenderDocuments.id, docId)).limit(1);
    if (!d || d.tenderId !== id) throw new NotFoundException();
    await this.audit.record(ctx, { action: 'tender.document_accessed', objectType: 'tender_document', objectId: docId });
    return { url: this.storage.signedUrl(d.objectKey, 300) };
  }

  // ---------- Evaluators ----------
  @Get(':id/evaluator-candidates')
  @RequireCaps('tender.issue')
  async candidates(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    this.svc.assertIssuerAdmin(ctx, t);
    return this.db.select({ userId: users.id, name: users.fullName, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.organizationId, t.issuerOrgId), eq(memberships.status, 'active'))).orderBy(users.fullName);
  }

  @Post(':id/evaluators')
  @RequireCaps('tender.issue')
  @HttpCode(201)
  async addEvaluator(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(EvaluatorSchema)) b: z.infer<typeof EvaluatorSchema>) {
    const t = await this.svc.load(id);
    this.svc.assertIssuerAdmin(ctx, t);
    if (!['draft', 'published', 'closed'].includes(t.status)) throw new ConflictException('Evaluators cannot change once bids are opened');
    const [m] = await this.db.select().from(memberships).where(and(eq(memberships.userId, b.userId), eq(memberships.organizationId, t.issuerOrgId), eq(memberships.status, 'active'))).limit(1);
    if (!m) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { userId: 'Evaluators must be members of the issuing organization' } });
    const conflict = await this.db.select({ org: organizations.displayName }).from(bids).innerJoin(memberships, and(eq(memberships.organizationId, bids.organizationId), eq(memberships.userId, b.userId), eq(memberships.status, 'active')))
      .innerJoin(organizations, eq(organizations.id, bids.organizationId)).where(and(eq(bids.tenderId, id), ne(bids.status, 'withdrawn'))).limit(1);
    if (conflict.length) throw new ConflictException(`Conflict of interest: this person belongs to bidder ${conflict[0].org}`);
    const [e] = await this.db.insert(tenderEvaluators).values({ tenderId: id, userId: b.userId, role: b.role, addedBy: ctx.userId })
      .onConflictDoUpdate({ target: [tenderEvaluators.tenderId, tenderEvaluators.userId], set: { role: b.role } }).returning();
    await this.audit.record(ctx, { action: 'tender.evaluator_assigned', objectType: 'tender', objectId: id, after: { userId: b.userId, role: b.role } });
    return e;
  }

  @Delete(':id/evaluators/:evaluatorId')
  @RequireCaps('tender.issue')
  async removeEvaluator(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('evaluatorId', ParseUUIDPipe) evaluatorId: string) {
    const t = await this.svc.load(id);
    this.svc.assertIssuerAdmin(ctx, t);
    if (!['draft', 'published', 'closed'].includes(t.status)) throw new ConflictException('Evaluators cannot change once bids are opened');
    const [e] = await this.db.delete(tenderEvaluators).where(and(eq(tenderEvaluators.id, evaluatorId), eq(tenderEvaluators.tenderId, id))).returning();
    if (!e) throw new NotFoundException();
    await this.audit.record(ctx, { action: 'tender.evaluator_removed', objectType: 'tender', objectId: id, after: { userId: e.userId } });
    return { ok: true };
  }

  // ---------- 068 bid submission (sealed) ----------
  private async myBid(ctx: RequestContext, tenderId: string) {
    const [b] = await this.db.select().from(bids).where(and(eq(bids.tenderId, tenderId), eq(bids.organizationId, ctx.orgId!), ne(bids.status, 'withdrawn'))).limit(1);
    return b ?? null;
  }
  private bidView(b: Bid) {
    return { id: b.id, status: b.status, teamId: b.teamId, submittedAt: b.submittedAt, sealedHash: b.sealedHash, version: b.version, technical: JSON.parse(decryptField(b.technicalEnc)) as Technical, commercial: JSON.parse(decryptField(b.commercialEnc)) as Commercial };
  }

  /** The bidder's own bid. Only the bidding organization can ever read its own envelopes before opening. */
  @Get(':id/bid')
  async getBid(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    const { role } = await this.svc.role(ctx, t);
    if (role !== 'bidder') throw new NotFoundException('No bid');
    const b = await this.myBid(ctx, id);
    if (!b) return null;
    const history = await this.db.select({ status: bids.status, submittedAt: bids.submittedAt, withdrawnAt: bids.withdrawnAt }).from(bids).where(and(eq(bids.tenderId, id), eq(bids.organizationId, ctx.orgId!), eq(bids.status, 'withdrawn')));
    return { ...this.bidView(b), withdrawnBefore: history.length };
  }

  @Put(':id/bid')
  @RequireCaps('tender.bid')
  async saveDraft(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(BidDraftSchema)) b: z.infer<typeof BidDraftSchema>) {
    const t = await this.svc.load(id);
    const { role } = await this.svc.role(ctx, t);
    if (role !== 'bidder') throw new ForbiddenException('Only verified partner organizations can bid');
    if (!this.svc.biddingOpen(t)) throw new ConflictException('Bidding for this tender has closed');
    const existing = await this.myBid(ctx, id);
    if (existing && existing.status !== 'draft') throw new ConflictException('Your bid is sealed. Withdraw it first if you need to change it.');
    const values = { technicalEnc: encryptField(JSON.stringify(b.technical)), commercialEnc: encryptField(JSON.stringify(b.commercial)), teamId: b.teamId ?? null, updatedAt: new Date() };
    let row: Bid;
    if (existing) {
      [row] = await this.db.update(bids).set({ ...values, version: existing.version + 1 }).where(and(eq(bids.id, existing.id), eq(bids.version, existing.version))).returning();
      if (!row) throw new ConflictException('The bid was changed concurrently. Reload and try again.');
    } else {
      [row] = await this.db.insert(bids).values({ ...values, tenderId: id, organizationId: ctx.orgId!, submittedBy: null }).returning();
      await this.audit.record(ctx, { action: 'bid.draft_created', objectType: 'bid', objectId: row.id, after: { tenderId: id } });
    }
    return this.bidView(row);
  }

  @Post(':id/bid/submit')
  @RequireCaps('tender.bid')
  @Idempotent()
  @HttpCode(200)
  async submit(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    const { role } = await this.svc.role(ctx, t);
    if (role !== 'bidder') throw new ForbiddenException('Only verified partner organizations can bid');
    if (!this.svc.biddingOpen(t)) throw new ConflictException('Bidding for this tender has closed');
    const b = await this.myBid(ctx, id);
    if (!b) throw new BadRequestException('Save your bid before submitting it');
    if (b.status !== 'draft') throw new ConflictException('This bid has already been submitted');
    const el = await this.svc.eligibility(ctx, t);
    if (!el.eligible) throw new ForbiddenException({ message: 'Your organization does not meet this tender’s eligibility rules', checks: el.checks.filter((c) => !c.ok) });
    const v = this.bidView(b);
    const sealedHash = seal(id, ctx.orgId!, v.technical, v.commercial);
    const u = await this.svc.setBid(ctx, b, 'submitted', { sealedHash, submittedAt: new Date(), submittedBy: ctx.userId });
    const [org] = await this.db.select({ name: organizations.displayName }).from(organizations).where(eq(organizations.id, ctx.orgId!));
    await this.svc.notifyOrg(t.issuerOrgId, `New sealed bid on ${t.code}`, `${org.name} submitted a sealed bid. Bid contents stay hidden until opening.`, `/tenders/${id}`);
    return { id: u.id, status: u.status, sealedHash, submittedAt: u.submittedAt };
  }

  @Post(':id/bid/withdraw')
  @RequireCaps('tender.bid')
  @HttpCode(200)
  async withdraw(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    const { role } = await this.svc.role(ctx, t);
    if (role !== 'bidder') throw new NotFoundException();
    if (!this.svc.biddingOpen(t)) throw new ConflictException('Bids cannot be withdrawn after the tender closes');
    const b = await this.myBid(ctx, id);
    if (!b) throw new NotFoundException('No bid');
    if (b.status === 'draft') {
      await this.db.delete(bids).where(eq(bids.id, b.id));
      await this.audit.record(ctx, { action: 'bid.draft_discarded', objectType: 'bid', objectId: b.id });
      return { ok: true, status: 'discarded' };
    }
    const u = await this.svc.setBid(ctx, b, 'withdrawn', { withdrawnAt: new Date() });
    return { ok: true, status: u.status };
  }

  // ---------- Closing & opening ----------
  @Post(':id/close')
  @RequireCaps('tender.issue')
  @HttpCode(200)
  async close(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    this.svc.assertIssuerAdmin(ctx, t);
    if (t.status === 'published' && t.closesAt.getTime() > Date.now()) throw new ConflictException(`Bidding stays open until ${t.closesAt.toISOString()}. A tender cannot be closed early.`);
    const u = await this.svc.setTender(ctx, t, 'closed', undefined);
    await this.db.delete(bids).where(and(eq(bids.tenderId, id), eq(bids.status, 'draft'))); // unsubmitted drafts lapse at closing
    return publicTender(u);
  }

  /** Opening ceremony: verifies every seal, checks evaluator conflicts, and reveals technical envelopes only. */
  @Post(':id/open')
  @RequireCaps('tender.issue')
  @HttpCode(200)
  async open(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    this.svc.assertIssuerAdmin(ctx, t);
    if (t.status !== 'closed') throw new ConflictException('Close the tender before opening bids');
    const submitted = await this.db.select().from(bids).where(and(eq(bids.tenderId, id), eq(bids.status, 'submitted')));
    if (!submitted.length) throw new ConflictException('No bids were submitted. Cancel the tender or re-issue it.');
    const evUsers = (await this.svc.evaluators(id)).map((e) => e.e.userId);
    const conflicts = await this.db.select({ user: users.fullName, org: organizations.displayName }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(inArray(memberships.userId, evUsers), inArray(memberships.organizationId, submitted.map((b) => b.organizationId)), eq(memberships.status, 'active')));
    if (conflicts.length) throw new ConflictException(`Conflict of interest: ${conflicts.map((c) => `${c.user} belongs to bidder ${c.org}`).join('; ')}. Replace the evaluator before opening.`);
    const integrity: { bidId: string; ok: boolean }[] = [];
    for (const b of submitted) {
      let ok = false;
      try { ok = seal(id, b.organizationId, JSON.parse(decryptField(b.technicalEnc)), JSON.parse(decryptField(b.commercialEnc))) === b.sealedHash; } catch { ok = false; }
      integrity.push({ bidId: b.id, ok });
    }
    if (integrity.some((i) => !i.ok)) {
      await this.audit.record(ctx, { action: 'tender.seal_violation', objectType: 'tender', objectId: id, after: integrity.filter((i) => !i.ok) });
      throw new ConflictException('Seal verification failed for one or more bids. Opening is blocked and compliance has been alerted.');
    }
    const u = await this.db.transaction(async (tx) => {
      let cur = await this.svc.setTender(ctx, t, 'opened', undefined, { openedAt: new Date() }, tx as unknown as Db);
      for (const b of submitted) await this.svc.setBid(ctx, b, 'opened', {}, tx as unknown as Db);
      cur = await this.svc.setTender(ctx, cur, 'technical_evaluation', undefined, {}, tx as unknown as Db);
      return cur;
    });
    for (const b of submitted) await this.svc.notifyOrg(b.organizationId, `Bids opened: ${t.code}`, 'Technical evaluation has started. Commercial envelopes stay sealed until technical evaluation is complete.', `/tenders/${id}`);
    return { ...publicTender(u), opened: submitted.length, integrity };
  }

  // ---------- 070 technical evaluation ----------
  private async assertEvaluatorView(ctx: RequestContext, t: Tender, kind: 'technical' | 'commercial') {
    const { role, evaluator } = await this.svc.role(ctx, t);
    const ok = role === 'issuer' || (role === 'evaluator' && (evaluator!.role === 'both' || evaluator!.role === kind));
    if (!ok) throw new ForbiddenException(`Only the issuer and ${kind} evaluators can see this`);
    return { role, evaluator };
  }

  @Get(':id/technical')
  async technical(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    const { evaluator } = await this.assertEvaluatorView(ctx, t, 'technical');
    if (!EVALUATED.includes(t.status as TenderState)) throw new ConflictException('Bids are sealed until the tender is opened');
    const rows = await this.svc.sealedBids(id);
    const scores = await this.svc.scores(id);
    const techEvaluators = (await this.svc.evaluators(id)).filter((e) => e.e.role !== 'commercial');
    return {
      tender: publicTender(t), minTechScore: t.minTechScore, evaluatorCount: techEvaluators.length, canScore: !!evaluator && evaluator.role !== 'commercial' && t.status === 'technical_evaluation',
      bids: rows.map((r) => {
        const s = scores.filter((x) => x.s.bidId === r.b.id && x.s.kind === 'technical');
        return { id: r.b.id, bidder: r.org, status: r.b.status, sealedHash: r.b.sealedHash, technical: JSON.parse(decryptField(r.b.technicalEnc)) as Technical, average: avg(s.map((x) => x.s.score)), scored: s.length,
          myScore: s.find((x) => x.s.evaluatorUserId === ctx.userId)?.s ?? null, scores: s.map((x) => ({ evaluator: x.name, score: x.s.score, comment: x.s.comment, criteria: x.s.criteria })) };
      }),
    };
  }

  @Post(':id/bids/:bidId/scores')
  @HttpCode(201)
  async score(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('bidId', ParseUUIDPipe) bidId: string, @Body(body(ScoreSchema)) b: z.infer<typeof ScoreSchema>) {
    const t = await this.svc.load(id);
    const { role, evaluator } = await this.svc.role(ctx, t);
    if (role !== 'evaluator' || !(evaluator!.role === 'both' || evaluator!.role === b.kind)) throw new ForbiddenException(`Only assigned ${b.kind} evaluators can score`);
    const phase = b.kind === 'technical' ? 'technical_evaluation' : 'commercial_evaluation';
    if (t.status !== phase) throw new ConflictException(`${b.kind === 'technical' ? 'Technical' : 'Commercial'} scoring is not open for this tender`);
    const [bid] = await this.db.select().from(bids).where(and(eq(bids.id, bidId), eq(bids.tenderId, id))).limit(1);
    if (!bid) throw new NotFoundException('Bid not found');
    if (b.kind === 'technical' && bid.status !== 'opened') throw new ConflictException('This bid is not awaiting technical scoring');
    if (b.kind === 'commercial' && bid.status !== 'technically_qualified') throw new ConflictException('Only technically qualified bids receive commercial scores');
    try {
      const [s] = await this.db.insert(bidScores).values({ bidId, evaluatorUserId: ctx.userId, kind: b.kind, score: b.score, criteria: b.criteria, comment: b.comment }).returning();
      await this.audit.record(ctx, { action: `bid.scored_${b.kind}`, objectType: 'bid', objectId: bidId, after: { score: b.score } });
      return s;
    } catch (e) {
      const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
      if (code === '23505') throw new ConflictException('You have already scored this bid. Scores are final once recorded.');
      throw e;
    }
  }

  /** Completes technical evaluation: every bid needs a score from every technical evaluator. Qualification uses the published threshold. */
  @Post(':id/technical/complete')
  @RequireCaps('tender.issue')
  @HttpCode(200)
  async completeTechnical(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    this.svc.assertIssuerAdmin(ctx, t);
    if (t.status !== 'technical_evaluation') throw new ConflictException('Technical evaluation is not in progress');
    const evs = (await this.svc.evaluators(id)).filter((e) => e.e.role !== 'commercial');
    const opened = await this.db.select().from(bids).where(and(eq(bids.tenderId, id), eq(bids.status, 'opened')));
    const scores = (await this.svc.scores(id)).filter((s) => s.s.kind === 'technical');
    const missing = opened.flatMap((b) => evs.filter((e) => !scores.some((s) => s.s.bidId === b.id && s.s.evaluatorUserId === e.e.userId)).map((e) => `${e.name} has not scored bid ${b.id.slice(0, 8)}`));
    if (missing.length) throw new ConflictException({ message: 'Technical evaluation is incomplete', problems: missing });
    const results = await this.db.transaction(async (tx) => {
      const out: { bidId: string; average: number; qualified: boolean }[] = [];
      for (const b of opened) {
        const a = avg(scores.filter((s) => s.s.bidId === b.id).map((s) => s.s.score))!;
        const qualified = a >= t.minTechScore;
        await this.svc.setBid(ctx, b, qualified ? 'technically_qualified' : 'disqualified', { qualificationReason: qualified ? `Technical average ${a} meets the ${t.minTechScore} threshold` : `Technical average ${a} is below the ${t.minTechScore} threshold` }, tx as unknown as Db);
        out.push({ bidId: b.id, average: a, qualified });
      }
      if (!out.some((r) => r.qualified)) await this.svc.setTender(ctx, t, 'cancelled', 'No bid met the technical threshold', { cancelReason: 'No bid met the technical threshold' }, tx as unknown as Db);
      else await this.svc.setTender(ctx, t, 'commercial_evaluation', undefined, {}, tx as unknown as Db);
      return out;
    });
    for (const b of opened) {
      const r = results.find((x) => x.bidId === b.id)!;
      await this.svc.notifyOrg(b.organizationId, `Technical result: ${t.code}`, r.qualified ? 'Your bid is technically qualified. Your commercial envelope will now be opened.' : `Your bid did not meet the technical threshold (${r.average} vs ${t.minTechScore}). Your commercial envelope stays sealed.`, `/tenders/${id}`);
    }
    return { results };
  }

  // ---------- 071 commercial evaluation ----------
  @Get(':id/commercial')
  async commercial(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    const { evaluator } = await this.assertEvaluatorView(ctx, t, 'commercial');
    if (!COMMERCIAL_OPEN.includes(t.status as TenderState)) throw new ConflictException('Commercial envelopes stay sealed until technical evaluation is complete');
    const rows = (await this.svc.sealedBids(id)).filter((r) => QUALIFIED.includes(r.b.status as BidState));
    const scores = (await this.svc.scores(id)).filter((s) => s.s.kind === 'commercial');
    const prices = rows.map((r) => (JSON.parse(decryptField(r.b.commercialEnc)) as Commercial).amount);
    const lowest = Math.min(...prices);
    return {
      tender: publicTender(t), canScore: !!evaluator && evaluator.role !== 'technical' && t.status === 'commercial_evaluation',
      bids: rows.map((r, i) => {
        const s = scores.filter((x) => x.s.bidId === r.b.id);
        return { id: r.b.id, bidder: r.org, status: r.b.status, commercial: JSON.parse(decryptField(r.b.commercialEnc)) as Commercial, priceScore: Math.round((lowest / prices[i]) * 100), average: avg(s.map((x) => x.s.score)),
          myScore: s.find((x) => x.s.evaluatorUserId === ctx.userId)?.s ?? null, scores: s.map((x) => ({ evaluator: x.name, score: x.s.score, comment: x.s.comment })) };
      }),
    };
  }

  // ---------- 069 comparison ----------
  @Get(':id/comparison')
  async comparison(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    const { role, evaluator } = await this.svc.role(ctx, t);
    if (!(role === 'issuer' || role === 'evaluator')) throw new ForbiddenException('Only the issuer and evaluators can compare bids');
    if (!EVALUATED.includes(t.status as TenderState) && t.status !== 'cancelled') throw new ConflictException('Bids are sealed until the tender is opened');
    const commercialVisible = COMMERCIAL_OPEN.includes(t.status as TenderState) && (role === 'issuer' || evaluator!.role !== 'technical');
    const rows = await this.svc.sealedBids(id);
    const scores = await this.svc.scores(id);
    const qualifiedPrices = rows.filter((r) => QUALIFIED.includes(r.b.status as BidState)).map((r) => (JSON.parse(decryptField(r.b.commercialEnc)) as Commercial).amount);
    const lowest = qualifiedPrices.length ? Math.min(...qualifiedPrices) : 0;
    const out = await Promise.all(rows.map(async (r) => {
      const tech = avg(scores.filter((s) => s.s.bidId === r.b.id && s.s.kind === 'technical').map((s) => s.s.score));
      const technical = JSON.parse(decryptField(r.b.technicalEnc)) as Technical;
      const qualified = QUALIFIED.includes(r.b.status as BidState);
      const row: Record<string, unknown> = { id: r.b.id, bidder: r.org, status: r.b.status, timelineWeeks: technical.timelineWeeks, technicalScore: tech, qualified, qualificationReason: r.b.qualificationReason };
      if (commercialVisible && qualified) {
        const comm = avg(scores.filter((s) => s.s.bidId === r.b.id && s.s.kind === 'commercial').map((s) => s.s.score));
        const amounts = await this.svc.finalAmount(r.b);
        const priceScore = Math.round((lowest / amounts.sealed) * 100);
        const commercialBasis = comm ?? priceScore;
        row.amount = amounts.sealed; row.finalAmount = amounts.final; row.priceScore = priceScore; row.commercialScore = comm;
        row.combined = tech == null ? null : Math.round((tech * t.techWeight + commercialBasis * (100 - t.techWeight))) / 100;
      }
      return row;
    }));
    const ranked = [...out].sort((a, b) => ((b.combined as number) ?? -1) - ((a.combined as number) ?? -1) || ((b.technicalScore as number) ?? -1) - ((a.technicalScore as number) ?? -1));
    ranked.forEach((r, i) => { r.rank = r.combined == null ? null : i + 1; });
    return { tender: publicTender(t), techWeight: t.techWeight, commercialVisible, bids: ranked };
  }

  // ---------- 073 negotiation ----------
  @Post(':id/shortlist')
  @RequireCaps('tender.issue')
  @HttpCode(200)
  async shortlist(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ShortlistSchema)) b: z.infer<typeof ShortlistSchema>) {
    const t = await this.svc.load(id);
    this.svc.assertIssuerAdmin(ctx, t);
    await this.assertCommercialComplete(t);
    const rows = await this.db.select().from(bids).where(and(eq(bids.tenderId, id), inArray(bids.id, b.bidIds)));
    if (rows.length !== b.bidIds.length || rows.some((r) => r.status !== 'technically_qualified')) throw new BadRequestException('Only technically qualified bids can be shortlisted');
    const u = await this.db.transaction(async (tx) => {
      for (const r of rows) await this.svc.setBid(ctx, r, 'shortlisted', {}, tx as unknown as Db);
      return this.svc.setTender(ctx, t, 'negotiation', undefined, {}, tx as unknown as Db);
    });
    for (const r of rows) await this.svc.notifyOrg(r.organizationId, `Shortlisted: ${t.code}`, 'Your bid is shortlisted. The issuer may negotiate scope and price in the negotiation workspace.', `/tenders/${id}/negotiation`);
    return publicTender(u);
  }

  private async assertCommercialComplete(t: Tender) {
    if (t.status !== 'commercial_evaluation') throw new ConflictException('Commercial evaluation is not in progress');
    const evs = (await this.svc.evaluators(t.id)).filter((e) => e.e.role !== 'technical');
    const q = await this.db.select().from(bids).where(and(eq(bids.tenderId, t.id), eq(bids.status, 'technically_qualified')));
    const scores = (await this.svc.scores(t.id)).filter((s) => s.s.kind === 'commercial');
    const missing = q.flatMap((b) => evs.filter((e) => !scores.some((s) => s.s.bidId === b.id && s.s.evaluatorUserId === e.e.userId)).map((e) => `${e.name} has not scored bid ${b.id.slice(0, 8)}`));
    if (missing.length) throw new ConflictException({ message: 'Commercial evaluation is incomplete', problems: missing });
  }

  private async negotiationAccess(ctx: RequestContext, id: string, bidId: string) {
    const t = await this.svc.load(id);
    const [b] = await this.db.select().from(bids).where(and(eq(bids.id, bidId), eq(bids.tenderId, id))).limit(1);
    if (!b) throw new NotFoundException('Bid not found');
    const isBidder = ctx.orgId === b.organizationId;
    const isIssuer = this.svc.isIssuer(ctx, t) && ctx.orgId === t.issuerOrgId;
    if (!isBidder && !isIssuer) throw new NotFoundException('Bid not found');
    return { t, b, isBidder, isIssuer };
  }

  @Get(':id/negotiations')
  async negotiations(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    const { role } = await this.svc.role(ctx, t);
    // Issuer-organization members (including those also assigned as evaluators) see every negotiation; bidders only their own.
    const issuerSide = this.svc.isIssuer(ctx, t) && ctx.orgId === t.issuerOrgId;
    const where = issuerSide ? eq(bids.tenderId, id) : role === 'bidder' ? and(eq(bids.tenderId, id), eq(bids.organizationId, ctx.orgId!)) : undefined;
    if (!where) throw new ForbiddenException('Only the issuer and shortlisted bidders take part in negotiation');
    const rows = await this.db.select({ b: bids, org: organizations.displayName }).from(bids).innerJoin(organizations, eq(organizations.id, bids.organizationId)).where(and(where, inArray(bids.status, ['shortlisted', 'awarded', 'not_awarded'])));
    return { tender: publicTender(t), role: issuerSide ? 'issuer' : role, canManage: this.svc.isIssuerAdmin(ctx, t), bids: await Promise.all(rows.map(async (r) => ({ id: r.b.id, bidder: r.org, status: r.b.status, ...(await this.svc.finalAmount(r.b)) }))) };
  }

  @Get(':id/bids/:bidId/negotiation')
  async thread(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('bidId', ParseUUIDPipe) bidId: string) {
    const { t, b } = await this.negotiationAccess(ctx, id, bidId);
    if (!['shortlisted', 'awarded', 'not_awarded'].includes(b.status)) throw new ConflictException('This bid is not in negotiation');
    const msgs = await this.db.select({ m: negotiationMessages, author: users.fullName, org: organizations.displayName }).from(negotiationMessages).innerJoin(users, eq(users.id, negotiationMessages.authorUserId)).innerJoin(organizations, eq(organizations.id, negotiationMessages.authorOrgId))
      .where(eq(negotiationMessages.bidId, bidId)).orderBy(asc(negotiationMessages.createdAt));
    return { tenderStatus: t.status, bidStatus: b.status, open: t.status === 'negotiation' && b.status === 'shortlisted', ...(await this.svc.finalAmount(b)),
      messages: msgs.map((x) => ({ id: x.m.id, body: x.m.body, revisedAmount: x.m.revisedAmount, author: x.author, org: x.org, mine: x.m.authorOrgId === ctx.orgId, createdAt: x.m.createdAt })) };
  }

  /** Revised prices can only come from the bidder; the issuer can only reply. Every revision is kept. */
  @Post(':id/bids/:bidId/negotiation')
  @HttpCode(201)
  async post(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('bidId', ParseUUIDPipe) bidId: string, @Body(body(NegotiationSchema)) m: z.infer<typeof NegotiationSchema>) {
    const { t, b, isBidder } = await this.negotiationAccess(ctx, id, bidId);
    if (t.status !== 'negotiation' || b.status !== 'shortlisted') throw new ConflictException('Negotiation is closed for this bid');
    if (!isBidder && !this.svc.isIssuerAdmin(ctx, t)) throw new ForbiddenException('Only the issuer’s tender managers can negotiate');
    if (m.revisedAmount != null && !isBidder) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { revisedAmount: 'Only the bidder can revise its price' } });
    if (m.revisedAmount != null && m.revisedAmount <= 0) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { revisedAmount: 'Enter a positive amount' } });
    const [row] = await this.db.insert(negotiationMessages).values({ tenderId: id, bidId, authorUserId: ctx.userId, authorOrgId: ctx.orgId!, body: m.body, revisedAmount: m.revisedAmount }).returning();
    await this.audit.record(ctx, { action: m.revisedAmount != null ? 'bid.price_revised' : 'bid.negotiation_message', objectType: 'bid', objectId: bidId, after: m.revisedAmount != null ? { revisedAmount: m.revisedAmount } : undefined });
    await this.svc.notifyOrg(isBidder ? t.issuerOrgId : b.organizationId, `Negotiation update: ${t.code}`, m.revisedAmount != null ? 'The bidder submitted a revised price.' : 'There is a new message in the negotiation workspace.', `/tenders/${id}/negotiation`);
    return row;
  }

  /** Award — from commercial evaluation (direct) or negotiation. Every other bid becomes not_awarded. */
  @Post(':id/award')
  @RequireCaps('tender.issue')
  @Idempotent()
  @HttpCode(200)
  async award(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(AwardSchema)) a: z.infer<typeof AwardSchema>) {
    const t = await this.svc.load(id);
    this.svc.assertIssuerAdmin(ctx, t);
    if (t.status === 'commercial_evaluation') await this.assertCommercialComplete(t);
    else if (t.status !== 'negotiation') throw new ConflictException('Bids can be awarded only after commercial evaluation');
    const all = await this.db.select().from(bids).where(eq(bids.tenderId, id));
    const winner = all.find((b) => b.id === a.bidId);
    const eligible: BidState[] = t.status === 'negotiation' ? ['shortlisted'] : ['technically_qualified'];
    if (!winner || !eligible.includes(winner.status as BidState)) throw new BadRequestException(t.status === 'negotiation' ? 'Award must go to a shortlisted bid' : 'Award must go to a technically qualified bid');
    const amounts = await this.svc.finalAmount(winner);
    const u = await this.db.transaction(async (tx) => {
      await this.svc.setBid(ctx, winner, 'awarded', {}, tx as unknown as Db);
      for (const b of all) if (b.id !== winner.id && ['technically_qualified', 'shortlisted'].includes(b.status)) await this.svc.setBid(ctx, b, 'not_awarded', {}, tx as unknown as Db);
      return this.svc.setTender(ctx, t, 'awarded', a.reason, {}, tx as unknown as Db);
    });
    await this.audit.record(ctx, { action: 'tender.award_decision', objectType: 'tender', objectId: id, reason: a.reason, after: { bidId: winner.id, organizationId: winner.organizationId, amount: amounts.final } });
    for (const b of all.filter((x) => SEALED_OR_LATER.includes(x.status as BidState) && x.status !== 'submitted')) {
      await this.svc.notifyOrg(b.organizationId, b.id === winner.id ? `Awarded: ${t.code}` : `Tender result: ${t.code}`, b.id === winner.id ? 'Congratulations — your bid has been awarded. A letter of award will follow.' : 'The tender has been awarded to another bidder. Thank you for participating.', `/tenders/${id}`);
    }
    return { ...publicTender(u), awardedBidId: winner.id, amount: amounts.final };
  }

  @Post(':id/cancel')
  @RequireCaps('tender.issue')
  @HttpCode(200)
  async cancel(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(TenderCancelSchema)) c: z.infer<typeof TenderCancelSchema>) {
    const t = await this.svc.load(id);
    this.svc.assertIssuerAdmin(ctx, t);
    const u = await this.svc.setTender(ctx, t, 'cancelled', c.reason, { cancelReason: c.reason });
    const bidders = await this.db.selectDistinct({ org: bids.organizationId }).from(bids).where(and(eq(bids.tenderId, id), ne(bids.status, 'withdrawn')));
    for (const b of bidders) await this.svc.notifyOrg(b.org, `Tender cancelled: ${t.code}`, c.reason, `/tenders/${id}`);
    return publicTender(u);
  }
}

/** 137 — platform tender administration: metadata, counts and integrity only. Never bid content. */
@ApiTags('admin')
@Controller('admin/tenders')
export class AdminTendersController {
  constructor(@InjectDb() private db: Db, private svc: TendersService, private audit: AuditService) {}

  private assertPlatform(ctx: RequestContext) {
    if (!ctx.platformRoles.length || !ctx.caps.has('tender.evaluate')) throw new ForbiddenException('Platform tender administration only');
  }

  @Get()
  async list(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    this.assertPlatform(ctx);
    const rows = await this.db.select({ t: tenders, issuer: organizations.displayName,
      submitted: sql<number>`(select count(*)::int from bids b where b.tender_id = ${tenders.id} and b.status not in ('draft','withdrawn'))`,
      withdrawn: sql<number>`(select count(*)::int from bids b where b.tender_id = ${tenders.id} and b.status = 'withdrawn')`,
      evaluators: sql<number>`(select count(*)::int from tender_evaluators e where e.tender_id = ${tenders.id})`,
    }).from(tenders).innerJoin(organizations, eq(organizations.id, tenders.issuerOrgId)).where(status ? eq(tenders.status, status) : undefined).orderBy(desc(tenders.createdAt)).limit(200);
    return rows.map((r) => ({ id: r.t.id, code: r.t.code, title: r.t.title, sector: r.t.sector, status: r.t.status, issuer: r.issuer, closesAt: r.t.closesAt, publishedAt: r.t.publishedAt, openedAt: r.t.openedAt, cancelReason: r.t.cancelReason,
      overdueToClose: r.t.status === 'published' && r.t.closesAt.getTime() < Date.now(), submitted: r.submitted, withdrawn: r.withdrawn, evaluators: r.evaluators }));
  }

  @Get(':id')
  async detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.assertPlatform(ctx);
    const t = await this.svc.load(id);
    const evs = await this.svc.evaluators(id);
    const bidRows = await this.db.select({ id: bids.id, org: organizations.displayName, status: bids.status, submittedAt: bids.submittedAt, sealedHash: bids.sealedHash }).from(bids).innerJoin(organizations, eq(organizations.id, bids.organizationId)).where(and(eq(bids.tenderId, id), ne(bids.status, 'draft')));
    const events = await this.db.select({ action: auditEvents.action, objectType: auditEvents.objectType, reason: auditEvents.reason, at: auditEvents.at }).from(auditEvents)
      .where(inArray(auditEvents.objectId, [id, ...bidRows.map((b) => b.id)])).orderBy(asc(auditEvents.seq)).limit(300);
    await this.audit.record(ctx, { action: 'tender.admin_viewed', objectType: 'tender', objectId: id });
    return { ...publicTender(t), evaluators: evs.map((e) => ({ name: e.name, role: e.e.role })), bids: bidRows, events };
  }
}

@Module({ controllers: [TendersController, AdminTendersController], providers: [TendersService] })
export class TendersModule {}
