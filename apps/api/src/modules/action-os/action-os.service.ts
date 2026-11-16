/**
 * ACTION OS engine: refresh a user's action items from connectors, score them with the rule engine, build plans, and
 * deliver them through the channels the user chose — recording an honest status for each channel.
 *
 * Delivery statuses: sent (in our own inbox/stream), queued (handed to the e-mail outbox), not_configured (provider not
 * set up), no_consent (WhatsApp opt-in missing), quiet_hours (deferred), failed. Nothing is marked "delivered" unless a
 * provider confirms it — no provider is connected in this environment.
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import {
  ACTION_KIND_LABELS, DEFAULT_PREFERENCES, NEXT_STEP, VERIFICATION_LABELS, buildPlan, digestText, inQuietHours, isScheduleDue, isoWeekKey, localDayKey, scoreAction,
  type ActionEvent, type ActionKind, type ActionPreferences, type Band, type PlanItem, type Verification,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { actionDeliveries, actionItems, actionPlans, actionPreferences, channelPreferences, memberships, notifications, organizations, pushTokens, users } from '../../db/schema';
import { MailService } from '../../common/adapters';
import { providerConnected } from '../../common/providers';
import { config } from '../../config';
import { CONNECTORS, type Candidate, type Principal } from './connectors';

type Item = typeof actionItems.$inferSelect;
const MANAGER = ['org_owner', 'org_admin', 'unite_admin'];

@Injectable()
export class ActionOsService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('ActionOS');
  private timer?: NodeJS.Timeout;
  constructor(@InjectDb() private db: Db, private mail: MailService) {}

  onModuleInit() {
    if (config().NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.runDue(new Date()).catch((e) => this.log.error(`scheduled run failed: ${e}`)), 5 * 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  // ------------------------------------------------------------------ principal and preferences
  async principal(userId: string): Promise<Principal | null> {
    const [u] = await this.db.select({ id: users.id, name: users.fullName, email: users.email, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
    if (!u || u.status !== 'active') return null;
    const ms = await this.db.select({ orgId: memberships.organizationId, role: memberships.role, orgName: organizations.displayName, orgType: organizations.type }).from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId)).where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')));
    return { userId: u.id, name: u.name, email: u.email, memberships: ms };
  }
  async prefs(userId: string): Promise<ActionPreferences> {
    const [r] = await this.db.select().from(actionPreferences).where(eq(actionPreferences.userId, userId)).limit(1);
    return { ...DEFAULT_PREFERENCES, ...((r?.prefs as Partial<ActionPreferences>) ?? {}), channels: { ...DEFAULT_PREFERENCES.channels, ...((r?.prefs as ActionPreferences | undefined)?.channels ?? {}), inapp: true } };
  }
  async savePrefs(userId: string, p: ActionPreferences) {
    await this.db.insert(actionPreferences).values({ userId, prefs: p }).onConflictDoUpdate({ target: actionPreferences.userId, set: { prefs: p, updatedAt: new Date() } });
    return this.prefs(userId);
  }

  // ------------------------------------------------------------------ refresh
  private score(c: Pick<Candidate, 'dueAt' | 'valuePaise' | 'risk' | 'strategic' | 'blocker' | 'commitment' | 'mandatory' | 'kind'>, now: Date) {
    return scoreAction({ dueAt: c.dueAt, valuePaise: c.valuePaise, risk: c.risk, strategic: c.strategic, blocker: c.blocker, commitment: c.commitment, mandatory: c.mandatory, kind: c.kind }, now);
  }
  /** Re-reads every connector for the user. Items whose source no longer needs action become "resolved". */
  async refresh(userId: string, now = new Date()) {
    const p = await this.principal(userId);
    if (!p) return { sources: [], created: [] as Item[] };
    const sources: { key: string; label: string; ok: boolean; count: number; error?: string }[] = [];
    const cands: Candidate[] = [];
    for (const k of CONNECTORS) {
      try { const r = await k.collect(this.db, p, now); cands.push(...r); sources.push({ key: k.key, label: k.label, ok: true, count: r.length }); }
      catch (e) { this.log.warn(`connector ${k.key} failed: ${e}`); sources.push({ key: k.key, label: k.label, ok: false, count: 0, error: 'Source unavailable — items from it may be out of date' }); }
    }
    const allowedOrgs = new Set(p.memberships.map((m) => m.orgId));
    const existing = await this.db.select().from(actionItems).where(and(eq(actionItems.userId, userId), isNull(actionItems.integrationId)));
    const byKey = new Map(existing.map((i) => [`${i.sourceApp}|${i.sourceRecordId}|${i.kind}`, i]));
    const seen = new Set<string>();
    const created: Item[] = [];
    for (const c of cands) {
      if (!allowedOrgs.has(c.organizationId)) continue; // defence in depth: never surface another tenant's record
      const key = `${c.sourceApp}|${c.sourceRecordId}|${c.kind}`; seen.add(key);
      const s = this.score(c, now);
      const values = { title: c.title, summary: c.summary, recordUrl: c.recordUrl, dueAt: c.dueAt, valuePaise: c.valuePaise, risk: c.risk, mandatory: c.mandatory, verification: c.verification, confidentiality: c.confidentiality, sourceStatus: c.sourceStatus, band: s.band, score: s.score, scoreParts: s.parts, rule: s.rule, lastSeenAt: now, updatedAt: now };
      const prev = byKey.get(key);
      if (!prev) {
        const [ins] = await this.db.insert(actionItems).values({ userId, organizationId: c.organizationId, sourceApp: c.sourceApp, sourceModule: c.sourceModule, sourceRecordId: c.sourceRecordId, kind: c.kind, ...values, firstSeenAt: now })
          .onConflictDoNothing().returning();
        if (ins) created.push(ins);
      } else {
        const reopen = prev.status === 'resolved' || (prev.status === 'snoozed' && prev.snoozedUntil && prev.snoozedUntil <= now);
        await this.db.update(actionItems).set({ ...values, ...(reopen ? { status: 'open', snoozedUntil: null } : {}) }).where(eq(actionItems.id, prev.id));
      }
    }
    const gone = existing.filter((i) => !seen.has(`${i.sourceApp}|${i.sourceRecordId}|${i.kind}`) && (i.status === 'open' || i.status === 'snoozed')).map((i) => i.id);
    if (gone.length) await this.db.update(actionItems).set({ status: 'resolved', updatedAt: now }).where(inArray(actionItems.id, gone));
    await this.db.update(actionItems).set({ status: 'open', snoozedUntil: null }).where(and(eq(actionItems.userId, userId), eq(actionItems.status, 'snoozed'), lt(actionItems.snoozedUntil, now)));
    await this.alertCritical(p, created, now);
    return { sources, created };
  }

  /** Event-triggered alert: a newly found critical (P0) item goes to the inbox at once (push follows the live stream). */
  private async alertCritical(p: Principal, created: Item[], now: Date) {
    const crit = created.filter((i) => i.band === 'P0');
    if (!crit.length) return;
    const prefs = await this.prefs(p.userId);
    for (const i of crit) {
      const quiet = inQuietHours(now, prefs.timeZone, prefs.quietStart, prefs.quietEnd);
      const title = i.confidentiality === 'normal' ? `Urgent: ${i.title}` : 'Urgent: a confidential item needs your attention';
      const ok = await this.recordDelivery({ userId: p.userId, itemId: i.id, channel: 'inapp', dedupeKey: `item:${i.id}:p0:inapp`, status: 'sent', detail: quiet ? 'Added to the inbox during quiet hours' : null });
      if (ok) await this.db.insert(notifications).values({ userId: p.userId, kind: 'action_alert', title, body: i.rule ?? 'Critical priority', link: `/action-os?item=${i.id}` });
    }
  }

  // ------------------------------------------------------------------ views
  async orgNames(ids: string[]) {
    if (!ids.length) return new Map<string, string>();
    const r = await this.db.select({ id: organizations.id, n: organizations.displayName }).from(organizations).where(inArray(organizations.id, [...new Set(ids)]));
    return new Map(r.map((x) => [x.id, x.n]));
  }
  async userNames(ids: (string | null)[]) {
    const xs = [...new Set(ids.filter((x): x is string => !!x))];
    if (!xs.length) return new Map<string, string>();
    const r = await this.db.select({ id: users.id, n: users.fullName }).from(users).where(inArray(users.id, xs));
    return new Map(r.map((x) => [x.id, x.n]));
  }
  view(i: Item, orgs: Map<string, string>, people: Map<string, string>): PlanItem & Record<string, unknown> {
    const parts = (i.scoreParts as { key: string; points: number; why: string }[]) ?? [];
    return {
      id: i.id, title: i.title, summary: i.summary, kind: i.kind as ActionKind, kindLabel: ACTION_KIND_LABELS[i.kind as ActionKind] ?? i.kind, sourceApp: i.sourceApp, sourceModule: i.sourceModule,
      organization: orgs.get(i.organizationId) ?? '—', organizationId: i.organizationId, recordUrl: i.recordUrl, dueAt: i.dueAt?.toISOString() ?? null, valuePaise: i.valuePaise ?? null,
      band: i.band as Band, score: i.score, why: parts.filter((x) => x.why).map((x) => x.why), scoreParts: parts, rule: i.rule, verification: i.verification as Verification,
      verificationLabel: VERIFICATION_LABELS[i.verification as Verification], status: i.status, owner: i.assignedTo ? people.get(i.assignedTo) ?? null : null, assignedTo: i.assignedTo,
      nextStep: NEXT_STEP[i.kind as ActionKind] ?? '', nextStepIsSuggestion: true, confidentiality: i.confidentiality, seenAt: i.lastSeenAt.toISOString(), firstSeenAt: i.firstSeenAt.toISOString(),
      pinned: i.pinned, read: !!i.readAt, snoozedUntil: i.snoozedUntil?.toISOString() ?? null, escalatedAt: i.escalatedAt?.toISOString() ?? null, doneAt: i.doneAt?.toISOString() ?? null,
      doneNote: i.doneNote, sourceStatus: i.sourceStatus, external: !!i.integrationId, dueKnown: !!i.dueAt,
    };
  }
  async items(userId: string, f: { status?: string; app?: string; org?: string; band?: string } = {}) {
    const st = f.status === 'all' ? undefined : f.status === 'done' ? ['done'] : f.status === 'snoozed' ? ['snoozed'] : f.status === 'archived' ? ['archived', 'resolved'] : ['open'];
    const rows = await this.db.select().from(actionItems).where(and(eq(actionItems.userId, userId), st ? inArray(actionItems.status, st) : ne(actionItems.status, '__'),
      f.app ? eq(actionItems.sourceApp, f.app) : undefined, f.org ? eq(actionItems.organizationId, f.org) : undefined, f.band ? eq(actionItems.band, f.band) : undefined))
      .orderBy(desc(actionItems.pinned), actionItems.band, desc(actionItems.score), actionItems.dueAt).limit(300);
    const [orgs, people] = await Promise.all([this.orgNames(rows.map((r) => r.organizationId)), this.userNames(rows.map((r) => r.assignedTo))]);
    return rows.map((r) => this.view(r, orgs, people));
  }

  // ------------------------------------------------------------------ plans
  async generate(userId: string, kind: 'weekly' | 'daily' | 'on_demand', trigger: 'schedule' | 'manual', now = new Date()) {
    const prefs = await this.prefs(userId);
    await this.refresh(userId, now);
    const all = await this.items(userId, { status: 'all' });
    const scoped = all.filter((i) => (!prefs.modules.length || prefs.modules.includes(i.sourceApp)) && (!prefs.orgIds.length || prefs.orgIds.includes(String(i.organizationId))))
      .filter((i) => i.status === 'open' || (i.status === 'done' && i.doneAt && new Date(i.doneAt as string).getTime() > now.getTime() - 7 * 86400000));
    const plan = buildPlan(scoped, now, prefs.maxPriorities);
    const periodKey = kind === 'weekly' ? isoWeekKey(now, prefs.timeZone) : kind === 'daily' ? localDayKey(now, prefs.timeZone) : `manual-${now.toISOString()}`;
    const used = new Set(plan.sections.flatMap((s) => s.items));
    const snapshot = scoped.filter((i) => used.has(i.id)).map((i) => ({ id: i.id, title: i.title, kind: i.kind, kindLabel: i.kindLabel, sourceApp: i.sourceApp, organization: i.organization, recordUrl: i.recordUrl, dueAt: i.dueAt, valuePaise: i.confidentiality === 'normal' ? i.valuePaise : null, band: i.band, why: i.why, rule: i.rule, verification: i.verification, status: i.status, nextStep: i.nextStep, confidentiality: i.confidentiality }));
    const [ins] = await this.db.insert(actionPlans).values({ userId, kind, periodKey, timeZone: prefs.timeZone, summary: plan.summary, counts: plan.counts, sections: plan.sections, items: snapshot, trigger, generatedAt: now })
      .onConflictDoNothing().returning();
    if (!ins) {
      const [cur] = await this.db.select().from(actionPlans).where(and(eq(actionPlans.userId, userId), eq(actionPlans.kind, kind), eq(actionPlans.periodKey, periodKey))).limit(1);
      return { plan: cur, created: false, deliveries: [] as unknown[] };
    }
    const deliveries = await this.deliver(ins, snapshot, prefs, now);
    return { plan: ins, created: true, deliveries };
  }

  private async recordDelivery(d: { userId: string; planId?: string; itemId?: string; channel: string; dedupeKey: string; status: string; detail?: string | null }) {
    const [r] = await this.db.insert(actionDeliveries).values({ userId: d.userId, planId: d.planId ?? null, itemId: d.itemId ?? null, channel: d.channel, dedupeKey: d.dedupeKey, status: d.status, detail: d.detail ?? null })
      .onConflictDoNothing().returning({ id: actionDeliveries.id });
    return !!r; // false = already delivered under this key (retry) → do not send again
  }

  /** Sends a plan to each chosen channel once (dedupe key per plan and channel). */
  async deliver(plan: typeof actionPlans.$inferSelect, items: { title: string; band: string; confidentiality: string }[], prefs: ActionPreferences, now: Date) {
    const [u] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, plan.userId)).limit(1);
    const label = plan.kind === 'weekly' ? 'Your weekly action plan' : plan.kind === 'daily' ? 'Today’s priorities' : 'Your action plan';
    const top = items.filter((i) => i.band === 'P0' || i.band === 'P1').slice(0, 3).map((i) => ({ title: i.confidentiality === 'normal' ? i.title : 'Confidential item — open COLLABIZ to view', band: i.band as Band }));
    const text = digestText({ counts: plan.counts as { open: number; critical: number; overdue: number } }, top, plan.kind === 'daily' ? 'daily' : 'weekly');
    const quiet = inQuietHours(now, prefs.timeZone, prefs.quietStart, prefs.quietEnd);
    const out: { channel: string; status: string; detail: string | null }[] = [];
    const rec = async (channel: string, status: string, detail: string | null = null) => {
      const ok = await this.recordDelivery({ userId: plan.userId, planId: plan.id, channel, dedupeKey: `plan:${plan.id}:${channel}`, status, detail });
      out.push({ channel, status: ok ? status : 'duplicate_skipped', detail }); return ok;
    };
    if (await rec('inapp', 'sent')) await this.db.insert(notifications).values({ userId: plan.userId, kind: 'action_plan', title: label, body: plan.summary, link: `/action-os/plans/${plan.id}` });
    if (prefs.channels.push) {
      if (config().PUSH_PROVIDER !== 'expo') await rec('push', 'not_configured', 'No push provider is configured (PUSH_PROVIDER)');
      else if (quiet) await rec('push', 'quiet_hours', 'Inside quiet hours; the plan is in the inbox');
      else { const [t] = await this.db.select({ n: sql<number>`count(*)::int` }).from(pushTokens).where(eq(pushTokens.userId, plan.userId)); await rec('push', Number(t?.n) ? 'sent' : 'failed', Number(t?.n) ? 'Handed to the push provider with the inbox notification' : 'No registered device'); }
    }
    if (prefs.channels.email && u) { if (await rec('email', 'queued', config().MAIL_DRIVER === 'smtp' ? 'Queued for the SMTP provider' : 'Written to the e-mail outbox (no SMTP provider configured)')) await this.mail.send('email', u.email, `COLLABIZ — ${label}`, text, { planId: plan.id }); }
    if (prefs.channels.whatsapp) {
      const [cp] = await this.db.select().from(channelPreferences).where(eq(channelPreferences.userId, plan.userId)).limit(1);
      if (!cp?.whatsappOptIn || !cp.whatsappNumber) await rec('whatsapp', 'no_consent', 'WhatsApp opt-in with a verified number is required');
      else if (!providerConnected('whatsapp')) await rec('whatsapp', 'not_configured', 'No WhatsApp Business provider or approved template is connected; nothing was sent');
      else await rec('whatsapp', 'queued', 'Queued with the WhatsApp provider');
    }
    return out;
  }

  /** Scheduler tick: every active user whose weekly (or daily) time has passed in their own time zone gets one plan per period. */
  async runDue(now = new Date()) {
    const people = await this.db.selectDistinct({ id: users.id }).from(users).innerJoin(memberships, eq(memberships.userId, users.id)).where(and(eq(users.status, 'active'), eq(memberships.status, 'active')));
    let weekly = 0, daily = 0, failed = 0;
    for (const { id } of people) {
      try {
        const p = await this.prefs(id);
        if (p.weeklyEnabled && isScheduleDue(p.weeklyDay, p.weeklyTime, p.timeZone, now)) {
          const key = isoWeekKey(now, p.timeZone);
          const [has] = await this.db.select({ id: actionPlans.id }).from(actionPlans).where(and(eq(actionPlans.userId, id), eq(actionPlans.kind, 'weekly'), eq(actionPlans.periodKey, key))).limit(1);
          if (!has && (await this.generate(id, 'weekly', 'schedule', now)).created) weekly++;
        }
        if (p.dailyEnabled && isScheduleDue(0, p.dailyTime, p.timeZone, now)) {
          const key = localDayKey(now, p.timeZone);
          const [has] = await this.db.select({ id: actionPlans.id }).from(actionPlans).where(and(eq(actionPlans.userId, id), eq(actionPlans.kind, 'daily'), eq(actionPlans.periodKey, key))).limit(1);
          if (!has && (await this.generate(id, 'daily', 'schedule', now)).created) daily++;
        }
      } catch (e) { failed++; this.log.warn(`plan for ${id} failed: ${e}`); }
    }
    return { users: people.length, weekly, daily, failed };
  }

  // ------------------------------------------------------------------ integrations
  /** Stores an integration event as action items for the assigned members (or the organisation's owners/admins). */
  async ingest(integrationId: string, e: ActionEvent, now = new Date()) {
    const members = await this.db.select({ userId: memberships.userId, role: memberships.role }).from(memberships).where(and(eq(memberships.organizationId, e.organizationId), eq(memberships.status, 'active')));
    const ids = new Set(members.map((m) => m.userId));
    const targets = e.assignedUserIds.length ? e.assignedUserIds.filter((u) => ids.has(u)) : [...new Set(members.filter((m) => MANAGER.includes(m.role)).map((m) => m.userId))];
    const closed = ['closed', 'completed', 'cancelled', 'paid', 'resolved'].includes(e.sourceStatus.toLowerCase());
    const s = scoreAction({ dueAt: e.dueAt ?? null, valuePaise: e.valuePaise ?? null, risk: e.risk, strategic: e.strategic, blocker: e.blocker, commitment: e.commitment, mandatory: e.mandatory, kind: e.kind }, now);
    for (const userId of targets) {
      const values = { title: e.title, summary: e.summary, recordUrl: e.recordUrl, dueAt: e.dueAt ? new Date(e.dueAt) : null, valuePaise: e.valuePaise ?? null, risk: e.risk, mandatory: e.mandatory, verification: e.verification, confidentiality: e.confidentiality, sourceStatus: e.sourceStatus, band: s.band, score: s.score, scoreParts: s.parts, rule: s.rule, lastSeenAt: now, updatedAt: now };
      await this.db.insert(actionItems).values({ userId, organizationId: e.organizationId, sourceApp: e.sourceApp, sourceModule: e.sourceModule, sourceRecordId: e.sourceRecordId, kind: e.kind, integrationId, ...values, status: closed ? 'resolved' : 'open' })
        .onConflictDoUpdate({ target: [actionItems.userId, actionItems.sourceApp, actionItems.sourceRecordId, actionItems.kind], set: { ...values, ...(closed ? { status: 'resolved' } : {}) } });
    }
    return { recipients: targets.length, skippedAssignees: e.assignedUserIds.filter((u) => !ids.has(u)).length, closed };
  }

  async recentDeliveries(userId: string) {
    return this.db.select().from(actionDeliveries).where(and(eq(actionDeliveries.userId, userId), gte(actionDeliveries.createdAt, new Date(Date.now() - 30 * 86400000)))).orderBy(desc(actionDeliveries.createdAt)).limit(50);
  }
}
