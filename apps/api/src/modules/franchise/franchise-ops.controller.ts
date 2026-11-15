/**
 * Franchise operations (tested in test/franchise-ops.e2e.ts):
 *  - Agreement: Unite drafts the franchise agreement for an approved unit from its agreed terms. It is a normal contract
 *    in Contracts (issuer = brand, counterparty = franchisee): second-person review, then both sign. When it is executed
 *    the unit moves to "Agreement signed" and the checklist item is ticked. The template is marked DRAFT until counsel
 *    approves it (legal review pack Q25).
 *  - Orders: the franchisee records customer sales and places stock purchase orders with the brand. Purchase orders are
 *    confirmed and dispatched by the brand and received by the franchisee. Sale orders are franchisee-only.
 *  - Revenue and royalty: closing a month totals delivered/paid sales net of GST, records the monthly report and a
 *    royalty statement (royalty + 18% GST, rate to be confirmed by the CA). The brand invoices and records payment; the
 *    franchisee can dispute. Money in paise.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  FRANCHISE_CHECKLIST, FRANCHISE_FORMAT_LABELS, FranchiseAgreementSchema, FranchiseOrderSchema, ORDER_NEXT, REVENUE_STATUSES, franchiseFlags, orderTotals, royaltyFor, type OrderLine,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { contractVersions, contracts, franchiseOrders, franchiseReports, franchiseRoyaltyStatements, franchiseUnits, memberships, notifications, organizations } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomDigits, sha256 } from '../../common/crypto';
import { FranchiseService } from './franchise.service';

type Unit = typeof franchiseUnits.$inferSelect;
const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const month = (d = new Date()) => d.toISOString().slice(0, 7);
const fyStart = (d = new Date()) => `${d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1}-04`;
const inr = (p: number | null | undefined) => (p == null ? 'as agreed' : `INR ${(p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
const addYears = (iso: string, y: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + y); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

/** Franchise agreement template. Clause structure follows common Indian practice; it is a draft for counsel, not legal advice. */
export function franchiseAgreementText(p: { code: string; brand: string; franchisee: string; format: string; city: string; region: string; territory: string; exclusive: boolean; termYears: number; start: string; end: string; noticeDays: number; fee: number | null; royaltyBps: number | null; monthlyTarget: number | null }) {
  const pct = ((p.royaltyBps ?? 0) / 100).toFixed(2);
  return [
    `FRANCHISE AGREEMENT — ${p.code}`, 'DRAFT TEMPLATE — SUBJECT TO LEGAL REVIEW BEFORE USE (legal review pack Q25)', '',
    `Franchisor: ${p.brand}`, `Franchisee: ${p.franchisee}`, `Outlet: ${FRANCHISE_FORMAT_LABELS[p.format] ?? p.format}, ${p.city} (${p.region})`, '',
    '1. Grant. The Franchisor grants the Franchisee a non-transferable licence to operate one outlet under the Franchisor’s trade marks, trade dress and system, only at the approved site and only during the Term. Where required, the parties will record the Franchisee as a registered user of the licensed marks under the Trade Marks Act, 1999.',
    `2. Territory. ${p.territory}. The territory is ${p.exclusive ? 'EXCLUSIVE: the Franchisor will not appoint another franchisee of the same format inside it during the Term' : 'NON-EXCLUSIVE'}.`,
    `3. Term and renewal. ${p.termYears} year(s) from ${p.start} to ${p.end}. Renewal on terms then current, at the Franchisee’s written request made at least ${p.noticeDays} days before expiry, if the Franchisee is not in breach.`,
    `4. Franchise fee. A one-time fee of ${inr(p.fee)}, exclusive of GST, payable before the outlet opens. Non-refundable except as stated in clause 13.`,
    `5. Royalty. ${pct}% of the outlet’s monthly gross sales excluding GST, returns and cancelled orders, payable by the 10th of the following month against the Franchisor’s invoice. GST applies to the fee and the royalty at the applicable rate; TDS is deducted by the Franchisee as required by the Income-tax Act and certificates are shared.`,
    `6. Reporting and audit. Sales are recorded in COLLABIZ order by order and closed monthly. The Franchisor may inspect books relating to the outlet on reasonable notice. An under-reporting of more than 2% in any month is paid with interest at the agreed rate.`,
    `7. Performance. Indicative monthly sales target: ${inr(p.monthlyTarget)}. Missing the target is not by itself a breach; persistent shortfall is reviewed under clause 12.`,
    '8. Standards and training. The Franchisee follows the operations manual, brand standards and training programmes provided by the Franchisor, and keeps trained staff at the outlet.',
    '9. Supply. Products are bought from the Franchisor or its approved suppliers at the prevailing franchise price list through purchase orders in COLLABIZ. Resale prices are recommended, not imposed.',
    '10. Marketing. The Franchisee uses only approved branding and marketing material. Local marketing is at the Franchisee’s cost unless agreed otherwise.',
    '11. Confidentiality and non-compete. Both parties keep confidential information confidential during and after the Term. During the Term the Franchisee will not operate a competing business in the territory. No post-term restraint is imposed beyond protecting confidential information and the marks (section 27, Indian Contract Act, 1872).',
    `12. Termination. Either party may terminate for material breach not cured within 30 days of notice; the Franchisor may terminate on non-payment for 60 days, insolvency, or misuse of the marks. Either party may end the agreement without cause on ${p.noticeDays} days’ notice after the first year.`,
    '13. Effect of termination. The Franchisee stops using the marks, removes branding within 30 days, returns manuals and settles all dues. The Franchisor may buy back saleable stock at invoice cost.',
    '14. Liability and insurance. Each party indemnifies the other for losses from its own breach or negligence. The Franchisee keeps the outlet, stock and public liability insured.',
    '15. Disputes and law. Laws of India. Disputes go first to the COLLABIZ Resolution Centre, then to arbitration by a sole arbitrator under the Arbitration and Conciliation Act, 1996; seat to be agreed.',
    '16. Relationship. The parties are independent contractors. Nothing here creates employment, agency or partnership.',
  ].join('\n');
}

