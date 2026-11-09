/**
 * Franchise Management — Unite brands (e.g. Unite Solar) franchised to verified partners.
 *
 * Rules (tested in test/franchise-property.e2e.ts):
 *  - Only owners/admins of verified partner companies apply, only to brands open to franchising, one active
 *    application per brand and city.
 *  - Unite admins move a unit through applied → approved → agreement signed → setting up → live (→ suspended/closed);
 *    fee, royalty and monthly target are set on approval. A unit goes live only when every checklist item is done.
 *  - Live franchisees report monthly sales once per month (no future months); royalty is calculated from the agreed rate.
 *  - Franchisees see only their own units.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { FRANCHISE_CHECKLIST, FRANCHISE_NEXT, FranchiseApplySchema, FranchiseDecisionSchema, FranchiseReportSchema } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { franchiseReports, franchiseUnits, groupCompanies, memberships, notifications, organizations } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomDigits } from '../../common/crypto';

const PARTNER = ['partner_company', 'partner_individual'];
const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const thisMonth = () => new Date().toISOString().slice(0, 7);

@Injectable()
export class FranchiseService {
  constructor(@InjectDb() private db: Db) {}
  async unit(id: string) {
    const [u] = await this.db.select().from(franchiseUnits).where(eq(franchiseUnits.id, id)).limit(1);
    if (!u) throw new NotFoundException('Franchise not found');
    return u;
  }
  async view(ids?: string[]) {
    const brand = sql<string>`(select display_name from organizations o where o.id = ${franchiseUnits.brandOrgId})`;
    const rows = await this.db.select({ u: franchiseUnits, brand, franchisee: organizations.displayName }).from(franchiseUnits).innerJoin(organizations, eq(organizations.id, franchiseUnits.franchiseeOrgId))
      .where(ids ? inArray(franchiseUnits.id, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']) : undefined).orderBy(desc(franchiseUnits.updatedAt));
    const reports = rows.length ? await this.db.select().from(franchiseReports).where(inArray(franchiseReports.unitId, rows.map((r) => r.u.id))).orderBy(desc(franchiseReports.month)) : [];
    return rows.map(({ u, brand, franchisee }) => {
      const reps = reports.filter((r) => r.unitId === u.id);
      const done = u.checklist as Record<string, string>;
      return {
        id: u.id, code: u.code, brand, franchisee, franchiseeOrgId: u.franchiseeOrgId, brandOrgId: u.brandOrgId, format: u.format, city: u.city, region: u.region, message: u.message, status: u.status,
        fee: u.fee, royaltyBps: u.royaltyBps, monthlyTarget: u.monthlyTarget, decisionNote: u.decisionNote, openedAt: u.openedAt, createdAt: u.createdAt, next: FRANCHISE_NEXT[u.status] ?? [],
        checklist: FRANCHISE_CHECKLIST.map(([key, label]) => ({ key, label, doneAt: done[key] ?? null })),
        reports: reps.map((r) => ({ month: r.month, sales: r.sales, orders: r.orders, royalty: r.royalty, notes: r.notes })),
        salesThisMonth: reps.find((r) => r.month === thisMonth())?.sales ?? 0, royaltyTotal: reps.reduce((a, r) => a + r.royalty, 0), salesTotal: reps.reduce((a, r) => a + r.sales, 0),
      };
    });
  }
}

@ApiTags('franchise')
@Controller()
export class FranchiseController {
  constructor(@InjectDb() private db: Db, private svc: FranchiseService, private audit: AuditService) {}

  private async partnerOrg(ctx: RequestContext) {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId!)).limit(1);
    if (!org || !PARTNER.includes(org.type) || org.verificationStatus !== 'verified') throw new ForbiddenException('Only verified partners can run a Unite franchise');
    if (!ctx.orgRoles.some((r) => r === 'org_owner' || r === 'org_admin')) throw new ForbiddenException('Ask your company owner or admin to do this');
    return org;
  }

  // ---------- partner ----------
  @Get('franchise/brands')
  @RequireOrg()
  async brands() {
    return this.db.select({ id: organizations.id, name: organizations.displayName, description: groupCompanies.description }).from(groupCompanies).innerJoin(organizations, eq(organizations.id, groupCompanies.organizationId))
      .where(and(eq(groupCompanies.franchiseOpen, true), eq(groupCompanies.status, 'active'))).orderBy(organizations.displayName);
  }

  @Get('franchise/mine')
  @RequireOrg()
  async mine(@Ctx() ctx: RequestContext) {
    const ids = (await this.db.select({ id: franchiseUnits.id }).from(franchiseUnits).where(eq(franchiseUnits.franchiseeOrgId, ctx.orgId!))).map((r) => r.id);
    return this.svc.view(ids);
  }

  @Post('franchise/applications')
  @RequireOrg()
  @HttpCode(201)
  async apply(@Ctx() ctx: RequestContext, @Body(body(FranchiseApplySchema)) b: z.infer<typeof FranchiseApplySchema>) {
    const org = await this.partnerOrg(ctx);
    const [brand] = await this.db.select({ open: groupCompanies.franchiseOpen, name: organizations.displayName }).from(groupCompanies).innerJoin(organizations, eq(organizations.id, groupCompanies.organizationId)).where(eq(groupCompanies.organizationId, b.brandOrgId)).limit(1);
    if (!brand?.open) throw new ConflictException('This Unite brand is not taking franchise applications');
    const [dup] = await this.db.select({ id: franchiseUnits.id }).from(franchiseUnits).where(and(eq(franchiseUnits.franchiseeOrgId, org.id), eq(franchiseUnits.brandOrgId, b.brandOrgId), sql`lower(${franchiseUnits.city}) = ${b.city.toLowerCase()}`, sql`${franchiseUnits.status} not in ('rejected', 'closed')`)).limit(1);
    if (dup) throw new ConflictException(`You already have a ${brand.name} franchise or application in ${b.city}`);
    const [u] = await this.db.insert(franchiseUnits).values({ ...b, franchiseeOrgId: org.id, code: `FR-${new Date().getFullYear()}-${randomDigits(5)}`, appliedBy: ctx.userId }).returning();
    const admins = await this.db.selectDistinct({ u: memberships.userId }).from(memberships).where(and(inArray(memberships.role, ['unite_admin', 'super_admin']), eq(memberships.status, 'active')));
    if (admins.length) await this.db.insert(notifications).values(admins.map((a) => ({ userId: a.u, kind: 'announcement', title: `New franchise application: ${brand.name} in ${b.city}`, body: `${org.displayName} applied for a ${brand.name} franchise.`, link: `/workspace/franchise/${u.id}` })));
    await this.audit.record(ctx, { action: 'franchise.applied', objectType: 'franchise_unit', objectId: u.id, after: { brand: brand.name, city: b.city } });
    return (await this.svc.view([u.id]))[0];
  }

  @Post('franchise/:id/reports')
  @RequireOrg()
  @HttpCode(201)
  async report(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(FranchiseReportSchema)) b: z.infer<typeof FranchiseReportSchema>) {
    await this.partnerOrg(ctx);
    const u = await this.svc.unit(id);
    if (u.franchiseeOrgId !== ctx.orgId) throw new NotFoundException('Franchise not found');
    if (u.status !== 'live') throw new ConflictException('Sales are reported once the franchise is live');
    if (b.month > thisMonth()) throw new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: [{ path: 'month', message: 'You cannot report a future month' }] });
    const royalty = Math.round((b.sales * (u.royaltyBps ?? 0)) / 10000);
    const [r] = await this.db.insert(franchiseReports).values({ unitId: id, month: b.month, sales: b.sales, orders: b.orders, notes: b.notes, royalty, submittedBy: ctx.userId }).onConflictDoNothing().returning();
    if (!r) throw new ConflictException(`Sales for ${b.month} were already reported. Contact Unite to correct them.`);
    await this.audit.record(ctx, { action: 'franchise.sales_reported', objectType: 'franchise_unit', objectId: id, after: { month: b.month, sales: b.sales, royalty } });
    return { month: r.month, sales: r.sales, royalty: r.royalty };
  }

  // ---------- Unite admin ----------
  @Get('admin/franchise')
  async network(@Ctx() ctx: RequestContext) {
    if (!staff(ctx)) throw new ForbiddenException('Franchise management is for Unite admins');
    const units = await this.svc.view();
    const brands = await this.db.select({ id: organizations.id, name: organizations.displayName, open: groupCompanies.franchiseOpen }).from(groupCompanies).innerJoin(organizations, eq(organizations.id, groupCompanies.organizationId)).orderBy(organizations.displayName);
    const count = (st: string[]) => units.filter((u) => st.includes(u.status)).length;
    return {
      totals: { live: count(['live']), pipeline: count(['applied', 'approved', 'agreement_signed', 'setup']), applied: count(['applied']), suspended: count(['suspended']),
        salesThisMonth: units.reduce((a, u) => a + u.salesThisMonth, 0), royaltyTotal: units.reduce((a, u) => a + u.royaltyTotal, 0), cities: new Set(units.filter((u) => u.status === 'live').map((u) => u.city)).size },
      brands, units,
    };
  }

  @Get('admin/franchise/:id')
  async detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    if (!staff(ctx)) throw new ForbiddenException('Franchise management is for Unite admins');
    await this.svc.unit(id);
    return (await this.svc.view([id]))[0];
  }

  @Post('admin/franchise/:id/status')
  @HttpCode(200)
  async status(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(FranchiseDecisionSchema)) b: z.infer<typeof FranchiseDecisionSchema>) {
    if (!staff(ctx)) throw new ForbiddenException('Franchise management is for Unite admins');
    const u = await this.svc.unit(id);
    if (!(FRANCHISE_NEXT[u.status] ?? []).includes(b.status)) throw new ConflictException(`A franchise that is "${u.status}" cannot become "${b.status}"`);
    if (b.status === 'approved' && (b.fee === undefined || b.royaltyBps === undefined)) throw new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: [{ path: 'royaltyBps', message: 'Set the franchise fee and royalty when approving' }] });
    if (b.status === 'live') {
      const missing = FRANCHISE_CHECKLIST.filter(([k]) => !(u.checklist as Record<string, string>)[k]).map(([, l]) => l);
      if (missing.length) throw new ConflictException(`Finish the setup checklist first: ${missing.join(', ')}`);
    }
    await this.db.update(franchiseUnits).set({
      status: b.status, decisionNote: b.note ?? u.decisionNote, decidedBy: ctx.userId, updatedAt: new Date(),
      ...(b.fee !== undefined ? { fee: b.fee } : {}), ...(b.royaltyBps !== undefined ? { royaltyBps: b.royaltyBps } : {}), ...(b.monthlyTarget !== undefined ? { monthlyTarget: b.monthlyTarget } : {}),
      ...(b.status === 'live' && !u.openedAt ? { openedAt: new Date() } : {}),
    }).where(eq(franchiseUnits.id, id));
    const people = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, u.franchiseeOrgId), eq(memberships.status, 'active')));
    if (people.length) await this.db.insert(notifications).values(people.map((p) => ({ userId: p.u, kind: 'announcement', title: `Franchise ${u.code}: ${b.status.replace(/_/g, ' ')}`, body: b.note ?? null, link: '/franchise' })));
    await this.audit.record(ctx, { action: 'franchise.status', objectType: 'franchise_unit', objectId: id, before: { status: u.status }, after: { status: b.status, fee: b.fee, royaltyBps: b.royaltyBps } });
    return (await this.svc.view([id]))[0];
  }

  @Post('admin/franchise/:id/checklist')
  @HttpCode(200)
  async check(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ key: z.enum(FRANCHISE_CHECKLIST.map(([k]) => k) as [string, ...string[]]), done: z.boolean() }))) b: { key: string; done: boolean }) {
    if (!staff(ctx)) throw new ForbiddenException('Franchise management is for Unite admins');
    const u = await this.svc.unit(id);
    if (['applied', 'rejected', 'closed'].includes(u.status)) throw new ConflictException('The checklist starts once the franchise is approved');
    const list = { ...(u.checklist as Record<string, string>) };
    if (b.done) list[b.key] = new Date().toISOString(); else delete list[b.key];
    await this.db.update(franchiseUnits).set({ checklist: list, updatedAt: new Date() }).where(eq(franchiseUnits.id, id));
    return (await this.svc.view([id]))[0];
  }

  @Patch('admin/franchise/brands/:orgId')
  async brand(@Ctx() ctx: RequestContext, @Param('orgId', ParseUUIDPipe) orgId: string, @Body(body(z.object({ open: z.boolean() }))) b: { open: boolean }) {
    if (!staff(ctx)) throw new ForbiddenException('Franchise management is for Unite admins');
    const [g] = await this.db.update(groupCompanies).set({ franchiseOpen: b.open, updatedAt: new Date() }).where(eq(groupCompanies.organizationId, orgId)).returning();
    if (!g) throw new NotFoundException('Group company not found');
    await this.audit.record(ctx, { action: 'franchise.brand_open', objectType: 'group_company', objectId: orgId, after: b });
    return { open: g.franchiseOpen };
  }
}

@Module({ controllers: [FranchiseController], providers: [FranchiseService] })
export class FranchiseModule {}
