/**
 * Stages 15–16 — international expansion, alliances, regional settings, content management and analytics
 * (screens 119–123, 125, 126, 139, 142, 146).
 *
 * Gate: governed expansion.
 *  - Country partnership: applications are decided by Unite Group staff who are not members of the applicant (R4.7);
 *    approval grants a dated territory; an exclusive territory is refused while another active exclusive one overlaps.
 *  - Alliance/JV proposals are decided only by the receiving organization and never create binding terms here.
 *  - The cross-border checklist is guidance for preparation, not legal advice, and says so.
 *  - The investor data room stays disabled until regulatory review (B-09); the endpoint reports that explicitly.
 *  - Exchange rates are dated, indicative and for display only; money is stored and settled in INR.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { COUNTRIES, SECTOR_CODES, regionLabel, sectorName } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { allianceProposals, contentPages, contentRevisions, countryPartnerApplications, countryTerritories, fxRates, groupCompanies, memberships, notifications, opportunities, organizations, crossBorderEnquiries, userPreferences } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomDigits } from '../../common/crypto';
import { config } from '../../config';

type Row = Record<string, unknown>;
const rows = (r: unknown) => ((r as { rows?: Row[] }).rows ?? (r as Row[]));
/** A bound text[] literal (drizzle would otherwise expand a JS array into a tuple). */
const textArray = (xs: string[]) => sql`ARRAY[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::text[]`;
const year = () => new Date().getUTCFullYear();
const country = z.string().trim().length(2).toUpperCase();
const STAFF = ['super_admin', 'unite_admin'];

const ApplicationSchema = z.object({ country, sectors: z.array(z.enum(SECTOR_CODES)).min(1).max(5), localEntity: z.string().trim().min(3).max(200), localRegistration: z.string().trim().min(3).max(100), teamSize: z.number().int().min(1).max(10000), plan: z.string().trim().min(50).max(4000), references: z.array(z.object({ name: z.string().trim().min(2).max(120), contact: z.string().trim().min(3).max(200) })).max(5).default([]) });
const DecisionSchema = z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().trim().min(10).max(1000), exclusive: z.boolean().default(false), months: z.number().int().min(6).max(60).default(24) });
const EnquirySchema = z.object({ direction: z.enum(['import', 'export']), product: z.string().trim().min(3).max(200), hsCode: z.string().trim().regex(/^\d{4,10}$/).optional(), quantity: z.string().trim().min(1).max(100), originCountry: country, destinationCountry: country, incoterm: z.enum(['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP']).default('FOB'), targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), notes: z.string().trim().max(2000).optional() })
  .refine((v) => v.originCountry !== v.destinationCountry, { message: 'Origin and destination must differ', path: ['destinationCountry'] })
  .refine((v) => (v.direction === 'import' ? v.destinationCountry === 'IN' : v.originCountry === 'IN'), { message: 'Imports arrive in India; exports leave India', path: ['direction'] });
const AllianceSchema = z.object({ kind: z.enum(['joint_venture', 'strategic_alliance', 'distribution']), targetOrgId: z.string().uuid(), title: z.string().trim().min(5).max(200), rationale: z.string().trim().min(30).max(4000), scope: z.string().trim().min(20).max(4000), markets: z.array(country).min(1).max(10), sectors: z.array(z.enum(SECTOR_CODES)).min(1).max(5), proposerSharePct: z.number().int().min(1).max(99).optional(), durationMonths: z.number().int().min(3).max(120) });
const PrefsSchema = z.object({ language: z.enum(['en-IN', 'hi-IN', 'ar-AE', 'fr-FR']), currency: z.enum(['INR', 'USD', 'AED', 'SAR', 'EUR', 'GBP', 'KES', 'NGN', 'BDT', 'LKR']), timezone: z.string().trim().min(3).max(60), dateStyle: z.enum(['dmy', 'mdy', 'ymd']) });
const LANGUAGES = [{ code: 'en-IN', name: 'English (India)', available: true }, { code: 'hi-IN', name: 'हिन्दी (Hindi)', available: false }, { code: 'ar-AE', name: 'العربية (Arabic)', available: false }, { code: 'fr-FR', name: 'Français (French)', available: false }];

