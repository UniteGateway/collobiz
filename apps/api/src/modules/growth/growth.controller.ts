/**
 * Stage 14 — reputation, learning, marketing and AI assistance (screens 029, 072, 113–118, 140, 160–165).
 *
 * Gate: explainable recommendations and appeals.
 *  - Reputation is computed from verified outcomes (certified milestones: on time or late) and published reviews from
 *    organizations that shared a project. Paid placement has no input (§1.4). Reviews under appeal are excluded until
 *    compliance decides; a member of the reviewed organization can never decide its own appeal (R4.7).
 *  - Every AI output is a stored draft with sources, provider and prompt version. Accepting a draft never applies for,
 *    submits, awards or pays anything — a person still does that through the normal screens (R4.10).
 *  - Assessment answers are graded on the server; correct answers are never sent to the client.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { computeReputation, rankPartners, sectorName, type ReputationEvent } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  aiSettings, aiSuggestions, assessmentAttempts, assetUses, certificates, courseProgress, courses, marketingAssets, organizations, partnerProfiles,
  partnerReviews, reputationAppeals, tenders, users,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomDigits, sha256 } from '../../common/crypto';
import { config } from '../../config';
import { OpportunitiesModule } from '../opportunities/opportunities.controller';
import { OpportunitiesService } from '../opportunities/opportunities.service';

const PROMPT_VERSION = 'rules-2026.11';
const AI_KINDS = ['proposal_draft', 'opportunity_match', 'partner_match', 'team_builder'] as const;
const LEVELS = ['registered', 'verified', 'certified', 'strategic', 'country_partner'];
/** Minor units → ₹1.2 Cr / ₹45 L. */
const inrShort = (minor: number) => { const r = minor / 100; return r >= 1e7 ? `₹${(r / 1e7).toFixed(1)} Cr` : r >= 1e5 ? `₹${(r / 1e5).toFixed(1)} L` : `₹${Math.round(r).toLocaleString('en-IN')}`; };
const levelName = (l: string) => `${l.charAt(0).toUpperCase()}${l.slice(1).replace('_', ' ')}`;

const ReviewSchema = z.object({ projectId: z.string().uuid(), subjectOrgId: z.string().uuid(), quality: z.number().int().min(1).max(5), timeliness: z.number().int().min(1).max(5), communication: z.number().int().min(1).max(5), comment: z.string().trim().min(20).max(2000) });
const AppealSchema = z.object({ reviewId: z.string().uuid(), reason: z.string().trim().min(20).max(2000) });
const DecisionSchema = z.object({ decision: z.enum(['upheld', 'rejected']), reason: z.string().trim().min(10).max(1000) });
const AnswersSchema = z.object({ answers: z.array(z.number().int().min(0).max(9)).min(1).max(50) });
const BrochureSchema = z.object({ headline: z.string().trim().min(5).max(120), sector: z.string().trim().min(2).max(60), services: z.array(z.string().trim().min(2).max(80)).min(1).max(6), assetId: z.string().uuid().optional() });
const AiReviewSchema = z.object({ status: z.enum(['accepted', 'edited', 'rejected']), feedback: z.string().trim().max(1000).optional() });

type Row = Record<string, unknown>;
const rows = (r: unknown) => ((r as { rows?: Row[] }).rows ?? (r as Row[]));

@Injectable()
export class ReputationService {
  constructor(@InjectDb() private db: Db) {}

  /** Verified outcomes: each certified milestone of a project the organization led or was assigned. */
  async outcomes(orgId: string) {
    return rows(await this.db.execute(sql`select m.id, m.title, m.due_date, m.certified_at, p.code as project_code, p.title as project
      from milestones m join projects p on p.id = m.project_id
      where m.certified_at is not null and (m.assigned_org_id = ${orgId} or (m.assigned_org_id is null and p.lead_org_id = ${orgId}))
      order by m.certified_at desc`)).map((r) => ({ id: String(r.id), title: String(r.title), project: String(r.project), projectCode: String(r.project_code), certifiedAt: new Date(String(r.certified_at)), dueDate: String(r.due_date),
      onTime: new Date(String(r.certified_at)).toISOString().slice(0, 10) <= String(r.due_date).slice(0, 10) }));
  }
  async reviews(orgId: string, includeHidden = false) {
    return this.db.select({ r: partnerReviews, reviewer: organizations.displayName }).from(partnerReviews).innerJoin(organizations, eq(organizations.id, partnerReviews.reviewerOrgId))
      .where(and(eq(partnerReviews.subjectOrgId, orgId), includeHidden ? undefined : eq(partnerReviews.status, 'published'))).orderBy(desc(partnerReviews.createdAt));
  }
  async score(orgId: string) {
    const outs = await this.outcomes(orgId);
    const revs = await this.db.select().from(partnerReviews).where(and(eq(partnerReviews.subjectOrgId, orgId), ne(partnerReviews.status, 'removed')));
    const events: ReputationEvent[] = [
      ...outs.map((o) => ({ kind: 'verified_outcome' as const, onTime: o.onTime, status: 'counted' as const })),
      // Review quality also informs the outcome-quality component; reviews under appeal are excluded.
      ...revs.map((r) => ({ kind: 'review' as const, rating: Math.round((r.quality + r.timeliness + r.communication) / 3), quality: r.quality, status: r.status === 'published' ? 'counted' as const : 'excluded' as const })),
    ];
    const qualityFromReviews = revs.filter((r) => r.status === 'published');
    if (qualityFromReviews.length && events.some((e) => e.kind === 'verified_outcome')) {
      const q = qualityFromReviews.reduce((s, r) => s + r.quality, 0) / qualityFromReviews.length;
      events.filter((e) => e.kind === 'verified_outcome').forEach((e) => { e.quality = q; });
    }
    return { ...computeReputation(events), outcomes: outs.length, onTimeOutcomes: outs.filter((o) => o.onTime).length, publishedReviews: qualityFromReviews.length, excludedReviews: revs.filter((r) => r.status === 'under_appeal').length };
  }
}

