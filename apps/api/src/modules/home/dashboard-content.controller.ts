/**
 * Partner dashboard extras (tested in test/dashboard.e2e.ts): the business-domain theme, six-month trends, news (staff
 * announcements), and the ad and video slots that Unite admins manage. With no ads booked, the ad slot shows Unite's own
 * live programmes (real in-app destinations) — never invented third-party adverts.
 */
import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { DASHBOARD_THEME_LABELS, DashboardContentSchema, themeForSectors, videoEmbed } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { announcements, dashboardContent, partnerProfiles } from '../../db/schema';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { MAX_UPLOAD_BYTES, StorageService } from '../../common/adapters';

type Row = Record<string, unknown>;
const rows = (r: unknown) => ((r as { rows?: Row[] }).rows ?? (r as Row[]));
const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const today = () => new Date().toISOString().slice(0, 10);
const months = (n: number) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (n - 1 - i)); return d.toISOString().slice(0, 7); });
/** Unite's own programmes, shown in the ad slot when no ad is booked. Each points at a real, live part of COLLABIZ. */
const HOUSE: Record<string, { title: string; body: string; url: string; ctaLabel: string }[]> = {
  energy: [{ title: 'Become a Unite Solar franchise or store', body: 'Five partner plans from ₹1.5 lakh — territory, stock and LeadDNA options.', url: '/unite-solar', ctaLabel: 'Compare plans' }],
  any: [
    { title: 'Sell 360+ Unite Powertek products', body: 'Register your customer’s enquiry; Powertek quotes and delivers, you earn on the order.', url: '/powertek', ctaLabel: 'Browse products' },
    { title: 'Find partners for your next project', body: 'Post what you have and what you need — COLLABIZ matches you with verified partners.', url: '/collab', ctaLabel: 'Open Collab' },
  ],
};
const view = (c: typeof dashboardContent.$inferSelect) => ({ id: c.id, kind: c.kind, title: c.title, body: c.body, url: c.url, ctaLabel: c.ctaLabel, theme: c.theme, startsOn: c.startsOn, endsOn: c.endsOn, sortOrder: c.sortOrder, active: c.active, clicks: c.clicks, hasImage: !!c.imageKey, embed: c.kind === 'video' ? videoEmbed(c.url) : null, updatedAt: c.updatedAt });
function parse(raw: Record<string, unknown>) {
  const r = DashboardContentSchema.safeParse({ ...raw, theme: raw.theme || null, body: raw.body || undefined, ctaLabel: raw.ctaLabel || undefined, startsOn: raw.startsOn || undefined, endsOn: raw.endsOn || undefined, sortOrder: raw.sortOrder ? Number(raw.sortOrder) : undefined });
  if (!r.success) throw new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  return r.data;
}

@ApiTags('home')
@Controller()
export class DashboardContentController {
  constructor(@InjectDb() private db: Db, private storage: StorageService, private audit: AuditService) {}

  @Get('me/home/feed')
  @RequireOrg()
  async feed(@Ctx() ctx: RequestContext) {
    const org = ctx.orgId!;
    const [p] = await this.db.select({ sectors: partnerProfiles.sectors }).from(partnerProfiles).where(eq(partnerProfiles.organizationId, org)).limit(1);
    const theme = themeForSectors(p?.sectors);
    const live = and(eq(dashboardContent.active, true), or(isNull(dashboardContent.theme), eq(dashboardContent.theme, theme)), sql`(${dashboardContent.startsOn} is null or ${dashboardContent.startsOn} <= ${today()})`, sql`(${dashboardContent.endsOn} is null or ${dashboardContent.endsOn} >= ${today()})`);
    const content = await this.db.select().from(dashboardContent).where(live).orderBy(asc(dashboardContent.sortOrder), desc(dashboardContent.updatedAt)).limit(20);
    const ads = content.filter((c) => c.kind === 'ad').map(view);
    const m = months(6);
    const earn = rows(await this.db.execute(sql`select to_char(coalesce(earned_at, updated_at), 'YYYY-MM') m, sum(payable)::bigint v from commission_entries where beneficiary_org_id = ${org} and status in ('earned','approved','invoiced','settled') and coalesce(earned_at, updated_at) >= ${m[0] + '-01'}::date group by 1`));
    const leads = rows(await this.db.execute(sql`select to_char(created_at, 'YYYY-MM') m, count(*)::int v from lead_claims where introducer_org_id = ${org} and created_at >= ${m[0] + '-01'}::date group by 1`));
    const deals = rows(await this.db.execute(sql`select to_char(created_at, 'YYYY-MM') m, coalesce(sum(value), 0)::bigint v from crm_deals where organization_id = ${org} and created_at >= ${m[0] + '-01'}::date group by 1`));
    const pick = (r: Row[], k: string) => Number(r.find((x) => x.m === k)?.v ?? 0);
    const news = await this.db.select({ id: announcements.id, title: announcements.title, body: announcements.body, important: announcements.important, publishedAt: announcements.publishedAt, sector: announcements.sector }).from(announcements)
      .where(and(inArray(announcements.audience, ['all', 'partners', ...(ctx.orgVerificationStatus === 'verified' ? ['verified_partners'] : [])]), or(isNull(announcements.expiresAt), gt(announcements.expiresAt, new Date()))))
      .orderBy(desc(announcements.important), desc(announcements.publishedAt)).limit(4);
    return {
      theme, themeLabel: DASHBOARD_THEME_LABELS[theme], sectors: p?.sectors ?? [],
      ads: ads.length ? ads : [...(HOUSE[theme] ?? []), ...HOUSE.any].map((h, i) => ({ id: `house-${i}`, kind: 'ad', ...h, hasImage: false, house: true })),
      videos: content.filter((c) => c.kind === 'video').map(view).slice(0, 3),
      news: news.map((n) => ({ ...n, body: n.body.length > 160 ? `${n.body.slice(0, 157)}…` : n.body })),
      trend: { months: m, earnings: m.map((k) => pick(earn, k)), leads: m.map((k) => pick(leads, k)), deals: m.map((k) => pick(deals, k)) },
    };
  }

