/**
 * Published Unite brand products (admin-managed) and routing of customer enquiries to the right approved dealer.
 */
import { Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { type BusinessType, type ChannelProduct, type ChannelRole } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { brandProducts, channelApplications, crmActivities, crmDeals, customers, memberships, notifications, organizations, uniteVentures } from '../../db/schema';

export type BrandRow = typeof brandProducts.$inferSelect;
export type VentureRow = typeof uniteVentures.$inferSelect;
export const toChannelProduct = (b: BrandRow, v: VentureRow): ChannelProduct => ({
  slug: b.slug, name: v.name, bulk: b.bulk, showroom: b.showroom, roles: b.roles as ChannelRole[], strong: b.strong as BusinessType[], good: b.good as BusinessType[], buyers: b.buyers,
});

@Injectable()
export class BrandProductsService {
  constructor(@InjectDb() private db: Db) {}

  /** Published brand products with their business record, in launch order. */
  async published() {
    const rows = await this.db.select({ b: brandProducts, v: uniteVentures }).from(brandProducts).innerJoin(uniteVentures, eq(uniteVentures.id, brandProducts.ventureId))
      .where(eq(brandProducts.status, 'published')).orderBy(asc(uniteVentures.num));
    return rows.map((r) => ({ ...r, product: toChannelProduct(r.b, r.v) }));
  }
  async bySlug(slug: string) { return (await this.published()).find((x) => x.b.slug === slug) ?? null; }
  /** The product a web address points at (brandname.<domain> or /businesses/<subdomain>). */
  async slugForSubdomain(sub: string) {
    const [r] = await this.db.select({ slug: brandProducts.slug }).from(brandProducts).where(and(eq(brandProducts.subdomain, sub.toLowerCase()), eq(brandProducts.status, 'published'))).limit(1);
    return r?.slug ?? null;
  }

  /**
   * A customer's enquiry on a brand product's microsite goes into the CRM of the approved partner for their area:
   * territory or city matching the customer's city, else their state; ties go to the partner with fewer open leads.
   * Returns the dealer chosen, or null (the Unite team then handles it).
   */
  async routeToDealer(ventureId: string, c: { name: string; email: string; phone?: string; city?: string; state?: string; message: string; reference: string; productName: string }) {
    const place = [c.city, c.state].filter(Boolean) as string[];
    if (!place.length) return null;
    const cands = await this.db.select({ a: channelApplications, org: organizations.displayName }).from(channelApplications).innerJoin(organizations, eq(organizations.id, channelApplications.orgId))
      .where(and(eq(channelApplications.ventureId, ventureId), eq(channelApplications.status, 'approved'), inArray(channelApplications.role, ['distributor', 'dealer', 'store', 'franchise']),
        or(...place.flatMap((p) => [ilike(channelApplications.approvedTerritory, `%${p}%`), ilike(channelApplications.city, p)]))));
    if (!cands.length) return null;
    const cityHit = c.city ? cands.filter((x) => (x.a.approvedTerritory ?? '').toLowerCase().includes(c.city!.toLowerCase()) || x.a.city.toLowerCase() === c.city!.toLowerCase()) : [];
    const pool = cityHit.length ? cityHit : cands;
    const loads = await Promise.all(pool.map(async (x) => (await this.db.select({ n: sql<number>`count(*)::int` }).from(crmDeals).where(and(eq(crmDeals.organizationId, x.a.orgId!), eq(crmDeals.ventureId, ventureId), sql`${crmDeals.stage} not in ('won','lost')`)))[0].n));
    const pick = pool[loads.indexOf(Math.min(...loads))];
    const orgId = pick.a.orgId!;
    const [cust] = await this.db.insert(customers).values({ organizationId: orgId, legalName: c.name, contactName: c.name, contactEmail: c.email, contactPhone: c.phone ?? null, city: c.city ?? null, country: 'IN',
      consentProvenance: { method: 'microsite_enquiry', obtainedAt: new Date().toISOString(), disclosureScope: 'authorised_dealer', reference: c.reference }, restrictedContacts: false }).returning({ id: customers.id });
    const [deal] = await this.db.insert(crmDeals).values({ organizationId: orgId, customerId: cust.id, title: `${c.productName} enquiry ${c.reference}`, ventureId }).returning({ id: crmDeals.id });
    await this.db.insert(crmActivities).values({ organizationId: orgId, subjectType: 'deal', subjectId: deal.id, kind: 'system', body: `From the ${c.productName} microsite (${c.reference}): “${c.message.slice(0, 500)}”. The customer agreed to be contacted by Unite and its authorised dealer for their area.` });
    const team = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    if (team.length) await this.db.insert(notifications).values(team.map((m) => ({ userId: m.u, kind: 'venture', title: `New ${c.productName} lead from Unite`, body: `${c.name}${c.city ? ` · ${c.city}` : ''} (${c.reference}) is in your dealer pipeline. Contact them within one working day.`, link: '/dealer' })));
    return { orgId, name: pick.org, dealId: deal.id };
  }
}
