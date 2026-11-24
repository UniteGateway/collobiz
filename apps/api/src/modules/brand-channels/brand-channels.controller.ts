/**
 * UNITE BRAND PRODUCTS & CHANNEL PARTNERS (tested in test/brand-channels.e2e.ts).
 *
 *  - Anyone can ask the matching agent which Unite product and role fits them, and apply as distributor, dealer, store,
 *    franchise or (where Unite is looking) manufacturer. The agent is rules-based and every suggestion carries its reasons.
 *  - Applications are linked to a COLLABIZ business account when the applicant signs in with the same email. Only Unite
 *    admins shortlist, approve (with a territory) or decline (with a reason); approval needs a linked business account.
 *  - Approved partners get a dealer dashboard: a sales CRM per product (customers and deals in the COLLABIZ CRM, tagged
 *    with the product). They see only their own leads.
 *  - OEM manufacturer names stay internal until a super admin marks them public.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  BrandProductSchema, BrandProductUpdateSchema, CHANNEL_STATUS, ChannelApplicationSchema, ChannelDecisionSchema, ChannelLeadSchema, MatchSchema, OEM_STATUS, PIPELINE_STAGES,
  businessTypeLabel, channelRoleLabel, recommendChannels, type BusinessType,
} from '@collabiz/types';
import { BrandProductsService } from './brand-products.service';
import { InjectDb, type Db } from '../../db/client';
import { brandProducts, channelApplications, crmActivities, crmDeals, customers, memberships, notifications, uniteVentures, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { MailService } from '../../common/adapters';
import { randomDigits } from '../../common/crypto';

type App = typeof channelApplications.$inferSelect;
const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const hist = (by: string | null, status: string, note?: string | null) => sql`history || ${JSON.stringify([{ at: new Date().toISOString(), by, status, note: note ?? null }])}::jsonb`;
const OemSchema = z.object({ oemPartner: z.string().trim().min(2).max(160).optional(), oemStatus: z.enum(['planned', 'agreement_signed', 'producing']).optional(), oemPublic: z.boolean().optional() });

@ApiTags('brand-channels')
@Controller()
export class BrandChannelsController {
  constructor(@InjectDb() private db: Db, private audit: AuditService, private mail: MailService, private brands: BrandProductsService) {}

  private async ventures() {
    return new Map((await this.brands.published()).map((x) => [x.b.slug, x.v]));
  }
  private async catalogue() { return (await this.brands.published()).map((x) => x.product); }
  private oemPublic(v: typeof uniteVentures.$inferSelect) {
    if (!v.oemStatus) return null;
    return { status: OEM_STATUS[v.oemStatus as keyof typeof OEM_STATUS] ?? v.oemStatus, partner: v.oemPublic ? v.oemPartner : null };
  }
  private view(a: App, name?: string) {
    return { ...a, productName: name, roleLabel: channelRoleLabel(a.role), businessTypeLabel: businessTypeLabel(a.businessType), statusLabel: CHANNEL_STATUS[a.status as keyof typeof CHANNEL_STATUS] ?? a.status };
  }
  private async notifyStaff(title: string, text: string, link: string) {
    const ms = await this.db.selectDistinct({ u: memberships.userId }).from(memberships).where(and(eq(memberships.status, 'active'), inArray(memberships.role, ['unite_admin', 'super_admin'])));
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'venture', title, body: text, link })));
  }
  private async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const ms = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'venture', title, body: text, link })));
  }

  // ------------------------------------------------------------------ public
  @Public()
  @Get('public/brand-products')
  async products() {
    return { items: (await this.brands.published()).map(({ b, v }) => ({ slug: b.slug, subdomain: b.subdomain, logo: b.logo, heroImage: b.heroImage, name: v.name, tagline: v.tagline, stage: v.stage, roles: b.roles, buyers: b.buyers, oem: this.oemPublic(v) })) };
  }

  /** The matching agent: which Unite product and role fits this business, and why. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('public/brand-products/match')
  @HttpCode(200)
  async match(@Body(body(MatchSchema)) b: z.infer<typeof MatchSchema>) {
    return { items: recommendChannels(b, await this.catalogue()), engine: 'rules', note: 'Suggestions from the rules shown with each one: your business, your space and the role you want. Unite decides every application.' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('public/brand-products/applications')
  @HttpCode(201)
  async apply(@Body(body(ChannelApplicationSchema)) b: z.infer<typeof ChannelApplicationSchema>) {
    const bp = await this.brands.bySlug(b.productSlug);
    if (!bp) throw new NotFoundException('This product is not open for applications');
    if (!bp.product.roles.includes(b.role)) throw new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: [{ path: 'role', message: `${bp.v.name} does not take ${channelRoleLabel(b.role).toLowerCase()}s` }] });
    const v = bp.v; const catalogue = await this.catalogue();
    const dup = await this.db.select({ code: channelApplications.code }).from(channelApplications)
      .where(and(eq(channelApplications.ventureId, v.id), eq(channelApplications.email, b.email), eq(channelApplications.role, b.role), inArray(channelApplications.status, ['submitted', 'shortlisted']))).limit(1);
    if (dup.length) throw new ConflictException(`You already applied (${dup[0].code}). Unite will contact you.`);
    const m = recommendChannels({ businessType: b.businessType, role: b.role, warehouseSqft: b.warehouseSqft, showroomSqft: b.showroomSqft, products: [b.productSlug] }, catalogue)[0] ?? null;
    const code = `CHN-${new Date().getFullYear()}-${randomDigits(6)}`;
    const [a] = await this.db.insert(channelApplications).values({
      code, ventureId: v.id, role: b.role, businessType: b.businessType, name: b.name, email: b.email, phone: b.phone, company: b.company ?? null, state: b.state, district: b.district ?? null, city: b.city, territory: b.territory ?? null,
      details: { currentBrands: b.currentBrands ?? null, experienceYears: b.experienceYears ?? null, warehouseSqft: b.warehouseSqft ?? null, showroomSqft: b.showroomSqft ?? null, capacity: b.capacity ?? null, message: b.message ?? null },
      match: m ? { score: m.score, suggestedRole: m.role, reasons: m.reasons } : { score: 0, suggestedRole: null, reasons: ['Not a usual fit for this product — Unite will review it'] },
      history: [{ at: new Date().toISOString(), by: null, status: 'submitted' }],
    }).returning();
    await this.notifyStaff(`New ${channelRoleLabel(b.role).toLowerCase()} application for ${v.name}`, `${b.name}${b.company ? ` (${b.company})` : ''} · ${b.city}, ${b.state} · ${businessTypeLabel(b.businessType)} (${code})`, '/brand-channels');
    await this.mail.send('email', b.email, `${v.name}: application ${code} received`, `Thank you ${b.name.split(' ')[0]}. Unite received your application to be a ${channelRoleLabel(b.role).toLowerCase()} for ${v.name} (${code}). The team will contact you. To follow it and get your dealer dashboard, create a free COLLABIZ business account with this email address.`);
    const others = recommendChannels({ businessType: b.businessType, warehouseSqft: b.warehouseSqft, showroomSqft: b.showroomSqft }, catalogue).filter((x) => x.slug !== b.productSlug).slice(0, 3);
    return { code: a.code, status: a.status, alsoFits: others };
  }

  // ------------------------------------------------------------------ dealer (signed in)
  /** Links this user's applications (same email) to their business, then shows the dealer dashboard. */
  @Get('brand-products/dashboard')
  @RequireOrg()
  async dashboard(@Ctx() ctx: RequestContext) {
    const orgId = ctx.orgId!;
    const [me] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, ctx.userId!)).limit(1);
    if (me?.email) await this.db.update(channelApplications).set({ orgId, userId: ctx.userId, updatedAt: new Date() }).where(and(eq(sql`lower(${channelApplications.email})`, me.email.toLowerCase()), isNull(channelApplications.orgId)));
    const vs = await this.ventures();
    const byId = new Map([...vs.values()].map((v) => [v.id, v]));
    const apps = await this.db.select().from(channelApplications).where(eq(channelApplications.orgId, orgId)).orderBy(desc(channelApplications.createdAt));
    const approved = apps.filter((a) => a.status === 'approved');
    const deals = approved.length ? await this.db.select({ d: crmDeals, customer: customers.legalName }).from(crmDeals).innerJoin(customers, eq(customers.id, crmDeals.customerId))
      .where(and(eq(crmDeals.organizationId, orgId), inArray(crmDeals.ventureId, approved.map((a) => a.ventureId)))).orderBy(desc(crmDeals.updatedAt)) : [];
    const channels = approved.map((a) => {
      const v = byId.get(a.ventureId)!;
      const mine = deals.filter((x) => x.d.ventureId === a.ventureId);
      return {
        slug: v.slug, name: v.name, role: a.role, roleLabel: channelRoleLabel(a.role), territory: a.approvedTerritory, since: a.decidedAt,
        pipeline: PIPELINE_STAGES.map((stage) => ({ stage, count: mine.filter((x) => x.d.stage === stage).length, value: mine.filter((x) => x.d.stage === stage).reduce((s, x) => s + (x.d.value ?? 0), 0) })),
        won: mine.filter((x) => x.d.stage === 'won').reduce((s, x) => s + (x.d.value ?? 0), 0),
        recent: mine.slice(0, 5).map((x) => ({ id: x.d.id, title: x.d.title, customer: x.customer, stage: x.d.stage, value: x.d.value })),
      };
    });
    const latest = apps[0];
    const recommendations = latest ? recommendChannels({ businessType: latest.businessType as BusinessType, warehouseSqft: (latest.details as { warehouseSqft?: number }).warehouseSqft ?? undefined, showroomSqft: (latest.details as { showroomSqft?: number }).showroomSqft ?? undefined }, await this.catalogue())
      .filter((r) => !apps.some((a) => byId.get(a.ventureId)?.slug === r.slug)) : [];
    return { channels, applications: apps.map((a) => this.view(a, byId.get(a.ventureId)?.name)), recommendations };
  }

  /** An approved partner adds a lead for a Unite product: a customer and a deal in their own COLLABIZ CRM. */
  @Post('brand-products/leads')
  @RequireOrg()
  @HttpCode(201)
  async lead(@Ctx() ctx: RequestContext, @Body(body(ChannelLeadSchema)) b: z.infer<typeof ChannelLeadSchema>) {
    const orgId = ctx.orgId!;
    const v = (await this.ventures()).get(b.productSlug);
    if (!v) throw new NotFoundException();
    const [ok] = await this.db.select({ id: channelApplications.id }).from(channelApplications).where(and(eq(channelApplications.orgId, orgId), eq(channelApplications.ventureId, v.id), eq(channelApplications.status, 'approved'))).limit(1);
    if (!ok) throw new ForbiddenException(`Your business is not an approved ${v.name} partner yet`);
    const out = await this.db.transaction(async (tx) => {
      const [c] = await tx.insert(customers).values({ organizationId: orgId, legalName: b.customer, contactName: b.contactName ?? null, contactPhone: b.phone ?? null, city: b.city ?? null, country: 'IN',
        consentProvenance: { method: 'crm_entry', obtainedAt: new Date().toISOString(), disclosureScope: 'restricted' }, restrictedContacts: true }).returning({ id: customers.id });
      const [d] = await tx.insert(crmDeals).values({ organizationId: orgId, customerId: c.id, title: b.title, value: b.value ?? null, ownerUserId: ctx.userId, ventureId: v.id }).returning();
      await tx.insert(crmActivities).values({ organizationId: orgId, subjectType: 'deal', subjectId: d.id, kind: 'system', body: `${v.name} lead added from the dealer dashboard`, actorUserId: ctx.userId });
      return d;
    });
    await this.audit.record(ctx, { action: 'brand_channel.lead_added', objectType: 'crm_deal', objectId: out.id, after: { product: v.slug, title: b.title } });
    return out;
  }

  // ------------------------------------------------------------------ Unite admin
  @Get('admin/brand-products/applications')
  async list(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    if (!staff(ctx)) throw new ForbiddenException('Only Unite admins review channel applications');
    const byId = new Map([...(await this.ventures()).values()].map((v) => [v.id, v.name]));
    const rows = await this.db.select().from(channelApplications).where(status ? eq(channelApplications.status, status) : undefined).orderBy(desc(channelApplications.createdAt)).limit(300);
    return { items: rows.map((a) => this.view(a, byId.get(a.ventureId))) };
  }

  @Post('admin/brand-products/applications/:id/decide')
  @HttpCode(200)
  async decide(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ChannelDecisionSchema)) b: z.infer<typeof ChannelDecisionSchema>) {
    if (!staff(ctx)) throw new ForbiddenException('Only Unite admins review channel applications');
    const [a] = await this.db.select().from(channelApplications).where(eq(channelApplications.id, id)).limit(1);
    if (!a) throw new NotFoundException();
    if (['approved', 'declined'].includes(a.status)) throw new ConflictException(`This application is already ${a.status}`);
    if (b.decision === 'approve' && !a.orgId) throw new ConflictException(`Ask ${a.name} to create a COLLABIZ business account with ${a.email} and open the dealer dashboard once — the application links automatically. Then approve.`);
    const to = b.decision === 'approve' ? 'approved' : b.decision === 'decline' ? 'declined' : 'shortlisted';
    const [u] = await this.db.update(channelApplications).set({ status: to, approvedTerritory: b.decision === 'approve' ? b.territory! : a.approvedTerritory, decisionNote: b.note ?? null, decidedBy: ctx.userId, decidedAt: new Date(), history: hist(ctx.userId!, to, b.note), updatedAt: new Date() })
      .where(eq(channelApplications.id, id)).returning();
    const [v] = await this.db.select({ name: uniteVentures.name }).from(uniteVentures).where(eq(uniteVentures.id, a.ventureId)).limit(1);
    await this.audit.record(ctx, { action: `brand_channel.application_${to}`, objectType: 'channel_application', objectId: id, after: { territory: u.approvedTerritory, note: b.note ?? null } });
    const msg = to === 'approved' ? `You are an approved ${channelRoleLabel(a.role).toLowerCase()} for ${v.name} in ${u.approvedTerritory}. Your dealer dashboard and sales CRM are ready in COLLABIZ.`
      : to === 'shortlisted' ? `Your ${v.name} application (${a.code}) is shortlisted. The Unite team will call you.` : `Your ${v.name} application (${a.code}) was not taken forward: ${b.note}`;
    if (a.orgId) await this.notifyOrg(a.orgId, `${v.name}: ${CHANNEL_STATUS[to]}`, msg, '/dealer');
    await this.mail.send('email', a.email, `${v.name}: application ${a.code} — ${CHANNEL_STATUS[to]}`, msg);
    return this.view(u, v.name);
  }

  @Get('admin/brand-products/oem')
  async oem(@Ctx() ctx: RequestContext) {
    if (!staff(ctx)) throw new ForbiddenException();
    return { items: (await this.brands.published()).map(({ b, v }) => ({ slug: b.slug, name: v.name, oemPartner: v.oemPartner, oemStatus: v.oemStatus, oemPublic: v.oemPublic, open: v.open, stage: v.stage })), canPublish: ctx.platformRoles.includes('super_admin') };
  }

  /** Unite admins update the OEM record; only a super admin makes the manufacturer's name public. */
  @Post('admin/brand-products/oem/:slug')
  @HttpCode(200)
  async setOem(@Ctx() ctx: RequestContext, @Param('slug') slug: string, @Body(body(OemSchema)) b: z.infer<typeof OemSchema>) {
    if (!staff(ctx)) throw new ForbiddenException();
    if (b.oemPublic !== undefined && !ctx.platformRoles.includes('super_admin')) throw new ForbiddenException('Only a super admin makes the manufacturer public');
    if (!(await this.brands.bySlug(slug))) throw new NotFoundException();
    const [u] = await this.db.update(uniteVentures).set({ ...b, updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(uniteVentures.slug, slug)).returning();
    if (!u) throw new NotFoundException();
    await this.audit.record(ctx, { action: 'brand_channel.oem_updated', objectType: 'unite_venture', objectId: u.id, after: b });
    return { slug, oemPartner: u.oemPartner, oemStatus: u.oemStatus, oemPublic: u.oemPublic };
  }
}


