/**
 * Unite Solar sales desk — solar kits, quotes (kit / EPC / PPA), quotes from an uploaded power bill, commission, referrals.
 *
 * Rules (tested in test/solar.e2e.ts):
 *  - Verified partners and Unite admins quote; partners see only their own company's quotes. Prices, subsidy, savings and
 *    commission are always calculated here from Unite Solar's settings (the shared engine in @collabiz/types).
 *  - The customer must have asked for the quote (consent method recorded). Bills are private files, read once for their numbers
 *    and deleted after 90 days; the numbers stay on the quote.
 *  - Partners move a quote draft → sent → accepted/declined. Only Unite admins mark an order won, installed and paid.
 *    Won opens a projected commission line in the partner's Earnings; the customer's payment makes it earned (same ledger and
 *    rules as every other commission). Installed makes the referral reward due and gives the customer their own referral link.
 *  - Commission and referral settings are changed only by super admins or finance.
 */
import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  DEFAULT_SOLAR_CONFIG, SOLAR_MODELS, SOLAR_QUOTE_NEXT, SOLAR_QUOTE_STATUSES, SOLAR_SYSTEMS, SolarKitSchema, SolarQuoteSchema, SolarReferralSchema, SolarSiteSchema,
  phone10, pickKit, quoteSolar, readBill, recommendKw, type SolarConfig, type SolarKitLike,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  bankProfiles, commissionAgreements, commissionEntries, commissionPolicies, groupCompanies, memberships, notifications, organizations, solarBills, solarConfigs, solarKits, solarQuotes,
  solarReferralCodes, solarReferrals, users,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { MAX_UPLOAD_BYTES, StorageService } from '../../common/adapters';
import { canonicalJson, randomDigits, sha256 } from '../../common/crypto';
import { CommissionsModule, CommissionsService, lineAmounts } from '../commissions/commissions.controller';

const PARTNER = ['partner_company', 'partner_individual'];
const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const money = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'finance');
const STAFF_ONLY = ['won', 'installed', 'paid'];
const BILL_KEEP_DAYS = 90;
const kitView = (k: typeof solarKits.$inferSelect) => ({
  id: k.id, code: k.code, name: k.name, system: k.system, capacityKw: k.capacityW / 1000, panelW: k.panelW, panelCount: Math.ceil(k.capacityW / k.panelW), inverterKw: k.inverterW / 1000,
  batteryKwh: k.batteryWh != null ? k.batteryWh / 1000 : null, phase: k.phase, price: k.price, warrantyYears: k.warrantyYears, includes: k.includes as string[], description: k.description, status: k.status,
});
const maskPhone = (p: string) => `${p.slice(0, 2)}••••••${p.slice(-2)}`;
const firstName = (n: string) => n.trim().split(/\s+/)[0];

// pdf-parse's index runs a self-test when required directly; the library file does not.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfText = (buf: Buffer): Promise<string> => (require('pdf-parse/lib/pdf-parse.js') as (b: Buffer) => Promise<{ text: string }>)(buf).then((r) => r.text);

@Injectable()
export class SolarService {
  constructor(@InjectDb() private db: Db) {}

