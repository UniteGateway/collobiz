import { BadRequestException, Body, Controller, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { addBusinessMinutes, DisputeCreateSchema, DisputeRulingSchema, DuplicateRulingSchema, LeadCreateSchema, RoutingDecisionSchema, type BusinessCalendar } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { groupCompanies, leadClaims, leadDocuments, organizations } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, RequireCaps, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { MAX_UPLOAD_BYTES, StorageService } from '../../common/adapters';
import { Idempotent } from '../../common/idempotency';
import { OpportunitiesModule } from '../opportunities/opportunities.controller';
import { LeadsService } from './leads.service';

const CalendarSchema = z.object({
  timezone: z.string().min(3).max(60).refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Unknown time zone'),
  workdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(100),
}).refine((c) => c.endHour > c.startHour, { message: 'Closing hour must be after opening hour', path: ['endHour'] });
const SlaSchema = z.object({ slaMinutes: z.number().int().min(30).max(5 * 24 * 60), calendar: CalendarSchema, autoReleaseOnBreach: z.boolean() });

/** Screens 026, 043–051, 151–153 (partner side). */
@ApiTags('leads')
@Controller()
export class LeadsController {
  constructor(@InjectDb() private db: Db, private svc: LeadsService, private storage: StorageService, private audit: AuditService) {}

  @Post('leads')
  @RequireCaps('lead.register')
  @RequireOrg()
  @Idempotent()
  @HttpCode(201)
  register(@Ctx() ctx: RequestContext, @Body(body(LeadCreateSchema)) b: z.infer<typeof LeadCreateSchema>) {
    return this.svc.register(ctx, b);
  }

  @Get('leads')
  @RequireOrg()
  mine(@Ctx() ctx: RequestContext) {
    return this.svc.myLeads(ctx);
  }

  @Get('leads/protection-summary')
  @RequireOrg()
  summary(@Ctx() ctx: RequestContext) {
    return this.svc.protectionSummary(ctx);
  }

  @Get('leads/:id')
  detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.detail(ctx, id);
  }

  @Get('leads/:id/documents')
  async docs(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.load(ctx, id);
    const rows = await this.db.select().from(leadDocuments).where(eq(leadDocuments.claimId, id)).orderBy(desc(leadDocuments.createdAt));
    return rows.map(({ objectKey: _k, ...d }) => d);
  }

  /** 047 — supporting evidence (private, hashed, audited). Adding evidence never changes the sealed registration snapshot. */
  @Post('leads/:id/documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  @HttpCode(201)
  async upload(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string } | undefined, @Body() raw: Record<string, string>) {
    const claim = await this.svc.load(ctx, id);
    if (!ctx.memberships.some((m) => m.organizationId === claim.introducerOrgId)) throw new NotFoundException();
    if (!file) throw new BadRequestException('Attach a file');
    const stored = await this.storage.put(file.buffer, file.mimetype, `leads/${id}`);
    const [d] = await this.db.insert(leadDocuments).values({ claimId: id, fileName: file.originalname.slice(0, 200), objectKey: stored.key, sha256: stored.sha256, size: stored.size, mime: stored.mime, description: raw.description?.slice(0, 500), uploadedBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'lead.document_uploaded', objectType: 'lead_claim', objectId: id, after: { file: d.fileName, sha256: d.sha256 } });
    const { objectKey: _k, ...out } = d;
    return out;
  }

  @Get('leads/:id/documents/:docId/url')
  async docUrl(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string) {
    await this.svc.load(ctx, id);
    const [d] = await this.db.select().from(leadDocuments).where(eq(leadDocuments.id, docId)).limit(1);
    if (!d || d.claimId !== id) throw new NotFoundException();
    await this.audit.record(ctx, { action: 'lead.document_accessed', objectType: 'lead_document', objectId: docId });
    return { url: this.storage.signedUrl(d.objectKey, 300) };
  }

  @Public()
  @Get('public/certificates/:code')
  verify(@Param('code') code: string) {
    if (!/^CZL-\d{4}-\d{8}$/.test(code)) throw new NotFoundException('Certificate not found');
    return this.svc.publicVerify(code);
  }

  // ---- 153 Lead ownership disputes (parties) ----
  @Get('lead-disputes')
  @RequireOrg()
  disputes(@Ctx() ctx: RequestContext) {
    return this.svc.myDisputes(ctx);
  }

  /** Open a dispute against a certificate code (the claimant may not know the internal claim id). */
  @Post('lead-disputes')
  @RequireCaps('lead.register')
  @RequireOrg()
  @HttpCode(201)
  async open(@Ctx() ctx: RequestContext, @Body(body(DisputeCreateSchema.omit({ subjectId: true }).extend({ certificateCode: z.string().regex(/^CZL-\d{4}-\d{8}$/, 'Enter a certificate code like CZL-2026-12345678') }))) b: { certificateCode: string; statement: string }) {
    const cert = await this.svc.publicVerify(b.certificateCode).catch(() => null);
    if (!cert) throw new NotFoundException('Certificate not found');
    const [claim] = await this.db.select({ id: leadClaims.id }).from(leadClaims).where(eq(leadClaims.certificateCode, b.certificateCode)).limit(1);
    return this.svc.openDispute(ctx, claim.id, b.statement);
  }

  @Get('lead-disputes/:id')
  dispute(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.disputeDetail(ctx, id);
  }

  @Post('lead-disputes/:id/evidence')
  @HttpCode(201)
  evidence(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ body: z.string().trim().min(10).max(8000) }))) b: { body: string }) {
    return this.svc.addEvidence(ctx, id, b.body);
  }

  @Post('lead-disputes/:id/appeal')
  @HttpCode(200)
  appeal(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ grounds: z.string().trim().min(20).max(4000) }))) b: { grounds: string }) {
    return this.svc.appeal(ctx, id, b.grounds);
  }
}

