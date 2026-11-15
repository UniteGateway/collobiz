/**
 * Group-company product sales — Unite Powertek's catalogue sold by anyone on COLLABIZ (tested in test/product-sales.e2e.ts).
 *  - Sellers: any signed-in member of any organisation — franchise, store partner, partner company or agent/individual.
 *    The channel is derived on the server from the seller's organisation and partnership.
 *  - The seller registers a customer enquiry (customer consent required) for catalogue products. The first seller to
 *    register a customer keeps the attribution for 90 days; a second registration of the same customer is refused.
 *  - The company's sales team (Unite admins or members of the company) discusses, quotes and wins or loses it. Winning
 *    freezes the commission rate and opens a commission agreement + projected line in the seller's Earnings.
 *  - Finance records the customer payment; the commission becomes earned and follows the normal approval, TDS and payout
 *    flow. Sellers whose business is not yet verified are put on hold until they complete KYC.
 * Prices are "on request" on the company website, so values come from the sales team's quote and order — never invented.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  ATTRIBUTION_DAYS, CommissionRuleSchema, ENQUIRY_NEXT, ENQUIRY_STATUS_LABELS, ProductEnquirySchema, SELLER_CHANNEL_LABELS, customerKey, orderCommission, resolveRate,
  type EnquiryStatus, type RuleLike, type SellerChannel,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  bankProfiles, catalogItems, commissionAgreements, commissionEntries, commissionPolicies, franchiseUnits, groupCompanies, memberships, notifications, organizations, productCommissionRules, productEnquiries,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { Idempotent } from '../../common/idempotency';
import { canonicalJson, randomDigits, sha256 } from '../../common/crypto';
import { CommissionsModule, CommissionsService, lineAmounts } from '../commissions/commissions.controller';

type Enquiry = typeof productEnquiries.$inferSelect;
type Line = { catalogItemId: string; sku: string | null; name: string; productLine: string | null; category: string | null; qty: number; note?: string; rateBps: number | null };
/** Companies whose catalogue is open to every seller. The key is the URL slug; the match finds the group company. */
const BRANDS: Record<string, { match: string; name: string }> = { powertek: { match: '%powertek%', name: 'Unite Powertek' } };
const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const finance = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'finance');
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const hist = (by: string, status: string, note?: string | null) => sql`history || ${JSON.stringify([{ at: new Date().toISOString(), by, status, note: note ?? null }])}::jsonb`;
const bad = (path: string, message: string) => new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: [{ path, message }] });
const inr = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

const StatusSchema = z.object({
  to: z.enum(['in_discussion', 'quoted', 'won', 'lost']),
  quoteValue: z.number().int().positive().optional(), orderValue: z.number().int().positive().optional(), invoiceNumber: z.string().trim().min(3).max(60).optional(),
  assignedTo: z.string().trim().max(120).optional(), lostReason: z.string().trim().min(3).max(500).optional(), note: z.string().trim().max(1000).optional(),
});

@ApiTags('product-sales')
@Controller('product-sales')
export class ProductSalesController {
  constructor(@InjectDb() private db: Db, private commissions: CommissionsService, private audit: AuditService) {}

