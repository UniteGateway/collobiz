/**
 * HR, Payroll and Finance in the workspace, backed by ERPNext (Frappe HR + India Payroll + India Compliance).
 *
 * Rules (tested in test/erp.e2e.ts):
 *  - HR (people, leave, attendance): super admins and Unite admins.
 *  - Payroll and accounts: finance and super admins only — salaries are never shown to other roles.
 *  - Every response says where the data came from: `erpnext` (live) or `sample` (illustrative, demo only).
 *  - Commission posting goes only to a connected ERPNext, only for finance-approved lines, only with the CA's accounts
 *    configured, and never twice (recorded per commission line; ERPNext is also checked for the reference).
 *  - Amounts from ERPNext are in rupees; COLLABIZ ledger amounts (paise) are converted when posting.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, HttpException, Injectable, Module, NotFoundException, Param, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { InjectDb, type Db } from '../../db/client';
import { catalogItems, commissionAgreements, commissionEntries, erpSyncRecords, groupCompanies, organizations } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { config } from '../../config';
import { ErpnextError } from './erpnext.client';
import { ErpnextSource, erpSource, type ErpSource } from './erp.source';

const POSTABLE = ['approved', 'invoiced', 'settled'];
const hrRoles = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const moneyRoles = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'finance');
const opsRoles = hrRoles;
const posRoles = (ctx: RequestContext) => hrRoles(ctx) || moneyRoles(ctx);
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class ErpService {
  source(): ErpSource {
    const s = erpSource();
    if (!s) throw new ServiceUnavailableException('ERPNext is not connected yet. Ask your administrator to connect it (Workspace → Apps → Integrations).');
    return s;
  }
  /** Turns ERPNext failures into clear messages without crashing the page. */
  async call<T>(fn: (s: ErpSource) => Promise<T>) {
    const s = this.source();
    try { return { source: s.kind, data: await fn(s) }; } catch (e) {
      if (e instanceof ErpnextError) throw new HttpException({ statusCode: e.status === 503 ? 503 : 502, message: `ERPNext: ${e.message}` }, e.status === 503 ? 503 : 502);
      const st = (e as { status?: number }).status;
      if (st === 404) throw new NotFoundException((e as Error).message);
      if (st === 409) throw new ConflictException((e as Error).message);
      throw e;
    }
  }
}

@ApiTags('erp')
@Controller()
export class ErpController {
  constructor(@InjectDb() private db: Db, private svc: ErpService, private audit: AuditService) {}

  @Get('admin/erp/status')
  status(@Ctx() ctx: RequestContext) {
    if (!ctx.platformRoles.length) throw new ForbiddenException('Unite Group staff only');
    const s = erpSource();
    return { source: s?.kind ?? 'none', site: s instanceof ErpnextSource ? new URL(config().ERPNEXT_URL!).host : null, commissionAccountsSet: !!(config().ERPNEXT_COMMISSION_EXPENSE_ACCOUNT && config().ERPNEXT_COMMISSION_PAYABLE_ACCOUNT && config().ERPNEXT_TDS_PAYABLE_ACCOUNT) };
  }

  // ---------- HR ----------
  @Get('admin/hr/overview')
  async hr(@Ctx() ctx: RequestContext) {
    if (!hrRoles(ctx)) throw new ForbiddenException('HR is for Unite admins and super admins');
    return this.svc.call(async (s) => {
      const [emps, open, att] = await Promise.all([s.employees(), s.leave('Open'), s.attendanceToday()]);
      const m = new Date(); const monthStart = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;
      const byCompany = [...new Set(emps.map((e) => e.company))].sort().map((company) => {
        const es = emps.filter((e) => e.company === company);
        return { company, headcount: es.length, departments: [...new Set(es.map((e) => e.department).filter(Boolean))].length };
      });
      const departments = [...new Set(emps.map((e) => `${e.company}|${e.department ?? 'No department'}`))].map((k) => { const [company, department] = k.split('|'); return { company, department, headcount: emps.filter((e) => e.company === company && (e.department ?? 'No department') === department).length }; });
      return { headcount: emps.length, joinersThisMonth: emps.filter((e) => (e.joined ?? '') >= monthStart).length, pendingLeave: open.length, attendance: att, byCompany, departments };
    });
  }

