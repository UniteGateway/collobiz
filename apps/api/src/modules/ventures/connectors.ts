/**
 * Wave 3 connectors — live data from COLLABIZ modules on the pages of 17 Unite businesses (tested in test/connectors.e2e.ts).
 * Items carry an internal owner org for routing requests; `publicView` strips it before anything leaves the server.
 */
import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { CONNECTORS, OFFER_OPEN, capacityTypeLabel, offerCategoryLabel, sectorName, type ConnectorFeed, type SectorCode } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { actionItems, announcements, businessOffers, capacityOffers, catalogItems, clubPowerRequests, communityPosts, energyListings, enquiries, groupCompanies, meetings, microContracts, opportunities, organizations, proofShares, uniteVentures } from '../../db/schema';

export interface FeedItem { id: string; type: 'capacity' | 'offer' | 'energy' | 'product'; title: string; subtitle: string; ownerOrgId: string | null }
const DAYS30 = () => new Date(Date.now() - 30 * 86400_000);
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class ConnectorService {
  constructor(@InjectDb() private db: Db) {}

  private async powertekOrg() {
    const [g] = await this.db.select({ id: groupCompanies.organizationId }).from(groupCompanies).where(ilike(groupCompanies.brandName, '%powertek%')).limit(1);
    const [o] = g ? [g] : await this.db.select({ id: organizations.id }).from(organizations).where(ilike(organizations.displayName, '%powertek%')).limit(1);
    return o?.id ?? null;
  }

  /** Items a visitor can ask about (with owner for routing). */
  async items(feed: ConnectorFeed): Promise<FeedItem[]> {
    switch (feed.kind) {
      case 'capacity': {
        const rows = await this.db.select().from(capacityOffers).where(and(eq(capacityOffers.status, 'open'), inArray(capacityOffers.type, [...feed.types]), gte(capacityOffers.toDate, today()))).orderBy(capacityOffers.fromDate).limit(8);
        return rows.map((r) => ({ id: r.id, type: 'capacity', title: r.title, subtitle: `${r.units} ${capacityTypeLabel(r.type).toLowerCase()} · ${[r.city, r.state].filter(Boolean).join(', ')} · ${r.fromDate} to ${r.toDate}`, ownerOrgId: r.orgId }));
      }
      case 'offers': {
        // Same visibility as the public Business Offers list: open, not expired, and out of any Unite first-look window.
        const rows = await this.db.select({ b: businessOffers, o: opportunities }).from(businessOffers).innerJoin(opportunities, eq(opportunities.id, businessOffers.opportunityId))
          .where(and(inArray(businessOffers.status, OFFER_OPEN), sql`${businessOffers.expiresOn} >= current_date`, or(isNull(businessOffers.uniteReviewUntil), isNotNull(businessOffers.uniteReleasedAt), lt(businessOffers.uniteReviewUntil, new Date()))))
          .orderBy(desc(businessOffers.createdAt)).limit(8);
        return rows.map(({ b, o }) => ({ id: o.id, type: 'offer', title: o.title, subtitle: `${offerCategoryLabel(b.category)} · ${sectorName(o.sector as SectorCode)}${o.city ? ` · ${o.city}` : ''}`, ownerOrgId: o.ownerOrgId }));
      }
      case 'energy': {
        const rows = await this.db.select().from(energyListings).where(and(eq(energyListings.status, 'live'), eq(energyListings.confidential, false))).orderBy(desc(energyListings.createdAt)).limit(8);
        return rows.map((r) => ({ id: r.id, type: 'energy', title: r.title, subtitle: `${r.side === 'plant' ? 'Project' : 'Buyer'} · ${r.source} · ${r.capacityMw} MW · ${r.district}, ${r.state}`, ownerOrgId: r.orgId }));
      }
      case 'powertek': {
        const owner = await this.powertekOrg();
        if (!owner) return [];
        const rows = await this.db.select().from(catalogItems).where(and(eq(catalogItems.ownerOrgId, owner), eq(catalogItems.status, 'published'), eq(catalogItems.visibility, 'public'),
          or(...feed.keywords.map((k) => or(ilike(catalogItems.name, `%${k}%`), ilike(catalogItems.description, `%${k}%`)))))).orderBy(catalogItems.name).limit(8);
        return rows.map((r) => ({ id: r.id, type: 'product', title: r.name, subtitle: [r.sku, (r.specs as Record<string, string>)?.Category].filter(Boolean).join(' · '), ownerOrgId: owner }));
      }
      default: return [];
    }
  }

  /** Live counts (public-safe aggregates). */
  async stats(feed: ConnectorFeed, slug: string): Promise<{ label: string; value: number }[]> {
    const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
    const count = sql<number>`count(*)::int`;
    switch (feed.kind) {
      case 'capacity': return [{ label: 'Open listings', value: await n(this.db.select({ n: count }).from(capacityOffers).where(and(eq(capacityOffers.status, 'open'), inArray(capacityOffers.type, [...feed.types]), gte(capacityOffers.toDate, today())))) }];
      case 'offers': return [{ label: 'Live offers', value: await n(this.db.select({ n: count }).from(businessOffers).where(and(inArray(businessOffers.status, OFFER_OPEN), sql`${businessOffers.expiresOn} >= current_date`))) }];
      case 'energy': return [{ label: 'Live projects and buyers', value: await n(this.db.select({ n: count }).from(energyListings).where(and(eq(energyListings.status, 'live'), eq(energyListings.confidential, false)))) }];
      case 'micro': {
        const [r] = await this.db.select({ open: sql<number>`count(*) filter (where ${microContracts.status} = 'open')::int`, done: sql<number>`count(*) filter (where ${microContracts.status} in ('paid', 'accepted'))::int` }).from(microContracts).where(eq(microContracts.source, slug));
        return [{ label: 'Open jobs', value: r?.open ?? 0 }, { label: 'Completed', value: r?.done ?? 0 }];
      }
      case 'community': return [{ label: 'Posts in the last 30 days', value: await n(this.db.select({ n: count }).from(communityPosts).where(and(eq(communityPosts.status, 'visible'), inArray(communityPosts.topic, [...feed.topics]), gte(communityPosts.createdAt, DAYS30())))) }];
      case 'announcements': return [{ label: 'Published in the last 30 days', value: await n(this.db.select({ n: count }).from(announcements).where(gte(announcements.publishedAt, DAYS30()))) }];
      case 'actions': return [{ label: 'Follow-ups completed in the last 30 days', value: await n(this.db.select({ n: count }).from(actionItems).where(and(eq(actionItems.status, 'done'), gte(actionItems.doneAt, DAYS30())))) }];
      case 'meetings': return [{ label: 'Meetings held or scheduled in the last 30 days', value: await n(this.db.select({ n: count }).from(meetings).where(and(inArray(meetings.status, ['scheduled', 'completed']), gte(meetings.startsAt, DAYS30())))) }];
      case 'storefronts': return [{ label: 'Live Business QR pages', value: await n(this.db.select({ n: count }).from(proofShares).where(eq(proofShares.enabled, true))) }];
      case 'register': {
        const [v] = await this.db.select({ id: uniteVentures.id }).from(uniteVentures).where(eq(uniteVentures.slug, slug)).limit(1);
        if (!v) return [];
        const intent = sql`${enquiries.details}->'request'->>'intent'`;
        const [r] = await this.db.select({
          suppliers: sql<number>`count(*) filter (where ${intent} = 'feedstock')::int`,
          tpd: sql<number>`coalesce(sum((${enquiries.details}->'request'->>'quantity')::numeric) filter (where ${intent} = 'feedstock'), 0)::float`,
          sites: sql<number>`count(*) filter (where ${intent} = 'host_land')::int`,
          buyers: sql<number>`count(*) filter (where ${intent} in ('offtake_cbg', 'offtake_fom', 'offtake_h2'))::int`,
          partners: sql<number>`count(*) filter (where ${intent} = 'partner')::int`,
        }).from(enquiries).where(eq(enquiries.ventureId, v.id));
        const club = await n(this.db.select({ n: count }).from(clubPowerRequests).where(inArray(clubPowerRequests.need, ['bio_cng', 'green_hydrogen'])));
        return [
          { label: 'Feedstock offered (tonnes a day)', value: Math.round(r?.tpd ?? 0) }, { label: 'Feedstock suppliers', value: r?.suppliers ?? 0 },
          { label: 'Sites offered', value: r?.sites ?? 0 }, { label: 'Buyers of Bio-CNG, manure or hydrogen', value: (r?.buyers ?? 0) + club }, { label: 'EPC and O&M partners', value: r?.partners ?? 0 },
        ];
      }
      case 'powertek': return [{ label: 'Matching Powertek products', value: (await this.items(feed)).length }];
    }
  }

  /** What the product page shows. */
  async forPage(slug: string) {
    const c = CONNECTORS[slug];
    if (!c) return null;
    const [stats, items] = await Promise.all([this.stats(c.feed, slug), this.items(c.feed)]);
    return { kind: c.feed.kind, module: c.module, text: c.text, itemPrompt: c.itemPrompt ?? null, member: c.member, stats, items: items.map(({ ownerOrgId: _o, ...i }) => i) };
  }

  /** Finds the item a request points at, only among the items the page can show. */
  async find(slug: string, id: string) {
    const c = CONNECTORS[slug];
    if (!c) return null;
    return (await this.items(c.feed)).find((i) => i.id === id) ?? null;
  }
}