/** Screens 132 (routing), 133 (SLA configuration), 134 (ownership & conflict resolution). */
@ApiTags('admin')
@Controller('admin')
export class AdminLeadsController {
  constructor(@InjectDb() private db: Db, private svc: LeadsService, private audit: AuditService) {}

  @Get('routing/queue')
  @RequireCaps('routing.decide')
  queue(@Ctx() ctx: RequestContext, @Query('state') state: 'open' | 'decided' = 'open') {
    return this.svc.queue(ctx, state);
  }

  @Post('routing/:opportunityId/decision')
  @RequireCaps('routing.decide')
  @Idempotent()
  @HttpCode(200)
  decide(@Ctx() ctx: RequestContext, @Param('opportunityId', ParseUUIDPipe) id: string, @Body(body(RoutingDecisionSchema)) b: z.infer<typeof RoutingDecisionSchema>) {
    return this.svc.decide(ctx, id, b.decision, b.reason);
  }

  /** Called by the scheduler (or manually) to escalate / auto-release breached first reviews. */
  @Post('routing/sweep')
  @RequireCaps('routing.configure')
  @HttpCode(200)
  sweep(@Ctx() ctx: RequestContext) {
    return this.svc.sweep(ctx);
  }

  @Get('routing/sla')
  @RequireCaps('routing.decide')
  sla() {
    return this.db.select({ organizationId: groupCompanies.organizationId, brandName: groupCompanies.brandName, slaMinutes: groupCompanies.slaMinutes, calendar: groupCompanies.calendar, autoReleaseOnBreach: groupCompanies.autoReleaseOnBreach, legalName: organizations.legalName })
      .from(groupCompanies).innerJoin(organizations, eq(organizations.id, groupCompanies.organizationId)).orderBy(groupCompanies.brandName);
  }

  @Put('routing/sla/:orgId')
  @RequireCaps('routing.configure')
  async setSla(@Ctx() ctx: RequestContext, @Param('orgId', ParseUUIDPipe) orgId: string, @Body(body(SlaSchema)) b: z.infer<typeof SlaSchema>) {
    const [before] = await this.db.select().from(groupCompanies).where(eq(groupCompanies.organizationId, orgId)).limit(1);
    if (!before) throw new NotFoundException();
    const [after] = await this.db.update(groupCompanies).set({ slaMinutes: b.slaMinutes, calendar: b.calendar, autoReleaseOnBreach: b.autoReleaseOnBreach, updatedAt: new Date() }).where(eq(groupCompanies.organizationId, orgId)).returning();
    await this.audit.record(ctx, { action: 'routing.sla_configured', objectType: 'group_company', objectId: orgId, before: { slaMinutes: before.slaMinutes, calendar: before.calendar, autoRelease: before.autoReleaseOnBreach }, after: b });
    return after;
  }

  /** Preview the due time a lead submitted now (or at `start`) would get. */
  @Post('routing/sla/preview')
  @RequireCaps('routing.decide')
  @HttpCode(200)
  preview(@Body(body(z.object({ start: z.string().datetime().optional(), slaMinutes: z.number().int().min(1).max(10000), calendar: CalendarSchema }))) b: { start?: string; slaMinutes: number; calendar: BusinessCalendar }) {
    const start = b.start ? new Date(b.start) : new Date();
    return { start, dueAt: addBusinessMinutes(start, b.slaMinutes, b.calendar) };
  }

  @Get('lead-conflicts')
  @RequireCaps('lead.dispute.rule')
  conflicts() {
    return this.svc.conflicts();
  }

  @Post('lead-conflicts/:candidateId/ruling')
  @RequireCaps('lead.dispute.rule')
  @Idempotent()
  @HttpCode(200)
  rule(@Ctx() ctx: RequestContext, @Param('candidateId', ParseUUIDPipe) id: string, @Body(body(DuplicateRulingSchema)) b: z.infer<typeof DuplicateRulingSchema>) {
    return this.svc.rule(ctx, id, b.ruling, b.reason);
  }

  @Post('lead-disputes/:id/ruling')
  @RequireCaps('lead.dispute.rule')
  @Idempotent()
  @HttpCode(200)
  ruleDispute(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(DisputeRulingSchema)) b: z.infer<typeof DisputeRulingSchema>) {
    return this.svc.ruleDispute(ctx, id, b.outcome, b.reason);
  }
}

@Module({ imports: [OpportunitiesModule], controllers: [LeadsController, AdminLeadsController], providers: [LeadsService], exports: [LeadsService] })
export class LeadsModule {}
