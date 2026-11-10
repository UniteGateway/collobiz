/**
 * V2 Phase 2 (tested in test/v2-phase2.e2e.ts)
 *  06 Payment assurance — receipts make partial payments; the full amount triggers the existing "paid" flow (which earns
 *     commission). Each milestone shows one of eight states; due dates, overdue reminders, reconciliation. No escrow or
 *     fund custody: COLLABIZ records money that moves between the parties' own bank accounts.
 *  10 Resolution centre — one queue across lead, commission, XCHANGE and contract-responsibility disputes; reviewer
 *     assignment (never a party's own member); timeline and evidence digest; decisions with reasons; one appeal within 14 days.
 *  05 Consortium builder — contribution ledger (pledged vs delivered, confirmed by the lead) and MoU / JV / amendment
 *     drafts that bind nothing until every active member approves the same text (signing stays a legal step).
 *  07 Opportunity radar — open opportunities, work packages, verified partners and idle capacity for a state, by city.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  APPEAL_DAYS, CAPACITY_CATEGORIES, ContractDisputeSchema, ContributionDeliverySchema, ContributionSchema, PAYMENT_TERMS_DAYS, ReceiptSchema, ResolutionDecisionSchema, TeamAgreementSchema,
  contributionLedger, evidenceDigest, overdueDays, paymentState, sectorName,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  auditEvents, collaborationTeams, commissionEntries, disputeEntries, disputes, financeDisputes, memberships, milestones, notifications, opportunities, organizations, partnerProfiles, paymentReceipts,
  projectInvoices, projectMembers, projects, resolutionAssignments, resolutionCases, resolutionEvents, teamAgreementApprovals, teamAgreements, teamContributions, teamMembers, teamProposals, users,
  workPackages, xchangeDeals, xchangeLegs, xchangeListings,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomDigits, sha256 } from '../../common/crypto';
import { CommissionsService } from '../commissions/commissions.controller';

const platform = (ctx: RequestContext) => ctx.platformRoles.length > 0 && !ctx.mfaRequiredButMissing;
const money = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'finance') && !ctx.mfaRequiredButMissing;
const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin') && !ctx.mfaRequiredButMissing;
const manager = (ctx: RequestContext, orgId: string) => ctx.memberships.some((m) => m.organizationId === orgId && (m.role === 'org_owner' || m.role === 'org_admin'));
const dueOf = (inv: { dueDate: string | null; issuedAt: Date | null }) => inv.dueDate ?? (inv.issuedAt ? new Date(inv.issuedAt.getTime() + PAYMENT_TERMS_DAYS * 86400000).toISOString().slice(0, 10) : null);

@Injectable()
export class Phase2Service {
  constructor(@InjectDb() private db: Db) {}
  async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const ms = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'announcement', title, body: text, link })));
  }
  async notifyStaff(title: string, text: string, link: string) {
    const a = await this.db.selectDistinct({ u: memberships.userId }).from(memberships).where(and(inArray(memberships.role, ['unite_admin', 'super_admin']), eq(memberships.status, 'active')));
    if (a.length) await this.db.insert(notifications).values(a.map((x) => ({ userId: x.u, kind: 'announcement', title, body: text, link })));
  }
  async names(ids: string[]) {
    const rows = ids.length ? await this.db.select({ id: organizations.id, n: organizations.displayName }).from(organizations).where(inArray(organizations.id, [...new Set(ids)])) : [];
    return (id: string | null | undefined) => rows.find((r) => r.id === id)?.n ?? '—';
  }
  /** Role of the caller's company on a project. */
  async projectRole(ctx: RequestContext, id: string) {
    const [p] = await this.db.select().from(projects).where(eq(projects.id, id));
    if (!p) throw new NotFoundException('Project not found');
    const mine = (o: string) => ctx.memberships.some((m) => m.organizationId === o);
    if (mine(p.ownerOrgId)) return { p, role: 'owner' as const };
    if (mine(p.leadOrgId)) return { p, role: 'lead' as const };
    const [m] = ctx.orgId ? await this.db.select().from(projectMembers).where(and(eq(projectMembers.projectId, id), eq(projectMembers.organizationId, ctx.orgId), eq(projectMembers.status, 'active'))) : [];
    if (m) return { p, role: 'member' as const };
    if (platform(ctx)) return { p, role: 'staff' as const };
    throw new NotFoundException('Project not found');
  }
  /** Overdue reminders, at most once a week per invoice. */
  async remindOverdue() {
    const open = await this.db.select().from(projectInvoices).where(ne(projectInvoices.status, 'paid'));
    let sent = 0;
    for (const inv of open) {
      const received = Number((await this.db.select({ s: sql<number>`coalesce(sum(${paymentReceipts.amount}), 0)` }).from(paymentReceipts).where(eq(paymentReceipts.invoiceId, inv.id)))[0].s);
      const days = overdueDays(dueOf(inv), inv.amount - received);
      if (!days || (inv.overdueNotifiedAt && Date.now() - inv.overdueNotifiedAt.getTime() < 7 * 86400000)) continue;
      const [p] = await this.db.select().from(projects).where(eq(projects.id, inv.projectId));
      for (const o of [p.ownerOrgId, inv.issuedByOrgId]) await this.notifyOrg(o, `Invoice ${inv.number} is ${days} days overdue`, `₹${Math.round((inv.amount - received) / 100).toLocaleString('en-IN')} outstanding on ${p.code}.`, `/projects/${p.id}/payments`);
      await this.db.update(projectInvoices).set({ overdueNotifiedAt: new Date() }).where(eq(projectInvoices.id, inv.id));
      sent++;
    }
    return sent;
  }
}

@ApiTags('v2 phase 2')
@Controller()
export class Phase2Controller {
  constructor(@InjectDb() private db: Db, private svc: Phase2Service, private audit: AuditService, private commissions: CommissionsService) {}

