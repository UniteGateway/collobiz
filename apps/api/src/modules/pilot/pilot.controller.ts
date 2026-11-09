/**
 * Pilot feedback — a two-minute structured survey partners send during the pilot, and the results Unite reads.
 *
 * Rules (tested in test/pilot.e2e.ts):
 *  - Any signed-in user may answer; one answer per person per 20 hours, so weekly check-ins can't be spammed.
 *  - Results (averages, net promoter score, would-continue split, features used, comments, weekly trend) are
 *    readable only with `analytics.read` (Unite admins, finance, compliance, super admins).
 *  - Contact details appear in results only when the person ticked "you may contact me".
 *  - Unite can send an in-app reminder to owners/admins of verified partner companies who have not checked in for 6 days;
 *    at most one reminder round per 24 hours.
 */
import { Body, ConflictException, Controller, Get, HttpCode, Injectable, Module, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { PILOT_FEATURES, PilotFeedbackSchema, netPromoterScore } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { auditEvents, memberships, notifications, organizations, pilotFeedback, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireCaps, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';

const COOLDOWN_MS = 20 * 3600_000;
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
/** Monday (UTC) of the week a date falls in, as YYYY-MM-DD. */
const weekOf = (d: Date) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };

@Injectable()
export class PilotService {
  constructor(@InjectDb() private db: Db) {}

  async last(userId: string) {
    const [r] = await this.db.select({ createdAt: pilotFeedback.createdAt }).from(pilotFeedback).where(eq(pilotFeedback.userId, userId)).orderBy(desc(pilotFeedback.createdAt)).limit(1);
    return r?.createdAt ?? null;
  }

  async results(days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const rows = await this.db.select({ f: pilotFeedback, name: users.fullName, email: users.email, org: organizations.displayName }).from(pilotFeedback)
      .innerJoin(users, eq(users.id, pilotFeedback.userId)).leftJoin(organizations, eq(organizations.id, pilotFeedback.organizationId))
      .where(gte(pilotFeedback.createdAt, since)).orderBy(desc(pilotFeedback.createdAt)).limit(2000);
    const fs = rows.map((r) => r.f);
    const weeks = new Map<string, typeof fs>();
    for (const f of fs) { const w = weekOf(f.createdAt); weeks.set(w, [...(weeks.get(w) ?? []), f]); }
    return {
      days,
      responses: fs.length,
      respondents: new Set(fs.map((f) => f.userId)).size,
      organizations: new Set(fs.map((f) => f.organizationId).filter(Boolean)).size,
      usefulness: avg(fs.map((f) => f.usefulness)),
      ease: avg(fs.map((f) => f.ease)),
      nps: netPromoterScore(fs.map((f) => f.recommend)),
      continueUse: { yes: fs.filter((f) => f.continueUse === 'yes').length, maybe: fs.filter((f) => f.continueUse === 'maybe').length, no: fs.filter((f) => f.continueUse === 'no').length },
      used: PILOT_FEATURES.map((k) => ({ feature: k, count: fs.filter((f) => f.used.includes(k)).length })).sort((a, b) => b.count - a.count),
      platforms: { web: fs.filter((f) => f.platform === 'web').length, mobile: fs.filter((f) => f.platform === 'mobile').length },
      weekly: [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, ws]) => ({ week, responses: ws.length, usefulness: avg(ws.map((f) => f.usefulness)), nps: netPromoterScore(ws.map((f) => f.recommend)) })),
      comments: rows.map((r) => ({
        id: r.f.id, createdAt: r.f.createdAt, name: r.name, organization: r.org, platform: r.f.platform,
        usefulness: r.f.usefulness, ease: r.f.ease, recommend: r.f.recommend, continueUse: r.f.continueUse, used: r.f.used,
        mostValuable: r.f.mostValuable, blockers: r.f.blockers, wishlist: r.f.wishlist,
        contact: r.f.contactOk ? r.email : null,
      })),
    };
  }
}

@ApiTags('pilot')
@Controller()
export class PilotController {
  constructor(@InjectDb() private db: Db, private svc: PilotService, private audit: AuditService) {}

  /** Whether this person can answer now, and when they last did. */
  @Get('pilot-feedback/mine')
  async mine(@Ctx() ctx: RequestContext) {
    const last = await this.svc.last(ctx.userId);
    const nextAt = last ? new Date(last.getTime() + COOLDOWN_MS) : null;
    return { lastAt: last, canAnswer: !nextAt || nextAt.getTime() <= Date.now(), nextAt };
  }

  @Post('pilot-feedback')
  @HttpCode(201)
  async submit(@Ctx() ctx: RequestContext, @Body(body(PilotFeedbackSchema)) b: z.infer<typeof PilotFeedbackSchema>) {
    const last = await this.svc.last(ctx.userId);
    if (last && Date.now() - last.getTime() < COOLDOWN_MS) throw new ConflictException('You already sent pilot feedback today. You can send another check-in tomorrow.');
    const [f] = await this.db.insert(pilotFeedback).values({
      userId: ctx.userId, organizationId: ctx.orgId, usefulness: b.usefulness, ease: b.ease, recommend: b.recommend, used: [...new Set(b.used)],
      mostValuable: b.mostValuable || null, blockers: b.blockers || null, wishlist: b.wishlist || null, continueUse: b.continueUse, contactOk: b.contactOk, platform: b.platform,
    }).returning();
    await this.audit.record(ctx, { action: 'pilot.feedback', objectType: 'pilot_feedback', objectId: f.id });
    return { id: f.id, thanks: true };
  }

  /** Reminds partners who have not checked in for 6 days (in-app notification). One round per 24 hours. */
  @Post('admin/pilot-feedback/remind')
  @HttpCode(200)
  @RequireCaps('analytics.read')
  async remind(@Ctx() ctx: RequestContext) {
    const [recent] = await this.db.select({ at: auditEvents.at }).from(auditEvents).where(and(eq(auditEvents.action, 'pilot.reminder'), gte(auditEvents.at, new Date(Date.now() - 24 * 3600_000)))).limit(1);
    if (recent) throw new ConflictException('A reminder was already sent in the last 24 hours.');
    const people = await this.db.selectDistinct({ userId: memberships.userId }).from(memberships).innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(eq(memberships.status, 'active'), inArray(memberships.role, ['org_owner', 'org_admin']), inArray(organizations.type, ['partner_company', 'partner_individual']), eq(organizations.verificationStatus, 'verified')));
    const answered = new Set((await this.db.selectDistinct({ userId: pilotFeedback.userId }).from(pilotFeedback).where(gte(pilotFeedback.createdAt, new Date(Date.now() - 6 * 86400_000)))).map((r) => r.userId));
    const due = people.map((p) => p.userId).filter((u) => !answered.has(u));
    if (due.length) await this.db.insert(notifications).values(due.map((userId) => ({ userId, kind: 'announcement', title: 'Your weekly pilot check-in', body: 'Two minutes: tell Unite Group what helped, what got in your way and what to build next.', link: '/help/pilot' })));
    await this.audit.record(ctx, { action: 'pilot.reminder', objectType: 'pilot_feedback', after: { reminded: due.length } });
    return { reminded: due.length, alreadyAnswered: people.length - due.length };
  }

  @Get('admin/pilot-feedback')
  @RequireCaps('analytics.read')
  async results(@Query('days') days?: string) {
    const d = Math.min(365, Math.max(1, Number.parseInt(days ?? '', 10) || 90));
    return this.svc.results(d);
  }
}

@Module({ controllers: [PilotController], providers: [PilotService] })
export class PilotModule {}