  @Get('admin/hr/employees')
  async employees(@Ctx() ctx: RequestContext, @Query('q') q?: string, @Query('company') company?: string) {
    if (!hrRoles(ctx)) throw new ForbiddenException('HR is for Unite admins and super admins');
    return this.svc.call(async (s) => {
      const t = (q ?? '').trim().toLowerCase();
      return (await s.employees()).filter((e) => (!company || e.company === company) && (!t || `${e.name} ${e.designation} ${e.department} ${e.id}`.toLowerCase().includes(t)));
    });
  }

  @Get('admin/hr/leave')
  async leave(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    if (!hrRoles(ctx)) throw new ForbiddenException('HR is for Unite admins and super admins');
    const st = status && ['Open', 'Approved', 'Rejected'].includes(status) ? status : undefined;
    return this.svc.call((s) => s.leave(st));
  }

  @Post('admin/hr/leave/:id/decide')
  @HttpCode(200)
  async decide(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(body(z.object({ decision: z.enum(['approve', 'reject']) }))) b: { decision: 'approve' | 'reject' }) {
    if (!hrRoles(ctx)) throw new ForbiddenException('HR is for Unite admins and super admins');
    if (!/^[A-Za-z0-9._\-/ ]{3,80}$/.test(id)) throw new BadRequestException('Invalid leave application');
    const r = await this.svc.call((s) => s.decideLeave(id, b.decision === 'approve' ? 'Approved' : 'Rejected'));
    await this.audit.record(ctx, { action: 'hr.leave_decided', objectType: 'erp_leave_application', objectId: id, after: { decision: b.decision, source: r.source } });
    return r;
  }

  // ---------- Payroll ----------
  @Get('admin/payroll/overview')
  async payroll(@Ctx() ctx: RequestContext) {
    if (!moneyRoles(ctx)) throw new ForbiddenException('Payroll is for finance and super admins');
    return this.svc.call(async (s) => {
      const p = await s.payroll();
      const sum = (k: 'gross' | 'deductions' | 'net') => p.slips.reduce((a, x) => a + x[k], 0);
      const byCompany = [...new Set(p.slips.map((x) => x.company))].sort().map((company) => {
        const xs = p.slips.filter((x) => x.company === company);
        return { company, employees: xs.length, gross: xs.reduce((a, x) => a + x.gross, 0), net: xs.reduce((a, x) => a + x.net, 0) };
      });
      return { period: p.period, employees: p.slips.length, gross: sum('gross'), deductions: sum('deductions'), net: sum('net'), statutory: p.statutory, byCompany, slips: p.slips };
    });
  }

  // ---------- Inventory & stores (and dispatches) ----------
  @Get('admin/inventory/overview')
  async inventory(@Ctx() ctx: RequestContext) {
    if (!opsRoles(ctx)) throw new ForbiddenException('Inventory is for Unite admins and super admins');
    return this.svc.call(async (s) => {
      const o = await s.ops('inventory');
      const stock = o.stock ?? [];
      const warehouses = [...new Set(stock.map((r) => r.warehouse))].sort().map((w) => { const rs = stock.filter((r) => r.warehouse === w); return { warehouse: w, items: rs.filter((r) => r.qty > 0).length, value: rs.reduce((a, r) => a + r.value, 0) }; });
      const reorder = stock.filter((r) => r.projected <= 0).sort((a, b) => a.projected - b.projected);
      return {
        itemsInStock: new Set(stock.filter((r) => r.qty > 0).map((r) => r.item)).size, warehouses, stockValue: stock.reduce((a, r) => a + r.value, 0),
        reorder, stock, movements: o.movements ?? [], dispatches: o.dispatches ?? [], dispatchesToBill: (o.dispatches ?? []).filter((d) => d.status === 'To Bill').length,
      };
    });
  }

