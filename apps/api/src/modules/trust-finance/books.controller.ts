/**
 * Invoices & P&L — the profit report, credit notes and recorded expenses. Every measure is computed from records on
 * COLLABIZ (invoices, confirmed payment receipts, credit notes, micro-contracts, royalty statements, commissions) plus
 * the expenses a business records here. Pipeline and contract value are shown but never counted as revenue.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { CreditNoteSchema, EXPENSE_LABELS, ExpenseSchema, PNL_MEASURES, creditReasonLabel, creditRoom, financialYear, profitReport, type PnlInputs } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { creditNotes, expenses, projectInvoices, projects } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const manager = (ctx: RequestContext) => ctx.memberships.some((m) => m.organizationId === ctx.orgId && ['org_owner', 'org_admin'].includes(m.role));

@ApiTags('books')
@Controller('books')
export class BooksController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}
  private async n(s: SQL) { const r = await this.db.execute(s); const rows = (r as unknown as { rows?: { v: string | number | null }[] }).rows ?? (r as unknown as { v: string | number | null }[]); return Number(rows[0]?.v ?? 0); }

  @Get('pnl')
  @RequireOrg()
  async pnl(@Ctx() ctx: RequestContext, @Query('from') qf?: string, @Query('to') qt?: string) {
    const fy = financialYear(new Date());
    const from = isDate(qf) ? qf! : fy.from; const to = isDate(qt) ? qt! : fy.to;
    if (to < from) throw new BadRequestException('“To” must be on or after “From”');
    const o = sql`${ctx.orgId}::uuid`; const f = sql`${from}::date`; const t = sql`${to}::date`;
    const inP = (col: SQL) => sql`(${col})::date between ${f} and ${t}`;
    const i: PnlInputs = {
      pipeline: await this.n(sql`select coalesce(sum(value), 0) as v from crm_deals where organization_id = ${o} and stage not in ('won', 'lost')`),
      contractValue: await this.n(sql`select coalesce(sum(p.value), 0) as v from projects p join contracts c on c.id = p.contract_id where p.lead_org_id = ${o} and c.executed_at is not null and ${inP(sql`c.executed_at`)}`),
      invoicesIssued: await this.n(sql`select coalesce(sum(amount), 0) as v from project_invoices where issued_by_org_id = ${o} and ${inP(sql`issued_at`)}`),
      creditNotesIssued: await this.n(sql`select coalesce(sum(amount), 0) as v from credit_notes where issued_by_org_id = ${o} and ${inP(sql`issued_at`)}`),
      microEarned: await this.n(sql`select coalesce(sum(price_rs), 0) * 100 as v from micro_contracts where worker_org_id = ${o} and status = 'paid' and ${inP(sql`updated_at`)}`),
      royaltyIncome: await this.n(sql`select coalesce(sum(s.royalty), 0) as v from franchise_royalty_statements s join franchise_units u on u.id = s.unit_id where u.brand_org_id = ${o} and (s.month || '-01')::date between date_trunc('month', ${f}) and ${t}`),
      receiptsIn: await this.n(sql`select coalesce(sum(r.amount), 0) as v from payment_receipts r join project_invoices i on i.id = r.invoice_id where i.issued_by_org_id = ${o} and not r.pending and ${inP(sql`r.received_at`)}`),
      refundsPaid: await this.n(sql`select coalesce(sum(amount), 0) as v from credit_notes where issued_by_org_id = ${o} and refund_paid_at is not null and ${inP(sql`refund_paid_at`)}`),
      supplierInvoices: await this.n(sql`select coalesce(sum(i.amount), 0) as v from project_invoices i join projects p on p.id = i.project_id where p.owner_org_id = ${o} and i.issued_by_org_id <> ${o} and ${inP(sql`i.issued_at`)}`),
      creditNotesReceived: await this.n(sql`select coalesce(sum(amount), 0) as v from credit_notes where to_org_id = ${o} and ${inP(sql`issued_at`)}`),
      microPaid: await this.n(sql`select coalesce(sum(price_rs), 0) * 100 as v from micro_contracts where org_id = ${o} and status = 'paid' and ${inP(sql`updated_at`)}`),
      commissionExpense: await this.n(sql`select coalesce(sum(e.payable), 0) as v from commission_entries e join commission_agreements a on a.id = e.agreement_id where a.payer_org_id = ${o} and e.approved_at is not null and ${inP(sql`e.approved_at`)}`),
      expenses: await this.n(sql`select coalesce(sum(amount), 0) as v from expenses where org_id = ${o} and date between ${f} and ${t}`),
      royaltyPaid: await this.n(sql`select coalesce(sum(s.royalty), 0) as v from franchise_royalty_statements s join franchise_units u on u.id = s.unit_id where u.franchisee_org_id = ${o} and (s.month || '-01')::date between date_trunc('month', ${f}) and ${t}`),
      commissionLiability: await this.n(sql`select coalesce(sum(e.payable), 0) as v from commission_entries e join commission_agreements a on a.id = e.agreement_id where a.payer_org_id = ${o} and e.approved_at is not null and e.settled_at is null`),
    };
    const r = profitReport(i);
    return { from, to, measures: PNL_MEASURES.map((m) => ({ ...m, value: r[m.key] })), inputs: i,
      note: 'Each figure is a different measure. Pipeline and contract value are not revenue; invoiced revenue is not cash. Built only from records on COLLABIZ and the expenses you record here.' };
  }

  /** Invoices I issued, with what is already credited — the starting point for a credit note. */
  @Get('invoices')
  @RequireOrg()
  async invoices(@Ctx() ctx: RequestContext) {
    const rows = await this.db.execute(sql`
      select i.id, i.number, i.amount, i.status, i.issued_at, i.due_date, p.code as project, o.display_name as client,
        coalesce((select sum(c.amount) from credit_notes c where c.invoice_id = i.id), 0)::bigint as credited,
        coalesce((select sum(r.amount) from payment_receipts r where r.invoice_id = i.id and not r.pending), 0)::bigint as received
      from project_invoices i join projects p on p.id = i.project_id join organizations o on o.id = p.owner_org_id
      where i.issued_by_org_id = ${ctx.orgId}::uuid order by i.issued_at desc limit 300`);
    const list = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ?? (rows as unknown as Record<string, unknown>[]);
    return list.map((x) => ({ ...x, amount: Number(x.amount), credited: Number(x.credited), received: Number(x.received), room: creditRoom(Number(x.amount), Number(x.credited)) }));
  }

  @Get('credit-notes')
  @RequireOrg()
  async credits(@Ctx() ctx: RequestContext, @Query('dir') dir = 'issued') {
    const col = dir === 'received' ? creditNotes.toOrgId : creditNotes.issuedByOrgId;
    const rows = await this.db.select({ c: creditNotes, invoice: projectInvoices.number, other: sql<string>`(select display_name from organizations where id = ${dir === 'received' ? creditNotes.issuedByOrgId : creditNotes.toOrgId})` })
      .from(creditNotes).innerJoin(projectInvoices, eq(projectInvoices.id, creditNotes.invoiceId)).where(eq(col, ctx.orgId!)).orderBy(desc(creditNotes.issuedAt));
    return rows.map((r) => ({ id: r.c.id, number: r.c.number, invoice: r.invoice, counterparty: r.other, reason: r.c.reason, reasonLabel: creditReasonLabel(r.c.reason), amount: r.c.amount, note: r.c.note,
      refundDue: r.c.refundDue, refundPaidAt: r.c.refundPaidAt, refundReference: r.c.refundReference, issuedAt: r.c.issuedAt }));
  }

  @Post('credit-notes')
  @RequireOrg()
  @HttpCode(201)
  async issue(@Ctx() ctx: RequestContext, @Body(body(CreditNoteSchema)) b: z.infer<typeof CreditNoteSchema>) {
    if (!manager(ctx)) throw new ForbiddenException('Only an owner or admin can issue credit notes');
    return this.db.transaction(async (tx) => {
      const [r] = await tx.select({ i: projectInvoices, payer: projects.ownerOrgId }).from(projectInvoices).innerJoin(projects, eq(projects.id, projectInvoices.projectId)).where(eq(projectInvoices.id, b.invoiceId)).for('update');
      if (!r || r.i.issuedByOrgId !== ctx.orgId) throw new NotFoundException('Invoice not found');
      const [{ credited }] = await tx.select({ credited: sql<number>`coalesce(sum(${creditNotes.amount}), 0)::bigint` }).from(creditNotes).where(eq(creditNotes.invoiceId, b.invoiceId));
      const room = creditRoom(r.i.amount, Number(credited));
      if (b.amount > room) throw new ConflictException(`At most ₹${(room / 100).toLocaleString('en-IN')} is left to credit on ${r.i.number}`);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(creditNotes);
      const number = `CN-${new Date().getFullYear()}-${String(100001 + Number(n)).padStart(6, '0')}`;
      const [c] = await tx.insert(creditNotes).values({ number, invoiceId: b.invoiceId, issuedByOrgId: ctx.orgId!, toOrgId: r.payer, reason: b.reason, amount: b.amount, note: b.note, refundDue: r.i.status === 'paid', createdBy: ctx.userId }).returning();
      await this.audit.record(ctx, { action: 'books.credit_note_issued', objectType: 'project_invoice', objectId: b.invoiceId, after: { number, amount: b.amount, reason: b.reason } });
      return { id: c.id, number, refundDue: c.refundDue, room: room - b.amount };
    });
  }

  @Post('credit-notes/:id/refund')
  @RequireOrg()
  @HttpCode(200)
  async refund(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reference: z.string().trim().min(4).max(80), paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))) b: { reference: string; paidOn: string }) {
    if (!manager(ctx)) throw new ForbiddenException('Only an owner or admin can record refunds');
    const [c] = await this.db.select().from(creditNotes).where(and(eq(creditNotes.id, id), eq(creditNotes.issuedByOrgId, ctx.orgId!)));
    if (!c) throw new NotFoundException('Credit note not found');
    if (!c.refundDue) throw new BadRequestException('This credit reduced an unpaid invoice — there is no refund to record');
    if (c.refundPaidAt) throw new ConflictException('Refund already recorded');
    await this.db.update(creditNotes).set({ refundPaidAt: b.paidOn, refundReference: b.reference }).where(eq(creditNotes.id, id));
    await this.audit.record(ctx, { action: 'books.refund_recorded', objectType: 'credit_note', objectId: id, after: b });
    return { id, refundPaidAt: b.paidOn };
  }

  @Get('expenses')
  @RequireOrg()
  async listExpenses(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select().from(expenses).where(eq(expenses.orgId, ctx.orgId!)).orderBy(desc(expenses.date)).limit(500);
    return rows.map((e) => ({ ...e, categoryLabel: EXPENSE_LABELS[e.category] ?? e.category }));
  }

  @Post('expenses')
  @RequireOrg()
  @HttpCode(201)
  async addExpense(@Ctx() ctx: RequestContext, @Body(body(ExpenseSchema)) b: z.infer<typeof ExpenseSchema>) {
    const [e] = await this.db.insert(expenses).values({ orgId: ctx.orgId!, date: b.date, category: b.category, amount: b.amount, description: b.description, vendor: b.vendor || null, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'books.expense_recorded', objectType: 'expense', objectId: e.id, after: { amount: b.amount, category: b.category } });
    return e;
  }
}