  async uniteSolar() {
    const [o] = await this.db.select({ id: organizations.id, name: organizations.displayName }).from(groupCompanies).innerJoin(organizations, eq(organizations.id, groupCompanies.organizationId))
      .where(eq(groupCompanies.brandName, 'Unite Solar')).limit(1);
    if (!o) throw new ConflictException('Unite Solar is not set up as a group company yet');
    return o;
  }
  async config(): Promise<SolarConfig> {
    const o = await this.uniteSolar();
    const [c] = await this.db.select({ config: solarConfigs.config }).from(solarConfigs).where(eq(solarConfigs.ownerOrgId, o.id)).limit(1);
    return { ...DEFAULT_SOLAR_CONFIG, ...((c?.config as Partial<SolarConfig>) ?? {}) };
  }
  async kits(all = false) {
    const rows = await this.db.select().from(solarKits).where(all ? undefined : eq(solarKits.status, 'active')).orderBy(sql`array_position(array['on_grid','hybrid','off_grid'], ${solarKits.system})`, solarKits.capacityW);
    return rows.map(kitView);
  }
  async quote(id: string) {
    const [q] = await this.db.select().from(solarQuotes).where(eq(solarQuotes.id, id)).limit(1);
    if (!q) throw new NotFoundException('Quote not found');
    return q;
  }
  /** Prices a request with the current settings and kit list. */
  async calc(input: { site: z.infer<typeof SolarSiteSchema>; model: string; system: string; kitId?: string; capacityKw?: number }) {
    const cfg = await this.config();
    let kit: (SolarKitLike & { id: string }) | null = null;
    if (input.model === 'kit') {
      const kits = await this.kits();
      kit = input.kitId ? kits.find((k) => k.id === input.kitId) ?? null : pickKit(kits, input.system, recommendKw(cfg, input.site).kw);
      if (!kit) throw new BadRequestException(input.kitId ? 'That kit is not available' : 'No kit of this type is available — choose another system type or EPC');
    }
    try { return { calc: quoteSolar(cfg, input, kit), kit }; } catch (e) { throw new BadRequestException((e as Error).message); }
  }
  async view(q: typeof solarQuotes.$inferSelect) {
    const [partner] = q.partnerOrgId ? await this.db.select({ name: organizations.displayName }).from(organizations).where(eq(organizations.id, q.partnerOrgId)) : [];
    const [bill] = q.billId ? await this.db.select({ fileName: solarBills.fileName, extract: solarBills.extract, deleteAfter: solarBills.deleteAfter, deletedAt: solarBills.deletedAt }).from(solarBills).where(eq(solarBills.id, q.billId)) : [];
    const [ref] = q.referralId ? await this.db.select({ r: solarReferrals, owner: solarReferralCodes.ownerName }).from(solarReferrals).innerJoin(solarReferralCodes, eq(solarReferralCodes.id, solarReferrals.codeId)).where(eq(solarReferrals.id, q.referralId)) : [];
    const [entry] = q.commissionEntryId ? await this.db.select({ status: commissionEntries.status, payable: commissionEntries.payable }).from(commissionEntries).where(eq(commissionEntries.id, q.commissionEntryId)) : [];
    const [customerCode] = await this.db.select({ code: solarReferralCodes.code }).from(solarReferralCodes).where(eq(solarReferralCodes.sourceQuoteId, q.id)).limit(1);
    return {
      id: q.id, code: q.code, partner: partner?.name ?? null, customer: q.customer, consentMethod: q.consentMethod, site: q.site, model: q.model, system: q.system, kitId: q.kitId, capacityKw: q.capacityW / 1000,
      calc: q.calc, total: q.total, net: q.net, commission: q.commission, status: q.status, statusNote: q.statusNote, validUntil: q.validUntil, notes: q.notes, createdAt: q.createdAt,
      next: SOLAR_QUOTE_NEXT[q.status] ?? [], bill: bill ? { fileName: bill.fileName, extract: bill.extract, fileDeleted: !!bill.deletedAt, deleteAfter: bill.deleteAfter } : null,
      referral: ref ? { by: ref.owner, status: ref.r.status, reward: ref.r.reward } : null, commissionEntry: entry ?? null, customerReferralCode: customerCode?.code ?? null,
    };
  }
  /** Each partner user gets one personal referral code. */
  async codeFor(userId: string, orgId: string | null) {
    const [c] = await this.db.select().from(solarReferralCodes).where(eq(solarReferralCodes.ownerUserId, userId)).limit(1);
    if (c) return c;
    const [u] = await this.db.select({ name: users.fullName }).from(users).where(eq(users.id, userId));
    const stem = (u?.name ?? 'SUN').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5) || 'SUN';
    for (let i = 0; i < 5; i++) {
      const [row] = await this.db.insert(solarReferralCodes).values({ code: `${stem}${randomDigits(3)}`, ownerUserId: userId, ownerOrgId: orgId, ownerName: u?.name ?? 'A COLLABIZ partner' }).onConflictDoNothing().returning();
      if (row) return row;
      const [again] = await this.db.select().from(solarReferralCodes).where(eq(solarReferralCodes.ownerUserId, userId)).limit(1);
      if (again) return again;
    }
    throw new ConflictException('Could not create a referral code — try again');
  }
  async notifyStaff(title: string, text: string, link: string) {
    const admins = await this.db.selectDistinct({ u: memberships.userId }).from(memberships).where(and(inArray(memberships.role, ['unite_admin', 'super_admin']), eq(memberships.status, 'active')));
    if (admins.length) await this.db.insert(notifications).values(admins.map((a) => ({ userId: a.u, kind: 'announcement', title, body: text, link })));
  }
  async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const m = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    if (m.length) await this.db.insert(notifications).values(m.map((x) => ({ userId: x.u, kind: 'announcement', title, body: text, link })));
  }
  /** Deletes bill files past their keep date (the extracted numbers stay). */
  async purgeBills(storage: StorageService) {
    const due = await this.db.select({ id: solarBills.id, key: solarBills.objectKey }).from(solarBills).where(and(lt(solarBills.deleteAfter, new Date()), isNull(solarBills.deletedAt))).limit(200);
    for (const b of due) { await storage.remove(b.key).catch(() => undefined); await this.db.update(solarBills).set({ deletedAt: new Date() }).where(eq(solarBills.id, b.id)); }
    return due.length;
  }
}