/** 126 — preparation guidance by direction and destination. Not legal advice. */
const CHECKLIST: { key: string; label: string; detail: string; when: (e: { direction: string; origin: string; dest: string; sector?: string }) => boolean }[] = [
  { key: 'iec', label: 'Importer-Exporter Code (IEC)', detail: 'Issued by DGFT; needed for any import or export from India.', when: () => true },
  { key: 'gst_lut', label: 'GST Letter of Undertaking', detail: 'Lets you export without paying IGST up front.', when: (e) => e.direction === 'export' },
  { key: 'hs', label: 'HS classification confirmed', detail: 'Duty, licensing and restrictions follow the HS code. Confirm it with your customs broker.', when: () => true },
  { key: 'bis', label: 'BIS certification for regulated goods', detail: 'Many electrical items need BIS registration before import into India.', when: (e) => e.direction === 'import' && ['power_equipment', 'solar'].includes(e.sector ?? '') },
  { key: 'almm', label: 'ALMM listing for solar modules', detail: 'Government-backed solar projects require modules on the Approved List of Models and Manufacturers.', when: (e) => e.direction === 'import' && e.sector === 'solar' },
  { key: 'coo', label: 'Certificate of origin', detail: 'Needed to claim lower duty under a trade agreement.', when: () => true },
  { key: 'uae_ecas', label: 'UAE conformity (ECAS/EQM)', detail: 'Regulated products need Emirates conformity marking.', when: (e) => e.dest === 'AE' },
  { key: 'saber', label: 'Saudi SABER certificate', detail: 'Shipment and product certificates through the SABER platform.', when: (e) => e.dest === 'SA' },
  { key: 'pvoc', label: 'Kenya PVoC inspection', detail: 'Pre-export verification of conformity before shipment.', when: (e) => e.dest === 'KE' },
  { key: 'soncap', label: 'Nigeria SONCAP certificate', detail: 'Product and shipment certificates are required for regulated goods.', when: (e) => e.dest === 'NG' },
  { key: 'ukca', label: 'UKCA marking', detail: 'Required for many electrical products sold in Great Britain.', when: (e) => e.dest === 'GB' },
  { key: 'us_cert', label: 'US product certification (e.g. UL, FCC)', detail: 'Check the safety and emissions marks your buyer requires.', when: (e) => e.dest === 'US' },
  { key: 'sanctions', label: 'Sanctions and end-user screening', detail: 'Screen the buyer and end use against applicable sanctions lists.', when: () => true },
  { key: 'insurance', label: 'Cargo insurance arranged', detail: 'Who insures depends on the Incoterm you agree.', when: () => true },
];