  /** Counts a click on an ad or video (best effort). */
  @Post('me/home/content/:id/click')
  @HttpCode(200)
  async click(@Param('id', ParseUUIDPipe) id: string) {
    await this.db.update(dashboardContent).set({ clicks: sql`${dashboardContent.clicks} + 1` }).where(eq(dashboardContent.id, id));
    return { ok: true };
  }

  @Get('me/home/content/:id/image')
  async image(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const [c] = await this.db.select({ key: dashboardContent.imageKey }).from(dashboardContent).where(and(eq(dashboardContent.id, id), eq(dashboardContent.active, true))).limit(1);
    if (!c?.key) throw new NotFoundException('No image');
    const buf = await this.storage.get(c.key).catch(() => null);
    if (!buf) throw new NotFoundException('No image');
    const h = buf.subarray(0, 4).toString('latin1');
    res.setHeader('Content-Type', h.startsWith('\x89PNG') ? 'image/png' : h.startsWith('RIFF') ? 'image/webp' : 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(buf);
  }

  // ---------------------------------------------------------------- Unite admins
  @Get('admin/dashboard-content')
  async list(@Ctx() ctx: RequestContext) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    return (await this.db.select().from(dashboardContent).orderBy(asc(dashboardContent.kind), asc(dashboardContent.sortOrder), desc(dashboardContent.updatedAt))).map(view);
  }
  @Post('admin/dashboard-content')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async create(@Ctx() ctx: RequestContext, @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined, @Body() raw: Record<string, unknown>) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const b = parse(raw);
    if (file && !['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) throw new BadRequestException('Use a PNG, JPEG or WEBP image');
    const stored = file ? await this.storage.put(file.buffer, file.mimetype, 'dashboard') : null;
    const [c] = await this.db.insert(dashboardContent).values({ ...b, body: b.body ?? null, ctaLabel: b.ctaLabel ?? null, startsOn: b.startsOn ?? null, endsOn: b.endsOn ?? null, imageKey: stored?.key ?? null, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: `dashboard.${b.kind}.added`, objectType: 'dashboard_content', objectId: c.id, after: { title: b.title, url: b.url, theme: b.theme } });
    return view(c);
  }
  @Post('admin/dashboard-content/:id')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined, @Body() raw: Record<string, unknown>) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const [cur] = await this.db.select().from(dashboardContent).where(eq(dashboardContent.id, id)).limit(1);
    if (!cur) throw new NotFoundException('Not found');
    const b = parse(raw);
    const stored = file ? await this.storage.put(file.buffer, file.mimetype, 'dashboard') : null;
    const [c] = await this.db.update(dashboardContent).set({ ...b, body: b.body ?? null, ctaLabel: b.ctaLabel ?? null, startsOn: b.startsOn ?? null, endsOn: b.endsOn ?? null, ...(stored ? { imageKey: stored.key } : {}), updatedAt: new Date() }).where(eq(dashboardContent.id, id)).returning();
    await this.audit.record(ctx, { action: `dashboard.${b.kind}.updated`, objectType: 'dashboard_content', objectId: id, before: { title: cur.title, url: cur.url }, after: { title: c.title, url: c.url } });
    return view(c);
  }
  @Post('admin/dashboard-content/:id/active')
  @HttpCode(200)
  async toggle(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() b: { active?: boolean }) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const [c] = await this.db.update(dashboardContent).set({ active: !!b?.active, updatedAt: new Date() }).where(eq(dashboardContent.id, id)).returning();
    if (!c) throw new NotFoundException('Not found');
    await this.audit.record(ctx, { action: `dashboard.content.${b?.active ? 'on' : 'off'}`, objectType: 'dashboard_content', objectId: id });
    return view(c);
  }
}

@Module({ controllers: [DashboardContentController] })
export class DashboardContentModule {}
