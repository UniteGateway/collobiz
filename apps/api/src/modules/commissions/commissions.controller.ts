/**
 * Stage 12 — Commission ledger & finance (screens 027, 095–104, 135, 138, 157–159).
 *
 * Gate: no unearned payout, idempotent settlement.
 *  - Commission is EARNED only when the customer's payment for the underlying milestone is recorded (project invoice
 *    paid). Certification makes a line eligible; nothing before payment can be approved, requested or paid.
 *  - Approval is by finance, with two distinct approvers at or above DUAL_APPROVAL_THRESHOLD. Settlement of a payout
 *    at or above the threshold must be recorded by someone other than the payout approver.
 *  - A database trigger refuses to attach an un-earned / un-approved line to a payout or to mark it settled, and locks
 *    amounts once approved (changes only through a dispute adjustment).
 *  - Settlement is idempotent: Idempotency-Key replay, one settlement per payout, one payout per bank reference; the
 *    journal and settlements are append-only.
 *  - Agreements freeze the policy terms with a hash; policies are activated by a second person and are immutable.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  ApprovalNoteSchema, assertTransition, calculateCommission, CommissionAgreementSchema, CommissionCalcSchema, CommissionMachine, CommissionPolicySchema, DisputeMessageSchema, FinanceDisputeRulingSchema,
  FinanceDisputeSchema, FinanceEnquirySchema, HoldSchema, PayoutRequestSchema, SettlementSchema, type CommissionState,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  bankProfiles, commissionAgreements, commissionApprovals, commissionEntries, commissionJournal, commissionPolicies, financeDisputes, financeEnquiries, leadClaims, memberships, milestones, notifications, organizations,
  payoutRequests, projectInvoices, projects, settlements, users, directOffers, offerSales,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireCaps, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { canonicalJson, randomDigits, sha256 } from '../../common/crypto';
import { Idempotent } from '../../common/idempotency';
import { config } from '../../config';

type Entry = typeof commissionEntries.$inferSelect;
type Policy = typeof commissionPolicies.$inferSelect;
type Terms = { policy: { code: string; version: number; name: string; basis: string; rateBps: number | null; flatAmount: number | null; tiers: { upTo: number | null; rateBps: number }[] | null; tdsBps: number; clawbackDays: number; trigger: string }; shareBps: number; gstRegistered: boolean; projectValue: number };
const year = () => new Date().getUTCFullYear();
const PAYABLE_POOL: CommissionState[] = ['approved'];
const quarterOf = (d: Date) => { const m = d.getUTCMonth(); const fy = m >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; return `FY${fy}-${String((fy + 1) % 100).padStart(2, '0')} Q${m >= 3 ? Math.floor((m - 3) / 3) + 1 : 4}`; };

/** Server-side amounts for one ledger line: the agreement-level commission is allocated pro rata to the milestone. */
export function lineAmounts(terms: Terms, base: number) {
  const p = terms.policy;
  const total = calculateCommission({ dealValue: terms.projectValue, basis: p.basis as 'percent' | 'flat' | 'tiered', ratePct: p.rateBps != null ? p.rateBps / 100 : undefined, flatAmount: p.flatAmount ?? undefined, tiers: p.tiers?.map((t) => ({ upTo: t.upTo, ratePct: t.rateBps / 100 })) });
  const allocated = terms.projectValue ? Math.round((total.gross * base) / terms.projectValue) : 0;
  const b = calculateCommission({ dealValue: base, basis: 'flat', flatAmount: allocated, sharePct: terms.shareBps / 100, gstPct: terms.gstRegistered ? 18 : 0, tdsPct: p.tdsBps / 100 });
  return { gross: b.gross, share: b.share, deductions: b.deductions, taxable: b.taxable, gst: b.gst, tds: b.tds, payable: b.payable };
}

@Injectable()
export class CommissionsService {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  async journal(entryId: string, action: string, from: string | null, to: string | null, amount: number | null, note: string | null, userId: string | null, tx: Db = this.db) {
    await tx.insert(commissionJournal).values({ entryId, action, fromStatus: from, toStatus: to, amount, note, userId });
  }
  async move(e: Entry, to: CommissionState, userId: string | null, note: string | null, extra: Partial<Entry> = {}, tx: Db = this.db) {
    assertTransition(CommissionMachine, e.status as CommissionState, to);
    const [u] = await tx.update(commissionEntries).set({ ...extra, status: to, version: e.version + 1, updatedAt: new Date() }).where(and(eq(commissionEntries.id, e.id), eq(commissionEntries.version, e.version))).returning();
    if (!u) throw new ConflictException('The commission line was changed concurrently. Reload and try again.');
    await this.journal(e.id, `entry.${to}`, e.status, to, u.payable, note, userId, tx);
    return u;
  }
  async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const ms = await this.db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    for (const m of ms) await this.db.insert(notifications).values({ userId: m.userId, kind: 'commission', title, body: text, link });
  }
  async termsOf(agreementId: string) {
    const [a] = await this.db.select().from(commissionAgreements).where(eq(commissionAgreements.id, agreementId)).limit(1);
    return a;
  }

  /** Hook from projects (083): certification makes the line eligible, on the certified amount. Creates the line if the milestone was added later. */
  async onMilestoneCertified(m: typeof milestones.$inferSelect) {
    const ags = await this.db.select().from(commissionAgreements).where(and(eq(commissionAgreements.projectId, m.projectId), eq(commissionAgreements.status, 'active')));
    for (const a of ags) {
      let [e] = await this.db.select().from(commissionEntries).where(and(eq(commissionEntries.agreementId, a.id), eq(commissionEntries.milestoneId, m.id))).limit(1);
      const base = m.certifiedAmount ?? m.amount;
      const amounts = lineAmounts(a.terms as Terms, base);
      if (!e) {
        [e] = await this.db.insert(commissionEntries).values({ agreementId: a.id, beneficiaryOrgId: a.beneficiaryOrgId, milestoneId: m.id, description: `Milestone ${m.seq}: ${m.title}`, baseAmount: base, ...amounts }).returning();
        await this.journal(e.id, 'entry.estimated', null, 'estimated', e.payable, 'Line created from a milestone added after the agreement', null);
      }
      if (e.status !== 'estimated') continue;
      await this.db.update(commissionEntries).set({ baseAmount: base, ...amounts, updatedAt: new Date() }).where(eq(commissionEntries.id, e.id));
      const fresh = (await this.db.select().from(commissionEntries).where(eq(commissionEntries.id, e.id)))[0];
      await this.move(fresh, 'eligible', null, `Milestone certified for ${base / 100}`);
      await this.notifyOrg(a.beneficiaryOrgId, 'Commission now eligible', `${e.description}: eligible; earned when the customer pays.`, '/earnings/live');
    }
  }

  /** Hook from projects (083): the customer payment is the ONLY event that makes commission earned. */
  async onInvoicePaid(inv: typeof projectInvoices.$inferSelect) {
    const lines = await this.db.select({ e: commissionEntries, a: commissionAgreements }).from(commissionEntries).innerJoin(commissionAgreements, eq(commissionAgreements.id, commissionEntries.agreementId))
      .where(and(eq(commissionEntries.milestoneId, inv.milestoneId), eq(commissionAgreements.status, 'active')));
    for (const { e, a } of lines) {
      if (e.status !== 'eligible') continue;
      const amounts = lineAmounts(a.terms as Terms, inv.amount);
      await this.db.update(commissionEntries).set({ baseAmount: inv.amount, ...amounts, projectInvoiceId: inv.id, updatedAt: new Date() }).where(eq(commissionEntries.id, e.id));
      const fresh = (await this.db.select().from(commissionEntries).where(eq(commissionEntries.id, e.id)))[0];
      await this.move(fresh, 'earned', null, `Customer payment received on ${inv.number} (${inv.paymentReference ?? ''})`, { earnedAt: new Date() });
      await this.notifyOrg(a.beneficiaryOrgId, 'Commission earned', `${e.description}: ${amounts.payable / 100} earned; awaiting finance approval.`, '/earnings/live');
    }
  }
}