const PreviewSchema = z.object({ site: SolarSiteSchema, model: z.enum(SOLAR_MODELS), system: z.enum(SOLAR_SYSTEMS).default('on_grid'), kitId: z.string().uuid().optional(), capacityKw: z.number().min(0.5).max(100_000).optional() });
const StatusSchema = z.object({ status: z.enum(SOLAR_QUOTE_STATUSES), note: z.string().trim().max(1000).optional() });
const ConfigSchema = z.object({
  gstBps: z.number().int().min(0).max(2800).optional(),
  exportRate: z.number().int().min(0).max(2000).optional(),
  ppa: z.object({ minKw: z.number().min(1).max(100000), tariff: z.number().int().min(100).max(2000), termYears: z.number().int().min(5).max(30), escalationBps: z.number().int().min(0).max(1000) }).optional(),
  epcRates: z.array(z.object({ upToKw: z.number().min(1), perWp: z.number().int().min(1000).max(20000) })).min(1).max(10).optional(),
  commission: z.object({ kitPerKw: z.number().int().min(0).max(1_00_000_00), kitMin: z.number().int().min(0).max(1_00_000_00), epcTiers: z.array(z.object({ upTo: z.number().int().min(1).nullable(), rateBps: z.number().int().min(0).max(2000) })).min(1).max(6), ppaPerKw: z.number().int().min(0).max(1_00_000_00) }).optional(),
  referral: z.object({ residentialFlat: z.number().int().min(0).max(1_00_000_00), businessPerKw: z.number().int().min(0).max(10_000_00), businessCap: z.number().int().min(0).max(10_00_000_00) }).optional(),
});

@ApiTags('Unite Solar')
@Controller()
export class SolarController {
  constructor(@InjectDb() private db: Db, private svc: SolarService, private audit: AuditService, private storage: StorageService, private commissions: CommissionsService) {}

  /** Staff, or a member of a verified partner company. */
  private async seller(ctx: RequestContext) {
    if (staff(ctx)) return { partnerOrgId: null as string | null };
    if (!ctx.orgId) throw new ForbiddenException('Choose your company first');
    const [org] = await this.db.select({ type: organizations.type, status: organizations.verificationStatus }).from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
    if (!org || !PARTNER.includes(org.type) || org.status !== 'verified') throw new ForbiddenException('Solar quotes are for verified partners');
    return { partnerOrgId: ctx.orgId };
  }
  private async mine(ctx: RequestContext, id: string) {
    const q = await this.svc.quote(id);
    if (!staff(ctx) && q.partnerOrgId !== ctx.orgId) throw new NotFoundException('Quote not found');
    return q;
  }

  // ---------- public ----------
  @Public()
  @Get('solar/kits')
  async kitList() { return this.svc.kits(); }

  @Public()
  @Get('public/solar/refer/:code')
  async referLanding(@Param('code') code: string) {
    const [c] = await this.db.select({ name: solarReferralCodes.ownerName }).from(solarReferralCodes).where(eq(solarReferralCodes.code, code.toUpperCase())).limit(1);
    if (!c) throw new NotFoundException('This referral link is not valid');
    const cfg = await this.svc.config();
    return { by: firstName(c.name), subsidy: cfg.subsidy.cap, kits: (await this.svc.kits()).filter((k) => k.system === 'on_grid').slice(0, 4) };
  }

