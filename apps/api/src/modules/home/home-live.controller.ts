/**
 * Home extras (tested in test/dashboard.e2e.ts):
 *  - GET /me/home/business-news — live business headlines from public RSS feeds (see business-news.ts) plus their status.
 *  - GET /me/home/energy — the energy desk for solar/power partners: quotes by month, by model and by status, Powertek
 *    enquiries by product line, and open energy opportunities and tenders. Only the user's own organisation's records.
 */
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql, type SQL } from 'drizzle-orm';
import { InjectDb, type Db } from '../../db/client';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { BusinessNewsService } from './business-news';

const ENERGY_SECTORS = ['solar', 'power_equipment', 'ev', 'renewable_energy', 'energy'];
async function rows<T>(db: Db, q: SQL): Promise<T[]> { const r = await db.execute(q); return ((r as unknown as { rows?: T[] }).rows ?? (r as unknown as T[])); }
const months6 = () => Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (5 - i)); return d.toISOString().slice(0, 7); });

@ApiTags('home')
@Controller()
export class HomeLiveController {
  constructor(@InjectDb() private db: Db, private news: BusinessNewsService) {}

  @Get('me/home/business-news')
  async businessNews() {
    return this.news.latest();
  }

  @Get('me/home/energy')
  @RequireOrg()
  async energy(@Ctx() ctx: RequestContext) {
    const org = ctx.orgId!;
    const months = months6();
    const q = await rows<{ m: string; n: number; kw: number; value: number }>(this.db, sql`
      select to_char(created_at, 'YYYY-MM') as m, count(*)::int as n, coalesce(sum(capacity_w), 0)::float / 1000 as kw, coalesce(sum(total), 0)::bigint as value
      from solar_quotes where (partner_org_id = ${org}::uuid or owner_org_id = ${org}::uuid) and created_at >= date_trunc('month', now()) - interval '5 months' group by 1`);
    const byM = new Map(q.map((r) => [r.m, r]));
    const models = await rows<{ model: string; n: number; kw: number }>(this.db, sql`
      select model, count(*)::int as n, coalesce(sum(capacity_w), 0)::float / 1000 as kw from solar_quotes where partner_org_id = ${org}::uuid or owner_org_id = ${org}::uuid group by model order by 2 desc`);
    const statuses = await rows<{ status: string; n: number; value: number }>(this.db, sql`
      select status, count(*)::int as n, coalesce(sum(total), 0)::bigint as value from solar_quotes where partner_org_id = ${org}::uuid or owner_org_id = ${org}::uuid group by status`);
    const lines = await rows<{ line: string; n: number }>(this.db, sql`
      select coalesce(l->>'productLine', 'Other') as line, count(*)::int as n from product_enquiries e, jsonb_array_elements(e.lines) l
      where (e.seller_org_id = ${org}::uuid or e.brand_org_id = ${org}::uuid) group by 1 order by 2 desc limit 6`);
    const opps = await rows<{ id: string; title: string; city: string | null; sector: string; value: number | null; published_at: Date | null }>(this.db, sql`
      select id, title, city, sector, estimated_value as value, published_at from opportunities where listed = true and status in ('accepted', 'released', 'qualification', 'proposal')
        and sector in (${sql.join(ENERGY_SECTORS.map((s) => sql`${s}`), sql`, `)}) order by published_at desc nulls last limit 5`);
    const [oppTotals] = await rows<{ n: number; value: number }>(this.db, sql`
      select count(*)::int as n, coalesce(sum(estimated_value), 0)::bigint as value from opportunities where listed = true and status in ('accepted', 'released', 'qualification', 'proposal') and sector in (${sql.join(ENERGY_SECTORS.map((s) => sql`${s}`), sql`, `)})`);
    const [tenders] = await rows<{ n: number; soon: number }>(this.db, sql`
      select count(*)::int as n, count(*) filter (where closes_at < now() + interval '14 days')::int as soon from tenders where status = 'published' and closes_at > now() and sector in (${sql.join(ENERGY_SECTORS.map((s) => sql`${s}`), sql`, `)})`);
    const st = Object.fromEntries(statuses.map((s) => [s.status, { n: Number(s.n), value: Number(s.value) }]));
    const pipelineValue = statuses.filter((s) => !['lost', 'expired', 'cancelled'].includes(s.status)).reduce((a, s) => a + Number(s.value), 0);
    const pipelineKw = q.reduce((a, r) => a + Number(r.kw), 0);
    return {
      months, quotes: months.map((m) => Number(byM.get(m)?.n ?? 0)), kw: months.map((m) => Math.round(Number(byM.get(m)?.kw ?? 0) * 10) / 10), value: months.map((m) => Number(byM.get(m)?.value ?? 0)),
      models: models.map((m) => ({ model: m.model, n: Number(m.n), kw: Math.round(Number(m.kw) * 10) / 10 })), statuses: st,
      totals: { quotes: statuses.reduce((a, s) => a + Number(s.n), 0), pipelineValue, kwSixMonths: Math.round(pipelineKw * 10) / 10, won: (st.won?.n ?? 0) + (st.installed?.n ?? 0) },
      enquiryLines: lines.map((l) => ({ line: l.line, n: Number(l.n) })),
      opportunities: { count: Number(oppTotals?.n ?? 0), value: Number(oppTotals?.value ?? 0), latest: opps.map((o) => ({ id: o.id, title: o.title, city: o.city, value: o.value != null ? Number(o.value) : null, publishedAt: o.published_at })) },
      tenders: { open: Number(tenders?.n ?? 0), closingSoon: Number(tenders?.soon ?? 0) },
    };
  }
}