  // ================= 06 Payment assurance =================
  @Get('projects/:id/payments')
  async payments(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { p, role } = await this.svc.projectRole(ctx, id);
    let ms = await this.db.select().from(milestones).where(eq(milestones.projectId, id)).orderBy(asc(milestones.seq));
    if (role === 'member') ms = ms.filter((m) => m.assignedOrgId === ctx.orgId);
    const invs = ms.length ? await this.db.select().from(projectInvoices).where(inArray(projectInvoices.milestoneId, ms.map((m) => m.id))) : [];
    const recs = invs.length ? await this.db.select().from(paymentReceipts).where(inArray(paymentReceipts.invoiceId, invs.map((i) => i.id))).orderBy(asc(paymentReceipts.receivedAt)) : [];
    const disputedMs = ms.length ? (await this.db.select({ m: commissionEntries.milestoneId }).from(financeDisputes).innerJoin(commissionEntries, eq(commissionEntries.id, financeDisputes.entryId)).where(and(inArray(commissionEntries.milestoneId, ms.map((m) => m.id)), notInArray(financeDisputes.status, ['resolved', 'closed', 'withdrawn'])))).map((r) => r.m) : [];
    const rows = ms.map((m) => {
      const inv = invs.find((i) => i.milestoneId === m.id) ?? null;
      const rs = inv ? recs.filter((r) => r.invoiceId === inv.id) : [];
      const received = rs.reduce((a, r) => a + r.amount, 0);
      const due = inv ? dueOf(inv) : null;
      return {
        id: m.id, seq: m.seq, title: m.title, amount: m.amount, milestoneStatus: m.status, dueDate: m.dueDate,
        state: paymentState({ status: m.status, contracted: !!p.contractId }, inv ? { amount: inv.amount, received: inv.status === 'paid' && !rs.length ? inv.amount : received, status: inv.status } : null, disputedMs.includes(m.id)),
        invoice: inv ? { id: inv.id, number: inv.number, amount: inv.amount, issuedAt: inv.issuedAt, dueDate: due, status: inv.status, received: inv.status === 'paid' && !rs.length ? inv.amount : received, outstanding: inv.status === 'paid' ? 0 : inv.amount - received, overdueDays: inv.status === 'paid' ? 0 : overdueDays(due, inv.amount - received), receipts: rs.map((r) => ({ amount: r.amount, reference: r.reference, receivedAt: r.receivedAt })) } : null,
      };
    });
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
    const memberOrgs = (await this.db.select({ o: projectMembers.organizationId }).from(projectMembers).where(and(eq(projectMembers.projectId, id), eq(projectMembers.status, 'active')))).map((x) => x.o);
    const pname = await this.svc.names([p.ownerOrgId, p.leadOrgId, ...memberOrgs]);
    const parties = [...new Set([p.ownerOrgId, p.leadOrgId, ...memberOrgs])].filter((o) => !ctx.memberships.some((m) => m.organizationId === o)).map((o) => ({ id: o, name: pname(o) }));
    return {
      parties,
      project: { id: p.id, code: p.code, title: p.title, value: p.value, contracted: !!p.contractId }, role, canRecord: role === 'owner' || money(ctx),
      totals: {
        projected: sum((r) => r.amount), contracted: p.contractId ? sum((r) => r.amount) : 0, approved: sum((r) => (['approved', 'invoiced', 'partially_paid', 'paid'].includes(r.state) ? r.amount : 0)),
        invoiced: sum((r) => r.invoice?.amount ?? 0), received: sum((r) => r.invoice?.received ?? 0), outstanding: sum((r) => r.invoice?.outstanding ?? 0), overdue: sum((r) => (r.invoice?.overdueDays ? r.invoice.outstanding : 0)),
      },
      milestones: rows,
      note: 'COLLABIZ records payments made between the parties’ own bank accounts. It does not hold funds and nothing here is escrow.',
    };
  }

