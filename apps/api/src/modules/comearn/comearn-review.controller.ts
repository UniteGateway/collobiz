/**
 * COMEARN part 3 (tested in test/comearn-review.e2e.ts):
 *  - Unite review before publishing: companies submit; Unite negotiates (counter-proposals the company accepts or declines),
 *    sets the Unite margin and releases. Members only ever see the rate after the margin.
 *  - Unite Guaranteed: a super admin marks selected listings, only when the guarantee terms are written and legally reviewed.
 *  - Ratings after a paid commission (member ↔ company), real ratings only.
 *  - Sample listings for demonstration (labelled Sample, excluded from counts).
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { CE_CATEGORIES, CeCounterSchema, CeRatingSchema, CeReleaseSchema, ceMemberTerms, type CeCategory, type CeModel, type CeType } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { ceCommissions, ceEngagements, ceNegotiations, ceOpportunities, ceRatings, memberships, notifications, organizations, siteSettings } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomDigits } from '../../common/crypto';
import { config } from '../../config';

const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
type Opp = typeof ceOpportunities.$inferSelect;

@ApiTags('comearn')
@Controller()
export class ComearnReviewController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private on() { if (!config().FEATURE_COMEARN) throw new NotFoundException('COMEARN is not enabled'); }
  private staffOnly(ctx: RequestContext) { if (!staff(ctx)) throw new ForbiddenException('Unite admins review COMEARN listings'); }
  private async opp(id: string) { const [o] = await this.db.select().from(ceOpportunities).where(eq(ceOpportunities.id, id)).limit(1); if (!o) throw new NotFoundException('Opportunity not found'); return o; }
  private async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const team = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active'), inArray(memberships.role, ['org_owner', 'org_admin'])));
    if (team.length) await this.db.insert(notifications).values(team.map((m) => ({ userId: m.u, kind: 'comearn', title, body: text, link })));
  }
  private async settings() { const [s] = await this.db.select().from(siteSettings).where(eq(siteSettings.key, 'comearn')).limit(1); return (s?.value ?? {}) as { guaranteeTerms?: string | null; guaranteeLegalReviewed?: boolean }; }

  // ------------------------------------------------------------------ negotiation and release
  /** Unite proposes different company terms (for example a higher commission so the listing attracts members). */
  @Post('admin/comearn/opportunities/:id/counter')
  @HttpCode(201)
  async counter(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(CeCounterSchema)) b: z.infer<typeof CeCounterSchema>) {
    this.on(); this.staffOnly(ctx); const o = await this.opp(id);
    if (!['in_review', 'negotiating'].includes(o.status)) throw new ConflictException('Only listings under review can be negotiated');
    if ((o.model === 'fixed') !== (b.fixedPaise != null)) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { [o.model === 'fixed' ? 'fixedPaise' : 'rateBps']: o.model === 'fixed' ? 'Propose an amount' : 'Propose a percentage' } });
    await this.db.update(ceNegotiations).set({ status: 'declined', respondedAt: new Date() }).where(and(eq(ceNegotiations.opportunityId, o.id), eq(ceNegotiations.status, 'open')));
    const [n] = await this.db.insert(ceNegotiations).values({ opportunityId: o.id, fromSide: 'unite', proposedRateBps: b.rateBps ?? null, proposedFixedPaise: b.fixedPaise ?? null, note: b.note, createdBy: ctx.userId }).returning();
    await this.db.update(ceOpportunities).set({ status: 'negotiating', updatedAt: new Date() }).where(eq(ceOpportunities.id, o.id));
    await this.notifyOrg(o.orgId, `COMEARN: Unite proposed new terms — ${o.title}`, b.note.slice(0, 160), '/comearn/offer');
    await this.audit.record(ctx, { action: 'comearn.counter', objectType: 'ce_opportunity', objectId: o.id, after: { rateBps: b.rateBps, fixedPaise: b.fixedPaise } });
    return n;
  }

  @Post('comearn/negotiations/:id/respond')
  @RequireOrg()
  @HttpCode(200)
  async respond(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['accept', 'decline']), note: z.string().trim().max(600).optional() }))) b: { decision: 'accept' | 'decline'; note?: string }) {
    this.on();
    const m = ctx.memberships?.find((x) => x.organizationId === ctx.orgId); if (m && !['org_owner', 'org_admin'].includes(m.role)) throw new ForbiddenException('Only owners and admins of your business can do this');
    const [n] = await this.db.select().from(ceNegotiations).where(eq(ceNegotiations.id, id)).limit(1);
    if (!n) throw new NotFoundException();
    const o = await this.opp(n.opportunityId);
    if (o.orgId !== ctx.orgId) throw new NotFoundException();
    if (n.status !== 'open') throw new ConflictException('Already answered');
    await this.db.update(ceNegotiations).set({ status: b.decision === 'accept' ? 'accepted' : 'declined', respondedBy: ctx.userId, respondedAt: new Date() }).where(eq(ceNegotiations.id, id));
    if (b.note) await this.db.insert(ceNegotiations).values({ opportunityId: o.id, fromSide: 'company', note: b.note, status: 'info', createdBy: ctx.userId });
    const set = b.decision === 'accept'
      ? { companyRateBps: n.proposedRateBps ?? o.companyRateBps, companyFixedPaise: n.proposedFixedPaise ?? o.companyFixedPaise, rateBps: n.proposedRateBps ?? o.rateBps, fixedPaise: n.proposedFixedPaise ?? o.fixedPaise, version: o.version + 1 }
      : {};
    await this.db.update(ceOpportunities).set({ ...set, status: 'in_review', updatedAt: new Date() }).where(eq(ceOpportunities.id, o.id));
    await this.audit.record(ctx, { action: `comearn.counter_${b.decision}`, objectType: 'ce_opportunity', objectId: o.id });
    return { status: 'in_review', accepted: b.decision === 'accept' };
  }

  /** Unite sets its margin and releases the listing to members. Members see the company rate minus the margin. */
  @Post('admin/comearn/opportunities/:id/release')
  @HttpCode(200)
  async release(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(CeReleaseSchema)) b: z.infer<typeof CeReleaseSchema>) {
    this.on(); this.staffOnly(ctx); const o = await this.opp(id);
    if (o.status !== 'in_review') throw new ConflictException(o.status === 'negotiating' ? 'Wait for the company to answer your proposal' : 'Only listings under review can be released');
    const company = { model: o.model as CeModel, rateBps: o.companyRateBps ?? o.rateBps, fixedPaise: o.companyFixedPaise ?? o.fixedPaise };
    const member = ceMemberTerms(company, { bps: b.marginBps, paise: b.marginPaise });
    if (!member) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { [o.model === 'fixed' ? 'marginPaise' : 'marginBps']: 'The Unite margin must leave a commission for the member' } });
    await this.db.update(ceOpportunities).set({ rateBps: member.rateBps, fixedPaise: member.fixedPaise, companyRateBps: company.rateBps ?? null, companyFixedPaise: company.fixedPaise ?? null, uniteMarginBps: member.marginBps, uniteMarginPaise: member.marginPaise,
      approvedVersion: o.version, releasedBy: ctx.userId, releasedAt: new Date(), reviewNote: b.note ?? null, status: 'live', updatedAt: new Date() }).where(eq(ceOpportunities.id, o.id));
    await this.notifyOrg(o.orgId, `COMEARN: ${o.title} is live`, b.note ?? 'Unite released your listing to members.', `/comearn/opportunities/${o.id}`);
    await this.audit.record(ctx, { action: 'comearn.released', objectType: 'ce_opportunity', objectId: o.id, after: { marginBps: member.marginBps, marginPaise: member.marginPaise, memberRateBps: member.rateBps, memberFixedPaise: member.fixedPaise } });
    return { status: 'live', member };
  }

  @Post('admin/comearn/opportunities/:id/return')
  @HttpCode(200)
  async returnToCompany(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ note: z.string().trim().min(5).max(600) }))) b: { note: string }) {
    this.on(); this.staffOnly(ctx); const o = await this.opp(id);
    if (!['in_review', 'negotiating'].includes(o.status)) throw new ConflictException('Only listings under review can be returned');
    await this.db.update(ceOpportunities).set({ status: 'draft', reviewNote: b.note, updatedAt: new Date() }).where(eq(ceOpportunities.id, o.id));
    await this.notifyOrg(o.orgId, `COMEARN: ${o.title} returned by Unite`, b.note, '/comearn/offer');
    return { status: 'draft' };
  }

  /** Unite Guaranteed badge — super admin only, and only after the guarantee terms are written and legally reviewed. */
  @Put('admin/comearn/opportunities/:id/guarantee')
  async guarantee(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ on: z.boolean() }))) b: { on: boolean }) {
    this.on(); if (!ctx.platformRoles.includes('super_admin')) throw new ForbiddenException('Only a super admin grants Unite Guaranteed');
    const s = await this.settings();
    if (b.on && (!s.guaranteeTerms || !s.guaranteeLegalReviewed)) throw new ConflictException('Write the Unite Guarantee terms and confirm legal review in COMEARN settings first');
    const o = await this.opp(id);
    if (b.on && o.status !== 'live') throw new ConflictException('Only live listings can be guaranteed');
    await this.db.update(ceOpportunities).set({ uniteGuaranteed: b.on, updatedAt: new Date() }).where(eq(ceOpportunities.id, o.id));
    await this.audit.record(ctx, { action: b.on ? 'comearn.guaranteed' : 'comearn.guarantee_removed', objectType: 'ce_opportunity', objectId: o.id });
    return { uniteGuaranteed: b.on };
  }

  // ------------------------------------------------------------------ ratings
  @Post('comearn/engagements/:id/rate')
  @RequireOrg()
  @HttpCode(201)
  async rate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(CeRatingSchema)) b: z.infer<typeof CeRatingSchema>) {
    this.on();
    const [e] = await this.db.select().from(ceEngagements).where(eq(ceEngagements.id, id)).limit(1); if (!e) throw new NotFoundException();
    const o = await this.opp(e.opportunityId);
    const side = e.earnerOrgId === ctx.orgId ? 'earner' : o.orgId === ctx.orgId ? 'company' : null;
    if (!side) throw new NotFoundException();
    const [paid] = await this.db.select({ id: ceCommissions.id }).from(ceCommissions).where(and(eq(ceCommissions.engagementId, e.id), eq(ceCommissions.status, 'paid'))).limit(1);
    if (!paid) throw new ConflictException('Ratings open once a commission on this engagement has been paid');
    const [r] = await this.db.insert(ceRatings).values({ engagementId: e.id, fromOrgId: ctx.orgId!, toOrgId: side === 'earner' ? o.orgId : e.earnerOrgId, asRole: side === 'earner' ? 'company' : 'earner', stars: b.stars, comment: b.comment ?? null, createdBy: ctx.userId })
      .onConflictDoNothing().returning();
    if (!r) throw new ConflictException('You have already rated this engagement');
    return r;
  }

  // ------------------------------------------------------------------ sample listings (demonstration)
  /** Creates labelled Sample listings across Unite businesses and demo companies, released with illustrative rates.
   *  Idempotent per title. Excluded from admin counts. Not for production data. */
  @Post('admin/comearn/samples')
  @HttpCode(201)
  async samples(@Ctx() ctx: RequestContext) {
    this.on(); this.staffOnly(ctx);
    const orgs = await this.db.select({ id: organizations.id, n: organizations.displayName }).from(organizations);
    const byName = new Map(orgs.map((o) => [o.n, o.id]));
    const made: string[] = [];
    for (const x of SAMPLES) {
      const orgId = byName.get(x.org); if (!orgId) continue;
      const [exists] = await this.db.select({ id: ceOpportunities.id }).from(ceOpportunities).where(and(eq(ceOpportunities.title, x.title), eq(ceOpportunities.sample, true))).limit(1);
      if (exists) continue;
      const fixed = x.model === 'fixed';
      const member = ceMemberTerms({ model: x.model, rateBps: fixed ? null : x.rate, fixedPaise: fixed ? x.rate : null }, fixed ? { paise: x.margin } : { bps: x.margin })!;
      await this.db.insert(ceOpportunities).values({ code: `CE-${new Date().getUTCFullYear()}-${randomDigits(6)}`, orgId, title: x.title, type: x.type, category: x.category, description: x.description, territory: x.territory,
        estimatedValuePaise: x.value ?? null, model: x.model, rateBps: member.rateBps, fixedPaise: member.fixedPaise, companyRateBps: fixed ? null : x.rate, companyFixedPaise: fixed ? x.rate : null,
        uniteMarginBps: member.marginBps, uniteMarginPaise: member.marginPaise, milestones: x.model === 'milestone' ? [{ label: 'Order confirmed', pct: 40 }, { label: 'Project commissioned', pct: 60 }] : [], recurringMonths: x.model === 'recurring' ? 12 : null,
        trigger: x.trigger ?? 'customer_payment', paymentDays: 30, licenceNote: x.category === 'real_estate' ? 'Sample — RERA registration number to be added before launch' : null,
        status: 'live', approvedVersion: 1, releasedBy: ctx.userId, releasedAt: new Date(), sample: true, createdBy: ctx.userId });
      made.push(x.title);
    }
    await this.audit.record(ctx, { action: 'comearn.samples_loaded', objectType: 'ce_opportunity', objectId: 'samples', after: { created: made.length } });
    return { created: made.length };
  }
}

