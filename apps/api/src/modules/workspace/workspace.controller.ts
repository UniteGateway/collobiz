/**
 * Unite Group workspace — the group-wide home for Unite staff on the shared COLLABIZ platform: one sign-in, one database,
 * one permission model. Everything here is computed from records that exist; nothing is estimated or typed in.
 *
 * Rules (tested in test/workspace.e2e.ts):
 *  - Unite Group staff (any platform role) only.
 *  - Search returns only record types the person's roles can already open elsewhere.
 *  - Integration status is read from configuration; secrets are never returned.
 */
import { Controller, ForbiddenException, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { countryLabel } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  catalogItems, commissionEntries, directOffers, groupCompanies, growthContacts, growthMessages, meetingAttendees, meetings, memberships, offerSales, opportunities,
  growthAgents, growthRuns, kybReviews, organizations, pilotFeedback, projects, supportTickets, uniteVentures, users, ventureInterests,
} from '../../db/schema';
import { Ctx, type RequestContext } from '../../common/context';
import { config } from '../../config';

const OPEN_OPPORTUNITY = ['verified', 'unite_priority_review', 'accepted', 'released', 'qualification', 'proposal', 'negotiation'];
const LIVE_PROJECT = ['planning', 'active', 'on_hold'];
const PARTNER = ['partner_company', 'partner_individual'];
const startOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };

function staff(ctx: RequestContext) {
  if (!ctx.platformRoles.length) throw new ForbiddenException('The workspace is for Unite Group staff');
}

@Injectable()
export class WorkspaceService {
  constructor(@InjectDb() private db: Db) {}