  // ---------- Manufacturing ----------
  @Get('admin/manufacturing/overview')
  async manufacturing(@Ctx() ctx: RequestContext) {
    if (!opsRoles(ctx)) throw new ForbiddenException('Manufacturing is for Unite admins and super admins');
    return this.svc.call(async (s) => {
      const o = await s.ops('manufacturing');
      const wos = o.workOrders ?? [];
      const open = wos.filter((w) => !['Completed', 'Stopped', 'Closed', 'Cancelled'].includes(w.status));
      return {
        boms: o.boms ?? 0, inProcess: wos.filter((w) => w.status === 'In Process').length, notStarted: wos.filter((w) => w.status === 'Not Started').length,
        completed: wos.filter((w) => w.status === 'Completed').length, overdue: open.filter((w) => w.due && w.due < today()).length,
        unitsPlanned: open.reduce((a, w) => a + w.qty, 0), unitsProduced: open.reduce((a, w) => a + w.produced, 0), workOrders: wos,
      };
    });
  }

  // ---------- Retail POS ----------
  @Get('admin/pos/overview')
  async pos(@Ctx() ctx: RequestContext) {
    if (!posRoles(ctx)) throw new ForbiddenException('Store sales are for Unite admins, finance and super admins');
    return this.svc.call(async (s) => {
      const sales = (await s.ops('pos')).pos ?? [];
      const t = today();
      const stores = [...new Set(sales.map((x) => x.store))].sort().map((store) => { const xs = sales.filter((x) => x.store === store); return { store, bills: xs.length, amount: xs.reduce((a, x) => a + x.amount, 0), today: xs.filter((x) => x.date === t).reduce((a, x) => a + x.amount, 0) }; });
      const td = sales.filter((x) => x.date === t);
      return { todayBills: td.length, todayAmount: td.reduce((a, x) => a + x.amount, 0), monthBills: sales.length, monthAmount: sales.reduce((a, x) => a + x.amount, 0), stores, recent: sales.slice(0, 12) };
    });
  }

  // ---------- Procurement ----------
  @Get('admin/procurement/overview')
  async procurement(@Ctx() ctx: RequestContext) {
    if (!opsRoles(ctx)) throw new ForbiddenException('Procurement is for Unite admins and super admins');
    return this.svc.call(async (s) => {
      const o = await s.ops('procurement');
      const pos = o.purchaseOrders ?? [];
      const open = pos.filter((p) => !['Completed', 'Closed', 'Cancelled'].includes(p.status));
      return {
        openOrders: open.length, openValue: open.reduce((a, p) => a + p.amount, 0), lateDeliveries: open.filter((p) => p.received < 100 && p.due && p.due < today()).length,
        openMaterialRequests: o.openMaterialRequests ?? 0, purchaseOrders: pos,
      };
    });
  }

