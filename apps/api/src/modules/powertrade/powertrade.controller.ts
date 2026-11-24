/**
 * COLLABIZ POWERTRADE API (tested in test/powertrade.e2e.ts). Feature flag FEATURE_POWERTRADE.
 *
 * Permissions: members read their own organization's POWERTRADE data; owners and admins change it. Collaborations are
 * visible to both parties. Unite reviewers (super_admin, unite_admin) approve collaborations; Unite finance (finance,
 * super_admin) verifies benefits, records collections, clears tax review and approves allocations.
 * Controls: savings, sales, benefits and cash stay separate; only collected, verified money can be allocated and only with
 * approval; nothing executes a PPA, moves money or nets invoices between different legal entities.
 */
import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  PT_DOCUMENTS, PT_REQUIRED_DOCS, PT_STATUS, PT_TRANSITIONS, PtAllocationSchema, PtBenefitSchema, PtCollaborationSchema, PtCollectSchema, PtContributionSchema, PtDocumentSchema,
  PtEnergyNeedSchema, PtProfileSchema, PtReverseSchema, PtSavingSchema, PtScenarioSchema, PtTransitionSchema, parseReverse, type PtModel, type PtStatus,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { commissionEntries, memberships, notifications, organizations, ptAllocations, ptBenefits, ptCollaborations, ptContributions, ptEnergyNeeds, ptEnergySavings, ptProfiles, ptScenarios, purchaseOrders, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { config } from '../../config';
import { PowertradeService } from './powertrade.service';

const reviewer = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const financeStaff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'finance');
const code = () => `PT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
type Collab = typeof ptCollaborations.$inferSelect;
type DocState = Record<string, { status: string; reference?: string | null; by: string; at: string }>;

@ApiTags('powertrade')
@Controller()
export class PowertradeController {
  constructor(@InjectDb() private db: Db, private audit: AuditService, private pt: PowertradeService) {}

  private on() { if (!config().FEATURE_POWERTRADE) throw new NotFoundException('POWERTRADE is not enabled'); }
  private canEdit(ctx: RequestContext) {
    const m = ctx.memberships?.find((x) => x.organizationId === ctx.orgId);
    if (m && !['org_owner', 'org_admin'].includes(m.role)) throw new ForbiddenException('Only owners and admins of your business can change POWERTRADE details');
  }
  private async profile(orgId: string) { const [p] = await this.db.select().from(ptProfiles).where(eq(ptProfiles.orgId, orgId)).limit(1); return p ?? null; }
  private async needProfile(ctx: RequestContext) { const p = await this.profile(ctx.orgId!); if (!p) throw new BadRequestException('Join POWERTRADE first'); return p; }
  private async collab(ctx: RequestContext, id: string) {
    const [c] = await this.db.select().from(ptCollaborations).where(eq(ptCollaborations.id, id)).limit(1);
    if (!c) throw new NotFoundException('Collaboration not found');
    const party = c.orgId === ctx.orgId || c.counterpartyOrgId === ctx.orgId;
    if (!party && !reviewer(ctx) && !financeStaff(ctx)) throw new NotFoundException('Collaboration not found');
    return { c, party };
  }
  private async teamOf(orgId: string) { return (await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')))).map((x) => x.u); }
  private async notify(userIds: string[], title: string, text: string, link: string) {
    const ids = [...new Set(userIds)]; if (ids.length) await this.db.insert(notifications).values(ids.map((u) => ({ userId: u, kind: 'powertrade', title, body: text, link })));
  }

  // ------------------------------------------------------------------ profile, energy, contributions
  @Get('powertrade/profile')
  @RequireOrg()
  async getProfile(@Ctx() ctx: RequestContext) {
    this.on();
    const p = await this.profile(ctx.orgId!);
    return { profile: p, energy: await this.pt.latestNeed(ctx.orgId!), contributions: await this.db.select().from(ptContributions).where(eq(ptContributions.orgId, ctx.orgId!)).orderBy(desc(ptContributions.createdAt)) };
  }

  @Put('powertrade/profile')
  @RequireOrg()
  async saveProfile(@Ctx() ctx: RequestContext, @Body(body(PtProfileSchema)) b: z.infer<typeof PtProfileSchema>) {
    this.on(); this.canEdit(ctx);
    const v = { industry: b.industry, state: b.state, discom: b.discom ?? null, gstin: b.gstin ?? null, about: b.about ?? null, interests: b.interests, shareProducts: b.shareProducts, shareEnergySummary: b.shareEnergySummary };
    const [p] = await this.db.insert(ptProfiles).values({ orgId: ctx.orgId!, createdBy: ctx.userId, ...v }).onConflictDoUpdate({ target: ptProfiles.orgId, set: { ...v, updatedAt: new Date() } }).returning();
    await this.audit.record(ctx, { action: 'powertrade.profile_saved', objectType: 'pt_profile', objectId: p.id, after: { interests: b.interests } });
    return p;
  }

  @Post('powertrade/energy-needs')
  @RequireOrg()
  @HttpCode(201)
  async energy(@Ctx() ctx: RequestContext, @Body(body(PtEnergyNeedSchema)) b: z.infer<typeof PtEnergyNeedSchema>) {
    this.on(); this.canEdit(ctx); await this.needProfile(ctx);
    const [n] = await this.db.insert(ptEnergyNeeds).values({ orgId: ctx.orgId!, createdBy: ctx.userId, ...b, peakSharePct: b.peakSharePct ?? null }).returning();
    return { ...n, presentMonthlyBillPaise: n.monthlyUnits * n.tariffPaisePerKwh };
  }

  @Post('powertrade/business-contributions')
  @RequireOrg()
  @HttpCode(201)
  async contribute(@Ctx() ctx: RequestContext, @Body(body(PtContributionSchema)) b: z.infer<typeof PtContributionSchema>) {
    this.on(); this.canEdit(ctx); await this.needProfile(ctx);
    const [c] = await this.db.insert(ptContributions).values({ orgId: ctx.orgId!, createdBy: ctx.userId, kind: b.kind, title: b.title, description: b.description ?? null, keywords: b.keywords, capacity: b.capacity ?? null, locations: b.locations ?? null, exportCapable: b.exportCapable }).returning();
    return c;
  }

  @Delete('powertrade/business-contributions/:id')
  @RequireOrg()
  async removeContribution(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.on(); this.canEdit(ctx);
    const [c] = await this.db.update(ptContributions).set({ active: false, updatedAt: new Date() }).where(and(eq(ptContributions.id, id), eq(ptContributions.orgId, ctx.orgId!))).returning({ id: ptContributions.id });
    if (!c) throw new NotFoundException();
    return { ok: true };
  }

  // ------------------------------------------------------------------ power scenarios, matching
  @Post('powertrade/power-scenarios/compare')
  @RequireOrg()
  @HttpCode(200)
  async compare(@Ctx() ctx: RequestContext, @Body(body(PtScenarioSchema)) b: z.infer<typeof PtScenarioSchema>) {
    this.on();
    const p = await this.needProfile(ctx);
    const need = await this.pt.latestNeed(ctx.orgId!);
    if (!need) throw new BadRequestException('Add your electricity profile first');
    const r = this.pt.compare(need, p.state, b);
    const [s] = await this.db.insert(ptScenarios).values({ orgId: ctx.orgId!, inputs: b, results: r, illustrative: r.illustrative, createdBy: ctx.userId }).returning({ id: ptScenarios.id });
    return { id: s.id, ...r };
  }

  @Get('powertrade/matches/recommended')
  @RequireOrg()
  async recommended(@Ctx() ctx: RequestContext) { this.on(); await this.needProfile(ctx); return this.pt.matches(ctx.orgId!); }

  /** Reverse matching: describe the business in plain words; the rules read units, products and wants, then match. */
  @Post('powertrade/matches/reverse')
  @RequireOrg()
  @HttpCode(200)
  async reverse(@Ctx() ctx: RequestContext, @Body(body(PtReverseSchema)) b: z.infer<typeof PtReverseSchema>) {
    this.on();
    const parsed = parseReverse(b.text);
    const m = await this.pt.matches(ctx.orgId!, { products: parsed.products, wantsPower: parsed.wants.includes('buy_power'), monthlyUnits: parsed.monthlyUnits });
    const models: PtModel[] = [];
    if (parsed.wants.includes('buy_power')) models.push('discounted_ppa');
    if (parsed.products.length) models.push('solar_integration', 'product_for_power');
    if (parsed.wants.includes('group_captive')) models.push('group_captive');
    if (parsed.wants.includes('find_customers')) models.push('distribution');
    return { parsed, suggestedModels: [...new Set(models)], ...m, note: `${m.note} Read from your words by rules — check the numbers before relying on them.` };
  }

  // ------------------------------------------------------------------ collaborations
  @Get('powertrade/collaborations')
  @RequireOrg()
  async collabs(@Ctx() ctx: RequestContext) {
    this.on();
    const rows = await this.db.select({ c: ptCollaborations, owner: organizations.displayName }).from(ptCollaborations).innerJoin(organizations, eq(organizations.id, ptCollaborations.orgId))
      .where(or(eq(ptCollaborations.orgId, ctx.orgId!), eq(ptCollaborations.counterpartyOrgId, ctx.orgId!))).orderBy(desc(ptCollaborations.updatedAt));
    const cps = rows.map((r) => r.c.counterpartyOrgId).filter(Boolean) as string[];
    const names = cps.length ? new Map((await this.db.select({ id: organizations.id, n: organizations.displayName }).from(organizations).where(inArray(organizations.id, cps))).map((x) => [x.id, x.n])) : new Map();
    return { items: rows.map(({ c, owner }) => ({ ...this.view(c), owner, counterparty: c.counterpartyOrgId ? names.get(c.counterpartyOrgId) ?? null : 'Unite Group', mine: c.orgId === ctx.orgId })) };
  }

  private view(c: Collab) {
    const docs = c.documents as DocState;
    const required = PT_REQUIRED_DOCS[c.model as PtModel] ?? [];
    return { ...c, statusLabel: PT_STATUS[c.status as PtStatus], required: required.map((d) => ({ docType: d, label: PT_DOCUMENTS[d], status: docs[d]?.status ?? 'missing', reference: docs[d]?.reference ?? null })),
      next: PT_TRANSITIONS[c.status as PtStatus] ?? [] };
  }

  @Post('powertrade/collaborations')
  @RequireOrg()
  @HttpCode(201)
  async propose(@Ctx() ctx: RequestContext, @Body(body(PtCollaborationSchema)) b: z.infer<typeof PtCollaborationSchema>) {
    this.on(); this.canEdit(ctx); await this.needProfile(ctx);
    if (b.counterpartyOrgId === ctx.orgId) throw new BadRequestException('Choose another business');
    if (b.counterpartyOrgId) {
      const [o] = await this.db.select({ v: organizations.verificationStatus }).from(organizations).where(eq(organizations.id, b.counterpartyOrgId)).limit(1);
      if (!o) throw new BadRequestException('Business not found');
    }
    if (b.model === 'product_for_power' && (!b.supplyValuePaise || !b.benefitValuePaise)) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { supplyValuePaise: 'Product-for-Power needs the supply value and the separately agreed benefit' } });
    if (b.benefitValuePaise && b.supplyValuePaise && b.benefitValuePaise > b.supplyValuePaise) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { benefitValuePaise: 'The benefit cannot exceed the supply value' } });
    const [c] = await this.db.insert(ptCollaborations).values({ code: code(), model: b.model, title: b.title, summary: b.summary, orgId: ctx.orgId!, counterpartyOrgId: b.counterpartyOrgId ?? null,
      supplyValuePaise: b.supplyValuePaise ?? null, benefitValuePaise: b.benefitValuePaise ?? null, powerTariffPaisePerKwh: b.powerTariffPaisePerKwh ?? null, powerUnitsPerMonth: b.powerUnitsPerMonth ?? null,
      history: [{ to: 'draft', by: ctx.userId, at: new Date().toISOString(), note: 'Created' }], createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'powertrade.collaboration_created', objectType: 'pt_collaboration', objectId: c.id, after: { model: b.model } });
    return this.view(c);
  }

  @Get('powertrade/collaborations/:id')
  @RequireOrg()
  async one(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.on();
    const { c } = await this.collab(ctx, id);
    const actors = (c.history as { by: string }[]).map((h) => h.by);
    const names = actors.length ? new Map((await this.db.select({ id: users.id, n: users.fullName }).from(users).where(inArray(users.id, actors))).map((x) => [x.id, x.n])) : new Map();
    const benefits = await this.db.select().from(ptBenefits).where(eq(ptBenefits.collaborationId, id));
    return { ...this.view(c), history: (c.history as { to: string; by: string; at: string; note?: string }[]).map((h) => ({ ...h, byName: names.get(h.by) ?? 'System' })), benefits };
  }

  @Post('powertrade/collaborations/:id/transition')
  @RequireOrg()
  @HttpCode(200)
  async transition(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(PtTransitionSchema)) b: z.infer<typeof PtTransitionSchema>) {
    this.on();
    const { c, party } = await this.collab(ctx, id);
    const from = c.status as PtStatus;
    if (!PT_TRANSITIONS[from]?.includes(b.to)) throw new ConflictException(`A collaboration that is ${PT_STATUS[from].toLowerCase()} cannot move to ${PT_STATUS[b.to].toLowerCase()}`);
    if (b.to === 'approved' && !reviewer(ctx)) throw new ForbiddenException('Approval needs a Unite reviewer after technical, regulatory and tax checks');
    if (b.to !== 'approved' && !party && !reviewer(ctx)) throw new ForbiddenException();
    if (b.to !== 'approved' && party) this.canEdit(ctx);
    const docs = c.documents as DocState;
    const required = PT_REQUIRED_DOCS[c.model as PtModel] ?? [];
    if (b.to === 'approved') {
      const pre = required.filter((d) => !['product_invoice', 'reconciliation', 'settlement_authorisation'].includes(d) && docs[d]?.status !== 'accepted');
      if (pre.length) throw new ConflictException({ message: 'Documents still needed before approval', missing: pre.map((d) => PT_DOCUMENTS[d]) });
      if (required.includes('tax_review') && c.taxReview !== 'cleared') throw new ConflictException('Tax review must be cleared before approval');
    }
    if (b.to === 'completed') {
      const open = required.filter((d) => docs[d]?.status !== 'accepted');
      if (open.length) throw new ConflictException({ message: 'Every document must be accepted before completion', missing: open.map((d) => PT_DOCUMENTS[d]) });
    }
    const history = [...(c.history as object[]), { from, to: b.to, by: ctx.userId, at: new Date().toISOString(), note: b.note ?? null }];
    await this.db.update(ptCollaborations).set({ status: b.to, history, updatedAt: new Date() }).where(eq(ptCollaborations.id, id));
    const others = [...await this.teamOf(c.orgId), ...(c.counterpartyOrgId ? await this.teamOf(c.counterpartyOrgId) : [])].filter((u) => u !== ctx.userId);
    await this.notify(others, `${c.code}: ${PT_STATUS[b.to]}`, c.title, `/powertrade/collaborations/${id}`);
    await this.audit.record(ctx, { action: 'powertrade.collaboration_moved', objectType: 'pt_collaboration', objectId: id, after: { from, to: b.to } });
    return { status: b.to };
  }

  /** Parties mark documents provided (with a reference to the vault or contract); Unite reviewers accept or reject them. */
  @Post('powertrade/collaborations/:id/documents')
  @RequireOrg()
  @HttpCode(200)
  async doc(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(PtDocumentSchema)) b: z.infer<typeof PtDocumentSchema>) {
    this.on();
    const { c, party } = await this.collab(ctx, id);
    if ((b.status === 'accepted' || b.status === 'rejected') && !reviewer(ctx) && !financeStaff(ctx)) throw new ForbiddenException('Only a Unite reviewer accepts documents');
    if ((b.status === 'provided' || b.status === 'missing') && !party) throw new ForbiddenException();
    if (b.status === 'provided' && !b.reference) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { reference: 'Add the document reference (vault link, contract or PO number)' } });
    const docs = { ...(c.documents as DocState), [b.docType]: { status: b.status, reference: b.reference ?? (c.documents as DocState)[b.docType]?.reference ?? null, by: ctx.userId, at: new Date().toISOString() } };
    await this.db.update(ptCollaborations).set({ documents: docs, updatedAt: new Date() }).where(eq(ptCollaborations.id, id));
    return { ok: true };
  }

  @Post('powertrade/collaborations/:id/tax-review')
  @HttpCode(200)
  async taxReview(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ result: z.enum(['cleared', 'issues']), note: z.string().trim().min(5).max(600) }))) b: { result: 'cleared' | 'issues'; note: string }) {
    this.on();
    if (!financeStaff(ctx) && !ctx.platformRoles.includes('compliance')) throw new ForbiddenException('Tax review is recorded by Unite finance or compliance');
    const { c } = await this.collab(ctx, id);
    const history = [...(c.history as object[]), { to: c.status, by: ctx.userId, at: new Date().toISOString(), note: `Tax review: ${b.result} — ${b.note}` }];
    await this.db.update(ptCollaborations).set({ taxReview: b.result, history, updatedAt: new Date() }).where(eq(ptCollaborations.id, id));
    await this.audit.record(ctx, { action: 'powertrade.tax_review', objectType: 'pt_collaboration', objectId: id, after: { result: b.result } });
    return { taxReview: b.result };
  }

  // ------------------------------------------------------------------ benefits, allocations, savings
  @Get('powertrade/benefits')
  @RequireOrg()
  async benefits(@Ctx() ctx: RequestContext) {
    this.on();
    const items = await this.db.select().from(ptBenefits).where(eq(ptBenefits.orgId, ctx.orgId!)).orderBy(desc(ptBenefits.createdAt));
    const allocs = await this.db.select().from(ptAllocations).where(eq(ptAllocations.orgId, ctx.orgId!)).orderBy(desc(ptAllocations.createdAt));
    return { items: items.map((b) => ({ ...b, netPaise: b.grossPaise - b.costsPaise - b.taxesPaise, allocatedPaise: allocs.filter((a) => a.benefitId === b.id && a.status !== 'rejected').reduce((s, a) => s + a.amountPaise, 0) })), allocations: allocs };
  }

  @Post('powertrade/benefits')
  @RequireOrg()
  @HttpCode(201)
  async addBenefit(@Ctx() ctx: RequestContext, @Body(body(PtBenefitSchema)) b: z.infer<typeof PtBenefitSchema>) {
    this.on(); this.canEdit(ctx); await this.needProfile(ctx);
    if (b.collaborationId) { const { party } = await this.collab(ctx, b.collaborationId); if (!party) throw new ForbiddenException(); }
    const [x] = await this.db.insert(ptBenefits).values({ orgId: ctx.orgId!, collaborationId: b.collaborationId ?? null, source: b.source, description: b.description, grossPaise: b.grossPaise, costsPaise: b.costsPaise, taxesPaise: b.taxesPaise, status: b.status, evidence: b.evidence ?? null, createdBy: ctx.userId }).returning();
    return x;
  }

  /** Brings an approved or settled commission from the finance ledger in as a benefit (referenced once, never copied twice). */
  @Post('powertrade/benefits/from-commission/:entryId')
  @RequireOrg()
  @HttpCode(201)
  async fromCommission(@Ctx() ctx: RequestContext, @Param('entryId', ParseUUIDPipe) entryId: string) {
    this.on(); this.canEdit(ctx); await this.needProfile(ctx);
    const [e] = await this.db.select().from(commissionEntries).where(and(eq(commissionEntries.id, entryId), eq(commissionEntries.beneficiaryOrgId, ctx.orgId!))).limit(1);
    if (!e) throw new NotFoundException('Commission not found');
    if (!['earned', 'approved', 'invoiced', 'settled'].includes(e.status)) throw new ConflictException('Only earned commissions can be counted — estimated or eligible ones are not money yet');
    const [x] = await this.db.insert(ptBenefits).values({ orgId: ctx.orgId!, source: 'commission', description: e.description, grossPaise: e.taxable + e.gst, costsPaise: 0, taxesPaise: e.gst + e.tds,
      status: e.status === 'settled' ? 'verified' : 'earned', sourceRef: `commission:${e.id}`, evidence: `Finance ledger entry ${e.id} (${e.status})`, createdBy: ctx.userId }).onConflictDoNothing().returning();
    if (!x) throw new ConflictException('This commission is already counted');
    return x;
  }

  @Post('powertrade/benefits/:id/verify')
  @HttpCode(200)
  async verify(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.on(); if (!financeStaff(ctx)) throw new ForbiddenException('Benefits are verified by Unite finance');
    const [b] = await this.db.select().from(ptBenefits).where(eq(ptBenefits.id, id)).limit(1);
    if (!b) throw new NotFoundException();
    if (b.status !== 'earned') throw new ConflictException(b.status === 'anticipated' ? 'Anticipated benefits are not earned yet' : 'Already verified');
    await this.db.update(ptBenefits).set({ status: 'verified', verifiedBy: ctx.userId, verifiedAt: new Date(), updatedAt: new Date() }).where(eq(ptBenefits.id, id));
    await this.audit.record(ctx, { action: 'powertrade.benefit_verified', objectType: 'pt_benefit', objectId: id });
    return { status: 'verified' };
  }

  /** Cash actually received, recorded with its bank/settlement reference. Partial collections add up. */
  @Post('powertrade/benefits/:id/collect')
  @HttpCode(200)
  async collect(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(PtCollectSchema)) b: z.infer<typeof PtCollectSchema>) {
    this.on(); if (!financeStaff(ctx)) throw new ForbiddenException('Collections are recorded by Unite finance');
    const [x] = await this.db.select().from(ptBenefits).where(eq(ptBenefits.id, id)).limit(1);
    if (!x) throw new NotFoundException();
    if (x.status !== 'verified' && x.status !== 'collected') throw new ConflictException('Verify the benefit before recording collection');
    const net = x.grossPaise - x.costsPaise - x.taxesPaise;
    const total = x.collectedPaise + b.collectedPaise;
    if (total > net) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { collectedPaise: 'More than the net benefit' } });
    await this.db.update(ptBenefits).set({ collectedPaise: total, collectionRef: [x.collectionRef, b.reference].filter(Boolean).join('; '), status: 'collected', updatedAt: new Date() }).where(eq(ptBenefits.id, id));
    await this.audit.record(ctx, { action: 'powertrade.benefit_collected', objectType: 'pt_benefit', objectId: id, after: { collectedPaise: b.collectedPaise } });
    return { collectedPaise: total };
  }

  @Post('powertrade/allocations')
  @RequireOrg()
  @HttpCode(201)
  async allocate(@Ctx() ctx: RequestContext, @Body(body(PtAllocationSchema)) b: z.infer<typeof PtAllocationSchema>) {
    this.on(); this.canEdit(ctx);
    const [x] = await this.db.select().from(ptBenefits).where(and(eq(ptBenefits.id, b.benefitId), eq(ptBenefits.orgId, ctx.orgId!))).limit(1);
    if (!x) throw new NotFoundException('Benefit not found');
    if (x.status !== 'collected') throw new ConflictException('Only collected money can support the power expense');
    const used = (await this.db.select({ s: sql<number>`coalesce(sum(${ptAllocations.amountPaise}),0)::bigint` }).from(ptAllocations).where(and(eq(ptAllocations.benefitId, x.id), ne(ptAllocations.status, 'rejected'))))[0].s;
    if (Number(used) + b.amountPaise > x.collectedPaise) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { amountPaise: `Only ₹${((x.collectedPaise - Number(used)) / 100).toLocaleString('en-IN')} of this benefit is still available` } });
    const [a] = await this.db.insert(ptAllocations).values({ orgId: ctx.orgId!, benefitId: x.id, period: b.period, amountPaise: b.amountPaise, note: b.note ?? null, requestedBy: ctx.userId }).returning();
    return a;
  }

  @Post('powertrade/allocations/:id/decide')
  @HttpCode(200)
  async decideAllocation(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(300).optional() }))) b: { decision: 'approve' | 'reject'; note?: string }) {
    this.on(); if (!financeStaff(ctx)) throw new ForbiddenException('Allocations are approved by Unite finance');
    const [a] = await this.db.select().from(ptAllocations).where(eq(ptAllocations.id, id)).limit(1);
    if (!a) throw new NotFoundException();
    if (a.status !== 'requested') throw new ConflictException('Already decided');
    await this.db.update(ptAllocations).set({ status: b.decision === 'approve' ? 'approved' : 'rejected', note: b.note ?? a.note, decidedBy: ctx.userId, decidedAt: new Date() }).where(eq(ptAllocations.id, id));
    await this.notify(await this.teamOf(a.orgId), b.decision === 'approve' ? 'Benefit allocation approved' : 'Benefit allocation not approved', `₹${(a.amountPaise / 100).toLocaleString('en-IN')} for ${a.period}`, '/powertrade/finance');
    await this.audit.record(ctx, { action: `powertrade.allocation_${b.decision === 'approve' ? 'approved' : 'rejected'}`, objectType: 'pt_allocation', objectId: id });
    return { status: b.decision === 'approve' ? 'approved' : 'rejected' };
  }

  @Post('powertrade/savings')
  @RequireOrg()
  @HttpCode(201)
  async saving(@Ctx() ctx: RequestContext, @Body(body(PtSavingSchema)) b: z.infer<typeof PtSavingSchema>) {
    this.on(); this.canEdit(ctx);
    const [s] = await this.db.insert(ptEnergySavings).values({ orgId: ctx.orgId!, period: b.period, baselinePaise: b.baselinePaise, actualPaise: b.actualPaise, evidence: b.evidence, createdBy: ctx.userId })
      .onConflictDoUpdate({ target: [ptEnergySavings.orgId, ptEnergySavings.period], set: { baselinePaise: b.baselinePaise, actualPaise: b.actualPaise, evidence: b.evidence, verified: false, verifiedBy: null } }).returning();
    return s;
  }

  @Post('powertrade/savings/:id/verify')
  @HttpCode(200)
  async verifySaving(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.on(); if (!financeStaff(ctx)) throw new ForbiddenException();
    const [s] = await this.db.update(ptEnergySavings).set({ verified: true, verifiedBy: ctx.userId }).where(eq(ptEnergySavings.id, id)).returning({ id: ptEnergySavings.id });
    if (!s) throw new NotFoundException();
    return { verified: true };
  }

  // ------------------------------------------------------------------ dashboard and finance summary
  @Get('powertrade/finance/summary')
  @RequireOrg()
  async finance(@Ctx() ctx: RequestContext, @Query('period') period?: string) { this.on(); return this.summary(ctx.orgId!, period); }

  private async summary(orgId: string, period?: string) {
    const ben = await this.db.select().from(ptBenefits).where(eq(ptBenefits.orgId, orgId));
    const allocs = await this.db.select().from(ptAllocations).where(eq(ptAllocations.orgId, orgId));
    const sav = await this.db.select().from(ptEnergySavings).where(eq(ptEnergySavings.orgId, orgId));
    const po = (await this.db.select({ s: sql<number>`coalesce(sum(${purchaseOrders.total}),0)::bigint`, n: sql<number>`count(*)::int` }).from(purchaseOrders).where(and(eq(purchaseOrders.supplierOrgId, orgId), inArray(purchaseOrders.status, ['accepted', 'in_fulfilment', 'shipped', 'delivered', 'closed']))))[0];
    const sum = (xs: number[]) => xs.reduce((a, b) => a + Number(b), 0);
    const net = (b: typeof ben[number]) => b.grossPaise - b.costsPaise - b.taxesPaise;
    const p = period ?? new Date().toISOString().slice(0, 7);
    const need = await this.pt.latestNeed(orgId);
    const monthSav = sav.find((s) => s.period === p);
    const approvedThisMonth = sum(allocs.filter((a) => a.period === p && a.status === 'approved').map((a) => a.amountPaise));
    const expense = monthSav ? monthSav.actualPaise : need ? need.monthlyUnits * need.tariffPaisePerKwh : null;
    return {
      period: p,
      savings: { verified: sum(sav.filter((s) => s.verified).map((s) => s.baselinePaise - s.actualPaise)), reported: sum(sav.map((s) => s.baselinePaise - s.actualPaise)), months: sav.length },
      sales: { purchaseOrdersPaise: Number(po.s), orders: po.n, note: 'Turnover from accepted purchase orders on Trading — not profit.' },
      benefits: {
        anticipated: sum(ben.filter((b) => b.status === 'anticipated').map(net)), earned: sum(ben.filter((b) => b.status === 'earned').map(net)),
        verified: sum(ben.filter((b) => b.status === 'verified').map(net)), collected: sum(ben.map((b) => b.collectedPaise)),
      },
      allocations: { requested: sum(allocs.filter((a) => a.status === 'requested').map((a) => a.amountPaise)), approved: sum(allocs.filter((a) => a.status === 'approved').map((a) => a.amountPaise)) },
      powerExpense: { period: p, expensePaise: expense, basis: monthSav ? 'Bill recorded for the month' : need ? 'Estimated from your electricity profile' : null, approvedSupportPaise: approvedThisMonth,
        netEconomicExpensePaise: expense == null ? null : Math.max(0, expense - approvedThisMonth) },
      sample: ben.some((b) => b.sample),
    };
  }

  @Get('powertrade/dashboard')
  @RequireOrg()
  async dashboard(@Ctx() ctx: RequestContext) {
    this.on();
    const profile = await this.profile(ctx.orgId!);
    if (!profile) return { joined: false };
    const [energy, contributions, collabs, fin, scen] = await Promise.all([
      this.pt.latestNeed(ctx.orgId!),
      this.db.select().from(ptContributions).where(and(eq(ptContributions.orgId, ctx.orgId!), eq(ptContributions.active, true))),
      this.collabs(ctx),
      this.summary(ctx.orgId!),
      this.db.select({ id: ptScenarios.id, results: ptScenarios.results, createdAt: ptScenarios.createdAt }).from(ptScenarios).where(eq(ptScenarios.orgId, ctx.orgId!)).orderBy(desc(ptScenarios.createdAt)).limit(1),
    ]);
    const active = collabs.items.filter((c) => !['completed', 'cancelled', 'expired'].includes(c.status));
    return { joined: true, profile, energy, contributions, collaborations: collabs.items.slice(0, 8), activeCount: active.length, finance: fin, lastScenario: scen[0] ?? null,
      actions: this.actionsFor(profile, energy, contributions.length, collabs.items, fin) };
  }

  /** Source-linked priorities (the same rules feed ACTION OS). */
  private actionsFor(profile: typeof ptProfiles.$inferSelect, energy: unknown, contributions: number, collabs: (Collab & { required: { status: string; label: string }[]; mine: boolean })[], fin: Awaited<ReturnType<PowertradeController['summary']>>) {
    const out: { title: string; detail: string; href: string; tone: 'urgent' | 'normal' }[] = [];
    if (!energy && (profile.interests.includes('buy_power') || profile.interests.includes('group_captive'))) out.push({ title: 'Add your electricity profile', detail: 'Units, tariff and contract demand — needed to compare power options.', href: '/powertrade/power', tone: 'urgent' });
    if (!contributions) out.push({ title: 'Add what you can contribute', detail: 'Products, capacity or services — so buyers and Unite projects can find you.', href: '/powertrade/join#contributions', tone: 'normal' });
    for (const c of collabs.filter((x) => ['awaiting_documents', 'submitted', 'negotiating', 'under_review'].includes(x.status))) {
      const missing = c.required.filter((d) => d.status === 'missing');
      if (missing.length) out.push({ title: `${c.code}: ${missing.length} document${missing.length > 1 ? 's' : ''} missing`, detail: missing.slice(0, 3).map((d) => d.label).join(', '), href: `/powertrade/collaborations/${c.id}`, tone: c.status === 'awaiting_documents' ? 'urgent' : 'normal' });
    }
    if (fin.benefits.earned > 0) out.push({ title: 'Earned benefits waiting for verification', detail: 'Unite finance verifies them before they count.', href: '/powertrade/finance', tone: 'normal' });
    if (fin.allocations.requested > 0) out.push({ title: 'Allocation waiting for approval', detail: 'Unite finance reviews allocation requests.', href: '/powertrade/finance', tone: 'normal' });
    return out;
  }

  // ------------------------------------------------------------------ admin
  @Get('admin/powertrade/overview')
  async admin(@Ctx() ctx: RequestContext) {
    this.on();
    if (!reviewer(ctx) && !financeStaff(ctx)) throw new ForbiddenException();
    const count = async (t: typeof ptProfiles | typeof ptCollaborations, w?: ReturnType<typeof eq>) => (await this.db.select({ n: sql<number>`count(*)::int` }).from(t).where(w))[0].n;
    const reviews = await this.db.select({ c: ptCollaborations, org: organizations.displayName }).from(ptCollaborations).innerJoin(organizations, eq(organizations.id, ptCollaborations.orgId))
      .where(inArray(ptCollaborations.status, ['submitted', 'under_review', 'awaiting_documents', 'negotiating'])).orderBy(desc(ptCollaborations.updatedAt)).limit(50);
    const benefits = await this.db.select({ b: ptBenefits, org: organizations.displayName }).from(ptBenefits).innerJoin(organizations, eq(organizations.id, ptBenefits.orgId)).where(inArray(ptBenefits.status, ['earned', 'verified'])).orderBy(desc(ptBenefits.createdAt)).limit(50);
    const allocs = await this.db.select({ a: ptAllocations, org: organizations.displayName }).from(ptAllocations).innerJoin(organizations, eq(organizations.id, ptAllocations.orgId)).where(eq(ptAllocations.status, 'requested')).limit(50);
    return {
      counts: { profiles: await count(ptProfiles, eq(ptProfiles.sample, false)), collaborations: await count(ptCollaborations, eq(ptCollaborations.sample, false)), sampleRecordsExcluded: true },
      reviews: reviews.map(({ c, org }) => ({ ...this.view(c), owner: org })),
      benefits: benefits.map(({ b, org }) => ({ ...b, org, netPaise: b.grossPaise - b.costsPaise - b.taxesPaise })),
      allocations: allocs.map(({ a, org }) => ({ ...a, org })),
    };
  }
}

@Module({ controllers: [PowertradeController], providers: [PowertradeService], exports: [PowertradeService] })
export class PowertradeModule {}
