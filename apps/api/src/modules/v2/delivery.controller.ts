/**
 * V2 Stage 03 + 04 — Project work packages and the tender eligibility analyzer.
 *
 * Work packages (tested in test/v2-delivery.e2e.ts):
 *  - The project's owner or lead company splits it into packages (civil, electrical, …) whose budgets together can never
 *    exceed the project value — packages split revenue, they never add to it.
 *  - Opened packages are listed to verified partners, with the reasons when a partner is not eligible. Eligible partners bid
 *    once (and may revise while open); the project manager awards one bid, which adds the winner to the project as a
 *    subcontractor for that package. Progress rolls up to the project weighted by budget.
 * Tender analyzer:
 *  - A PDF tender is read page by page; each eligibility condition is shown with its page and line. It is compared with the
 *    company's self-declared profile and documents; results are indicative and say so until an authorised reviewer confirms.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PACKAGE_CATEGORY_LABELS, PackageBidSchema, WorkPackageSchema, compareEligibility, extractTenderCriteria, packageBudgetCheck, packageEligibility, rankPartners, rolledUpProgress, type Criterion } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { kybDocuments, memberships, notifications, organizations, partnerProfiles, projectMembers, projects, tenderAnalyses, tenders, workPackageBids, workPackages } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { MAX_UPLOAD_BYTES, StorageService } from '../../common/adapters';
import { randomDigits } from '../../common/crypto';
import { GrowthModule } from '../growth/growth.controller';
import { DealsController, V2Service } from './deals.controller';
import { OneController } from './one.controller';

const PARTNER = ['partner_company', 'partner_individual'];
const platform = (ctx: RequestContext) => ctx.platformRoles.length > 0 && !ctx.mfaRequiredButMissing;
const reviewer = (ctx: RequestContext) => ctx.platformRoles.some((r) => ['super_admin', 'unite_admin', 'evaluator'].includes(r)) && !ctx.mfaRequiredButMissing;
const manager = (ctx: RequestContext, orgId: string) => ctx.memberships.some((m) => m.organizationId === orgId && (m.role === 'org_owner' || m.role === 'org_admin'));

/** Text of each PDF page (lines kept), using pdf-parse's page renderer. */
async function pdfPages(buf: Buffer): Promise<string[]> {
  const pages: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const parse = require('pdf-parse/lib/pdf-parse.js') as (b: Buffer, o: object) => Promise<unknown>;
  await parse(buf, {
    pagerender: async (pd: { getTextContent: (o: object) => Promise<{ items: { str: string; transform: number[] }[] }> }) => {
      const tc = await pd.getTextContent({ normalizeWhitespace: true });
      let last: number | null = null; let text = '';
      for (const it of tc.items) { text += last == null || Math.abs(it.transform[5] - last) < 2 ? (text && !text.endsWith('\n') ? ' ' : '') + it.str : `\n${it.str}`; last = it.transform[5]; }
      pages.push(text); return text;
    },
  });
  return pages;
}

@ApiTags('v2 delivery')
@Controller()
export class DeliveryController {
  constructor(@InjectDb() private db: Db, private svc: V2Service, private audit: AuditService, private storage: StorageService) {}