/**
 * Admin console: add and edit Unite brand products. Publishing creates the business record, so the microsite, web
 * address, partner applications, matching rules, dealer CRM and home-page listing appear without code changes.
 */
@ApiTags('brand-channels')
@Controller('admin/brand-products/catalogue')
export class BrandProductsAdminController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}
  private check(ctx: RequestContext) { if (!staff(ctx)) throw new ForbiddenException('Only Unite admins manage brand products'); }

  @Get()
  async list(@Ctx() ctx: RequestContext) {
    this.check(ctx);
    const rows = await this.db.select({ b: brandProducts, v: uniteVentures }).from(brandProducts).leftJoin(uniteVentures, eq(uniteVentures.id, brandProducts.ventureId)).orderBy(desc(brandProducts.createdAt));
    const counts = await this.db.select({ v: channelApplications.ventureId, n: sql<number>`count(*)::int`, approved: sql<number>`count(*) filter (where ${channelApplications.status} = 'approved')::int` }).from(channelApplications).groupBy(channelApplications.ventureId);
    return { items: rows.map(({ b, v }) => ({ ...b, open: v?.open ?? false, stage: v?.stage ?? null, oemPartner: v?.oemPartner ?? null, oemStatus: v?.oemStatus ?? null,
      applications: counts.find((c) => c.v === b.ventureId)?.n ?? 0, partners: counts.find((c) => c.v === b.ventureId)?.approved ?? 0 })) };
  }

  @Post()
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(BrandProductSchema)) b: z.infer<typeof BrandProductSchema>) {
    this.check(ctx);
    const [clash] = await this.db.select({ id: uniteVentures.id }).from(uniteVentures).where(eq(uniteVentures.slug, b.slug)).limit(1);
    if (clash) throw new ConflictException('A Unite business already uses this address. Choose another.');
    const { oemPartner: _p, oemStatus: _s, ...rest } = b;
    const [row] = await this.db.insert(brandProducts).values({ ...rest, accent: [...b.accent], createdBy: ctx.userId, updatedBy: ctx.userId }).onConflictDoNothing().returning();
    if (!row) throw new ConflictException('That product address or web address is already taken');
    await this.audit.record(ctx, { action: 'brand_product.created', objectType: 'brand_product', objectId: row.id, after: { slug: b.slug, name: b.name } });
    return row;
  }

  @Put(':slug')
  async update(@Ctx() ctx: RequestContext, @Param('slug') slug: string, @Body(body(BrandProductUpdateSchema)) b: z.infer<typeof BrandProductUpdateSchema>) {
    this.check(ctx);
    const [cur] = await this.db.select().from(brandProducts).where(eq(brandProducts.slug, slug)).limit(1);
    if (!cur) throw new NotFoundException();
    const { oemPartner, oemStatus, ...rest } = b;
    const [row] = await this.db.update(brandProducts).set({ ...rest, accent: [...b.accent], updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(brandProducts.id, cur.id)).returning();
    // Published: the public business record follows the edit.
    if (row.ventureId) await this.db.update(uniteVentures).set({ name: b.name, category: b.category, sector: b.sector, tagline: b.tagline, summary: b.summary, oemPartner: oemPartner ?? null, oemStatus, updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(uniteVentures.id, row.ventureId));
    await this.audit.record(ctx, { action: 'brand_product.updated', objectType: 'brand_product', objectId: row.id, after: { name: b.name } });
    return row;
  }

  /** Creates the business record (closed to partner promotion until an admin opens it) and makes the microsite live. */
  @Post(':slug/publish')
  @HttpCode(200)
  async publish(@Ctx() ctx: RequestContext, @Param('slug') slug: string, @Body() raw: { oemPartner?: string; oemStatus?: string } = {}) {
    this.check(ctx);
    const [cur] = await this.db.select().from(brandProducts).where(eq(brandProducts.slug, slug)).limit(1);
    if (!cur) throw new NotFoundException();
    if (cur.status === 'published') throw new ConflictException('Already published');
    const out = await this.db.transaction(async (tx) => {
      const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(${uniteVentures.num}), 0)::int` }).from(uniteVentures);
      const [v] = await tx.insert(uniteVentures).values({
        num: n + 1, slug: cur.slug, name: cur.name, category: cur.category, sector: cur.sector, tagline: cur.tagline, summary: cur.summary, stage: 'concept', open: false,
        roles: ['refer_customers', 'sell_products', ...(cur.roles.includes('manufacturer') ? ['supply_products'] : [])], rewardNote: 'Channel margins are set in each distributor or dealer agreement.',
        oemPartner: typeof raw.oemPartner === 'string' && raw.oemPartner.trim() ? raw.oemPartner.trim().slice(0, 160) : null, oemStatus: ['planned', 'agreement_signed', 'producing'].includes(String(raw.oemStatus)) ? String(raw.oemStatus) : 'planned', updatedBy: ctx.userId,
      }).returning();
      const [b] = await tx.update(brandProducts).set({ ventureId: v.id, status: 'published', publishedAt: new Date(), updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(brandProducts.id, cur.id)).returning();
      return b;
    });
    await this.audit.record(ctx, { action: 'brand_product.published', objectType: 'brand_product', objectId: out.id, after: { slug, subdomain: out.subdomain } });
    return out;
  }
}

@Module({ controllers: [BrandChannelsController, BrandProductsAdminController], providers: [BrandProductsService], exports: [BrandProductsService] })
export class BrandChannelsModule {}