  /** Sends Unite group companies' published catalogue products to ERPNext as Items (item code = SKU). Never creates an item twice. */
  @Post('admin/erp/items/sync')
  @HttpCode(200)
  async syncItems(@Ctx() ctx: RequestContext) {
    if (!opsRoles(ctx)) throw new ForbiddenException('Only Unite admins and super admins send the catalogue to ERPNext');
    const s = this.svc.source();
    if (!(s instanceof ErpnextSource)) throw new ConflictException('The catalogue can only be sent to a connected ERPNext — sample data cannot be changed.');
    const done = await this.db.select({ id: erpSyncRecords.sourceId }).from(erpSyncRecords).where(and(eq(erpSyncRecords.kind, 'catalog_item'), eq(erpSyncRecords.status, 'posted')));
    const rows = await this.db.select({ i: catalogItems }).from(catalogItems).innerJoin(groupCompanies, eq(groupCompanies.organizationId, catalogItems.ownerOrgId))
      .where(and(eq(catalogItems.status, 'published'), sql`${catalogItems.sku} is not null`, done.length ? notInArray(catalogItems.id, done.map((x) => x.id)) : undefined)).limit(500);
    let created = 0, linked = 0, failed = 0;
    for (const { i } of rows) {
      const record = async (status: string, erpName: string | null, error: string | null) => {
        await this.db.insert(erpSyncRecords).values({ kind: 'catalog_item', sourceId: i.id, erpDoctype: 'Item', erpName, status, error, attempts: 1, postedBy: ctx.userId, postedAt: status === 'posted' ? new Date() : null })
          .onConflictDoUpdate({ target: [erpSyncRecords.kind, erpSyncRecords.sourceId], set: { erpName, status, error, attempts: sql`${erpSyncRecords.attempts} + 1`, postedBy: ctx.userId, postedAt: status === 'posted' ? new Date() : null, updatedAt: new Date() } });
      };
      try {
        const [existing] = await s.client.list<{ name: string }>('Item', { fields: ['name'], filters: [['item_code', '=', i.sku!]], limit: 1 });
        if (existing) { await record('posted', existing.name, null); linked++; continue; }
        const doc = await s.client.insert<{ name: string }>('Item', {
          item_code: i.sku, item_name: i.name.slice(0, 140), description: i.description, item_group: i.kind === 'service' ? 'Services' : config().ERPNEXT_ITEM_GROUP ?? 'Products',
          stock_uom: 'Nos', is_stock_item: i.kind === 'service' ? 0 : 1, include_item_in_manufacturing: i.kind === 'service' ? 0 : 1,
        });
        await record('posted', doc.name, null); created++;
      } catch (err) { await record('failed', null, (err as Error).message.slice(0, 300)); failed++; }
    }
    await this.audit.record(ctx, { action: 'erp.items_synced', objectType: 'erp_sync', after: { created, linked, failed } });
    return { created, linked, failed, considered: rows.length };
  }

