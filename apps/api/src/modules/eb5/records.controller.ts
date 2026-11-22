/**
 * GO EB5 — secure documents (encrypted, versioned, access-logged), case tracking with status provenance, EB-5 project
 * directory with evidence-gated claims, compliance-only partner compensation records, and the client portal summary.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { and, asc, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { EB5_CASE_STAGES, EB5_DOC_CATEGORIES, EB5_LEAD_STAGES, EB5_PROJECT_CLAIMS, EB5_STATUS_SOURCES, Eb5ProjectSchema, eb5Can } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { eb5Agreements, eb5Applications, eb5CaseMilestones, eb5Compensation, eb5Consultations, eb5DocAccess, eb5Documents, eb5Invoices, eb5Leads, eb5Partners, eb5Projects, organizations, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { MAX_UPLOAD_BYTES, StorageService } from '../../common/adapters';
import { Eb5Access } from './access';

type UploadFile = { buffer: Buffer; mimetype: string; size: number; originalname: string };
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

@ApiTags('eb5')
@Controller('eb5')
export class Eb5RecordsController {
  constructor(@InjectDb() private db: Db, private audit: AuditService, private a: Eb5Access, private storage: StorageService) {}

  // ------------------------------------------------------------------ documents
  private async doc(ctx: RequestContext, id: string) {
    const w = await this.a.open(ctx);
    const [d] = await this.db.select().from(eb5Documents).where(eq(eb5Documents.id, id));
    if (!d || d.status === 'deleted') throw new NotFoundException();
    const [l] = await this.db.select().from(eb5Leads).where(eq(eb5Leads.id, d.leadId));
    const client = l.clientUserId === ctx.userId;
    const attorney = w.roles.includes('attorney') && l.attorneyUserId === ctx.userId;
    const staff = eb5Can(w.roles, 'document.view_private') && (!w.roles.includes('attorney') || attorney || eb5Can(w.roles, 'lead.view_all'));
    if (!client && !staff) throw new NotFoundException(); // partners and everyone else: no access to private documents
    return { w, d, l, client, staff };
  }
  private log(documentId: string, userId: string, action: string) { return this.db.insert(eb5DocAccess).values({ documentId, userId, action }); }

  @Post('documents/request')
  @HttpCode(201)
  async request(@Ctx() ctx: RequestContext, @Body(body(z.object({ leadId: z.string().uuid(), category: z.enum(EB5_DOC_CATEGORIES), title: z.string().trim().min(3).max(140), note: z.string().trim().max(1000).optional(), expiresOn: z.string().regex(isoDate).optional(), retainUntil: z.string().regex(isoDate).optional() }))) b: { leadId: string; category: string; title: string; note?: string; expiresOn?: string; retainUntil?: string }) {
    const w = await this.a.need(ctx, 'document.request');
    const l = await this.a.lead(ctx, w, b.leadId);
    const [d] = await this.db.insert(eb5Documents).values({ leadId: l.id, category: b.category, title: b.title, note: b.note ?? null, requestedBy: ctx.userId, expiresOn: b.expiresOn ?? null, retainUntil: b.retainUntil ?? null }).returning();
    await this.audit.record(ctx, { action: 'eb5.document_requested', objectType: 'eb5_document', objectId: d.id, after: { category: b.category } });
    await this.a.notifyUsers([l.clientUserId], 'GO EB5 document requested', `${b.title} (${b.category}). Upload it securely in your portal.`, '/eb5/portal');
    return d;
  }

  @Post('documents/:id/upload')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: UploadFile) {
    const { d, l, client, w } = await this.doc(ctx, id);
    if (!client && !eb5Can(w.roles, 'document.request')) throw new ForbiddenException();
    if (!file) throw new BadRequestException('Choose a file');
    if (d.status === 'accepted') throw new ConflictException('This document was accepted; ask your manager to request a new version');
    const o = await this.storage.putEncrypted(file.buffer, file.mimetype, `eb5/${l.id}/docs`);
    const v = d.version + 1;
    const versions = [...(d.versions as unknown[]), { v, key: o.key, sha256: o.sha256, size: o.size, mime: o.mime, at: new Date().toISOString(), by: ctx.userId }];
    await this.db.update(eb5Documents).set({ objectKey: o.key, sha256: o.sha256, mime: o.mime, size: o.size, version: v, versions, status: 'uploaded', uploadedBy: ctx.userId, reviewNote: null, updatedAt: new Date() }).where(eq(eb5Documents.id, id));
    await this.log(id, ctx.userId, 'upload');
    await this.audit.record(ctx, { action: 'eb5.document_uploaded', objectType: 'eb5_document', objectId: id, after: { version: v, sha256: o.sha256 } });
    await this.a.notifyUsers([d.requestedBy, l.assignedManagerId], `GO EB5 document uploaded: ${d.title}`, `${l.code} · version ${v}`, `/eb5/documents/${id}`);
    return { id, version: v, status: 'uploaded' };
  }

  @Get('documents')
  async documents(@Ctx() ctx: RequestContext, @Query('leadId') leadId?: string) {
    const w = await this.a.open(ctx);
    const privileged = eb5Can(w.roles, 'document.view_private');
    if (!privileged && !w.roles.includes('client')) return [];
    const scope = privileged ? (w.roles.includes('attorney') && !eb5Can(w.roles, 'lead.view_all') ? eq(eb5Leads.attorneyUserId, ctx.userId) : undefined) : eq(eb5Leads.clientUserId, ctx.userId);
    return this.db.select({ id: eb5Documents.id, category: eb5Documents.category, title: eb5Documents.title, status: eb5Documents.status, version: eb5Documents.version, expiresOn: eb5Documents.expiresOn, updatedAt: eb5Documents.updatedAt, leadId: eb5Leads.id, lead: eb5Leads.code, name: eb5Leads.fullName, deletionRequestedAt: eb5Documents.deletionRequestedAt })
      .from(eb5Documents).innerJoin(eb5Leads, eq(eb5Leads.id, eb5Documents.leadId))
      .where(and(scope, leadId && /^[0-9a-f-]{36}$/.test(leadId) ? eq(eb5Leads.id, leadId) : undefined, sql`${eb5Documents.status} <> 'deleted'`)).orderBy(desc(eb5Documents.updatedAt)).limit(500);
  }

  @Get('documents/:id')
  async document(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { d, l, staff } = await this.doc(ctx, id);
    const access = staff ? await this.db.select({ action: eb5DocAccess.action, at: eb5DocAccess.at, who: users.fullName }).from(eb5DocAccess).innerJoin(users, eq(users.id, eb5DocAccess.userId)).where(eq(eb5DocAccess.documentId, id)).orderBy(desc(eb5DocAccess.at)).limit(100) : [];
    await this.log(id, ctx.userId, 'view');
    return { ...d, objectKey: undefined, versions: (d.versions as { v: number; sha256: string; size: number; at: string }[]).map(({ v, sha256, size, at }) => ({ v, sha256, size, at })), lead: { id: l.id, code: l.code, fullName: l.fullName }, access, canReview: staff };
  }

  @Get('documents/:id/file')
  async file(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { d } = await this.doc(ctx, id);
    if (!d.objectKey) throw new NotFoundException('Nothing uploaded yet');
    await this.log(id, ctx.userId, 'download');
    await this.audit.record(ctx, { action: 'eb5.document_downloaded', objectType: 'eb5_document', objectId: id, after: { version: d.version } });
    res.setHeader('Content-Type', d.mime ?? 'application/octet-stream'); res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${d.category.replace(/\W+/g, '-').toLowerCase()}-v${d.version}"`);
    res.send(await this.storage.getDecrypted(d.objectKey));
  }

  @Post('documents/:id/review')
  @HttpCode(200)
  async reviewDoc(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['accept', 'reject']), note: z.string().trim().max(1000).optional() }).refine((x) => x.decision === 'accept' || (x.note?.length ?? 0) >= 5, { message: 'Say what is wrong', path: ['note'] }))) b: { decision: 'accept' | 'reject'; note?: string }) {
    const { d, l, staff } = await this.doc(ctx, id);
    if (!staff) throw new ForbiddenException();
    if (d.status !== 'uploaded') throw new ConflictException('Nothing to review');
    await this.db.update(eb5Documents).set({ status: b.decision === 'accept' ? 'accepted' : 'rejected', reviewNote: b.note ?? null, updatedAt: new Date() }).where(eq(eb5Documents.id, id));
    await this.log(id, ctx.userId, 'review');
    await this.audit.record(ctx, { action: `eb5.document_${b.decision}ed`, objectType: 'eb5_document', objectId: id });
    if (b.decision === 'reject') await this.a.notifyUsers([l.clientUserId], `Please upload ${d.title} again`, b.note ?? '', '/eb5/portal');
    return { id, status: b.decision === 'accept' ? 'accepted' : 'rejected' };
  }

  @Post('documents/:id/deletion-request')
  @HttpCode(200)
  async deletionRequest(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { d, client } = await this.doc(ctx, id);
    if (!client) throw new ForbiddenException('Only the client requests deletion of their own documents');
    await this.db.update(eb5Documents).set({ deletionRequestedAt: new Date(), updatedAt: new Date() }).where(eq(eb5Documents.id, id));
    await this.log(id, ctx.userId, 'delete_request');
    await this.audit.record(ctx, { action: 'eb5.document_deletion_requested', objectType: 'eb5_document', objectId: id });
    await this.a.notifyUsers(await this.a.staffUsers(['compliance']), 'GO EB5 document deletion request', `${d.title} — check retention and legal hold before deleting.`, `/eb5/documents/${id}`);
    return { id, deletionRequested: true };
  }

  /** Compliance deletes the stored file after checking retention; the record and its audit history remain. */
  @Post('documents/:id/delete')
  @HttpCode(200)
  async deleteDoc(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(10).max(500) }))) b: { reason: string }) {
    await this.a.need(ctx, 'audit.view');
    const [d] = await this.db.select().from(eb5Documents).where(eq(eb5Documents.id, id));
    if (!d || d.status === 'deleted') throw new NotFoundException();
    if (d.retainUntil && d.retainUntil > new Date().toISOString().slice(0, 10)) throw new ConflictException(`This document must be kept until ${d.retainUntil}`);
    for (const v of d.versions as { key: string }[]) await this.storage.remove(v.key);
    await this.db.update(eb5Documents).set({ status: 'deleted', objectKey: null, versions: [], updatedAt: new Date() }).where(eq(eb5Documents.id, id));
    await this.audit.record(ctx, { action: 'eb5.document_deleted', objectType: 'eb5_document', objectId: id, after: { reason: b.reason } });
    return { id, status: 'deleted' };
  }

  // ------------------------------------------------------------------ case tracking
  @Get('cases')
  async cases(@Ctx() ctx: RequestContext) {
    const w = await this.a.open(ctx);
    if (!eb5Can(w.roles, 'case.record') && !eb5Can(w.roles, 'lead.view_all')) throw new ForbiddenException('Your GO EB5 role does not allow this');
    const scope = await this.a.leadScope(ctx, w);
    const rows = await this.db.select({ id: eb5Leads.id, code: eb5Leads.code, name: eb5Leads.fullName, country: eb5Leads.country, caseStage: eb5Leads.caseStage, stage: eb5Leads.stage, attorney: users.fullName })
      .from(eb5Leads).leftJoin(users, eq(users.id, eb5Leads.attorneyUserId)).where(and(scope ? sql`(${scope})` : undefined, or(gte(eb5Leads.stage, 11), gte(eb5Leads.caseStage, 1)))).orderBy(desc(eb5Leads.updatedAt));
    return rows.map((r) => ({ ...r, caseStageLabel: EB5_CASE_STAGES[r.caseStage], stageLabel: EB5_LEAD_STAGES[r.stage] }));
  }

  @Get('cases/:leadId')
  async caseDetail(@Ctx() ctx: RequestContext, @Param('leadId', ParseUUIDPipe) leadId: string) {
    const w = await this.a.open(ctx);
    const l = await this.a.lead(ctx, w, leadId);
    const rel = this.a.relation(ctx, w, l);
    if (rel === 'partner') throw new NotFoundException();
    const ms = await this.db.select({ m: eb5CaseMilestones, by: users.fullName }).from(eb5CaseMilestones).innerJoin(users, eq(users.id, eb5CaseMilestones.recordedBy)).where(eq(eb5CaseMilestones.leadId, l.id)).orderBy(asc(eb5CaseMilestones.createdAt));
    const visible = rel === 'client' ? ms.filter((x) => x.m.visibleToClient && ['attorney_verified', 'document_supported'].includes(x.m.statusSource)) : ms;
    return { lead: { id: l.id, code: l.code, fullName: l.fullName }, caseStage: l.caseStage, stages: EB5_CASE_STAGES, sources: EB5_STATUS_SOURCES, relation: rel,
      milestones: visible.map((x) => ({ ...x.m, by: x.by, stageLabel: EB5_CASE_STAGES[x.m.stage], sourceLabel: EB5_STATUS_SOURCES.find((s) => s.code === x.m.statusSource)?.label })),
      note: 'Tracking and coordination only — not legal representation. Processing times, approvals and outcomes are never predicted here.' };
  }

  @Post('cases/:leadId/milestones')
  @HttpCode(201)
  async milestone(@Ctx() ctx: RequestContext, @Param('leadId', ParseUUIDPipe) leadId: string, @Body(body(z.object({ stage: z.number().int().min(0).max(EB5_CASE_STAGES.length - 1), statusSource: z.enum(['client_reported', 'internal', 'attorney_verified', 'document_supported']), note: z.string().trim().min(5).max(2000), evidenceDocumentId: z.string().uuid().optional(), visibleToClient: z.boolean().default(false) }))) b: { stage: number; statusSource: string; note: string; evidenceDocumentId?: string; visibleToClient: boolean }) {
    const w = await this.a.need(ctx, 'case.record');
    const l = await this.a.lead(ctx, w, leadId);
    if (b.statusSource === 'attorney_verified' && !(w.roles.includes('attorney') && l.attorneyUserId === ctx.userId)) throw new ForbiddenException('Only the assigned attorney can record an attorney-verified status');
    if (b.statusSource === 'document_supported') {
      if (!b.evidenceDocumentId) throw new BadRequestException('Attach the accepted document that supports this status');
      const [d] = await this.db.select().from(eb5Documents).where(and(eq(eb5Documents.id, b.evidenceDocumentId), eq(eb5Documents.leadId, l.id)));
      if (!d || d.status !== 'accepted') throw new BadRequestException('The supporting document must belong to this client and be accepted');
    }
    if (b.visibleToClient && !['attorney_verified', 'document_supported'].includes(b.statusSource)) throw new BadRequestException('Only attorney-verified or document-supported updates are shown to the client');
    const [m] = await this.db.insert(eb5CaseMilestones).values({ leadId: l.id, stage: b.stage, statusSource: b.statusSource, note: b.note, evidenceDocumentId: b.evidenceDocumentId ?? null, visibleToClient: b.visibleToClient, recordedBy: ctx.userId }).returning();
    if (b.stage > l.caseStage && b.statusSource !== 'client_reported') await this.db.update(eb5Leads).set({ caseStage: b.stage, updatedAt: new Date() }).where(eq(eb5Leads.id, l.id));
    await this.audit.record(ctx, { action: 'eb5.case_milestone', objectType: 'eb5_lead', objectId: l.id, after: { stage: b.stage, source: b.statusSource } });
    if (b.visibleToClient) await this.a.notifyUsers([l.clientUserId], 'GO EB5 case update', EB5_CASE_STAGES[b.stage], '/eb5/portal');
    return m;
  }

  // ------------------------------------------------------------------ projects
  @Get('projects')
  async projects(@Ctx() ctx: RequestContext) {
    const w = await this.a.open(ctx);
    if (!eb5Can(w.roles, 'project.manage') && !eb5Can(w.roles, 'lead.view_all') && !w.roles.includes('compliance')) throw new ForbiddenException('Your GO EB5 role does not allow this');
    return this.db.select().from(eb5Projects).orderBy(desc(eb5Projects.createdAt));
  }

  @Post('projects')
  @HttpCode(201)
  async addProject(@Ctx() ctx: RequestContext, @Body(body(Eb5ProjectSchema)) b: z.infer<typeof Eb5ProjectSchema>) {
    await this.a.need(ctx, 'project.manage');
    const [p] = await this.db.insert(eb5Projects).values({ ...b, regionalCenter: b.regionalCenter ?? null, investmentThresholdUsd: b.investmentThresholdUsd ?? null, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'eb5.project_added', objectType: 'eb5_project', objectId: p.id, after: { name: b.name } });
    return p;
  }

  @Get('projects/:id')
  async project(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.projects(ctx);
    const [p] = await this.db.select().from(eb5Projects).where(eq(eb5Projects.id, id));
    if (!p) throw new NotFoundException();
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(eb5Leads).where(eq(eb5Leads.projectId, id));
    return { ...p, claimsList: EB5_PROJECT_CLAIMS.map((c) => ({ ...c, ...((p.claims as Record<string, unknown>)[c.key] as object ?? { status: 'none' }) })), linkedClients: n };
  }

  /** A claim (TEA, business plan, economic report, I-956F, offering documents) is recorded with evidence, then verified by compliance. */
  @Post('projects/:id/claims')
  @HttpCode(200)
  async claim(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ key: z.enum(EB5_PROJECT_CLAIMS.map((c) => c.key) as [string, ...string[]]), action: z.enum(['submit', 'verify', 'reject']), evidence: z.string().trim().min(10, 'Describe the evidence: document, issuer, date and reference').max(1000) }))) b: { key: string; action: 'submit' | 'verify' | 'reject'; evidence: string }) {
    const w = await this.a.open(ctx);
    const [p] = await this.db.select().from(eb5Projects).where(eq(eb5Projects.id, id));
    if (!p) throw new NotFoundException();
    const cur = ((p.claims as Record<string, { status: string; submittedBy?: string }>)[b.key]) ?? { status: 'none' };
    if (b.action === 'submit' && !eb5Can(w.roles, 'project.manage')) throw new ForbiddenException();
    if (b.action !== 'submit' && !eb5Can(w.roles, 'legal.approve')) throw new ForbiddenException('Compliance verifies project claims');
    if (b.action !== 'submit' && cur.status !== 'evidence_submitted') throw new ConflictException('No evidence submitted for this claim');
    if (b.action !== 'submit' && cur.submittedBy === ctx.userId) throw new ForbiddenException('Another person must verify the evidence you submitted');
    const next = b.action === 'submit' ? { status: 'evidence_submitted', evidence: b.evidence, submittedBy: ctx.userId, at: new Date().toISOString() } : { ...cur, status: b.action === 'verify' ? 'verified' : 'rejected', reviewNote: b.evidence, reviewedBy: ctx.userId, reviewedAt: new Date().toISOString() };
    const claims = { ...(p.claims as object), [b.key]: next };
    await this.db.update(eb5Projects).set({ claims, updatedAt: new Date() }).where(eq(eb5Projects.id, id));
    await this.audit.record(ctx, { action: `eb5.project_claim_${b.action}`, objectType: 'eb5_project', objectId: id, after: { key: b.key } });
    return this.project(ctx, id);
  }

  @Post('projects/:id/status')
  @HttpCode(200)
  async projectStatus(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ offeringStatus: z.enum(['proposed', 'in_preparation', 'offering', 'closed']), note: z.string().trim().min(5).max(500) }))) b: { offeringStatus: string; note: string }) {
    await this.a.need(ctx, 'project.manage');
    const [p] = await this.db.select().from(eb5Projects).where(eq(eb5Projects.id, id));
    if (!p) throw new NotFoundException();
    if (b.offeringStatus === 'offering') {
      const missing = EB5_PROJECT_CLAIMS.filter((c) => ((p.claims as Record<string, { status?: string }>)[c.key])?.status !== 'verified');
      if (missing.length) throw new ConflictException(`Not offering-ready: verify ${missing.map((m) => m.label).join(', ')} first`);
    }
    const milestones = [...(p.milestones as unknown[]), { at: new Date().toISOString(), by: ctx.userId, status: b.offeringStatus, note: b.note }];
    await this.db.update(eb5Projects).set({ offeringStatus: b.offeringStatus, milestones, updatedAt: new Date() }).where(eq(eb5Projects.id, id));
    await this.audit.record(ctx, { action: 'eb5.project_status', objectType: 'eb5_project', objectId: id, before: { status: p.offeringStatus }, after: { status: b.offeringStatus } });
    return this.project(ctx, id);
  }

  // ------------------------------------------------------------------ compensation (compliance only, never automatic)
  @Get('compensation')
  async compensation(@Ctx() ctx: RequestContext) {
    const w = await this.a.open(ctx);
    if (!eb5Can(w.roles, 'compensation.record') && !w.roles.includes('super_admin')) throw new ForbiddenException('Compliance only');
    const s = await this.a.settings();
    const rows = await this.db.select({ c: eb5Compensation, partner: organizations.displayName, lead: eb5Leads.code }).from(eb5Compensation).innerJoin(eb5Partners, eq(eb5Partners.id, eb5Compensation.partnerId)).innerJoin(organizations, eq(organizations.id, eb5Partners.orgId)).leftJoin(eb5Leads, eq(eb5Leads.id, eb5Compensation.leadId)).orderBy(desc(eb5Compensation.createdAt));
    return { enabled: s.legal.compensationApproved, records: rows.map((r) => ({ ...r.c, partner: r.partner, lead: r.lead })), note: 'EB-5 partner compensation is never calculated or paid automatically. Each record needs counsel’s approval reference; the COLLABIZ commission engine does not apply to EB-5.' };
  }

  @Post('compensation')
  @HttpCode(201)
  async addCompensation(@Ctx() ctx: RequestContext, @Body(body(z.object({ partnerId: z.string().uuid(), leadId: z.string().uuid().optional(), description: z.string().trim().min(10).max(500), amountCents: z.number().int().positive().optional() }))) b: { partnerId: string; leadId?: string; description: string; amountCents?: number }) {
    await this.a.need(ctx, 'compensation.record');
    const [c] = await this.db.insert(eb5Compensation).values({ partnerId: b.partnerId, leadId: b.leadId ?? null, description: b.description, amountCents: b.amountCents ?? null, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'eb5.compensation_recorded', objectType: 'eb5_compensation', objectId: c.id });
    return c;
  }

  @Post('compensation/:id/decide')
  @HttpCode(200)
  async decideCompensation(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['approve', 'reject']), legalReference: z.string().trim().min(5).max(300) }))) b: { decision: 'approve' | 'reject'; legalReference: string }) {
    await this.a.need(ctx, 'compensation.record');
    const s = await this.a.settings();
    if (b.decision === 'approve' && !s.legal.compensationApproved) throw new ConflictException('Partner compensation is disabled until counsel approves the arrangement (I-956K / securities review)');
    const [c] = await this.db.select().from(eb5Compensation).where(eq(eb5Compensation.id, id));
    if (!c || c.status !== 'pending_legal') throw new NotFoundException();
    if (c.createdBy === ctx.userId) throw new ForbiddenException('A second compliance officer must decide');
    await this.db.update(eb5Compensation).set({ status: b.decision === 'approve' ? 'approved' : 'rejected', legalReference: b.legalReference, decidedBy: ctx.userId, decidedAt: new Date() }).where(eq(eb5Compensation.id, id));
    await this.audit.record(ctx, { action: `eb5.compensation_${b.decision}d`, objectType: 'eb5_compensation', objectId: id, after: { legalReference: b.legalReference } });
    return { id, status: b.decision === 'approve' ? 'approved' : 'rejected' };
  }

  // ------------------------------------------------------------------ client portal
  @Get('portal')
  async portal(@Ctx() ctx: RequestContext) {
    const w = await this.a.open(ctx);
    if (!w.roles.includes('client')) throw new ForbiddenException('This is for GO EB5 clients');
    const [l] = await this.db.select().from(eb5Leads).where(eq(eb5Leads.clientUserId, ctx.userId)).orderBy(desc(eb5Leads.createdAt)).limit(1);
    const [ap] = await this.db.select({ id: eb5Applications.id, code: eb5Applications.code, status: eb5Applications.status }).from(eb5Applications).where(eq(eb5Applications.leadId, l.id));
    const cons = await this.db.select({ id: eb5Consultations.id, scheduledAt: eb5Consultations.scheduledAt, timezone: eb5Consultations.timezone, mode: eb5Consultations.mode, kind: eb5Consultations.kind, status: eb5Consultations.status, location: eb5Consultations.location })
      .from(eb5Consultations).where(eq(eb5Consultations.leadId, l.id)).orderBy(desc(eb5Consultations.scheduledAt)).limit(10);
    const ags = await this.db.select({ id: eb5Agreements.id, code: eb5Agreements.code, state: eb5Agreements.state }).from(eb5Agreements).where(and(eq(eb5Agreements.leadId, l.id), inArray(eb5Agreements.state, ['Sent to Client', 'Viewed', 'Signed', 'Counter-Signed', 'Active', 'Terminated']))).orderBy(desc(eb5Agreements.createdAt));
    const invs = await this.db.select({ id: eb5Invoices.id, number: eb5Invoices.number, amountCents: eb5Invoices.amountCents, status: eb5Invoices.status, receiptNumber: eb5Invoices.receiptNumber, description: eb5Invoices.description }).from(eb5Invoices).where(and(eq(eb5Invoices.leadId, l.id), eq(eb5Invoices.ledger, 'consultancy')));
    const docs = await this.db.select({ id: eb5Documents.id, title: eb5Documents.title, category: eb5Documents.category, status: eb5Documents.status, note: eb5Documents.note, reviewNote: eb5Documents.reviewNote }).from(eb5Documents).where(and(eq(eb5Documents.leadId, l.id), sql`${eb5Documents.status} <> 'deleted'`));
    const [mgr] = l.assignedManagerId ? await this.db.select({ name: users.fullName, email: users.email }).from(users).where(eq(users.id, l.assignedManagerId)) : [];
    const [att] = l.attorneyUserId ? await this.db.select({ name: users.fullName }).from(users).where(eq(users.id, l.attorneyUserId)) : [];
    const updates = await this.db.select({ stage: eb5CaseMilestones.stage, note: eb5CaseMilestones.note, source: eb5CaseMilestones.statusSource, at: eb5CaseMilestones.createdAt }).from(eb5CaseMilestones)
      .where(and(eq(eb5CaseMilestones.leadId, l.id), eq(eb5CaseMilestones.visibleToClient, true), inArray(eb5CaseMilestones.statusSource, ['attorney_verified', 'document_supported']))).orderBy(desc(eb5CaseMilestones.createdAt));
    const s = await this.a.settings();
    return { lead: { id: l.id, code: l.code, fullName: l.fullName, stage: l.stage, stageLabel: EB5_LEAD_STAGES[l.stage] }, application: ap ?? null, consultations: cons, agreements: ags, invoices: invs, documents: docs,
      manager: mgr ?? null, attorney: att ?? null, caseUpdates: updates.map((u) => ({ ...u, stageLabel: EB5_CASE_STAGES[u.stage] })), brand: s.brand, entity: s.consultancyEntity,
      disclaimer: `${s.brand} is a consultancy and coordination service of ${s.consultancyEntity}. It is not a law firm and does not give legal advice. No outcome, timeline or return is promised.` };
  }
}
