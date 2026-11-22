/**
 * SOLBID connector — Unite's sealed-bid solar marketplace (separate app, same company).
 *
 * Rules (tested in test/solbid.e2e.ts):
 *  - Off unless SOLBID_API_URL and SOLBID_SHARED_SECRET are set (503 "not connected"). The public board needs only the URL.
 *  - Calls to SOLBID are signed: HMAC-SHA256(secret, `${ts}.${METHOD}.${path}.${rawBody}`) in x-collabiz-timestamp/-signature.
 *  - Only Unite admins hand a solar referral to SOLBID, and only after recording how the customer agreed to receive bids there.
 *    SOLBID gets name, mobile, city/state and the requirement — never the bill or roof photo. SOLBID invites the customer,
 *    who must confirm in their own SOLBID account before anything is published.
 *  - SOLBID's updates arrive signed (x-solbid-timestamp/-signature over `${ts}.${rawBody}`, 5-minute window). The outcome
 *    (bid count, award, contract value) is shown only when the customer chose to share it on SOLBID.
 *  - An award is recorded against the introducing partner for information only: any reward follows the signed agreement.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Headers, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { eq } from 'drizzle-orm';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { INDIA_STATES } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { organizations, solarReferralCodes, solarReferrals } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { config } from '../../config';
import { SolarModule, SolarService } from '../solar/solar.controller';

/** States SOLBID serves (its STATES list). */
const SOLBID_STATES = ['Andhra Pradesh', 'Telangana', 'Karnataka', 'Tamil Nadu', 'Kerala', 'Maharashtra', 'Gujarat', 'Rajasthan', 'Madhya Pradesh', 'Uttar Pradesh', 'Delhi', 'Haryana', 'Punjab', 'Odisha', 'West Bengal', 'Bihar', 'Chhattisgarh', 'Jharkhand', 'Goa', 'Uttarakhand', 'Himachal Pradesh', 'Assam'];
const HOUSE = ['SUNX', 'SUNGATE', 'SOLARVM', 'SOLCART', 'ROOFZ'];
const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const hmac = (secret: string, s: string) => createHmac('sha256', secret).update(s).digest('hex');
const STATUS_FOR: Record<string, string> = { 'intake.claimed': 'confirmed', 'project.awarded': 'awarded', 'project.completed': 'completed' };

export const SendToSolbidSchema = z.object({
  capacityKw: z.number().positive('Enter the system size').max(2_000_000),
  model: z.enum(['EPC', 'PPA']),
  consentNote: z.string().trim().min(10, 'Say how and when the customer agreed to receive bids on SOLBID').max(400),
});

@Injectable()
export class SolbidClient {
  private board: { at: number; data: unknown } | null = null;
  get enabled() { const c = config(); return !!(c.SOLBID_API_URL && c.SOLBID_SHARED_SECRET); }
  private base() { return config().SOLBID_API_URL!.replace(/\/$/, ''); }
  async call<T>(method: 'GET' | 'POST', path: string, payload?: object): Promise<{ status: number; body: T }> {
    if (!this.enabled) throw new ServiceUnavailableException('SOLBID is not connected yet (SOLBID_API_URL and SOLBID_SHARED_SECRET)');
    const raw = payload ? JSON.stringify(payload) : '';
    const full = `/api/v1${path}`;
    const ts = String(Date.now());
    const res = await fetch(this.base() + full, {
      method, body: payload ? raw : undefined, signal: AbortSignal.timeout(15_000),
      headers: { ...(payload ? { 'content-type': 'application/json' } : {}), 'x-collabiz-timestamp': ts, 'x-collabiz-signature': hmac(config().SOLBID_SHARED_SECRET!, `${ts}.${method}.${full}.${raw}`) },
    });
    const text = await res.text();
    let parsed: unknown = text; try { parsed = JSON.parse(text); } catch { /* plain text */ }
    return { status: res.status, body: parsed as T };
  }
  /** SOLBID's anonymised public board (counts and open requirements without customer details), cached for a minute. */
  async publicBoard() {
    if (!config().SOLBID_API_URL) return { connected: false };
    if (this.board && Date.now() - this.board.at < 60_000) return this.board.data;
    try {
      const r = await fetch(`${this.base()}/api/v1/public/stats`, { signal: AbortSignal.timeout(5_000) });
      if (!r.ok) return { connected: true, available: false };
      const data = { connected: true, available: true, ...(await r.json()) as object };
      this.board = { at: Date.now(), data };
      return data;
    } catch { return { connected: true, available: false }; }
  }
}

