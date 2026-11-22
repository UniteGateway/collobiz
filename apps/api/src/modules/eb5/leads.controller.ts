/**
 * GO EB5 — partner onboarding (compliance-approved) and protected leads. A partner sees only the prospects it introduced,
 * with a coarse status; never contact details, applications, documents, agreements or payments. Duplicate prospects
 * (same email or phone hash) are not re-registered: the claim is kept for compliance to decide ownership.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { EB5_LEAD_STAGES, EB5_SYSTEM_STAGES, Eb5LeadSchema, eb5Can, normEmail, normPhone } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { eb5Leads, eb5Partners, organizations, otpCodes, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { MailService } from '../../common/adapters';
import { decryptField, encryptField, randomToken, sha256 } from '../../common/crypto';
import { config } from '../../config';
import { Eb5Access, type Eb5Who } from './access';

type Lead = typeof eb5Leads.$inferSelect;
const hashId = (v: string | null) => (v ? sha256(`eb5:${config().FIELD_ENCRYPTION_KEY}:${v}`) : null);
const CONSENT = 'The prospect agreed to be contacted by GO EB5 (CITRUS360 LLC) about EB-5 consultancy services.';
const coarse = (stage: number) => (stage === 15 ? 'Closed' : stage >= 8 ? 'Engaged' : stage >= 3 ? 'In consultation' : stage >= 1 ? 'Contacted' : 'Introduced');
const PartnerApply = z.object({
  kind: z.enum(['immigration_adviser', 'business_consultant', 'financial_consultant', 'accountant', 'law_firm', 'project_representative', 'other']),
  role: z.enum(['bd_partner', 'referral_consultant']), jurisdiction: z.string().trim().min(2).max(80), specialization: z.string().trim().min(5).max(300),
  credentials: z.string().trim().max(500).optional(), contactEmail: z.string().trim().toLowerCase().email(),
});

@ApiTags('eb5')
@Controller('eb5')
export class Eb5LeadsController {
  constructor(@InjectDb() private db: Db, private audit: AuditService, private a: Eb5Access, private mail: MailService) {}

  // ------------------------------------------------------------------ partners
  @Post('partners/apply')
  @HttpCode(201)
  async apply(@Ctx() ctx: RequestContext, @Body(body(PartnerApply)) b: z.infer<typeof PartnerApply>) {
    if (!(await this.a.enabled())) throw new NotFoundException('Not found');
    if (!ctx.orgId) throw new BadRequestException('Apply from your business account');
    if (!ctx.memberships.some((m) => m.organizationId === ctx.orgId && ['org_owner', 'org_admin'].includes(m.role))) throw new ForbiddenException('Only an owner or admin can apply for your business');
    const [p] = await this.db.insert(eb5Partners).values({ orgId: ctx.orgId, ...b, credentials: b.credentials ?? null, linkToken: randomToken(12), createdBy: ctx.userId }).onConflictDoNothing().returning();
    if (!p) throw new ConflictException('Your business has already applied');
    await this.audit.record(ctx, { action: 'eb5.partner_applied', objectType: 'eb5_partner', objectId: p.id, after: { kind: b.kind, role: b.role, jurisdiction: b.jurisdiction } });
    await this.a.notifyUsers(await this.a.staffUsers(['compliance']), 'GO EB5 partner application', `${ctx.memberships.find((m) => m.organizationId === ctx.orgId)?.orgName} applied as a ${b.role === 'bd_partner' ? 'business development partner' : 'referral consultant'}.`, `/eb5/partners/${p.id}`);
    return { id: p.id, status: p.complianceStatus };
  }

  @Get('partners')
  async partners(@Ctx() ctx: RequestContext) {
    await this.a.need(ctx, 'partner.review');
    const rows = await this.db.select({ p: eb5Partners, org: organizations.displayName, kyb: organizations.verificationStatus, leads: sql<number>`(select count(*)::int from ${eb5Leads} l where l.partner_id = ${eb5Partners.id} and l.duplicate_of is null)` })
      .from(eb5Partners).innerJoin(organizations, eq(organizations.id, eb5Partners.orgId)).orderBy(desc(eb5Partners.createdAt));
    return rows.map((r) => ({ ...r.p, linkToken: undefined, org: r.org, kyb: r.kyb, leads: r.leads }));
  }

  @Get('partners/:id')
  async partner(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const w = await this.a.open(ctx);
    const [r] = await this.db.select({ p: eb5Partners, org: organizations.displayName, city: organizations.city, kyb: organizations.verificationStatus }).from(eb5Partners).innerJoin(organizations, eq(organizations.id, eb5Partners.orgId)).where(eq(eb5Partners.id, id));
    if (!r) throw new NotFoundException();
    const own = w.partner?.id === id;
    if (!own && !eb5Can(w.roles, 'partner.review')) throw new NotFoundException();
    return { ...r.p, linkToken: own && r.p.complianceStatus === 'approved' ? r.p.linkToken : undefined, org: r.org, city: r.city, kyb: r.kyb, isOwn: own };
  }

  @Post('partners/:id/review')
  @HttpCode(200)
  async review(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({
    decision: z.enum(['approve', 'reject', 'suspend']), note: z.string().trim().min(5, 'Record the reason').max(1000),
    i956kStatus: z.enum(['not_assessed', 'not_required', 'pending', 'registered']), agreementStatus: z.enum(['none', 'sent', 'signed']),
  }))) b: { decision: 'approve' | 'reject' | 'suspend'; note: string; i956kStatus: string; agreementStatus: string }) {
    await this.a.need(ctx, 'partner.review');
    const [p] = await this.db.select().from(eb5Partners).where(eq(eb5Partners.id, id));
    if (!p) throw new NotFoundException();
    if (ctx.memberships.some((m) => m.organizationId === p.orgId)) throw new ForbiddenException('You cannot review your own organisation');
    if (b.decision === 'approve' && b.agreementStatus !== 'signed') throw new BadRequestException('Approve only after the partner agreement is signed');
    if (b.decision === 'approve' && b.i956kStatus === 'not_assessed') throw new BadRequestException('Record whether Form I-956K registration applies before approving');
    const status = b.decision === 'approve' ? 'approved' : b.decision === 'reject' ? 'rejected' : 'suspended';
    await this.db.update(eb5Partners).set({ complianceStatus: status, complianceNote: b.note, i956kStatus: b.i956kStatus, agreementStatus: b.agreementStatus, reviewedBy: ctx.userId, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(eb5Partners.id, id));
    await this.audit.record(ctx, { action: `eb5.partner_${status}`, objectType: 'eb5_partner', objectId: id, after: { note: b.note, i956k: b.i956kStatus, agreement: b.agreementStatus } });
    await this.a.notifyUsers([p.createdBy], `GO EB5 partner application ${status}`, b.note, '/eb5/partner');
    return { id, status };
  }

  /** Public: what a partner link shows before the prospect submits (partner name only). */
  @Public()
  @Get('intro/:token')
  async introInfo(@Param('token') token: string) {
    if (!(await this.a.enabled())) throw new NotFoundException('Not found');
    const [r] = await this.db.select({ org: organizations.displayName, status: eb5Partners.complianceStatus }).from(eb5Partners).innerJoin(organizations, eq(organizations.id, eb5Partners.orgId)).where(eq(eb5Partners.linkToken, token));
    if (!r || r.status !== 'approved') throw new NotFoundException('This link is not active');
    return { partner: r.org, brand: 'GO EB5', entity: 'CITRUS360 LLC' };
  }

  /** Public: a prospect submits their own enquiry through a partner's link (consent given by the prospect). */
  @Public()
  @Post('intro/:token')
  @HttpCode(201)
  async introSubmit(@Param('token') token: string, @Body(body(Eb5LeadSchema)) b: z.infer<typeof Eb5LeadSchema>) {
    if (!(await this.a.enabled())) throw new NotFoundException('Not found');
    const [p] = await this.db.select().from(eb5Partners).where(and(eq(eb5Partners.linkToken, token), eq(eb5Partners.complianceStatus, 'approved')));
    if (!p) throw new NotFoundException('This link is not active');
    const r = await this.register(null, p, b, 'partner_link');
    return { received: true, reference: r.duplicate ? null : r.code, message: 'Thank you. A GO EB5 manager will contact you. This is not legal advice and no fee is due for this enquiry.' };
  }

  // ------------------------------------------------------------------ leads
  private async register(ctx: RequestContext | null, partner: typeof eb5Partners.$inferSelect | null, b: z.infer<typeof Eb5LeadSchema>, source: string) {
    const eh = hashId(normEmail(b.email)); const ph = hashId(normPhone(b.phone));
    const [dup] = await this.db.select().from(eb5Leads).where(and(isNull(eb5Leads.duplicateOf), or(eh ? eq(eb5Leads.emailHash, eh) : sql`false`, ph ? eq(eb5Leads.phoneHash, ph) : sql`false`))).limit(1);
    const code = await this.a.code(eb5Leads, 'EB5L');
    const managers = await this.a.staffUsers(['business_manager']);
    const [l] = await this.db.insert(eb5Leads).values({
      code, partnerId: partner?.id ?? null, introducedBy: ctx?.userId ?? null, source, fullName: b.fullName, country: b.country, city: b.city || null,
      contactEnc: encryptField(JSON.stringify({ email: b.email ?? null, phone: b.phone ?? null })), emailHash: eh, phoneHash: ph,
      familyMembers: b.familyMembers || null, readiness: b.readiness, timeline: b.timeline, contactPreference: b.contactPreference, notes: b.notes || null,
      consentAt: new Date(), consentText: CONSENT, assignedManagerId: dup ? null : managers[0] ?? null, stage: dup ? 15 : 0,
      duplicateOf: dup?.id ?? null, closedReason: dup ? 'Possible duplicate — ownership claim recorded for compliance' : null,
      ownershipDispute: dup ? { status: 'open', claimantPartnerId: partner?.id ?? null, existingPartnerId: dup.partnerId, openedAt: new Date().toISOString() } : null,
      history: [{ at: new Date().toISOString(), by: ctx?.userId ?? null, stage: dup ? 15 : 0, note: dup ? 'Possible duplicate of an existing lead' : `Introduced (${source})` }],
    }).returning();
    await this.audit.record(ctx, { action: dup ? 'eb5.lead_duplicate_claim' : 'eb5.lead_registered', objectType: 'eb5_lead', objectId: l.id, after: { code, source, partner: partner?.id ?? null, duplicateOf: dup?.id ?? null } });
    if (dup) await this.a.notifyUsers(await this.a.staffUsers(['compliance']), 'GO EB5 lead ownership claim', `${code} matches an existing prospect. Decide ownership in Compliance.`, '/eb5/compliance');
    else await this.a.notifyUsers(managers, `New GO EB5 lead ${code}`, `${b.fullName} · ${b.country} · ${b.readiness}`, `/eb5/leads/${l.id}`);
    return { ...l, duplicate: !!dup };
  }

  @Post('leads')
  @HttpCode(201)
  async introduce(@Ctx() ctx: RequestContext, @Body(body(Eb5LeadSchema)) b: z.infer<typeof Eb5LeadSchema>) {
    const w = await this.a.need(ctx, 'lead.introduce');
    const partner = w.partner?.complianceStatus === 'approved' ? w.partner : null;
    const r = await this.register(ctx, partner, b, partner ? 'partner' : 'direct');
    if (r.duplicate) return { id: r.id, code: r.code, duplicate: true, message: 'This prospect is already registered with GO EB5. Your introduction is recorded as an ownership claim for compliance to review; no details of the existing record are shared.' };
    return { id: r.id, code: r.code, duplicate: false, protectedFrom: r.createdAt };
  }

  private view(ctx: RequestContext, w: Eb5Who, l: Lead, extra: Record<string, unknown> = {}) {
    const rel = this.a.relation(ctx, w, l);
    const base = { id: l.id, code: l.code, fullName: l.fullName, country: l.country, createdAt: l.createdAt, relation: rel, duplicate: !!l.duplicateOf };
    if (rel === 'partner') return { ...base, status: l.duplicateOf ? 'Ownership under review' : coarse(l.stage) };
    if (rel === 'client') return { ...base, stage: l.stage, stageLabel: EB5_LEAD_STAGES[l.stage], caseStage: l.caseStage };
    if (rel === 'project') return { ...base, caseStage: l.caseStage };
    const contact = JSON.parse(decryptField(l.contactEnc)) as { email: string | null; phone: string | null };
    return { ...base, ...extra, city: l.city, contact, familyMembers: l.familyMembers, readiness: l.readiness, timeline: l.timeline, contactPreference: l.contactPreference, source: l.source,
      consentAt: l.consentAt, consentText: l.consentText, stage: l.stage, stageLabel: EB5_LEAD_STAGES[l.stage], caseStage: l.caseStage, followUpOn: l.followUpOn, notes: l.notes, history: l.history,
      assignedManagerId: l.assignedManagerId, attorneyUserId: l.attorneyUserId, clientUserId: l.clientUserId, projectId: l.projectId, closedReason: l.closedReason, ownershipDispute: l.ownershipDispute, partnerId: l.partnerId };
  }

  @Get('leads')
  async list(@Ctx() ctx: RequestContext, @Query('stage') stage?: string, @Query('q') q?: string) {
    const w = await this.a.open(ctx);
    const scope = await this.a.leadScope(ctx, w);
    const rows = await this.db.select({ l: eb5Leads, partner: organizations.displayName, manager: users.fullName }).from(eb5Leads)
      .leftJoin(eb5Partners, eq(eb5Partners.id, eb5Leads.partnerId)).leftJoin(organizations, eq(organizations.id, eb5Partners.orgId)).leftJoin(users, eq(users.id, eb5Leads.assignedManagerId))
      .where(and(scope ? sql`(${scope})` : undefined, stage !== undefined && /^\d+$/.test(stage) ? eq(eb5Leads.stage, Number(stage)) : undefined, q ? sql`(${eb5Leads.fullName} ilike ${'%' + q + '%'} or ${eb5Leads.code} ilike ${'%' + q + '%'})` : undefined))
      .orderBy(desc(eb5Leads.createdAt)).limit(500);
    return rows.map((r) => { const v = this.view(ctx, w, r.l) as Record<string, unknown>; return v.relation === 'staff' ? { ...v, contact: undefined, history: undefined, partner: r.partner ?? 'Direct', manager: r.manager } : v; });
  }

  @Get('leads/:id')
  async detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const w = await this.a.open(ctx);
    const l = await this.a.lead(ctx, w, id);
    const v = this.view(ctx, w, l);
    if (v.relation === 'staff') await this.audit.record(ctx, { action: 'eb5.lead_viewed', objectType: 'eb5_lead', objectId: id });
    const staffList = v.relation === 'staff' ? await this.db.execute(sql`select u.id, u.full_name as name, r.role from eb5_roles r join users u on u.id = r.user_id order by u.full_name`) : null;
    return { ...v, stages: EB5_LEAD_STAGES, systemStages: [...EB5_SYSTEM_STAGES], staff: staffList ? ((staffList as unknown as { rows?: unknown[] }).rows ?? staffList) : undefined };
  }

  /** Move a lead's pipeline stage. Signature and verified-payment stages follow the records, not a click. */
  @Post('leads/:id/stage')
  @HttpCode(200)
  async stage(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ stage: z.number().int().min(0).max(15), note: z.string().trim().min(3).max(500), closedReason: z.string().trim().max(300).optional() }))) b: { stage: number; note: string; closedReason?: string }) {
    const w = await this.a.need(ctx, 'lead.manage');
    const l = await this.a.lead(ctx, w, id);
    if (l.duplicateOf) throw new ConflictException('Ownership is under compliance review');
    if (EB5_SYSTEM_STAGES.has(b.stage) && b.stage !== l.stage) throw new BadRequestException(`“${EB5_LEAD_STAGES[b.stage]}” is set automatically from the signed agreement or verified payment`);
    if (b.stage === 15 && !b.closedReason) throw new BadRequestException('Give the reason for closing');
    const history = [...(l.history as unknown[]), { at: new Date().toISOString(), by: ctx.userId, stage: b.stage, note: b.note }];
    await this.db.update(eb5Leads).set({ stage: b.stage, history, closedReason: b.stage === 15 ? b.closedReason! : null, updatedAt: new Date() }).where(eq(eb5Leads.id, id));
    await this.audit.record(ctx, { action: 'eb5.lead_stage', objectType: 'eb5_lead', objectId: id, before: { stage: l.stage }, after: { stage: b.stage } });
    return this.detail(ctx, id);
  }

  @Post('leads/:id/assign')
  @HttpCode(200)
  async assign(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ managerId: z.string().uuid().nullable().optional(), attorneyId: z.string().uuid().nullable().optional(), followUpOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), projectId: z.string().uuid().nullable().optional() }))) b: { managerId?: string | null; attorneyId?: string | null; followUpOn?: string | null; projectId?: string | null }) {
    const w = await this.a.need(ctx, 'lead.manage');
    const l = await this.a.lead(ctx, w, id);
    const isRole = async (uid: string, role: string) => ((await this.db.execute(sql`select 1 from eb5_roles where user_id = ${uid}::uuid and role = ${role}`)) as unknown as { rows: unknown[] }).rows.length > 0;
    if (b.attorneyId && !(await isRole(b.attorneyId, 'attorney'))) throw new BadRequestException('Choose a user with the attorney role');
    if (b.managerId && !(await isRole(b.managerId, 'business_manager')) && !(await isRole(b.managerId, 'citrus_admin'))) throw new BadRequestException('Choose a GO EB5 manager');
    const set: Partial<Lead> = { updatedAt: new Date() };
    if (b.managerId !== undefined) set.assignedManagerId = b.managerId; if (b.attorneyId !== undefined) set.attorneyUserId = b.attorneyId;
    if (b.followUpOn !== undefined) set.followUpOn = b.followUpOn; if (b.projectId !== undefined) set.projectId = b.projectId;
    await this.db.update(eb5Leads).set(set).where(eq(eb5Leads.id, id));
    await this.audit.record(ctx, { action: 'eb5.lead_assigned', objectType: 'eb5_lead', objectId: id, after: { manager: b.managerId, attorney: b.attorneyId, followUpOn: b.followUpOn, project: b.projectId } });
    if (b.managerId && b.managerId !== l.assignedManagerId) await this.a.notifyUsers([b.managerId], `GO EB5 lead ${l.code} assigned to you`, l.fullName, `/eb5/leads/${id}`);
    if (b.attorneyId && b.attorneyId !== l.attorneyUserId) await this.a.notifyUsers([b.attorneyId], `GO EB5 case ${l.code} assigned for attorney review`, l.fullName, `/eb5/cases/${id}`);
    return this.detail(ctx, id);
  }

  /** Give the prospect a client account (existing COLLABIZ invitation flow) so they can complete the application. */
  @Post('leads/:id/invite-client')
  @HttpCode(200)
  async inviteClient(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const w = await this.a.need(ctx, 'lead.manage');
    const l = await this.a.lead(ctx, w, id);
    if (l.duplicateOf) throw new ConflictException('Ownership is under compliance review');
    const c = JSON.parse(decryptField(l.contactEnc)) as { email: string | null };
    if (!c.email) throw new BadRequestException('Add the prospect’s email first');
    let [u] = await this.db.select().from(users).where(sql`lower(${users.email}) = ${c.email.toLowerCase()}`).limit(1);
    let token: string | undefined;
    if (!u) {
      [u] = await this.db.insert(users).values({ email: c.email.toLowerCase(), fullName: l.fullName }).returning();
      token = randomToken(32);
      await this.db.insert(otpCodes).values({ userId: u.id, channel: 'email', purpose: 'invite', codeHash: sha256(`invite:${token}`), expiresAt: new Date(Date.now() + 7 * 86400_000) });
    }
    await this.db.update(eb5Leads).set({ clientUserId: u.id, updatedAt: new Date() }).where(eq(eb5Leads.id, id));
    await this.mail.send('email', c.email, 'Your GO EB5 client portal', token ? `Set your password to open your GO EB5 portal: ${config().WEB_BASE_URL}/invite?token=${token}` : `Sign in to COLLABIZ to open your GO EB5 portal: ${config().WEB_BASE_URL}/eb5/portal`);
    await this.audit.record(ctx, { action: 'eb5.client_invited', objectType: 'eb5_lead', objectId: id });
    return { invited: true, newAccount: !!token, ...(token && (config().DEV_EXPOSE_OTP || config().NODE_ENV === 'test') ? { devInviteToken: token } : {}) };
  }

  /** Compliance decides a duplicate/ownership claim. */
  @Post('leads/:id/ownership')
  @HttpCode(200)
  async ownership(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['keep_existing', 'transfer_to_claimant']), note: z.string().trim().min(10).max(1000) }))) b: { decision: 'keep_existing' | 'transfer_to_claimant'; note: string }) {
    const w = await this.a.need(ctx, 'partner.review');
    const [claim] = await this.db.select().from(eb5Leads).where(eq(eb5Leads.id, id));
    if (!claim?.duplicateOf || (claim.ownershipDispute as { status?: string } | null)?.status !== 'open') throw new NotFoundException('No open ownership claim');
    const dispute = { ...(claim.ownershipDispute as Record<string, unknown>), status: 'decided', decision: b.decision, note: b.note, decidedBy: ctx.userId, decidedAt: new Date().toISOString() };
    if (b.decision === 'transfer_to_claimant') {
      const [orig] = await this.db.select().from(eb5Leads).where(eq(eb5Leads.id, claim.duplicateOf));
      const hist = [...(orig.history as unknown[]), { at: new Date().toISOString(), by: ctx.userId, stage: orig.stage, note: `Ownership transferred by compliance: ${b.note}` }];
      await this.db.update(eb5Leads).set({ partnerId: claim.partnerId, history: hist, updatedAt: new Date() }).where(eq(eb5Leads.id, orig.id));
    }
    await this.db.update(eb5Leads).set({ ownershipDispute: dispute, updatedAt: new Date() }).where(eq(eb5Leads.id, id));
    await this.audit.record(ctx, { action: 'eb5.ownership_decided', objectType: 'eb5_lead', objectId: id, after: { decision: b.decision, note: b.note } });
    void w;
    return { id, decision: b.decision };
  }

  @Get('disputes')
  async disputes(@Ctx() ctx: RequestContext) {
    await this.a.need(ctx, 'partner.review');
    const rows = await this.db.execute(sql`
      select c.id, c.code, c.full_name as name, c.country, c.created_at, c.ownership_dispute as dispute, o.code as existing_code, po.display_name as claimant, eo.display_name as existing_partner
      from eb5_leads c join eb5_leads o on o.id = c.duplicate_of
      left join eb5_partners cp on cp.id = c.partner_id left join organizations po on po.id = cp.org_id
      left join eb5_partners ep on ep.id = o.partner_id left join organizations eo on eo.id = ep.org_id
      order by c.created_at desc limit 200`);
    return (rows as unknown as { rows?: unknown[] }).rows ?? rows;
  }
}
