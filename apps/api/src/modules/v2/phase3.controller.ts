/**
 * V2 Phase 3 (tested in test/v2-phase3.e2e.ts)
 *  11 Country business desk — one page per market joining approved country partners and their territories, open
 *     opportunities, the company's own import/export enquiries, the latest indicative exchange rate and export checklist.
 *  12 Opportunity-to-revenue intelligence — lead → qualified → proposal → booked → invoiced → collected → commission settled,
 *     with pipeline, booked, invoiced and collected values kept strictly separate (never added together), receivables
 *     ageing, loss reasons, sector and region splits, commission liabilities, and how far applications convert.
 */
import { BadRequestException, Controller, ForbiddenException, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { COUNTRIES, COUNTRY_INFO, PAYMENT_TERMS_DAYS, agingBuckets, regionLabel, sectorName } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  commissionEntries, contracts, countryPartnerApplications, countryTerritories, crmDeals, crossBorderEnquiries, fxRates, leadClaims, opportunities, opportunityApplications, organizations, paymentReceipts, projectInvoices,
} from '../../db/schema';
import { Ctx, type RequestContext } from '../../common/context';

const platform = (ctx: RequestContext) => ctx.platformRoles.length > 0 && !ctx.mfaRequiredButMissing;
const OPEN_OPP = ['accepted', 'released', 'qualification', 'proposal', 'negotiation'];

@ApiTags('v2 phase 3')
@Controller()
export class Phase3Controller {
  constructor(@InjectDb() private db: Db) {}

  // ================= 11 Country desk =================
  @Get('global/desks/:country')
  async desk(@Ctx() ctx: RequestContext, @Param('country') raw: string) {
    const country = raw.toUpperCase();
    if (country === 'IN' || !COUNTRIES.some(([c]) => c === country)) throw new BadRequestException('Choose a market outside India');
    const info = COUNTRY_INFO[country];
    const terr = await this.db.select({ t: countryTerritories, org: organizations.displayName, city: organizations.city }).from(countryTerritories).innerJoin(organizations, eq(organizations.id, countryTerritories.organizationId)).where(and(eq(countryTerritories.country, country), eq(countryTerritories.status, 'active')));
    const opps = await this.db.select().from(opportunities).where(and(eq(opportunities.country, country), eq(opportunities.listed, true), inArray(opportunities.status, OPEN_OPP), inArray(opportunities.visibility, ['public', 'partners', 'verified_partners']))).orderBy(desc(opportunities.publishedAt)).limit(30);
    const enq = ctx.orgId ? await this.db.select().from(crossBorderEnquiries).where(and(eq(crossBorderEnquiries.organizationId, ctx.orgId), or(eq(crossBorderEnquiries.originCountry, country), eq(crossBorderEnquiries.destinationCountry, country)))).orderBy(desc(crossBorderEnquiries.createdAt)).limit(20) : [];
    const [fx] = info ? await this.db.select().from(fxRates).where(eq(fxRates.currency, info.currency)).orderBy(desc(fxRates.asOf)).limit(1) : [];
    const pending = platform(ctx) ? await this.db.select({ a: countryPartnerApplications, org: organizations.displayName }).from(countryPartnerApplications).innerJoin(organizations, eq(organizations.id, countryPartnerApplications.organizationId)).where(and(eq(countryPartnerApplications.country, country), eq(countryPartnerApplications.status, 'submitted'))) : [];
    const mine = ctx.orgId ? terr.find((x) => x.t.organizationId === ctx.orgId) : undefined;
    return {
      country, name: regionLabel(country), currency: info?.currency ?? null, languages: info?.languages ?? null, notes: info?.notes ?? null,
      fx: fx ? { currency: fx.currency, inrPerUnit: Number(fx.inrPerUnit), asOf: fx.asOf, note: 'Indicative only; money on COLLABIZ is recorded and settled in INR.' } : null,
      representatives: terr.map((x) => ({ organization: x.org, city: x.city, sectors: x.t.sectors.map(sectorName), exclusive: x.t.exclusive, until: x.t.endsOn })),
      opportunities: opps.map((o) => ({ id: o.id, code: o.code, title: o.title, sector: sectorName(o.sector), city: o.city, value: o.estimatedValue, deadline: o.deadline })),
      enquiries: enq.map((e) => ({ id: e.id, code: e.code, direction: e.direction, product: e.product, status: e.status, checklistDone: e.checklistDone.length })),
      pendingApplications: pending.map((p) => ({ id: p.a.id, organization: p.org, sectors: p.a.sectors.map(sectorName), submittedAt: p.a.createdAt })),
      myTerritory: mine ? { sectors: mine.t.sectors.map(sectorName), exclusive: mine.t.exclusive, until: mine.t.endsOn } : null,
      checklistLink: `/global/compliance?direction=export&origin=IN&destination=${country}`,
    };
  }

