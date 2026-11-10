/**
 * Channels and partners outside COLLABIZ (tested in test/channels.e2e.ts):
 *  - WhatsApp: per-person opt-in with the consent text and which updates to receive. Sending needs a WhatsApp Business
 *    provider (not connected) — nothing is queued or claimed as sent until then.
 *  - TReDS: pre-checks and the upload details for discounting an unpaid invoice on an RBI-licensed TReDS platform. The
 *    supplier uploads it there; COLLABIZ never handles financing or money.
 *  - Tender feed: Unite imports a public tender feed file (RSS/XML) for review; automatic fetching needs approval (not connected).
 */
import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { XMLParser } from 'fast-xml-parser';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PAYMENT_TERMS_DAYS, TREDS_PLATFORMS, TenderLeadStatusSchema, WHATSAPP_OPT_IN_TEXT, WHATSAPP_TEMPLATES, WhatsappPrefsSchema, guessSector, normalizeIndianMobile, tredsChecks } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { channelPreferences, organizations, partnerProfiles, paymentReceipts, projectInvoices, projects, resolutionCases, taxProfiles, tenderLeads, tredsReferrals } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { MAX_UPLOAD_BYTES } from '../../common/adapters';
import { PROVIDERS, providerConnected, requireProvider } from '../../common/providers';

