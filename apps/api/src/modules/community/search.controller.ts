/**
 * One search box for partners (tested in test/community.e2e.ts): opportunities they may see, Unite apps, community posts,
 * catalogues and documents, group-investment offers and products. Each group applies the same visibility rules as its
 * own page, so search never reveals more than browsing would.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import { InjectDb, type Db } from '../../db/client';
import { catalogItems, communityPosts, investmentOffers, moduleDocuments, organizations, solarProducts, uniteVentures, users } from '../../db/schema';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { OpportunitiesService } from '../opportunities/opportunities.service';

@ApiTags('search')
@Controller()
export class SearchController {
  constructor(@InjectDb() private db: Db, private opps: OpportunitiesService) {}

  @Get('search')
  @RequireOrg()
  async search(@Ctx() ctx: RequestContext, @Query('q') raw?: string) {
    const q = (raw ?? '').trim().slice(0, 80);
    if (q.length < 2) return { q, groups: [] };
    const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const verified = ctx.orgVerificationStatus === 'verified' || ctx.platformRoles.length > 0;
    const [opp, apps, posts, docs, offers, products, solar] = await Promise.all([
      this.opps.page(ctx, { q }, 6, 0, 'newest'),
      this.db.select({ slug: uniteVentures.slug, name: uniteVentures.name, tagline: uniteVentures.tagline, open: uniteVentures.open }).from(uniteVentures).where(or(ilike(uniteVentures.name, like), ilike(uniteVentures.tagline, like), ilike(uniteVentures.category, like))).limit(6),
      this.db.select({ id: communityPosts.id, body: communityPosts.body, author: users.fullName }).from(communityPosts).innerJoin(users, eq(users.id, communityPosts.authorUserId)).where(and(eq(communityPosts.status, 'visible'), ilike(communityPosts.body, like))).limit(6),
      this.db.select({ id: moduleDocuments.id, title: moduleDocuments.title, kind: moduleDocuments.kind, moduleKey: moduleDocuments.moduleKey }).from(moduleDocuments)
        .where(and(eq(moduleDocuments.status, 'published'), inArray(moduleDocuments.visibility, verified ? ['public', 'partners', 'verified_partners'] : ['public', 'partners']), or(ilike(moduleDocuments.title, like), ilike(moduleDocuments.description, like)))).limit(6),
      this.db.select({ id: investmentOffers.id, title: investmentOffers.title, location: investmentOffers.location }).from(investmentOffers).where(and(inArray(investmentOffers.status, ['interest_open', 'closed']), or(ilike(investmentOffers.title, like), ilike(investmentOffers.location, like)))).limit(4),
      this.db.select({ id: catalogItems.id, name: catalogItems.name, sku: catalogItems.sku, owner: organizations.displayName }).from(catalogItems).innerJoin(organizations, eq(organizations.id, catalogItems.ownerOrgId))
        .where(and(eq(catalogItems.status, 'published'), inArray(catalogItems.visibility, ['public', 'partners']), or(ilike(catalogItems.name, like), ilike(catalogItems.sku, like)))).limit(6),
      this.db.select({ id: solarProducts.id, name: solarProducts.name, sku: solarProducts.sku }).from(solarProducts).where(and(eq(solarProducts.status, 'active'), or(ilike(solarProducts.name, like), ilike(solarProducts.sku, like)))).limit(4),
    ]);
    const groups = [
      { key: 'opportunities', label: 'Opportunities', items: opp.items.map((o: { opportunity?: { id: string; title: string; code: string }; id?: string; title?: string; code?: string }) => { const x = o.opportunity ?? (o as { id: string; title: string; code: string }); return { id: x.id, title: x.title, subtitle: x.code, href: `/opportunities/${x.id}` }; }) },
      { key: 'products', label: 'Products', items: [...products.map((p) => ({ id: p.id, title: p.name, subtitle: `${p.owner}${p.sku ? ` · ${p.sku}` : ''}`, href: p.owner === 'Powertek' ? `/powertek?q=${encodeURIComponent(p.name)}` : `/catalogue/${p.id}` })), ...solar.map((p) => ({ id: p.id, title: p.name, subtitle: `Unite Solar · ${p.sku}`, href: '/unite-solar/catalogue' }))] },
      { key: 'apps', label: 'Unite apps', items: apps.map((a) => ({ id: a.slug, title: a.name, subtitle: `${a.tagline}${a.open ? '' : ' · coming soon'}`, href: `/ventures/${a.slug}` })) },
      { key: 'documents', label: 'Catalogues & documents', items: docs.map((d) => ({ id: d.id, title: d.title, subtitle: d.kind, href: '/library' })) },
      { key: 'invest', label: 'Invest together', items: offers.map((o) => ({ id: o.id, title: o.title, subtitle: o.location, href: '/invest' })) },
      { key: 'community', label: 'Community posts', items: posts.map((p) => ({ id: p.id, title: p.body.length > 90 ? `${p.body.slice(0, 87)}…` : p.body, subtitle: p.author, href: '/community' })) },
    ].filter((g) => g.items.length);
    return { q, groups };
  }
}