  @Public()
  @Post('public/solar/refer/:code')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async refer(@Param('code') code: string, @Body(body(SolarReferralSchema)) b: z.infer<typeof SolarReferralSchema>) {
    const [c] = await this.db.select().from(solarReferralCodes).where(eq(solarReferralCodes.code, code.toUpperCase())).limit(1);
    if (!c) throw new NotFoundException('This referral link is not valid');
    const p = phone10(b.phone);
    if (c.ownerPhone && phone10(c.ownerPhone) === p) throw new BadRequestException('You cannot refer yourself');
    const [r] = await this.db.insert(solarReferrals).values({ codeId: c.id, name: b.name, phone10: p, city: b.city, region: b.region, segment: b.segment, monthlyBill: b.monthlyBill ?? null }).onConflictDoNothing().returning();
    if (!r) throw new ConflictException('This number is already with Unite Solar — we will be in touch');
    await this.svc.notifyStaff(`New solar referral: ${b.name}, ${b.city}`, `Referred by ${c.ownerName}.`, '/workspace/solar?tab=referrals');
    if (c.ownerOrgId) await this.svc.notifyOrg(c.ownerOrgId, `Your referral ${firstName(b.name)} asked about solar`, `${b.city}. Unite Solar or your team will call them.`, '/solar?tab=referrals');
    return { ok: true, message: 'Thank you — Unite Solar will call you within two working days.' };
  }

  // ---------- partners and staff ----------
  @Get('solar/overview')
  async overview(@Ctx() ctx: RequestContext) {
    const { partnerOrgId } = await this.seller(ctx);
    const cfg = await this.svc.config();
    const code = await this.svc.codeFor(ctx.userId, ctx.orgId ?? null);
    const qs = await this.db.select({ status: solarQuotes.status, total: solarQuotes.total, commission: solarQuotes.commission, model: solarQuotes.model }).from(solarQuotes).where(partnerOrgId ? eq(solarQuotes.partnerOrgId, partnerOrgId) : undefined);
    const open = qs.filter((q) => ['draft', 'sent', 'accepted'].includes(q.status));
    const won = qs.filter((q) => ['won', 'installed', 'paid'].includes(q.status));
    const refs = await this.db.select({ status: solarReferrals.status, reward: solarReferrals.reward }).from(solarReferrals).where(eq(solarReferrals.codeId, code.id));
    return {
      totals: { quotes: qs.length, open: open.length, openValue: open.reduce((a, q) => a + q.total, 0), won: won.length, wonValue: won.reduce((a, q) => a + q.total, 0), commissionProjected: won.reduce((a, q) => a + q.commission, 0), referrals: refs.length, rewardsDue: refs.filter((r) => r.status === 'installed').reduce((a, r) => a + (r.reward ?? 0), 0) },
      structure: { commission: cfg.commission, referral: cfg.referral, ppa: cfg.ppa, subsidy: cfg.subsidy, gstBps: cfg.gstBps, epcRates: cfg.epcRates },
      referralCode: code.code,
    };
  }

