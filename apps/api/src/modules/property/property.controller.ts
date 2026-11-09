/**
 * Real Estate & Property — Unite projects (industrial parks, residential, commercial, plots) sold through channel partners.
 *
 * Rules (tested in test/franchise-property.e2e.ts):
 *  - Residential, commercial and plotted projects need a RERA registration number before they can be opened to partners;
 *    partners holding units in such projects must give their RERA agent registration number.
 *  - Verified partners hold an available unit for a buyer for 48 hours, with the buyer's consent recorded; at most 5 holds
 *    per partner per project. Expired holds are released automatically. Partners see their own buyers only.
 *  - Unite admins create projects and units, open projects to partners, and mark units booked or sold (sale shows the
 *    holding partner's commission estimate at the project's rate).
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PROPERTY_HOLD_HOURS, PROPERTY_MAX_HOLDS, PropertyHoldSchema, PropertyProjectSchema, PropertyUnitsSchema, RERA_REQUIRED_KINDS } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { groupCompanies, organizations, propertyProjects, propertyUnits } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomDigits } from '../../common/crypto';

const PARTNER = ['partner_company', 'partner_individual'];
const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
type Project = typeof propertyProjects.$inferSelect;
type Unit = typeof propertyUnits.$inferSelect;

@Injectable()
export class PropertyService {
  constructor(@InjectDb() private db: Db) {}
  /** Releases holds whose 48 hours have passed. */
  async releaseExpired(projectId?: string) {
    await this.db.update(propertyUnits).set({ status: 'available', heldByOrgId: null, heldByUserId: null, heldUntil: null, buyerName: null, buyerCity: null, consentMethod: null, agentRera: null, updatedAt: new Date() })
      .where(and(eq(propertyUnits.status, 'held'), lt(propertyUnits.heldUntil, new Date()), projectId ? eq(propertyUnits.projectId, projectId) : undefined));
  }
  async project(id: string) {
    const [p] = await this.db.select().from(propertyProjects).where(eq(propertyProjects.id, id)).limit(1);
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }
  counts(units: Unit[]) {
    const n = (s: string) => units.filter((u) => u.status === s).length;
    return { units: units.length, available: n('available'), held: n('held'), booked: n('booked'), sold: n('sold'), soldValue: units.filter((u) => u.status === 'sold' || u.status === 'booked').reduce((a, u) => a + u.price, 0), availableValue: units.filter((u) => u.status === 'available').reduce((a, u) => a + u.price, 0) };
  }
  summary(p: Project, owner: string | null, units: Unit[]) {
    return { id: p.id, code: p.code, name: p.name, kind: p.kind, city: p.city, region: p.region, description: p.description, reraNumber: p.reraNumber, commissionBps: p.commissionBps, openToPartners: p.openToPartners, status: p.status, owner, ...this.counts(units) };
  }
}

@ApiTags('property')
@Controller()
export class PropertyController {
  constructor(@InjectDb() private db: Db, private svc: PropertyService, private audit: AuditService) {}