@ApiTags('reputation')
@Controller()
export class ReputationController {
  constructor(@InjectDb() private db: Db, private rep: ReputationService, private audit: AuditService) {}

  /** 029 — own performance scorecard with the evidence behind each figure. */
  @Get('reputation/me')
  @RequireOrg()
  async mine(@Ctx() ctx: RequestContext) {
    const org = ctx.orgId!;
    const score = await this.rep.score(org);
    const outs = await this.rep.outcomes(org);
    const reviews = await this.rep.reviews(org, true);
    const appeals = await this.db.select().from(reputationAppeals).where(eq(reputationAppeals.subjectOrgId, org)).orderBy(desc(reputationAppeals.createdAt));
    const reviewable = rows(await this.db.execute(sql`select distinct p.id as project_id, p.code, p.title, o.id as org_id, o.display_name as org
      from project_members me join projects p on p.id = me.project_id join project_members other on other.project_id = p.id and other.organization_id <> me.organization_id and other.status = 'active'
      join organizations o on o.id = other.organization_id
      where me.organization_id = ${org} and me.status = 'active' and exists (select 1 from milestones m where m.project_id = p.id and m.certified_at is not null)
        and not exists (select 1 from partner_reviews r where r.project_id = p.id and r.reviewer_org_id = ${org} and r.subject_org_id = o.id)`));
    const tips: string[] = [];
    if (!score.outcomes) tips.push('Your score starts with your first certified milestone. Submit milestones with evidence on time.');
    if (score.components.onTimeRate != null && score.components.onTimeRate < 0.8) tips.push('Several milestones were certified after their due date. Agree realistic dates and submit early.');
    if (!score.publishedReviews) tips.push('Ask the companies you worked with to leave a review — reviews count for 20% of the score.');
    return { score, outcomes: outs.slice(0, 12), reviews: reviews.map((r) => ({ ...r.r, reviewer: r.reviewer })), appeals, reviewable, tips };
  }

  /** 163 — public reputation profile of a verified partner. */
  @Get('reputation/orgs/:id')
  async profile(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [o] = await this.db.select().from(organizations).where(and(eq(organizations.id, id), eq(organizations.verificationStatus, 'verified'), ne(organizations.type, 'platform'))).limit(1);
    if (!o) throw new NotFoundException('Partner not found');
    const score = await this.rep.score(id);
    const certs = rows(await this.db.execute(sql`select c.title, c.level, count(*)::int as holders from certificates x join courses c on c.id = x.course_id
      where x.organization_id = ${id} and x.revoked_at is null and x.expires_at > now() group by c.title, c.level order by c.title`));
    const reviews = await this.rep.reviews(id);
    return { id: o.id, name: o.displayName, city: o.city, level: o.membershipLevel, levelName: `${levelName(o.membershipLevel)} partner`, memberSince: o.createdAt, isMe: ctx.orgId === id, score,
      certifications: certs, reviews: reviews.map((r) => ({ id: r.r.id, reviewer: r.reviewer, quality: r.r.quality, timeliness: r.r.timeliness, communication: r.r.communication, comment: r.r.comment, response: r.r.response, createdAt: r.r.createdAt })) };
  }

  /** 164 — leave a review for a company you worked with on a project that has certified work. */
  @Post('reviews')
  @RequireOrg()
  @HttpCode(201)
  async review(@Ctx() ctx: RequestContext, @Body(body(ReviewSchema)) b: z.infer<typeof ReviewSchema>) {
    if (b.subjectOrgId === ctx.orgId) throw new BadRequestException('You cannot review your own company');
    const shared = rows(await this.db.execute(sql`select 1 from project_members a join project_members b on b.project_id = a.project_id
      where a.project_id = ${b.projectId} and a.organization_id = ${ctx.orgId} and b.organization_id = ${b.subjectOrgId} and a.status = 'active' and b.status = 'active'
        and exists (select 1 from milestones m where m.project_id = a.project_id and m.certified_at is not null) limit 1`));
    if (!shared.length) throw new ForbiddenException('You can review companies you worked with on a project that has certified work');
    const [dup] = await this.db.select({ id: partnerReviews.id }).from(partnerReviews).where(and(eq(partnerReviews.projectId, b.projectId), eq(partnerReviews.reviewerOrgId, ctx.orgId!), eq(partnerReviews.subjectOrgId, b.subjectOrgId))).limit(1);
    if (dup) throw new ConflictException('Your company has already reviewed this partner for this project');
    const [r] = await this.db.insert(partnerReviews).values({ ...b, reviewerOrgId: ctx.orgId!, reviewerUserId: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'reputation.review_published', objectType: 'partner_review', objectId: r.id, after: { subjectOrgId: b.subjectOrgId, projectId: b.projectId } });
    return r;
  }