function assertFinance(ctx: RequestContext, cap: 'commission.approve' | 'payout.approve' | 'finance.reconcile') {
  if (!ctx.caps.has(cap) || !ctx.platformRoles.length) throw new ForbiddenException('Finance team only');
  if (!ctx.mfaVerified) throw new ForbiddenException('Multi-factor authentication is required for finance actions');
}

@ApiTags('commissions')
@Controller()
export class CommissionsController {
  constructor(@InjectDb() private db: Db, private svc: CommissionsService, private audit: AuditService) {}

  // ---------- 135 policies ----------
  @Get('commissions/policies')
  async policies() {
    return this.db.select().from(commissionPolicies).orderBy(asc(commissionPolicies.code), desc(commissionPolicies.version));
  }

  @Post('admin/commission-policies')
  @RequireCaps('commission.configure')
  @HttpCode(201)
  async createPolicy(@Ctx() ctx: RequestContext, @Body(body(CommissionPolicySchema)) b: z.infer<typeof CommissionPolicySchema>) {
    const [{ v }] = await this.db.select({ v: sql<number>`coalesce(max(version),0)::int` }).from(commissionPolicies).where(eq(commissionPolicies.code, b.code));
    const [p] = await this.db.insert(commissionPolicies).values({ ...b, version: v + 1, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'commission.policy_drafted', objectType: 'commission_policy', objectId: p.id, after: { code: p.code, version: p.version } });
    return p;
  }

  /** Activation needs a second person with finance approval rights; the previous active version of the code is retired. */
  @Post('admin/commission-policies/:id/activate')
  @HttpCode(200)
  async activatePolicy(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    assertFinance(ctx, 'commission.approve');
    const [p] = await this.db.select().from(commissionPolicies).where(eq(commissionPolicies.id, id)).limit(1);
    if (!p) throw new NotFoundException('Policy not found');
    if (p.status !== 'draft') throw new ConflictException('Only draft policies can be activated');
    if (p.createdBy === ctx.userId) throw new ForbiddenException('The policy author cannot activate it; a second person must');
    const u = await this.db.transaction(async (tx) => {
      await tx.update(commissionPolicies).set({ status: 'retired' }).where(and(eq(commissionPolicies.code, p.code), eq(commissionPolicies.status, 'active')));
      const [u] = await tx.update(commissionPolicies).set({ status: 'active', activatedBy: ctx.userId, activatedAt: new Date() }).where(eq(commissionPolicies.id, id)).returning();
      await this.audit.record(ctx, { action: 'commission.policy_activated', objectType: 'commission_policy', objectId: id, after: { code: p.code, version: p.version } }, tx as unknown as Db);
      return u;
    });
    return u;
  }

  @Post('admin/commission-policies/:id/retire')
  @RequireCaps('commission.configure')
  @HttpCode(200)
  async retirePolicy(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [u] = await this.db.update(commissionPolicies).set({ status: 'retired' }).where(and(eq(commissionPolicies.id, id), eq(commissionPolicies.status, 'active'))).returning();
    if (!u) throw new ConflictException('Only active policies can be retired');
    await this.audit.record(ctx, { action: 'commission.policy_retired', objectType: 'commission_policy', objectId: id });
    return u;
  }