  private async partnerOrg(ctx: RequestContext) {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId!)).limit(1);
    if (!org || !PARTNER.includes(org.type) || org.verificationStatus !== 'verified') throw new ForbiddenException('Only verified partners can sell Unite properties');
    return org;
  }

  // ---------- partner ----------
  @Get('property/projects')
  @RequireOrg()
  async projects() {
    await this.svc.releaseExpired();
    const ps = await this.db.select({ p: propertyProjects, owner: organizations.displayName }).from(propertyProjects).innerJoin(organizations, eq(organizations.id, propertyProjects.ownerOrgId))
      .where(and(eq(propertyProjects.openToPartners, true), eq(propertyProjects.status, 'selling'))).orderBy(asc(propertyProjects.name));
    const units = ps.length ? await this.db.select().from(propertyUnits).where(inArray(propertyUnits.projectId, ps.map((x) => x.p.id))) : [];
    return ps.map(({ p, owner }) => this.svc.summary(p, owner, units.filter((u) => u.projectId === p.id)));
  }

  @Get('property/projects/:id')
  @RequireOrg()
  async project(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const p = await this.svc.project(id);
    if (!p.openToPartners) throw new NotFoundException('Project not found');
    await this.svc.releaseExpired(id);
    const [owner] = await this.db.select({ n: organizations.displayName }).from(organizations).where(eq(organizations.id, p.ownerOrgId));
    const units = await this.db.select().from(propertyUnits).where(eq(propertyUnits.projectId, id)).orderBy(asc(propertyUnits.unitNo));
    return {
      ...this.svc.summary(p, owner?.n ?? null, units),
      units: units.filter((u) => u.status !== 'blocked').map((u) => {
        const mine = u.heldByOrgId === ctx.orgId;
        return { id: u.id, unitNo: u.unitNo, unitType: u.unitType, areaSqft: u.areaSqft, price: u.price, status: u.status, mine, heldUntil: mine ? u.heldUntil : null, buyerName: mine ? u.buyerName : null, commission: Math.round((u.price * p.commissionBps) / 10000) };
      }),
    };
  }

  @Post('property/units/:id/hold')
  @RequireOrg()
  @HttpCode(200)
  async hold(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(PropertyHoldSchema)) b: z.infer<typeof PropertyHoldSchema>) {
    const org = await this.partnerOrg(ctx);
    const [u] = await this.db.select().from(propertyUnits).where(eq(propertyUnits.id, id)).limit(1);
    if (!u) throw new NotFoundException('Unit not found');
    const p = await this.svc.project(u.projectId);
    if (!p.openToPartners || p.status !== 'selling') throw new NotFoundException('Unit not found');
    if (RERA_REQUIRED_KINDS.has(p.kind) && !b.agentRera) throw new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: [{ path: 'agentRera', message: 'This is a RERA-registered project: enter your RERA agent registration number' }] });
    await this.svc.releaseExpired(p.id);
    const [mine] = await this.db.select({ n: sql<number>`count(*)::int` }).from(propertyUnits).where(and(eq(propertyUnits.projectId, p.id), eq(propertyUnits.status, 'held'), eq(propertyUnits.heldByOrgId, org.id)));
    if (mine.n >= PROPERTY_MAX_HOLDS) throw new ConflictException(`You already hold ${PROPERTY_MAX_HOLDS} units in this project. Release one first.`);
    const until = new Date(Date.now() + PROPERTY_HOLD_HOURS * 3600_000);
    const [held] = await this.db.update(propertyUnits).set({ status: 'held', heldByOrgId: org.id, heldByUserId: ctx.userId, heldUntil: until, buyerName: b.buyerName, buyerCity: b.buyerCity, consentMethod: b.consentMethod, agentRera: b.agentRera ?? null, updatedAt: new Date() })
      .where(and(eq(propertyUnits.id, id), eq(propertyUnits.status, 'available'))).returning();
    if (!held) throw new ConflictException('This unit is no longer available');
    await this.audit.record(ctx, { action: 'property.unit_held', objectType: 'property_unit', objectId: id, after: { project: p.code, unit: u.unitNo, until } });
    return { id, status: 'held', heldUntil: until };
  }

  @Post('property/units/:id/release')
  @RequireOrg()
  @HttpCode(200)
  async release(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [u] = await this.db.update(propertyUnits).set({ status: 'available', heldByOrgId: null, heldByUserId: null, heldUntil: null, buyerName: null, buyerCity: null, consentMethod: null, agentRera: null, updatedAt: new Date() })
      .where(and(eq(propertyUnits.id, id), eq(propertyUnits.status, 'held'), eq(propertyUnits.heldByOrgId, ctx.orgId!))).returning();
    if (!u) throw new NotFoundException('You do not hold this unit');
    await this.audit.record(ctx, { action: 'property.unit_released', objectType: 'property_unit', objectId: id });
    return { id, status: 'available' };
  }

  @Get('property/holds')
  @RequireOrg()
  async holds(@Ctx() ctx: RequestContext) {
    await this.svc.releaseExpired();
    const rows = await this.db.select({ u: propertyUnits, p: propertyProjects }).from(propertyUnits).innerJoin(propertyProjects, eq(propertyProjects.id, propertyUnits.projectId))
      .where(and(eq(propertyUnits.heldByOrgId, ctx.orgId!), inArray(propertyUnits.status, ['held', 'booked', 'sold']))).orderBy(desc(propertyUnits.updatedAt));
    return rows.map(({ u, p }) => ({ id: u.id, project: p.name, projectId: p.id, unitNo: u.unitNo, unitType: u.unitType, price: u.price, status: u.status, heldUntil: u.heldUntil, buyerName: u.buyerName, commission: Math.round((u.price * p.commissionBps) / 10000) }));
  }

  // ---------- Unite admin ----------
  @Get('admin/property')
  async list(@Ctx() ctx: RequestContext) {
    if (!staff(ctx)) throw new ForbiddenException('Real estate is for Unite admins');
    await this.svc.releaseExpired();
    const ps = await this.db.select({ p: propertyProjects, owner: organizations.displayName }).from(propertyProjects).innerJoin(organizations, eq(organizations.id, propertyProjects.ownerOrgId)).orderBy(asc(propertyProjects.name));
    const units = ps.length ? await this.db.select().from(propertyUnits).where(inArray(propertyUnits.projectId, ps.map((x) => x.p.id))) : [];
    const owners = await this.db.select({ id: organizations.id, name: organizations.displayName }).from(groupCompanies).innerJoin(organizations, eq(organizations.id, groupCompanies.organizationId)).orderBy(organizations.displayName);
    return { projects: ps.map(({ p, owner }) => this.svc.summary(p, owner, units.filter((u) => u.projectId === p.id))), totals: this.svc.counts(units), owners };
  }

  @Post('admin/property/projects')
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(PropertyProjectSchema)) b: z.infer<typeof PropertyProjectSchema>) {
    if (!staff(ctx)) throw new ForbiddenException('Real estate is for Unite admins');
    const [g] = await this.db.select().from(groupCompanies).where(eq(groupCompanies.organizationId, b.ownerOrgId)).limit(1);
    if (!g) throw new BadRequestException('Choose a Unite Group company as the developer');
    const [p] = await this.db.insert(propertyProjects).values({ ...b, reraNumber: b.reraNumber ?? null, code: `PRJ-${randomDigits(5)}`, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'property.project_created', objectType: 'property_project', objectId: p.id, after: { name: p.name, kind: p.kind } });
    return p;
  }

  @Patch('admin/property/projects/:id')
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ openToPartners: z.boolean().optional(), reraNumber: z.string().trim().max(60).nullable().optional(), commissionBps: z.number().int().min(0).max(1000).optional(), status: z.enum(['planning', 'selling', 'sold_out', 'closed']).optional() }))) b: Partial<Project>) {
    if (!staff(ctx)) throw new ForbiddenException('Real estate is for Unite admins');
    const p = await this.svc.project(id);
    const next = { ...p, ...b };
    if (next.openToPartners && RERA_REQUIRED_KINDS.has(p.kind) && !next.reraNumber) throw new ConflictException('Add the project’s RERA registration number before opening it to partners');
    const [u] = await this.db.update(propertyProjects).set({ ...b, updatedAt: new Date() }).where(eq(propertyProjects.id, id)).returning();
    await this.audit.record(ctx, { action: 'property.project_updated', objectType: 'property_project', objectId: id, after: b });
    return u;
  }

  @Post('admin/property/projects/:id/units')
  @HttpCode(200)
  async addUnits(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(PropertyUnitsSchema)) b: z.infer<typeof PropertyUnitsSchema>) {
    if (!staff(ctx)) throw new ForbiddenException('Real estate is for Unite admins');
    await this.svc.project(id);
    const r = await this.db.insert(propertyUnits).values(b.units.map((x) => ({ ...x, projectId: id }))).onConflictDoNothing().returning({ id: propertyUnits.id });
    await this.audit.record(ctx, { action: 'property.units_added', objectType: 'property_project', objectId: id, after: { added: r.length } });
    return { added: r.length, skipped: b.units.length - r.length };
  }

  @Get('admin/property/projects/:id')
  async adminProject(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    if (!staff(ctx)) throw new ForbiddenException('Real estate is for Unite admins');
    const p = await this.svc.project(id);
    await this.svc.releaseExpired(id);
    const [owner] = await this.db.select({ n: organizations.displayName }).from(organizations).where(eq(organizations.id, p.ownerOrgId));
    const units = await this.db.select({ u: propertyUnits, partner: organizations.displayName }).from(propertyUnits).leftJoin(organizations, eq(organizations.id, propertyUnits.heldByOrgId)).where(eq(propertyUnits.projectId, id)).orderBy(asc(propertyUnits.unitNo));
    return { ...this.svc.summary(p, owner?.n ?? null, units.map((x) => x.u)), units: units.map(({ u, partner }) => ({ ...u, partner, commission: u.heldByOrgId ? Math.round((u.price * p.commissionBps) / 10000) : null })) };
  }

  @Post('admin/property/units/:id/status')
  @HttpCode(200)
  async unitStatus(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ status: z.enum(['available', 'booked', 'sold', 'blocked']), buyerName: z.string().trim().min(2).max(120).optional() }))) b: { status: string; buyerName?: string }) {
    if (!staff(ctx)) throw new ForbiddenException('Real estate is for Unite admins');
    const [u] = await this.db.select().from(propertyUnits).where(eq(propertyUnits.id, id)).limit(1);
    if (!u) throw new NotFoundException('Unit not found');
    if (u.status === 'sold' && b.status !== 'sold') throw new ConflictException('A sold unit cannot be changed here');
    if ((b.status === 'booked' || b.status === 'sold') && !(b.buyerName ?? u.buyerName)) throw new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: [{ path: 'buyerName', message: 'Enter the buyer’s name' }] });
    const clear = b.status === 'available' || b.status === 'blocked';
    await this.db.update(propertyUnits).set({
      status: b.status, updatedAt: new Date(), ...(b.buyerName ? { buyerName: b.buyerName } : {}),
      ...(clear ? { heldByOrgId: null, heldByUserId: null, heldUntil: null, buyerName: null, buyerCity: null, consentMethod: null, agentRera: null } : { heldUntil: null }),
      ...(b.status === 'booked' ? { bookedAt: new Date() } : {}), ...(b.status === 'sold' ? { soldAt: new Date(), bookedAt: u.bookedAt ?? new Date() } : {}),
    }).where(eq(propertyUnits.id, id));
    await this.audit.record(ctx, { action: 'property.unit_status', objectType: 'property_unit', objectId: id, before: { status: u.status }, after: { status: b.status } });
    return { id, status: b.status };
  }
}

@Module({ controllers: [PropertyController], providers: [PropertyService] })
export class PropertyModule {}
