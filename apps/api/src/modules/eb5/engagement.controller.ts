/**
 * GO EB5 — client application, consultations, CITRUS360 consultancy agreements and consultancy invoices.
 * Legal gates (recorded by compliance) must be approved before an agreement can be legally approved or an invoice
 * issued. Payments are verified by finance against the CITRUS360 billing channel; COLLABIZ never receives or holds
 * EB-5 investment capital — that ledger is tracking only.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { EB5_AGREEMENT_STATES, EB5_LEDGERS, Eb5ApplicationSchema, Eb5ConsultationSchema, eb5Can, feeSchedule, usd } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { eb5Agreements, eb5Applications, eb5Consultations, eb5Invoices, eb5Leads, eb5Tasks, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { MAX_UPLOAD_BYTES, StorageService } from '../../common/adapters';
import { decryptField, encryptField, sha256 } from '../../common/crypto';
import { Eb5Access, type Eb5Who } from './access';

type Lead = typeof eb5Leads.$inferSelect;
const now = () => new Date().toISOString();

@ApiTags('eb5')
@Controller('eb5')
export class Eb5EngagementController {
  constructor(@InjectDb() private db: Db, private audit: AuditService, private a: Eb5Access, private storage: StorageService) {}

  private async raiseStage(l: Lead, stage: number, note: string, by: string | null) {
    if (l.stage >= stage || l.stage === 15) return;
    const history = [...(l.history as unknown[]), { at: now(), by, stage, note }];
    await this.db.update(eb5Leads).set({ stage, history, updatedAt: new Date() }).where(eq(eb5Leads.id, l.id));
  }
  private async clientLead(ctx: RequestContext) {
    const w = await this.a.open(ctx);
    if (!w.roles.includes('client')) throw new ForbiddenException('This is for GO EB5 clients');
    const [l] = await this.db.select().from(eb5Leads).where(eq(eb5Leads.clientUserId, ctx.userId)).orderBy(desc(eb5Leads.createdAt)).limit(1);
    if (!l) throw new NotFoundException();
    return { w, l };
  }

  // ------------------------------------------------------------------ preliminary application (client)
  @Get('applications/mine')
  async mine(@Ctx() ctx: RequestContext) {
    const { l } = await this.clientLead(ctx);
    const [ap] = await this.db.select().from(eb5Applications).where(eq(eb5Applications.leadId, l.id));
    return { lead: { code: l.code, fullName: l.fullName }, application: ap ? { id: ap.id, code: ap.code, status: ap.status, data: JSON.parse(decryptField(ap.dataEnc)), hasPhoto: !!ap.photoKey, submittedAt: ap.submittedAt } : null };
  }

  @Put('applications/mine')
  async saveDraft(@Ctx() ctx: RequestContext, @Body(body(z.object({ data: z.record(z.string(), z.unknown()) }))) b: { data: Record<string, unknown> }) {
    const { l } = await this.clientLead(ctx);
    if (JSON.stringify(b.data).length > 50_000) throw new BadRequestException('Application is too large');
    const [ap] = await this.db.select().from(eb5Applications).where(eq(eb5Applications.leadId, l.id));
    if (ap && ap.status !== 'draft') throw new ConflictException('Already submitted — contact your GO EB5 manager to change it');
    if (ap) await this.db.update(eb5Applications).set({ dataEnc: encryptField(JSON.stringify(b.data)), updatedAt: new Date() }).where(eq(eb5Applications.id, ap.id));
    else await this.db.insert(eb5Applications).values({ code: await this.a.code(eb5Applications, 'EB5A'), leadId: l.id, clientUserId: ctx.userId, dataEnc: encryptField(JSON.stringify(b.data)) });
    return { saved: true, at: now() };
  }

  @Post('applications/mine/photo')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async photo(@Ctx() ctx: RequestContext, @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number; originalname: string }) {
    const { l } = await this.clientLead(ctx);
    if (!file) throw new BadRequestException('Choose a photo');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) throw new BadRequestException('Use a JPEG, PNG or WEBP photo');
    if (file.size > 3 * 1024 * 1024) throw new BadRequestException('Use a photo under 3 MB');
    const [ap] = await this.db.select().from(eb5Applications).where(eq(eb5Applications.leadId, l.id));
    if (!ap) throw new BadRequestException('Save your application first');
    if (ap.status !== 'draft') throw new ConflictException('Already submitted');
    const o = await this.storage.putEncrypted(file.buffer, file.mimetype, `eb5/${l.id}/photo`);
    await this.db.update(eb5Applications).set({ photoKey: `${o.key}|${file.mimetype}`, updatedAt: new Date() }).where(eq(eb5Applications.id, ap.id));
    return { hasPhoto: true };
  }

  @Post('applications/mine/submit')
  @HttpCode(200)
  async submit(@Ctx() ctx: RequestContext) {
    const { l } = await this.clientLead(ctx);
    const [ap] = await this.db.select().from(eb5Applications).where(eq(eb5Applications.leadId, l.id));
    if (!ap) throw new BadRequestException('Save your application first');
    if (ap.status !== 'draft') throw new ConflictException('Already submitted');
    const parsed = Eb5ApplicationSchema.safeParse(JSON.parse(decryptField(ap.dataEnc)));
    if (!parsed.success) throw new BadRequestException({ statusCode: 400, message: 'Some required answers are missing', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    await this.db.update(eb5Applications).set({ status: 'submitted', signedName: parsed.data.signature, submittedAt: new Date(), updatedAt: new Date() }).where(eq(eb5Applications.id, ap.id));
    await this.audit.record(ctx, { action: 'eb5.application_submitted', objectType: 'eb5_application', objectId: ap.id });
    await this.a.notifyUsers([l.assignedManagerId], `GO EB5 application ${ap.code} submitted`, l.fullName, `/eb5/applications/${ap.id}`);
    return { id: ap.id, code: ap.code, status: 'submitted' };
  }

  @Get('applications')
  async applications(@Ctx() ctx: RequestContext) {
    await this.a.need(ctx, 'application.review');
    return this.db.select({ id: eb5Applications.id, code: eb5Applications.code, status: eb5Applications.status, submittedAt: eb5Applications.submittedAt, updatedAt: eb5Applications.updatedAt, leadId: eb5Leads.id, lead: eb5Leads.code, name: eb5Leads.fullName, country: eb5Leads.country })
      .from(eb5Applications).innerJoin(eb5Leads, eq(eb5Leads.id, eb5Applications.leadId)).orderBy(desc(eb5Applications.updatedAt)).limit(300);
  }

  private async app(ctx: RequestContext, id: string) {
    const w = await this.a.open(ctx);
    const [ap] = await this.db.select().from(eb5Applications).where(eq(eb5Applications.id, id));
    if (!ap) throw new NotFoundException();
    const own = ap.clientUserId === ctx.userId;
    if (!own && !eb5Can(w.roles, 'application.review')) throw new NotFoundException();
    return { w, ap, own };
  }

  @Get('applications/:id')
  async application(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { ap, own } = await this.app(ctx, id);
    const [l] = await this.db.select().from(eb5Leads).where(eq(eb5Leads.id, ap.leadId));
    if (!own) await this.audit.record(ctx, { action: 'eb5.application_viewed', objectType: 'eb5_application', objectId: id });
    const s = await this.a.settings();
    let office = null;
    if (!own) {
      const [mgr] = l.assignedManagerId ? await this.db.select({ n: users.fullName }).from(users).where(eq(users.id, l.assignedManagerId)) : [];
      const [next] = await this.db.select({ at: eb5Consultations.scheduledAt }).from(eb5Consultations).where(and(eq(eb5Consultations.leadId, l.id), eq(eb5Consultations.status, 'scheduled'), sql`${eb5Consultations.scheduledAt} >= now()`)).orderBy(eb5Consultations.scheduledAt).limit(1);
      const [ag] = await this.db.select({ state: eb5Agreements.state }).from(eb5Agreements).where(eq(eb5Agreements.leadId, l.id)).orderBy(desc(eb5Agreements.createdAt)).limit(1);
      const [paid] = await this.db.select({ n: sql<number>`coalesce(sum(${eb5Invoices.amountCents}), 0)::bigint`, r: sql<string | null>`max(${eb5Invoices.receiptNumber})` }).from(eb5Invoices).where(and(eq(eb5Invoices.leadId, l.id), eq(eb5Invoices.ledger, 'consultancy'), eq(eb5Invoices.status, 'verified')));
      const st = l.stage >= 11 ? 'Process initiated' : ag && ['Counter-Signed', 'Active'].includes(ag.state) ? 'Agreement executed' : ag && ['Sent to Client', 'Viewed', 'Signed'].includes(ag.state) ? 'Agreement pending' : ag ? 'Proposal issued' : ap.status === 'reviewed' ? 'Assessment pending' : 'Received';
      office = { manager: mgr?.n ?? null, nextConsultation: next ? next.at.toISOString().slice(0, 10) : null, feeReceived: Number(paid.n) ? `${usd(Number(paid.n))} received of ${usd(feeSchedule(s.consultancyFeeUsd, s.commencementPct).total)} proposed` : `${usd(feeSchedule(s.consultancyFeeUsd, s.commencementPct).total)} proposed (not yet approved by counsel unless shown in Settings)`, receipt: paid.r ?? null, status: st };
    }
    return { id: ap.id, code: ap.code, status: ap.status, submittedAt: ap.submittedAt, signedName: ap.signedName, reviewNote: ap.reviewNote, hasPhoto: !!ap.photoKey, data: JSON.parse(decryptField(ap.dataEnc)), lead: { id: l.id, code: l.code }, brand: s.brand, entity: s.consultancyEntity, office };
  }

  @Get('applications/:id/photo')
  async applicationPhoto(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { ap } = await this.app(ctx, id);
    if (!ap.photoKey) throw new NotFoundException();
    const [key, mime] = ap.photoKey.split('|');
    res.setHeader('Content-Type', mime); res.setHeader('Cache-Control', 'private, no-store');
    res.send(await this.storage.getDecrypted(key));
  }

  @Post('applications/:id/review')
  @HttpCode(200)
  async reviewApp(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ note: z.string().trim().min(5).max(2000) }))) b: { note: string }) {
    await this.a.need(ctx, 'application.review');
    const [ap] = await this.db.select().from(eb5Applications).where(eq(eb5Applications.id, id));
    if (!ap || ap.status === 'draft') throw new ConflictException('Only submitted applications can be reviewed');
    await this.db.update(eb5Applications).set({ status: 'reviewed', reviewNote: b.note, reviewedBy: ctx.userId, updatedAt: new Date() }).where(eq(eb5Applications.id, id));
    const [l] = await this.db.select().from(eb5Leads).where(eq(eb5Leads.id, ap.leadId));
    await this.raiseStage(l, 5, 'Preliminary eligibility review started', ctx.userId);
    await this.audit.record(ctx, { action: 'eb5.application_reviewed', objectType: 'eb5_application', objectId: id });
    return { id, status: 'reviewed' };
  }

  // ------------------------------------------------------------------ consultations
  @Post('consultations')
  @HttpCode(201)
  async book(@Ctx() ctx: RequestContext, @Body(body(Eb5ConsultationSchema)) b: z.infer<typeof Eb5ConsultationSchema>) {
    const w = await this.a.need(ctx, 'consultation.manage');
    const l = await this.a.lead(ctx, w, b.leadId);
    if (new Date(b.scheduledAt).getTime() < Date.now()) throw new BadRequestException('Choose a time in the future');
    if (b.kind === 'Attorney' && !l.attorneyUserId) throw new BadRequestException('Assign an attorney to this lead first');
    const host = b.kind === 'Attorney' ? l.attorneyUserId! : ctx.userId;
    const [c] = await this.db.insert(eb5Consultations).values({ leadId: l.id, scheduledAt: new Date(b.scheduledAt), timezone: b.timezone, durationMin: b.durationMin, mode: b.mode, kind: b.kind, location: b.location || null, agenda: b.agenda || null, hostUserId: host, history: [{ at: now(), by: ctx.userId, note: 'Scheduled' }] }).returning();
    await this.raiseStage(l, 3, 'Consultation scheduled', ctx.userId);
    await this.audit.record(ctx, { action: 'eb5.consultation_scheduled', objectType: 'eb5_consultation', objectId: c.id, after: { kind: b.kind, mode: b.mode, at: b.scheduledAt } });
    await this.a.notifyUsers([l.clientUserId, host !== ctx.userId ? host : null], 'GO EB5 consultation scheduled', `${b.kind} consultation · ${new Date(b.scheduledAt).toUTCString()} (${b.timezone})`, '/eb5/consultations');
    return c;
  }

  @Get('consultations')
  async consultations(@Ctx() ctx: RequestContext) {
    const w = await this.a.open(ctx);
    const scope = await this.a.leadScope(ctx, w);
    const staff = eb5Can(w.roles, 'consultation.manage');
    const rows = await this.db.select({ c: eb5Consultations, lead: eb5Leads.code, name: eb5Leads.fullName, host: users.fullName, clientId: eb5Leads.clientUserId })
      .from(eb5Consultations).innerJoin(eb5Leads, eq(eb5Leads.id, eb5Consultations.leadId)).innerJoin(users, eq(users.id, eb5Consultations.hostUserId))
      .where(staff && eb5Can(w.roles, 'lead.view_all') ? undefined : sql`(${scope ?? sql`false`}) or ${eb5Consultations.hostUserId} = ${ctx.userId}`)
      .orderBy(desc(eb5Consultations.scheduledAt)).limit(300);
    return rows.map((r) => ({ ...r.c, notes: r.clientId === ctx.userId && !staff ? null : r.c.notes, lead: r.lead, name: r.name, host: r.host }));
  }

  @Post('consultations/:id')
  @HttpCode(200)
  async updateConsultation(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({
    status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']), attendance: z.string().trim().max(200).optional(), notes: z.string().trim().max(5000).optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(), followUp: z.object({ title: z.string().trim().min(3).max(200), dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).optional(),
  }))) b: { status: string; attendance?: string; notes?: string; scheduledAt?: string; followUp?: { title: string; dueOn: string } }) {
    const w = await this.a.need(ctx, 'consultation.manage');
    const [c] = await this.db.select().from(eb5Consultations).where(eq(eb5Consultations.id, id));
    if (!c) throw new NotFoundException();
    const l = await this.a.lead(ctx, w, c.leadId);
    const history = [...(c.history as unknown[]), { at: now(), by: ctx.userId, note: b.scheduledAt ? `Rescheduled to ${b.scheduledAt}` : `Marked ${b.status}` }];
    await this.db.update(eb5Consultations).set({ status: b.status, attendance: b.attendance ?? c.attendance, notes: b.notes ?? c.notes, scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : c.scheduledAt, history, updatedAt: new Date() }).where(eq(eb5Consultations.id, id));
    if (b.status === 'completed') await this.raiseStage(l, 4, `${c.kind} consultation completed`, ctx.userId);
    if (b.followUp) await this.db.insert(eb5Tasks).values({ leadId: l.id, title: b.followUp.title, dueOn: b.followUp.dueOn, assigneeId: ctx.userId, createdBy: ctx.userId });
    await this.audit.record(ctx, { action: 'eb5.consultation_updated', objectType: 'eb5_consultation', objectId: id, after: { status: b.status, rescheduled: !!b.scheduledAt } });
    if (b.scheduledAt || b.status === 'cancelled') await this.a.notifyUsers([l.clientUserId], `GO EB5 consultation ${b.status === 'cancelled' ? 'cancelled' : 'rescheduled'}`, b.scheduledAt ? new Date(b.scheduledAt).toUTCString() : '', '/eb5/portal');
    return { id, status: b.status };
  }

  // ------------------------------------------------------------------ agreements
  /**
   * Consultancy Engagement & Process Commencement Agreement — text of the GO EB5 legal draft (for independent U.S. legal
   * review). The contracting entity and the blanks (addresses, governing law, venue, delivery days) come from Settings;
   * anything not yet confirmed stays blank. Schedule B milestones 2–4 are agreed and signed separately.
   */
  private agreementBody(l: Lead, s: Awaited<ReturnType<Eb5Access['settings']>>, approved: boolean, code: string, clientAddress: string | null) {
    const f = feeSchedule(s.consultancyFeeUsd, s.commencementPct);
    const blank = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' || v === 0 ? '__________________' : String(v));
    const C = `${s.consultancyEntity}, ${s.entityJurisdiction}`;
    return [
      approved ? '' : 'LEGAL DRAFT — NOT FOR EXECUTION UNTIL REVIEWED AND APPROVED BY INDEPENDENT U.S. COUNSEL',
      'CONSULTANCY ENGAGEMENT & PROCESS COMMENCEMENT AGREEMENT',
      `Agreement reference: ${code}    Effective date: __________________\nConsultant legal address: ${blank(s.consultantAddress)}\nClient legal name: ${l.fullName}\nClient address: ${blank(clientAddress)}`,
      `This Consultancy Engagement and Process Commencement Agreement (the "Agreement") is entered into as of the Effective Date by and between ${C}, operating the ${s.brand} brand (the "Consultant"), and the client identified above (the "Client"). Each is a "Party" and together the "Parties."`,
      '1. Engagement and nature of services\nThe Client engages Consultant solely for the preliminary consultancy, administrative coordination and information services described in Schedule A. Consultant does not, by this Agreement, act as immigration attorney, financial adviser, tax adviser, licensed securities broker-dealer, regional center, or investment custodian.\nAny U.S. immigration legal assessment, immigration petition preparation, tax advice or securities-related activity that requires professional authorization shall be performed only by appropriately qualified and separately engaged professionals. Consultant may arrange introductions but shall not substitute its own advice for theirs.',
      `2. Indicative EB-5 investment — separate transaction\nThe Parties acknowledge a proposed USD ${s.indicativeInvestmentUsd.toLocaleString('en-US')} EB-5 investment amount for discussion only. This amount is not payable under this Agreement and is not a consultancy fee. It applies only if the selected investment and filing date qualify for the reduced statutory EB-5 minimum. Project eligibility, targeted employment area status, regional-center affiliation, investment amount and offer availability have not been determined by this Agreement.\nAny actual EB-5 investment shall be governed only by definitive project offering documents, subscription agreements and applicable law, and paid solely under verified written funding instructions approved through the relevant transaction process. No instruction in this Agreement authorizes payment of investment capital to Consultant.`,
      `3. Consultancy fee and commencement payment\nThe total agreed ${s.brand} consultancy fee is ${usd(f.total)}, subject to legal review of the scope and permissible charging structure.\nThe Client shall pay a ${s.commencementPct}% commencement payment of ${usd(f.commencement)} upon execution of the final approved Agreement and receipt of a compliant invoice. This payment is an advance credited toward, and not in addition to, the ${usd(f.total)} fee. The remaining ${usd(f.balance)} shall become payable solely in accordance with an agreed written milestone schedule signed by both Parties before any corresponding amount becomes due.\nGovernment filing fees, immigration counsel fees, securities or regional-center fees, third-party reports, escrow costs, taxes, bank charges and travel expenses are not included unless expressly listed in a signed schedule. Consultant shall not incur a separately chargeable third-party cost without the Client's written authorization.\n  EB-5 investment capital (separate): USD ${s.indicativeInvestmentUsd.toLocaleString('en-US')} — only if qualifying\n  ${s.brand} consultancy fee: ${usd(f.total)}\n  Commencement advance — ${s.commencementPct}%: ${usd(f.commencement)} — credited against consultancy fee\n  Unscheduled consultancy balance: ${usd(f.balance)} — due only under signed milestones`,
      `4. Commencement and client onboarding\nConsultant shall commence the agreed services after (i) the Parties execute the final approved Agreement and Schedule A, (ii) Consultant receives the ${usd(f.commencement)} commencement payment and provides a receipt, and (iii) required identity, sanctions, anti-money laundering and other onboarding checks are satisfactorily completed. The date of actual service commencement shall be acknowledged in writing.`,
      `5. Refunds and non-refundable services\nThe Parties intend that the ${usd(f.commencement)} commencement amount be non-refundable only to the extent attributable to specifically identified, actually commenced or completed services and only where permitted by applicable law. This provision is not an absolute forfeiture of the entire advance upon payment.\nIf Consultant fails to commence material services, materially breaches the Agreement, or a mandatory legal cancellation or refund right applies, the Client shall receive any refund required by law and, where applicable, a refund of prepaid amounts attributable to services not delivered. The Consultant shall provide a reasonable itemized accounting upon termination.\nNo provision waives statutory rights, remedies for fraud or misrepresentation, or obligations imposed by applicable consumer-protection laws. No immigration approval or investment outcome is a condition for refund unless expressly provided by law.`,
      '6. Client duties\nThe Client shall supply truthful, complete and timely information; cooperate with lawful identity and source-of-funds inquiries; pay duly invoiced, authorized amounts when due; and obtain independent professional advice before making investment or immigration decisions. Client shall not transfer money to personal accounts or to an unverified project or intermediary.',
      '7. No guarantee; investment and immigration risk\nConsultant gives no representation or warranty of EB-5 eligibility, project approval, visa availability, USCIS adjudication, Green Card approval, capital preservation, repayment, profit, tax benefit, project completion or any processing timeline. The Client acknowledges that a qualifying EB-5 investment is generally required to be at risk and should be reviewed independently.',
      `8. Regulatory restrictions and required disclosures\nThe Parties shall not engage in securities solicitation, transaction-based compensation, investment placement or regulated immigration services unless all applicable registrations, exemptions and professional authorizations have been confirmed. If Consultant, a representative or any subagent is a direct or third-party EB-5 promoter, applicable USCIS registration, written promotional agreements and investor compensation disclosures (including Form I-956K where required) shall be addressed before promotion.\nConsultant shall disclose in writing any referral fee, placement fee, commission, conflict of interest, payment from a project sponsor, regional center or other third party, and any relationship material to Client's investment decision. The ${usd(f.total)} fee shall not be concealed in or misrepresented as project capital, required government charges or guaranteed visa expenses.`,
      '9. Confidentiality, information handling and consent\nEach Party shall protect nonpublic personal information using reasonable safeguards. Client information may be shared with specifically identified professionals or project parties only with the required consent or other lawful basis. Sensitive identity and financial documents shall be requested through appropriately secured channels, and not through general email or unsecured messaging where avoidable.',
      "10. Term, suspension and termination\nThis Agreement begins on the Effective Date and continues until completion of the Schedule A services or earlier written termination. Either Party may terminate on 15 days' written notice, subject to rights to immediate termination for material breach, illegality, conflict of interest or failure of compliance screening. Fees already earned for properly delivered services remain payable; unearned advance payments are dealt with under Section 5.\nConsultant may suspend services for compliance concerns or material nonpayment only after reasonable written notice where legally appropriate. On termination, Consultant shall return or securely dispose of client documents as required by law and deliver the accounting described above.",
      '11. Independent advice; no agency or authority to bind\nThe Client remains free to obtain independent immigration, tax, legal and financial advice and to decline any proposed investment. Consultant has no authority to bind the Client to a securities subscription or make representations on behalf of USCIS, the U.S. Government or a regional center.',
      `12. Notices; amendments; governing law\nFormal notices shall be delivered to the postal or email addresses written in Schedule C. Modifications, additional fees, milestones and amendments must be in writing and signed by both Parties.\nGoverning law: ${blank(s.governingLaw)}    Dispute forum / venue: ${blank(s.disputeForum)}. These must be completed after independent counsel confirms the appropriate jurisdiction, consumer protections, dispute mechanism and cross-border enforceability. No governing-law choice displaces applicable mandatory law.`,
      "13. Entire agreement and severability\nThe final executed Agreement and signed Schedules A–C constitute the Parties' complete agreement for these consultancy services and supersede prior discussions about that limited subject. If a provision is unenforceable, the rest shall remain effective to the extent lawful, without replacing mandatory consumer or regulatory protections.",
      `SCHEDULE A — SPECIFIC CONSULTANCY DELIVERABLES\nA1. Client intake and preliminary requirements discussion.\nA2. Initial records checklist and administrative document review (not legal validation).\nA3. Scheduling and coordination of consultation with independent U.S. immigration counsel.\nA4. Providing publicly available or properly authorized project information.\nA5. Coordination of requested meetings and status communications.\nA6. Written preliminary consultancy summary and recommendations within ${blank(s.summaryBusinessDays)} business days after complete intake.\nExclusions: immigration petition drafting, legal opinions, offering advice, investment placement, guarantees of approvals or returns, escrow services and handling of the USD ${s.indicativeInvestmentUsd.toLocaleString('en-US')} investment capital.`,
      `SCHEDULE B — FEE MILESTONES AND EXPENSES\n  Commencement advance: ${usd(f.commencement)} — upon execution, invoice and required onboarding\n  Milestone 2: USD __________ — Deliverable: __________________\n  Milestone 3: USD __________ — Deliverable: __________________\n  Milestone 4 / Final: USD __________ — Deliverable: __________________\n  TOTAL CONSULTANCY FEE: ${usd(f.total)} — milestone totals must reconcile before execution\nAuthorized third-party expenses (if any): __________________`,
      `SCHEDULE C — CONTACTS, DECLARATIONS AND SIGNATURES\nConsultant business address: ${blank(s.consultantAddress)}\nConsultant official email: ${blank(s.consultantEmail)}\nClient email / notice address: as recorded in the Client's GO EB5 application\nDisclosures of any referral compensation or promoter relationships: see the attached disclosure schedule (none recorded unless attached).\nClient acknowledges receipt of the complete Agreement, the fee schedule, described services, cancellation/refund information and a reasonable opportunity to seek independent advice.\nFOR THE CONSULTANT — authorized name, designation, signature, date / place.\nFOR THE CLIENT — ${l.fullName}; signature, date / place.`,
      `PAYMENT RECEIPT (completed only after actual receipt): ${usd(f.commencement)} receipt number, payment date and transfer reference are issued by the Consultant's finance team after cleared funds are verified.\nBANK AND PAYMENT SAFETY: Do not insert or transmit investment-capital remittance instructions into this consultancy agreement. Independently verify any payment account through official channels.`,
      `DRAFTING NOTE: This is a template for attorney review, not a legal opinion or confirmation that the proposed ${usd(f.total)} fee or a non-refundable provision is lawful. The Parties must validate licensing, immigration promoter registration, securities rules, professional-services scope, fee disclosures, refunds, taxes, venue and local consumer protections before signing. The EB-5 USD ${s.indicativeInvestmentUsd.toLocaleString('en-US')} figure is subject to qualification and statutory adjustment.`,
    ].filter(Boolean).join('\n\n');
  }

  @Post('agreements')
  @HttpCode(201)
  async draftAgreement(@Ctx() ctx: RequestContext, @Body(body(z.object({ leadId: z.string().uuid() }))) b: { leadId: string }) {
    const w = await this.a.need(ctx, 'agreement.draft');
    const l = await this.a.lead(ctx, w, b.leadId);
    if (l.duplicateOf) throw new ConflictException('Ownership is under compliance review');
    const s = await this.a.settings();
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(eb5Agreements).where(eq(eb5Agreements.leadId, l.id));
    const code = await this.a.code(eb5Agreements, 'EB5AG');
    const [ap] = await this.db.select({ d: eb5Applications.dataEnc }).from(eb5Applications).where(eq(eb5Applications.leadId, l.id));
    const address = ap ? ((JSON.parse(decryptField(ap.d)) as { personal?: { residentialAddress?: string } }).personal?.residentialAddress ?? null) : null;
    const text = this.agreementBody(l, s, s.legal.agreementTemplateApproved && s.legal.feesApproved, code, address);
    const [ag] = await this.db.insert(eb5Agreements).values({ code, leadId: l.id, version: Number(n) + 1, terms: { ...feeSchedule(s.consultancyFeeUsd, s.commencementPct), entity: s.consultancyEntity, investmentUsd: s.indicativeInvestmentUsd, pct: s.commencementPct },
      body: text, bodyHash: sha256(text), history: [{ at: now(), by: ctx.userId, state: 'Draft' }], createdBy: ctx.userId }).returning();
    await this.raiseStage(l, 6, 'Consultancy proposal drafted', ctx.userId);
    await this.audit.record(ctx, { action: 'eb5.agreement_drafted', objectType: 'eb5_agreement', objectId: ag.id, after: { code: ag.code, version: ag.version, hash: ag.bodyHash } });
    return { id: ag.id, code: ag.code };
  }

  private async agreement(ctx: RequestContext, id: string) {
    const w = await this.a.open(ctx);
    const [ag] = await this.db.select().from(eb5Agreements).where(eq(eb5Agreements.id, id));
    if (!ag) throw new NotFoundException();
    const [l] = await this.db.select().from(eb5Leads).where(eq(eb5Leads.id, ag.leadId));
    const client = l.clientUserId === ctx.userId;
    const staff = eb5Can(w.roles, 'agreement.draft') || eb5Can(w.roles, 'legal.approve') || eb5Can(w.roles, 'agreement.countersign') || eb5Can(w.roles, 'invoice.issue') || (w.roles.includes('attorney') && l.attorneyUserId === ctx.userId);
    if (!staff && !(client && EB5_AGREEMENT_STATES.indexOf(ag.state as never) >= 3)) throw new NotFoundException();
    return { w, ag, l, client, staff };
  }

  @Get('agreements')
  async agreements(@Ctx() ctx: RequestContext) {
    const w = await this.a.open(ctx);
    const staff = ['agreement.draft', 'legal.approve', 'agreement.countersign', 'invoice.issue'].some((p) => eb5Can(w.roles, p as never));
    return this.db.select({ id: eb5Agreements.id, code: eb5Agreements.code, version: eb5Agreements.version, state: eb5Agreements.state, terms: eb5Agreements.terms, createdAt: eb5Agreements.createdAt, lead: eb5Leads.code, name: eb5Leads.fullName, leadId: eb5Leads.id })
      .from(eb5Agreements).innerJoin(eb5Leads, eq(eb5Leads.id, eb5Agreements.leadId))
      .where(staff ? undefined : and(eq(eb5Leads.clientUserId, ctx.userId), inArray(eb5Agreements.state, ['Sent to Client', 'Viewed', 'Signed', 'Counter-Signed', 'Active', 'Terminated'])))
      .orderBy(desc(eb5Agreements.createdAt)).limit(300);
  }

  @Get('agreements/:id')
  async agreementDetail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { ag, l, client } = await this.agreement(ctx, id);
    if (client && ag.state === 'Sent to Client') {
      const history = [...(ag.history as unknown[]), { at: now(), by: ctx.userId, state: 'Viewed' }];
      await this.db.update(eb5Agreements).set({ state: 'Viewed', history, updatedAt: new Date() }).where(eq(eb5Agreements.id, id));
      ag.state = 'Viewed'; ag.history = history;
    }
    const s = await this.a.settings();
    return { ...ag, clientSignedIp: undefined, lead: { id: l.id, code: l.code, fullName: l.fullName }, isClient: client, states: EB5_AGREEMENT_STATES, gates: { template: s.legal.agreementTemplateApproved, fees: s.legal.feesApproved } };
  }

  /** Move an agreement through its workflow; each move is checked against the role and the legal gates. */
  @Post('agreements/:id/transition')
  @HttpCode(200)
  async transition(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ to: z.enum(['Internal Review', 'Legal Approved', 'Sent to Client', 'Counter-Signed', 'Terminated']), note: z.string().trim().max(1000).optional() }))) b: { to: string; note?: string }) {
    const { w, ag, l } = await this.agreement(ctx, id);
    const s = await this.a.settings();
    const from = ag.state;
    const allowed: Record<string, [string[], string]> = {
      'Internal Review': [['Draft'], 'agreement.draft'], 'Legal Approved': [['Internal Review'], 'legal.approve'], 'Sent to Client': [['Legal Approved'], 'agreement.draft'],
      'Counter-Signed': [['Signed'], 'agreement.countersign'], Terminated: [['Draft', 'Internal Review', 'Legal Approved', 'Sent to Client', 'Viewed', 'Signed', 'Counter-Signed', 'Active'], 'agreement.countersign'],
    };
    const [froms, perm] = allowed[b.to];
    if (!eb5Can(w.roles, perm as never)) throw new ForbiddenException('Your GO EB5 role does not allow this step');
    if (!froms.includes(from)) throw new ConflictException(`A ${from} agreement cannot move to ${b.to}`);
    if (b.to === 'Legal Approved' && !(s.legal.agreementTemplateApproved && s.legal.feesApproved)) throw new ConflictException('U.S. counsel has not yet approved the agreement template and fees (Compliance → legal approvals)');
    if (b.to === 'Legal Approved' && ag.createdBy === ctx.userId) throw new ForbiddenException('The person who drafted it cannot legally approve it');
    if (b.to === 'Sent to Client' && !l.clientUserId) throw new ConflictException('Invite the client to the portal first');
    if (b.to === 'Terminated' && !b.note) throw new BadRequestException('Give the reason for termination');
    const history = [...(ag.history as unknown[]), { at: now(), by: ctx.userId, state: b.to, note: b.note }];
    const set: Partial<typeof eb5Agreements.$inferInsert> = { state: b.to, history, updatedAt: new Date() };
    if (b.to === 'Counter-Signed') { set.counterSignedBy = ctx.userId; set.counterSignedAt = new Date(); }
    await this.db.update(eb5Agreements).set(set).where(eq(eb5Agreements.id, id));
    if (b.to === 'Sent to Client') { await this.raiseStage(l, 7, 'Agreement sent to client', ctx.userId); await this.a.notifyUsers([l.clientUserId], 'Your GO EB5 consultancy agreement is ready', 'Review it carefully and with your own advisors before signing.', `/eb5/agreements/${id}`); }
    await this.audit.record(ctx, { action: 'eb5.agreement_transition', objectType: 'eb5_agreement', objectId: id, before: { state: from }, after: { state: b.to, note: b.note ?? null } });
    return this.agreementDetail(ctx, id);
  }

  /** Client signs: typed full name must match, explicit consent, and the exact text's fingerprint is recorded. */
  @Post('agreements/:id/sign')
  @HttpCode(200)
  async sign(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ fullName: z.string().trim().min(3).max(120), agree: z.literal(true), bodyHash: z.string().length(64) }))) b: { fullName: string; bodyHash: string }) {
    const { ag, l, client } = await this.agreement(ctx, id);
    if (!client) throw new ForbiddenException('Only the client signs here');
    if (!['Sent to Client', 'Viewed'].includes(ag.state)) throw new ConflictException('This agreement is not open for signature');
    if (b.bodyHash !== ag.bodyHash) throw new ConflictException('The agreement changed since you opened it — reload and read it again');
    if (b.fullName.toLowerCase().replace(/\s+/g, ' ') !== l.fullName.toLowerCase().replace(/\s+/g, ' ')) throw new BadRequestException('Type your full name exactly as shown in the agreement');
    const history = [...(ag.history as unknown[]), { at: now(), by: ctx.userId, state: 'Signed', hash: ag.bodyHash }];
    await this.db.update(eb5Agreements).set({ state: 'Signed', clientSignedName: b.fullName, clientSignedAt: new Date(), clientSignedIp: ctx.ip ?? null, history, updatedAt: new Date() }).where(eq(eb5Agreements.id, id));
    await this.raiseStage(l, 8, 'Agreement signed by client', ctx.userId);
    await this.audit.record(ctx, { action: 'eb5.agreement_signed', objectType: 'eb5_agreement', objectId: id, after: { hash: ag.bodyHash } });
    await this.a.notifyUsers(await this.a.staffUsers(['citrus_admin']), `${ag.code} signed by the client`, 'Counter-sign for CITRUS360 LLC.', `/eb5/agreements/${id}`);
    return this.agreementDetail(ctx, id);
  }

  // ------------------------------------------------------------------ invoices and ledgers
  @Post('invoices')
  @HttpCode(201)
  async issue(@Ctx() ctx: RequestContext, @Body(body(z.object({ leadId: z.string().uuid(), kind: z.enum(['commencement', 'milestone']), amountCents: z.number().int().positive().optional(), description: z.string().trim().min(5).max(300), dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }))) b: { leadId: string; kind: 'commencement' | 'milestone'; amountCents?: number; description: string; dueOn?: string }) {
    const w = await this.a.need(ctx, 'invoice.issue');
    const l = await this.a.lead(ctx, w, b.leadId);
    const s = await this.a.settings();
    if (!(s.legal.invoicingApproved && s.legal.feesApproved)) throw new ConflictException('Invoicing stays off until counsel approves the fees and the CITRUS360 billing channel');
    const [ag] = await this.db.select().from(eb5Agreements).where(and(eq(eb5Agreements.leadId, l.id), inArray(eb5Agreements.state, ['Counter-Signed', 'Active']))).orderBy(desc(eb5Agreements.version)).limit(1);
    if (!ag) throw new ConflictException('A consultancy agreement signed by both parties is required first');
    const terms = ag.terms as { commencement: number; balance: number; total: number };
    const billed = await this.db.select({ k: sql<number>`coalesce(sum(${eb5Invoices.amountCents}), 0)::bigint` }).from(eb5Invoices).where(and(eq(eb5Invoices.agreementId, ag.id), sql`${eb5Invoices.status} <> 'cancelled'`));
    const amount = b.kind === 'commencement' ? terms.commencement : b.amountCents ?? 0;
    if (b.kind === 'commencement' && (await this.db.select({ id: eb5Invoices.id }).from(eb5Invoices).where(and(eq(eb5Invoices.agreementId, ag.id), sql`${eb5Invoices.description} like 'Commencement%'`, sql`${eb5Invoices.status} <> 'cancelled'`))).length) throw new ConflictException('The commencement invoice already exists');
    if (!amount) throw new BadRequestException('Enter the milestone amount');
    if (Number(billed[0].k) + amount > terms.total) throw new ConflictException(`That would bill more than the agreed fee of ${usd(terms.total)}`);
    const number = await this.a.code(eb5Invoices, 'C360-INV');
    const [inv] = await this.db.insert(eb5Invoices).values({ number, leadId: l.id, agreementId: ag.id, ledger: 'consultancy', description: b.kind === 'commencement' ? `Commencement payment (${(ag.terms as { pct: number }).pct}% of consultancy fee) — ${b.description}` : b.description, amountCents: amount, dueOn: b.dueOn ?? null, createdBy: ctx.userId }).returning();
    if (b.kind === 'commencement') await this.raiseStage(l, 9, 'Commencement invoice issued', ctx.userId);
    await this.audit.record(ctx, { action: 'eb5.invoice_issued', objectType: 'eb5_invoice', objectId: inv.id, after: { number, amountCents: amount, ledger: 'consultancy' } });
    await this.a.notifyUsers([l.clientUserId], `Invoice ${number} from ${s.consultancyEntity}`, `${usd(amount)} — pay only through the billing instructions CITRUS360 sends you directly.`, `/eb5/invoices/${inv.id}`);
    return inv;
  }

  /** Track third-party, government, project or investment amounts — recorded, never collected by COLLABIZ. */
  @Post('ledger/track')
  @HttpCode(201)
  async track(@Ctx() ctx: RequestContext, @Body(body(z.object({ leadId: z.string().uuid(), ledger: z.enum(['legal', 'government', 'project_admin', 'investment']), amountCents: z.number().int().positive(), description: z.string().trim().min(5).max(300), reference: z.string().trim().max(120).optional() }))) b: { leadId: string; ledger: string; amountCents: number; description: string; reference?: string }) {
    const w = await this.a.need(ctx, 'invoice.issue');
    const l = await this.a.lead(ctx, w, b.leadId);
    const [r] = await this.db.insert(eb5Invoices).values({ number: await this.a.code(eb5Invoices, 'TRK'), leadId: l.id, ledger: b.ledger, description: b.description, amountCents: b.amountCents, status: 'tracked', paymentReference: b.reference ?? null, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'eb5.ledger_tracked', objectType: 'eb5_invoice', objectId: r.id, after: { ledger: b.ledger, amountCents: b.amountCents } });
    return r;
  }

  private async invoice(ctx: RequestContext, id: string) {
    const w = await this.a.open(ctx);
    const [inv] = await this.db.select().from(eb5Invoices).where(eq(eb5Invoices.id, id));
    if (!inv) throw new NotFoundException();
    const [l] = await this.db.select().from(eb5Leads).where(eq(eb5Leads.id, inv.leadId));
    const client = l.clientUserId === ctx.userId;
    const fin = eb5Can(w.roles, 'invoice.issue') || eb5Can(w.roles, 'payment.verify') || eb5Can(w.roles, 'reports.view');
    if (!fin && !(client && inv.ledger === 'consultancy')) throw new NotFoundException();
    return { w, inv, l, client };
  }

  @Get('invoices')
  async invoices(@Ctx() ctx: RequestContext) {
    const w = await this.a.open(ctx);
    const fin = eb5Can(w.roles, 'invoice.issue') || eb5Can(w.roles, 'payment.verify') || eb5Can(w.roles, 'reports.view');
    const rows = await this.db.select({ i: eb5Invoices, lead: eb5Leads.code, name: eb5Leads.fullName }).from(eb5Invoices).innerJoin(eb5Leads, eq(eb5Leads.id, eb5Invoices.leadId))
      .where(fin ? undefined : and(eq(eb5Leads.clientUserId, ctx.userId), eq(eb5Invoices.ledger, 'consultancy'))).orderBy(desc(eb5Invoices.createdAt)).limit(500);
    const ledgers = EB5_LEDGERS.map((g) => ({ ...g, totals: rows.filter((r) => r.i.ledger === g.code).reduce((a, r) => { a[r.i.status] = (a[r.i.status] ?? 0) + r.i.amountCents; return a; }, {} as Record<string, number>) }));
    return { invoices: rows.map((r) => ({ ...r.i, lead: r.lead, name: r.name })), ledgers: fin ? ledgers : undefined, note: 'Each ledger is separate and never added together. EB-5 investment capital is tracking only — it is paid under the project’s offering documents, never through COLLABIZ.' };
  }

  @Get('invoices/:id')
  async invoiceDetail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { inv, l, client } = await this.invoice(ctx, id);
    const s = await this.a.settings();
    return { ...inv, lead: { id: l.id, code: l.code, fullName: l.fullName }, isClient: client, entity: s.consultancyEntity, brand: s.brand };
  }

  @Post('invoices/:id/report-payment')
  @HttpCode(200)
  async reportPayment(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reference: z.string().trim().min(4, 'Enter the bank transfer reference').max(80) }))) b: { reference: string }) {
    const { w, inv, client } = await this.invoice(ctx, id);
    if (!client && !eb5Can(w.roles, 'invoice.issue')) throw new ForbiddenException();
    if (inv.ledger !== 'consultancy' || inv.status !== 'issued') throw new ConflictException('This invoice is not awaiting payment');
    await this.db.update(eb5Invoices).set({ status: 'payment_reported', paymentReference: b.reference, paymentReportedAt: new Date() }).where(eq(eb5Invoices.id, id));
    await this.audit.record(ctx, { action: 'eb5.payment_reported', objectType: 'eb5_invoice', objectId: id });
    await this.a.notifyUsers(await this.a.staffUsers(['finance']), `Payment reported on ${inv.number}`, 'Verify it against the CITRUS360 bank account before confirming.', `/eb5/invoices/${id}`);
    return { id, status: 'payment_reported' };
  }

  /** Finance confirms cleared funds. Only then is the receipt issued and the contracted service activated. */
  @Post('invoices/:id/verify')
  @HttpCode(200)
  async verify(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ bankReference: z.string().trim().min(4).max(80), clearedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))) b: { bankReference: string; clearedOn: string }) {
    const { w, inv, l } = await this.invoice(ctx, id);
    if (!eb5Can(w.roles, 'payment.verify')) throw new ForbiddenException('Only finance verifies payments');
    if (inv.createdBy === ctx.userId) throw new ForbiddenException('The person who issued the invoice cannot verify its payment');
    if (inv.status !== 'payment_reported') throw new ConflictException('No payment has been reported on this invoice');
    const receipt = await this.a.code(eb5Invoices, 'C360-RCPT');
    await this.db.update(eb5Invoices).set({ status: 'verified', verifiedBy: ctx.userId, verifiedAt: new Date(), receiptNumber: receipt, paymentReference: `${inv.paymentReference} · bank ${b.bankReference} · cleared ${b.clearedOn}` }).where(eq(eb5Invoices.id, id));
    if (inv.description.startsWith('Commencement')) {
      await this.raiseStage(l, 10, 'Commencement payment verified by finance', ctx.userId);
      const [fresh] = await this.db.select().from(eb5Leads).where(eq(eb5Leads.id, l.id));
      await this.raiseStage(fresh, 11, 'Consultancy active', ctx.userId);
      if (inv.agreementId) { const [ag] = await this.db.select().from(eb5Agreements).where(eq(eb5Agreements.id, inv.agreementId)); if (ag?.state === 'Counter-Signed') await this.db.update(eb5Agreements).set({ state: 'Active', history: [...(ag.history as unknown[]), { at: now(), by: ctx.userId, state: 'Active', note: 'Commencement payment verified' }], updatedAt: new Date() }).where(eq(eb5Agreements.id, ag.id)); }
    }
    await this.audit.record(ctx, { action: 'eb5.payment_verified', objectType: 'eb5_invoice', objectId: id, after: { receipt } });
    await this.a.notifyUsers([l.clientUserId, l.assignedManagerId], `Payment confirmed — receipt ${receipt}`, `${inv.number} · ${usd(inv.amountCents)}`, `/eb5/invoices/${id}`);
    return { id, status: 'verified', receipt };
  }
}
void ({} as Eb5Who);