  @Post('projects/:id/invoices/:iid/receipts')
  @HttpCode(201)
  async receipt(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('iid', ParseUUIDPipe) iid: string, @Body(body(ReceiptSchema)) b: z.infer<typeof ReceiptSchema>) {
    const { role } = await this.svc.projectRole(ctx, id);
    if (!(role === 'owner' || money(ctx))) throw new ForbiddenException('The paying client or Unite finance records payments');
    const [inv] = await this.db.select().from(projectInvoices).where(and(eq(projectInvoices.id, iid), eq(projectInvoices.projectId, id)));
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === 'paid') throw new ConflictException('This invoice is already fully paid');
    const received = Number((await this.db.select({ s: sql<number>`coalesce(sum(${paymentReceipts.amount}), 0)` }).from(paymentReceipts).where(eq(paymentReceipts.invoiceId, iid)))[0].s);
    if (received + b.amount > inv.amount) throw new BadRequestException({ statusCode: 400, message: `That is more than the ₹${Math.round((inv.amount - received) / 100).toLocaleString('en-IN')} still due`, issues: [{ path: 'amount', message: 'More than the amount due' }] });
    const [r] = await this.db.insert(paymentReceipts).values({ invoiceId: iid, amount: b.amount, reference: b.reference, receivedAt: b.receivedAt ?? new Date().toISOString().slice(0, 10), note: b.note, recordedBy: ctx.userId }).onConflictDoNothing().returning();
    if (!r) throw new ConflictException('This reference is already recorded on this invoice');
    let paid = false;
    if (received + b.amount === inv.amount) {
      const [u] = await this.db.update(projectInvoices).set({ status: 'paid', paidAt: new Date(), paymentReference: b.reference }).where(and(eq(projectInvoices.id, iid), ne(projectInvoices.status, 'paid'))).returning();
      if (u) { await this.commissions.onInvoicePaid(u); paid = true; } // full payment: the existing rule that earns commission
    }
    await this.audit.record(ctx, { action: paid ? 'project.invoice_paid' : 'project.invoice_part_paid', objectType: 'project_invoice', objectId: iid, after: { amount: b.amount, reference: b.reference, total: received + b.amount, of: inv.amount } });
    await this.svc.notifyOrg(inv.issuedByOrgId, paid ? `Invoice ${inv.number} paid in full` : `Part payment on ${inv.number}`, `₹${Math.round(b.amount / 100).toLocaleString('en-IN')} received (ref ${b.reference}).`, `/projects/${id}/payments`);
    return { received: received + b.amount, outstanding: inv.amount - received - b.amount, paid };
  }

  @Get('finance/reconciliation')
  async reconciliation(@Ctx() ctx: RequestContext) {
    if (!money(ctx) && !staff(ctx)) throw new ForbiddenException('For finance and Unite admins');
    const reminded = await this.svc.remindOverdue();
    const invs = await this.db.select({ i: projectInvoices, p: projects }).from(projectInvoices).innerJoin(projects, eq(projects.id, projectInvoices.projectId)).orderBy(desc(projectInvoices.issuedAt)).limit(500);
    const recs = invs.length ? await this.db.select({ id: paymentReceipts.invoiceId, s: sql<number>`sum(${paymentReceipts.amount})` }).from(paymentReceipts).where(inArray(paymentReceipts.invoiceId, invs.map((x) => x.i.id))).groupBy(paymentReceipts.invoiceId) : [];
    const name = await this.svc.names(invs.flatMap((x) => [x.i.issuedByOrgId, x.p.ownerOrgId]));
    const rows = invs.map(({ i, p }) => {
      const got = i.status === 'paid' ? i.amount : Number(recs.find((r) => r.id === i.id)?.s ?? 0);
      const due = dueOf(i);
      return { id: i.id, number: i.number, project: p.code, projectId: p.id, issuer: name(i.issuedByOrgId), payer: name(p.ownerOrgId), amount: i.amount, received: got, outstanding: i.amount - got, dueDate: due, overdueDays: overdueDays(due, i.amount - got), status: i.status === 'paid' ? 'paid' : got > 0 ? 'partially_paid' : 'invoiced' };
    });
    const t = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
    return { totals: { invoiced: t((r) => r.amount), received: t((r) => r.received), outstanding: t((r) => r.outstanding), overdue: t((r) => (r.overdueDays ? r.outstanding : 0)), overdueCount: rows.filter((r) => r.overdueDays).length }, invoices: rows, remindersSent: reminded };
  }

  // ================= 10 Resolution centre =================
  @Post('projects/:id/disputes')
  @HttpCode(201)
  async raise(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ContractDisputeSchema)) b: z.infer<typeof ContractDisputeSchema>) {
    const { p, role } = await this.svc.projectRole(ctx, id);
    if (role === 'staff' || !ctx.orgId || !manager(ctx, ctx.orgId)) throw new ForbiddenException('A party’s owner or admin raises a dispute');
    const members = (await this.db.select({ o: projectMembers.organizationId }).from(projectMembers).where(and(eq(projectMembers.projectId, id), eq(projectMembers.status, 'active')))).map((x) => x.o);
    const parties = new Set([p.ownerOrgId, p.leadOrgId, ...members]);
    if (!parties.has(b.againstOrgId) || b.againstOrgId === ctx.orgId) throw new BadRequestException('Choose another party to this project');
    const [c] = await this.db.insert(resolutionCases).values({ code: `RC-${new Date().getFullYear()}-${randomDigits(5)}`, projectId: id, raisedByOrgId: ctx.orgId, againstOrgId: b.againstOrgId, subject: b.subject, statement: b.statement, amount: b.amount ?? null, createdBy: ctx.userId }).returning();
    await this.db.insert(resolutionEvents).values({ caseId: c.id, orgId: ctx.orgId, userId: ctx.userId, kind: 'statement', body: b.statement });
    await this.svc.notifyOrg(b.againstOrgId, `Dispute raised on ${p.code}: ${b.subject}`, 'Give your response in the resolution centre.', `/resolution/${c.id}`);
    await this.svc.notifyStaff(`New contract dispute ${c.code}`, b.subject, '/resolution');
    await this.audit.record(ctx, { action: 'resolution.raised', objectType: 'resolution_case', objectId: c.id, after: { project: p.code, against: b.againstOrgId } });
    return c;
  }

  private async caseFor(ctx: RequestContext, id: string) {
    const [c] = await this.db.select().from(resolutionCases).where(eq(resolutionCases.id, id));
    if (!c) throw new NotFoundException('Case not found');
    const party = ctx.memberships.some((m) => [c.raisedByOrgId, c.againstOrgId].includes(m.organizationId));
    if (!party && !platform(ctx)) throw new NotFoundException('Case not found');
    return { c, party };
  }

  @Get('resolution/mine')
  async mine(@Ctx() ctx: RequestContext) {
    if (!ctx.orgId) return [];
    const org = ctx.orgId;
    const contract = await this.db.select().from(resolutionCases).where(or(eq(resolutionCases.raisedByOrgId, org), eq(resolutionCases.againstOrgId, org))).orderBy(desc(resolutionCases.createdAt));
    const lead = await this.db.select().from(disputes).where(or(eq(disputes.claimantOrgId, org), eq(disputes.respondentOrgId, org))).orderBy(desc(disputes.createdAt));
    const fin = await this.db.select().from(financeDisputes).where(eq(financeDisputes.raisedByOrgId, org)).orderBy(desc(financeDisputes.createdAt));
    const xd = await this.db.selectDistinct({ d: xchangeDeals }).from(xchangeDeals).innerJoin(xchangeLegs, eq(xchangeLegs.dealId, xchangeDeals.id)).where(and(eq(xchangeLegs.status, 'disputed'), or(eq(xchangeLegs.fromOrgId, org), eq(xchangeLegs.toOrgId, org))));
    return [
      ...contract.map((c) => ({ kind: 'contract', id: c.id, code: c.code, subject: c.subject, status: c.status, openedAt: c.createdAt, link: `/resolution/${c.id}` })),
      ...lead.map((d) => ({ kind: 'lead', id: d.id, code: d.code, subject: 'Lead ownership', status: d.status, openedAt: d.createdAt, link: `/lead-disputes/${d.id}` })),
      ...fin.map((d) => ({ kind: 'commission', id: d.id, code: d.code, subject: d.reason.slice(0, 80), status: d.status, openedAt: d.createdAt, link: '/commissions/disputes' })),
      ...xd.map(({ d }) => ({ kind: 'xchange', id: d.id, code: d.code, subject: 'XCHANGE delivery', status: d.status, openedAt: d.createdAt, link: `/xchange/deals/${d.id}` })),
    ];
  }

  @Get('resolution/:id')
  async one(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { c, party } = await this.caseFor(ctx, id);
    const ev = await this.db.select({ e: resolutionEvents, who: users.fullName }).from(resolutionEvents).innerJoin(users, eq(users.id, resolutionEvents.userId)).where(eq(resolutionEvents.caseId, id)).orderBy(asc(resolutionEvents.createdAt));
    const name = await this.svc.names([c.raisedByOrgId, c.againstOrgId, ...ev.map((x) => x.e.orgId ?? '')]);
    const [p] = c.projectId ? await this.db.select({ code: projects.code, title: projects.title }).from(projects).where(eq(projects.id, c.projectId)) : [];
    const appealOpen = c.status === 'decided' && !!c.decidedAt && Date.now() - c.decidedAt.getTime() < APPEAL_DAYS * 86400000;
    return {
      ...c, raisedBy: name(c.raisedByOrgId), against: name(c.againstOrgId), project: p ?? null, mine: party,
      events: ev.map(({ e, who }) => ({ kind: e.kind, body: e.body, at: e.createdAt, org: e.orgId ? name(e.orgId) : 'Unite reviewer', who })),
      canRespond: party && c.status === 'open', canAppeal: party && appealOpen, appealDeadline: c.decidedAt ? new Date(c.decidedAt.getTime() + APPEAL_DAYS * 86400000) : null,
    };
  }

  @Post('resolution/:id/respond')
  @HttpCode(201)
  async respond(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ body: z.string().trim().min(10).max(5000), kind: z.enum(['response', 'evidence']).default('response') }))) b: { body: string; kind: string }) {
    const { c, party } = await this.caseFor(ctx, id);
    if (!party || c.status !== 'open') throw new ConflictException('Responses are taken while the case is open');
    const org = [c.raisedByOrgId, c.againstOrgId].find((o) => ctx.memberships.some((m) => m.organizationId === o))!;
    await this.db.insert(resolutionEvents).values({ caseId: id, orgId: org, userId: ctx.userId, kind: b.kind, body: b.body });
    await this.svc.notifyOrg(org === c.raisedByOrgId ? c.againstOrgId : c.raisedByOrgId, `New ${b.kind} on ${c.code}`, c.subject, `/resolution/${id}`);
    return { ok: true };
  }

  @Post('resolution/:id/appeal')
  @HttpCode(200)
  async appeal(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ note: z.string().trim().min(20, { message: 'Explain why (at least 20 characters)' }).max(5000) }))) b: { note: string }) {
    const { c, party } = await this.caseFor(ctx, id);
    if (!party || !ctx.orgId || !manager(ctx, ctx.orgId)) throw new ForbiddenException('A party’s owner or admin appeals');
    if (c.status !== 'decided' || !c.decidedAt || Date.now() - c.decidedAt.getTime() > APPEAL_DAYS * 86400000) throw new ConflictException(`An appeal is possible once, within ${APPEAL_DAYS} days of the decision`);
    await this.db.update(resolutionCases).set({ status: 'appealed', appealNote: b.note, updatedAt: new Date() }).where(eq(resolutionCases.id, id));
    await this.db.insert(resolutionEvents).values({ caseId: id, orgId: ctx.orgId, userId: ctx.userId, kind: 'appeal', body: b.note });
    await this.svc.notifyStaff(`Appeal on ${c.code}`, c.subject, '/resolution');
    return { status: 'appealed' };
  }

  @Get('admin/resolution')
  async queue(@Ctx() ctx: RequestContext) {
    if (!platform(ctx)) throw new ForbiddenException('For Unite reviewers');
    const contract = await this.db.select().from(resolutionCases).orderBy(desc(resolutionCases.createdAt)).limit(200);
    const lead = await this.db.select().from(disputes).orderBy(desc(disputes.createdAt)).limit(200);
    const fin = await this.db.select().from(financeDisputes).orderBy(desc(financeDisputes.createdAt)).limit(200);
    const xd = await this.db.select().from(xchangeDeals).where(eq(xchangeDeals.status, 'disputed')).limit(200);
    const xl = xd.length ? await this.db.select().from(xchangeLegs).where(and(inArray(xchangeLegs.dealId, xd.map((d) => d.id)), eq(xchangeLegs.status, 'disputed'))) : [];
    const asg = await this.db.select({ a: resolutionAssignments, who: users.fullName }).from(resolutionAssignments).innerJoin(users, eq(users.id, resolutionAssignments.reviewerUserId));
    const name = await this.svc.names([...contract.flatMap((c) => [c.raisedByOrgId, c.againstOrgId]), ...lead.flatMap((d) => [d.claimantOrgId, d.respondentOrgId]), ...fin.map((d) => d.raisedByOrgId), ...xl.flatMap((l) => [l.fromOrgId, l.toOrgId])]);
    const reviewer = (kind: string, id: string) => asg.find((x) => x.a.kind === kind && x.a.sourceId === id)?.who ?? null;
    const age = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86400000);
    const open = (s: string) => !['decided', 'closed', 'resolved', 'withdrawn', 'ruled', 'dismissed'].includes(s);
    const rows = [
      ...contract.map((c) => ({ kind: 'contract', id: c.id, code: c.code, subject: c.subject, parties: [name(c.raisedByOrgId), name(c.againstOrgId)], status: c.status, open: c.status === 'open' || c.status === 'appealed', ageDays: age(c.createdAt), reviewer: reviewer('contract', c.id), link: `/resolution/${c.id}` })),
      ...lead.map((d) => ({ kind: 'lead', id: d.id, code: d.code, subject: d.statement.slice(0, 90), parties: [name(d.claimantOrgId), name(d.respondentOrgId)], status: d.status, open: open(d.status), ageDays: age(d.createdAt), reviewer: reviewer('lead', d.id), link: '/lead-conflicts' })),
      ...fin.map((d) => ({ kind: 'commission', id: d.id, code: d.code, subject: d.reason.slice(0, 90), parties: [name(d.raisedByOrgId)], status: d.status, open: open(d.status), ageDays: age(d.createdAt), reviewer: reviewer('commission', d.id), link: '/finance' })),
      ...xd.map((d) => ({ kind: 'xchange', id: d.id, code: d.code, subject: xl.filter((l) => l.dealId === d.id).map((l) => l.disputeReason).join('; ').slice(0, 90), parties: [...new Set(xl.filter((l) => l.dealId === d.id).flatMap((l) => [name(l.fromOrgId), name(l.toOrgId)]))], status: d.status, open: true, ageDays: age(d.createdAt), reviewer: reviewer('xchange', d.id), link: '/workspace/xchange' })),
    ].sort((a, b) => Number(b.open) - Number(a.open) || b.ageDays - a.ageDays);
    const reviewers = await this.db.selectDistinct({ id: users.id, name: users.fullName }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(inArray(memberships.role, ['super_admin', 'unite_admin', 'compliance', 'finance']), eq(memberships.status, 'active')));
    return { totals: { open: rows.filter((r) => r.open).length, unassigned: rows.filter((r) => r.open && !r.reviewer).length, over14: rows.filter((r) => r.open && r.ageDays > 14).length }, cases: rows, reviewers, canAssign: staff(ctx) };
  }

  @Post('admin/resolution/assign')
  @HttpCode(200)
  async assign(@Ctx() ctx: RequestContext, @Body(body(z.object({ kind: z.enum(['lead', 'commission', 'xchange', 'contract']), sourceId: z.string().uuid(), reviewerUserId: z.string().uuid() }))) b: { kind: string; sourceId: string; reviewerUserId: string }) {
    if (!staff(ctx)) throw new ForbiddenException('Unite admins assign reviewers');
    const [isReviewer] = await this.db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.userId, b.reviewerUserId), inArray(memberships.role, ['super_admin', 'unite_admin', 'compliance', 'finance']), eq(memberships.status, 'active'))).limit(1);
    if (!isReviewer) throw new BadRequestException('Choose a Unite reviewer');
    await this.db.insert(resolutionAssignments).values({ ...b, assignedBy: ctx.userId }).onConflictDoUpdate({ target: [resolutionAssignments.kind, resolutionAssignments.sourceId], set: { reviewerUserId: b.reviewerUserId, assignedBy: ctx.userId, assignedAt: new Date() } });
    await this.audit.record(ctx, { action: 'resolution.assigned', objectType: `${b.kind}_dispute`, objectId: b.sourceId, after: { reviewer: b.reviewerUserId } });
    return { ok: true };
  }

  @Get('admin/resolution/:kind/:id/timeline')
  async timeline(@Ctx() ctx: RequestContext, @Param('kind') kind: string, @Param('id', ParseUUIDPipe) id: string) {
    if (!platform(ctx)) throw new ForbiddenException('For Unite reviewers');
    const ev: { at: Date; who: string; what: string }[] = [];
    if (kind === 'contract') {
      const rows = await this.db.select({ e: resolutionEvents, org: organizations.displayName }).from(resolutionEvents).leftJoin(organizations, eq(organizations.id, resolutionEvents.orgId)).where(eq(resolutionEvents.caseId, id));
      ev.push(...rows.map(({ e, org }) => ({ at: e.createdAt, who: org ?? 'Unite reviewer', what: `${e.kind}: ${e.body}` })));
    } else if (kind === 'lead') {
      const rows = await this.db.select({ e: disputeEntries, org: organizations.displayName }).from(disputeEntries).leftJoin(organizations, eq(organizations.id, disputeEntries.organizationId)).where(eq(disputeEntries.disputeId, id));
      ev.push(...rows.map(({ e, org }) => ({ at: e.createdAt, who: org ?? 'Unite panel', what: `${e.kind}: ${e.body}` })));
    } else if (kind === 'commission') {
      const [d] = await this.db.select().from(financeDisputes).where(eq(financeDisputes.id, id));
      if (d) ev.push({ at: d.createdAt, who: 'Raised', what: d.reason }, ...((d.messages as { at: string; by?: string; text?: string; body?: string }[]) ?? []).map((m) => ({ at: new Date(m.at), who: m.by ?? 'Party', what: m.text ?? m.body ?? '' })));
    } else if (kind === 'xchange') {
      const rows = await this.db.select({ l: xchangeLegs, from: organizations.displayName }).from(xchangeLegs).innerJoin(organizations, eq(organizations.id, xchangeLegs.fromOrgId)).where(eq(xchangeLegs.dealId, id));
      for (const { l, from } of rows) { if (l.deliveredAt) ev.push({ at: l.deliveredAt, who: from, what: `Delivered: ${l.deliveryNote}` }); if (l.disputeReason) ev.push({ at: l.deliveredAt ?? new Date(), who: 'Receiver', what: `Disputed: ${l.disputeReason}` }); }
    } else throw new NotFoundException();
    const audit = await this.db.select({ at: auditEvents.at, action: auditEvents.action }).from(auditEvents).where(eq(auditEvents.objectId, id)).orderBy(asc(auditEvents.seq)).limit(100);
    ev.push(...audit.map((a) => ({ at: a.at, who: 'System record', what: a.action })));
    const sorted = ev.sort((a, b) => a.at.getTime() - b.at.getTime());
    return { events: sorted, digest: evidenceDigest(sorted) };
  }

  @Post('admin/resolution/contract/:id/decide')
  @HttpCode(200)
  async decide(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ResolutionDecisionSchema)) b: z.infer<typeof ResolutionDecisionSchema>) {
    if (!platform(ctx)) throw new ForbiddenException('For Unite reviewers');
    const [c] = await this.db.select().from(resolutionCases).where(eq(resolutionCases.id, id));
    if (!c) throw new NotFoundException('Case not found');
    if (ctx.memberships.some((m) => [c.raisedByOrgId, c.againstOrgId].includes(m.organizationId))) throw new ForbiddenException('A reviewer cannot belong to either party');
    const [a] = await this.db.select().from(resolutionAssignments).where(and(eq(resolutionAssignments.kind, 'contract'), eq(resolutionAssignments.sourceId, id)));
    const superAdmin = ctx.platformRoles.includes('super_admin');
    if (c.status === 'appealed' && !superAdmin) throw new ForbiddenException('Appeals are decided by a super admin');
    if (c.status === 'open' && a?.reviewerUserId !== ctx.userId && !superAdmin) throw new ForbiddenException('Only the assigned reviewer decides');
    if (!['open', 'appealed'].includes(c.status)) throw new ConflictException('This case is already decided');
    const status = c.status === 'appealed' ? 'closed' : 'decided';
    await this.db.update(resolutionCases).set({ status, decision: b.decision, decisionNote: b.note, decidedBy: ctx.userId, decidedAt: new Date(), updatedAt: new Date() }).where(eq(resolutionCases.id, id));
    await this.db.insert(resolutionEvents).values({ caseId: id, userId: ctx.userId, kind: 'decision', body: `${b.decision.replace(/_/g, ' ')}: ${b.note}` });
    for (const o of [c.raisedByOrgId, c.againstOrgId]) await this.svc.notifyOrg(o, `Decision on ${c.code}`, status === 'closed' ? 'Final decision after appeal.' : `You may appeal once within ${APPEAL_DAYS} days.`, `/resolution/${id}`);
    await this.audit.record(ctx, { action: `resolution.${status}`, objectType: 'resolution_case', objectId: id, after: b });
    return { status };
  }

  // ================= 05 Consortium contributions and agreements =================
  private async team(ctx: RequestContext, id: string) {
    const [t] = await this.db.select().from(collaborationTeams).where(eq(collaborationTeams.id, id));
    if (!t) throw new NotFoundException('Team not found');
    const members = await this.db.select().from(teamMembers).where(and(eq(teamMembers.teamId, id), eq(teamMembers.status, 'nda_signed')));
    const mine = members.find((m) => ctx.memberships.some((x) => x.organizationId === m.organizationId));
    if (!mine && !platform(ctx)) throw new NotFoundException('Team not found');
    return { t, members, mine };
  }

  @Get('teams/:id/ledger')
  async ledger(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { t, members, mine } = await this.team(ctx, id);
    const rows = await this.db.select().from(teamContributions).where(eq(teamContributions.teamId, id)).orderBy(asc(teamContributions.createdAt));
    const [prop] = await this.db.select().from(teamProposals).where(and(eq(teamProposals.teamId, id), eq(teamProposals.status, 'approved'))).orderBy(desc(teamProposals.version)).limit(1);
    const shares = Object.fromEntries(((prop?.shares as { organizationId: string; sharePct: number }[]) ?? []).map((s) => [s.organizationId, s.sharePct]));
    const ags = await this.db.select().from(teamAgreements).where(eq(teamAgreements.teamId, id)).orderBy(desc(teamAgreements.version));
    const apps = ags.length ? await this.db.select().from(teamAgreementApprovals).where(inArray(teamAgreementApprovals.agreementId, ags.map((a) => a.id))) : [];
    const name = await this.svc.names(members.map((m) => m.organizationId));
    return {
      team: { id: t.id, name: t.name, kind: t.kind, lead: name(t.leadOrgId), isLead: mine?.organizationId === t.leadOrgId },
      members: members.map((m) => ({ orgId: m.organizationId, name: name(m.organizationId), role: m.role, sharePct: shares[m.organizationId] ?? null })),
      contributions: rows.map((r) => ({ ...r, org: name(r.orgId), mine: r.orgId === mine?.organizationId, confirmed: !!r.confirmedByOrgId })),
      ledger: contributionLedger(rows.map((r) => ({ orgId: r.orgId, pledgedValue: r.pledgedValue, deliveredValue: r.confirmedByOrgId ? r.deliveredValue : 0 })), shares).map((l) => ({ ...l, name: name(l.orgId) })),
      agreements: ags.map((a) => ({ id: a.id, kind: a.kind, version: a.version, title: a.title, decisionRule: a.decisionRule, authority: a.authority, body: a.body, bodyHash: a.bodyHash, status: a.status, createdAt: a.createdAt, approvedAt: a.approvedAt,
        approvals: members.map((m) => ({ orgId: m.organizationId, name: name(m.organizationId), approved: apps.some((x) => x.agreementId === a.id && x.orgId === m.organizationId && x.bodyHash === a.bodyHash) })) })),
      myOrgId: mine?.organizationId ?? null,
      note: 'Agreements here are drafts the members approve; signing a binding MoU, JV or company formation is a separate legal step. Ledger gaps are flagged for the members to resolve.',
    };
  }

  @Post('teams/:id/contributions')
  @HttpCode(201)
  async pledge(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ContributionSchema)) b: z.infer<typeof ContributionSchema>) {
    const { mine } = await this.team(ctx, id);
    if (!mine || !manager(ctx, mine.organizationId)) throw new ForbiddenException('A member’s owner or admin records its contribution');
    const [r] = await this.db.insert(teamContributions).values({ ...b, teamId: id, orgId: mine.organizationId, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'team.contribution_pledged', objectType: 'team', objectId: id, after: b });
    return r;
  }

  @Post('team-contributions/:cid/deliver')
  @HttpCode(200)
  async deliverContribution(@Ctx() ctx: RequestContext, @Param('cid', ParseUUIDPipe) cid: string, @Body(body(ContributionDeliverySchema)) b: z.infer<typeof ContributionDeliverySchema>) {
    const [c] = await this.db.select().from(teamContributions).where(eq(teamContributions.id, cid));
    if (!c || !manager(ctx, c.orgId)) throw new NotFoundException('Contribution not found');
    await this.db.update(teamContributions).set({ deliveredValue: b.deliveredValue, evidence: b.evidence, confirmedByOrgId: null, updatedAt: new Date() }).where(eq(teamContributions.id, cid));
    const [t] = await this.db.select().from(collaborationTeams).where(eq(collaborationTeams.id, c.teamId));
    if (t.leadOrgId !== c.orgId) await this.svc.notifyOrg(t.leadOrgId, 'Contribution to confirm', `${c.description} — ${b.evidence}`, `/teams/${t.id}/ledger`);
    else await this.db.update(teamContributions).set({ confirmedByOrgId: c.orgId }).where(eq(teamContributions.id, cid)); // the lead's own records stand until a member disputes them
    return { ok: true };
  }

  @Post('team-contributions/:cid/confirm')
  @HttpCode(200)
  async confirmContribution(@Ctx() ctx: RequestContext, @Param('cid', ParseUUIDPipe) cid: string) {
    const [c] = await this.db.select().from(teamContributions).where(eq(teamContributions.id, cid));
    if (!c) throw new NotFoundException('Contribution not found');
    const [t] = await this.db.select().from(collaborationTeams).where(eq(collaborationTeams.id, c.teamId));
    if (!manager(ctx, t.leadOrgId) || c.orgId === t.leadOrgId) throw new ForbiddenException('The lead member confirms other members’ deliveries');
    if (c.deliveredValue == null) throw new ConflictException('Nothing delivered yet');
    await this.db.update(teamContributions).set({ confirmedByOrgId: t.leadOrgId, updatedAt: new Date() }).where(eq(teamContributions.id, cid));
    await this.audit.record(ctx, { action: 'team.contribution_confirmed', objectType: 'team', objectId: t.id, after: { contribution: cid, value: c.deliveredValue } });
    return { ok: true };
  }

  @Post('teams/:id/agreements')
  @HttpCode(201)
  async proposeAgreement(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(TeamAgreementSchema)) b: z.infer<typeof TeamAgreementSchema>) {
    const { members, mine } = await this.team(ctx, id);
    if (!mine || !manager(ctx, mine.organizationId)) throw new ForbiddenException('A member’s owner or admin proposes terms');
    const last = (await this.db.select({ v: teamAgreements.version, kind: teamAgreements.kind, status: teamAgreements.status }).from(teamAgreements).where(eq(teamAgreements.teamId, id)).orderBy(desc(teamAgreements.version)).limit(1))[0];
    if (b.kind === 'amendment' && !(await this.db.select({ id: teamAgreements.id }).from(teamAgreements).where(and(eq(teamAgreements.teamId, id), eq(teamAgreements.status, 'approved'))).limit(1)).length) throw new BadRequestException('Amend an approved MoU or JV terms — none approved yet');
    const full = `${b.title}\nDecision rule: ${b.decisionRule}\nAuthority: ${b.authority}\n\n${b.body}`;
    const a = await this.db.transaction(async (tx) => {
      await tx.update(teamAgreements).set({ status: 'superseded' }).where(and(eq(teamAgreements.teamId, id), eq(teamAgreements.status, 'proposed')));
      const [a] = await tx.insert(teamAgreements).values({ ...b, teamId: id, version: (last?.v ?? 0) + 1, bodyHash: sha256(full), createdBy: ctx.userId }).returning();
      await tx.insert(teamAgreementApprovals).values({ agreementId: a.id, orgId: mine.organizationId, bodyHash: a.bodyHash, approvedBy: ctx.userId });
      return a;
    });
    for (const m of members.filter((x) => x.organizationId !== mine.organizationId)) await this.svc.notifyOrg(m.organizationId, `Terms to approve: ${b.title}`, `Version ${a.version}`, `/teams/${id}/ledger`);
    await this.audit.record(ctx, { action: 'team.agreement_proposed', objectType: 'team', objectId: id, after: { kind: b.kind, version: a.version, hash: a.bodyHash } });
    return a;
  }

  @Post('team-agreements/:aid/approve')
  @HttpCode(200)
  async approveAgreement(@Ctx() ctx: RequestContext, @Param('aid', ParseUUIDPipe) aid: string) {
    const [a] = await this.db.select().from(teamAgreements).where(eq(teamAgreements.id, aid));
    if (!a) throw new NotFoundException('Agreement not found');
    const { members, mine } = await this.team(ctx, a.teamId);
    if (!mine || !manager(ctx, mine.organizationId)) throw new ForbiddenException('A member’s owner or admin approves');
    if (a.status !== 'proposed') throw new ConflictException('Only the current proposal can be approved');
    await this.db.insert(teamAgreementApprovals).values({ agreementId: aid, orgId: mine.organizationId, bodyHash: a.bodyHash, approvedBy: ctx.userId }).onConflictDoNothing();
    const ok = await this.db.select().from(teamAgreementApprovals).where(and(eq(teamAgreementApprovals.agreementId, aid), eq(teamAgreementApprovals.bodyHash, a.bodyHash)));
    let status = 'proposed';
    if (members.every((m) => ok.some((x) => x.orgId === m.organizationId))) {
      await this.db.update(teamAgreements).set({ status: 'superseded' }).where(and(eq(teamAgreements.teamId, a.teamId), eq(teamAgreements.status, 'approved'), eq(teamAgreements.kind, a.kind === 'amendment' ? 'amendment' : a.kind), ne(teamAgreements.id, aid)));
      await this.db.update(teamAgreements).set({ status: 'approved', approvedAt: new Date() }).where(eq(teamAgreements.id, aid));
      status = 'approved';
      for (const m of members) await this.svc.notifyOrg(m.organizationId, `All members approved: ${a.title}`, 'Sign the formal document outside COLLABIZ where the law requires it.', `/teams/${a.teamId}/ledger`);
    }
    await this.audit.record(ctx, { action: 'team.agreement_approved', objectType: 'team', objectId: a.teamId, after: { version: a.version, org: mine.organizationId, status } });
    return { status };
  }

  // ================= 07 Opportunity radar =================
  @Get('radar')
  async radar(@Ctx() ctx: RequestContext, @Query('region') region?: string, @Query('sector') sector?: string) {
    let r = region;
    if (!r && ctx.orgId) r = (await this.db.select({ r: partnerProfiles.regions }).from(partnerProfiles).where(eq(partnerProfiles.organizationId, ctx.orgId)))[0]?.r?.[0];
    r = r ?? 'IN-MH';
    const opps = await this.db.select().from(opportunities).where(and(eq(opportunities.listed, true), eq(opportunities.region, r), notInArray(opportunities.status, ['draft', 'awarded', 'lost', 'closed', 'rejected']), sector ? eq(opportunities.sector, sector) : undefined)).orderBy(desc(opportunities.publishedAt)).limit(100);
    const pkgs = await this.db.select({ w: workPackages, p: projects }).from(workPackages).innerJoin(projects, eq(projects.id, workPackages.projectId)).where(and(eq(workPackages.status, 'open'), eq(projects.region, r))).limit(50);
    const partners = await this.db.select({ o: organizations, p: partnerProfiles }).from(organizations).innerJoin(partnerProfiles, eq(partnerProfiles.organizationId, organizations.id))
      .where(and(eq(organizations.verificationStatus, 'verified'), inArray(organizations.type, ['partner_company', 'partner_individual']), sql`${r} = any(${partnerProfiles.regions})`, sector ? sql`${sector} = any(${partnerProfiles.sectors})` : undefined, ctx.orgId ? ne(organizations.id, ctx.orgId) : undefined)).limit(100);
    const capacity = (await this.db.select({ l: xchangeListings, org: organizations.displayName }).from(xchangeListings).innerJoin(organizations, eq(organizations.id, xchangeListings.orgId)).where(and(eq(xchangeListings.status, 'active'), eq(xchangeListings.side, 'offer'), eq(xchangeListings.region, r), isNull(xchangeListings.availableUntil)))).filter((x) => CAPACITY_CATEGORIES.has(x.l.category));
    const clusters = new Map<string, { city: string; opportunities: number; partners: number; sectors: Map<string, number> }>();
    const bump = (city: string | null, s: string[], kind: 'opportunities' | 'partners') => {
      const c = city?.trim() || 'Other'; const x = clusters.get(c) ?? { city: c, opportunities: 0, partners: 0, sectors: new Map() };
      x[kind]++; for (const v of s) x.sectors.set(v, (x.sectors.get(v) ?? 0) + 1); clusters.set(c, x);
    };
    opps.forEach((o) => bump(o.city, [o.sector], 'opportunities'));
    partners.forEach((p) => bump(p.o.city, p.p.sectors.slice(0, 2), 'partners'));
    return {
      region: r, sector: sector ?? null,
      totals: { opportunities: opps.length, packages: pkgs.length, partners: partners.length, capacity: capacity.length },
      clusters: [...clusters.values()].map((c) => ({ city: c.city, opportunities: c.opportunities, partners: c.partners, topSectors: [...c.sectors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => sectorName(s)) })).sort((a, b) => b.opportunities + b.partners - a.opportunities - a.partners).slice(0, 12),
      opportunities: opps.slice(0, 20).map((o) => ({ id: o.id, code: o.code, title: o.title, city: o.city, sector: sectorName(o.sector), value: o.estimatedValue, deadline: o.deadline })),
      packages: pkgs.map(({ w, p }) => ({ id: w.id, title: w.title, project: p.code, budget: w.budget, closesAt: w.closesAt })),
      partners: partners.slice(0, 20).map(({ o, p }) => ({ id: o.id, name: o.displayName, city: o.city, sectors: p.sectors.slice(0, 3).map(sectorName) })),
      capacity: capacity.slice(0, 20).map(({ l, org }) => ({ id: l.id, title: l.title, org, value: l.value })),
      note: 'From listings and verified profiles on COLLABIZ only — no scraped or private contact data.',
    };
  }
}