const manager = (ctx: RequestContext, orgId: string) => ctx.memberships.some((m) => m.organizationId === orgId && (m.role === 'org_owner' || m.role === 'org_admin'));
const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin') && !ctx.mfaRequiredButMissing;
const txt = (x: unknown): string => (x == null ? '' : typeof x === 'object' ? txt((x as Record<string, unknown>)['#text']) : String(x)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

@ApiTags('channels')
@Controller()
export class ChannelsController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  // ---------- WhatsApp ----------
  @Get('me/whatsapp')
  async whatsapp(@Ctx() ctx: RequestContext) {
    const [p] = await this.db.select().from(channelPreferences).where(eq(channelPreferences.userId, ctx.userId));
    return { optIn: p?.whatsappOptIn ?? false, number: p?.whatsappNumber ?? '', kinds: p?.kinds ?? [], optInAt: p?.optInAt ?? null, consentText: WHATSAPP_OPT_IN_TEXT,
      templates: Object.entries(WHATSAPP_TEMPLATES).map(([key, t]) => ({ key, ...t })), connected: providerConnected('whatsapp'), note: PROVIDERS.whatsapp.manual };
  }

  @Put('me/whatsapp')
  async saveWhatsapp(@Ctx() ctx: RequestContext, @Body(body(WhatsappPrefsSchema)) b: z.infer<typeof WhatsappPrefsSchema>) {
    const number = b.optIn ? normalizeIndianMobile(b.number!) : null;
    const v = { whatsappNumber: number, whatsappOptIn: b.optIn, optInAt: b.optIn ? new Date() : null, optInText: b.optIn ? WHATSAPP_OPT_IN_TEXT : null, kinds: b.optIn ? b.kinds : [], updatedAt: new Date() };
    await this.db.insert(channelPreferences).values({ userId: ctx.userId, ...v }).onConflictDoUpdate({ target: channelPreferences.userId, set: v });
    await this.audit.record(ctx, { action: b.optIn ? 'consent.whatsapp_opt_in' : 'consent.whatsapp_opt_out', objectType: 'user', objectId: ctx.userId, after: { number: number ? `••••••${number.slice(-4)}` : null, kinds: v.kinds } });
    return this.whatsapp(ctx);
  }

  // ---------- TReDS ----------
  private async tredsContext(ctx: RequestContext, pid: string, iid: string) {
    const [r] = await this.db.select({ i: projectInvoices, p: projects }).from(projectInvoices).innerJoin(projects, eq(projects.id, projectInvoices.projectId)).where(and(eq(projectInvoices.id, iid), eq(projectInvoices.projectId, pid)));
    if (!r || !ctx.memberships.some((m) => m.organizationId === r.i.issuedByOrgId)) throw new NotFoundException('Invoice not found');
    const [seller] = await this.db.select().from(taxProfiles).where(eq(taxProfiles.orgId, r.i.issuedByOrgId));
    const [buyerTp] = await this.db.select().from(taxProfiles).where(eq(taxProfiles.orgId, r.p.ownerOrgId));
    const [buyerOrg] = await this.db.select().from(organizations).where(eq(organizations.id, r.p.ownerOrgId));
    const [buyerPp] = await this.db.select({ gstin: partnerProfiles.gstin }).from(partnerProfiles).where(eq(partnerProfiles.organizationId, r.p.ownerOrgId));
    const received = Number((await this.db.select({ s: sql<number>`coalesce(sum(${paymentReceipts.amount}), 0)` }).from(paymentReceipts).where(and(eq(paymentReceipts.invoiceId, iid), eq(paymentReceipts.pending, false))))[0].s);
    // An open dispute blocks this invoice when it names it, or names no invoice at all (it could concern any of them).
    const cases = await this.db.select({ t: sql<string>`${resolutionCases.subject} || ' ' || ${resolutionCases.statement}` }).from(resolutionCases).where(and(eq(resolutionCases.projectId, pid), inArray(resolutionCases.status, ['open', 'appealed'])));
    const disputed = cases.some((c) => c.t.includes(r.i.number) || !/INV-[A-Z0-9-]+/.test(c.t));
    const due = r.i.dueDate ?? new Date(r.i.issuedAt.getTime() + PAYMENT_TERMS_DAYS * 86400000).toISOString().slice(0, 10);
    const outstanding = r.i.status === 'paid' ? 0 : r.i.amount - received;
    const buyerGstin = buyerTp?.gstin ?? buyerPp?.gstin ?? null;
    const checks = tredsChecks({ udyam: seller?.udyamNumber ?? null, sellerGstin: seller?.gstin ?? null, buyerGstin, buyerType: buyerOrg.type, status: r.i.status, outstanding, disputed, dueDate: due });
    return { r, seller, buyerOrg, buyerGstin, outstanding, due, checks };
  }

  @Get('projects/:pid/invoices/:iid/treds')
  async treds(@Ctx() ctx: RequestContext, @Param('pid', ParseUUIDPipe) pid: string, @Param('iid', ParseUUIDPipe) iid: string) {
    const x = await this.tredsContext(ctx, pid, iid);
    const refs = await this.db.select().from(tredsReferrals).where(eq(tredsReferrals.invoiceId, iid));
    return { invoice: x.r.i.number, outstanding: x.outstanding, dueDate: x.due, buyer: x.buyerOrg.displayName, checks: x.checks, eligible: x.checks.every((c) => c.ok), platforms: TREDS_PLATFORMS, prepared: refs.map((p) => ({ platform: p.platform, at: p.createdAt })),
      note: 'TReDS platforms are licensed by the RBI. You upload the invoice there and the buyer accepts it; financiers bid and the platform settles. COLLABIZ does not finance invoices or handle the money.' };
  }

  @Post('projects/:pid/invoices/:iid/treds')
  @HttpCode(200)
  async prepareTreds(@Ctx() ctx: RequestContext, @Param('pid', ParseUUIDPipe) pid: string, @Param('iid', ParseUUIDPipe) iid: string, @Body(body(z.object({ platform: z.enum(Object.keys(TREDS_PLATFORMS) as [keyof typeof TREDS_PLATFORMS, ...(keyof typeof TREDS_PLATFORMS)[]]) }))) b: { platform: keyof typeof TREDS_PLATFORMS }) {
    const x = await this.tredsContext(ctx, pid, iid);
    if (!manager(ctx, x.r.i.issuedByOrgId)) throw new ForbiddenException('A company owner or admin prepares invoices for discounting');
    const failing = x.checks.filter((c) => !c.ok);
    if (failing.length) throw new BadRequestException(`Not ready for TReDS: ${failing.map((c) => c.detail).join('; ')}`);
    await this.db.insert(tredsReferrals).values({ invoiceId: iid, orgId: x.r.i.issuedByOrgId, platform: b.platform, createdBy: ctx.userId }).onConflictDoNothing();
    await this.audit.record(ctx, { action: 'finance.treds_prepared', objectType: 'project_invoice', objectId: iid, after: { platform: b.platform, outstanding: x.outstanding } });
    const head = ['Invoice Number', 'Invoice Date', 'Due Date', 'Seller GSTIN', 'Seller Udyam', 'Buyer Name', 'Buyer GSTIN', 'Invoice Amount (INR)', 'Amount Outstanding (INR)', 'Reference'];
    const row = [x.r.i.number, x.r.i.issuedAt.toISOString().slice(0, 10), x.due, x.seller!.gstin, x.seller!.udyamNumber, x.buyerOrg.legalName, x.buyerGstin, (x.r.i.amount / 100).toFixed(2), (x.outstanding / 100).toFixed(2), `${x.r.p.code} milestone invoice`];
    const csv = [head, row].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    return { platform: TREDS_PLATFORMS[b.platform], csv, connected: providerConnected('treds'), note: PROVIDERS.treds.manual };
  }

  // ---------- Tender feed ----------
  @Post('admin/tender-feed')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  @HttpCode(201)
  async importFeed(@Ctx() ctx: RequestContext, @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined, @Body() raw: Record<string, string>) {
    if (!staff(ctx)) throw new ForbiddenException('For Unite admins');
    if (!file) throw new BadRequestException('Attach the feed file (RSS or XML)');
    const source = (raw.source || file.originalname.replace(/\.[a-z]+$/i, '')).slice(0, 60);
    let doc: Record<string, any>;
    try { doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' }).parse(file.buffer.toString('utf8')); } catch { throw new BadRequestException('This feed file could not be read'); }
    const items: Record<string, unknown>[] = [doc?.rss?.channel?.item, doc?.feed?.entry].flat().filter(Boolean);
    if (!items.length) throw new BadRequestException('No tenders found — upload an RSS 2.0 or Atom feed');
    let added = 0, skipped = 0;
    for (const it of items.slice(0, 1000)) {
      const title = txt(it.title).slice(0, 300);
      if (!title) { skipped++; continue; }
      const link = txt(typeof it.link === 'object' && it.link && '@href' in (it.link as object) ? (it.link as Record<string, string>)['@href'] : it.link) || null;
      const summary = txt(it.description ?? it.summary).slice(0, 2000);
      const closing = /(?:closing|bid submission end|last date)[^0-9]{0,30}(\d{1,2}[-/][A-Za-z0-9]{2,3}[-/]\d{2,4})/i.exec(summary)?.[1];
      const parseD = (d?: string) => { if (!d) return null; const m = /^(\d{1,2})[-/]([A-Za-z]{3}|\d{1,2})[-/](\d{2,4})$/.exec(d); if (!m) return null; const mon = isNaN(Number(m[2])) ? ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase()) : Number(m[2]) - 1; const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); const dt = new Date(Date.UTC(y, mon, Number(m[1]))); return isNaN(+dt) || mon < 0 ? null : dt; };
      const pub = it.pubDate ?? it.updated ?? it.published;
      const r = await this.db.insert(tenderLeads).values({ source, externalId: (txt(it.guid ?? it.id) || link || title).slice(0, 300), title, link, buyer: txt(it.author ?? (it as Record<string, unknown>)['dc:creator']).slice(0, 200) || null, summary: summary || null,
        closesAt: parseD(closing), publishedAt: pub && !isNaN(Date.parse(String(txt(pub)))) ? new Date(txt(pub)) : null, sector: guessSector(`${title} ${summary}`), importedBy: ctx.userId }).onConflictDoNothing().returning({ id: tenderLeads.id });
      if (r.length) added++; else skipped++;
    }
    await this.audit.record(ctx, { action: 'tender_feed.imported', objectType: 'tender_feed', objectId: ctx.userId, after: { source, added, skipped } });
    return { source, added, skipped };
  }

  @Get('admin/tender-leads')
  async leads(@Ctx() ctx: RequestContext) {
    if (!staff(ctx)) throw new ForbiddenException('For Unite admins');
    const rows = await this.db.select().from(tenderLeads).orderBy(desc(tenderLeads.createdAt)).limit(300);
    const sectors = [...new Set(rows.map((r) => r.sector).filter((x): x is string => !!x))];
    const counts = sectors.length ? await this.db.select({ s: sql<string>`unnest(${partnerProfiles.sectors})`, n: sql<number>`count(*)::int` }).from(partnerProfiles).innerJoin(organizations, eq(organizations.id, partnerProfiles.organizationId)).where(eq(organizations.verificationStatus, 'verified')).groupBy(sql`1`) : [];
    return { autoFetch: { connected: providerConnected('tender_feed'), note: PROVIDERS.tender_feed.needs }, leads: rows.map((r) => ({ ...r, matchingPartners: r.sector ? counts.find((c) => c.s === r.sector)?.n ?? 0 : 0 })) };
  }

  @Post('admin/tender-leads/:id/status')
  @HttpCode(200)
  async setLead(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(TenderLeadStatusSchema)) b: z.infer<typeof TenderLeadStatusSchema>) {
    if (!staff(ctx)) throw new ForbiddenException('For Unite admins');
    const [r] = await this.db.update(tenderLeads).set({ status: b.status }).where(eq(tenderLeads.id, id)).returning();
    if (!r) throw new NotFoundException('Not found');
    return r;
  }

  @Post('admin/tender-feed/fetch')
  @HttpCode(200)
  fetchFeed(@Ctx() ctx: RequestContext) {
    if (!staff(ctx)) throw new ForbiddenException('For Unite admins');
    return requireProvider('tender_feed');
  }
}

@Module({ controllers: [ChannelsController] })
export class ChannelsModule {}