  private async brand(slug: string) {
    const b = BRANDS[slug];
    if (!b) throw new NotFoundException('Unknown company');
    const [g] = await this.db.select({ id: groupCompanies.organizationId }).from(groupCompanies).where(ilike(groupCompanies.brandName, b.match)).limit(1);
    const [o] = g ? [g] : await this.db.select({ id: organizations.id }).from(organizations).where(ilike(organizations.displayName, b.match)).limit(1);
    if (!o) throw new NotFoundException(`${b.name} is not set up in COLLABIZ`);
    return { id: o.id, slug, name: b.name };
  }
  /** The company's sales team: Unite admins or active members of the company itself. */
  private salesSide(ctx: RequestContext, brandOrgId: string) { return staff(ctx) || ctx.memberships.some((m) => m.organizationId === brandOrgId); }
  private async rules(brandOrgId: string): Promise<RuleLike[]> {
    return this.db.select({ productLine: productCommissionRules.productLine, category: productCommissionRules.category, rateBps: productCommissionRules.rateBps, active: productCommissionRules.active }).from(productCommissionRules).where(eq(productCommissionRules.brandOrgId, brandOrgId));
  }
  private async channel(orgId: string): Promise<SellerChannel> {
    const [u] = await this.db.select({ pkg: franchiseUnits.packageCode }).from(franchiseUnits).where(and(eq(franchiseUnits.franchiseeOrgId, orgId), inArray(franchiseUnits.status, ['approved', 'agreement_signed', 'setup', 'live']), sql`${franchiseUnits.packageCode} is not null`)).limit(1);
    if (u?.pkg) return u.pkg.startsWith('store') ? 'store' : 'franchise';
    const [o] = await this.db.select({ type: organizations.type }).from(organizations).where(eq(organizations.id, orgId));
    return o?.type === 'partner_individual' ? 'agent' : 'partner';
  }
  private async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const ms = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'announcement', title, body: text, link })));
  }
  private async notifySales(brandOrgId: string, title: string, text: string, link: string) {
    const ms = await this.db.selectDistinct({ u: memberships.userId }).from(memberships).where(and(eq(memberships.status, 'active'), sql`(${memberships.organizationId} = ${brandOrgId} or ${memberships.role} in ('unite_admin', 'super_admin'))`));
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'announcement', title, body: text, link })));
  }
  private view(e: Enquiry, sales = false) {
    const lines = e.lines as Line[];
    return {
      id: e.id, code: e.code, channel: e.channel, channelLabel: SELLER_CHANNEL_LABELS[e.channel as SellerChannel], customerName: e.customerName, city: e.city, state: e.state, pincode: e.pincode,
      ...(sales ? { customerPhone: e.customerPhone, customerEmail: e.customerEmail, sellerOrgId: e.sellerOrgId } : {}),
      lines, requirement: e.requirement, status: e.status, statusLabel: ENQUIRY_STATUS_LABELS[e.status as EnquiryStatus], protectedUntil: e.protectedUntil,
      quoteValue: e.quoteValue, orderValue: e.orderValue, invoiceNumber: e.invoiceNumber, paidAt: e.paidAt, rateBps: e.rateBps,
      commission: e.rateBps != null && e.orderValue ? Math.round((e.orderValue * e.rateBps) / 10000) : null, commissionEntryId: e.commissionEntryId,
      assignedTo: e.assignedTo, lostReason: e.lostReason, history: e.history, createdAt: e.createdAt, next: sales ? ENQUIRY_NEXT[e.status as EnquiryStatus] : [],
    };
  }

  // ---------------------------------------------------------------- catalogue (anyone signed in)
  @Get(':brand/catalogue')
  async catalogue(@Param('brand') slug: string, @Query('q') q?: string, @Query('line') line?: string, @Query('category') category?: string, @Query('page') page = '1') {
    const b = await this.brand(slug);
    const where = and(eq(catalogItems.ownerOrgId, b.id), eq(catalogItems.status, 'published'), inArray(catalogItems.visibility, ['public', 'partners']),
      line ? sql`${catalogItems.specs}->>'Product line' = ${line}` : undefined, category ? sql`${catalogItems.specs}->>'Category' = ${category}` : undefined,
      q ? sql`(${catalogItems.name} ilike ${'%' + q + '%'} or ${catalogItems.sku} ilike ${'%' + q + '%'} or ${catalogItems.description} ilike ${'%' + q + '%'})` : undefined);
    const size = 24, p = Math.max(1, Number(page) || 1);
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(catalogItems).where(where);
    const rows = await this.db.select().from(catalogItems).where(where).orderBy(sql`${catalogItems.specs}->>'Product line'`, catalogItems.name).limit(size).offset((p - 1) * size);
    const rules = await this.rules(b.id);
    const lines = await this.db.select({ line: sql<string>`${catalogItems.specs}->>'Product line'`, category: sql<string>`${catalogItems.specs}->>'Category'`, n: sql<number>`count(*)::int` }).from(catalogItems)
      .where(and(eq(catalogItems.ownerOrgId, b.id), eq(catalogItems.status, 'published'), inArray(catalogItems.visibility, ['public', 'partners']))).groupBy(sql`1`, sql`2`).orderBy(sql`1`, sql`2`);
    const byLine = new Map<string, { line: string; count: number; categories: { category: string; count: number }[] }>();
    for (const r of lines) { const k = r.line ?? 'Other'; const g = byLine.get(k) ?? { line: k, count: 0, categories: [] }; g.count += r.n; g.categories.push({ category: r.category ?? 'Other', count: r.n }); byLine.set(k, g); }
    return {
      brand: b.name, total: n, page: p, pageSize: size, lines: [...byLine.values()].sort((a, c) => c.count - a.count),
      items: rows.map((r) => { const sp = r.specs as Record<string, string>; return {
        id: r.id, sku: r.sku, name: r.name, kind: r.kind, description: r.description, productLine: sp['Product line'] ?? null, category: sp.Category ?? null, hasImage: !!r.imageKey,
        listPrice: r.priceVisibility === 'public' || r.priceVisibility === 'verified_partners' ? r.listPrice : null, productPage: sp['Product page'] ?? null,
        specs: Object.fromEntries(Object.entries(sp).filter(([k]) => !['Product page'].includes(k))), commissionBps: resolveRate(rules, sp['Product line'], sp.Category),
      }; }),
      note: 'Prices are quoted by the company for each order. Commission is earned on the order value (excl. GST) after the customer pays.',
    };
  }

  // ---------------------------------------------------------------- seller side
  @Post(':brand/enquiries')
  @Idempotent()
  @RequireOrg()
  async enquire(@Ctx() ctx: RequestContext, @Param('brand') slug: string, @Body(body(ProductEnquirySchema)) b: z.infer<typeof ProductEnquirySchema>) {
    const br = await this.brand(slug);
    if (ctx.orgId === br.id) throw new ForbiddenException('The company’s own team records direct sales in its ERP, not as referrals');
    const items = await this.db.select().from(catalogItems).where(and(inArray(catalogItems.id, b.lines.map((l) => l.catalogItemId)), eq(catalogItems.ownerOrgId, br.id), eq(catalogItems.status, 'published')));
    if (items.length !== new Set(b.lines.map((l) => l.catalogItemId)).size) throw bad('lines', `Only published ${br.name} products can be enquired`);
    const rules = await this.rules(br.id);
    const lines: Line[] = b.lines.map((l) => { const it = items.find((x) => x.id === l.catalogItemId)!; const sp = it.specs as Record<string, string>;
      return { catalogItemId: it.id, sku: it.sku, name: it.name, productLine: sp['Product line'] ?? null, category: sp.Category ?? null, qty: l.qty, note: l.note, rateBps: resolveRate(rules, sp['Product line'], sp.Category) }; });
    const key = customerKey(b.customerName, b.pincode);
    const [dup] = await this.db.select({ seller: productEnquiries.sellerOrgId }).from(productEnquiries).where(and(eq(productEnquiries.brandOrgId, br.id), eq(productEnquiries.customerKey, key), sql`${productEnquiries.status} not in ('lost', 'withdrawn')`)).limit(1);
    if (dup) throw new ConflictException(dup.seller === ctx.orgId ? 'You have already registered this customer — add products to that enquiry through the sales team' : 'This customer is already registered with the sales team by another seller');
    const channel = await this.channel(ctx.orgId!);
    try {
      const [e] = await this.db.insert(productEnquiries).values({
        code: `PE-${new Date().getUTCFullYear()}-${randomDigits(6)}`, brandOrgId: br.id, sellerOrgId: ctx.orgId!, sellerUserId: ctx.userId, channel, customerName: b.customerName, customerKey: key,
        customerPhone: b.customerPhone ?? null, customerEmail: b.customerEmail ?? null, city: b.city, state: b.state, pincode: b.pincode, lines, requirement: b.requirement, consentAt: new Date(),
        protectedUntil: addDays(ATTRIBUTION_DAYS), history: [{ at: new Date().toISOString(), by: ctx.userId, status: 'submitted', note: null }],
      }).returning();
      await this.audit.record(ctx, { action: 'product_sales.enquiry', objectType: 'product_enquiry', objectId: e.id, after: { brand: slug, channel, lines: lines.length } });
      await this.notifySales(br.id, `New ${br.name} enquiry ${e.code}`, `${b.customerName}, ${b.city} — ${lines.map((l) => `${l.qty} × ${l.name}`).join(', ')}`, `/workspace/product-sales`);
      return this.view(e);
    } catch (err) {
      if (/product_enquiries_customer_uq/.test(String((err as Error).message) + String((err as { cause?: unknown }).cause))) throw new ConflictException('This customer is already registered with the sales team by another seller');
      throw err;
    }
  }

  @Get(':brand/enquiries/mine')
  @RequireOrg()
  async mine(@Ctx() ctx: RequestContext, @Param('brand') slug: string) {
    const br = await this.brand(slug);
    const rows = await this.db.select().from(productEnquiries).where(and(eq(productEnquiries.brandOrgId, br.id), eq(productEnquiries.sellerOrgId, ctx.orgId!))).orderBy(desc(productEnquiries.createdAt));
    const v = rows.map((r) => this.view(r));
    const sum = (st: string[]) => v.filter((x) => st.includes(x.status)).reduce((a, x) => a + (x.commission ?? 0), 0);
    return {
      channel: SELLER_CHANNEL_LABELS[await this.channel(ctx.orgId!)], enquiries: v,
      totals: { open: v.filter((x) => ['submitted', 'in_discussion', 'quoted'].includes(x.status)).length, won: v.filter((x) => ['won', 'paid'].includes(x.status)).length, commissionWon: sum(['won']), commissionEarned: sum(['paid']) },
      disclaimer: 'Commission depends on the order the company wins and the customer’s payment. This is not a guaranteed income.',
    };
  }

  @Get(':brand/enquiries/:id')
  async one(@Ctx() ctx: RequestContext, @Param('brand') slug: string, @Param('id', ParseUUIDPipe) id: string) {
    const br = await this.brand(slug);
    const [e] = await this.db.select().from(productEnquiries).where(and(eq(productEnquiries.id, id), eq(productEnquiries.brandOrgId, br.id)));
    const sales = this.salesSide(ctx, br.id);
    if (!e || (e.sellerOrgId !== ctx.orgId && !sales && !finance(ctx))) throw new NotFoundException('Enquiry not found');
    return this.view(e, sales || finance(ctx));
  }

  @Post(':brand/enquiries/:id/withdraw')
  @HttpCode(200)
  @RequireOrg()
  async withdraw(@Ctx() ctx: RequestContext, @Param('brand') slug: string, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(3).max(500) }))) b: { reason: string }) {
    const br = await this.brand(slug);
    const [e] = await this.db.select().from(productEnquiries).where(and(eq(productEnquiries.id, id), eq(productEnquiries.brandOrgId, br.id), eq(productEnquiries.sellerOrgId, ctx.orgId!)));
    if (!e) throw new NotFoundException('Enquiry not found');
    if (!['submitted', 'in_discussion', 'quoted'].includes(e.status)) throw new ConflictException('A won, paid or closed enquiry cannot be withdrawn');
    await this.db.update(productEnquiries).set({ status: 'withdrawn', history: hist(ctx.userId, 'withdrawn', b.reason), updatedAt: new Date() }).where(eq(productEnquiries.id, id));
    return { ok: true };
  }

  // ---------------------------------------------------------------- sales team
  @Get(':brand/admin/enquiries')
  async all(@Ctx() ctx: RequestContext, @Param('brand') slug: string, @Query('status') status?: string, @Query('channel') channel?: string, @Query('state') state?: string) {
    const br = await this.brand(slug);
    if (!this.salesSide(ctx, br.id) && !finance(ctx)) throw new ForbiddenException(`${br.name} sales team only`);
    const rows = await this.db.select({ e: productEnquiries, seller: organizations.displayName }).from(productEnquiries).innerJoin(organizations, eq(organizations.id, productEnquiries.sellerOrgId))
      .where(and(eq(productEnquiries.brandOrgId, br.id), status ? eq(productEnquiries.status, status) : undefined, channel ? eq(productEnquiries.channel, channel) : undefined, state ? eq(productEnquiries.state, state) : undefined))
      .orderBy(desc(productEnquiries.updatedAt)).limit(500);
    const all = await this.db.select({ status: productEnquiries.status, channel: productEnquiries.channel, state: productEnquiries.state, orderValue: productEnquiries.orderValue, rateBps: productEnquiries.rateBps, lines: productEnquiries.lines }).from(productEnquiries).where(eq(productEnquiries.brandOrgId, br.id));
    const group = (k: (r: (typeof all)[number]) => string) => Object.values(all.reduce<Record<string, { key: string; enquiries: number; won: number; value: number }>>((a, r) => {
      const key = k(r); const g = a[key] ?? { key, enquiries: 0, won: 0, value: 0 }; g.enquiries++; if (['won', 'paid'].includes(r.status)) { g.won++; g.value += r.orderValue ?? 0; } a[key] = g; return a; }, {})).sort((x, y) => y.value - x.value || y.enquiries - x.enquiries);
    return {
      brand: br.name,
      kpis: { open: all.filter((r) => ['submitted', 'in_discussion', 'quoted'].includes(r.status)).length, won: all.filter((r) => r.status === 'won').length, paid: all.filter((r) => r.status === 'paid').length,
        orderValue: all.filter((r) => ['won', 'paid'].includes(r.status)).reduce((a, r) => a + (r.orderValue ?? 0), 0),
        commission: all.filter((r) => ['won', 'paid'].includes(r.status)).reduce((a, r) => a + (r.orderValue && r.rateBps != null ? Math.round((r.orderValue * r.rateBps) / 10000) : 0), 0) },
      byChannel: group((r) => SELLER_CHANNEL_LABELS[r.channel as SellerChannel] ?? r.channel), byState: group((r) => r.state),
      byLine: group((r) => (r.lines as Line[])[0]?.productLine ?? 'Other'),
      enquiries: rows.map((r) => ({ ...this.view(r.e, true), seller: r.seller })),
    };
  }

  /** The sales team moves an enquiry on. Winning freezes the rate and opens the seller's commission agreement. */
  @Post(':brand/admin/enquiries/:id/status')
  @HttpCode(200)
  async move(@Ctx() ctx: RequestContext, @Param('brand') slug: string, @Param('id', ParseUUIDPipe) id: string, @Body(body(StatusSchema)) b: z.infer<typeof StatusSchema>) {
    const br = await this.brand(slug);
    if (!this.salesSide(ctx, br.id)) throw new ForbiddenException(`${br.name} sales team only`);
    const [e] = await this.db.select().from(productEnquiries).where(and(eq(productEnquiries.id, id), eq(productEnquiries.brandOrgId, br.id)));
    if (!e) throw new NotFoundException('Enquiry not found');
    if (!(ENQUIRY_NEXT[e.status as EnquiryStatus] ?? []).includes(b.to)) throw new ConflictException(`An enquiry that is "${ENQUIRY_STATUS_LABELS[e.status as EnquiryStatus]}" cannot become "${ENQUIRY_STATUS_LABELS[b.to]}"`);
    if (b.to === 'quoted' && !b.quoteValue) throw bad('quoteValue', 'Enter the quoted value (excl. GST)');
    if (b.to === 'won' && (!b.orderValue || !b.invoiceNumber)) throw bad(!b.orderValue ? 'orderValue' : 'invoiceNumber', 'Enter the order value (excl. GST) and the invoice / order number');
    if (b.to === 'lost' && !b.lostReason) throw bad('lostReason', 'Say why it was lost');
    return this.db.transaction(async (tx) => {
      let extra: Partial<Enquiry> = {};
      if (b.to === 'won') {
        const lines = e.lines as Line[];
        const rules = await this.rules(br.id);
        const c = orderCommission(b.orderValue!, lines.map((l) => resolveRate(rules, l.productLine, l.category)));
        extra = { orderValue: b.orderValue, invoiceNumber: b.invoiceNumber, rateBps: c.rateBps };
        if (c.amount && c.rateBps) extra.commissionEntryId = await this.openCommission(tx, ctx, e, br.id, b.orderValue!, c.rateBps);
      }
      if (b.to === 'lost' && e.commissionEntryId) {
        const [ce] = await tx.select().from(commissionEntries).where(eq(commissionEntries.id, e.commissionEntryId));
        if (ce && ce.status === 'estimated') await this.commissions.move(ce, 'reversed', ctx.userId, `Order lost: ${b.lostReason}`, {}, tx);
        else if (ce && ce.status !== 'reversed') throw new ConflictException('Commission on this order has moved on — finance must reverse it');
      }
      const [n] = await tx.update(productEnquiries).set({
        status: b.to, history: hist(ctx.userId, b.to, b.note ?? b.lostReason), updatedAt: new Date(), ...extra,
        ...(b.quoteValue ? { quoteValue: b.quoteValue } : {}), ...(b.assignedTo ? { assignedTo: b.assignedTo } : {}), ...(b.to === 'lost' ? { lostReason: b.lostReason } : {}),
      }).where(eq(productEnquiries.id, id)).returning();
      await this.audit.record(ctx, { action: `product_sales.${b.to}`, objectType: 'product_enquiry', objectId: id, before: { status: e.status }, after: { status: b.to, orderValue: b.orderValue, quoteValue: b.quoteValue, rateBps: extra.rateBps } }, tx);
      await this.notifyOrg(e.sellerOrgId, `${br.name} enquiry ${e.code}: ${ENQUIRY_STATUS_LABELS[b.to]}`, b.to === 'won' ? `Order ${inr(b.orderValue!)} (excl. GST)${extra.rateBps != null ? ` — your commission ${inr(Math.round((b.orderValue! * extra.rateBps) / 10000))} is projected until the customer pays` : ' — commission rate to be confirmed by Unite'}.` : b.note ?? b.lostReason ?? '', '/powertek/enquiries');
      return this.view(n, true);
    });
  }

  private async openCommission(tx: Db, ctx: RequestContext, e: Enquiry, brandOrgId: string, orderValue: number, rateBps: number) {
    const [pol] = await tx.select().from(commissionPolicies).where(and(eq(commissionPolicies.code, 'INTRODUCER-STD'), eq(commissionPolicies.status, 'active'))).orderBy(desc(commissionPolicies.version)).limit(1);
    if (!pol) throw new ConflictException('No active commission policy — ask finance to activate INTRODUCER-STD');
    const [bank] = await tx.select({ gst: bankProfiles.gstRegistered }).from(bankProfiles).where(eq(bankProfiles.organizationId, e.sellerOrgId)).limit(1);
    const terms = { policy: { code: `PRODUCT-${e.code}`, version: 1, name: `Product sale ${e.code}`, basis: 'percent', rateBps, flatAmount: null, tiers: null, tdsBps: pol.tdsBps, clawbackDays: pol.clawbackDays, trigger: 'Customer payment for the order' }, shareBps: 10000, gstRegistered: !!bank?.gst, projectValue: orderValue };
    const [a] = await tx.insert(commissionAgreements).values({ code: `CA-${new Date().getUTCFullYear()}-${randomDigits(6)}`, beneficiaryOrgId: e.sellerOrgId, payerOrgId: brandOrgId, productEnquiryId: e.id, policyId: pol.id, terms, termsHash: sha256(canonicalJson(terms)), createdBy: ctx.userId }).returning();
    const amounts = lineAmounts(terms as never, orderValue);
    const [ce] = await tx.insert(commissionEntries).values({ agreementId: a.id, beneficiaryOrgId: e.sellerOrgId, productEnquiryId: e.id, description: `Product sale ${e.code}: ${e.customerName} (${(e.lines as Line[]).map((l) => l.name).slice(0, 2).join(', ')})`, baseAmount: orderValue, ...amounts }).returning();
    await this.commissions.journal(ce.id, 'entry.estimated', null, 'estimated', ce.payable, `Order won (${e.code})`, ctx.userId, tx);
    return ce.id;
  }

  /** Finance records the customer's payment: the commission is earned (or held until the seller completes verification). */
  @Post(':brand/admin/enquiries/:id/paid')
  @HttpCode(200)
  @Idempotent()
  async paid(@Ctx() ctx: RequestContext, @Param('brand') slug: string, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ paymentReference: z.string().trim().min(4).max(80) }))) b: { paymentReference: string }) {
    const br = await this.brand(slug);
    if (!finance(ctx)) throw new ForbiddenException('Finance records customer payments');
    const [e] = await this.db.select().from(productEnquiries).where(and(eq(productEnquiries.id, id), eq(productEnquiries.brandOrgId, br.id)));
    if (!e) throw new NotFoundException('Enquiry not found');
    if (e.status !== 'won') throw new ConflictException('Only a won order can be marked paid');
    const now = new Date();
    if (e.commissionEntryId) {
      const [ce] = await this.db.select().from(commissionEntries).where(eq(commissionEntries.id, e.commissionEntryId));
      if (ce?.status === 'estimated') {
        const el = await this.commissions.move(ce, 'eligible', ctx.userId, `Order ${e.code} invoiced (${e.invoiceNumber})`);
        const earned = await this.commissions.move(el, 'earned', ctx.userId, `Customer payment ${b.paymentReference}`, { earnedAt: now });
        const [org] = await this.db.select({ v: organizations.verificationStatus }).from(organizations).where(eq(organizations.id, e.sellerOrgId));
        if (org?.v !== 'verified') await this.commissions.move(earned, 'on_hold', ctx.userId, 'Seller business verification (KYC/PAN) pending', { holdReason: 'Complete your business verification (KYC / PAN) to receive this commission' });
      }
    }
    const [n] = await this.db.update(productEnquiries).set({ status: 'paid', paymentReference: b.paymentReference, paidAt: now, history: hist(ctx.userId, 'paid', b.paymentReference), updatedAt: now }).where(eq(productEnquiries.id, id)).returning();
    await this.audit.record(ctx, { action: 'product_sales.paid', objectType: 'product_enquiry', objectId: id, after: b });
    await this.notifyOrg(e.sellerOrgId, `${br.name} order ${e.code} paid`, e.commissionEntryId ? 'Your commission is earned and goes to finance for approval. See Earnings.' : 'The customer has paid.', '/earnings/live');
    return this.view(n, true);
  }

  // ---------------------------------------------------------------- commission rules (Unite admins)
  @Get(':brand/admin/rules')
  async listRules(@Ctx() ctx: RequestContext, @Param('brand') slug: string) {
    const br = await this.brand(slug);
    if (!this.salesSide(ctx, br.id) && !finance(ctx)) throw new ForbiddenException(`${br.name} sales team only`);
    return this.db.select().from(productCommissionRules).where(eq(productCommissionRules.brandOrgId, br.id)).orderBy(sql`coalesce(${productCommissionRules.productLine}, '')`, sql`coalesce(${productCommissionRules.category}, '')`);
  }
  @Post(':brand/admin/rules')
  @HttpCode(200)
  async setRule(@Ctx() ctx: RequestContext, @Param('brand') slug: string, @Body(body(CommissionRuleSchema)) b: z.infer<typeof CommissionRuleSchema>) {
    const br = await this.brand(slug);
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators set commission rates');
    const pl = b.productLine || null, cat = b.category || null;
    const [prev] = await this.db.select().from(productCommissionRules).where(and(eq(productCommissionRules.brandOrgId, br.id), sql`coalesce(${productCommissionRules.productLine}, '') = ${pl ?? ''}`, sql`coalesce(${productCommissionRules.category}, '') = ${cat ?? ''}`));
    const [r] = prev
      ? await this.db.update(productCommissionRules).set({ rateBps: b.rateBps, active: true, note: b.note ?? prev.note, updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(productCommissionRules.id, prev.id)).returning()
      : await this.db.insert(productCommissionRules).values({ brandOrgId: br.id, productLine: pl, category: cat, rateBps: b.rateBps, note: b.note ?? null, updatedBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'product_sales.rule', objectType: 'product_commission_rule', objectId: r.id, before: prev ? { rateBps: prev.rateBps } : null, after: { productLine: pl, category: cat, rateBps: b.rateBps } });
    return r;
  }
  @Post(':brand/admin/rules/:id/deactivate')
  @HttpCode(200)
  async offRule(@Ctx() ctx: RequestContext, @Param('brand') slug: string, @Param('id', ParseUUIDPipe) id: string) {
    const br = await this.brand(slug);
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators set commission rates');
    await this.db.update(productCommissionRules).set({ active: false, updatedBy: ctx.userId, updatedAt: new Date() }).where(and(eq(productCommissionRules.id, id), eq(productCommissionRules.brandOrgId, br.id)));
    await this.audit.record(ctx, { action: 'product_sales.rule_off', objectType: 'product_commission_rule', objectId: id });
    return { ok: true, since: today() };
  }
}

@Module({ imports: [CommissionsModule], controllers: [ProductSalesController] })
export class ProductSalesModule {}
