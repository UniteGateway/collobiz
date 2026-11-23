/**
 * JOIN — any industry joins COLLABIZ and says how it wants to collaborate with Unite Group (tested in test/join.e2e.ts).
 *
 *  - The join profile belongs to the organisation: its industry plus the collaborations it chose. Only the owner or an
 *    admin of the business changes it; every change is audited.
 *  - The board shows one card per chosen collaboration with live counts from the module behind it. Counts only include
 *    records the member could already open in that module (others' open listings, never drafts, never private data).
 *  - Unite businesses and business offers are matched by rules — industry and chosen collaborations — and every match
 *    carries the reasons it was shown. Nothing is labelled AI unless a model ranked it.
 */
import { Body, Controller, ForbiddenException, Get, Module, NotFoundException, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { JOIN_INTENTS, JoinProfileSchema, OFFER_OPEN, joinIntent, offerCategoryLabel, sectorName, suggestIntents, ventureReasons, type JoinProfile, type SectorCode } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  businessOffers, clubPowerRequests, clubProducts, collabJoinProfiles, courses, energyListings, crossBorderEnquiries, microContracts, opportunities, organizations, partnerProfiles, propertyProjects, tenders, tradeRequirements, uniteVentures, xchangeListings,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { SolbidModule, SolbidClient } from '../solbid/solbid.controller';
import { ClubController, memberSlug } from './club.controller';

const EPC_SECTORS = ['solar', 'construction_epc', 'infrastructure', 'power_equipment'];

@ApiTags('join')
@Controller()
export class JoinController {
  constructor(@InjectDb() private db: Db, private audit: AuditService, private solbid: SolbidClient) {}

  private org(ctx: RequestContext) {
    if (!ctx.orgId) throw new ForbiddenException('Create or choose your business account first');
    return ctx.orgId;
  }
  private manager(ctx: RequestContext, orgId: string) {
    return ctx.memberships.some((m) => m.organizationId === orgId && (m.role === 'org_owner' || m.role === 'org_admin'));
  }
  private async load(orgId: string) {
    const [p] = await this.db.select().from(collabJoinProfiles).where(eq(collabJoinProfiles.orgId, orgId)).limit(1);
    return p ?? null;
  }

  @Get('join/profile')
  @RequireOrg()
  async profile(@Ctx() ctx: RequestContext) {
    const orgId = this.org(ctx);
    const p = await this.load(orgId);
    // Suggestions start from the industry given at onboarding, if any.
    const [o] = await this.db.select({ sectors: partnerProfiles.sectors }).from(partnerProfiles).where(eq(partnerProfiles.organizationId, orgId)).limit(1);
    const sector = p?.sector ?? o?.sectors?.[0] ?? null;
    return { profile: p, industry: sector, canEdit: this.manager(ctx, orgId), suggested: sector ? suggestIntents(sector) : ['free_power', 'promote'] };
  }

  @Put('join/profile')
  @RequireOrg()
  async save(@Ctx() ctx: RequestContext, @Body(body(JoinProfileSchema)) b: JoinProfile) {
    const orgId = this.org(ctx);
    if (!this.manager(ctx, orgId)) throw new ForbiddenException('Only the owner or an admin of your business can change how it collaborates');
    const before = await this.load(orgId);
    const [org] = await this.db.select({ name: organizations.displayName }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    const values = { sector: b.sector, intents: b.intents, about: b.about ?? null, city: b.city ?? null, micrositePublic: b.micrositePublic, slug: before?.slug ?? memberSlug(org?.name ?? 'member', orgId), updatedBy: ctx.userId, updatedAt: new Date() };
    const [p] = await this.db.insert(collabJoinProfiles).values({ orgId, ...values }).onConflictDoUpdate({ target: collabJoinProfiles.orgId, set: values }).returning();
    await this.audit.record(ctx, { action: before ? 'join.profile_updated' : 'join.profile_created', objectType: 'organization', objectId: orgId,
      before: before ? { sector: before.sector, intents: before.intents } : undefined, after: { sector: p.sector, intents: p.intents } });
    return p;
  }

  /** The member's collaboration board. */
  @Get('join/board')
  @RequireOrg()
  async board(@Ctx() ctx: RequestContext) {
    const orgId = this.org(ctx);
    const p = await this.load(orgId);
    if (!p) throw new NotFoundException('Tell us your industry and how you want to collaborate first');
    const cards = await Promise.all(p.intents.map((c) => this.card(c, orgId, p.sector)));
    // Unite businesses for this member (regulated ones only once cleared).
    const vs = await this.db.select().from(uniteVentures).where(or(isNull(uniteVentures.regulatedReason), isNotNull(uniteVentures.clearedAt))).limit(200);
    const ventures = vs.map((v) => ({ v, reasons: ventureReasons(v, p) })).filter((x) => x.reasons).sort((a, b) => b.reasons!.length - a.reasons!.length || a.v.num - b.v.num).slice(0, 12)
      .map((x) => ({ slug: x.v.slug, name: x.v.name, tagline: x.v.tagline, open: x.v.open, reasons: x.reasons }));
    // Business offers from other members in the same industry, or in the industries behind the chosen collaborations.
    const sectors = [...new Set([p.sector, ...p.intents.flatMap((c) => [...(joinIntent(c)?.sectors ?? [])])])];
    const rows = await this.db.select({ b: businessOffers, o: opportunities, owner: organizations.displayName }).from(businessOffers)
      .innerJoin(opportunities, eq(opportunities.id, businessOffers.opportunityId)).innerJoin(organizations, eq(organizations.id, opportunities.ownerOrgId))
      .where(and(inArray(businessOffers.status, OFFER_OPEN), ne(opportunities.ownerOrgId, orgId), inArray(opportunities.sector, sectors), sql`${businessOffers.expiresOn} >= current_date`,
        // Offers in a Unite first-look window stay hidden until released, as on the Business Offers page.
        or(isNull(businessOffers.uniteReviewUntil), isNotNull(businessOffers.uniteReleasedAt), lt(businessOffers.uniteReviewUntil, new Date()), eq(businessOffers.uniteReviewOrgId, orgId))))
      .orderBy(desc(businessOffers.createdAt)).limit(10);
    const offers = rows.map((r) => ({
      id: r.o.id, title: r.o.title, category: offerCategoryLabel(r.b.category), owner: r.owner, city: r.o.city,
      reasons: [r.o.sector === p.sector ? `Same industry: ${sectorName(r.o.sector as SectorCode)}` : `Fits what you chose: ${sectorName(r.o.sector as SectorCode)}`],
    }));
    const [{ peers }] = await this.db.select({ peers: sql<number>`count(*)::int` }).from(collabJoinProfiles).where(and(eq(collabJoinProfiles.sector, p.sector), ne(collabJoinProfiles.orgId, orgId)));
    return {
      profile: { sector: p.sector, sectorName: sectorName(p.sector as SectorCode), intents: p.intents, about: p.about, city: p.city, micrositePublic: p.micrositePublic, slug: p.slug, updatedAt: p.updatedAt },
      club: await this.clubSummary(orgId),
      cards, ventures, offers, peers,
      note: 'Matched by rules: your industry and the collaborations you chose. Each match shows why. Matches are suggestions, not offers of work or guarantees of income.',
    };
  }

  private async clubSummary(orgId: string) {
    const rows = await this.db.select({ status: clubProducts.status, n: sql<number>`count(*)::int` }).from(clubProducts).where(eq(clubProducts.orgId, orgId)).groupBy(clubProducts.status);
    const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    const [{ power }] = await this.db.select({ power: sql<number>`count(*)::int` }).from(clubPowerRequests).where(eq(clubPowerRequests.orgId, orgId));
    return { approved: by.approved ?? 0, submitted: by.submitted ?? 0, drafts: (by.draft ?? 0) + (by.rejected ?? 0), powerRequests: power };
  }

  private async card(code: string, orgId: string, sector: string) {
    const i = joinIntent(code);
    if (!i) return { code, label: code, blurb: '', icon: 'check', links: [], stats: [] };
    const stats: { label: string; value: number | null; note?: string }[] = [];
    const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
    const count = sql<number>`count(*)::int`;
    switch (i.code) {
      case 'epc_partner': {
        stats.push({ label: 'Open energy and EPC tenders', value: await n(this.db.select({ n: count }).from(tenders).where(and(eq(tenders.status, 'published'), gt(tenders.closesAt, new Date()), ne(tenders.issuerOrgId, orgId), inArray(tenders.sector, EPC_SECTORS)))) });
        const sb = await this.solbid.publicBoard() as { connected: boolean; available?: boolean; openProjects?: number };
        stats.push(sb.connected && sb.available ? { label: 'Open projects on SOLBID', value: Number(sb.openProjects ?? 0) } : { label: 'Open projects on SOLBID', value: null, note: sb.connected ? 'SOLBID is not responding right now' : 'SOLBID is not connected yet' });
        break;
      }
      case 'barter':
        stats.push({ label: 'Active listings in the barter club', value: await n(this.db.select({ n: count }).from(xchangeListings).where(and(eq(xchangeListings.status, 'active'), ne(xchangeListings.orgId, orgId)))) });
        break;
      case 'trading':
        stats.push({ label: `Open buying requirements in ${sectorName(sector as SectorCode)}`, value: await n(this.db.select({ n: count }).from(tradeRequirements).where(and(eq(tradeRequirements.status, 'open'), eq(tradeRequirements.sector, sector), ne(tradeRequirements.buyerOrgId, orgId)))) });
        break;
      case 'export_import':
        stats.push({ label: 'Cross-border enquiries routed to you', value: await n(this.db.select({ n: count }).from(crossBorderEnquiries).where(and(eq(crossBorderEnquiries.routedToOrgId, orgId), eq(crossBorderEnquiries.status, 'open')))) });
        break;
      case 'buy_power':
        stats.push({ label: 'Power plants offering capacity on the Green Park market', value: await n(this.db.select({ n: count }).from(energyListings).where(and(eq(energyListings.side, 'plant'), eq(energyListings.status, 'live')))) });
        stats.push({ label: 'Your open power requests', value: await n(this.db.select({ n: count }).from(clubPowerRequests).where(and(eq(clubPowerRequests.orgId, orgId), inArray(clubPowerRequests.status, ['new', 'in_progress', 'proposal_sent'])))) });
        break;
      case 'solar_products':
        stats.push({ label: 'Your products approved for the Unite brand', value: await n(this.db.select({ n: count }).from(clubProducts).where(and(eq(clubProducts.orgId, orgId), eq(clubProducts.status, 'approved')))) });
        stats.push({ label: 'Waiting for Unite review', value: await n(this.db.select({ n: count }).from(clubProducts).where(and(eq(clubProducts.orgId, orgId), eq(clubProducts.status, 'submitted')))) });
        break;
      case 'promote':
        stats.push({ label: 'Unite businesses open to partners', value: await n(this.db.select({ n: count }).from(uniteVentures).where(and(eq(uniteVentures.open, true), or(isNull(uniteVentures.regulatedReason), isNotNull(uniteVentures.clearedAt))))) });
        break;
      case 'property':
        stats.push({ label: 'Property projects open to partners', value: await n(this.db.select({ n: count }).from(propertyProjects).where(and(eq(propertyProjects.openToPartners, true), eq(propertyProjects.status, 'selling')))) });
        break;
      case 'jobs_teams':
        stats.push({ label: 'Open micro-contracts', value: await n(this.db.select({ n: count }).from(microContracts).where(and(eq(microContracts.status, 'open'), ne(microContracts.orgId, orgId)))) });
        break;
      case 'learning':
        stats.push({ label: 'Courses available', value: await n(this.db.select({ n: count }).from(courses).where(and(eq(courses.status, 'published'), or(isNull(courses.sector), eq(courses.sector, sector))))) });
        break;
      default: break; // free_power, solar_products, launch: action cards — the next step is the member's own request
    }
    return { code: i.code, label: i.label, blurb: i.blurb, icon: i.icon, links: i.links.map(([href, label]) => ({ href, label })), stats };
  }
}

/** Public list of the ways to collaborate (the /join page renders it from the shared types; this serves other clients). */
@ApiTags('join')
@Controller()
export class JoinPublicController {
  @Public()
  @Get('public/join/options')
  options() { return { intents: JOIN_INTENTS.map(({ code, label, blurb }) => ({ code, label, blurb })) }; }
}

@Module({ imports: [SolbidModule], controllers: [JoinController, JoinPublicController, ClubController] })
export class JoinModule {}