  // ---------- 097 calculator (no state change) ----------
  @Post('commissions/calculate')
  @HttpCode(200)
  async calculate(@Body(body(CommissionCalcSchema)) b: z.infer<typeof CommissionCalcSchema>) {
    let basis = b.basis; let rateBps = b.rateBps; let flatAmount = b.flatAmount; let tiers = b.tiers; let tdsBps = b.tdsBps;
    let policy: Policy | undefined;
    if (b.policyId) {
      [policy] = await this.db.select().from(commissionPolicies).where(eq(commissionPolicies.id, b.policyId)).limit(1);
      if (!policy) throw new NotFoundException('Policy not found');
      basis = policy.basis as typeof basis; rateBps = policy.rateBps ?? undefined; flatAmount = policy.flatAmount ?? undefined; tiers = (policy.tiers as typeof tiers) ?? undefined; tdsBps ??= policy.tdsBps;
    }
    if (!basis) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { basis: 'Choose a policy or a basis' } });
    try {
      const r = calculateCommission({ dealValue: b.dealValue, basis, ratePct: rateBps != null ? rateBps / 100 : undefined, flatAmount, tiers: tiers?.map((t) => ({ upTo: t.upTo, ratePct: t.rateBps / 100 })), sharePct: b.shareBps / 100, gstPct: b.gstRegistered ? 18 : 0, tdsPct: (tdsBps ?? 500) / 100 });
      return { ...r, policy: policy ? { id: policy.id, code: policy.code, version: policy.version, name: policy.name, status: policy.status, legalReviewed: policy.legalReviewed } : null, disclaimer: 'Illustration only. Commission is earned only when the customer pays under the contract; rates are demo values pending approval of the commission matrix (B-10).' };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // ---------- agreements (096/157) ----------
  /** Created by the paying organization (project owner) or platform commission administrators. Terms are frozen and hashed. */
  @Post('commissions/agreements')
  @RequireOrg()
  @HttpCode(201)
  async createAgreement(@Ctx() ctx: RequestContext, @Body(body(CommissionAgreementSchema)) b: z.infer<typeof CommissionAgreementSchema>) {
    const [p] = await this.db.select().from(projects).where(eq(projects.id, b.projectId)).limit(1);
    if (!p) throw new NotFoundException('Project not found');
    const platform = ctx.caps.has('commission.configure');
    if (!platform && !(ctx.orgId === p.ownerOrgId && ctx.caps.has('contract.manage'))) throw new ForbiddenException('Only the paying organization or COLLABIZ commission administrators can create agreements');
    const [pol] = await this.db.select().from(commissionPolicies).where(eq(commissionPolicies.id, b.policyId)).limit(1);
    if (!pol || pol.status !== 'active') throw new BadRequestException({ message: 'Check the highlighted fields', fields: { policyId: 'Choose an active commission policy' } });
    const [ben] = await this.db.select().from(organizations).where(eq(organizations.id, b.beneficiaryOrgId)).limit(1);
    if (!ben || ben.verificationStatus !== 'verified' || !['partner_company', 'partner_individual'].includes(ben.type) || ben.id === p.ownerOrgId) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { beneficiaryOrgId: 'The beneficiary must be a verified partner other than the payer' } });
    if (b.leadClaimId) {
      const [lc] = await this.db.select().from(leadClaims).where(eq(leadClaims.id, b.leadClaimId)).limit(1);
      if (!lc || lc.introducerOrgId !== b.beneficiaryOrgId) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { leadClaimId: 'The lead certificate must belong to the beneficiary' } });
    }
    const [bank] = await this.db.select({ gst: bankProfiles.gstRegistered }).from(bankProfiles).where(eq(bankProfiles.organizationId, ben.id)).limit(1);
    const terms: Terms = { policy: { code: pol.code, version: pol.version, name: pol.name, basis: pol.basis, rateBps: pol.rateBps, flatAmount: pol.flatAmount, tiers: pol.tiers as Terms['policy']['tiers'], tdsBps: pol.tdsBps, clawbackDays: pol.clawbackDays, trigger: pol.trigger }, shareBps: b.shareBps, gstRegistered: !!bank?.gst, projectValue: p.value };
    const ms = await this.db.select().from(milestones).where(eq(milestones.projectId, p.id)).orderBy(asc(milestones.seq));
    const a = await this.db.transaction(async (tx) => {
      const [a] = await tx.insert(commissionAgreements).values({ code: `CA-${year()}-${randomDigits(6)}`, beneficiaryOrgId: ben.id, payerOrgId: p.ownerOrgId, projectId: p.id, leadClaimId: b.leadClaimId, policyId: pol.id, terms, termsHash: sha256(canonicalJson(terms)), shareBps: b.shareBps, createdBy: ctx.userId }).returning();
      for (const m of ms) {
        const [e] = await tx.insert(commissionEntries).values({ agreementId: a.id, beneficiaryOrgId: ben.id, milestoneId: m.id, description: `Milestone ${m.seq}: ${m.title}`, baseAmount: m.amount, ...lineAmounts(terms, m.amount) }).returning();
        await this.svc.journal(e.id, 'entry.estimated', null, 'estimated', e.payable, 'Projected from the project schedule', ctx.userId, tx as unknown as Db);
      }
      await this.audit.record(ctx, { action: 'commission.agreement_created', objectType: 'commission_agreement', objectId: a.id, after: { code: a.code, beneficiary: ben.displayName, policy: `${pol.code} v${pol.version}`, termsHash: a.termsHash } }, tx as unknown as Db);
      return a;
    });
    await this.svc.notifyOrg(ben.id, `Commission agreement ${a.code}`, `${p.title}: commission is earned when the customer pays each milestone.`, `/commissions/agreements/${a.id}`);
    return a;
  }

  private async agreementFor(ctx: RequestContext, id: string) {
    const [a] = await this.db.select().from(commissionAgreements).where(eq(commissionAgreements.id, id)).limit(1);
    const orgs = ctx.memberships.map((m) => m.organizationId);
    if (!a || !(orgs.includes(a.beneficiaryOrgId) || orgs.includes(a.payerOrgId) || ctx.caps.has('commission.approve') || ctx.caps.has('commission.configure'))) throw new NotFoundException('Agreement not found');
    return a;
  }

  @Get('commissions/agreements')
  @RequireOrg()
  async agreements(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ a: commissionAgreements, project: projects.title, offer: directOffers.title, offerCode: directOffers.code, payer: organizations.displayName }).from(commissionAgreements).leftJoin(projects, eq(projects.id, commissionAgreements.projectId)).leftJoin(directOffers, eq(directOffers.id, commissionAgreements.offerId)).innerJoin(organizations, eq(organizations.id, commissionAgreements.payerOrgId))
      .where(or(eq(commissionAgreements.beneficiaryOrgId, ctx.orgId!), eq(commissionAgreements.payerOrgId, ctx.orgId!))).orderBy(desc(commissionAgreements.createdAt));
    return rows.map((r) => ({ ...r.a, project: r.project ?? `${r.offerCode}: ${r.offer}`, source: r.a.projectId ? 'project' : 'offer', payer: r.payer }));
  }

  @Get('commissions/agreements/:id')
  async agreement(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const a = await this.agreementFor(ctx, id);
    const [p] = a.projectId ? await this.db.select().from(projects).where(eq(projects.id, a.projectId)) : [];
    const [o] = a.offerId ? await this.db.select().from(directOffers).where(eq(directOffers.id, a.offerId)) : [];
    const names = await this.db.select({ id: organizations.id, name: organizations.displayName }).from(organizations).where(inArray(organizations.id, [a.beneficiaryOrgId, a.payerOrgId]));
    const lines = await this.db.select({ e: commissionEntries, m: milestones, inv: projectInvoices, sale: offerSales }).from(commissionEntries).leftJoin(milestones, eq(milestones.id, commissionEntries.milestoneId)).leftJoin(projectInvoices, eq(projectInvoices.id, commissionEntries.projectInvoiceId))
      .leftJoin(offerSales, eq(offerSales.id, commissionEntries.offerSaleId)).where(eq(commissionEntries.agreementId, id)).orderBy(asc(milestones.seq), asc(commissionEntries.createdAt));
    return { ...a, termsIntact: sha256(canonicalJson(a.terms)) === a.termsHash, project: p ? { id: p.id, code: p.code, title: p.title, status: p.status, value: p.value } : null, offer: o ? { id: o.id, code: o.code, title: o.title, status: o.status } : null,
      beneficiary: names.find((n) => n.id === a.beneficiaryOrgId)?.name, payer: names.find((n) => n.id === a.payerOrgId)?.name,
      lines: lines.map((l) => ({ ...l.e, milestone: l.m ? { seq: l.m.seq, title: l.m.title, status: l.m.status, dueDate: l.m.dueDate, amount: l.m.amount, certifiedAmount: l.m.certifiedAmount } : null, sale: l.sale ? { code: l.sale.code, buyer: l.sale.buyerName, status: l.sale.status, saleValue: l.sale.saleValue, paidAt: l.sale.paidAt } : null, invoice: l.inv ? { number: l.inv.number, status: l.inv.status, paidAt: l.inv.paidAt } : null })) };
  }

  // ---------- 027/095/158 earnings ----------
  @Get('earnings')
  @RequireOrg()
  async earnings(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ e: commissionEntries, a: commissionAgreements, project: sql<string>`coalesce(${projects.title}, ${directOffers.code} || ': ' || ${directOffers.title})` }).from(commissionEntries).innerJoin(commissionAgreements, eq(commissionAgreements.id, commissionEntries.agreementId)).leftJoin(projects, eq(projects.id, commissionAgreements.projectId)).leftJoin(directOffers, eq(directOffers.id, commissionAgreements.offerId))
      .where(eq(commissionEntries.beneficiaryOrgId, ctx.orgId!)).orderBy(desc(commissionEntries.updatedAt));
    const buckets: Record<string, number> = { estimated: 0, eligible: 0, earned: 0, approved: 0, invoiced: 0, settled: 0, on_hold: 0, disputed: 0, reversed: 0 };
    for (const r of rows) buckets[r.e.status] = (buckets[r.e.status] ?? 0) + r.e.payable;
    const settledRows = rows.filter((r) => r.e.status === 'settled' && r.e.settledAt);
    const ytd = new Date(Date.UTC(new Date().getUTCMonth() >= 3 ? year() : year() - 1, 3, 1));
    return {
      buckets, totals: { projected: buckets.estimated + buckets.eligible, earnedNotPaid: buckets.earned + buckets.approved + buckets.invoiced, paidThisFy: settledRows.filter((r) => r.e.settledAt! >= ytd).reduce((s, r) => s + r.e.payable, 0), tdsThisFy: settledRows.filter((r) => r.e.settledAt! >= ytd).reduce((s, r) => s + r.e.tds, 0) },
      readyToRequest: rows.filter((r) => r.e.status === 'approved' && !r.e.payoutId).reduce((s, r) => s + r.e.payable, 0),
      lines: rows.map((r) => ({ id: r.e.id, description: r.e.description, project: r.project, agreementId: r.a.id, agreementCode: r.a.code, status: r.e.status, payable: r.e.payable, taxable: r.e.taxable, gst: r.e.gst, tds: r.e.tds, gross: r.e.gross, baseAmount: r.e.baseAmount, earnedAt: r.e.earnedAt, approvedAt: r.e.approvedAt, settledAt: r.e.settledAt, payoutId: r.e.payoutId, holdReason: r.e.holdReason, updatedAt: r.e.updatedAt })),
    };
  }

  /** 158 — journal timeline for one line (beneficiary, payer or finance). */
  @Get('commissions/entries/:id/journal')
  async entryJournal(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [e] = await this.db.select().from(commissionEntries).where(eq(commissionEntries.id, id)).limit(1);
    if (!e) throw new NotFoundException();
    await this.agreementFor(ctx, e.agreementId);
    const rows = await this.db.select({ j: commissionJournal, who: users.fullName }).from(commissionJournal).leftJoin(users, eq(users.id, commissionJournal.userId)).where(eq(commissionJournal.entryId, id)).orderBy(asc(commissionJournal.createdAt));
    return rows.map((r) => ({ ...r.j, who: r.who ?? 'System (payment trigger)' }));
  }

  // ---------- 098 approvals (finance) ----------
  @Get('finance/approvals')
  async approvalQueue(@Ctx() ctx: RequestContext) {
    assertFinance(ctx, 'commission.approve');
    const rows = await this.db.select({ e: commissionEntries, a: commissionAgreements, ben: organizations.displayName, project: sql<string>`coalesce(${projects.title}, ${directOffers.code} || ': ' || ${directOffers.title})` }).from(commissionEntries).innerJoin(commissionAgreements, eq(commissionAgreements.id, commissionEntries.agreementId))
      .innerJoin(organizations, eq(organizations.id, commissionEntries.beneficiaryOrgId)).leftJoin(projects, eq(projects.id, commissionAgreements.projectId)).leftJoin(directOffers, eq(directOffers.id, commissionAgreements.offerId))
      .where(inArray(commissionEntries.status, ['earned', 'on_hold', 'eligible'])).orderBy(asc(commissionEntries.earnedAt));
    const approvals = rows.length ? await this.db.select({ a: commissionApprovals, who: users.fullName }).from(commissionApprovals).innerJoin(users, eq(users.id, commissionApprovals.approverUserId)).where(inArray(commissionApprovals.entryId, rows.map((r) => r.e.id))) : [];
    const threshold = config().DUAL_APPROVAL_THRESHOLD;
    return { threshold, entries: rows.map((r) => {
      const ap = approvals.filter((x) => x.a.entryId === r.e.id);
      return { ...r.e, beneficiary: r.ben, project: r.project, agreementCode: r.a.code, approvalsRequired: r.e.payable >= threshold ? 2 : 1, approvals: ap.map((x) => ({ who: x.who, at: x.a.createdAt, note: x.a.note })), approvedByMe: ap.some((x) => x.a.approverUserId === ctx.userId) };
    }) };
  }

  @Post('finance/entries/:id/approve')
  @Idempotent()
  @HttpCode(200)
  async approve(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ApprovalNoteSchema)) b: { note?: string }) {
    assertFinance(ctx, 'commission.approve');
    const [e] = await this.db.select().from(commissionEntries).where(eq(commissionEntries.id, id)).limit(1);
    if (!e) throw new NotFoundException();
    if (e.status !== 'earned') throw new ConflictException(e.status === 'estimated' || e.status === 'eligible' ? 'Not earned yet: commission is earned only when the customer payment is recorded' : `Cannot approve a line that is ${e.status}`);
    if (ctx.memberships.some((m) => m.organizationId === e.beneficiaryOrgId)) throw new ForbiddenException('You cannot approve your own organization’s commission');
    const required = e.payable >= config().DUAL_APPROVAL_THRESHOLD ? 2 : 1;
    return this.db.transaction(async (tx) => {
      try { await tx.insert(commissionApprovals).values({ entryId: id, approverUserId: ctx.userId, note: b.note }); }
      catch { throw new ConflictException('You have already approved this line; a different approver is required'); }
      const n = (await tx.select({ n: sql<number>`count(*)::int` }).from(commissionApprovals).where(eq(commissionApprovals.entryId, id)))[0].n;
      await this.svc.journal(id, 'entry.approval_recorded', e.status, e.status, e.payable, `${n}/${required} approvals${b.note ? ` — ${b.note}` : ''}`, ctx.userId, tx as unknown as Db);
      if (n < required) return { ...e, approvals: n, approvalsRequired: required };
      const u = await this.svc.move(e, 'approved', ctx.userId, 'Approved for payout', { approvedAt: new Date() }, tx as unknown as Db);
      await this.audit.record(ctx, { action: 'commission.approved', objectType: 'commission_entry', objectId: id, after: { payable: e.payable, approvals: n } }, tx as unknown as Db);
      return { ...u, approvals: n, approvalsRequired: required };
    });
  }

  @Post('finance/entries/:id/hold')
  @HttpCode(200)
  async hold(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(HoldSchema)) b: { reason: string }) {
    assertFinance(ctx, 'commission.approve');
    const [e] = await this.db.select().from(commissionEntries).where(eq(commissionEntries.id, id)).limit(1);
    if (!e) throw new NotFoundException();
    const u = await this.svc.move(e, 'on_hold', ctx.userId, b.reason, { holdReason: b.reason });
    await this.svc.notifyOrg(e.beneficiaryOrgId, 'Commission on hold', `${e.description}: ${b.reason}`, '/earnings/live');
    return u;
  }

  /** Release returns the line to the furthest state it had legitimately reached. */
  @Post('finance/entries/:id/release')
  @HttpCode(200)
  async release(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ApprovalNoteSchema)) b: { note?: string }) {
    assertFinance(ctx, 'commission.approve');
    const [e] = await this.db.select().from(commissionEntries).where(eq(commissionEntries.id, id)).limit(1);
    if (!e || e.status !== 'on_hold') throw new ConflictException('Only lines on hold can be released');
    const to: CommissionState = e.approvedAt ? 'approved' : e.earnedAt ? 'earned' : 'eligible';
    return this.svc.move(e, to, ctx.userId, b.note ?? 'Hold released', { holdReason: null });
  }

  @Post('finance/entries/:id/reverse')
  @HttpCode(200)
  async reverse(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(HoldSchema)) b: { reason: string }) {
    assertFinance(ctx, 'commission.approve');
    const [e] = await this.db.select().from(commissionEntries).where(eq(commissionEntries.id, id)).limit(1);
    if (!e) throw new NotFoundException();
    const u = await this.svc.move(e, 'reversed', ctx.userId, b.reason);
    await this.audit.record(ctx, { action: 'commission.reversed', objectType: 'commission_entry', objectId: id, reason: b.reason });
    await this.svc.notifyOrg(e.beneficiaryOrgId, 'Commission reversed', `${e.description}: ${b.reason}`, '/earnings/live');
    return u;
  }

  // ---------- 099 payout requests (partner) ----------
  @Post('payouts')
  @RequireOrg()
  @RequireCaps('payout.request')
  @Idempotent()
  @HttpCode(201)
  async requestPayout(@Ctx() ctx: RequestContext, @Body(body(PayoutRequestSchema)) b: z.infer<typeof PayoutRequestSchema>) {
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Your organization must be verified to request payouts');
    const [bank] = await this.db.select().from(bankProfiles).where(eq(bankProfiles.organizationId, ctx.orgId!)).limit(1);
    if (!bank?.verified) throw new ConflictException('Your bank account must be verified before a payout can be requested');
    const entries = await this.db.select().from(commissionEntries).where(and(inArray(commissionEntries.id, b.entryIds), eq(commissionEntries.beneficiaryOrgId, ctx.orgId!)));
    if (entries.length !== new Set(b.entryIds).size) throw new NotFoundException('One or more commission lines were not found');
    const bad = entries.filter((e) => !PAYABLE_POOL.includes(e.status as CommissionState) || e.payoutId);
    if (bad.length) throw new ConflictException({ message: 'Only earned and approved commission can be requested', problems: bad.map((e) => `${e.description}: ${e.status}`) });
    const sum = (k: 'taxable' | 'gst' | 'tds' | 'payable') => entries.reduce((s, e) => s + e[k], 0);
    const p = await this.db.transaction(async (tx) => {
      let p: typeof payoutRequests.$inferSelect;
      try {
        [p] = await tx.insert(payoutRequests).values({ code: `PAY-${year()}-${randomDigits(6)}`, beneficiaryOrgId: ctx.orgId!, partnerInvoiceNo: b.partnerInvoiceNo, taxable: sum('taxable'), gst: sum('gst'), tds: sum('tds'), payable: sum('payable'), requestedBy: ctx.userId }).returning();
      } catch { throw new ConflictException('This invoice number was already used for a payout request'); }
      for (const e of entries) await this.svc.move(e, 'invoiced', ctx.userId, `Payout requested on invoice ${b.partnerInvoiceNo}`, { payoutId: p.id }, tx as unknown as Db);
      await this.audit.record(ctx, { action: 'payout.requested', objectType: 'payout_request', objectId: p.id, after: { code: p.code, payable: p.payable, entries: entries.length } }, tx as unknown as Db);
      return p;
    });
    return p;
  }

  @Get('payouts')
  @RequireOrg()
  async payouts(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ p: payoutRequests, s: settlements }).from(payoutRequests).leftJoin(settlements, eq(settlements.payoutId, payoutRequests.id)).where(eq(payoutRequests.beneficiaryOrgId, ctx.orgId!)).orderBy(desc(payoutRequests.createdAt));
    return rows.map((r) => ({ ...r.p, settlement: r.s ? { bankReference: r.s.bankReference, method: r.s.method, paidAt: r.s.paidAt, amount: r.s.amount } : null }));
  }

  // ---------- 138 finance controls ----------
  @Get('finance/payouts')
  async payoutQueue(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    assertFinance(ctx, 'payout.approve');
    const rows = await this.db.select({ p: payoutRequests, ben: organizations.displayName, s: settlements, bank: { last4: bankProfiles.accountLast4, ifsc: bankProfiles.ifsc, verified: bankProfiles.verified } }).from(payoutRequests)
      .innerJoin(organizations, eq(organizations.id, payoutRequests.beneficiaryOrgId)).leftJoin(settlements, eq(settlements.payoutId, payoutRequests.id)).leftJoin(bankProfiles, eq(bankProfiles.organizationId, payoutRequests.beneficiaryOrgId))
      .where(status ? eq(payoutRequests.status, status) : undefined).orderBy(desc(payoutRequests.createdAt)).limit(200);
    const recon = await this.db.select({ status: commissionEntries.status, n: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(payable),0)::bigint` }).from(commissionEntries).groupBy(commissionEntries.status);
    return { threshold: config().DUAL_APPROVAL_THRESHOLD, payouts: rows.map((r) => ({ ...r.p, beneficiary: r.ben, bank: r.bank, settlement: r.s })), ledger: recon.map((x) => ({ ...x, amount: Number(x.amount) })) };
  }

  @Post('finance/payouts/:id/approve')
  @HttpCode(200)
  async approvePayout(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    assertFinance(ctx, 'payout.approve');
    const [p] = await this.db.select().from(payoutRequests).where(eq(payoutRequests.id, id)).limit(1);
    if (!p) throw new NotFoundException();
    if (p.status !== 'requested') throw new ConflictException('Only new payout requests can be approved');
    const notApproved = await this.db.select({ id: commissionEntries.id }).from(commissionEntries).where(and(eq(commissionEntries.payoutId, id), sql`(${commissionEntries.status} <> 'invoiced' or ${commissionEntries.earnedAt} is null or ${commissionEntries.approvedAt} is null)`)).limit(1);
    if (notApproved.length) throw new ConflictException('A line on this payout is no longer payable (on hold or disputed)');
    const [u] = await this.db.update(payoutRequests).set({ status: 'approved', approvedBy: ctx.userId, approvedAt: new Date(), updatedAt: new Date() }).where(and(eq(payoutRequests.id, id), eq(payoutRequests.status, 'requested'))).returning();
    await this.audit.record(ctx, { action: 'payout.approved', objectType: 'payout_request', objectId: id, after: { payable: p.payable } });
    return u;
  }

  @Post('finance/payouts/:id/reject')
  @HttpCode(200)
  async rejectPayout(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(HoldSchema)) b: { reason: string }) {
    assertFinance(ctx, 'payout.approve');
    const [p] = await this.db.select().from(payoutRequests).where(eq(payoutRequests.id, id)).limit(1);
    if (!p || !['requested', 'approved'].includes(p.status)) throw new ConflictException('Only unpaid payout requests can be rejected');
    await this.db.transaction(async (tx) => {
      await tx.update(payoutRequests).set({ status: 'rejected', rejectionReason: b.reason, updatedAt: new Date() }).where(eq(payoutRequests.id, id));
      const es = await tx.select().from(commissionEntries).where(and(eq(commissionEntries.payoutId, id), eq(commissionEntries.status, 'invoiced')));
      for (const e of es) await this.svc.move(e, 'approved', ctx.userId, `Payout ${p.code} rejected: ${b.reason}`, { payoutId: null }, tx as unknown as Db);
      await this.audit.record(ctx, { action: 'payout.rejected', objectType: 'payout_request', objectId: id, reason: b.reason }, tx as unknown as Db);
    });
    await this.svc.notifyOrg(p.beneficiaryOrgId, `Payout ${p.code} rejected`, b.reason, '/payments/history');
    return { ok: true };
  }

  /**
   * Idempotent settlement: Idempotency-Key replays return the original response; a second settlement for the same payout
   * or the same bank reference is refused by unique constraints; the amount must equal the approved payable.
   */
  @Post('finance/payouts/:id/settle')
  @Idempotent()
  @HttpCode(200)
  async settle(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(SettlementSchema)) b: z.infer<typeof SettlementSchema>) {
    assertFinance(ctx, 'finance.reconcile');
    const [p] = await this.db.select().from(payoutRequests).where(eq(payoutRequests.id, id)).limit(1);
    if (!p) throw new NotFoundException();
    if (p.status === 'settled') throw new ConflictException('This payout has already been settled');
    if (p.status !== 'approved') throw new ConflictException('Only approved payouts can be settled');
    if (p.payable >= config().DUAL_APPROVAL_THRESHOLD && p.approvedBy === ctx.userId) throw new ForbiddenException('Above the dual-approval threshold, the person who approved the payout cannot also record its settlement');
    const s = await this.db.transaction(async (tx) => {
      let s: typeof settlements.$inferSelect;
      try {
        [s] = await tx.insert(settlements).values({ payoutId: id, amount: p.payable, bankReference: b.bankReference.toUpperCase(), method: b.method, paidAt: b.paidAt ? new Date(b.paidAt) : new Date(), recordedBy: ctx.userId }).returning();
      } catch { throw new ConflictException('A settlement already exists for this payout or bank reference'); }
      const [u] = await tx.update(payoutRequests).set({ status: 'settled', updatedAt: new Date() }).where(and(eq(payoutRequests.id, id), eq(payoutRequests.status, 'approved'))).returning();
      if (!u) throw new ConflictException('This payout has already been settled');
      const es = await tx.select().from(commissionEntries).where(eq(commissionEntries.payoutId, id));
      for (const e of es) await this.svc.move(e, 'settled', ctx.userId, `Paid by ${b.method.toUpperCase()} ${b.bankReference}`, { settledAt: s.paidAt }, tx as unknown as Db);
      await this.audit.record(ctx, { action: 'payout.settled', objectType: 'payout_request', objectId: id, after: { amount: p.payable, bankReference: s.bankReference, lines: es.length } }, tx as unknown as Db);
      return s;
    });
    await this.svc.notifyOrg(p.beneficiaryOrgId, `Paid: ${p.code}`, `${p.payable / 100} sent by ${b.method.toUpperCase()} (${s.bankReference}).`, '/payments/history');
    return s;
  }

  // ---------- 101 tax records ----------
  @Get('tax-records')
  @RequireOrg()
  async tax(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ e: commissionEntries, p: payoutRequests }).from(commissionEntries).innerJoin(payoutRequests, eq(payoutRequests.id, commissionEntries.payoutId))
      .where(and(eq(commissionEntries.beneficiaryOrgId, ctx.orgId!), eq(commissionEntries.status, 'settled')));
    const quarters = new Map<string, { quarter: string; taxable: number; gst: number; tds: number; paid: number; invoices: Set<string> }>();
    for (const r of rows) {
      const q = quarterOf(r.e.settledAt!);
      const x = quarters.get(q) ?? { quarter: q, taxable: 0, gst: 0, tds: 0, paid: 0, invoices: new Set<string>() };
      x.taxable += r.e.taxable; x.gst += r.e.gst; x.tds += r.e.tds; x.paid += r.e.payable; x.invoices.add(r.p.partnerInvoiceNo);
      quarters.set(q, x);
    }
    const [bank] = await this.db.select({ pan: bankProfiles.panLast4, gstin: bankProfiles.gstin, gst: bankProfiles.gstRegistered, section: bankProfiles.tdsSection }).from(bankProfiles).where(eq(bankProfiles.organizationId, ctx.orgId!)).limit(1);
    return { profile: bank ? { panLast4: bank.pan, gstin: bank.gstin, gstRegistered: bank.gst, tdsSection: bank.section ?? '194H' } : null,
      quarters: [...quarters.values()].map((q) => ({ ...q, invoices: [...q.invoices], tdsCertificate: 'Form 16A is issued after the quarterly TDS return is filed (pending tax integration, B-05).' })) };
  }

  // ---------- 104/159 disputes ----------
  @Post('finance/disputes')
  @RequireOrg()
  @HttpCode(201)
  async dispute(@Ctx() ctx: RequestContext, @Body(body(FinanceDisputeSchema)) b: z.infer<typeof FinanceDisputeSchema>) {
    let prior: string | null = null;
    if (b.kind === 'commission') {
      const [e] = await this.db.select().from(commissionEntries).where(and(eq(commissionEntries.id, b.entryId!), eq(commissionEntries.beneficiaryOrgId, ctx.orgId!))).limit(1);
      if (!e) throw new NotFoundException('Commission line not found');
      if (!['earned', 'approved', 'settled'].includes(e.status)) throw new ConflictException('You can dispute earned, approved or paid commission lines');
      const open = await this.db.select({ id: financeDisputes.id }).from(financeDisputes).where(and(eq(financeDisputes.entryId, e.id), inArray(financeDisputes.status, ['open', 'evidence', 'panel_review']))).limit(1);
      if (open.length) throw new ConflictException('There is already an open dispute on this line');
      prior = e.status;
      await this.svc.move(e, 'disputed', ctx.userId, b.reason);
    } else {
      const [p] = await this.db.select().from(payoutRequests).where(and(eq(payoutRequests.id, b.payoutId!), eq(payoutRequests.beneficiaryOrgId, ctx.orgId!))).limit(1);
      if (!p) throw new NotFoundException('Payout not found');
    }
    const [d] = await this.db.insert(financeDisputes).values({ code: `FD-${year()}-${randomDigits(6)}`, kind: b.kind, entryId: b.entryId, payoutId: b.payoutId, raisedByOrgId: ctx.orgId!, reason: b.reason, expectedAmount: b.expectedAmount, priorStatus: prior, messages: [{ at: new Date().toISOString(), by: ctx.userId, org: ctx.orgId, body: b.reason }], createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'finance.dispute_raised', objectType: 'finance_dispute', objectId: d.id, after: { code: d.code, kind: b.kind } });
    return d;
  }

  @Get('finance/disputes')
  async disputes(@Ctx() ctx: RequestContext) {
    const finance = ctx.caps.has('finance.reconcile') && ctx.platformRoles.length > 0;
    const rows = await this.db.select({ d: financeDisputes, org: organizations.displayName, entry: commissionEntries.description, payout: payoutRequests.code }).from(financeDisputes).innerJoin(organizations, eq(organizations.id, financeDisputes.raisedByOrgId))
      .leftJoin(commissionEntries, eq(commissionEntries.id, financeDisputes.entryId)).leftJoin(payoutRequests, eq(payoutRequests.id, financeDisputes.payoutId))
      .where(finance ? undefined : inArray(financeDisputes.raisedByOrgId, ctx.memberships.map((m) => m.organizationId))).orderBy(desc(financeDisputes.updatedAt));
    return { canRule: finance, disputes: rows.map((r) => ({ ...r.d, org: r.org, entry: r.entry, payout: r.payout })) };
  }

  private async disputeFor(ctx: RequestContext, id: string) {
    const [d] = await this.db.select().from(financeDisputes).where(eq(financeDisputes.id, id)).limit(1);
    const finance = ctx.caps.has('finance.reconcile') && ctx.platformRoles.length > 0;
    if (!d || !(finance || ctx.memberships.some((m) => m.organizationId === d.raisedByOrgId))) throw new NotFoundException('Dispute not found');
    return { d, finance };
  }

  @Post('finance/disputes/:id/messages')
  @HttpCode(201)
  async disputeMessage(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(DisputeMessageSchema)) b: { body: string }) {
    const { d, finance } = await this.disputeFor(ctx, id);
    if (['resolved', 'closed'].includes(d.status)) throw new ConflictException('This dispute is closed');
    const [u] = await this.db.update(financeDisputes).set({ messages: [...(d.messages as unknown[]), { at: new Date().toISOString(), by: ctx.userId, org: finance ? 'COLLABIZ Finance' : ctx.orgId, body: b.body }], status: finance && d.status === 'open' ? 'evidence' : d.status, updatedAt: new Date() }).where(eq(financeDisputes.id, id)).returning();
    return u;
  }

  /** Finance rules on the dispute. An adjustment re-sets the payable through the journal; the line returns to where it was. */
  @Post('finance/disputes/:id/rule')
  @Idempotent()
  @HttpCode(200)
  async rule(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(FinanceDisputeRulingSchema)) b: z.infer<typeof FinanceDisputeRulingSchema>) {
    assertFinance(ctx, 'finance.reconcile');
    const { d } = await this.disputeFor(ctx, id);
    if (['resolved', 'closed'].includes(d.status)) throw new ConflictException('This dispute is already resolved');
    return this.db.transaction(async (tx) => {
      if (d.kind === 'commission' && d.entryId) {
        const [e] = await tx.select().from(commissionEntries).where(eq(commissionEntries.id, d.entryId)).limit(1);
        if (e.status === 'disputed') {
          if (b.outcome === 'adjusted') {
            if (e.settledAt || d.priorStatus === 'settled') throw new ConflictException('A paid line cannot be re-priced; record a separate adjustment payout');
            // Re-price proportionally so taxable, GST and TDS stay consistent with the adjusted payable.
            const f = e.payable ? b.adjustedAmount! / e.payable : 0;
            const taxable = Math.round(e.taxable * f); const gst = Math.round(e.gst * f);
            await tx.update(commissionEntries).set({ payable: b.adjustedAmount!, taxable, gst, tds: taxable + gst - b.adjustedAmount!, updatedAt: new Date() }).where(eq(commissionEntries.id, e.id));
            await this.svc.journal(e.id, 'entry.adjusted', 'disputed', 'disputed', b.adjustedAmount!, `Dispute ${d.code}: ${b.resolution}`, ctx.userId, tx as unknown as Db);
          }
          const fresh = (await tx.select().from(commissionEntries).where(eq(commissionEntries.id, e.id)))[0];
          const back = (d.priorStatus ?? 'earned') as CommissionState;
          await this.svc.move(fresh, back === 'approved' && b.outcome === 'adjusted' ? 'earned' : back, ctx.userId, `Dispute ${d.code} ${b.outcome}`, back === 'approved' && b.outcome === 'adjusted' ? { approvedAt: null } : {}, tx as unknown as Db);
          if (back === 'approved' && b.outcome === 'adjusted') await tx.delete(commissionApprovals).where(eq(commissionApprovals.entryId, e.id)); // re-approval required after a re-price
        }
      }
      const [u] = await tx.update(financeDisputes).set({ status: 'resolved', outcome: b.outcome, resolution: b.resolution, adjustedAmount: b.adjustedAmount, resolvedBy: ctx.userId, updatedAt: new Date() }).where(eq(financeDisputes.id, id)).returning();
      await this.audit.record(ctx, { action: 'finance.dispute_resolved', objectType: 'finance_dispute', objectId: id, reason: b.resolution, after: { outcome: b.outcome, adjustedAmount: b.adjustedAmount } }, tx as unknown as Db);
      return u;
    }).then(async (u) => { await this.svc.notifyOrg(d.raisedByOrgId, `Dispute ${d.code}: ${b.outcome}`, b.resolution, '/commissions/disputes'); return u; });
  }

  // ---------- 102/103 finance introductions (feature-flagged, B-09) ----------
  @Get('finance/opportunities')
  financeOpportunities() {
    if (!config().FEATURE_FINANCE_INTRODUCTIONS) throw new ForbiddenException({ message: 'Finance introductions are not available yet. They open after regulatory review (B-09).', featureDisabled: true });
    return [
      { id: 'msme-solar', title: 'MSME rooftop solar term loan (illustrative)', provider: 'Partner bank — to be onboarded', note: 'Introductions only; COLLABIZ does not lend or advise.' },
      { id: 'bg-facility', title: 'Bank guarantee for tender EMD (illustrative)', provider: 'Partner bank — to be onboarded', note: 'Introductions only.' },
    ];
  }

  @Post('finance/enquiries')
  @RequireOrg()
  @HttpCode(201)
  async financeEnquiry(@Ctx() ctx: RequestContext, @Body(body(FinanceEnquirySchema)) b: z.infer<typeof FinanceEnquirySchema>) {
    if (!config().FEATURE_FINANCE_INTRODUCTIONS) throw new ForbiddenException({ message: 'Finance introductions are not available yet. They open after regulatory review (B-09).', featureDisabled: true });
    const [e] = await this.db.insert(financeEnquiries).values({ organizationId: ctx.orgId!, projectId: b.projectId, purpose: b.purpose, amount: b.amount, tenorMonths: b.tenorMonths, consentToShare: 'granted', createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'finance.enquiry_submitted', objectType: 'finance_enquiry', objectId: e.id });
    return e;
  }
}

@Module({ controllers: [CommissionsController], providers: [CommissionsService], exports: [CommissionsService] })
export class CommissionsModule {}