  @Post('reviews/:id/response')
  @RequireOrg()
  @HttpCode(200)
  async respond(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ response: z.string().trim().min(10).max(1000) }))) b: { response: string }) {
    const [r] = await this.db.select().from(partnerReviews).where(eq(partnerReviews.id, id)).limit(1);
    if (!r || r.subjectOrgId !== ctx.orgId) throw new NotFoundException('Review not found');
    if (r.response) throw new ConflictException('You have already responded to this review');
    const [u] = await this.db.update(partnerReviews).set({ response: b.response, respondedAt: new Date() }).where(eq(partnerReviews.id, id)).returning();
    return u;
  }

  /** Appeal: the review is excluded from the score while compliance looks at it. */
  @Post('reputation/appeals')
  @RequireOrg()
  @HttpCode(201)
  async appeal(@Ctx() ctx: RequestContext, @Body(body(AppealSchema)) b: z.infer<typeof AppealSchema>) {
    const [r] = await this.db.select().from(partnerReviews).where(eq(partnerReviews.id, b.reviewId)).limit(1);
    if (!r || r.subjectOrgId !== ctx.orgId) throw new NotFoundException('Review not found');
    if (r.status !== 'published') throw new ConflictException('This review is already under appeal or removed');
    const a = await this.db.transaction(async (tx) => {
      await tx.update(partnerReviews).set({ status: 'under_appeal' }).where(eq(partnerReviews.id, r.id));
      const [a] = await tx.insert(reputationAppeals).values({ subjectOrgId: ctx.orgId!, reviewId: r.id, reason: b.reason, createdBy: ctx.userId }).returning();
      return a;
    });
    await this.audit.record(ctx, { action: 'reputation.appeal_opened', objectType: 'reputation_appeal', objectId: a.id, reason: b.reason });
    return a;
  }

  @Get('admin/reputation/appeals')
  async appeals(@Ctx() ctx: RequestContext) {
    if (!ctx.platformRoles.some((r) => ['compliance', 'super_admin'].includes(r))) throw new ForbiddenException('Compliance only');
    const list = await this.db.select({ a: reputationAppeals, r: partnerReviews, subject: organizations.displayName }).from(reputationAppeals).innerJoin(partnerReviews, eq(partnerReviews.id, reputationAppeals.reviewId)).innerJoin(organizations, eq(organizations.id, reputationAppeals.subjectOrgId)).orderBy(desc(reputationAppeals.createdAt));
    return list.map((x) => ({ ...x.a, subject: x.subject, review: { quality: x.r.quality, timeliness: x.r.timeliness, communication: x.r.communication, comment: x.r.comment } }));
  }

  @Post('admin/reputation/appeals/:id/decision')
  @HttpCode(200)
  async decide(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(DecisionSchema)) b: z.infer<typeof DecisionSchema>) {
    if (!ctx.platformRoles.some((r) => ['compliance', 'super_admin'].includes(r))) throw new ForbiddenException('Compliance only');
    const [a] = await this.db.select().from(reputationAppeals).where(eq(reputationAppeals.id, id)).limit(1);
    if (!a) throw new NotFoundException('Appeal not found');
    if (a.status !== 'open') throw new ConflictException('This appeal has already been decided');
    if (ctx.memberships.some((m) => m.organizationId === a.subjectOrgId)) throw new ForbiddenException('You cannot decide an appeal for your own organization');
    await this.db.transaction(async (tx) => {
      await tx.update(reputationAppeals).set({ status: b.decision, decidedBy: ctx.userId, decisionReason: b.reason, decidedAt: new Date() }).where(eq(reputationAppeals.id, id));
      await tx.update(partnerReviews).set({ status: b.decision === 'upheld' ? 'removed' : 'published' }).where(eq(partnerReviews.id, a.reviewId));
    });
    await this.audit.record(ctx, { action: `reputation.appeal_${b.decision}`, objectType: 'reputation_appeal', objectId: id, reason: b.reason });
    return { id, status: b.decision };
  }

  /** 165 — progress towards the next membership level, with each criterion explained. */
  @Get('reputation/excellence')
  @RequireOrg()
  async excellence(@Ctx() ctx: RequestContext) {
    const [o] = await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId!)).limit(1);
    const score = await this.rep.score(o.id);
    const [{ certs }] = rows(await this.db.execute(sql`select count(distinct course_id)::int as certs from certificates where organization_id = ${o.id} and revoked_at is null and expires_at > now()`));
    const idx = LEVELS.indexOf(o.membershipLevel);
    const next = LEVELS[Math.min(idx + 1, LEVELS.length - 1)];
    const need: Record<string, { outcomes: number; score: number; certs: number }> = { verified: { outcomes: 0, score: 0, certs: 0 }, certified: { outcomes: 3, score: 70, certs: 2 }, strategic: { outcomes: 10, score: 85, certs: 4 }, country_partner: { outcomes: 25, score: 85, certs: 6 } };
    const n = need[next] ?? need.certified;
    const criteria = [
      { key: 'verified', label: 'Company verified', met: o.verificationStatus === 'verified', detail: o.verificationStatus === 'verified' ? 'KYB verification complete' : 'Complete KYB verification' },
      { key: 'outcomes', label: `${n.outcomes} certified milestones`, met: score.outcomes >= n.outcomes, detail: `${score.outcomes} so far`, progress: n.outcomes ? Math.min(1, score.outcomes / n.outcomes) : 1 },
      { key: 'score', label: `Reputation ${n.score} or higher`, met: (score.score ?? 0) >= n.score, detail: score.score == null ? 'Not rated yet' : `Currently ${score.score}`, progress: n.score ? Math.min(1, (score.score ?? 0) / n.score) : 1 },
      { key: 'certs', label: `${n.certs} COLLABIZ certifications`, met: Number(certs) >= n.certs, detail: `${certs} held by your team`, progress: n.certs ? Math.min(1, Number(certs) / n.certs) : 1 },
    ];
    return { level: o.membershipLevel, levelName: `${levelName(o.membershipLevel)} partner`, next: idx >= LEVELS.length - 1 ? null : next, nextName: idx >= LEVELS.length - 1 ? null : `${levelName(next)} partner`, criteria, ready: criteria.every((c) => c.met),
      note: 'Levels are reviewed by Unite Group. Meeting every criterion makes your company eligible; it does not change your level automatically.' };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