  async companies() {
    const rows = await this.db.select({ o: organizations, g: groupCompanies }).from(groupCompanies).innerJoin(organizations, eq(organizations.id, groupCompanies.organizationId)).orderBy(asc(organizations.displayName));
    const ids = rows.map((r) => r.o.id);
    if (!ids.length) return [];
    const people = await this.db.select({ org: memberships.organizationId, n: sql<number>`count(distinct ${memberships.userId})::int` }).from(memberships).where(and(inArray(memberships.organizationId, ids), eq(memberships.status, 'active'))).groupBy(memberships.organizationId);
    const proj = await this.db.select({ org: projects.ownerOrgId, n: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${projects.value}), 0)::bigint` }).from(projects).where(and(inArray(projects.ownerOrgId, ids), inArray(projects.status, LIVE_PROJECT))).groupBy(projects.ownerOrgId);
    const ventures = await this.db.select({ org: uniteVentures.groupCompanyOrgId, n: sql<number>`count(*)::int` }).from(uniteVentures).where(inArray(uniteVentures.groupCompanyOrgId, ids)).groupBy(uniteVentures.groupCompanyOrgId);
    const products = await this.db.select({ org: catalogItems.ownerOrgId, n: sql<number>`count(*)::int` }).from(catalogItems).where(inArray(catalogItems.ownerOrgId, ids)).groupBy(catalogItems.ownerOrgId);
    const offers = await this.db.select({ org: directOffers.issuerOrgId, n: sql<number>`count(*)::int` }).from(directOffers).where(and(inArray(directOffers.issuerOrgId, ids), eq(directOffers.status, 'open'))).groupBy(directOffers.issuerOrgId);
    const won = await this.db.select({ org: directOffers.issuerOrgId, value: sql<number>`coalesce(sum(${offerSales.saleValue}), 0)::bigint` }).from(offerSales).innerJoin(directOffers, eq(directOffers.id, offerSales.offerId))
      .where(and(inArray(directOffers.issuerOrgId, ids), inArray(offerSales.status, ['won', 'paid']))).groupBy(directOffers.issuerOrgId);
    const pick = <T extends { org: string | null }>(xs: T[], id: string) => xs.find((x) => x.org === id);
    const parentName = new Map(rows.map((r) => [r.o.id, r.o.displayName]));
    return rows.map(({ o, g }) => ({
      id: o.id, name: o.displayName, legalName: o.legalName, brand: g.brandName, category: g.category, country: o.country, countryName: countryLabel(o.country), city: o.city,
      sectors: g.sectors, description: g.description, website: g.website, status: g.status, parent: g.parentOrgId ? parentName.get(g.parentOrgId) ?? null : null,
      people: pick(people, o.id)?.n ?? 0, liveProjects: pick(proj, o.id)?.n ?? 0, projectValue: Number(pick(proj, o.id)?.value ?? 0),
      businesses: pick(ventures, o.id)?.n ?? 0, products: pick(products, o.id)?.n ?? 0, openOffers: pick(offers, o.id)?.n ?? 0, wonSales: Number(pick(won, o.id)?.value ?? 0),
    }));
  }
}

@ApiTags('workspace')
@Controller()
export class WorkspaceController {
  constructor(@InjectDb() private db: Db, private svc: WorkspaceService) {}

  @Get('admin/workspace')
  async home(@Ctx() ctx: RequestContext) {
    staff(ctx);
    const companies = await this.svc.companies();
    const [partners] = await this.db.select({ total: sql<number>`count(*)::int`, verified: sql<number>`count(*) filter (where ${organizations.verificationStatus} = 'verified')::int`, toVerify: sql<number>`count(*) filter (where ${organizations.verificationStatus} in ('submitted', 'under_review'))::int` })
      .from(organizations).where(inArray(organizations.type, PARTNER));
    const [proj] = await this.db.select({ n: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${projects.value}), 0)::bigint` }).from(projects).where(inArray(projects.status, LIVE_PROJECT));
    const [opps] = await this.db.select({ n: sql<number>`count(*)::int` }).from(opportunities).where(inArray(opportunities.status, OPEN_OPPORTUNITY));
    const [offersOpen] = await this.db.select({ n: sql<number>`count(*)::int` }).from(directOffers).where(eq(directOffers.status, 'open'));
    const [sales] = await this.db.select({ month: sql<number>`coalesce(sum(${offerSales.saleValue}) filter (where ${offerSales.updatedAt} >= ${startOfMonth()}), 0)::bigint`, all: sql<number>`coalesce(sum(${offerSales.saleValue}), 0)::bigint`, n: sql<number>`count(*)::int` })
      .from(offerSales).where(inArray(offerSales.status, ['won', 'paid']));
    const [staffCount] = await this.db.select({ n: sql<number>`count(distinct ${memberships.userId})::int` }).from(memberships).innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(eq(memberships.status, 'active'), inArray(organizations.type, ['platform', 'group_company'])));
    const [commissions] = await this.db.select({ toApprove: sql<number>`count(*) filter (where ${commissionEntries.status} = 'earned')::int`, paidMonth: sql<number>`coalesce(sum(${commissionEntries.payable}) filter (where ${commissionEntries.status} = 'settled' and ${commissionEntries.updatedAt} >= ${startOfMonth()}), 0)::bigint` }).from(commissionEntries);
    const [growth] = await this.db.select({ n: sql<number>`count(*)::int` }).from(growthMessages).where(eq(growthMessages.status, 'draft'));
    const [promoters] = await this.db.select({ n: sql<number>`count(*)::int` }).from(ventureInterests).where(eq(ventureInterests.status, 'pending'));
    const [tickets] = await this.db.select({ n: sql<number>`count(*)::int` }).from(supportTickets).where(inArray(supportTickets.status, ['open', 'in_progress', 'escalated']));
    const now = new Date();
    const upcoming = await this.db.select({ m: meetings, organizer: users.fullName, n: sql<number>`(select count(*)::int from meeting_attendees a where a.meeting_id = ${meetings.id})` }).from(meetingAttendees)
      .innerJoin(meetings, eq(meetings.id, meetingAttendees.meetingId)).innerJoin(users, eq(users.id, meetings.organizerUserId))
      .where(and(eq(meetingAttendees.userId, ctx.userId), gte(meetings.endsAt, now), eq(meetings.status, 'scheduled'))).orderBy(asc(meetings.startsAt)).limit(4);
    // Recent activity from the business records themselves (real events, newest first).
    const lim = 6;
    const [sold, asked, sent, verified, ran, checkins] = await Promise.all([
      this.db.select({ at: offerSales.createdAt, who: organizations.displayName, what: sql<string>`'registered a sale: ' || ${offerSales.buyerName}` }).from(offerSales).innerJoin(organizations, eq(organizations.id, offerSales.partnerOrgId)).orderBy(desc(offerSales.createdAt)).limit(lim),
      this.db.select({ at: ventureInterests.createdAt, who: organizations.displayName, what: sql<string>`'asked to promote ' || ${uniteVentures.name}` }).from(ventureInterests).innerJoin(organizations, eq(organizations.id, ventureInterests.organizationId)).innerJoin(uniteVentures, eq(uniteVentures.id, ventureInterests.ventureId)).orderBy(desc(ventureInterests.createdAt)).limit(lim),
      this.db.select({ at: directOffers.createdAt, who: organizations.displayName, what: sql<string>`'sent a direct offer: ' || ${directOffers.title}` }).from(directOffers).innerJoin(organizations, eq(organizations.id, directOffers.issuerOrgId)).orderBy(desc(directOffers.createdAt)).limit(lim),
      this.db.select({ at: kybReviews.createdAt, who: organizations.displayName, what: sql<string>`'was verified as a partner'` }).from(kybReviews).innerJoin(organizations, eq(organizations.id, kybReviews.organizationId)).where(eq(kybReviews.toStatus, 'verified')).orderBy(desc(kybReviews.createdAt)).limit(lim),
      this.db.select({ at: growthRuns.startedAt, who: growthAgents.name, what: sql<string>`'found ' || ${growthRuns.created} || ' new leads'` }).from(growthRuns).innerJoin(growthAgents, eq(growthAgents.id, growthRuns.agentId)).where(sql`${growthRuns.created} > 0`).orderBy(desc(growthRuns.startedAt)).limit(lim),
      this.db.select({ at: pilotFeedback.createdAt, who: organizations.displayName, what: sql<string>`'sent a pilot check-in'` }).from(pilotFeedback).innerJoin(organizations, eq(organizations.id, pilotFeedback.organizationId)).orderBy(desc(pilotFeedback.createdAt)).limit(lim),
    ]);
    const recent = [...sold, ...asked, ...sent, ...verified, ...ran, ...checkins].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 8);
    const countries = new Set(companies.map((c) => c.country).filter((c) => c !== 'XX'));
    const ctxCaps = ctx.caps;
    const approvals = [
      { key: 'verification', label: 'Partner verifications', n: partners.toVerify, href: '/verification', show: ctxCaps.has('kyb.review') },
      { key: 'promoters', label: 'Promoter requests', n: promoters.n, href: '/ventures', show: ctx.platformRoles.some((r) => r === 'unite_admin' || r === 'super_admin') },
      { key: 'growth', label: 'Outreach drafts to approve', n: growth.n, href: '/growth', show: ctx.platformRoles.some((r) => r === 'unite_admin' || r === 'super_admin') },
      { key: 'commissions', label: 'Commission to approve', n: commissions.toApprove, href: '/finance', show: ctxCaps.has('commission.approve') },
      { key: 'support', label: 'Open support tickets', n: tickets.n, href: 'web:/support/tickets', show: ctxCaps.has('support.manage') || ctx.platformRoles.includes('super_admin') },
    ].filter((a) => a.show).map(({ show: _s, ...a }) => a);
    return {
      me: { name: ctx.fullName },
      kpis: {
        groupCompanies: companies.length, countries: countries.size, staff: staffCount.n, partnersVerified: partners.verified, partners: partners.total,
        liveProjects: proj.n, projectPortfolio: Number(proj.value), openOpportunities: opps.n, openOffers: offersOpen.n,
        salesWonThisMonth: Number(sales.month), salesWonTotal: Number(sales.all), salesWonCount: sales.n, commissionPaidThisMonth: Number(commissions.paidMonth),
      },
      approvals,
      businessLines: companies.map((c) => ({ id: c.id, name: c.name, category: c.category, value: c.projectValue + c.wonSales, liveProjects: c.liveProjects, wonSales: c.wonSales })).filter((c) => c.value > 0).sort((a, b) => b.value - a.value).slice(0, 6),
      meetings: upcoming.map(({ m, organizer, n }) => ({ id: m.id, title: m.title, startsAt: m.startsAt, endsAt: m.endsAt, organizer, attendees: n })),
      activity: recent,
    };
  }

  @Get('admin/workspace/companies')
  async companies(@Ctx() ctx: RequestContext) {
    staff(ctx);
    const list = await this.svc.companies();
    const [staffCount] = await this.db.select({ n: sql<number>`count(distinct ${memberships.userId})::int` }).from(memberships).innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(eq(memberships.status, 'active'), inArray(organizations.type, ['platform', 'group_company'])));
    return {
      companies: list,
      totals: {
        companies: list.length, countries: new Set(list.map((c) => c.country).filter((c) => c !== 'XX')).size, people: staffCount.n,
        liveProjects: list.reduce((s, c) => s + c.liveProjects, 0), projectPortfolio: list.reduce((s, c) => s + c.projectValue, 0), businesses: list.reduce((s, c) => s + c.businesses, 0),
        sectors: new Set(list.flatMap((c) => c.sectors)).size,
      },
    };
  }

  /** One search box across the platform. Each result says which app opens it. */
  @Get('admin/workspace/search')
  async search(@Ctx() ctx: RequestContext, @Query('q') raw?: string) {
    staff(ctx);
    const q = (raw ?? '').trim();
    if (q.length < 2) return { q, groups: [] };
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const admin = ctx.platformRoles.some((r) => r === 'unite_admin' || r === 'super_admin');
    const orgs = await this.db.select({ id: organizations.id, name: organizations.displayName, type: organizations.type, city: organizations.city, country: organizations.country, status: organizations.verificationStatus })
      .from(organizations).where(and(or(ilike(organizations.displayName, like), ilike(organizations.legalName, like)), inArray(organizations.type, [...PARTNER, 'group_company']))).limit(8);
    const opps = await this.db.select({ id: opportunities.id, code: opportunities.code, title: opportunities.title, status: opportunities.status }).from(opportunities).where(or(ilike(opportunities.title, like), ilike(opportunities.code, like))).limit(6);
    const projs = await this.db.select({ id: projects.id, code: projects.code, title: projects.title, status: projects.status }).from(projects).where(or(ilike(projects.title, like), ilike(projects.code, like))).limit(6);
    const offs = admin ? await this.db.select({ id: directOffers.id, code: directOffers.code, title: directOffers.title, status: directOffers.status }).from(directOffers).where(or(ilike(directOffers.title, like), ilike(directOffers.code, like))).limit(6) : [];
    const vens = await this.db.select({ id: uniteVentures.id, slug: uniteVentures.slug, name: uniteVentures.name, tagline: uniteVentures.tagline }).from(uniteVentures).where(or(ilike(uniteVentures.name, like), ilike(uniteVentures.tagline, like), ilike(uniteVentures.category, like))).limit(6);
    const leads = admin ? await this.db.select({ id: growthContacts.id, name: growthContacts.organizationName, city: growthContacts.city, optedOut: isNotNull(growthContacts.optedOutAt) }).from(growthContacts)
      .where(or(ilike(growthContacts.organizationName, like), ilike(growthContacts.contactName, like), ilike(growthContacts.email, like))).limit(6) : [];
    const people = await this.db.selectDistinct({ id: users.id, name: users.fullName, org: organizations.displayName }).from(users).innerJoin(memberships, eq(memberships.userId, users.id)).innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(ilike(users.fullName, like), inArray(organizations.type, ['platform', 'group_company']), eq(memberships.status, 'active'))).limit(6);
    const groups = [
      { key: 'companies', label: 'Companies and partners', items: orgs.map((o) => ({ id: o.id, title: o.name, subtitle: `${o.type === 'group_company' ? 'Unite Group company' : o.status === 'verified' ? 'Verified partner' : 'Partner'} · ${[o.city, countryLabel(o.country)].filter(Boolean).join(', ')}`, href: o.type === 'group_company' ? '/workspace/companies' : `/verification/${o.id}` })) },
      { key: 'businesses', label: 'Unite businesses', items: vens.map((v) => ({ id: v.id, title: v.name, subtitle: v.tagline, href: `/ventures/${v.id}` })) },
      { key: 'opportunities', label: 'Opportunities', items: opps.map((o) => ({ id: o.id, title: o.title, subtitle: o.code, href: `web:/opportunities/${o.id}` })) },
      { key: 'projects', label: 'Projects', items: projs.map((p) => ({ id: p.id, title: p.title, subtitle: p.code, href: `web:/projects/${p.id}` })) },
      { key: 'offers', label: 'Direct offers', items: offs.map((o) => ({ id: o.id, title: o.title, subtitle: o.code, href: `/offers/${o.id}` })) },
      { key: 'leads', label: 'Lead database', items: leads.map((l) => ({ id: l.id, title: l.name, subtitle: l.optedOut ? 'Opted out' : l.city ?? 'Contact', href: `/growth/contacts?q=${encodeURIComponent(l.name)}` })) },
      { key: 'people', label: 'Unite Group people', items: people.map((p) => ({ id: p.id, title: p.name, subtitle: p.org, href: null })) },
    ].filter((g) => g.items.length);
    return { q, groups };
  }

  /** Connections to outside systems: whether each is configured (never the secret itself). */
  @Get('admin/workspace/integrations')
  integrations(@Ctx() ctx: RequestContext) {
    staff(ctx);
    const c = config();
    return [
      { key: 'email', name: 'E-mail delivery (SMTP)', purpose: 'Sign-in codes, invitations, notices', connected: c.MAIL_DRIVER === 'smtp' && !!c.SMTP_URL, needs: 'An SMTP account (Zoho, Google Workspace, SES, Brevo…)' },
      { key: 'erpnext', name: 'ERPNext', purpose: 'HR, payroll and accounting (Phases B and C)', connected: !!c.ERPNEXT_URL && !!c.ERPNEXT_API_KEY && !!c.ERPNEXT_API_SECRET, needs: 'An ERPNext site (self-hosted or Frappe Cloud) and an API key for a dedicated integration user' },
      { key: 'ai', name: 'AI provider (Claude)', purpose: 'Personal drafts, research and answers in words', connected: c.AI_PROVIDER !== 'rules', needs: 'An Anthropic API key' },
      { key: 'video', name: 'Video meetings', purpose: 'Live video in Meet', connected: c.MEETING_PROVIDER !== 'local', needs: 'A video provider (Jitsi or similar)' },
      { key: 'marketing', name: 'Marketing e-mail', purpose: 'Growth Desk outreach sending', connected: c.GROWTH_SENDING_ENABLED, needs: 'A separate marketing domain and bulk e-mail service' },
      { key: 'esign', name: 'E-signature', purpose: 'Legally binding signatures', connected: c.ESIGN_PROVIDER !== 'local', needs: 'An Aadhaar e-sign / DSC provider' },
      { key: 'storage', name: 'Cloud file storage', purpose: 'Documents at scale', connected: c.STORAGE_DRIVER === 's3', needs: 'S3-compatible storage credentials' },
    ];
  }
}

@Module({ controllers: [WorkspaceController], providers: [WorkspaceService] })
export class WorkspaceModule {}