const L = 1e5 * 100; const CR = 1e7 * 100;
type S = { org: string; title: string; type: CeType; category: CeCategory; description: string; territory: string; model: CeModel; rate: number; margin: number; value?: number; trigger?: 'customer_payment' | 'order_confirmed' | 'agreement_signed' | 'milestone_completed' };
/** Illustrative sample listings (rates are examples, labelled Sample on screen). */
const SAMPLES: S[] = [
  { org: 'Unite Solar', title: 'Rooftop solar for factories and warehouses', type: 'sales_conversion', category: 'solar', description: 'Introduce factories and warehouses that want rooftop solar (100 kW–2 MW). Unite Solar designs, installs and maintains.', territory: 'Telangana, Andhra Pradesh', model: 'percent', rate: 250, margin: 50, value: 2 * CR },
  { org: 'Unite Solar', title: 'Home rooftop solar — PM Surya Ghar customers', type: 'lead_generation', category: 'solar', description: 'Qualified homeowners who want a 3–10 kW rooftop system. Paid when the system is installed and paid for.', territory: 'Hyderabad', model: 'fixed', rate: 3000_00, margin: 500_00, value: 2 * L },
  { org: 'Unite Green Energy Projects', title: 'Open-access solar power buyers (1 MW+)', type: 'business_introduction', category: 'solar', description: 'Introduce HT consumers interested in long-term solar/hybrid power purchase agreements.', territory: 'South India', model: 'percent', rate: 100, margin: 25, value: 10 * CR, trigger: 'agreement_signed' },
  { org: 'Unite Green Infra', title: 'Solar park land owners', type: 'business_introduction', category: 'solar', description: 'Introduce owners of 50+ acres of non-agricultural land near substations for lease to solar parks.', territory: 'Telangana', model: 'fixed', rate: 50000_00, margin: 10000_00, trigger: 'agreement_signed' },
  { org: 'Powertek', title: 'Transformers and switchgear for EPC contractors', type: 'sales_conversion', category: 'industrial', description: 'Orders for distribution transformers, HT/LT panels and switchgear from EPC contractors and industries.', territory: 'All India', model: 'percent', rate: 300, margin: 75, value: 50 * L },
  { org: 'Powertek', title: 'Powertek dealers in district towns', type: 'dealer_development', category: 'industrial', description: 'Appoint dealers for Powertek electrical products. Paid when the dealer agreement is signed and the first order is paid.', territory: 'Telangana, Karnataka', model: 'fixed', rate: 25000_00, margin: 5000_00, trigger: 'agreement_signed' },
  { org: 'Unite Steel', title: 'Structural steel orders from builders', type: 'sales_conversion', category: 'industrial', description: 'TMT and structural steel orders from builders and contractors.', territory: 'Hyderabad, Vijayawada', model: 'percent', rate: 75, margin: 15, value: 1 * CR },
  { org: 'Unite Cement', title: 'Cement orders from contractors and RMC plants', type: 'recurring_sales', category: 'industrial', description: 'Introduce contractors and ready-mix plants for regular cement supply; commission on repeat orders for 12 months.', territory: 'Telangana', model: 'recurring', rate: 50, margin: 10, value: 25 * L },
  { org: 'UNITIF Green Industrial Parks', title: 'Factory plots in green industrial parks', type: 'business_introduction', category: 'industrial', description: 'Introduce manufacturers looking for plots or built-to-suit sheds in a green industrial park.', territory: 'Telangana', model: 'percent', rate: 100, margin: 25, value: 5 * CR, trigger: 'agreement_signed' },
  { org: 'Unite Global Infra Projects', title: 'EPC projects — private and government', type: 'project_development', category: 'industrial', description: 'Bring infrastructure EPC projects; commission paid in milestones as the project progresses.', territory: 'India', model: 'milestone', rate: 50, margin: 10, value: 25 * CR, trigger: 'milestone_completed' },
  { org: 'Unite Exim', title: 'Export orders for Indian manufacturers', type: 'export_orders', category: 'exports', description: 'Bring confirmed export orders from overseas buyers for products sourced through Unite Exim.', territory: 'UAE, Africa, South-East Asia', model: 'percent', rate: 200, margin: 50, value: 1 * CR, trigger: 'customer_payment' },
  { org: 'Unite Exim', title: 'Overseas buyers for spices and agri products', type: 'export_orders', category: 'exports', description: 'Introduce importers of spices, rice and pulses. Paid on the first shipment payment.', territory: 'Middle East, Europe', model: 'percent', rate: 150, margin: 40, value: 50 * L },
  { org: 'Unite Developers Global Inc.', title: 'Buyers for apartments in Hyderabad West', type: 'sales_conversion', category: 'real_estate', description: 'Introduce home buyers for apartments. Paid after registration and payment. Brokers must be registered where required.', territory: 'Hyderabad', model: 'percent', rate: 150, margin: 50, value: 1 * CR },
  { org: 'Unite Aqua', title: 'Water treatment plants for industries', type: 'sales_conversion', category: 'industrial', description: 'Orders for ETP/STP and RO plants for factories, hotels and apartments.', territory: 'South India', model: 'percent', rate: 300, margin: 75, value: 40 * L },
  { org: 'EV Panther', title: 'Electric two-wheeler dealers', type: 'dealer_development', category: 'franchise', description: 'Appoint EV dealers in tier-2 and tier-3 towns.', territory: 'Telangana, AP', model: 'fixed', rate: 20000_00, margin: 5000_00, trigger: 'agreement_signed' },
  { org: 'EV Panther', title: 'Fleet orders for electric scooters', type: 'sales_conversion', category: 'logistics', description: 'Orders from delivery companies and fleets for electric scooters.', territory: 'Hyderabad, Bengaluru', model: 'percent', rate: 200, margin: 50, value: 30 * L },
  { org: '99Films', title: 'Corporate film and ad production clients', type: 'sales_conversion', category: 'software', description: 'Introduce companies needing brand films, ads and product videos.', territory: 'India', model: 'percent', rate: 1000, margin: 200, value: 10 * L },
  { org: 'Volt EPC', title: 'Commercial solar EPC projects', type: 'sales_conversion', category: 'solar', description: 'Introduce schools, hospitals and malls for 50–500 kW solar EPC.', territory: 'Telangana', model: 'percent', rate: 200, margin: 50, value: 75 * L },
  { org: 'Deccan Distributors', title: 'Retailers for FMCG distribution', type: 'dealer_development', category: 'logistics', description: 'Onboard kirana and supermarket retailers to our distribution network.', territory: 'Hyderabad', model: 'fixed', rate: 2000_00, margin: 500_00, trigger: 'order_confirmed' },
  { org: 'Deccan Distributors', title: 'Warehouse space clients', type: 'business_introduction', category: 'logistics', description: 'Introduce companies looking for warehousing and last-mile distribution.', territory: 'Hyderabad', model: 'percent', rate: 500, margin: 100, value: 20 * L, trigger: 'agreement_signed' },
  { org: 'Sunrise Traders', title: 'Office supplies for corporates', type: 'recurring_sales', category: 'other', description: 'Corporate customers for stationery and office supplies, commission on repeat orders.', territory: 'Hyderabad', model: 'recurring', rate: 300, margin: 75, value: 5 * L },
  { org: 'Meera Iyer Consulting', title: 'Clients for ISO and compliance consulting', type: 'business_introduction', category: 'software', description: 'Introduce SMEs needing ISO 9001/14001 certification and compliance consulting.', territory: 'India', model: 'percent', rate: 1000, margin: 250, value: 3 * L, trigger: 'agreement_signed' },
  { org: 'Unite Group Inc.', title: 'Franchise partners for Unite brands', type: 'franchise_development', category: 'franchise', description: 'Introduce entrepreneurs who open a Unite brand franchise store or experience centre.', territory: 'India', model: 'fixed', rate: 50000_00, margin: 10000_00, trigger: 'agreement_signed' },
  { org: 'Unite Group Inc.', title: 'Technology partners for solar monitoring', type: 'technology_collaboration', category: 'software', description: 'Introduce IoT and software companies for a solar monitoring technology partnership.', territory: 'Global', model: 'fixed', rate: 100000_00, margin: 25000_00, trigger: 'agreement_signed' },
  { org: 'Volt EPC', title: 'Suppliers for solar mounting structures', type: 'procurement', category: 'solar', description: 'Connect us with fabricators who can supply mounting structures at volume.', territory: 'South India', model: 'percent', rate: 100, margin: 25, value: 50 * L, trigger: 'order_confirmed' },
];
void desc; void CE_CATEGORIES;
export type { Opp };
