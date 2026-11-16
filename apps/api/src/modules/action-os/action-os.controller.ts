/**
 * COLLABIZ ACTION OS API (tested in test/action-os.e2e.ts). Every route is scoped to the signed-in user's own items;
 * integrations post events with their own secret and only for the organisations they were registered for.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Headers, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ACTION_KIND_LABELS, ActionEventSchema, PreferencesSchema, VERIFICATION_LABELS, type ActionPreferences } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  actionComments, actionDeliveries, actionFeedback, actionIntegrations, actionItems, actionPlans, actionSourceEvents, channelPreferences, memberships, notifications, pushTokens, users,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomToken, sha256 } from '../../common/crypto';
import { providerConnected } from '../../common/providers';
import { config } from '../../config';
import { ActionOsService } from './action-os.service';
import { CONNECTORS } from './connectors';

const FEEDBACK = ['useful', 'not_relevant', 'already_done', 'incorrect_data', 'wrong_priority', 'wrong_owner', 'duplicate', 'not_mine'] as const;
const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const MANUAL_PLANS_PER_DAY = 10;

@ApiTags('action-os')
@Controller('action-os')
export class ActionOsController {
  constructor(@InjectDb() private db: Db, private svc: ActionOsService, private audit: AuditService) {}

  private async own(ctx: RequestContext, id: string) {
    const [i] = await this.db.select().from(actionItems).where(and(eq(actionItems.id, id), eq(actionItems.userId, ctx.userId))).limit(1);
    if (!i) throw new NotFoundException('Notice not found');
    return i;
  }
  private async one(ctx: RequestContext, id: string) {
    const i = await this.own(ctx, id);
    const [orgs, people] = await Promise.all([this.svc.orgNames([i.organizationId]), this.svc.userNames([i.assignedTo])]);
    return this.svc.view(i, orgs, people);
  }

  // ------------------------------------------------------------------ dashboard and notices
  @Get('dashboard')
  async dashboard(@Ctx() ctx: RequestContext) {
    const r = await this.svc.refresh(ctx.userId);
    const items = await this.svc.items(ctx.userId);
    const [plan] = await this.db.select({ id: actionPlans.id, kind: actionPlans.kind, periodKey: actionPlans.periodKey, summary: actionPlans.summary, counts: actionPlans.counts, generatedAt: actionPlans.generatedAt })
      .from(actionPlans).where(eq(actionPlans.userId, ctx.userId)).orderBy(desc(actionPlans.generatedAt)).limit(1);
    const now = Date.now();
    const counts = {
      open: items.length, critical: items.filter((i) => i.band === 'P0').length, high: items.filter((i) => i.band === 'P1').length,
      overdue: items.filter((i) => i.dueAt && new Date(i.dueAt).getTime() < now).length, decisions: items.filter((i) => i.kind === 'decision' || i.kind === 'approval').length,
      followUps: items.filter((i) => i.kind === 'follow_up').length, thisWeek: items.filter((i) => i.dueAt && new Date(i.dueAt).getTime() < now + 7 * 86400000).length,
    };
    const prefs = await this.svc.prefs(ctx.userId);
    return { counts, items: items.slice(0, 30), latestPlan: plan ?? null, sources: r.sources, prefs: { weeklyDay: prefs.weeklyDay, weeklyTime: prefs.weeklyTime, timeZone: prefs.timeZone, weeklyEnabled: prefs.weeklyEnabled }, labels: { kinds: ACTION_KIND_LABELS, verification: VERIFICATION_LABELS } };
  }

  @Get('notices')
  async notices(@Ctx() ctx: RequestContext, @Query('status') status?: string, @Query('app') app?: string, @Query('org') org?: string, @Query('band') band?: string) {
    if (org && !ctx.memberships.some((m) => m.organizationId === org)) throw new ForbiddenException();
    return this.svc.items(ctx.userId, { status, app, org, band });
  }

  @Get('notices/:id')
  async notice(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const v = await this.one(ctx, id);
    const comments = await this.db.select({ id: actionComments.id, body: actionComments.body, at: actionComments.createdAt, by: users.fullName }).from(actionComments).innerJoin(users, eq(users.id, actionComments.userId)).where(eq(actionComments.itemId, id)).orderBy(actionComments.createdAt);
    const feedback = await this.db.select({ kind: actionFeedback.kind, note: actionFeedback.note, at: actionFeedback.createdAt }).from(actionFeedback).where(and(eq(actionFeedback.itemId, id), eq(actionFeedback.userId, ctx.userId)));
    await this.db.update(actionItems).set({ readAt: new Date() }).where(and(eq(actionItems.id, id), sql`${actionItems.readAt} is null`));
    // Team members the item may be assigned to: active members of the item's organisation.
    const team = await this.db.select({ id: users.id, name: users.fullName }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.organizationId, v.organizationId as string), eq(memberships.status, 'active')));
    return { ...v, comments, feedback, team: [...new Map(team.map((t) => [t.id, t])).values()] };
  }

  @Post('notices/:id/acknowledge')
  @HttpCode(200)
  async ack(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.own(ctx, id);
    await this.db.update(actionItems).set({ readAt: new Date() }).where(eq(actionItems.id, id));
    return this.one(ctx, id);
  }

  @Post('notices/:id/pin')
  @HttpCode(200)
  async pin(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ pinned: z.boolean() }))) b: { pinned: boolean }) {
    await this.own(ctx, id);
    await this.db.update(actionItems).set({ pinned: b.pinned }).where(eq(actionItems.id, id));
    return this.one(ctx, id);
  }

  /** Marks the notice done here. Source records are not changed silently: the note says to update the source too. */
  @Post('notices/:id/complete')
  @HttpCode(200)
  async complete(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ note: z.string().trim().max(1000).optional() }))) b: { note?: string }) {
    const i = await this.own(ctx, id);
    if (i.status === 'done') throw new ConflictException('Already marked done');
    await this.db.update(actionItems).set({ status: 'done', doneAt: new Date(), doneBy: ctx.userId, doneNote: b.note ?? null, snoozedUntil: null }).where(eq(actionItems.id, id));
    await this.audit.record(ctx, { action: 'action.completed', objectType: 'action_item', objectId: id, before: { status: i.status }, after: { status: 'done', source: `${i.sourceApp}/${i.sourceRecordId}` } });
    return { ...(await this.one(ctx, id)), sourceNote: 'Marked done in ACTION OS. The source record keeps its own status — update it there if the work is finished.' };
  }

  @Post('notices/:id/reopen')
  @HttpCode(200)
  async reopen(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.own(ctx, id);
    await this.db.update(actionItems).set({ status: 'open', doneAt: null, doneBy: null, snoozedUntil: null }).where(eq(actionItems.id, id));
    return this.one(ctx, id);
  }

  @Post('notices/:id/snooze')
  @HttpCode(200)
  async snooze(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ until: z.string().datetime({ offset: true }) }))) b: { until: string }) {
    await this.own(ctx, id);
    const until = new Date(b.until);
    if (until.getTime() <= Date.now() || until.getTime() > Date.now() + 30 * 86400000) throw new BadRequestException('Snooze for between a minute and 30 days');
    await this.db.update(actionItems).set({ status: 'snoozed', snoozedUntil: until }).where(eq(actionItems.id, id));
    return this.one(ctx, id);
  }

  @Post('notices/:id/archive')
  @HttpCode(200)
  async archive(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.own(ctx, id);
    await this.db.update(actionItems).set({ status: 'archived' }).where(eq(actionItems.id, id));
    return this.one(ctx, id);
  }

  /** Assign to a team member of the same organisation; they are told in their inbox. */
  @Post('notices/:id/assign')
  @HttpCode(200)
  async assign(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ userId: z.string().uuid() }))) b: { userId: string }) {
    const i = await this.own(ctx, id);
    const [m] = await this.db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.userId, b.userId), eq(memberships.organizationId, i.organizationId), eq(memberships.status, 'active'))).limit(1);
    if (!m) throw new BadRequestException('Assign only to an active member of the same organisation');
    await this.db.update(actionItems).set({ assignedTo: b.userId }).where(eq(actionItems.id, id));
    if (b.userId !== ctx.userId) await this.db.insert(notifications).values({ userId: b.userId, kind: 'action_assigned', title: i.confidentiality === 'normal' ? `Assigned to you: ${i.title}` : 'A confidential item was assigned to you', body: `By ${(await this.svc.userNames([ctx.userId])).get(ctx.userId) ?? 'a colleague'}`, link: i.recordUrl });
    await this.audit.record(ctx, { action: 'action.assigned', objectType: 'action_item', objectId: id, after: { to: b.userId } });
    return this.one(ctx, id);
  }

  /** Escalate to the organisation's owners and admins (never outside the organisation). */
  @Post('notices/:id/escalate')
  @HttpCode(200)
  async escalate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ note: z.string().trim().min(5, 'Say why it needs escalation').max(1000) }))) b: { note: string }) {
    const i = await this.own(ctx, id);
    const heads = await this.db.selectDistinct({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, i.organizationId), eq(memberships.status, 'active'), inArray(memberships.role, ['org_owner', 'org_admin', 'unite_admin'])));
    const to = heads.map((h) => h.u).filter((u) => u !== ctx.userId);
    if (!to.length) throw new ConflictException('There is no other owner or admin in this organisation to escalate to');
    await this.db.insert(notifications).values(to.map((u) => ({ userId: u, kind: 'action_escalation', title: `Escalated: ${i.confidentiality === 'normal' ? i.title : 'confidential item'}`, body: b.note, link: i.recordUrl })));
    await this.db.update(actionItems).set({ escalatedAt: new Date() }).where(eq(actionItems.id, id));
    await this.db.insert(actionComments).values({ itemId: id, userId: ctx.userId, body: `Escalated: ${b.note}` });
    await this.audit.record(ctx, { action: 'action.escalated', objectType: 'action_item', objectId: id, after: { to: to.length } });
    return { ...(await this.one(ctx, id)), escalatedTo: to.length };
  }

  @Post('notices/:id/comments')
  @HttpCode(201)
  async comment(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ body: z.string().trim().min(1).max(2000) }))) b: { body: string }) {
    await this.own(ctx, id);
    const [c] = await this.db.insert(actionComments).values({ itemId: id, userId: ctx.userId, body: b.body }).returning();
    return c;
  }

  @Post('notices/:id/feedback')
  @HttpCode(201)
  async feedback(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ kind: z.enum(FEEDBACK), note: z.string().trim().max(500).optional() }))) b: { kind: (typeof FEEDBACK)[number]; note?: string }) {
    await this.own(ctx, id);
    await this.db.insert(actionFeedback).values({ itemId: id, userId: ctx.userId, kind: b.kind, note: b.note ?? null });
    if (b.kind === 'already_done') await this.db.update(actionItems).set({ status: 'done', doneAt: new Date(), doneBy: ctx.userId, doneNote: 'Reported already done' }).where(eq(actionItems.id, id));
    if (b.kind === 'not_relevant' || b.kind === 'duplicate' || b.kind === 'not_mine') await this.db.update(actionItems).set({ status: 'archived' }).where(eq(actionItems.id, id));
    return { ok: true };
  }

  // ------------------------------------------------------------------ plans
  @Get('plans')
  async plans(@Ctx() ctx: RequestContext) {
    return this.db.select({ id: actionPlans.id, kind: actionPlans.kind, periodKey: actionPlans.periodKey, summary: actionPlans.summary, counts: actionPlans.counts, trigger: actionPlans.trigger, generatedAt: actionPlans.generatedAt })
      .from(actionPlans).where(eq(actionPlans.userId, ctx.userId)).orderBy(desc(actionPlans.generatedAt)).limit(60);
  }

  @Get('plans/:id')
  async plan(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [p] = await this.db.select().from(actionPlans).where(and(eq(actionPlans.id, id), eq(actionPlans.userId, ctx.userId))).limit(1);
    if (!p) throw new NotFoundException('Plan not found');
    const deliveries = await this.db.select({ channel: actionDeliveries.channel, status: actionDeliveries.status, detail: actionDeliveries.detail, at: actionDeliveries.createdAt }).from(actionDeliveries).where(eq(actionDeliveries.planId, id));
    // Current status of each item, so the plan shows what has since been done.
    const ids = (p.items as { id: string }[]).map((i) => i.id);
    const now = ids.length ? await this.db.select({ id: actionItems.id, status: actionItems.status }).from(actionItems).where(and(inArray(actionItems.id, ids), eq(actionItems.userId, ctx.userId))) : [];
    return { ...p, deliveries, currentStatus: Object.fromEntries(now.map((x) => [x.id, x.status])) };
  }

  @Post('plans/generate')
  @HttpCode(201)
  async generate(@Ctx() ctx: RequestContext, @Body(body(z.object({ kind: z.enum(['weekly', 'daily', 'on_demand']).default('on_demand') }))) b: { kind: 'weekly' | 'daily' | 'on_demand' }) {
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(actionPlans).where(and(eq(actionPlans.userId, ctx.userId), eq(actionPlans.trigger, 'manual'), gte(actionPlans.generatedAt, new Date(Date.now() - 86400000))));
    if (Number(n) >= MANUAL_PLANS_PER_DAY) throw new ConflictException(`You can generate up to ${MANUAL_PLANS_PER_DAY} plans a day`);
    const r = await this.svc.generate(ctx.userId, b.kind, 'manual');
    return { id: r.plan.id, created: r.created, deliveries: r.deliveries, note: r.created ? null : 'This period’s plan already exists — showing it.' };
  }

  // ------------------------------------------------------------------ preferences and channels
  @Get('preferences')
  async getPrefs(@Ctx() ctx: RequestContext) {
    const p = await this.svc.prefs(ctx.userId);
    return { prefs: p, channels: await this.channelStatus(ctx.userId), modules: [...new Set(CONNECTORS.map((c) => c.app))], organizations: ctx.memberships.map((m) => ({ id: m.organizationId, name: m.orgName })).filter((o, i, a) => a.findIndex((x) => x.id === o.id) === i) };
  }

  @Patch('preferences')
  async setPrefs(@Ctx() ctx: RequestContext, @Body(body(PreferencesSchema)) b: ActionPreferences) {
    const mine = new Set(ctx.memberships.map((m) => m.organizationId));
    if (b.orgIds.some((o) => !mine.has(o))) throw new ForbiddenException('Choose only your own organisations');
    if (b.channels.whatsapp) {
      const [cp] = await this.db.select().from(channelPreferences).where(eq(channelPreferences.userId, ctx.userId)).limit(1);
      if (!cp?.whatsappOptIn) throw new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: [{ path: 'channels.whatsapp', message: 'Opt in to WhatsApp with your number first (Settings → Channels)' }] });
    }
    const p = await this.svc.savePrefs(ctx.userId, b);
    await this.audit.record(ctx, { action: 'action.preferences', objectType: 'user', objectId: ctx.userId, after: { weekly: `${b.weeklyDay} ${b.weeklyTime} ${b.timeZone}`, channels: b.channels } });
    return { prefs: p, channels: await this.channelStatus(ctx.userId) };
  }

  private async channelStatus(userId: string) {
    const [cp] = await this.db.select().from(channelPreferences).where(eq(channelPreferences.userId, userId)).limit(1);
    const [t] = await this.db.select({ n: sql<number>`count(*)::int` }).from(pushTokens).where(eq(pushTokens.userId, userId));
    return {
      inapp: { ready: true, text: 'Always on: notice board and inbox.' },
      push: { ready: config().PUSH_PROVIDER === 'expo' && Number(t?.n) > 0, text: config().PUSH_PROVIDER !== 'expo' ? 'Push provider not configured yet.' : Number(t?.n) ? `${t.n} device(s) registered.` : 'No device registered — open the mobile app and allow notifications.' },
      email: { ready: config().MAIL_DRIVER === 'smtp', text: config().MAIL_DRIVER === 'smtp' ? 'Sent through the configured SMTP provider.' : 'E-mail provider not configured — messages are written to the outbox only.' },
      whatsapp: { ready: !!cp?.whatsappOptIn && providerConnected('whatsapp'), consent: !!cp?.whatsappOptIn, text: !cp?.whatsappOptIn ? 'You have not opted in to WhatsApp.' : providerConnected('whatsapp') ? 'Opted in; approved templates only.' : 'Opted in, but no WhatsApp Business provider is connected — nothing is sent.' },
    };
  }

  @Get('notifications/status')
  async status(@Ctx() ctx: RequestContext) {
    return { channels: await this.channelStatus(ctx.userId), deliveries: await this.svc.recentDeliveries(ctx.userId) };
  }

  /** Test message to each chosen channel; statuses are reported as they are (never "delivered" without a provider). */
  @Post('notifications/test')
  @HttpCode(200)
  async test(@Ctx() ctx: RequestContext) {
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(actionDeliveries).where(and(eq(actionDeliveries.userId, ctx.userId), sql`${actionDeliveries.dedupeKey} like 'test:%'`, gte(actionDeliveries.createdAt, new Date(Date.now() - 3600_000))));
    if (Number(n) >= 12) throw new ConflictException('Too many test messages — try again in an hour');
    const prefs = await this.svc.prefs(ctx.userId);
    const stamp = Date.now();
    const out: { channel: string; status: string; detail: string | null }[] = [];
    const rec = async (channel: string, status: string, detail: string | null) => { await this.db.insert(actionDeliveries).values({ userId: ctx.userId, channel, dedupeKey: `test:${ctx.userId}:${stamp}:${channel}`, status, detail }); out.push({ channel, status, detail }); };
    await this.db.insert(notifications).values({ userId: ctx.userId, kind: 'action_test', title: 'ACTION OS test notice', body: 'Your notice board and inbox are working.', link: '/action-os' });
    await rec('inapp', 'sent', null);
    const ch = await this.channelStatus(ctx.userId);
    if (prefs.channels.push) await rec('push', ch.push.ready ? 'sent' : 'not_configured', ch.push.text);
    if (prefs.channels.email) await rec('email', 'queued', ch.email.text);
    if (prefs.channels.whatsapp) await rec('whatsapp', ch.whatsapp.consent ? (ch.whatsapp.ready ? 'queued' : 'not_configured') : 'no_consent', ch.whatsapp.text);
    return { results: out };
  }

  // ------------------------------------------------------------------ integrations (connected apps)
  @Get('integrations')
  async integrations(@Ctx() ctx: RequestContext) {
    const built = CONNECTORS.map((c) => ({ key: c.key, app: c.app, label: c.label, kind: 'built_in' }));
    if (!staff(ctx)) return { builtIn: built, connected: [] };
    const rows = await this.db.select({ id: actionIntegrations.id, appKey: actionIntegrations.appKey, name: actionIntegrations.name, enabled: actionIntegrations.enabled, orgIds: actionIntegrations.orgIds, lastEventAt: actionIntegrations.lastEventAt, createdAt: actionIntegrations.createdAt }).from(actionIntegrations).orderBy(actionIntegrations.appKey);
    return { builtIn: built, connected: rows };
  }

  /** Unite admins register an app; the secret is shown once and stored only as a hash. */
  @Post('integrations')
  @HttpCode(201)
  async register(@Ctx() ctx: RequestContext, @Body(body(z.object({ appKey: z.string().trim().min(2).max(40).regex(/^[a-z0-9_-]+$/), name: z.string().trim().min(2).max(80), orgIds: z.array(z.string().uuid()).min(1).max(100) }))) b: { appKey: string; name: string; orgIds: string[] }) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const secret = `aos_${randomToken(24)}`;
    const [r] = await this.db.insert(actionIntegrations).values({ appKey: b.appKey, name: b.name, orgIds: b.orgIds, secretHash: sha256(secret), createdBy: ctx.userId }).onConflictDoNothing().returning();
    if (!r) throw new ConflictException('An integration with this app key already exists');
    await this.audit.record(ctx, { action: 'action.integration_registered', objectType: 'action_integration', objectId: r.id, after: { appKey: b.appKey, orgs: b.orgIds.length } });
    return { id: r.id, appKey: r.appKey, secret, note: 'Copy the secret now — it is not shown again.' };
  }

  @Post('integrations/:id/enabled')
  @HttpCode(200)
  async toggle(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ enabled: z.boolean() }))) b: { enabled: boolean }) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const [r] = await this.db.update(actionIntegrations).set({ enabled: b.enabled }).where(eq(actionIntegrations.id, id)).returning();
    if (!r) throw new NotFoundException();
    await this.audit.record(ctx, { action: b.enabled ? 'action.integration_enabled' : 'action.integration_disabled', objectType: 'action_integration', objectId: id });
    return { id, enabled: r.enabled };
  }

  /** Event intake for connected apps: `X-Action-App: <appKey>` and `Authorization: Bearer <secret>`. Idempotent per event id. */
  @Public()
  @Post('integrations/events')
  @HttpCode(202)
  async events(@Headers('x-action-app') app: string | undefined, @Headers('authorization') auth: string | undefined, @Body() raw: unknown) {
    const secret = (auth ?? '').replace(/^Bearer\s+/i, '');
    if (!app || !secret) throw new UnauthorizedException('Missing app or credentials');
    const [ig] = await this.db.select().from(actionIntegrations).where(eq(actionIntegrations.appKey, app)).limit(1);
    if (!ig || !ig.enabled || ig.secretHash !== sha256(secret)) throw new UnauthorizedException('Invalid app or credentials');
    const parsed = z.object({ events: z.array(z.unknown()).min(1).max(100) }).safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Send { events: [...] } with 1–100 events');
    const results: { eventId: string; status: string; detail?: string }[] = [];
    for (const e0 of parsed.data.events) {
      const r = ActionEventSchema.safeParse(e0);
      if (!r.success) { results.push({ eventId: String((e0 as { eventId?: unknown })?.eventId ?? '?'), status: 'rejected', detail: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }); continue; }
      const e = r.data;
      if (e.sourceApp !== ig.appKey) { results.push({ eventId: e.eventId, status: 'rejected', detail: 'sourceApp must match the registered app' }); continue; }
      if (!ig.orgIds.includes(e.organizationId)) { results.push({ eventId: e.eventId, status: 'rejected', detail: 'This app is not authorised for that organisation' }); continue; }
      const [fresh] = await this.db.insert(actionSourceEvents).values({ integrationId: ig.id, eventId: e.eventId, organizationId: e.organizationId, payload: e }).onConflictDoNothing().returning({ id: actionSourceEvents.id });
      if (!fresh) { results.push({ eventId: e.eventId, status: 'duplicate' }); continue; }
      const x = await this.svc.ingest(ig.id, e);
      results.push({ eventId: e.eventId, status: 'accepted', detail: `${x.recipients} recipient(s)${x.skippedAssignees ? `; ${x.skippedAssignees} assignee(s) not in the organisation were skipped` : ''}${x.closed ? '; marked resolved' : ''}` });
    }
    await this.db.update(actionIntegrations).set({ lastEventAt: new Date() }).where(eq(actionIntegrations.id, ig.id));
    return { results };
  }

  // ------------------------------------------------------------------ administration
  /** Usage without business contents: counts only. */
  @Get('admin/analytics')
  async analytics(@Ctx() ctx: RequestContext) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const since = new Date(Date.now() - 30 * 86400000);
    const [plans, deliveries, items, feedback] = await Promise.all([
      this.db.select({ kind: actionPlans.kind, trigger: actionPlans.trigger, n: sql<number>`count(*)::int` }).from(actionPlans).where(gte(actionPlans.generatedAt, since)).groupBy(actionPlans.kind, actionPlans.trigger),
      this.db.select({ channel: actionDeliveries.channel, status: actionDeliveries.status, n: sql<number>`count(*)::int` }).from(actionDeliveries).where(gte(actionDeliveries.createdAt, since)).groupBy(actionDeliveries.channel, actionDeliveries.status),
      this.db.select({ app: actionItems.sourceApp, status: actionItems.status, n: sql<number>`count(*)::int` }).from(actionItems).groupBy(actionItems.sourceApp, actionItems.status),
      this.db.select({ kind: actionFeedback.kind, n: sql<number>`count(*)::int` }).from(actionFeedback).where(gte(actionFeedback.createdAt, since)).groupBy(actionFeedback.kind),
    ]);
    return { plans, deliveries, items, feedback };
  }

  /** Runs the scheduler now (for an external cron in production; the API also runs it every 5 minutes). */
  @Post('admin/run-due')
  @HttpCode(200)
  async runDue(@Ctx() ctx: RequestContext) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    return this.svc.runDue(new Date());
  }
}

@Module({ controllers: [ActionOsController], providers: [ActionOsService], exports: [ActionOsService] })
export class ActionOsModule {}
