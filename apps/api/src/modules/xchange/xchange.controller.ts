/**
 * COLLABIZ XCHANGE — B2B barter between verified businesses (tested in test/xchange.e2e.ts).
 *  - Verified partners and Unite Group companies list what they offer and what they need — goods, services, machinery,
 *    surplus stock and idle capacity (warehouse, vehicles, crews, production lines) — at a declared open-market value.
 *  - Matching suggests direct swaps, part-cash deals and multi-party cycles (A→B→C→A). Suggestions only.
 *  - An exchange agreement lists every leg (who supplies what to whom, value, any cash). It must balance within 2%, and
 *    every party's owner/admin approves the same terms; any change needs fresh approval. Then suppliers mark delivery and
 *    receivers accept or dispute. All legs accepted → completed. Disputes go to Unite.
 *  - No trade credits or platform currency. Each leg is a separate taxable supply; COLLABIZ prepares invoice data only.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, gte, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { XCHANGE_CATEGORY_LABELS, XchangeDealSchema, XchangeListingSchema, dealKind, findCycles, isBalanced, legInvoiceNote, oneWayMatches, termsKey, type XListing } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { groupCompanies, memberships, notifications, organizations, xchangeApprovals, xchangeDeals, xchangeLegs, xchangeListings } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomDigits } from '../../common/crypto';

const PARTNER = ['partner_company', 'partner_individual'];
const platform = (ctx: RequestContext) => ctx.platformRoles.length > 0 && !ctx.mfaRequiredButMissing;
const manager = (ctx: RequestContext, orgId: string) => ctx.memberships.some((m) => m.organizationId === orgId && (m.role === 'org_owner' || m.role === 'org_admin'));
type Deal = typeof xchangeDeals.$inferSelect;

@ApiTags('xchange')
@Controller()
export class XchangeController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private async eligible(orgId: string) {
    const [o] = await this.db.select({ v: organizations.verificationStatus, t: organizations.type }).from(organizations).where(eq(organizations.id, orgId));
    const group = (await this.db.select({ id: groupCompanies.organizationId }).from(groupCompanies).where(eq(groupCompanies.organizationId, orgId))).length > 0;
    return group || (o?.v === 'verified' && PARTNER.includes(o.t));
  }
  private async trader(ctx: RequestContext) {
    if (!ctx.orgId || !(await this.eligible(ctx.orgId))) throw new ForbiddenException('XCHANGE is for verified businesses');
    return ctx.orgId;
  }
  private async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const ms = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'announcement', title, body: text, link })));
  }
  private async active(): Promise<XListing[]> {
    const rows = await this.db.select({ l: xchangeListings, org: organizations.displayName }).from(xchangeListings).innerJoin(organizations, eq(organizations.id, xchangeListings.orgId))
      .where(and(eq(xchangeListings.status, 'active'), or(isNull(xchangeListings.availableUntil), gte(xchangeListings.availableUntil, sql`current_date`))));
    return rows.map(({ l, org }) => ({ id: l.id, orgId: l.orgId, orgName: org, side: l.side as 'offer' | 'need', category: l.category, title: l.title, value: l.value, region: l.region, accepts: l.accepts }));
  }

  // ---------- listings ----------
  @Get('xchange')
  async market(@Ctx() ctx: RequestContext, @Query('side') side?: string, @Query('category') category?: string, @Query('q') q?: string) {
    const rows = await this.db.select({ l: xchangeListings, org: organizations.displayName, city: organizations.city }).from(xchangeListings).innerJoin(organizations, eq(organizations.id, xchangeListings.orgId))
      .where(and(eq(xchangeListings.status, 'active'), or(isNull(xchangeListings.availableUntil), gte(xchangeListings.availableUntil, sql`current_date`)),
        side ? eq(xchangeListings.side, side) : undefined, category ? eq(xchangeListings.category, category) : undefined, q ? or(ilike(xchangeListings.title, `%${q}%`), ilike(xchangeListings.description, `%${q}%`)) : undefined))
      .orderBy(desc(xchangeListings.createdAt)).limit(300);
    const mine = ctx.orgId ? await this.db.select().from(xchangeListings).where(eq(xchangeListings.orgId, ctx.orgId)).orderBy(desc(xchangeListings.createdAt)) : [];
    const done = await this.db.select({ org: xchangeLegs.fromOrgId, n: sql<number>`count(*)::int` }).from(xchangeLegs).where(eq(xchangeLegs.status, 'accepted')).groupBy(xchangeLegs.fromOrgId);
    return {
      listings: rows.map(({ l, org, city }) => ({ ...l, org, city, categoryLabel: XCHANGE_CATEGORY_LABELS[l.category], mine: l.orgId === ctx.orgId, deliveries: done.find((d) => d.org === l.orgId)?.n ?? 0 })),
      mine: mine.map((l) => ({ ...l, categoryLabel: XCHANGE_CATEGORY_LABELS[l.category] })), canTrade: !!ctx.orgId && (await this.eligible(ctx.orgId)),
    };
  }

  @Post('xchange/listings')
  @HttpCode(201)
  async list(@Ctx() ctx: RequestContext, @Body(body(XchangeListingSchema)) b: z.infer<typeof XchangeListingSchema>) {
    const org = await this.trader(ctx);
    if (!manager(ctx, org)) throw new ForbiddenException('Your company owner or admin lists offers and needs');
    const [l] = await this.db.insert(xchangeListings).values({ ...b, code: `XL-${randomDigits(6)}`, orgId: org, availableUntil: b.availableUntil ?? null, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'xchange.listed', objectType: 'xchange_listing', objectId: l.id, after: { side: b.side, category: b.category, value: b.value } });
    return l;
  }

  @Patch('xchange/listings/:id')
  async setListing(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ status: z.enum(['active', 'paused', 'closed']) }))) b: { status: string }) {
    const [l] = await this.db.select().from(xchangeListings).where(eq(xchangeListings.id, id));
    if (!l || !manager(ctx, l.orgId)) throw new NotFoundException('Listing not found');
    await this.db.update(xchangeListings).set({ status: b.status, updatedAt: new Date() }).where(eq(xchangeListings.id, id));
    return { status: b.status };
  }

  @Get('xchange/matches')
  async matches(@Ctx() ctx: RequestContext) {
    const org = await this.trader(ctx);
    const all = await this.active();
    const cycles = findCycles(all, org);
    return {
      cycles: cycles.map((c) => ({ ...c, kind: c.orgs.length > 2 ? 'multi' : 'direct', parties: [...new Set(c.legs.map((l) => l.offer.orgName))] })),
      oneWay: oneWayMatches(all, org),
      note: 'Suggestions from declared offers and needs. Values are as declared by each business — agree them with documents before proposing.',
    };
  }

  // ---------- deals ----------
  private async deal(ctx: RequestContext, id: string) {
    const [d] = await this.db.select().from(xchangeDeals).where(eq(xchangeDeals.id, id));
    if (!d) throw new NotFoundException('Exchange not found');
    const legs = await this.db.select().from(xchangeLegs).where(eq(xchangeLegs.dealId, id));
    const parties = [...new Set(legs.flatMap((l) => [l.fromOrgId, l.toOrgId]))];
    if (!platform(ctx) && !ctx.memberships.some((m) => parties.includes(m.organizationId))) throw new NotFoundException('Exchange not found');
    return { d, legs, parties };
  }

  @Post('xchange/deals')
  @HttpCode(201)
  async propose(@Ctx() ctx: RequestContext, @Body(body(XchangeDealSchema)) b: z.infer<typeof XchangeDealSchema>) {
    const org = await this.trader(ctx);
    if (!manager(ctx, org)) throw new ForbiddenException('Your company owner or admin proposes exchanges');
    const parties = [...new Set(b.legs.flatMap((l) => [l.fromOrgId, l.toOrgId]))];
    if (!parties.includes(org)) throw new BadRequestException('Your company must be a party to the exchange');
    for (const p of parties) if (!(await this.eligible(p))) throw new BadRequestException('Every party must be a verified business');
    for (const l of b.legs.filter((x) => x.listingId)) {
      const [li] = await this.db.select().from(xchangeListings).where(eq(xchangeListings.id, l.listingId!));
      if (!li || li.orgId !== l.fromOrgId || li.side !== 'offer' || li.status !== 'active') throw new BadRequestException('A listed offer is no longer available from that supplier');
    }
    const bal = isBalanced(b.legs);
    if (!bal.ok) throw new BadRequestException({ statusCode: 400, message: `The exchange does not balance — add part-cash or change values (tolerance ₹${Math.round(bal.tolerance / 100).toLocaleString('en-IN')})`, issues: [{ path: 'legs', message: 'Not balanced' }], balances: bal.balances });
    const key = termsKey(b.legs);
    const d = await this.db.transaction(async (tx) => {
      const [d] = await tx.insert(xchangeDeals).values({ code: `XD-${new Date().getFullYear()}-${randomDigits(5)}`, kind: dealKind(b.legs), termsKey: key, note: b.note ?? null, proposedByOrgId: org, proposedBy: ctx.userId }).returning();
      await tx.insert(xchangeLegs).values(b.legs.map((l) => ({ ...l, listingId: l.listingId ?? null, dealId: d.id })));
      await tx.insert(xchangeApprovals).values({ dealId: d.id, orgId: org, termsKey: key, approvedBy: ctx.userId });
      return d;
    });
    for (const p of parties.filter((x) => x !== org)) await this.notifyOrg(p, `Exchange proposed: ${d.code}`, `${b.legs.length} supplies · review and approve the terms.`, `/xchange/deals/${d.id}`);
    await this.audit.record(ctx, { action: 'xchange.proposed', objectType: 'xchange_deal', objectId: d.id, after: { kind: d.kind, legs: b.legs.length, parties: parties.length } });
    return this.view(ctx, d.id);
  }

  @Get('xchange/deals')
  async myDeals(@Ctx() ctx: RequestContext) {
    if (!ctx.orgId) return [];
    const ids = (await this.db.selectDistinct({ id: xchangeLegs.dealId }).from(xchangeLegs).where(or(eq(xchangeLegs.fromOrgId, ctx.orgId), eq(xchangeLegs.toOrgId, ctx.orgId)))).map((r) => r.id);
    if (!ids.length) return [];
    const ds = await this.db.select().from(xchangeDeals).where(inArray(xchangeDeals.id, ids)).orderBy(desc(xchangeDeals.createdAt));
    const legs = await this.db.select().from(xchangeLegs).where(inArray(xchangeLegs.dealId, ids));
    return ds.map((d) => ({ id: d.id, code: d.code, kind: d.kind, status: d.status, createdAt: d.createdAt, legs: legs.filter((l) => l.dealId === d.id).length, value: legs.filter((l) => l.dealId === d.id).reduce((a, l) => a + l.value, 0) }));
  }

  @Get('xchange/deals/:id')
  async one(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) { return this.view(ctx, id); }

  private async view(ctx: RequestContext, id: string) {
    const { d, legs, parties } = await this.deal(ctx, id);
    const orgs = await this.db.select({ id: organizations.id, name: organizations.displayName, gstin: sql<string | null>`(select gstin from partner_profiles p where p.organization_id = ${organizations.id})` }).from(organizations).where(inArray(organizations.id, parties));
    const name = (x: string) => orgs.find((o) => o.id === x)?.name ?? '—';
    const appr = await this.db.select().from(xchangeApprovals).where(eq(xchangeApprovals.dealId, id));
    const record = await this.db.select({ org: xchangeLegs.fromOrgId, st: xchangeLegs.status, n: sql<number>`count(*)::int` }).from(xchangeLegs).where(and(inArray(xchangeLegs.fromOrgId, parties), inArray(xchangeLegs.status, ['accepted', 'disputed']))).groupBy(xchangeLegs.fromOrgId, xchangeLegs.status);
    const bal = isBalanced(legs);
    return {
      id: d.id, code: d.code, kind: d.kind, status: d.status, note: d.note, createdAt: d.createdAt, agreedAt: d.agreedAt, completedAt: d.completedAt, proposedBy: name(d.proposedByOrgId),
      legs: legs.map((l) => ({ id: l.id, from: name(l.fromOrgId), fromOrgId: l.fromOrgId, to: name(l.toOrgId), toOrgId: l.toOrgId, description: l.description, value: l.value, cash: l.cash, status: l.status, deliveryNote: l.deliveryNote, deliveredAt: l.deliveredAt, acceptedAt: l.acceptedAt, disputeReason: l.disputeReason,
        invoice: { supplier: name(l.fromOrgId), supplierGstin: orgs.find((o) => o.id === l.fromOrgId)?.gstin ?? null, recipient: name(l.toOrgId), recipientGstin: orgs.find((o) => o.id === l.toOrgId)?.gstin ?? null, description: l.description, taxableValue: l.value, cashConsideration: l.cash, nonCashConsideration: l.value - l.cash } })),
      parties: parties.map((p) => ({ orgId: p, name: name(p), approved: appr.some((a) => a.orgId === p && a.termsKey === d.termsKey), mine: ctx.memberships.some((m) => m.organizationId === p), completed: record.find((r) => r.org === p && r.st === 'accepted')?.n ?? 0, disputed: record.find((r) => r.org === p && r.st === 'disputed')?.n ?? 0 })),
      balances: bal.balances.map((x) => ({ ...x, name: name(x.orgId) })), balanced: bal.ok,
      taxNote: legInvoiceNote,
      canApprove: d.status === 'proposed' && parties.some((p) => manager(ctx, p) && !appr.some((a) => a.orgId === p && a.termsKey === d.termsKey)),
    };
  }

  @Post('xchange/deals/:id/approve')
  @HttpCode(200)
  async approve(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { d, parties } = await this.deal(ctx, id);
    if (d.status !== 'proposed') throw new ConflictException('This exchange is not waiting for approval');
    const org = parties.find((p) => manager(ctx, p));
    if (!org) throw new ForbiddenException('Your company owner or admin approves exchanges');
    await this.db.insert(xchangeApprovals).values({ dealId: id, orgId: org, termsKey: d.termsKey, approvedBy: ctx.userId }).onConflictDoUpdate({ target: [xchangeApprovals.dealId, xchangeApprovals.orgId], set: { termsKey: d.termsKey, approvedBy: ctx.userId, approvedAt: new Date() } });
    const appr = await this.db.select().from(xchangeApprovals).where(and(eq(xchangeApprovals.dealId, id), eq(xchangeApprovals.termsKey, d.termsKey)));
    if (parties.every((p) => appr.some((a) => a.orgId === p))) {
      await this.db.update(xchangeDeals).set({ status: 'agreed', agreedAt: new Date(), updatedAt: new Date() }).where(eq(xchangeDeals.id, id));
      for (const p of parties) await this.notifyOrg(p, `Exchange ${d.code} agreed`, 'All parties approved. Deliver your supplies and confirm what you receive.', `/xchange/deals/${id}`);
    }
    await this.audit.record(ctx, { action: 'xchange.approved', objectType: 'xchange_deal', objectId: id, after: { orgId: org, termsKey: d.termsKey } });
    return this.view(ctx, id);
  }

  @Post('xchange/deals/:id/cancel')
  @HttpCode(200)
  async cancel(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { d, parties } = await this.deal(ctx, id);
    if (d.status !== 'proposed') throw new ConflictException('Only an exchange waiting for approval can be withdrawn; after agreement, raise a dispute');
    if (!parties.some((p) => manager(ctx, p))) throw new ForbiddenException('Your company owner or admin can withdraw');
    await this.db.update(xchangeDeals).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(xchangeDeals.id, id));
    await this.audit.record(ctx, { action: 'xchange.cancelled', objectType: 'xchange_deal', objectId: id });
    return { status: 'cancelled' };
  }

  private async leg(ctx: RequestContext, id: string) {
    const [l] = await this.db.select().from(xchangeLegs).where(eq(xchangeLegs.id, id));
    if (!l) throw new NotFoundException('Supply not found');
    const { d } = await this.deal(ctx, l.dealId);
    return { l, d };
  }

  @Post('xchange/legs/:id/deliver')
  @HttpCode(200)
  async deliver(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ note: z.string().trim().min(5, { message: 'Say what was delivered (challan, LR, completion note…)' }).max(1000) }))) b: { note: string }) {
    const { l, d } = await this.leg(ctx, id);
    if (!ctx.memberships.some((m) => m.organizationId === l.fromOrgId)) throw new ForbiddenException('Only the supplier marks a supply delivered');
    if (!['agreed', 'disputed'].includes(d.status) || !['pending', 'disputed'].includes(l.status)) throw new ConflictException('This supply cannot be marked delivered now');
    await this.db.update(xchangeLegs).set({ status: 'delivered', deliveryNote: b.note, deliveredAt: new Date(), disputeReason: null }).where(eq(xchangeLegs.id, id));
    // A redelivery that resolves the only dispute puts the exchange back on track.
    if (d.status === 'disputed' && !(await this.db.select({ id: xchangeLegs.id }).from(xchangeLegs).where(and(eq(xchangeLegs.dealId, d.id), eq(xchangeLegs.status, 'disputed')))).length) await this.db.update(xchangeDeals).set({ status: 'agreed', updatedAt: new Date() }).where(eq(xchangeDeals.id, d.id));
    await this.notifyOrg(l.toOrgId, `Delivered under ${d.code}`, `${l.description} — please check and accept.`, `/xchange/deals/${d.id}`);
    await this.audit.record(ctx, { action: 'xchange.delivered', objectType: 'xchange_leg', objectId: id, after: b });
    return this.view(ctx, d.id);
  }

  @Post('xchange/legs/:id/:decision')
  @HttpCode(200)
  async receive(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('decision') decision: string, @Body() raw: { reason?: string }) {
    if (!['accept', 'dispute'].includes(decision)) throw new NotFoundException();
    const { l, d } = await this.leg(ctx, id);
    if (!ctx.memberships.some((m) => m.organizationId === l.toOrgId)) throw new ForbiddenException('Only the receiver accepts or disputes a supply');
    if (l.status !== 'delivered') throw new ConflictException('Wait until the supplier marks it delivered');
    if (decision === 'dispute') {
      const reason = String(raw?.reason ?? '').trim();
      if (reason.length < 10) throw new BadRequestException({ statusCode: 400, message: 'Explain the problem (at least 10 characters)', issues: [{ path: 'reason', message: 'Explain the problem' }] });
      await this.db.update(xchangeLegs).set({ status: 'disputed', disputeReason: reason.slice(0, 1000) }).where(eq(xchangeLegs.id, id));
      await this.db.update(xchangeDeals).set({ status: 'disputed', updatedAt: new Date() }).where(eq(xchangeDeals.id, d.id));
      await this.notifyOrg(l.fromOrgId, `Supply disputed under ${d.code}`, reason.slice(0, 200), `/xchange/deals/${d.id}`);
      const admins = await this.db.selectDistinct({ u: memberships.userId }).from(memberships).where(and(inArray(memberships.role, ['unite_admin', 'super_admin']), eq(memberships.status, 'active')));
      if (admins.length) await this.db.insert(notifications).values(admins.map((a) => ({ userId: a.u, kind: 'announcement', title: `XCHANGE dispute: ${d.code}`, body: reason.slice(0, 200), link: '/workspace/xchange' })));
    } else {
      await this.db.update(xchangeLegs).set({ status: 'accepted', acceptedAt: new Date() }).where(eq(xchangeLegs.id, id));
      const rest = await this.db.select({ s: xchangeLegs.status }).from(xchangeLegs).where(eq(xchangeLegs.dealId, d.id));
      if (rest.every((x) => x.s === 'accepted')) {
        await this.db.update(xchangeDeals).set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() }).where(eq(xchangeDeals.id, d.id));
        const used = (await this.db.select({ id: xchangeLegs.listingId }).from(xchangeLegs).where(eq(xchangeLegs.dealId, d.id))).map((x) => x.id).filter(Boolean) as string[];
        if (used.length) await this.db.update(xchangeListings).set({ status: 'closed', updatedAt: new Date() }).where(inArray(xchangeListings.id, used));
      } else if (d.status === 'disputed' && !rest.some((x) => x.s === 'disputed')) await this.db.update(xchangeDeals).set({ status: 'agreed', updatedAt: new Date() }).where(eq(xchangeDeals.id, d.id));
    }
    await this.audit.record(ctx, { action: `xchange.${decision === 'accept' ? 'accepted' : 'disputed'}`, objectType: 'xchange_leg', objectId: id });
    return this.view(ctx, d.id);
  }

  @Get('admin/xchange')
  async admin(@Ctx() ctx: RequestContext) {
    if (!platform(ctx)) throw new ForbiddenException('For Unite admins');
    const listings = await this.db.select({ side: xchangeListings.side, status: xchangeListings.status, n: sql<number>`count(*)::int`, v: sql<number>`coalesce(sum(${xchangeListings.value}), 0)::bigint` }).from(xchangeListings).groupBy(xchangeListings.side, xchangeListings.status);
    const deals = await this.db.select().from(xchangeDeals).orderBy(desc(xchangeDeals.createdAt)).limit(200);
    const legs = deals.length ? await this.db.select({ l: xchangeLegs, from: organizations.displayName }).from(xchangeLegs).innerJoin(organizations, eq(organizations.id, xchangeLegs.fromOrgId)).where(inArray(xchangeLegs.dealId, deals.map((d) => d.id))) : [];
    const n = (s: string, st = 'active') => listings.filter((x) => x.side === s && x.status === st).reduce((a, x) => a + x.n, 0);
    return {
      totals: { offers: n('offer'), needs: n('need'), offerValue: Number(listings.filter((x) => x.side === 'offer' && x.status === 'active').reduce((a, x) => a + Number(x.v), 0)), deals: deals.length, completed: deals.filter((d) => d.status === 'completed').length, disputed: deals.filter((d) => d.status === 'disputed').length,
        exchanged: legs.filter((x) => deals.find((d) => d.id === x.l.dealId)?.status === 'completed').reduce((a, x) => a + x.l.value, 0) },
      deals: deals.map((d: Deal) => ({ id: d.id, code: d.code, kind: d.kind, status: d.status, createdAt: d.createdAt, parties: [...new Set(legs.filter((x) => x.l.dealId === d.id).map((x) => x.from))], value: legs.filter((x) => x.l.dealId === d.id).reduce((a, x) => a + x.l.value, 0), disputes: legs.filter((x) => x.l.dealId === d.id && x.l.status === 'disputed').map((x) => x.l.disputeReason) })),
    };
  }
}

@Module({ controllers: [XchangeController] })
export class XchangeModule {}