  // ================= 12 Revenue intelligence =================
  @Get('admin/analytics/revenue')
  async revenue(@Ctx() ctx: RequestContext) {
    if (!platform(ctx)) throw new ForbiddenException('For Unite staff');
    const n = (q: Promise<{ n: number; v: number }[]>) => q.then((r) => ({ count: Number(r[0]?.n ?? 0), value: Number(r[0]?.v ?? 0) }));
    const count = sql<number>`count(*)::int`;
    const leads = await n(this.db.select({ n: count, v: sql<number>`coalesce(sum(${opportunities.estimatedValue}), 0)` }).from(leadClaims).innerJoin(opportunities, eq(opportunities.id, leadClaims.opportunityId)));
    const qualified = await n(this.db.select({ n: count, v: sql<number>`coalesce(sum(${opportunities.estimatedValue}), 0)` }).from(leadClaims).innerJoin(opportunities, eq(opportunities.id, leadClaims.opportunityId)).where(inArray(leadClaims.status, ['protected', 'won', 'converted'])));
    const pipeline = await n(this.db.select({ n: count, v: sql<number>`coalesce(sum(${opportunities.estimatedValue}), 0)` }).from(opportunities).where(inArray(opportunities.status, OPEN_OPP)));
    const crmOpen = await n(this.db.select({ n: count, v: sql<number>`coalesce(sum(${crmDeals.value}), 0)` }).from(crmDeals).where(sql`${crmDeals.stage} not in ('won','lost')`));
    const booked = await n(this.db.select({ n: count, v: sql<number>`coalesce(sum(${contracts.value}), 0)` }).from(contracts).where(eq(contracts.status, 'executed')));
    const invs = await this.db.select().from(projectInvoices);
    const recs = invs.length ? await this.db.select({ id: paymentReceipts.invoiceId, s: sql<number>`sum(${paymentReceipts.amount})` }).from(paymentReceipts).where(and(inArray(paymentReceipts.invoiceId, invs.map((i) => i.id)), eq(paymentReceipts.pending, false))).groupBy(paymentReceipts.invoiceId) : [];
    const got = (i: (typeof invs)[number]) => (i.status === 'paid' ? i.amount : Number(recs.find((r) => r.id === i.id)?.s ?? 0));
    const invoiced = { count: invs.length, value: invs.reduce((a, i) => a + i.amount, 0) };
    const collected = { count: invs.filter((i) => got(i) > 0).length, value: invs.reduce((a, i) => a + got(i), 0) };
    const dueOf = (i: (typeof invs)[number]) => i.dueDate ?? new Date(i.issuedAt.getTime() + PAYMENT_TERMS_DAYS * 86400000).toISOString().slice(0, 10);
    const settled = await n(this.db.select({ n: count, v: sql<number>`coalesce(sum(${commissionEntries.payable}), 0)` }).from(commissionEntries).where(eq(commissionEntries.status, 'settled')));
    const liab = await this.db.select({ s: commissionEntries.status, n: count, v: sql<number>`coalesce(sum(${commissionEntries.payable}), 0)` }).from(commissionEntries).where(inArray(commissionEntries.status, ['earned', 'approved', 'invoiced', 'on_hold'])).groupBy(commissionEntries.status);
    const projected = await n(this.db.select({ n: count, v: sql<number>`coalesce(sum(${commissionEntries.payable}), 0)` }).from(commissionEntries).where(inArray(commissionEntries.status, ['estimated', 'eligible'])));
    const losses = await this.db.select({ reason: sql<string>`coalesce(nullif(${crmDeals.lostReason}, ''), 'No reason given')`, n: count, v: sql<number>`coalesce(sum(${crmDeals.value}), 0)` }).from(crmDeals).where(eq(crmDeals.stage, 'lost')).groupBy(sql`1`).orderBy(desc(sql`3`));
    const lostOpps = await n(this.db.select({ n: count, v: sql<number>`coalesce(sum(${opportunities.estimatedValue}), 0)` }).from(opportunities).where(eq(opportunities.status, 'lost')));
    const bySector = await this.db.select({ k: opportunities.sector, n: count, v: sql<number>`coalesce(sum(${opportunities.estimatedValue}), 0)` }).from(opportunities).where(inArray(opportunities.status, OPEN_OPP)).groupBy(opportunities.sector).orderBy(desc(sql`3`));
    const byRegion = await this.db.select({ k: sql<string>`coalesce(${opportunities.region}, ${opportunities.country})`, n: count, v: sql<number>`coalesce(sum(${opportunities.estimatedValue}), 0)` }).from(opportunities).where(inArray(opportunities.status, OPEN_OPP)).groupBy(sql`1`).orderBy(desc(sql`3`)).limit(12);
    const byPartner = await this.db.select({ k: organizations.displayName, n: count, v: sql<number>`coalesce(sum(${contracts.value}), 0)` }).from(contracts).innerJoin(organizations, eq(organizations.id, contracts.counterpartyOrgId)).where(eq(contracts.status, 'executed')).groupBy(organizations.displayName).orderBy(desc(sql`3`)).limit(10);
    const apps = await this.db.select({ s: opportunityApplications.status, n: count }).from(opportunityApplications).groupBy(opportunityApplications.status);
    const appTotal = apps.reduce((a, x) => a + Number(x.n), 0);
    const appWon = apps.filter((x) => ['accepted', 'shortlisted', 'awarded'].includes(x.s)).reduce((a, x) => a + Number(x.n), 0);
    const kv = (rows: { k: string | null; n: number; v: number }[], label: (k: string) => string) => rows.map((r) => ({ key: r.k ?? '—', label: r.k ? label(r.k) : '—', count: Number(r.n), value: Number(r.v) }));
    return {
      funnel: [
        { stage: 'Leads registered', kind: 'pipeline', ...leads }, { stage: 'Leads protected', kind: 'pipeline', ...qualified },
        { stage: 'Open opportunities', kind: 'pipeline', ...pipeline }, { stage: 'Open CRM deals', kind: 'pipeline', ...crmOpen },
        { stage: 'Booked (executed contracts)', kind: 'booked', ...booked }, { stage: 'Invoiced', kind: 'invoiced', ...invoiced },
        { stage: 'Collected', kind: 'collected', ...collected }, { stage: 'Commission settled', kind: 'settled', ...settled },
      ],
      totals: { pipeline: pipeline.value + crmOpen.value, booked: booked.value, invoiced: invoiced.value, collected: collected.value, outstanding: invoiced.value - collected.value },
      aging: agingBuckets(invs.map((i) => ({ outstanding: i.amount - got(i), dueDate: dueOf(i) }))),
      losses: { deals: losses.map((l) => ({ reason: l.reason, count: Number(l.n), value: Number(l.v) })), opportunitiesLost: lostOpps },
      bySector: kv(bySector, sectorName), byRegion: kv(byRegion, regionLabel), byPartner: kv(byPartner, (k) => k),
      commission: { liabilities: liab.map((l) => ({ status: l.s, count: Number(l.n), value: Number(l.v) })), owed: liab.reduce((a, l) => a + Number(l.v), 0), projected: projected.value, settled: settled.value },
      applications: { total: appTotal, progressed: appWon, rate: appTotal ? Math.round((appWon / appTotal) * 100) : null },
      note: 'Pipeline values are estimates, booked is executed contract value, invoiced and collected are actual documents and receipts. They are separate measures and must not be added together.',
    };
  }
}