@ApiTags('solbid')
@Controller()
export class SolbidController {
  constructor(@InjectDb() private db: Db, private client: SolbidClient, private solar: SolarService, private audit: AuditService) {}

  @Public()
  @Get('public/solbid/board')
  board() { return this.client.publicBoard(); }

  /** Unite admin hands a solar referral to SOLBID for sealed bids. */
  @Post('admin/solbid/referrals/:id')
  @HttpCode(201)
  async send(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(SendToSolbidSchema)) b: z.infer<typeof SendToSolbidSchema>) {
    if (!staff(ctx)) throw new ForbiddenException('Only Unite admins hand leads to SOLBID');
    const [row] = await this.db.select({ r: solarReferrals, c: solarReferralCodes, org: organizations.displayName }).from(solarReferrals)
      .innerJoin(solarReferralCodes, eq(solarReferralCodes.id, solarReferrals.codeId)).leftJoin(organizations, eq(organizations.id, solarReferralCodes.ownerOrgId))
      .where(eq(solarReferrals.id, id)).limit(1);
    if (!row) throw new NotFoundException('Referral not found');
    const r = row.r;
    if (r.solbidRef) throw new ConflictException(`Already with SOLBID as ${r.solbidRef}`);
    if (!['new', 'quoted'].includes(r.status)) throw new ConflictException('Only open referrals can be handed to SOLBID');
    const state = INDIA_STATES.find(([k]) => k === r.region)?.[1];
    if (!state || !SOLBID_STATES.includes(state)) throw new BadRequestException(`SOLBID does not cover ${state ?? r.region} yet`);
    const site = (r.details as { siteType?: string; intent?: string } | null) ?? {};
    const category = r.segment === 'industrial' ? 'Industrial' : r.segment === 'commercial' ? 'Commercial' : 'Residential';
    const ppa = b.model === 'PPA' || site.intent === 'lease_roof';
    const ref = `CZ-SOL-${r.id.slice(0, 8).toUpperCase()}`;
    const introducer = HOUSE.includes(row.c.code) || !row.c.ownerUserId ? { code: row.c.code, name: row.c.ownerName } : { code: row.c.code, name: row.c.ownerName, organisation: row.org ?? undefined };
    const payload = {
      externalRef: ref, introducer, customer: { name: r.name, mobile: r.phone10 }, consentAt: new Date().toISOString(),
      requirement: {
        category, installation: site.siteType === 'Farm / pump' ? 'Ground-mounted' : 'Rooftop', model: ppa ? 'PPA' : 'EPC', ...(ppa ? { ppaType: 'Rooftop PPA' } : {}),
        capacity: b.capacityKw >= 1000 ? Math.round(b.capacityKw / 10) / 100 : b.capacityKw, unit: b.capacityKw >= 1000 ? 'MW' : 'kW',
        state, city: r.city, ...(r.monthlyBill ? { monthlyBill: Math.round(r.monthlyBill / 100) } : {}),
      },
    };
    const res = await this.client.call<{ status?: string; message?: string | string[] }>('POST', '/integrations/collabiz/intakes', payload);
    if (res.status === 409) throw new ConflictException('SOLBID already has this referral');
    if (res.status >= 400) throw new BadRequestException(`SOLBID refused the hand-off (${res.status}): ${JSON.stringify(res.body).slice(0, 200)}`);
    await this.db.update(solarReferrals).set({ solbidRef: ref, solbidStatus: 'invited', solbidSentAt: new Date(), solbidConsentNote: b.consentNote, updatedAt: new Date() }).where(eq(solarReferrals.id, id));
    await this.audit.record(ctx, { action: 'solar.referral_to_solbid', objectType: 'solar_referral', objectId: id, after: { ref, capacityKw: b.capacityKw, model: payload.requirement.model }, reason: b.consentNote });
    if (row.c.ownerOrgId) await this.solar.notifyOrg(row.c.ownerOrgId, `Your referral ${r.name.split(' ')[0]} is getting bids on SOLBID`, 'Unite sent the requirement to SOLBID. The customer confirms it there before vendors bid.', '/solar?tab=referrals');
    return { ref, status: 'invited' };
  }

  /** Pulls the latest status from SOLBID (signed). */
  @Get('admin/solbid/referrals/:id')
  async refresh(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    if (!staff(ctx)) throw new ForbiddenException('Only Unite admins see SOLBID hand-offs');
    const [r] = await this.db.select().from(solarReferrals).where(eq(solarReferrals.id, id)).limit(1);
    if (!r?.solbidRef) throw new NotFoundException('This referral was not handed to SOLBID');
    const res = await this.client.call<{ status: string; shareOutcome?: boolean; project: Record<string, unknown> | null }>('GET', `/integrations/collabiz/intakes/${encodeURIComponent(r.solbidRef)}`);
    if (res.status >= 400) throw new BadRequestException(`SOLBID returned ${res.status}`);
    const status = res.body.status === 'CLAIMED' ? (r.solbidStatus === 'awarded' || r.solbidStatus === 'completed' ? r.solbidStatus : 'confirmed') : res.body.status.toLowerCase();
    await this.db.update(solarReferrals).set({ solbidStatus: status, solbidOutcome: { ...(r.solbidOutcome as object ?? {}), project: res.body.project, shareOutcome: res.body.shareOutcome ?? null }, updatedAt: new Date() }).where(eq(solarReferrals.id, id));
    return { ref: r.solbidRef, status, project: res.body.project };
  }

  /** Signed updates from SOLBID: customer confirmed, awarded, completed. */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('public/integrations/solbid/events')
  @HttpCode(200)
  async events(@Req() req: { rawBody?: Buffer }, @Headers('x-solbid-timestamp') ts: string, @Headers('x-solbid-signature') sig: string) {
    const secret = config().SOLBID_SHARED_SECRET;
    if (!secret) throw new ServiceUnavailableException('SOLBID is not connected');
    const t = Number(ts);
    if (!t || Math.abs(Date.now() - t) > 5 * 60_000) throw new UnauthorizedException('Stale or missing timestamp');
    const raw = req.rawBody?.toString('utf8') ?? '';
    const a = Buffer.from(hmac(secret, `${t}.${raw}`), 'hex'), b2 = Buffer.from(String(sig ?? ''), 'hex');
    if (a.length !== b2.length || !timingSafeEqual(a, b2)) throw new UnauthorizedException('Invalid signature');
    const e = JSON.parse(raw) as { event: string; externalRef: string; project: Record<string, unknown> | null; shareOutcome: boolean; contractValue: number | null; at: string };
    const status = STATUS_FOR[e.event];
    if (!status) return { ok: true, ignored: true };
    const [row] = await this.db.select({ r: solarReferrals, c: solarReferralCodes }).from(solarReferrals).innerJoin(solarReferralCodes, eq(solarReferralCodes.id, solarReferrals.codeId))
      .where(eq(solarReferrals.solbidRef, e.externalRef)).limit(1);
    if (!row) return { ok: true, ignored: true };
    const outcome = { project: e.project, shareOutcome: e.shareOutcome, contractValue: e.shareOutcome ? e.contractValue : null, lastEvent: e.event, at: e.at };
    await this.db.update(solarReferrals).set({ solbidStatus: status, solbidOutcome: outcome, updatedAt: new Date() }).where(eq(solarReferrals.id, row.r.id));
    const first = row.r.name.split(' ')[0];
    const text = status === 'confirmed' ? `${first} confirmed the requirement on SOLBID; vendors can now bid.` : status === 'awarded' ? `${first} awarded the project on SOLBID${outcome.contractValue ? ` (contract ₹${Math.round(outcome.contractValue).toLocaleString('en-IN')})` : ''}.` : `${first}'s SOLBID project is complete.`;
    await this.solar.notifyStaff(`SOLBID: ${e.externalRef} ${status}`, text, '/workspace/solar?tab=referrals');
    if (row.c.ownerOrgId) await this.solar.notifyOrg(row.c.ownerOrgId, `SOLBID update for your referral ${first}`, `${text}${status === 'awarded' ? ' Any reward follows your signed agreement with Unite Group.' : ''}`, '/solar?tab=referrals');
    return { ok: true };
  }
}

@Module({ imports: [SolarModule], controllers: [SolbidController], providers: [SolbidClient], exports: [SolbidClient] })
export class SolbidModule {}