  // ---------- Finance ----------
  @Get('admin/finance-books/overview')
  async books(@Ctx() ctx: RequestContext) {
    if (!moneyRoles(ctx)) throw new ForbiddenException('Accounts are for finance and super admins');
    const r = await this.svc.call((s) => s.books());
    const synced = await this.db.select({ id: erpSyncRecords.sourceId }).from(erpSyncRecords).where(and(eq(erpSyncRecords.kind, 'commission_entry'), eq(erpSyncRecords.status, 'posted')));
    const [waiting] = await this.db.select({ n: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(${commissionEntries.payable}), 0)::bigint` }).from(commissionEntries)
      .where(and(inArray(commissionEntries.status, POSTABLE), synced.length ? notInArray(commissionEntries.id, synced.map((x) => x.id)) : undefined));
    const recent = await this.db.select().from(erpSyncRecords).where(eq(erpSyncRecords.kind, 'commission_entry')).orderBy(desc(erpSyncRecords.updatedAt)).limit(10);
    return { ...r, commission: { waiting: waiting.n, waitingAmount: Number(waiting.amount) / 100, posted: synced.length, recent } };
  }

  /** Posts finance-approved commission lines to ERPNext as Journal Entries. Idempotent per line. */
  @Post('admin/finance-books/post-commission')
  @HttpCode(200)
  async post(@Ctx() ctx: RequestContext) {
    if (!ctx.caps.has('commission.approve')) throw new ForbiddenException('Only finance approvers post commission to the books');
    const s = this.svc.source();
    if (!(s instanceof ErpnextSource)) throw new ConflictException('Commission can only be posted to a connected ERPNext — sample data cannot be posted to.');
    const c = config();
    if (!c.ERPNEXT_COMMISSION_EXPENSE_ACCOUNT || !c.ERPNEXT_COMMISSION_PAYABLE_ACCOUNT || !c.ERPNEXT_TDS_PAYABLE_ACCOUNT) throw new ConflictException('Your CA needs to choose the commission expense, commission payable and TDS payable accounts first (see infra/erpnext/README.md).');
    const done = await this.db.select({ id: erpSyncRecords.sourceId }).from(erpSyncRecords).where(and(eq(erpSyncRecords.kind, 'commission_entry'), eq(erpSyncRecords.status, 'posted')));
    const rows = await this.db.select({ e: commissionEntries, payer: organizations.legalName }).from(commissionEntries).innerJoin(commissionAgreements, eq(commissionAgreements.id, commissionEntries.agreementId))
      .innerJoin(organizations, eq(organizations.id, commissionAgreements.payerOrgId))
      .where(and(inArray(commissionEntries.status, POSTABLE), done.length ? notInArray(commissionEntries.id, done.map((x) => x.id)) : undefined)).limit(100);
    let posted = 0, failed = 0;
    for (const { e, payer } of rows) {
      const ref = `COLLABIZ-${e.id}`;
      const record = async (status: string, erpName: string | null, error: string | null) => {
        await this.db.insert(erpSyncRecords).values({ kind: 'commission_entry', sourceId: e.id, erpDoctype: 'Journal Entry', erpName, status, error, attempts: 1, postedBy: ctx.userId, postedAt: status === 'posted' ? new Date() : null })
          .onConflictDoUpdate({ target: [erpSyncRecords.kind, erpSyncRecords.sourceId], set: { erpName, status, error, attempts: sql`${erpSyncRecords.attempts} + 1`, postedBy: ctx.userId, postedAt: status === 'posted' ? new Date() : null, updatedAt: new Date() } });
      };
      try {
        if (e.gst > 0 && !c.ERPNEXT_GST_INPUT_ACCOUNT) throw new ErpnextError('This line includes GST — your CA needs to choose the GST input account (ERPNEXT_GST_INPUT_ACCOUNT)', 409);
        const [existing] = await s.client.list<{ name: string }>('Journal Entry', { fields: ['name'], filters: [['cheque_no', '=', ref], ['docstatus', '<', 2]], limit: 1 });
        if (existing) { await record('posted', existing.name, null); posted++; continue; }
        const r = (p: number) => Math.round(p) / 100;
        const accounts = [
          { account: c.ERPNEXT_COMMISSION_EXPENSE_ACCOUNT, debit_in_account_currency: r(e.taxable), user_remark: e.description },
          ...(e.gst > 0 ? [{ account: c.ERPNEXT_GST_INPUT_ACCOUNT, debit_in_account_currency: r(e.gst) }] : []),
          { account: c.ERPNEXT_COMMISSION_PAYABLE_ACCOUNT, credit_in_account_currency: r(e.payable) },
          ...(e.tds > 0 ? [{ account: c.ERPNEXT_TDS_PAYABLE_ACCOUNT, credit_in_account_currency: r(e.tds) }] : []),
        ];
        const doc = await s.client.insert<Record<string, unknown>>('Journal Entry', {
          voucher_type: 'Journal Entry', company: payer, posting_date: (e.approvedAt ?? new Date()).toISOString().slice(0, 10),
          cheque_no: ref, cheque_date: (e.approvedAt ?? new Date()).toISOString().slice(0, 10), user_remark: `Partner commission from COLLABIZ: ${e.description}`, accounts,
        });
        const submitted = await s.client.submit<{ name: string }>(doc);
        await record('posted', submitted.name, null); posted++;
      } catch (err) {
        await record('failed', null, (err as Error).message.slice(0, 300)); failed++;
      }
    }
    await this.audit.record(ctx, { action: 'finance.commission_posted_to_erp', objectType: 'erp_sync', after: { posted, failed } });
    return { posted, failed, considered: rows.length };
  }
}

@Module({ controllers: [ErpController], providers: [ErpService] })
export class ErpModule {}