  @Post('solar/bills')
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async uploadBill(@Ctx() ctx: RequestContext, @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string } | undefined) {
    await this.seller(ctx);
    if (!file) throw new BadRequestException('Attach the electricity bill (PDF or photo)');
    const stored = await this.storage.put(file.buffer, file.mimetype, 'solar-bills');
    let text = '';
    if (file.mimetype === 'application/pdf') text = await pdfText(file.buffer).catch(() => '');
    const extract = readBill(text);
    const readable = extract.found.length > 0;
    const [b] = await this.db.insert(solarBills).values({ orgId: ctx.orgId ?? null, uploadedBy: ctx.userId, objectKey: stored.key, fileName: file.originalname.slice(0, 200), mime: stored.mime, size: stored.size, sha256: stored.sha256, extract, deleteAfter: new Date(Date.now() + BILL_KEEP_DAYS * 86400_000) }).returning();
    await this.audit.record(ctx, { action: 'solar.bill_uploaded', objectType: 'solar_bill', objectId: b.id, after: { found: extract.found } });
    return {
      id: b.id, extract, readable,
      message: readable ? `Read ${extract.found.join(', ')} from the bill. Check the numbers before quoting.`
        : file.mimetype === 'application/pdf' ? 'This PDF has no readable text (it may be a scan). Type the units and amount from the bill.' : 'Photos are kept with the quote, but numbers are read only from PDF bills for now. Type the units and amount from the bill.',
    };
  }

  @Post('solar/preview')
  @HttpCode(200)
  async preview(@Ctx() ctx: RequestContext, @Body(body(PreviewSchema)) b: z.infer<typeof PreviewSchema>) {
    await this.seller(ctx);
    const { calc, kit } = await this.svc.calc(b);
    const cfg = await this.svc.config();
    return { calc, kit, ppaMinKw: cfg.ppa.minKw };
  }

  @Post('solar/quotes')
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(SolarQuoteSchema)) b: z.infer<typeof SolarQuoteSchema>) {
    const { partnerOrgId } = await this.seller(ctx);
    const owner = await this.svc.uniteSolar();
    if (b.billId) {
      const [bill] = await this.db.select({ by: solarBills.uploadedBy }).from(solarBills).where(eq(solarBills.id, b.billId)).limit(1);
      if (!bill || bill.by !== ctx.userId) throw new BadRequestException('Upload the bill again');
    }
    const { calc, kit } = await this.svc.calc(b);
    const p = phone10(b.customer.phone);
    // A referral for this customer (by phone, or the code they gave) is linked so the referrer is rewarded on installation.
    let [ref] = await this.db.select({ id: solarReferrals.id, status: solarReferrals.status }).from(solarReferrals).where(eq(solarReferrals.phone10, p)).limit(1);
    if (!ref && b.referralCode) {
      const [c] = await this.db.select().from(solarReferralCodes).where(eq(solarReferralCodes.code, b.referralCode.toUpperCase())).limit(1);
      if (!c) throw new BadRequestException('That referral code is not valid');
      if (c.ownerUserId === ctx.userId || (c.ownerOrgId && c.ownerOrgId === partnerOrgId)) throw new BadRequestException('A partner cannot use their own referral code on their own quote');
      [ref] = await this.db.insert(solarReferrals).values({ codeId: c.id, name: b.customer.name, phone10: p, city: b.customer.city, region: b.site.region, segment: b.site.segment }).onConflictDoNothing().returning({ id: solarReferrals.id, status: solarReferrals.status });
    }
    const valid = new Date(Date.now() + 15 * 86400_000).toISOString().slice(0, 10);
    const [q] = await this.db.insert(solarQuotes).values({
      code: `QT-SOL-${new Date().getFullYear()}-${randomDigits(5)}`, ownerOrgId: owner.id, partnerOrgId, createdBy: ctx.userId, customer: b.customer, phone10: p, consentMethod: b.consentMethod, site: b.site,
      model: calc.model, system: calc.system, kitId: kit?.id ?? null, capacityW: Math.round(calc.capacityKw * 1000), calc, total: calc.total, net: calc.net, commission: partnerOrgId ? calc.commission : 0,
      billId: b.billId ?? null, referralId: ref?.id ?? null, notes: b.notes ?? null, validUntil: valid,
    }).returning();
    if (ref && ref.status === 'new') await this.db.update(solarReferrals).set({ status: 'quoted', quoteId: q.id, updatedAt: new Date() }).where(eq(solarReferrals.id, ref.id));
    await this.audit.record(ctx, { action: 'solar.quoted', objectType: 'solar_quote', objectId: q.id, after: { code: q.code, model: q.model, kw: calc.capacityKw, total: q.total } });
    return this.svc.view(q);
  }

  @Get('solar/quotes')
  async list(@Ctx() ctx: RequestContext) {
    const { partnerOrgId } = await this.seller(ctx);
    const rows = await this.db.select().from(solarQuotes).where(partnerOrgId ? eq(solarQuotes.partnerOrgId, partnerOrgId) : undefined).orderBy(desc(solarQuotes.createdAt)).limit(300);
    return rows.map((q) => ({ id: q.id, code: q.code, customer: (q.customer as { name: string; city: string }).name, city: (q.customer as { city: string }).city, model: q.model, system: q.system, capacityKw: q.capacityW / 1000, total: q.total, net: q.net, commission: q.commission, status: q.status, createdAt: q.createdAt, validUntil: q.validUntil }));
  }

  @Get('solar/quotes/:id')
  async one(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.seller(ctx);
    return this.svc.view(await this.mine(ctx, id));
  }

  @Post('solar/quotes/:id/status')
  @HttpCode(200)
  async status(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(StatusSchema)) b: z.infer<typeof StatusSchema>) {
    await this.seller(ctx);
    const q = await this.mine(ctx, id);
    if (!(SOLAR_QUOTE_NEXT[q.status] ?? []).includes(b.status)) throw new ConflictException(`A quote that is ${q.status} cannot become ${b.status}`);
    if (STAFF_ONLY.includes(b.status) && !staff(ctx)) throw new ForbiddenException('Unite Solar confirms orders, installations and payments');
    const now = new Date();
    const patch: Partial<typeof solarQuotes.$inferInsert> = { status: b.status, statusNote: b.note ?? null, updatedAt: now };
    if (b.status === 'won') patch.wonAt = now;
    if (b.status === 'installed') patch.installedAt = now;
    if (b.status === 'paid') patch.paidAt = now;
    if (b.status === 'sent' && q.status === 'expired') patch.validUntil = new Date(Date.now() + 15 * 86400_000).toISOString().slice(0, 10);
    await this.db.update(solarQuotes).set(patch).where(eq(solarQuotes.id, id));
    const c = q.customer as { name: string; phone: string };
    if (b.status === 'won' && q.partnerOrgId && q.commission > 0) await this.openCommission(ctx, q);
    if (b.status === 'paid' && q.commissionEntryId) {
      const [e] = await this.db.select().from(commissionEntries).where(eq(commissionEntries.id, q.commissionEntryId)).limit(1);
      if (e?.status === 'estimated') {
        const eligible = await this.commissions.move(e, 'eligible', ctx.userId, `Solar order ${q.code} invoiced`);
        const earned = await this.commissions.move(eligible, 'earned', ctx.userId, 'Customer payment received', { earnedAt: now });
        await this.commissions.notifyOrg(e.beneficiaryOrgId, 'Commission earned', `${e.description}: ₹${(earned.payable / 100).toLocaleString('en-IN')} earned; awaiting finance approval.`, '/earnings/live');
      }
    }
    if (b.status === 'installed') {
      if (q.referralId) {
        const reward = (q.calc as { referralReward: number }).referralReward;
        const [r] = await this.db.update(solarReferrals).set({ status: 'installed', reward, updatedAt: now }).where(and(eq(solarReferrals.id, q.referralId), inArray(solarReferrals.status, ['new', 'quoted']))).returning();
        const [code] = r ? await this.db.select().from(solarReferralCodes).where(eq(solarReferralCodes.id, r.codeId)) : [];
        if (code?.ownerOrgId) await this.svc.notifyOrg(code.ownerOrgId, 'Referral reward due', `${firstName(r.name)}'s solar system is installed — ₹${(reward / 100).toLocaleString('en-IN')} reward is due.`, '/solar?tab=referrals');
      }
      // The customer gets their own referral code to share.
      await this.db.insert(solarReferralCodes).values({ code: `${firstName(c.name).replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5) || 'SUN'}${randomDigits(4)}`, ownerName: c.name, ownerPhone: phone10(c.phone), sourceQuoteId: q.id }).onConflictDoNothing();
    }
    if (b.status === 'declined' && q.referralId) await this.db.update(solarReferrals).set({ status: 'lost', updatedAt: now }).where(and(eq(solarReferrals.id, q.referralId), eq(solarReferrals.status, 'quoted')));
    if (q.partnerOrgId && staff(ctx)) await this.svc.notifyOrg(q.partnerOrgId, `Solar quote ${q.code}: ${b.status}`, `${c.name} — ${b.note ?? 'updated by Unite Solar'}`, `/solar/quotes/${q.id}`);
    await this.audit.record(ctx, { action: 'solar.status', objectType: 'solar_quote', objectId: id, before: { status: q.status }, after: { status: b.status } });
    return this.svc.view(await this.svc.quote(id));
  }

  /** Won partner quote → commission agreement (frozen terms) and a projected line in the partner's Earnings. */
  private async openCommission(ctx: RequestContext, q: typeof solarQuotes.$inferSelect) {
    const [pol] = await this.db.select().from(commissionPolicies).where(and(eq(commissionPolicies.code, 'INTRODUCER-STD'), eq(commissionPolicies.status, 'active'))).orderBy(desc(commissionPolicies.version)).limit(1);
    if (!pol) throw new ConflictException('No active commission policy — ask finance to activate INTRODUCER-STD');
    const [bank] = await this.db.select({ gst: bankProfiles.gstRegistered }).from(bankProfiles).where(eq(bankProfiles.organizationId, q.partnerOrgId!)).limit(1);
    const base = q.total > 0 ? q.total : q.commission; // PPA has no sale price: the line is the fixed per-kWp amount
    const terms = { policy: { code: `SOLAR-${q.model.toUpperCase()}`, version: 1, name: `Unite Solar ${q.model.toUpperCase()} — ${q.code}`, basis: 'flat', rateBps: null, flatAmount: q.commission, tiers: null, tdsBps: pol.tdsBps, clawbackDays: pol.clawbackDays, trigger: 'Customer payment for the solar order' }, shareBps: 10000, gstRegistered: !!bank?.gst, projectValue: base };
    const [a] = await this.db.insert(commissionAgreements).values({ code: `CA-${new Date().getUTCFullYear()}-${randomDigits(6)}`, beneficiaryOrgId: q.partnerOrgId!, payerOrgId: q.ownerOrgId, solarQuoteId: q.id, policyId: pol.id, terms, termsHash: sha256(canonicalJson(terms)), createdBy: ctx.userId }).returning();
    const amounts = lineAmounts(terms as never, base);
    const c = q.customer as { name: string };
    const [e] = await this.db.insert(commissionEntries).values({ agreementId: a.id, beneficiaryOrgId: a.beneficiaryOrgId, solarQuoteId: q.id, description: `Solar ${q.code}: ${c.name} (${q.capacityW / 1000} kW)`, baseAmount: base, ...amounts }).returning();
    await this.commissions.journal(e.id, 'entry.estimated', null, 'estimated', e.payable, `Solar order won (${q.code})`, ctx.userId);
    await this.db.update(solarQuotes).set({ commissionEntryId: e.id }).where(eq(solarQuotes.id, q.id));
  }

  @Get('solar/referrals')
  async referrals(@Ctx() ctx: RequestContext) {
    await this.seller(ctx);
    const code = await this.svc.codeFor(ctx.userId, ctx.orgId ?? null);
    const rows = await this.db.select().from(solarReferrals).where(eq(solarReferrals.codeId, code.id)).orderBy(desc(solarReferrals.createdAt));
    return { code: code.code, referrals: rows.map((r) => ({ id: r.id, name: firstName(r.name), phone: maskPhone(r.phone10), city: r.city, segment: r.segment, status: r.status, reward: r.reward, createdAt: r.createdAt })) };
  }

  // ---------- Unite admins ----------
  @Get('admin/solar')
  async admin(@Ctx() ctx: RequestContext) {
    if (!staff(ctx) && !money(ctx)) throw new ForbiddenException('The solar desk is for Unite admins');
    await this.svc.purgeBills(this.storage);
    const cfg = await this.svc.config();
    const quotes = await this.db.select({ q: solarQuotes, partner: organizations.displayName }).from(solarQuotes).leftJoin(organizations, eq(organizations.id, solarQuotes.partnerOrgId)).orderBy(desc(solarQuotes.createdAt)).limit(300);
    const refs = await this.db.select({ r: solarReferrals, by: solarReferralCodes.ownerName, code: solarReferralCodes.code }).from(solarReferrals).innerJoin(solarReferralCodes, eq(solarReferralCodes.id, solarReferrals.codeId)).orderBy(desc(solarReferrals.createdAt)).limit(300);
    const won = quotes.filter((x) => ['won', 'installed', 'paid'].includes(x.q.status));
    return {
      totals: {
        quotes: quotes.length, open: quotes.filter((x) => ['draft', 'sent', 'accepted'].includes(x.q.status)).length, openValue: quotes.filter((x) => ['draft', 'sent', 'accepted'].includes(x.q.status)).reduce((a, x) => a + x.q.total, 0),
        won: won.length, wonKw: won.reduce((a, x) => a + x.q.capacityW, 0) / 1000, wonValue: won.reduce((a, x) => a + x.q.total, 0), commission: won.reduce((a, x) => a + x.q.commission, 0),
        referrals: refs.length, rewardsDue: refs.filter((x) => x.r.status === 'installed').reduce((a, x) => a + (x.r.reward ?? 0), 0),
      },
      quotes: quotes.map(({ q, partner }) => ({ id: q.id, code: q.code, customer: (q.customer as { name: string }).name, city: (q.customer as { city: string }).city, partner, model: q.model, system: q.system, capacityKw: q.capacityW / 1000, total: q.total, commission: q.commission, status: q.status, createdAt: q.createdAt })),
      referrals: refs.map(({ r, by, code }) => ({ id: r.id, name: r.name, phone: maskPhone(r.phone10), city: r.city, segment: r.segment, status: r.status, reward: r.reward, by, code, createdAt: r.createdAt, quoteId: r.quoteId })),
      kits: await this.svc.kits(true), config: cfg, canEditMoney: money(ctx),
    };
  }

  @Post('admin/solar/kits')
  @HttpCode(201)
  async addKit(@Ctx() ctx: RequestContext, @Body(body(SolarKitSchema)) b: z.infer<typeof SolarKitSchema>) {
    if (!staff(ctx)) throw new ForbiddenException('Kits are managed by Unite admins');
    const owner = await this.svc.uniteSolar();
    const sys = { on_grid: 'OG', hybrid: 'HY', off_grid: 'OF' }[b.system];
    const [k] = await this.db.insert(solarKits).values({
      code: `USK-${sys}-${String(b.capacityKw).replace('.', '_')}-${randomDigits(3)}`, ownerOrgId: owner.id, name: b.name, system: b.system, capacityW: Math.round(b.capacityKw * 1000), panelW: b.panelW,
      inverterW: Math.round(b.inverterKw * 1000), batteryWh: b.batteryKwh ? Math.round(b.batteryKwh * 1000) : null, phase: b.phase, price: b.price, warrantyYears: b.warrantyYears, includes: b.includes, description: b.description, createdBy: ctx.userId,
    }).returning();
    await this.audit.record(ctx, { action: 'solar.kit_added', objectType: 'solar_kit', objectId: k.id, after: { code: k.code, price: k.price } });
    return kitView(k);
  }

  @Patch('admin/solar/kits/:id')
  async editKit(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ price: z.number().int().min(1).max(1_00_00_00_000_00).optional(), status: z.enum(['active', 'retired']).optional() }))) b: { price?: number; status?: string }) {
    if (!staff(ctx)) throw new ForbiddenException('Kits are managed by Unite admins');
    const [before] = await this.db.select().from(solarKits).where(eq(solarKits.id, id));
    if (!before) throw new NotFoundException('Kit not found');
    const [k] = await this.db.update(solarKits).set({ ...b, updatedAt: new Date() }).where(eq(solarKits.id, id)).returning();
    await this.audit.record(ctx, { action: 'solar.kit_changed', objectType: 'solar_kit', objectId: id, before: { price: before.price, status: before.status }, after: b });
    return kitView(k);
  }

  @Patch('admin/solar/config')
  async setConfig(@Ctx() ctx: RequestContext, @Body(body(ConfigSchema)) b: z.infer<typeof ConfigSchema>) {
    if (!money(ctx)) throw new ForbiddenException('Only super admins and finance change prices, commission and rewards');
    if (b.epcRates) b.epcRates.sort((x, y) => x.upToKw - y.upToKw);
    if (b.commission?.epcTiers && b.commission.epcTiers[b.commission.epcTiers.length - 1].upTo !== null) throw new BadRequestException('The last EPC commission tier must have no upper limit');
    const owner = await this.svc.uniteSolar();
    const before = await this.svc.config();
    const [cur] = await this.db.select().from(solarConfigs).where(eq(solarConfigs.ownerOrgId, owner.id));
    const next = { ...((cur?.config as object) ?? {}), ...b };
    await this.db.insert(solarConfigs).values({ ownerOrgId: owner.id, config: next, updatedBy: ctx.userId }).onConflictDoUpdate({ target: solarConfigs.ownerOrgId, set: { config: next, updatedBy: ctx.userId, updatedAt: new Date() } });
    await this.audit.record(ctx, { action: 'solar.config_changed', objectType: 'solar_config', objectId: owner.id, before: Object.fromEntries(Object.keys(b).map((k) => [k, (before as unknown as Record<string, unknown>)[k]])), after: b });
    return this.svc.config();
  }

  @Post('admin/solar/referrals/:id/:action')
  @HttpCode(200)
  async referralAction(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('action') action: string) {
    const [r] = await this.db.select().from(solarReferrals).where(eq(solarReferrals.id, id));
    if (!r) throw new NotFoundException('Referral not found');
    if (action === 'rewarded') {
      if (!money(ctx)) throw new ForbiddenException('Only super admins and finance record reward payments');
      if (r.status !== 'installed') throw new ConflictException('A reward is paid only after the referred system is installed');
      await this.db.update(solarReferrals).set({ status: 'rewarded', rewardedAt: new Date(), rewardedBy: ctx.userId, updatedAt: new Date() }).where(eq(solarReferrals.id, id));
    } else if (action === 'lost') {
      if (!staff(ctx)) throw new ForbiddenException('Referrals are managed by Unite admins');
      if (!['new', 'quoted'].includes(r.status)) throw new ConflictException('Only open referrals can be closed');
      await this.db.update(solarReferrals).set({ status: 'lost', updatedAt: new Date() }).where(eq(solarReferrals.id, id));
    } else throw new BadRequestException('Unknown action');
    await this.audit.record(ctx, { action: `solar.referral_${action}`, objectType: 'solar_referral', objectId: id, before: { status: r.status }, after: { status: action } });
    return { ok: true };
  }
}

@Module({ imports: [CommissionsModule], controllers: [SolarController], providers: [SolarService], exports: [SolarService] })
export class SolarModule {}