  // ================= Work packages =================
  private async project(ctx: RequestContext, id: string) {
    const [p] = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!p) throw new NotFoundException('Project not found');
    const manage = platform(ctx) || manager(ctx, p.ownerOrgId) || manager(ctx, p.leadOrgId);
    const member = manage || ctx.memberships.some((m) => [p.ownerOrgId, p.leadOrgId].includes(m.organizationId)) || (ctx.orgId ? (await this.db.select({ id: projectMembers.id }).from(projectMembers).where(and(eq(projectMembers.projectId, id), eq(projectMembers.organizationId, ctx.orgId), eq(projectMembers.status, 'active'))).limit(1)).length > 0 : false);
    if (!member) throw new NotFoundException('Project not found');
    return { p, manage };
  }

  @Get('projects/:id/packages')
  async list(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { p, manage } = await this.project(ctx, id);
    const pk = await this.db.select({ w: workPackages, winner: organizations.displayName }).from(workPackages).leftJoin(organizations, eq(organizations.id, workPackages.awardedOrgId)).where(eq(workPackages.projectId, id)).orderBy(asc(workPackages.createdAt));
    const bids = manage && pk.length ? await this.db.select({ b: workPackageBids, org: organizations.displayName }).from(workPackageBids).innerJoin(organizations, eq(organizations.id, workPackageBids.organizationId)).where(inArray(workPackageBids.packageId, pk.map((x) => x.w.id))).orderBy(asc(workPackageBids.amount)) : [];
    const live = pk.filter((x) => x.w.status !== 'cancelled');
    const used = live.reduce((a, x) => a + x.w.budget, 0);
    return {
      project: { id: p.id, code: p.code, title: p.title, value: p.value, region: p.region }, canManage: manage,
      totals: { packages: live.length, budgeted: used, remaining: p.value - used, awarded: live.reduce((a, x) => a + (x.w.awardedValue ?? 0), 0), progress: rolledUpProgress(live.map((x) => ({ budget: x.w.budget, progress: x.w.progress, status: x.w.status }))) },
      packages: pk.map(({ w, winner }) => ({ ...w, categoryLabel: PACKAGE_CATEGORY_LABELS[w.category], winner, bids: bids.filter((b) => b.b.packageId === w.id).map((b) => ({ id: b.b.id, organization: b.org, organizationId: b.b.organizationId, amount: b.b.amount, days: b.b.days, note: b.b.note, status: b.b.status })) })),
      note: 'Package budgets split the project value; they are not extra revenue.',
    };
  }

  @Post('projects/:id/packages')
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(WorkPackageSchema)) b: z.infer<typeof WorkPackageSchema>) {
    const { p, manage } = await this.project(ctx, id);
    if (!manage) throw new ForbiddenException('Only the project owner or lead company splits the project');
    const existing = await this.db.select({ budget: workPackages.budget }).from(workPackages).where(and(eq(workPackages.projectId, id), ne(workPackages.status, 'cancelled')));
    const chk = packageBudgetCheck(p.value, existing.map((x) => x.budget), b.budget);
    if (!chk.ok) throw new BadRequestException({ statusCode: 400, message: `Packages cannot add up to more than the project value — ₹${Math.round(chk.remaining / 100).toLocaleString('en-IN')} is left`, issues: [{ path: 'budget', message: 'Over the remaining project value' }] });
    if (new Date(b.closesAt) <= new Date()) throw new BadRequestException({ statusCode: 400, message: 'Choose a closing date in the future', issues: [{ path: 'closesAt', message: 'Must be in the future' }] });
    const [w] = await this.db.insert(workPackages).values({ ...b, closesAt: new Date(b.closesAt), projectId: id, code: `WP-${p.code.replace(/^PRJ-/, '')}-${randomDigits(3)}`, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'package.created', objectType: 'work_package', objectId: w.id, after: { project: p.code, category: b.category, budget: b.budget } });
    return w;
  }

  @Post('projects/:id/packages/:pid/status')
  @HttpCode(200)
  async status(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string, @Body(body(z.object({ status: z.enum(['open', 'cancelled', 'completed']) }))) b: { status: string }) {
    const { manage } = await this.project(ctx, id);
    if (!manage) throw new ForbiddenException('Only the project owner or lead company manages packages');
    const [w] = await this.db.select().from(workPackages).where(and(eq(workPackages.id, pid), eq(workPackages.projectId, id)));
    if (!w) throw new NotFoundException('Package not found');
    const allowed: Record<string, string[]> = { draft: ['open', 'cancelled'], open: ['cancelled'], awarded: ['cancelled'], in_progress: ['completed'], completed: [], cancelled: [] };
    if (!allowed[w.status].includes(b.status)) throw new ConflictException(`A package that is ${w.status} cannot become ${b.status}`);
    await this.db.update(workPackages).set({ status: b.status, progress: b.status === 'completed' ? 100 : w.progress, updatedAt: new Date() }).where(eq(workPackages.id, pid));
    if (b.status === 'open') {
      const el = w.eligibility as { sectors?: string[] };
      const cands = await this.db.select({ id: organizations.id }).from(organizations).innerJoin(partnerProfiles, eq(partnerProfiles.organizationId, organizations.id)).where(and(eq(organizations.verificationStatus, 'verified'), inArray(organizations.type, PARTNER)));
      const profs = el.sectors?.length ? await this.db.select({ id: partnerProfiles.organizationId, sectors: partnerProfiles.sectors }).from(partnerProfiles).where(inArray(partnerProfiles.organizationId, cands.map((c) => c.id))) : cands.map((c) => ({ id: c.id, sectors: [] as string[] }));
      for (const c of profs.filter((x) => !el.sectors?.length || el.sectors.some((s) => x.sectors.includes(s))).slice(0, 50)) await this.svc.notifyOrg(c.id, `New work package: ${w.title}`, `${PACKAGE_CATEGORY_LABELS[w.category]} — bids close ${w.closesAt.toLocaleDateString('en-IN')}`, '/packages');
    }
    await this.audit.record(ctx, { action: `package.${b.status}`, objectType: 'work_package', objectId: pid, before: { status: w.status }, after: { status: b.status } });
    return { status: b.status };
  }

  private async profile(orgId: string) {
    const [o] = await this.db.select({ v: organizations.verificationStatus, type: organizations.type }).from(organizations).where(eq(organizations.id, orgId));
    const [p] = await this.db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, orgId));
    return { sectors: p?.sectors ?? [], regions: p?.regions ?? [], certifications: p?.certifications ?? [], annualTurnover: p?.annualTurnover ?? null, verified: o?.v === 'verified' && PARTNER.includes(o.type) };
  }

  @Get('packages')
  async open(@Ctx() ctx: RequestContext) {
    if (!ctx.orgId) return [];
    const me = await this.profile(ctx.orgId);
    const rows = await this.db.select({ w: workPackages, p: projects }).from(workPackages).innerJoin(projects, eq(projects.id, workPackages.projectId)).where(eq(workPackages.status, 'open')).orderBy(asc(workPackages.closesAt));
    const mine = await this.db.select().from(workPackageBids).where(eq(workPackageBids.organizationId, ctx.orgId));
    return rows.filter((r) => r.w.closesAt > new Date() && r.p.ownerOrgId !== ctx.orgId && r.p.leadOrgId !== ctx.orgId).map(({ w, p }) => {
      const e = packageEligibility(w.eligibility as object, me);
      const bid = mine.find((b) => b.packageId === w.id);
      return { id: w.id, code: w.code, title: w.title, scope: w.scope, category: w.category, categoryLabel: PACKAGE_CATEGORY_LABELS[w.category], budget: w.budget, closesAt: w.closesAt, project: { code: p.code, title: p.title, region: p.region }, eligible: e.eligible, reasons: e.reasons, myBid: bid ? { amount: bid.amount, days: bid.days, status: bid.status } : null };
    });
  }

  @Post('packages/:pid/bids')
  @HttpCode(201)
  async bid(@Ctx() ctx: RequestContext, @Param('pid', ParseUUIDPipe) pid: string, @Body(body(PackageBidSchema)) b: z.infer<typeof PackageBidSchema>) {
    if (!ctx.orgId || !manager(ctx, ctx.orgId)) throw new ForbiddenException('Your company owner or admin submits bids');
    const [w] = await this.db.select({ w: workPackages, p: projects }).from(workPackages).innerJoin(projects, eq(projects.id, workPackages.projectId)).where(eq(workPackages.id, pid));
    if (!w || w.w.status !== 'open' || w.w.closesAt <= new Date()) throw new ConflictException('This package is not open for bids');
    if ([w.p.ownerOrgId, w.p.leadOrgId].includes(ctx.orgId)) throw new BadRequestException('You manage this project');
    const e = packageEligibility(w.w.eligibility as object, await this.profile(ctx.orgId));
    if (!e.eligible) throw new ForbiddenException(`Not eligible: ${e.reasons.join('; ')}`);
    if (b.amount > w.w.budget * 1.5) throw new BadRequestException({ statusCode: 400, message: 'Bid is more than 50% above the package budget', issues: [{ path: 'amount', message: 'Too far above the budget' }] });
    const [row] = await this.db.insert(workPackageBids).values({ ...b, packageId: pid, organizationId: ctx.orgId, submittedBy: ctx.userId })
      .onConflictDoUpdate({ target: [workPackageBids.packageId, workPackageBids.organizationId], set: { amount: b.amount, days: b.days, note: b.note, status: 'submitted', submittedBy: ctx.userId, updatedAt: new Date() } }).returning();
    await this.audit.record(ctx, { action: 'package.bid', objectType: 'work_package', objectId: pid, after: { amount: b.amount, days: b.days } });
    return row;
  }

  @Post('projects/:id/packages/:pid/award')
  @HttpCode(200)
  async award(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string, @Body(body(z.object({ bidId: z.string().uuid() }))) b: { bidId: string }) {
    const { manage } = await this.project(ctx, id);
    if (!manage) throw new ForbiddenException('Only the project owner or lead company awards packages');
    return this.db.transaction(async (tx) => {
      const [w] = await tx.select().from(workPackages).where(and(eq(workPackages.id, pid), eq(workPackages.projectId, id))).for('update');
      if (!w || w.status !== 'open') throw new ConflictException('Only an open package can be awarded');
      const [bid] = await tx.select().from(workPackageBids).where(and(eq(workPackageBids.id, b.bidId), eq(workPackageBids.packageId, pid)));
      if (!bid || bid.status !== 'submitted') throw new NotFoundException('Bid not found');
      await tx.update(workPackages).set({ status: 'in_progress', awardedOrgId: bid.organizationId, awardedValue: bid.amount, updatedAt: new Date() }).where(eq(workPackages.id, pid));
      await tx.update(workPackageBids).set({ status: 'not_selected', updatedAt: new Date() }).where(and(eq(workPackageBids.packageId, pid), ne(workPackageBids.id, bid.id), eq(workPackageBids.status, 'submitted')));
      await tx.update(workPackageBids).set({ status: 'awarded', updatedAt: new Date() }).where(eq(workPackageBids.id, bid.id));
      // Already on the project (e.g. another package): add this package to their scope and allocation.
      await tx.insert(projectMembers).values({ projectId: id, organizationId: bid.organizationId, role: 'subcontractor', scope: `${w.code}: ${w.title}`, allocatedValue: bid.amount, addedBy: ctx.userId })
        .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.organizationId], set: { allocatedValue: sql`coalesce(${projectMembers.allocatedValue}, 0) + ${bid.amount}`, scope: sql`concat_ws('; ', ${projectMembers.scope}, ${`${w.code}: ${w.title}`}::text)`, status: 'active' } });
      await this.audit.record(ctx, { action: 'package.awarded', objectType: 'work_package', objectId: pid, after: { organizationId: bid.organizationId, amount: bid.amount } }, tx as unknown as Db);
      await this.svc.notifyOrg(bid.organizationId, `Work package awarded: ${w.title}`, `₹${Math.round(bid.amount / 100).toLocaleString('en-IN')} — report progress from the project.`, `/projects/${id}/packages`);
      return { status: 'in_progress', awardedOrgId: bid.organizationId };
    });
  }

  @Post('packages/:pid/progress')
  @HttpCode(200)
  async progress(@Ctx() ctx: RequestContext, @Param('pid', ParseUUIDPipe) pid: string, @Body(body(z.object({ progress: z.number().int().min(0).max(99) }))) b: { progress: number }) {
    const [w] = await this.db.select().from(workPackages).where(eq(workPackages.id, pid));
    if (!w || !w.awardedOrgId || !ctx.memberships.some((m) => m.organizationId === w.awardedOrgId)) throw new NotFoundException('Package not found');
    if (w.status !== 'in_progress') throw new ConflictException('Progress is reported while the package is in progress');
    await this.db.update(workPackages).set({ progress: b.progress, updatedAt: new Date() }).where(eq(workPackages.id, pid));
    await this.audit.record(ctx, { action: 'package.progress', objectType: 'work_package', objectId: pid, before: { progress: w.progress }, after: b });
    return { progress: b.progress };
  }

  // ================= Tender eligibility analyzer =================
  @Post('tender-analyses')
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async analyse(@Ctx() ctx: RequestContext, @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string } | undefined, @Body() raw: Record<string, string>) {
    if (!ctx.orgId) throw new ForbiddenException('Choose your company first');
    if (!file) throw new BadRequestException('Attach the tender document (PDF)');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('Upload the tender as a PDF');
    const tenderId = raw.tenderId && /^[0-9a-f-]{36}$/.test(raw.tenderId) ? raw.tenderId : null;
    if (tenderId && !(await this.db.select({ id: tenders.id }).from(tenders).where(eq(tenders.id, tenderId))).length) throw new BadRequestException('Unknown tender');
    const stored = await this.storage.put(file.buffer, file.mimetype, `tender-analyses/${ctx.orgId}`);
    const pages = await pdfPages(file.buffer).catch(() => [] as string[]);
    const criteria = extractTenderCriteria(pages);
    const [a] = await this.db.insert(tenderAnalyses).values({ orgId: ctx.orgId, tenderId, title: (raw.title || file.originalname).slice(0, 160), fileName: file.originalname.slice(0, 200), objectKey: stored.key, pages: pages.length, criteria, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'tender_analysis.created', objectType: 'tender_analysis', objectId: a.id, after: { pages: pages.length, criteria: criteria.length } });
    return this.analysisView(ctx, a.id);
  }

  @Get('tender-analyses')
  async mine(@Ctx() ctx: RequestContext) {
    if (!ctx.orgId) return [];
    const rows = await this.db.select().from(tenderAnalyses).where(eq(tenderAnalyses.orgId, ctx.orgId)).orderBy(desc(tenderAnalyses.createdAt)).limit(50);
    return rows.map((a) => ({ id: a.id, title: a.title, pages: a.pages, criteria: (a.criteria as unknown[]).length, status: a.status, createdAt: a.createdAt }));
  }

  @Get('tender-analyses/:id')
  async one(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) { return this.analysisView(ctx, id); }

  private async analysisView(ctx: RequestContext, id: string) {
    const [a] = await this.db.select().from(tenderAnalyses).where(eq(tenderAnalyses.id, id)).limit(1);
    if (!a || (a.orgId !== ctx.orgId && !reviewer(ctx))) throw new NotFoundException('Analysis not found');
    const [p] = await this.db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, a.orgId));
    const docs = await this.db.select({ t: kybDocuments.docType }).from(kybDocuments).where(and(eq(kybDocuments.organizationId, a.orgId), ne(kybDocuments.status, 'superseded')));
    const criteria = a.criteria as Criterion[];
    const cmp = compareEligibility(criteria, { annualTurnover: p?.annualTurnover ?? null, yearsExperience: p?.yearsExperience ?? null, certifications: p?.certifications ?? [], hasGstin: !!p?.gstin, employees: p?.employees ?? null, documents: docs.map((d) => d.t.replace(/_/g, ' ')) });
    // Consortium help: verified partners who declare what this company lacks.
    const missingCerts = cmp.rows.filter((r) => r.kind === 'certification' && r.status === 'not_met').map((r) => r.label);
    const all = await this.svc.partners(a.orgId);
    const helpers = missingCerts.length || cmp.rows.some((r) => r.kind === 'turnover' && r.status === 'not_met')
      ? rankPartners(all.filter((x) => missingCerts.every((c) => x.certifications.includes(c)) || !missingCerts.length), { category: p?.sectors[0] ?? 'construction', region: null, value: null, requiredCertifications: missingCerts }, 3).map((s) => ({ partnerId: s.partnerId, name: s.partnerName, score: s.score }))
      : [];
    return {
      id: a.id, title: a.title, fileName: a.fileName, pages: a.pages, status: a.status, reviewNote: a.reviewNote, reviewedAt: a.reviewedAt, createdAt: a.createdAt,
      ...cmp, consortiumCandidates: helpers,
      checklist: [...cmp.rows.filter((r) => r.status === 'needs_evidence' || r.kind === 'registration' || r.kind === 'certification').map((r) => `${r.label} — page ${r.page}`), 'Signed bid letter and power of attorney', 'Price bid in the prescribed format'],
      canReview: reviewer(ctx), isOwner: a.orgId === ctx.orgId,
    };
  }

  @Post('tender-analyses/:id/request-review')
  @HttpCode(200)
  async requestReview(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [a] = await this.db.select().from(tenderAnalyses).where(eq(tenderAnalyses.id, id));
    if (!a || a.orgId !== ctx.orgId) throw new NotFoundException('Analysis not found');
    if (a.status !== 'draft') throw new ConflictException('Review already requested');
    await this.db.update(tenderAnalyses).set({ status: 'review_requested' }).where(eq(tenderAnalyses.id, id));
    const admins = await this.db.selectDistinct({ u: memberships.userId }).from(memberships).where(and(inArray(memberships.role, ['unite_admin', 'super_admin', 'evaluator']), eq(memberships.status, 'active')));
    if (admins.length) await this.db.insert(notifications).values(admins.map((x) => ({ userId: x.u, kind: 'announcement', title: `Tender eligibility review requested: ${a.title}`, body: `${(a.criteria as unknown[]).length} conditions extracted.`, link: '/tender-reviews' })));
    await this.audit.record(ctx, { action: 'tender_analysis.review_requested', objectType: 'tender_analysis', objectId: id });
    return { status: 'review_requested' };
  }

  @Get('admin/tender-analyses')
  async queue(@Ctx() ctx: RequestContext) {
    if (!reviewer(ctx)) throw new ForbiddenException('Tender reviews are for Unite reviewers');
    const rows = await this.db.select({ a: tenderAnalyses, org: organizations.displayName }).from(tenderAnalyses).innerJoin(organizations, eq(organizations.id, tenderAnalyses.orgId)).where(ne(tenderAnalyses.status, 'draft')).orderBy(desc(tenderAnalyses.createdAt)).limit(100);
    return rows.map(({ a, org }) => ({ id: a.id, title: a.title, organization: org, pages: a.pages, criteria: (a.criteria as unknown[]).length, status: a.status, createdAt: a.createdAt }));
  }

  @Post('tender-analyses/:id/review')
  @HttpCode(200)
  async review(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ note: z.string().trim().min(10, { message: 'Write what you checked (at least 10 characters)' }).max(3000) }))) b: { note: string }) {
    if (!reviewer(ctx)) throw new ForbiddenException('Only authorised Unite reviewers confirm tender terms');
    const [a] = await this.db.select().from(tenderAnalyses).where(eq(tenderAnalyses.id, id));
    if (!a) throw new NotFoundException('Analysis not found');
    if (a.status !== 'review_requested') throw new ConflictException('The company has not asked for a review');
    await this.db.update(tenderAnalyses).set({ status: 'reviewed', reviewNote: b.note, reviewedBy: ctx.userId, reviewedAt: new Date() }).where(eq(tenderAnalyses.id, id));
    await this.svc.notifyOrg(a.orgId, `Tender reviewed: ${a.title}`, b.note.slice(0, 200), `/tenders/analyzer/${id}`);
    await this.audit.record(ctx, { action: 'tender_analysis.reviewed', objectType: 'tender_analysis', objectId: id, after: { note: b.note } });
    return { status: 'reviewed' };
  }
}

@Module({ imports: [GrowthModule], controllers: [DealsController, DeliveryController, OneController], providers: [V2Service] })
export class V2Module {}