@ApiTags('learning')
@Controller()
export class LearningController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  /** 116 — course catalogue with the caller's progress and certificates. */
  @Get('learning/courses')
  async list(@Ctx() ctx: RequestContext) {
    const cs = await this.db.select().from(courses).where(eq(courses.status, 'published')).orderBy(courses.level, courses.title);
    const prog = await this.db.select().from(courseProgress).where(eq(courseProgress.userId, ctx.userId));
    const certs = await this.db.select().from(certificates).where(and(eq(certificates.userId, ctx.userId), sql`${certificates.revokedAt} is null`));
    return cs.map((c) => {
      const p = prog.find((x) => x.courseId === c.id);
      const cert = certs.find((x) => x.courseId === c.id && x.expiresAt > new Date());
      const mods = (c.modules as unknown[]).length;
      return { id: c.id, code: c.code, title: c.title, summary: c.summary, sector: c.sector, level: c.level, minutes: c.minutes, modules: mods, completedModules: p?.completedModules.length ?? 0, certificate: cert ? { code: cert.code, expiresAt: cert.expiresAt } : null };
    });
  }

  @Get('learning/courses/:id')
  async course(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [c] = await this.db.select().from(courses).where(and(eq(courses.id, id), eq(courses.status, 'published'))).limit(1);
    if (!c) throw new NotFoundException('Course not found');
    const [p] = await this.db.select().from(courseProgress).where(and(eq(courseProgress.userId, ctx.userId), eq(courseProgress.courseId, id))).limit(1);
    const attempts = await this.db.select({ score: assessmentAttempts.score, passed: assessmentAttempts.passed, createdAt: assessmentAttempts.createdAt }).from(assessmentAttempts).where(and(eq(assessmentAttempts.userId, ctx.userId), eq(assessmentAttempts.courseId, id))).orderBy(desc(assessmentAttempts.createdAt));
    const [cert] = await this.db.select().from(certificates).where(and(eq(certificates.userId, ctx.userId), eq(certificates.courseId, id), sql`${certificates.revokedAt} is null`, sql`${certificates.expiresAt} > now()`)).limit(1);
    const qs = c.questions as { q: string; options: string[] }[];
    const recent = attempts.filter((a) => a.createdAt.getTime() > Date.now() - 86400_000).length;
    return { id: c.id, code: c.code, title: c.title, summary: c.summary, level: c.level, minutes: c.minutes, passMark: c.passMark, modules: c.modules, completedModules: p?.completedModules ?? [],
      // Correct answers stay on the server.
      assessment: { questions: qs.map((q) => ({ q: q.q, options: q.options })), attemptsLeftToday: Math.max(0, 3 - recent) }, attempts, certificate: cert ? { code: cert.code, issuedAt: cert.issuedAt, expiresAt: cert.expiresAt, score: cert.score } : null };
  }

  @Post('learning/courses/:id/modules/:n/complete')
  @HttpCode(200)
  async complete(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('n') n: string) {
    const [c] = await this.db.select().from(courses).where(eq(courses.id, id)).limit(1);
    const i = Number(n);
    if (!c || !Number.isInteger(i) || i < 0 || i >= (c.modules as unknown[]).length) throw new NotFoundException('Module not found');
    await this.db.insert(courseProgress).values({ userId: ctx.userId, courseId: id, completedModules: [i] })
      .onConflictDoUpdate({ target: [courseProgress.userId, courseProgress.courseId], set: { completedModules: sql`(select array_agg(distinct x order by x) from unnest(${courseProgress.completedModules} || ${i}::int) x)` } });
    const [p] = await this.db.select().from(courseProgress).where(and(eq(courseProgress.userId, ctx.userId), eq(courseProgress.courseId, id))).limit(1);
    return { completedModules: p.completedModules };
  }

  /** 117 — graded on the server; all modules must be complete; three attempts per 24 hours. Passing issues a certificate. */
  @Post('learning/courses/:id/assessment')
  @HttpCode(200)
  async assess(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(AnswersSchema)) b: z.infer<typeof AnswersSchema>) {
    const [c] = await this.db.select().from(courses).where(eq(courses.id, id)).limit(1);
    if (!c) throw new NotFoundException('Course not found');
    const [p] = await this.db.select().from(courseProgress).where(and(eq(courseProgress.userId, ctx.userId), eq(courseProgress.courseId, id))).limit(1);
    if ((p?.completedModules.length ?? 0) < (c.modules as unknown[]).length) throw new ConflictException('Finish every module before taking the assessment');
    const qs = c.questions as { q: string; options: string[]; answer: number }[];
    if (b.answers.length !== qs.length) throw new BadRequestException('Answer every question');
    const [{ n }] = rows(await this.db.execute(sql`select count(*)::int as n from assessment_attempts where user_id = ${ctx.userId} and course_id = ${id} and created_at > now() - interval '24 hours'`));
    if (Number(n) >= 3) throw new ConflictException('You have used your three attempts for today. Try again tomorrow.');
    const correct = qs.filter((q, i) => q.answer === b.answers[i]).length;
    const score = Math.round((correct / qs.length) * 100);
    const passed = score >= c.passMark;
    await this.db.insert(assessmentAttempts).values({ userId: ctx.userId, organizationId: ctx.orgId, courseId: id, score, passed, answers: b.answers });
    let certificate = null;
    if (passed) {
      await this.db.update(courseProgress).set({ completedAt: new Date() }).where(eq(courseProgress.id, p!.id));
      const [existing] = await this.db.select().from(certificates).where(and(eq(certificates.userId, ctx.userId), eq(certificates.courseId, id), sql`${certificates.revokedAt} is null`, sql`${certificates.expiresAt} > now()`)).limit(1);
      if (existing) certificate = { code: existing.code, expiresAt: existing.expiresAt };
      else {
        const code = `CZC-${new Date().getUTCFullYear()}-${randomDigits(8)}`;
        const expiresAt = new Date(Date.now() + c.validDays * 86400_000);
        const [x] = await this.db.insert(certificates).values({ code, userId: ctx.userId, organizationId: ctx.orgId, courseId: id, score, expiresAt, hash: sha256(`${code}|${ctx.userId}|${id}|${score}|${expiresAt.toISOString()}`) }).returning();
        await this.audit.record(ctx, { action: 'learning.certificate_issued', objectType: 'certificate', objectId: x.id, after: { code, course: c.code, score } });
        certificate = { code: x.code, expiresAt: x.expiresAt };
      }
    }
    // Feedback names which questions were wrong, never the correct option.
    return { score, passed, passMark: c.passMark, correct, total: qs.length, incorrect: qs.map((q, i) => (q.answer === b.answers[i] ? null : i + 1)).filter((x) => x != null), certificate };
  }

  /** 118 — my certificates and badges. */
  @Get('learning/certificates')
  async mine(@Ctx() ctx: RequestContext) {
    const list = await this.db.select({ x: certificates, title: courses.title, level: courses.level }).from(certificates).innerJoin(courses, eq(courses.id, certificates.courseId)).where(eq(certificates.userId, ctx.userId)).orderBy(desc(certificates.issuedAt));
    return list.map((r) => ({ code: r.x.code, course: r.title, level: r.level, score: r.x.score, issuedAt: r.x.issuedAt, expiresAt: r.x.expiresAt, status: r.x.revokedAt ? 'revoked' : r.x.expiresAt < new Date() ? 'expired' : 'valid' }));
  }

  /** Public verification by code: holder's name, course and validity — nothing else. */
  @Public()
  @Get('public/training-certificates/:code')
  async verify(@Param('code') code: string) {
    const [r] = await this.db.select({ x: certificates, title: courses.title, holder: users.fullName, org: organizations.displayName }).from(certificates).innerJoin(courses, eq(courses.id, certificates.courseId)).innerJoin(users, eq(users.id, certificates.userId))
      .leftJoin(organizations, eq(organizations.id, certificates.organizationId)).where(eq(certificates.code, code.trim().toUpperCase())).limit(1);
    if (!r) throw new NotFoundException('No certificate with this code');
    return { code: r.x.code, holder: r.holder, organization: r.org, course: r.title, issuedAt: r.x.issuedAt, expiresAt: r.x.expiresAt, status: r.x.revokedAt ? 'revoked' : r.x.expiresAt < new Date() ? 'expired' : 'valid' };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
@ApiTags('marketing')
@Controller()
export class MarketingController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  /** 113/115 — approved assets visible at the caller's membership level. */
  @Get('marketing/assets')
  @RequireOrg()
  async assets(@Ctx() ctx: RequestContext, @Query('kind') kind?: string) {
    const rank = LEVELS.indexOf(ctx.orgMembershipLevel ?? 'registered');
    const list = await this.db.select().from(marketingAssets).where(and(eq(marketingAssets.status, 'approved'), kind ? eq(marketingAssets.kind, kind) : undefined)).orderBy(marketingAssets.kind, marketingAssets.title);
    return list.map((a) => ({ ...a, locked: LEVELS.indexOf(a.minLevel) > rank, body: LEVELS.indexOf(a.minLevel) > rank ? null : a.body, minLevelName: `${levelName(a.minLevel)} partner` }));
  }

  @Post('marketing/assets/:id/use')
  @RequireOrg()
  @HttpCode(200)
  async use(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ kind: z.enum(['copy', 'download']) }))) b: { kind: 'copy' | 'download' }) {
    const [a] = await this.db.select().from(marketingAssets).where(and(eq(marketingAssets.id, id), eq(marketingAssets.status, 'approved'))).limit(1);
    if (!a) throw new NotFoundException('Asset not found');
    if (LEVELS.indexOf(a.minLevel) > LEVELS.indexOf(ctx.orgMembershipLevel ?? 'registered')) throw new ForbiddenException(`Available to ${levelName(a.minLevel)} partners and above`);
    await this.db.insert(assetUses).values({ assetId: id, organizationId: ctx.orgId!, userId: ctx.userId, kind: b.kind });
    return { ok: true };
  }

  /** 114 — co-branded brochure. Verified partners only; Unite Group branding and disclaimer are fixed and cannot be edited. */
  @Post('marketing/brochure')
  @RequireOrg()
  @HttpCode(200)
  async brochure(@Ctx() ctx: RequestContext, @Body(body(BrochureSchema)) b: z.infer<typeof BrochureSchema>) {
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Co-branded material is available to verified partners');
    const [o] = await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId!)).limit(1);
    const [p] = await this.db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, o.id)).limit(1);
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(o.displayName)} — ${esc(b.headline)}</title>
<style>body{font-family:Inter,-apple-system,Segoe UI,sans-serif;color:#011E48;margin:0}main{max-width:720px;margin:0 auto;padding:48px}h1{font-size:34px;letter-spacing:-.02em;margin:8px 0 12px}
.eyebrow{color:#2E7D32;font-weight:600;font-size:14px}ul{padding-left:20px;line-height:1.8}.badge{display:inline-block;background:#E7F4E3;color:#2F6F25;border-radius:999px;padding:4px 12px;font-size:13px;font-weight:600}
footer{margin-top:40px;border-top:1px solid #E3E7EE;padding-top:16px;font-size:12px;color:#5E6573}</style></head><body><main>
<div class="eyebrow">${esc(o.displayName)} · in partnership with Unite Group</div><h1>${esc(b.headline)}</h1>
<p>${esc(p?.headline ?? '')}</p><p><span class="badge">Verified COLLABIZ partner · ${esc(levelName(o.membershipLevel))}</span></p>
<h2>${esc(b.sector)}</h2><ul>${b.services.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
<p>${esc(o.city ?? '')}${o.city ? ', ' : ''}${esc(o.country)}</p>
<footer>Co-branded with Unite Group through COLLABIZ. Unite Group branding is used under the partner brand guidelines; it does not imply that Unite Group has approved any specific quotation or warranty. Verification ID ${o.id.slice(0, 8).toUpperCase()}.</footer>
</main></body></html>`;
    await this.db.insert(assetUses).values({ assetId: b.assetId, organizationId: o.id, userId: ctx.userId, kind: 'cobrand' });
    await this.audit.record(ctx, { action: 'marketing.brochure_generated', objectType: 'organization', objectId: o.id, after: { headline: b.headline } });
    return { html, fileName: `${o.displayName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-brochure.html` };
  }

  @Post('admin/marketing/assets')
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(z.object({ kind: z.enum(['brochure', 'social', 'guide']), title: z.string().trim().min(3).max(200), body: z.string().trim().min(10).max(10000), sector: z.string().optional(), channel: z.string().optional(), minLevel: z.enum(['registered', 'verified', 'certified', 'strategic', 'country_partner']).default('registered') }))) b: Record<string, string>) {
    if (!ctx.platformRoles.some((r) => ['super_admin', 'unite_admin', 'moderator'].includes(r))) throw new ForbiddenException('Only COLLABIZ staff publish marketing assets');
    const [a] = await this.db.insert(marketingAssets).values({ kind: b.kind, title: b.title, body: b.body, sector: b.sector, channel: b.channel, minLevel: b.minLevel, approvedBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'marketing.asset_approved', objectType: 'marketing_asset', objectId: a.id });
    return a;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
@Injectable()
export class AiService {
  constructor(@InjectDb() private db: Db) {}
  async enabled(kind: string) {
    const [s] = await this.db.select().from(aiSettings).where(eq(aiSettings.kind, kind)).limit(1);
    return s ? s.enabled : true;
  }
  async assertEnabled(kind: string) {
    if (!(await this.enabled(kind))) throw new ForbiddenException('This AI assistant has been turned off by the COLLABIZ administrator');
  }
  async save(ctx: RequestContext, kind: string, input: unknown, output: unknown, sources: unknown[], opportunityId?: string | null) {
    const [s] = await this.db.insert(aiSuggestions).values({ kind, organizationId: ctx.orgId!, userId: ctx.userId, opportunityId: opportunityId ?? null, input, output, sources, provider: config().AI_PROVIDER, promptVersion: PROMPT_VERSION }).returning();
    return s;
  }
}

@ApiTags('ai')
@Controller()
export class AiController {
  constructor(@InjectDb() private db: Db, private ai: AiService, private rep: ReputationService, private opps: OpportunitiesService, private audit: AuditService) {}

  private async partners(exceptOrg: string) {
    const list = await this.db.select({ o: organizations, p: partnerProfiles }).from(organizations).innerJoin(partnerProfiles, eq(partnerProfiles.organizationId, organizations.id))
      .where(and(eq(organizations.verificationStatus, 'verified'), ne(organizations.id, exceptOrg), inArray(organizations.type, ['partner_company', 'partner_individual'])));
    return Promise.all(list.map(async (r) => ({ id: r.o.id, name: r.o.displayName, sectors: r.p.sectors, regions: r.p.regions, capacityMax: r.p.capacityMax, certifications: r.p.certifications, reputationScore: (await this.rep.score(r.o.id)).score, verified: true, consentToMatch: r.p.consentToMatch, level: r.o.membershipLevel })));
  }

  /** 160 — explainable opportunity matches with reasons and uncertainty; feedback improves nothing silently — it is logged for review. */
  @Get('ai/matching')
  @RequireOrg()
  async matching(@Ctx() ctx: RequestContext) {
    await this.ai.assertEnabled('opportunity_match');
    const feed = await this.opps.feed(ctx);
    const dismissed = await this.db.select({ id: aiSuggestions.opportunityId }).from(aiSuggestions).where(and(eq(aiSuggestions.organizationId, ctx.orgId!), eq(aiSuggestions.kind, 'opportunity_match'), eq(aiSuggestions.status, 'rejected')));
    const hide = new Set(dismissed.map((d) => d.id));
    return { consent: feed.consent, provider: config().AI_PROVIDER, promptVersion: PROMPT_VERSION,
      items: feed.items.filter((i) => !hide.has(i.opportunity.id)).map((i) => ({ opportunity: { id: i.opportunity.id, code: i.opportunity.code, title: i.opportunity.title, sector: i.opportunity.sector, city: i.opportunity.city, estimatedValue: i.opportunity.estimatedValue, deadline: i.opportunity.deadline, publisher: i.opportunity.publisher }, match: i.match })) };
  }

  @Post('ai/matching/:opportunityId/feedback')
  @RequireOrg()
  @HttpCode(200)
  async matchFeedback(@Ctx() ctx: RequestContext, @Param('opportunityId', ParseUUIDPipe) oid: string, @Body(body(z.object({ useful: z.boolean(), reason: z.string().trim().max(300).optional() }))) b: { useful: boolean; reason?: string }) {
    const s = await this.ai.save(ctx, 'opportunity_match', { opportunityId: oid }, { useful: b.useful }, [], oid);
    await this.db.update(aiSuggestions).set({ status: b.useful ? 'accepted' : 'rejected', feedback: b.reason, reviewedAt: new Date() }).where(eq(aiSuggestions.id, s.id));
    return { ok: true };
  }

  /** 161 — recommended partners for a sector or opportunity, now weighted by verified reputation. */
  @Post('ai/partners')
  @RequireOrg()
  @HttpCode(200)
  async recommend(@Ctx() ctx: RequestContext, @Body(body(z.object({ opportunityId: z.string().uuid().optional(), sector: z.string().optional(), region: z.string().optional() }))) b: { opportunityId?: string; sector?: string; region?: string }) {
    await this.ai.assertEnabled('partner_match');
    let target = { category: b.sector ?? '', region: b.region ?? null, value: null as number | null, requiredCertifications: [] as string[] };
    if (b.opportunityId) { const { row } = await this.opps.getVisible(ctx, b.opportunityId); target = { category: row.sector, region: row.region, value: row.estimatedValue, requiredCertifications: row.requiredCertifications }; }
    if (!target.category) throw new BadRequestException('Choose a sector or an opportunity');
    const all = await this.partners(ctx.orgId!);
    const ranked = rankPartners(all, target, 8).map((s) => ({ ...s, reputation: all.find((p) => p.id === s.partnerId)?.reputationScore ?? null }));
    const s = await this.ai.save(ctx, 'partner_match', b, { suggestions: ranked.map((r) => ({ partnerId: r.partnerId, score: r.score })) }, [{ type: 'partner_profiles', count: all.length }, { type: 'reputation', note: 'verified outcomes and reviews' }], b.opportunityId);
    return { suggestionId: s.id, target: { ...target, sectorName: sectorName(target.category) }, suggestions: ranked, excludedForConsent: all.filter((p) => !p.consentToMatch).length, provider: s.provider, promptVersion: s.promptVersion };
  }

  /** 162 — proposes team roles for an opportunity and the best partners for each gap. Creating the team stays a human action. */
  @Post('ai/team-builder')
  @RequireOrg()
  @HttpCode(200)
  async teamBuilder(@Ctx() ctx: RequestContext, @Body(body(z.object({ opportunityId: z.string().uuid() }))) b: { opportunityId: string }) {
    await this.ai.assertEnabled('team_builder');
    const { row } = await this.opps.getVisible(ctx, b.opportunityId);
    const [me] = await this.db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, ctx.orgId!)).limit(1);
    const all = await this.partners(ctx.orgId!);
    const roles: { role: string; why: string; covered: boolean; target: { category: string; region: string | null; value: number | null; requiredCertifications: string[] } }[] = [];
    roles.push({ role: `Lead — ${sectorName(row.sector)}`, why: 'Owns delivery and the client relationship', covered: !!me?.sectors.includes(row.sector), target: { category: row.sector, region: row.region, value: row.estimatedValue, requiredCertifications: [] } });
    for (const c of row.requiredCertifications) roles.push({ role: `Certified partner (${c.replace(/^ISO(\d+)/, 'ISO $1')})`, why: `The listing requires ${c}`, covered: !!me?.certifications.includes(c), target: { category: row.sector, region: row.region, value: null, requiredCertifications: [c] } });
    if (row.region && !me?.regions.some((r) => r === row.region || row.region!.startsWith(r))) roles.push({ role: 'Local execution partner', why: 'The site is outside your declared coverage', covered: false, target: { category: row.sector, region: row.region, value: null, requiredCertifications: [] } });
    if (row.estimatedValue && me?.capacityMax && me.capacityMax < row.estimatedValue) roles.push({ role: 'Capacity partner', why: 'The value exceeds your declared capacity', covered: false, target: { category: row.sector, region: row.region, value: row.estimatedValue - me.capacityMax, requiredCertifications: [] } });
    const plan = roles.map((r) => ({ role: r.role, why: r.why, coveredByYou: r.covered, candidates: r.covered ? [] : rankPartners(all, r.target, 3).map((s) => ({ partnerId: s.partnerId, partnerName: s.partnerName, score: s.score, reputation: all.find((p) => p.id === s.partnerId)?.reputationScore ?? null, factors: s.factors })) }));
    const s = await this.ai.save(ctx, 'team_builder', b, { plan }, [{ type: 'opportunity', id: row.id, code: row.code }, { type: 'your_profile' }, { type: 'partner_profiles', count: all.length }], row.id);
    return { suggestionId: s.id, opportunity: { id: row.id, code: row.code, title: row.title }, plan, provider: s.provider, promptVersion: s.promptVersion, note: 'Suggestions only. Invite partners from Collaboration → New team; nobody is contacted automatically.' };
  }

  /** 072 — proposal draft for a tender or opportunity, assembled from your verified profile and the published scope. */
  @Post('ai/proposal-draft')
  @RequireOrg()
  @HttpCode(200)
  async proposal(@Ctx() ctx: RequestContext, @Body(body(z.object({ tenderId: z.string().uuid().optional(), opportunityId: z.string().uuid().optional() }).refine((v) => !!v.tenderId !== !!v.opportunityId, 'Choose a tender or an opportunity'))) b: { tenderId?: string; opportunityId?: string }) {
    await this.ai.assertEnabled('proposal_draft');
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Proposal drafting is available to verified partners');
    let subject: { id: string; code: string; title: string; scope: string; sector: string };
    if (b.tenderId) {
      const [t] = await this.db.select().from(tenders).where(and(eq(tenders.id, b.tenderId), inArray(tenders.status, ['published', 'closed', 'opened', 'technical_evaluation']))).limit(1);
      if (!t) throw new NotFoundException('Tender not found');
      subject = { id: t.id, code: t.code, title: t.title, scope: t.scope, sector: t.sector };
    } else {
      const { row } = await this.opps.getVisible(ctx, b.opportunityId!);
      subject = { id: row.id, code: row.code, title: row.title, scope: row.summary, sector: row.sector };
    }
    const [o] = await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId!)).limit(1);
    const [p] = await this.db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, o.id)).limit(1);
    const score = await this.rep.score(o.id);
    const past = ((p?.pastProjects as { title?: string; client?: string; year?: number }[] | null) ?? []).slice(0, 3);
    const sections = [
      { heading: 'Understanding of the requirement', body: `${o.displayName} has reviewed ${subject.code} — ${subject.title}. Our reading of the scope: ${subject.scope.slice(0, 600)}`, source: 'Published scope' },
      { heading: 'Proposed approach', body: `We propose a phased delivery: site survey and design confirmation, mobilisation, execution against agreed milestones, and handover with documentation. [Add your method statement, equipment and team here.]`, source: 'Template — edit before use' },
      { heading: 'Relevant experience', body: past.length ? past.map((x) => `• ${x.title ?? 'Project'}${x.client ? ` for ${x.client}` : ''}${x.year ? ` (${x.year})` : ''}`).join('\n') : '[Add two or three comparable projects with client, size and year.]', source: past.length ? 'Your partner profile — past projects' : 'Missing from your profile' },
      { heading: 'Track record on COLLABIZ', body: score.outcomes ? `${score.outcomes} certified milestone(s), ${score.onTimeOutcomes} on time${score.score != null ? `; verified reputation score ${score.score}/100` : ''}.` : 'No certified milestones on COLLABIZ yet.', source: 'Verified outcomes on COLLABIZ' },
      { heading: 'Certifications & capacity', body: `${p?.certifications.length ? `Certifications: ${p.certifications.join(', ')}.` : '[List relevant certifications.]'}${p?.capacityMax ? ` Declared capacity up to ${inrShort(p.capacityMax)} per project.` : ''}`, source: 'Your partner profile' },
      { heading: 'Commercials', body: '[Price, payment terms and validity are entered by you in the bid form. The assistant never proposes prices.]', source: 'Deliberately left blank' },
    ];
    const s = await this.ai.save(ctx, 'proposal_draft', b, { sections }, [{ type: b.tenderId ? 'tender' : 'opportunity', id: subject.id, code: subject.code }, { type: 'partner_profile', id: o.id }, { type: 'reputation', outcomes: score.outcomes }], b.opportunityId);
    return { suggestionId: s.id, subject: { code: subject.code, title: subject.title }, sections, provider: s.provider, promptVersion: s.promptVersion,
      notice: 'Draft only. Review every section, replace the bracketed parts and paste it into your bid or application yourself. Nothing has been submitted.' };
  }

  @Post('ai/suggestions/:id/review')
  @RequireOrg()
  @HttpCode(200)
  async review(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(AiReviewSchema)) b: z.infer<typeof AiReviewSchema>) {
    const [s] = await this.db.select().from(aiSuggestions).where(and(eq(aiSuggestions.id, id), eq(aiSuggestions.organizationId, ctx.orgId!))).limit(1);
    if (!s) throw new NotFoundException('Suggestion not found');
    if (s.status !== 'draft') throw new ConflictException('This suggestion has already been reviewed');
    const [u] = await this.db.update(aiSuggestions).set({ status: b.status, feedback: b.feedback, reviewedAt: new Date() }).where(eq(aiSuggestions.id, id)).returning();
    await this.audit.record(ctx, { action: `ai.suggestion_${b.status}`, objectType: 'ai_suggestion', objectId: id });
    return { id: u.id, status: u.status };
  }

  /** 140 — monitoring: volumes, acceptance, feedback and switches. Super admin only. */
  @Get('admin/ai')
  async overview(@Ctx() ctx: RequestContext) {
    if (!ctx.platformRoles.includes('super_admin')) throw new ForbiddenException('Super admin only');
    const stats = rows(await this.db.execute(sql`select kind, count(*)::int as total, count(*) filter (where status = 'accepted')::int as accepted, count(*) filter (where status = 'edited')::int as edited,
      count(*) filter (where status = 'rejected')::int as rejected, count(*) filter (where status = 'draft')::int as pending, max(created_at) as last_at from ai_suggestions group by kind`));
    const settings = await this.db.select().from(aiSettings);
    const recent = await this.db.select({ s: aiSuggestions, org: organizations.displayName }).from(aiSuggestions).innerJoin(organizations, eq(organizations.id, aiSuggestions.organizationId)).orderBy(desc(aiSuggestions.createdAt)).limit(25);
    return { provider: config().AI_PROVIDER, promptVersion: PROMPT_VERSION,
      capabilities: AI_KINDS.map((k) => { const st = stats.find((x) => x.kind === k); const reviewed = Number(st?.accepted ?? 0) + Number(st?.edited ?? 0) + Number(st?.rejected ?? 0);
        return { kind: k, enabled: settings.find((x) => x.kind === k)?.enabled ?? true, total: Number(st?.total ?? 0), pending: Number(st?.pending ?? 0), acceptance: reviewed ? Math.round(((Number(st!.accepted) + Number(st!.edited)) / reviewed) * 100) : null, lastAt: st?.last_at ?? null }; }),
      recent: recent.map((r) => ({ id: r.s.id, kind: r.s.kind, org: r.org, status: r.s.status, feedback: r.s.feedback, provider: r.s.provider, promptVersion: r.s.promptVersion, sources: r.s.sources, createdAt: r.s.createdAt })),
      safeguards: ['Suggestions are drafts; accepting one never submits, applies, awards or pays', 'Only verified partners who consented to matching are ranked', 'Reputation comes from verified outcomes; paid placement has no input', 'Proposal drafts never include prices'] };
  }

  @Put('admin/ai/settings')
  async setSetting(@Ctx() ctx: RequestContext, @Body(body(z.object({ kind: z.enum(AI_KINDS), enabled: z.boolean(), reason: z.string().trim().min(10).max(500) }))) b: { kind: string; enabled: boolean; reason: string }) {
    if (!ctx.platformRoles.includes('super_admin')) throw new ForbiddenException('Super admin only');
    await this.db.insert(aiSettings).values({ kind: b.kind, enabled: b.enabled, updatedBy: ctx.userId }).onConflictDoUpdate({ target: aiSettings.kind, set: { enabled: b.enabled, updatedBy: ctx.userId, updatedAt: new Date() } });
    await this.audit.record(ctx, { action: `ai.${b.enabled ? 'enabled' : 'disabled'}`, objectType: 'ai_setting', objectId: null as unknown as string, reason: b.reason, after: { kind: b.kind } });
    return { kind: b.kind, enabled: b.enabled };
  }
}

@Module({ imports: [OpportunitiesModule], controllers: [ReputationController, LearningController, MarketingController, AiController], providers: [ReputationService, AiService], exports: [ReputationService] })
export class GrowthModule {}