@ApiTags('global')
@Controller()
export class GlobalController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private async notifyOrg(orgId: string, kind: string, title: string, text: string, link: string) {
    const ms = await this.db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    for (const m of ms) await this.db.insert(notifications).values({ userId: m.userId, kind, title, body: text, link });
  }

  // ---------- 119 global portal ----------
  @Get('global/overview')
  @RequireOrg()
  async overview(@Ctx() ctx: RequestContext) {
    const oppCounts = rows(await this.db.execute(sql`select country, count(*)::int as n from opportunities where listed and status in ('accepted','released','qualification','proposal') and country <> 'IN' group by country`));
    const partnerCounts = rows(await this.db.execute(sql`select country, count(*)::int as n from country_territories where status = 'active' group by country`));
    const markets = COUNTRIES.filter(([c]) => c !== 'IN').map(([c, name]) => ({ country: c, name, opportunities: Number(oppCounts.find((r) => r.country === c)?.n ?? 0), countryPartners: Number(partnerCounts.find((r) => r.country === c)?.n ?? 0) }));
    const opps = await this.db.select({ o: opportunities, owner: organizations.displayName }).from(opportunities).innerJoin(organizations, eq(organizations.id, opportunities.ownerOrgId))
      .where(and(ne(opportunities.country, 'IN'), eq(opportunities.listed, true), inArray(opportunities.status, ['accepted', 'released', 'qualification', 'proposal']), inArray(opportunities.visibility, ['public', 'partners', 'verified_partners']))).orderBy(desc(opportunities.publishedAt)).limit(30);
    const [myTerr] = await this.db.select().from(countryTerritories).where(and(eq(countryTerritories.organizationId, ctx.orgId!), eq(countryTerritories.status, 'active'))).limit(1);
    return { markets, opportunities: opps.map((r) => ({ id: r.o.id, code: r.o.code, title: r.o.title, sector: r.o.sector, country: r.o.country, countryName: regionLabel(r.o.country), city: r.o.city, estimatedValue: r.o.estimatedValue, deadline: r.o.deadline, publisher: r.o.route === 'unite_owned' ? r.owner : 'Verified COLLABIZ partner' })), isCountryPartner: !!myTerr };
  }

  // ---------- 120 country partner application ----------
  @Post('global/country-partner/applications')
  @RequireOrg()
  @HttpCode(201)
  async apply(@Ctx() ctx: RequestContext, @Body(body(ApplicationSchema)) b: z.infer<typeof ApplicationSchema>) {
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Verify your company before applying to be a country partner');
    if (b.country === 'IN') throw new BadRequestException({ message: 'Check the highlighted fields', fields: { country: 'Country partnership is for markets outside India' } });
    const [open] = await this.db.select({ id: countryPartnerApplications.id }).from(countryPartnerApplications).where(and(eq(countryPartnerApplications.organizationId, ctx.orgId!), eq(countryPartnerApplications.country, b.country), eq(countryPartnerApplications.status, 'submitted'))).limit(1);
    if (open) throw new ConflictException('You already have an application for this country under review');
    const [a] = await this.db.insert(countryPartnerApplications).values({ ...b, organizationId: ctx.orgId!, submittedBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'global.country_partner_applied', objectType: 'country_partner_application', objectId: a.id, after: { country: b.country, sectors: b.sectors } });
    return a;
  }

  @Get('global/country-partner/applications')
  async applications(@Ctx() ctx: RequestContext) {
    const staff = ctx.platformRoles.some((r) => STAFF.includes(r));
    const list = await this.db.select({ a: countryPartnerApplications, org: organizations.displayName }).from(countryPartnerApplications).innerJoin(organizations, eq(organizations.id, countryPartnerApplications.organizationId))
      .where(staff ? undefined : eq(countryPartnerApplications.organizationId, ctx.orgId ?? '00000000-0000-0000-0000-000000000000')).orderBy(desc(countryPartnerApplications.createdAt));
    return { staff, applications: list.map((r) => ({ ...r.a, org: r.org, countryName: regionLabel(r.a.country) })) };
  }

  @Post('admin/global/country-partner/applications/:id/decision')
  @HttpCode(200)
  async decide(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(DecisionSchema)) b: z.infer<typeof DecisionSchema>) {
    if (!ctx.platformRoles.some((r) => STAFF.includes(r))) throw new ForbiddenException('Unite Group staff decide country partnerships');
    const [a] = await this.db.select().from(countryPartnerApplications).where(eq(countryPartnerApplications.id, id)).limit(1);
    if (!a) throw new NotFoundException('Application not found');
    if (a.status !== 'submitted') throw new ConflictException('This application has already been decided');
    if (ctx.memberships.some((m) => m.organizationId === a.organizationId)) throw new ForbiddenException('You cannot decide an application from your own organization');
    if (b.decision === 'approved' && b.exclusive) {
      const clash = rows(await this.db.execute(sql`select 1 from country_territories where country = ${a.country} and status = 'active' and exclusive and sectors && ${textArray(a.sectors)} limit 1`));
      if (clash.length) throw new ConflictException('Another partner already holds an exclusive territory for this country and sector');
    }
    await this.db.transaction(async (tx) => {
      await tx.update(countryPartnerApplications).set({ status: b.decision, decidedBy: ctx.userId, decisionReason: b.reason, decidedAt: new Date() }).where(eq(countryPartnerApplications.id, id));
      if (b.decision === 'approved') {
        const start = new Date(); const end = new Date(); end.setMonth(end.getMonth() + b.months);
        await tx.insert(countryTerritories).values({ organizationId: a.organizationId, country: a.country, sectors: a.sectors, exclusive: b.exclusive, startsOn: start.toISOString().slice(0, 10), endsOn: end.toISOString().slice(0, 10), applicationId: a.id });
        await tx.update(organizations).set({ membershipLevel: 'country_partner' }).where(eq(organizations.id, a.organizationId));
      }
    });
    await this.audit.record(ctx, { action: `global.country_partner_${b.decision}`, objectType: 'country_partner_application', objectId: id, reason: b.reason, after: { exclusive: b.exclusive } });
    await this.notifyOrg(a.organizationId, 'opportunity', b.decision === 'approved' ? `Approved: country partner for ${regionLabel(a.country)}` : `Country partner application for ${regionLabel(a.country)}`, b.reason, '/global/territory');
    return { id, status: b.decision };
  }

  // ---------- 121 territory dashboard ----------
  @Get('global/territory')
  @RequireOrg()
  async territory(@Ctx() ctx: RequestContext) {
    const terrs = await this.db.select().from(countryTerritories).where(and(eq(countryTerritories.organizationId, ctx.orgId!), eq(countryTerritories.status, 'active')));
    if (!terrs.length) return { territories: [], opportunities: [], enquiries: [], alliances: 0 };
    const countries = terrs.map((t) => t.country);
    const opps = await this.db.select().from(opportunities).where(and(inArray(opportunities.country, countries), eq(opportunities.listed, true), inArray(opportunities.status, ['accepted', 'released', 'qualification', 'proposal'])));
    const enq = await this.db.select().from(crossBorderEnquiries).where(or(inArray(crossBorderEnquiries.originCountry, countries), inArray(crossBorderEnquiries.destinationCountry, countries))).orderBy(desc(crossBorderEnquiries.createdAt)).limit(20);
    const [{ n }] = rows(await this.db.execute(sql`select count(*)::int as n from alliance_proposals where (proposer_org_id = ${ctx.orgId} or target_org_id = ${ctx.orgId}) and status in ('submitted','in_discussion')`));
    return {
      territories: terrs.map((t) => ({ ...t, countryName: regionLabel(t.country), sectorNames: t.sectors.map(sectorName), daysLeft: Math.ceil((new Date(t.endsOn).getTime() - Date.now()) / 86400_000) })),
      opportunities: opps.map((o) => ({ id: o.id, code: o.code, title: o.title, country: o.country, countryName: regionLabel(o.country), sector: o.sector, estimatedValue: o.estimatedValue, status: o.status })),
      enquiries: enq.map((e) => ({ id: e.id, code: e.code, direction: e.direction, product: e.product, route: `${regionLabel(e.originCountry)} → ${regionLabel(e.destinationCountry)}`, status: e.status, createdAt: e.createdAt })),
      alliances: Number(n),
    };
  }

  // ---------- 122 import/export desk + 126 checklist ----------
  @Post('global/enquiries')
  @RequireOrg()
  @HttpCode(201)
  async enquire(@Ctx() ctx: RequestContext, @Body(body(EnquirySchema)) b: z.infer<typeof EnquirySchema>) {
    const [exim] = await this.db.select({ id: groupCompanies.organizationId }).from(groupCompanies).where(and(eq(groupCompanies.status, 'active'), sql`'trading' = any(${groupCompanies.sectors})`)).limit(1);
    const [e] = await this.db.insert(crossBorderEnquiries).values({ ...b, code: `XB-${year()}-${randomDigits(6)}`, organizationId: ctx.orgId!, createdBy: ctx.userId, routedToOrgId: exim?.id ?? null }).returning();
    if (exim) await this.notifyOrg(exim.id, 'trade', `New ${b.direction} enquiry ${e.code}`, `${b.product} · ${regionLabel(b.originCountry)} → ${regionLabel(b.destinationCountry)}`, `/global/import-export?id=${e.id}`);
    await this.audit.record(ctx, { action: 'global.enquiry_created', objectType: 'cross_border_enquiry', objectId: e.id });
    return { ...e, routedTo: exim ? 'Unite Exim' : null };
  }

  @Get('global/enquiries')
  @RequireOrg()
  async enquiries(@Ctx() ctx: RequestContext) {
    const list = await this.db.select({ e: crossBorderEnquiries, org: organizations.displayName }).from(crossBorderEnquiries).innerJoin(organizations, eq(organizations.id, crossBorderEnquiries.organizationId))
      .where(or(eq(crossBorderEnquiries.organizationId, ctx.orgId!), eq(crossBorderEnquiries.routedToOrgId, ctx.orgId!))).orderBy(desc(crossBorderEnquiries.createdAt));
    return list.map((r) => ({ ...r.e, org: r.org, mine: r.e.organizationId === ctx.orgId, handler: r.e.routedToOrgId === ctx.orgId, originName: regionLabel(r.e.originCountry), destinationName: regionLabel(r.e.destinationCountry) }));
  }

  @Post('global/enquiries/:id/respond')
  @RequireOrg()
  @HttpCode(200)
  async respond(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ response: z.string().trim().min(10).max(4000) }))) b: { response: string }) {
    const [e] = await this.db.select().from(crossBorderEnquiries).where(eq(crossBorderEnquiries.id, id)).limit(1);
    if (!e || e.routedToOrgId !== ctx.orgId) throw new NotFoundException('Enquiry not found');
    if (e.status === 'closed') throw new ConflictException('This enquiry is closed');
    const [u] = await this.db.update(crossBorderEnquiries).set({ status: 'quoted', response: b.response, respondedAt: new Date() }).where(eq(crossBorderEnquiries.id, id)).returning();
    await this.notifyOrg(e.organizationId, 'trade', `Response on ${e.code}`, b.response.slice(0, 140), `/global/import-export?id=${id}`);
    return u;
  }

  /** 126 — checklist for an enquiry or for any route (direction + countries + sector). */
  @Get('global/compliance')
  @RequireOrg()
  async checklist(@Ctx() ctx: RequestContext, @Query() q: Record<string, string | undefined>) {
    let route = { direction: q.direction ?? 'export', origin: (q.origin ?? 'IN').toUpperCase(), dest: (q.destination ?? 'AE').toUpperCase(), sector: q.sector };
    let done: string[] = [];
    if (q.enquiryId) {
      const [e] = await this.db.select().from(crossBorderEnquiries).where(and(eq(crossBorderEnquiries.id, q.enquiryId), eq(crossBorderEnquiries.organizationId, ctx.orgId!))).limit(1);
      if (!e) throw new NotFoundException('Enquiry not found');
      route = { direction: e.direction, origin: e.originCountry, dest: e.destinationCountry, sector: route.sector };
      done = e.checklistDone;
    }
    const items = CHECKLIST.filter((c) => c.when(route)).map((c) => ({ key: c.key, label: c.label, detail: c.detail, done: done.includes(c.key) }));
    return { route: { ...route, originName: regionLabel(route.origin), destinationName: regionLabel(route.dest) }, items, disclaimer: 'Preparation guidance only — not legal or customs advice. Confirm requirements with a licensed customs broker before shipping.' };
  }

  @Put('global/enquiries/:id/checklist')
  @RequireOrg()
  async tick(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ done: z.array(z.string().max(40)).max(30) }))) b: { done: string[] }) {
    const [e] = await this.db.select().from(crossBorderEnquiries).where(and(eq(crossBorderEnquiries.id, id), eq(crossBorderEnquiries.organizationId, ctx.orgId!))).limit(1);
    if (!e) throw new NotFoundException('Enquiry not found');
    const valid = new Set(CHECKLIST.map((c) => c.key));
    const [u] = await this.db.update(crossBorderEnquiries).set({ checklistDone: [...new Set(b.done.filter((k) => valid.has(k)))] }).where(eq(crossBorderEnquiries.id, id)).returning();
    return { done: u.checklistDone };
  }

  // ---------- 123 alliances ----------
  @Get('alliances')
  @RequireOrg()
  async alliances(@Ctx() ctx: RequestContext) {
    const list = rows(await this.db.execute(sql`select a.*, p.display_name as proposer, t.display_name as target from alliance_proposals a
      join organizations p on p.id = a.proposer_org_id join organizations t on t.id = a.target_org_id
      where a.proposer_org_id = ${ctx.orgId} or a.target_org_id = ${ctx.orgId} order by a.created_at desc`));
    const targets = await this.db.select({ id: organizations.id, name: organizations.displayName, type: organizations.type }).from(organizations)
      .where(and(eq(organizations.verificationStatus, 'verified'), ne(organizations.id, ctx.orgId!), inArray(organizations.type, ['partner_company', 'group_company']))).orderBy(organizations.displayName);
    return { proposals: list.map((r) => ({ id: r.id, code: r.code, kind: r.kind, title: r.title, rationale: r.rationale, scope: r.scope, markets: r.markets, sectors: r.sectors, proposerSharePct: r.proposer_share_pct, durationMonths: r.duration_months, status: r.status, decisionReason: r.decision_reason, proposer: r.proposer, target: r.target, incoming: r.target_org_id === ctx.orgId, createdAt: r.created_at })), targets };
  }

  @Post('alliances')
  @RequireOrg()
  @HttpCode(201)
  async propose(@Ctx() ctx: RequestContext, @Body(body(AllianceSchema)) b: z.infer<typeof AllianceSchema>) {
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Verify your company before proposing an alliance');
    if (b.targetOrgId === ctx.orgId) throw new BadRequestException('Choose another organization');
    const [t] = await this.db.select().from(organizations).where(and(eq(organizations.id, b.targetOrgId), eq(organizations.verificationStatus, 'verified'))).limit(1);
    if (!t || t.type === 'platform') throw new BadRequestException({ message: 'Check the highlighted fields', fields: { targetOrgId: 'Choose a verified partner or Unite Group company' } });
    const [a] = await this.db.insert(allianceProposals).values({ ...b, code: `ALL-${year()}-${randomDigits(5)}`, proposerOrgId: ctx.orgId!, createdBy: ctx.userId }).returning();
    await this.notifyOrg(t.id, 'team', `Alliance proposal: ${b.title}`, `From your network on COLLABIZ`, '/alliances');
    await this.audit.record(ctx, { action: 'alliance.proposed', objectType: 'alliance_proposal', objectId: a.id, after: { kind: b.kind, target: t.id } });
    return a;
  }

  @Post('alliances/:id/decision')
  @RequireOrg()
  @HttpCode(200)
  async allianceDecision(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['in_discussion', 'accepted', 'declined', 'withdrawn']), reason: z.string().trim().min(5).max(1000) }))) b: { decision: string; reason: string }) {
    const [a] = await this.db.select().from(allianceProposals).where(eq(allianceProposals.id, id)).limit(1);
    if (!a || (a.targetOrgId !== ctx.orgId && a.proposerOrgId !== ctx.orgId)) throw new NotFoundException('Proposal not found');
    if (['accepted', 'declined', 'withdrawn'].includes(a.status)) throw new ConflictException('This proposal is closed');
    if (b.decision === 'withdrawn' ? a.proposerOrgId !== ctx.orgId : a.targetOrgId !== ctx.orgId) throw new ForbiddenException(b.decision === 'withdrawn' ? 'Only the proposer can withdraw' : 'Only the receiving organization decides');
    const [u] = await this.db.update(allianceProposals).set({ status: b.decision, decidedBy: ctx.userId, decisionReason: b.reason, decidedAt: new Date(), updatedAt: new Date() }).where(eq(allianceProposals.id, id)).returning();
    await this.notifyOrg(b.decision === 'withdrawn' ? a.targetOrgId : a.proposerOrgId, 'team', `${a.code}: ${b.decision.replace('_', ' ')}`, b.reason, '/alliances');
    await this.audit.record(ctx, { action: `alliance.${b.decision}`, objectType: 'alliance_proposal', objectId: id, reason: b.reason });
    return { ...u, next: b.decision === 'accepted' ? 'Draft the agreement in Contracts; nothing is binding until both parties sign there.' : null };
  }

  // ---------- 125 investor data room (regulated) ----------
  @Get('data-room')
  dataRoom() {
    if (!config().FEATURE_INVESTOR_DATA_ROOM) return { featureDisabled: true, reason: 'Investor access is switched off until regulatory review is complete (blocker B-09). No investment material is shown or collected.' };
    throw new ForbiddenException('Investor data room requires a regulatory sign-off that has not been recorded');
  }

  // ---------- 146 regional settings ----------
  @Get('me/regional')
  async regional(@Ctx() ctx: RequestContext) {
    const [p] = await this.db.select().from(userPreferences).where(eq(userPreferences.userId, ctx.userId)).limit(1);
    const rates = rows(await this.db.execute(sql`select distinct on (currency) currency, inr_per_unit, as_of, source from fx_rates order by currency, as_of desc`));
    return { preferences: p ?? { language: 'en-IN', currency: 'INR', timezone: 'Asia/Kolkata', dateStyle: 'dmy' }, languages: LANGUAGES,
      rates: rates.map((r) => ({ currency: String(r.currency), inrPerUnit: Number(r.inr_per_unit), asOf: r.as_of, source: r.source })),
      note: 'Amounts are stored, invoiced and settled in INR. Other currencies are shown with dated indicative rates for reference only.' };
  }

  @Put('me/regional')
  async saveRegional(@Ctx() ctx: RequestContext, @Body(body(PrefsSchema)) b: z.infer<typeof PrefsSchema>) {
    if (!LANGUAGES.find((l) => l.code === b.language)?.available) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { language: 'This language is not available yet' } });
    try { new Intl.DateTimeFormat('en', { timeZone: b.timezone }); } catch { throw new BadRequestException({ message: 'Check the highlighted fields', fields: { timezone: 'Unknown time zone' } }); }
    if (b.currency !== 'INR') {
      const [r] = await this.db.select().from(fxRates).where(eq(fxRates.currency, b.currency)).limit(1);
      if (!r) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { currency: 'No reference rate is available for this currency yet' } });
    }
    await this.db.insert(userPreferences).values({ userId: ctx.userId, ...b }).onConflictDoUpdate({ target: userPreferences.userId, set: { ...b, updatedAt: new Date() } });
    return this.regional(ctx);
  }

  @Post('admin/fx-rates')
  @HttpCode(201)
  async setRate(@Ctx() ctx: RequestContext, @Body(body(z.object({ currency: z.string().length(3).toUpperCase(), inrPerUnit: z.number().positive().max(100000), asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), source: z.string().trim().min(3).max(200) }))) b: { currency: string; inrPerUnit: number; asOf: string; source: string }) {
    if (!ctx.platformRoles.some((r) => ['super_admin', 'finance'].includes(r))) throw new ForbiddenException('Finance or super admin only');
    const [r] = await this.db.insert(fxRates).values({ ...b, inrPerUnit: String(b.inrPerUnit), setBy: ctx.userId }).onConflictDoUpdate({ target: [fxRates.currency, fxRates.asOf], set: { inrPerUnit: String(b.inrPerUnit), source: b.source, setBy: ctx.userId } }).returning();
    await this.audit.record(ctx, { action: 'fx.rate_set', objectType: 'fx_rate', objectId: r.id, after: b });
    return r;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
@ApiTags('content')
@Controller()
export class ContentController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}
  private staff(ctx: RequestContext) { if (!ctx.platformRoles.some((r) => ['super_admin', 'moderator', 'unite_admin'].includes(r))) throw new ForbiddenException('Content managers only'); }

  /** Published pages for a locale (falls back to en-IN). */
  @Public()
  @Get('public/content/:slug')
  async page(@Param('slug') slug: string, @Query('locale') locale = 'en-IN') {
    const list = await this.db.select().from(contentPages).where(and(eq(contentPages.slug, slug), eq(contentPages.status, 'published'), inArray(contentPages.locale, [locale, 'en-IN'])));
    const p = list.find((x) => x.locale === locale) ?? list[0];
    if (!p) throw new NotFoundException('Page not found');
    return { slug: p.slug, locale: p.locale, title: p.title, body: p.body, version: p.version, publishedAt: p.publishedAt };
  }

  /** 142 — content inventory with status and versions. */
  @Get('admin/content')
  async list(@Ctx() ctx: RequestContext) {
    this.staff(ctx);
    return this.db.select().from(contentPages).orderBy(contentPages.kind, contentPages.slug, contentPages.locale);
  }

  @Get('admin/content/:id/revisions')
  async revisions(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.staff(ctx);
    return this.db.select().from(contentRevisions).where(eq(contentRevisions.pageId, id)).orderBy(desc(contentRevisions.version));
  }

  @Put('admin/content')
  async save(@Ctx() ctx: RequestContext, @Body(body(z.object({ slug: z.string().trim().regex(/^[a-z0-9-]{3,80}$/), locale: z.enum(['en-IN', 'hi-IN', 'ar-AE', 'fr-FR']).default('en-IN'), kind: z.enum(['help', 'policy', 'page']), title: z.string().trim().min(3).max(200), body: z.string().trim().min(10).max(50000), note: z.string().trim().max(300).optional(), publish: z.boolean().default(false) }))) b: { slug: string; locale: string; kind: string; title: string; body: string; note?: string; publish: boolean }) {
    this.staff(ctx);
    // Policy pages carry legal weight: publishing one needs a super admin.
    if (b.publish && b.kind === 'policy' && !ctx.platformRoles.includes('super_admin')) throw new ForbiddenException('Only a super admin publishes policy pages');
    const [cur] = await this.db.select().from(contentPages).where(and(eq(contentPages.slug, b.slug), eq(contentPages.locale, b.locale))).limit(1);
    const version = (cur?.version ?? 0) + 1;
    const status = b.publish ? 'published' : cur?.status === 'published' ? 'published' : 'draft';
    const p = await this.db.transaction(async (tx) => {
      const [p] = cur
        ? await tx.update(contentPages).set({ title: b.title, body: b.body, kind: b.kind, version, status, updatedBy: ctx.userId, publishedAt: b.publish ? new Date() : cur.publishedAt, updatedAt: new Date() }).where(eq(contentPages.id, cur.id)).returning()
        : await tx.insert(contentPages).values({ slug: b.slug, locale: b.locale, kind: b.kind, title: b.title, body: b.body, version, status, updatedBy: ctx.userId, publishedAt: b.publish ? new Date() : null }).returning();
      await tx.insert(contentRevisions).values({ pageId: p.id, version, title: b.title, body: b.body, changedBy: ctx.userId, note: b.note });
      return p;
    });
    await this.audit.record(ctx, { action: b.publish ? 'content.published' : 'content.saved', objectType: 'content_page', objectId: p.id, after: { slug: b.slug, locale: b.locale, version } });
    return p;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
@ApiTags('analytics')
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(@InjectDb() private db: Db) {}

  /** 139 — platform performance. Aggregates only; no personal data. */
  @Get()
  async overview(@Ctx() ctx: RequestContext, @Query('months') monthsQ?: string) {
    if (!ctx.platformRoles.some((r) => ['super_admin', 'unite_admin', 'finance', 'compliance'].includes(r))) throw new ForbiddenException('Platform staff only');
    const months = Math.min(24, Math.max(3, Number(monthsQ) || 6));
    const one = async (q: ReturnType<typeof sql>) => rows(await this.db.execute(q))[0];
    const funnel = await one(sql`select count(*) filter (where type in ('partner_company','partner_individual'))::int as registered,
      count(*) filter (where type in ('partner_company','partner_individual') and verification_status in ('submitted','under_review','verified'))::int as submitted,
      count(*) filter (where type in ('partner_company','partner_individual') and verification_status = 'verified')::int as verified from organizations`);
    const opps = rows(await this.db.execute(sql`select route, status, count(*)::int as n, coalesce(sum(estimated_value),0)::bigint as value from opportunities group by route, status`));
    const routing = await one(sql`select count(*)::int as total, count(*) filter (where decided_at is not null and decided_at <= due_at)::int as within_sla, count(*) filter (where decided_at is not null and decided_at > due_at)::int as breached, count(*) filter (where decided_at is null)::int as open from routing_events`);
    const leads = await one(sql`select count(*)::int as total, count(*) filter (where status = 'protected')::int as protected, count(*) filter (where status = 'contested')::int as contested from lead_claims`);
    const ledger = rows(await this.db.execute(sql`select status, count(*)::int as n, coalesce(sum(payable),0)::bigint as amount from commission_entries group by status`));
    const support = await one(sql`select count(*)::int as total, count(*) filter (where first_responded_at is not null and first_responded_at <= first_response_due_at)::int as on_time, count(*) filter (where status = 'escalated')::int as escalated, round(avg(satisfaction)::numeric, 1) as csat from support_tickets`);
    const tenders = await one(sql`select count(*)::int as total, count(*) filter (where status = 'awarded')::int as awarded, (select count(*)::int from bids where status not in ('draft','withdrawn')) as bids from tenders`);
    const projectsRow = await one(sql`select count(*)::int as total, count(*) filter (where status = 'active')::int as active, (select count(*)::int from milestones where certified_at is not null) as certified,
      (select count(*)::int from milestones where certified_at is not null and certified_at::date <= due_date) as on_time from projects`);
    const series = rows(await this.db.execute(sql`with m as (select generate_series(date_trunc('month', now()) - make_interval(months => ${months - 1}), date_trunc('month', now()), interval '1 month') as month)
      select to_char(m.month, 'YYYY-MM') as month,
        (select count(*)::int from organizations o where o.type in ('partner_company','partner_individual') and date_trunc('month', o.created_at) = m.month) as partners,
        (select count(*)::int from opportunities o where date_trunc('month', o.created_at) = m.month) as opportunities,
        (select count(*)::int from lead_claims l where date_trunc('month', l.created_at) = m.month) as leads,
        (select coalesce(sum(payable),0)::bigint from commission_entries c where c.status = 'paid' and date_trunc('month', c.updated_at) = m.month) as paid
      from m order by m.month`));
    const ai = rows(await this.db.execute(sql`select kind, count(*)::int as n, count(*) filter (where status in ('accepted','edited'))::int as useful, count(*) filter (where status = 'rejected')::int as rejected from ai_suggestions group by kind`));
    const num = (v: unknown) => Number(v ?? 0);
    return {
      asOf: new Date().toISOString(), months,
      funnel: { registered: num(funnel.registered), submitted: num(funnel.submitted), verified: num(funnel.verified) },
      opportunities: opps.map((o) => ({ route: String(o.route), status: String(o.status), count: num(o.n), value: num(o.value) })),
      routing: { total: num(routing.total), withinSla: num(routing.within_sla), breached: num(routing.breached), open: num(routing.open) },
      leads: { total: num(leads.total), protected: num(leads.protected), contested: num(leads.contested) },
      ledger: ledger.map((l) => ({ status: String(l.status), count: num(l.n), amount: num(l.amount) })),
      support: { total: num(support.total), onTime: num(support.on_time), escalated: num(support.escalated), csat: support.csat == null ? null : Number(support.csat) },
      tenders: { total: num(tenders.total), awarded: num(tenders.awarded), bids: num(tenders.bids) },
      projects: { total: num(projectsRow.total), active: num(projectsRow.active), certified: num(projectsRow.certified), onTime: num(projectsRow.on_time) },
      series: series.map((s) => ({ month: String(s.month), partners: num(s.partners), opportunities: num(s.opportunities), leads: num(s.leads), paid: num(s.paid) })),
      ai: ai.map((a) => ({ kind: String(a.kind), count: num(a.n), useful: num(a.useful), rejected: num(a.rejected) })),
    };
  }
}

@Module({ controllers: [GlobalController, ContentController, AnalyticsController] })
export class GlobalModule {}