@ApiTags('franchise')
@Controller()
export class FranchiseOpsController {
  constructor(@InjectDb() private db: Db, private svc: FranchiseService, private audit: AuditService) {}

  private brandSide(ctx: RequestContext, u: Unit) { return staff(ctx) || ctx.memberships.some((m) => m.organizationId === u.brandOrgId); }
  private unitSide(ctx: RequestContext, u: Unit) { return ctx.orgId === u.franchiseeOrgId; }
  private async load(ctx: RequestContext, id: string) {
    const u = await this.svc.unit(id);
    if (!this.unitSide(ctx, u) && !this.brandSide(ctx, u)) throw new NotFoundException('Franchise not found');
    return this.sync(u);
  }
  private async notify(orgId: string, title: string, text: string, link: string) {
    const ms = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'announcement', title, body: text, link })));
  }
  /** When the agreement is executed in Contracts, record it on the unit. */
  private async sync(u: Unit) {
    if (!u.agreementContractId || u.status !== 'approved') return u;
    const [c] = await this.db.select({ status: contracts.status }).from(contracts).where(eq(contracts.id, u.agreementContractId)).limit(1);
    if (c?.status !== 'executed') return u;
    const checklist = { ...(u.checklist as Record<string, string>), agreement: new Date().toISOString() };
    const [n] = await this.db.update(franchiseUnits).set({ status: 'agreement_signed', checklist, updatedAt: new Date() }).where(and(eq(franchiseUnits.id, u.id), eq(franchiseUnits.status, 'approved'))).returning();
    return n ?? u;
  }

  // ------------------------------------------------------------------ agreement
  @Post('admin/franchise/:id/agreement')
  @HttpCode(201)
  async agreement(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(FranchiseAgreementSchema)) b: z.infer<typeof FranchiseAgreementSchema>) {
    if (!staff(ctx)) throw new ForbiddenException('Franchise agreements are drafted by Unite admins');
    const u = await this.svc.unit(id);
    if (u.status !== 'approved') throw new ConflictException('Draft the agreement after approval and before signature');
    if (u.fee == null || u.royaltyBps == null) throw new ConflictException('Set the fee and royalty before drafting the agreement');
    if (u.agreementContractId) {
      const [c] = await this.db.select({ status: contracts.status }).from(contracts).where(eq(contracts.id, u.agreementContractId)).limit(1);
      if (c && !['terminated', 'superseded'].includes(c.status)) throw new ConflictException('An agreement already exists for this franchise. Amend it in Contracts.');
    }
    const [brand] = await this.db.select({ n: organizations.displayName }).from(organizations).where(eq(organizations.id, u.brandOrgId));
    const [fr] = await this.db.select({ n: organizations.displayName }).from(organizations).where(eq(organizations.id, u.franchiseeOrgId));
    const end = addYears(b.startDate, b.termYears);
    const code = `CTR-${new Date().getUTCFullYear()}-${randomDigits(6)}`;
    const text = franchiseAgreementText({ code, brand: brand.n, franchisee: fr.n, format: u.format, city: u.city, region: u.region, territory: b.territory, exclusive: b.exclusive, termYears: b.termYears, start: b.startDate, end, noticeDays: b.noticeDays, fee: u.fee, royaltyBps: u.royaltyBps, monthlyTarget: u.monthlyTarget });
    const c = await this.db.transaction(async (tx) => {
      const [c] = await tx.insert(contracts).values({ code, kind: 'contract', title: `Franchise agreement — ${brand.n}, ${u.city} (${u.code})`, issuerOrgId: u.brandOrgId, counterpartyOrgId: u.franchiseeOrgId, value: u.fee, createdBy: ctx.userId }).returning();
      await tx.insert(contractVersions).values({ contractId: c.id, versionNo: 1, body: text, terms: { value: u.fee ?? undefined, startDate: b.startDate, endDate: end, paymentTerms: `Royalty ${(u.royaltyBps! / 100).toFixed(2)}% of net monthly sales` }, bodyHash: sha256(text), changeNote: `Generated from franchise ${u.code}`, authorUserId: ctx.userId });
      await tx.update(franchiseUnits).set({ territory: b.territory, exclusive: b.exclusive, termYears: b.termYears, noticeDays: b.noticeDays, agreementStarts: b.startDate, agreementEnds: end, agreementContractId: c.id, updatedAt: new Date() }).where(eq(franchiseUnits.id, id));
      await this.audit.record(ctx, { action: 'franchise.agreement_drafted', objectType: 'franchise_unit', objectId: id, after: { contractId: c.id, code, termYears: b.termYears, end } }, tx as unknown as Db);
      return c;
    });
    return { contractId: c.id, code, agreementEnds: end, next: 'Submit the draft for review in Contracts; after approval both parties sign it.' };
  }

  // ------------------------------------------------------------------ orders
  @Post('franchise/:id/orders')
  @RequireOrg()
  @HttpCode(201)
  async createOrder(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(FranchiseOrderSchema)) b: z.infer<typeof FranchiseOrderSchema>) {
    const u = await this.load(ctx, id);
    if (!this.unitSide(ctx, u)) throw new ForbiddenException('Only the franchisee records orders');
    if (b.kind === 'sale' && u.status !== 'live') throw new ConflictException('Customer sales are recorded once the franchise is live');
    if (b.kind === 'purchase' && !['setup', 'live'].includes(u.status)) throw new ConflictException('Stock can be ordered from set-up onwards');
    if (b.orderDate > new Date().toISOString().slice(0, 10)) throw new BadRequestException('The order date cannot be in the future');
    const closed = await this.db.select({ id: franchiseRoyaltyStatements.id }).from(franchiseRoyaltyStatements).where(and(eq(franchiseRoyaltyStatements.unitId, id), eq(franchiseRoyaltyStatements.month, b.orderDate.slice(0, 7)))).limit(1);
    if (b.kind === 'sale' && closed.length) throw new ConflictException(`${b.orderDate.slice(0, 7)} is closed. Record the sale in the current month or ask Unite to reopen.`);
    const t = orderTotals(b.lines as OrderLine[]);
    const status = b.kind === 'sale' ? 'confirmed' : 'placed';
    const [o] = await this.db.insert(franchiseOrders).values({ unitId: id, number: `${b.kind === 'sale' ? 'SO' : 'PO'}-${u.code.slice(3)}-${randomDigits(5)}`, kind: b.kind, customerName: b.customerName, orderDate: b.orderDate, lines: b.lines, ...t, status, history: [{ status, at: new Date().toISOString(), by: ctx.userId }], notes: b.notes, createdBy: ctx.userId }).returning();
    if (b.kind === 'purchase') await this.notify(u.brandOrgId, `Purchase order ${o.number} from ${u.city}`, `${inr(t.total)} including GST. Confirm and dispatch.`, `/workspace/franchise/${id}`);
    await this.audit.record(ctx, { action: `franchise.${b.kind}_order`, objectType: 'franchise_order', objectId: o.id, after: { number: o.number, total: t.total } });
    return o;
  }

  @Post('franchise/:id/orders/:oid/status')
  @HttpCode(200)
  async orderStatus(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('oid', ParseUUIDPipe) oid: string, @Body(body(z.object({ status: z.string(), note: z.string().trim().max(500).optional() }))) b: { status: string; note?: string }) {
    const u = await this.load(ctx, id);
    const [o] = await this.db.select().from(franchiseOrders).where(and(eq(franchiseOrders.id, oid), eq(franchiseOrders.unitId, id))).limit(1);
    if (!o) throw new NotFoundException('Order not found');
    const kind = o.kind as 'sale' | 'purchase';
    const step = (ORDER_NEXT[kind][o.status] ?? []).filter((x) => x.to === b.status);
    if (!step.length) throw new ConflictException(`A ${kind} order that is ${o.status} cannot become ${b.status}`);
    const side = this.unitSide(ctx, u) ? 'unit' : this.brandSide(ctx, u) ? 'brand' : null;
    if (!step.some((x) => x.by === side)) throw new ForbiddenException(step[0].by === 'brand' ? 'Only the brand can do this' : 'Only the franchisee can do this');
    if (kind === 'sale' && b.status === 'cancelled') {
      const closed = await this.db.select({ id: franchiseRoyaltyStatements.id }).from(franchiseRoyaltyStatements).where(and(eq(franchiseRoyaltyStatements.unitId, id), eq(franchiseRoyaltyStatements.month, o.orderDate.slice(0, 7)))).limit(1);
      if (closed.length) throw new ConflictException('This month is closed; cancellations after closing are handled as a credit note with Unite');
    }
    const history = [...(o.history as unknown[]), { status: b.status, at: new Date().toISOString(), by: ctx.userId, note: b.note }];
    const [n] = await this.db.update(franchiseOrders).set({ status: b.status, history, updatedAt: new Date() }).where(and(eq(franchiseOrders.id, oid), eq(franchiseOrders.status, o.status))).returning();
    if (!n) throw new ConflictException('The order changed meanwhile. Reload.');
    if (kind === 'purchase') await this.notify(side === 'brand' ? u.franchiseeOrgId : u.brandOrgId, `Purchase order ${o.number}: ${b.status}`, b.note ?? '', side === 'brand' ? `/franchise/${id}` : `/workspace/franchise/${id}`);
    await this.audit.record(ctx, { action: 'franchise.order_status', objectType: 'franchise_order', objectId: oid, before: { status: o.status }, after: { status: b.status } });
    return n;
  }

  // ------------------------------------------------------------------ revenue and royalty
  /** Closes a month from the order book: net delivered/paid sales → monthly report and royalty statement. */
  @Post('franchise/:id/close-month')
  @RequireOrg()
  @HttpCode(201)
  async closeMonth(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }))) b: { month: string }) {
    const u = await this.load(ctx, id);
    if (!this.unitSide(ctx, u)) throw new ForbiddenException('The franchisee closes its months');
    if (u.status !== 'live' && u.status !== 'suspended') throw new ConflictException('Months are closed once the franchise is live');
    if (b.month >= month()) throw new BadRequestException('Only a finished month can be closed');
    const open = await this.db.select({ n: sql<number>`count(*)::int` }).from(franchiseOrders).where(and(eq(franchiseOrders.unitId, id), eq(franchiseOrders.kind, 'sale'), eq(franchiseOrders.status, 'confirmed'), sql`left(${franchiseOrders.orderDate}, 7) = ${b.month}`));
    if (Number(open[0].n) > 0) throw new ConflictException(`${open[0].n} sale order(s) in ${b.month} are still only confirmed. Mark them delivered or cancelled first.`);
    const [agg] = await this.db.select({ net: sql<number>`coalesce(sum(${franchiseOrders.subtotal}),0)::bigint`, n: sql<number>`count(*)::int` }).from(franchiseOrders)
      .where(and(eq(franchiseOrders.unitId, id), eq(franchiseOrders.kind, 'sale'), inArray(franchiseOrders.status, REVENUE_STATUSES), sql`left(${franchiseOrders.orderDate}, 7) = ${b.month}`));
    const net = Number(agg.net), r = royaltyFor(net, u.royaltyBps ?? 0);
    const st = await this.db.transaction(async (tx) => {
      const [rep] = await tx.insert(franchiseReports).values({ unitId: id, month: b.month, sales: net, orders: Number(agg.n), royalty: r.royalty, notes: 'Closed from the order book', submittedBy: ctx.userId }).onConflictDoNothing().returning();
      if (!rep) throw new ConflictException(`${b.month} is already closed`);
      const [st] = await tx.insert(franchiseRoyaltyStatements).values({ unitId: id, month: b.month, netSales: net, orders: Number(agg.n), royaltyBps: u.royaltyBps ?? 0, ...r, source: 'orders' }).returning();
      return st;
    });
    await this.notify(u.brandOrgId, `${u.code}: ${b.month} closed`, `Net sales ${inr(net)}, royalty ${inr(r.royalty)} + GST.`, `/workspace/franchise/${id}`);
    await this.audit.record(ctx, { action: 'franchise.month_closed', objectType: 'franchise_unit', objectId: id, after: { month: b.month, net, royalty: r.royalty } });
    return st;
  }

  @Post('admin/franchise/statements/:sid/invoice')
  @HttpCode(200)
  async invoice(@Ctx() ctx: RequestContext, @Param('sid', ParseUUIDPipe) sid: string) {
    const [s] = await this.db.select().from(franchiseRoyaltyStatements).where(eq(franchiseRoyaltyStatements.id, sid)).limit(1);
    if (!s) throw new NotFoundException('Statement not found');
    const u = await this.svc.unit(s.unitId);
    if (!this.brandSide(ctx, u)) throw new ForbiddenException('Only the brand invoices royalty');
    if (s.status !== 'due') throw new ConflictException(`This statement is ${s.status}`);
    if (s.total === 0) throw new ConflictException('Nothing to invoice for a month with no sales');
    const due = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
    const [n] = await this.db.update(franchiseRoyaltyStatements).set({ status: 'invoiced', invoiceNumber: `RY-${s.month.replace('-', '')}-${randomDigits(5)}`, dueDate: due, updatedAt: new Date() }).where(and(eq(franchiseRoyaltyStatements.id, sid), eq(franchiseRoyaltyStatements.status, 'due'))).returning();
    await this.notify(u.franchiseeOrgId, `Royalty invoice for ${s.month}`, `${inr(s.total)} including GST, due ${due}.`, `/franchise/${u.id}`);
    await this.audit.record(ctx, { action: 'franchise.royalty_invoiced', objectType: 'franchise_royalty_statement', objectId: sid, after: { invoice: n.invoiceNumber, total: s.total } });
    return n;
  }

  @Post('admin/franchise/statements/:sid/paid')
  @HttpCode(200)
  async paid(@Ctx() ctx: RequestContext, @Param('sid', ParseUUIDPipe) sid: string, @Body(body(z.object({ paymentReference: z.string().trim().min(4).max(80) }))) b: { paymentReference: string }) {
    const [s] = await this.db.select().from(franchiseRoyaltyStatements).where(eq(franchiseRoyaltyStatements.id, sid)).limit(1);
    if (!s) throw new NotFoundException('Statement not found');
    const u = await this.svc.unit(s.unitId);
    if (!this.brandSide(ctx, u)) throw new ForbiddenException('The brand records payments it has received');
    if (s.status !== 'invoiced') throw new ConflictException('Record payment against an invoiced statement');
    const [n] = await this.db.update(franchiseRoyaltyStatements).set({ status: 'paid', paidAt: new Date(), paymentReference: b.paymentReference, updatedAt: new Date() }).where(and(eq(franchiseRoyaltyStatements.id, sid), eq(franchiseRoyaltyStatements.status, 'invoiced'))).returning();
    await this.audit.record(ctx, { action: 'franchise.royalty_paid', objectType: 'franchise_royalty_statement', objectId: sid, after: { reference: b.paymentReference } });
    return n;
  }

  @Post('franchise/statements/:sid/dispute')
  @RequireOrg()
  @HttpCode(200)
  async dispute(@Ctx() ctx: RequestContext, @Param('sid', ParseUUIDPipe) sid: string, @Body(body(z.object({ reason: z.string().trim().min(10).max(1000) }))) b: { reason: string }) {
    const [s] = await this.db.select().from(franchiseRoyaltyStatements).where(eq(franchiseRoyaltyStatements.id, sid)).limit(1);
    if (!s) throw new NotFoundException('Statement not found');
    const u = await this.svc.unit(s.unitId);
    if (!this.unitSide(ctx, u)) throw new NotFoundException('Statement not found');
    if (!['due', 'invoiced'].includes(s.status)) throw new ConflictException(`A ${s.status} statement cannot be disputed`);
    const [n] = await this.db.update(franchiseRoyaltyStatements).set({ status: 'disputed', disputeReason: b.reason, updatedAt: new Date() }).where(eq(franchiseRoyaltyStatements.id, sid)).returning();
    await this.notify(u.brandOrgId, `Royalty for ${s.month} disputed by ${u.city}`, b.reason, `/workspace/franchise/${u.id}`);
    await this.audit.record(ctx, { action: 'franchise.royalty_disputed', objectType: 'franchise_royalty_statement', objectId: sid, reason: b.reason });
    return n;
  }

  // ------------------------------------------------------------------ dashboards
  private async unitDashboard(u: Unit) {
    const [view] = await this.svc.view([u.id]);
    const orders = await this.db.select().from(franchiseOrders).where(eq(franchiseOrders.unitId, u.id)).orderBy(desc(franchiseOrders.orderDate), desc(franchiseOrders.createdAt)).limit(300);
    const statements = await this.db.select().from(franchiseRoyaltyStatements).where(eq(franchiseRoyaltyStatements.unitId, u.id)).orderBy(desc(franchiseRoyaltyStatements.month));
    const now = month(), fy = fyStart();
    const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 11 + i); return d.toISOString().slice(0, 7); });
    const rev = orders.filter((o) => o.kind === 'sale' && REVENUE_STATUSES.includes(o.status));
    const series = months.map((m) => {
      const st = statements.find((s) => s.month === m), rep = view.reports.find((r) => r.month === m);
      const fromOrders = rev.filter((o) => o.orderDate.startsWith(m));
      return { month: m, sales: st?.netSales ?? rep?.sales ?? fromOrders.reduce((a, o) => a + o.subtotal, 0), orders: st?.orders ?? rep?.orders ?? fromOrders.length, target: u.monthlyTarget ?? null, closed: !!(st || rep), royalty: st?.royalty ?? rep?.royalty ?? 0 };
    });
    const mtd = rev.filter((o) => o.orderDate.startsWith(now));
    const ytd = series.filter((s) => s.month >= fy).reduce((a, s) => a + s.sales, 0);
    const last = series[series.length - 2];
    const kpis = {
      salesMtd: mtd.reduce((a, o) => a + o.subtotal, 0), ordersMtd: mtd.length, salesYtd: ytd, avgOrderValue: rev.length ? Math.round(rev.reduce((a, o) => a + o.subtotal, 0) / rev.length) : 0,
      lastMonthSales: last.sales, lastMonthTargetPct: u.monthlyTarget ? last.sales / u.monthlyTarget : null,
      openSaleOrders: orders.filter((o) => o.kind === 'sale' && o.status === 'confirmed').length, receivables: orders.filter((o) => o.kind === 'sale' && o.status === 'delivered').reduce((a, o) => a + o.total, 0),
      openPurchaseOrders: orders.filter((o) => o.kind === 'purchase' && ['placed', 'confirmed', 'dispatched'].includes(o.status)).length, purchasesYtd: orders.filter((o) => o.kind === 'purchase' && o.status !== 'cancelled' && o.orderDate >= `${fy}-01`).reduce((a, o) => a + o.total, 0),
      royaltyOutstanding: statements.filter((s) => ['due', 'invoiced', 'disputed'].includes(s.status)).reduce((a, s) => a + s.total, 0), royaltyPaidYtd: statements.filter((s) => s.status === 'paid' && s.month >= fy).reduce((a, s) => a + s.total, 0),
      royaltyOverdue: statements.filter((s) => s.status === 'invoiced' && s.dueDate && s.dueDate < new Date().toISOString().slice(0, 10)).reduce((a, s) => a + s.total, 0),
    };
    const lastClosed = statements[0]?.month ?? view.reports[0]?.month ?? null;
    const [agreement] = u.agreementContractId ? await this.db.select({ id: contracts.id, code: contracts.code, status: contracts.status }).from(contracts).where(eq(contracts.id, u.agreementContractId)).limit(1) : [];
    return {
      unit: { ...view, territory: u.territory, exclusive: u.exclusive, termYears: u.termYears, agreementStarts: u.agreementStarts, agreementEnds: u.agreementEnds },
      agreement: agreement ?? null, kpis, series, orders, statements, flags: franchiseFlags({ status: u.status, agreementEnds: u.agreementEnds, monthlyTarget: u.monthlyTarget, lastMonthSales: last.sales, lastReportedMonth: lastClosed }),
      checklistDone: view.checklist.filter((c) => c.doneAt).length, checklistTotal: FRANCHISE_CHECKLIST.length,
      notes: ['Sales are net of GST. Royalty statements show GST on royalty at 18% — confirm the rate and SAC code with your CA.', 'Revenue counts delivered and paid orders; confirmed orders are pipeline.'],
    };
  }

  @Get('franchise/:id/dashboard')
  async dashboard(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const u = await this.load(ctx, id);
    return { ...(await this.unitDashboard(u)), side: this.unitSide(ctx, u) ? 'franchisee' : 'brand' };
  }

  /** Franchisor network dashboard. */
  @Get('admin/franchise/dashboard')
  async network(@Ctx() ctx: RequestContext) {
    if (!staff(ctx)) throw new ForbiddenException('Franchise management is for Unite admins');
    const units = await this.db.select().from(franchiseUnits);
    for (const u of units) await this.sync(u);
    const view = await this.svc.view();
    const ids = units.map((u) => u.id);
    const orders = ids.length ? await this.db.select().from(franchiseOrders).where(inArray(franchiseOrders.unitId, ids)) : [];
    const statements = ids.length ? await this.db.select().from(franchiseRoyaltyStatements).where(inArray(franchiseRoyaltyStatements.unitId, ids)) : [];
    const reports = ids.length ? await this.db.select().from(franchiseReports).where(inArray(franchiseReports.unitId, ids)) : [];
    const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 11 + i); return d.toISOString().slice(0, 7); });
    const salesOf = (unitId: string, m: string) => {
      const st = statements.find((s) => s.unitId === unitId && s.month === m); if (st) return st.netSales;
      const r = reports.find((x) => x.unitId === unitId && x.month === m); if (r) return r.sales;
      return orders.filter((o) => o.unitId === unitId && o.kind === 'sale' && REVENUE_STATUSES.includes(o.status) && o.orderDate.startsWith(m)).reduce((a, o) => a + o.subtotal, 0);
    };
    const series = months.map((m) => ({ month: m, sales: ids.reduce((a, id) => a + salesOf(id, m), 0), royaltyBilled: statements.filter((s) => s.month === m).reduce((a, s) => a + s.total, 0) }));
    const lastM = months[10], fy = fyStart(), today = new Date().toISOString().slice(0, 10);
    const byStatus = Object.fromEntries(['applied', 'approved', 'agreement_signed', 'setup', 'live', 'suspended', 'rejected', 'closed'].map((s) => [s, units.filter((u) => u.status === s).length]));
    const rows = view.map((v) => {
      const u = units.find((x) => x.id === v.id)!;
      const last = salesOf(v.id, lastM), ytd = months.filter((m) => m >= fy).reduce((a, m) => a + salesOf(v.id, m), 0);
      const lastClosed = [...statements.filter((s) => s.unitId === v.id).map((s) => s.month), ...reports.filter((r) => r.unitId === v.id).map((r) => r.month)].sort().pop() ?? null;
      return { id: v.id, code: v.code, brand: v.brand, franchisee: v.franchisee, city: v.city, format: v.format, status: v.status, lastMonthSales: last, salesYtd: ytd, target: u.monthlyTarget, targetPct: u.monthlyTarget && ['live', 'suspended'].includes(u.status) ? last / u.monthlyTarget : null,
        royaltyOutstanding: statements.filter((s) => s.unitId === v.id && ['due', 'invoiced', 'disputed'].includes(s.status)).reduce((a, s) => a + s.total, 0),
        openPurchaseOrders: orders.filter((o) => o.unitId === v.id && o.kind === 'purchase' && o.status === 'placed').length, agreementEnds: u.agreementEnds,
        flags: franchiseFlags({ status: u.status, agreementEnds: u.agreementEnds, monthlyTarget: u.monthlyTarget, lastMonthSales: last, lastReportedMonth: lastClosed }) };
    });
    return {
      totals: {
        live: byStatus.live, pipeline: byStatus.applied + byStatus.approved + byStatus.agreement_signed + byStatus.setup, byStatus, cities: new Set(units.filter((u) => u.status === 'live').map((u) => u.city)).size,
        salesLastMonth: series[10].sales, salesYtd: series.filter((s) => s.month >= fy).reduce((a, s) => a + s.sales, 0), ordersMtd: orders.filter((o) => o.kind === 'sale' && o.orderDate.startsWith(month())).length,
        royaltyBilledYtd: statements.filter((s) => s.month >= fy && s.status !== 'due').reduce((a, s) => a + s.total, 0), royaltyCollectedYtd: statements.filter((s) => s.month >= fy && s.status === 'paid').reduce((a, s) => a + s.total, 0),
        royaltyToInvoice: statements.filter((s) => s.status === 'due').reduce((a, s) => a + s.total, 0), royaltyOverdue: statements.filter((s) => s.status === 'invoiced' && (s.dueDate ?? '9') < today).reduce((a, s) => a + s.total, 0),
        disputes: statements.filter((s) => s.status === 'disputed').length, purchaseOrdersToConfirm: orders.filter((o) => o.kind === 'purchase' && o.status === 'placed').length,
        purchaseValueYtd: orders.filter((o) => o.kind === 'purchase' && o.status !== 'cancelled' && o.orderDate >= `${fy}-01`).reduce((a, o) => a + o.total, 0), renewalsDue: rows.filter((r) => r.flags.some((f) => f.key === 'renewal' || f.key === 'expired')).length,
      },
      series, units: rows.sort((a, b) => b.salesYtd - a.salesYtd),
      statementsToAct: statements.filter((s) => s.status === 'due' || s.status === 'disputed' || (s.status === 'invoiced' && (s.dueDate ?? '9') < today)).map((s) => ({ ...s, unit: view.find((v) => v.id === s.unitId)?.code, city: view.find((v) => v.id === s.unitId)?.city })),
      purchaseOrders: orders.filter((o) => o.kind === 'purchase' && ['placed', 'confirmed'].includes(o.status)).map((o) => ({ ...o, unit: view.find((v) => v.id === o.unitId)?.code, city: view.find((v) => v.id === o.unitId)?.city })),
    };
  }
}
