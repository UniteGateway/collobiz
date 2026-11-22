/** GO EB5 — module access, configuration and legal gates, staff roles, dashboard, reports, audit and tasks. */
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { and, asc, desc, eq, gte, isNull, like, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { EB5_GATES, EB5_LEAD_STAGES, EB5_ROLES, EB5_ROLE_LABELS, Eb5SettingsSchema, eb5Can, feeSchedule, type Eb5Gate } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { auditEvents, eb5Agreements, eb5Applications, eb5Consultations, eb5Invoices, eb5Leads, eb5Partners, eb5Roles, eb5Settings, eb5Tasks, organizations, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { Eb5Access } from './access';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

@ApiTags('eb5')
@Controller('eb5')
export class Eb5CoreController {
  constructor(@InjectDb() private db: Db, private audit: AuditService, private a: Eb5Access) {}

  /** Who am I in GO EB5 — drives navigation. Returns `enabled:false` instead of an error so the menu can hide itself. */
  @Get('me')
  async me(@Ctx() ctx: RequestContext) {
    const enabled = await this.a.enabled(); const w = await this.a.who(ctx);
    const visible = enabled || w.roles.includes('super_admin');
    return { enabled, visible: visible && (w.roles.length > 0 || !!w.partner), roles: w.roles, roleLabels: w.roles.map((r) => EB5_ROLE_LABELS[r as keyof typeof EB5_ROLE_LABELS] ?? r),
      partner: w.partner ? { id: w.partner.id, status: w.partner.complianceStatus, role: w.partner.role } : null, mfaNeeded: w.mfaNeeded, canApplyAsPartner: !!ctx.orgId && !w.partner };
  }

  @Get('settings')
  async getSettings(@Ctx() ctx: RequestContext) {
    await this.a.open(ctx);
    const s = await this.a.settings();
    return { ...s, schedule: feeSchedule(s.consultancyFeeUsd, s.commencementPct), gates: EB5_GATES.map((g) => ({ ...g, approved: !!s.legal[g.key], approval: s.legal.approvals.filter((x) => x.gate === g.key).at(-1) ?? null })) };
  }

  @Put('settings')
  async putSettings(@Ctx() ctx: RequestContext, @Body(body(Eb5SettingsSchema)) b: z.infer<typeof Eb5SettingsSchema>) {
    await this.a.need(ctx, 'module.configure');
    const s = await this.a.settings();
    const changed = s.consultancyFeeUsd !== b.consultancyFeeUsd || s.commencementPct !== b.commencementPct;
    // Changing fees withdraws the fee approval: counsel must approve the new numbers.
    const legal = changed ? { ...s.legal, feesApproved: false } : s.legal;
    const values = { ...s, ...b, legal };
    await this.db.insert(eb5Settings).values({ id: 1, values, updatedBy: ctx.userId }).onConflictDoUpdate({ target: eb5Settings.id, set: { values, updatedBy: ctx.userId, updatedAt: new Date() } });
    await this.audit.record(ctx, { action: 'eb5.settings_changed', objectType: 'eb5_settings', objectId: '1', before: { fee: s.consultancyFeeUsd, pct: s.commencementPct }, after: { fee: b.consultancyFeeUsd, pct: b.commencementPct, feeApprovalWithdrawn: changed } });
    return this.getSettings(ctx);
  }

  /** Record a legal approval (or withdraw it). Compliance or super admin only, always with counsel's reference. */
  @Post('settings/gates/:gate')
  @HttpCode(200)
  async gate(@Ctx() ctx: RequestContext, @Param('gate') gate: string, @Body(body(z.object({ approved: z.boolean(), reference: z.string().trim().min(5, 'Give counsel’s opinion or approval reference').max(300) }))) b: { approved: boolean; reference: string }) {
    await this.a.need(ctx, 'legal.approve');
    if (!EB5_GATES.some((g) => g.key === gate)) throw new NotFoundException('Unknown approval');
    const s = await this.a.settings();
    const legal = { ...s.legal, [gate]: b.approved, approvals: [...s.legal.approvals, { gate, by: ctx.userId, ref: `${b.approved ? 'Approved' : 'Withdrawn'}: ${b.reference}`, at: new Date().toISOString() }] };
    const values = { ...s, legal };
    await this.db.insert(eb5Settings).values({ id: 1, values, updatedBy: ctx.userId }).onConflictDoUpdate({ target: eb5Settings.id, set: { values, updatedBy: ctx.userId, updatedAt: new Date() } });
    await this.audit.record(ctx, { action: `eb5.gate_${b.approved ? 'approved' : 'withdrawn'}`, objectType: 'eb5_settings', objectId: gate as Eb5Gate, after: { reference: b.reference } });
    return this.getSettings(ctx);
  }

  @Get('roles')
  async roles(@Ctx() ctx: RequestContext) {
    await this.a.need(ctx, 'roles.assign');
    const rows = await this.db.select({ id: eb5Roles.id, role: eb5Roles.role, userId: eb5Roles.userId, name: users.fullName, email: users.email, mfa: users.mfaEnabledAt, at: eb5Roles.createdAt })
      .from(eb5Roles).innerJoin(users, eq(users.id, eb5Roles.userId)).orderBy(asc(users.fullName));
    return rows.map((r) => ({ ...r, mfa: !!r.mfa, roleLabel: EB5_ROLE_LABELS[r.role as keyof typeof EB5_ROLE_LABELS] ?? r.role }));
  }

  @Post('roles')
  @HttpCode(201)
  async grant(@Ctx() ctx: RequestContext, @Body(body(z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(EB5_ROLES) }))) b: { email: string; role: string }) {
    await this.a.need(ctx, 'roles.assign');
    const [u] = await this.db.select().from(users).where(sql`lower(${users.email}) = ${b.email}`).limit(1);
    if (!u) throw new NotFoundException('No COLLABIZ account with that email — invite the person first');
    const [r] = await this.db.insert(eb5Roles).values({ userId: u.id, role: b.role, grantedBy: ctx.userId }).onConflictDoNothing().returning();
    if (!r) throw new ConflictException('Already has this role');
    await this.audit.record(ctx, { action: 'eb5.role_granted', objectType: 'user', objectId: u.id, after: { role: b.role } });
    return { id: r.id, mfaEnabled: !!u.mfaEnabledAt, note: u.mfaEnabledAt ? undefined : 'This person must turn on two-step sign-in before the role works.' };
  }

  @Delete('roles/:id')
  async revoke(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.a.need(ctx, 'roles.assign');
    const [r] = await this.db.delete(eb5Roles).where(eq(eb5Roles.id, id)).returning();
    if (!r) throw new NotFoundException();
    await this.audit.record(ctx, { action: 'eb5.role_revoked', objectType: 'user', objectId: r.userId, before: { role: r.role } });
    return { revoked: true };
  }

  /** Real counts only, scoped to what the viewer may see. */
  @Get('dashboard')
  async dashboard(@Ctx() ctx: RequestContext) {
    const w = await this.a.open(ctx);
    const scope = await this.a.leadScope(ctx, w);
    const leads = await this.db.select({ stage: eb5Leads.stage, created: eb5Leads.createdAt, country: eb5Leads.country, source: eb5Leads.source, dup: eb5Leads.duplicateOf }).from(eb5Leads).where(scope ? sql`(${scope})` : undefined);
    const weekAgo = Date.now() - 7 * 86_400_000;
    const real = leads.filter((l) => !l.dup);
    const finance = eb5Can(w.roles, 'reports.view') || eb5Can(w.roles, 'invoice.issue') || eb5Can(w.roles, 'payment.verify');
    const [money] = finance ? await this.db.select({
      verified: sql<number>`coalesce(sum(${eb5Invoices.amountCents}) filter (where ${eb5Invoices.status} = 'verified' and ${eb5Invoices.ledger} = 'consultancy'), 0)::bigint`,
      pending: sql<number>`coalesce(sum(${eb5Invoices.amountCents}) filter (where ${eb5Invoices.status} in ('issued','payment_reported') and ${eb5Invoices.ledger} = 'consultancy'), 0)::bigint`,
    }).from(eb5Invoices) : [null];
    const [c] = await this.db.select({ upcoming: sql<number>`count(*) filter (where ${eb5Consultations.status} = 'scheduled' and ${eb5Consultations.scheduledAt} >= now())::int`, done: sql<number>`count(*) filter (where ${eb5Consultations.status} = 'completed')::int` }).from(eb5Consultations);
    const [ag] = await this.db.select({ issued: sql<number>`count(*) filter (where ${eb5Agreements.state} not in ('Draft','Internal Review'))::int`, signed: sql<number>`count(*) filter (where ${eb5Agreements.clientSignedAt} is not null)::int` }).from(eb5Agreements);
    const [ap] = await this.db.select({ submitted: sql<number>`count(*) filter (where ${eb5Applications.status} <> 'draft')::int` }).from(eb5Applications);
    const [t] = await this.db.select({ open: sql<number>`count(*) filter (where ${eb5Tasks.doneAt} is null)::int`, overdue: sql<number>`count(*) filter (where ${eb5Tasks.doneAt} is null and ${eb5Tasks.dueOn} < current_date)::int` }).from(eb5Tasks).where(eq(eb5Tasks.assigneeId, ctx.userId));
    const s = await this.a.settings();
    const staffView = eb5Can(w.roles, 'lead.view_all');
    return {
      roles: w.roles, staffView,
      leads: { total: real.length, newThisWeek: real.filter((l) => l.created.getTime() >= weekAgo).length, active: real.filter((l) => l.stage > 0 && l.stage < 15).length, byStage: EB5_LEAD_STAGES.map((name, i) => ({ name, n: real.filter((l) => l.stage === i).length })),
        partnerIntroductions: real.filter((l) => l.source.startsWith('partner')).length, possibleDuplicates: leads.length - real.length },
      consultations: staffView ? c : null, agreements: staffView ? ag : null, applications: staffView ? ap : null,
      collections: money ? { verifiedCents: Number(money.verified), pendingCents: Number(money.pending) } : null,
      tasks: t, gates: EB5_GATES.map((g) => ({ label: g.label, approved: !!s.legal[g.key] })),
      note: 'Real records only. Consultancy collections count verified payments to CITRUS360 LLC; EB-5 investment capital is never collected through COLLABIZ.',
    };
  }

  @Get('reports')
  async reports(@Ctx() ctx: RequestContext, @Query('from') from?: string, @Query('to') to?: string, @Query('country') country?: string, @Query('format') format?: string, @Res({ passthrough: true }) res?: Response) {
    await this.a.need(ctx, 'reports.view');
    const f = from && isoDate.test(from) ? from : '2000-01-01'; const tt = to && isoDate.test(to) ? to : '2999-12-31';
    const rows = await this.db.select({ l: eb5Leads, partner: organizations.displayName }).from(eb5Leads).leftJoin(eb5Partners, eq(eb5Partners.id, eb5Leads.partnerId)).leftJoin(organizations, eq(organizations.id, eb5Partners.orgId))
      .where(and(gte(eb5Leads.createdAt, new Date(`${f}T00:00:00Z`)), lte(eb5Leads.createdAt, new Date(`${tt}T23:59:59Z`)), country ? eq(eb5Leads.country, country) : undefined, isNull(eb5Leads.duplicateOf)));
    const byPartner = new Map<string, { introduced: number; signed: number; active: number }>();
    const bySource = new Map<string, number>(); const byCountry = new Map<string, number>();
    for (const r of rows) {
      const k = r.partner ?? 'Direct'; const p = byPartner.get(k) ?? { introduced: 0, signed: 0, active: 0 };
      p.introduced++; if (r.l.stage >= 8) p.signed++; if (r.l.stage >= 11 && r.l.stage < 15) p.active++; byPartner.set(k, p);
      bySource.set(r.l.source, (bySource.get(r.l.source) ?? 0) + 1); byCountry.set(r.l.country, (byCountry.get(r.l.country) ?? 0) + 1);
    }
    const funnel = EB5_LEAD_STAGES.map((name, i) => ({ name, reached: rows.filter((r) => r.l.stage >= i).length }));
    const out = { from: f, to: tt, country: country ?? null, total: rows.length, funnel, partners: [...byPartner].map(([partner, v]) => ({ partner, ...v })), sources: [...bySource].map(([source, n]) => ({ source, n })), countries: [...byCountry].map(([c2, n]) => ({ country: c2, n })) };
    await this.audit.record(ctx, { action: 'eb5.report_viewed', objectType: 'eb5_report', objectId: format ?? 'json', after: { from: f, to: tt, country: country ?? null } });
    if (format === 'csv' && res) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="go-eb5-partners-${f}-${tt}.csv"`);
      return ['Partner,Introduced,Agreements signed,Active engagements', ...out.partners.map((p) => `"${p.partner.replace(/"/g, '""')}",${p.introduced},${p.signed},${p.active}`)].join('\n');
    }
    return out;
  }

  @Get('audit')
  async auditLog(@Ctx() ctx: RequestContext) {
    await this.a.need(ctx, 'audit.view');
    return this.db.select({ seq: auditEvents.seq, at: auditEvents.at, action: auditEvents.action, objectType: auditEvents.objectType, objectId: auditEvents.objectId, actor: users.fullName })
      .from(auditEvents).leftJoin(users, eq(users.id, auditEvents.actorUserId)).where(like(auditEvents.action, 'eb5.%')).orderBy(desc(auditEvents.seq)).limit(300);
  }

  @Get('tasks')
  async tasks(@Ctx() ctx: RequestContext) {
    await this.a.open(ctx);
    return this.db.select({ id: eb5Tasks.id, title: eb5Tasks.title, dueOn: eb5Tasks.dueOn, doneAt: eb5Tasks.doneAt, leadId: eb5Tasks.leadId, lead: eb5Leads.code })
      .from(eb5Tasks).leftJoin(eb5Leads, eq(eb5Leads.id, eb5Tasks.leadId)).where(eq(eb5Tasks.assigneeId, ctx.userId)).orderBy(asc(eb5Tasks.dueOn)).limit(200);
  }

  @Post('tasks')
  @HttpCode(201)
  async addTask(@Ctx() ctx: RequestContext, @Body(body(z.object({ title: z.string().trim().min(3).max(200), dueOn: z.string().regex(isoDate), leadId: z.string().uuid().optional() }))) b: { title: string; dueOn: string; leadId?: string }) {
    const w = await this.a.need(ctx, 'lead.manage');
    if (b.leadId) await this.a.lead(ctx, w, b.leadId);
    const [t] = await this.db.insert(eb5Tasks).values({ title: b.title, dueOn: b.dueOn, leadId: b.leadId ?? null, assigneeId: ctx.userId, createdBy: ctx.userId }).returning();
    return t;
  }

  @Post('tasks/:id/done')
  @HttpCode(200)
  async done(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.a.open(ctx);
    const [t] = await this.db.update(eb5Tasks).set({ doneAt: new Date() }).where(and(eq(eb5Tasks.id, id), eq(eb5Tasks.assigneeId, ctx.userId))).returning();
    if (!t) throw new NotFoundException();
    return t;
  }
}
void BadRequestException;
