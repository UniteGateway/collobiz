/**
 * AI Growth Desk (admin) — campaign agents per product/service that find, score and draft outreach to lawful contacts.
 *
 * Rules (tested in test/growth-desk.e2e.ts):
 *  - Unite admins and super admins only.
 *  - Contacts carry a source and a lawful basis. Contacts with no basis, opted-out people and suppressed addresses are never
 *    scored, drafted or contacted. Scraping is not a supported source.
 *  - Agents draft; a person approves every message before it can be sent. Edited drafts are re-checked.
 *  - Misleading or regulated claims ("guaranteed", "assured returns", …) block the agent or the draft.
 *  - Investor agents reach only investor contacts with recorded consent, and cannot run until a super admin records clearance.
 *  - Sending is off until GROWTH_SENDING_ENABLED (separate marketing domain/service). When on: daily cap per agent,
 *    suppression re-checked at send time, unsubscribe link in every message, one-click public unsubscribe.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Logger, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CONTACT_SOURCES, GrowthAgentSchema, GrowthContactSchema, GrowthMessageEditSchema, LAWFUL_BASES, blockedClaimsIn } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { growthAgents, growthContacts, growthLeads, growthMessages, growthRuns, growthSuppressions, organizations, partnerProfiles, uniteVentures, ventureInterests } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { MailService } from '../../common/adapters';
import { randomDigits, randomToken } from '../../common/crypto';
import { config } from '../../config';
import { eligibility, rulesWriter, scoreContact, SKIP_LABELS, type Skip } from './engine';

type Agent = typeof growthAgents.$inferSelect;
const LEAD_NEXT: Record<string, string[]> = {
  new: ['approved', 'rejected'], approved: ['contacted', 'rejected'], contacted: ['replied', 'meeting', 'won', 'lost'], replied: ['meeting', 'won', 'lost'], meeting: ['won', 'lost'],
  rejected: [], won: [], lost: [],
};
const ImportSchema = z.object({
  defaults: z.object({ source: z.enum(CONTACT_SOURCES), sourceDetail: z.string().trim().min(3).max(300), lawfulBasis: z.enum(LAWFUL_BASES), consentEvidence: z.string().trim().max(500).optional() }),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000),
});
const ROLE_TO_AUDIENCE: Record<string, string> = { recruit_merchants: 'partners', recruit_members: 'partners', supply_products: 'partners', community: 'associations' };

function staffOnly(ctx: RequestContext) {
  if (!ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin')) throw new ForbiddenException('Growth Desk is for Unite Group administrators');
}
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

@Injectable()
export class GrowthDeskService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('GrowthDesk');
  private timer: NodeJS.Timeout | null = null;
  constructor(@InjectDb() private db: Db, private audit: AuditService, private mail: MailService) {}

  onModuleInit() {
    if (config().NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.runDue().catch((e) => this.log.error(`scheduled run failed: ${e}`)), 3600_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async agent(id: string) {
    const [a] = await this.db.select().from(growthAgents).where(eq(growthAgents.id, id)).limit(1);
    if (!a) throw new NotFoundException('Agent not found');
    return a;
  }

  async issuerName(a: Agent) {
    if (!a.ventureId) return 'Unite Group';
    const [v] = await this.db.select({ name: uniteVentures.name, company: organizations.displayName }).from(uniteVentures).leftJoin(organizations, eq(organizations.id, uniteVentures.groupCompanyOrgId)).where(eq(uniteVentures.id, a.ventureId)).limit(1);
    return v ? `${v.name}${v.company ? ` (${v.company})` : ''}` : 'Unite Group';
  }

  /** Verified partners whose coverage matches, preferring approved promoters of the agent's business. */
  async partnerFor(a: Agent, region: string | null) {
    if (!region || ['partners', 'investors', 'associations'].includes(a.audience)) return null;
    const rows = await this.db.select({ id: organizations.id, sectors: partnerProfiles.sectors, regions: partnerProfiles.regions }).from(partnerProfiles)
      .innerJoin(organizations, eq(organizations.id, partnerProfiles.organizationId)).where(eq(organizations.verificationStatus, 'verified'));
    const fit = rows.filter((r) => r.regions.includes(region) && r.sectors.some((s) => a.sectors.includes(s)));
    if (!fit.length) return null;
    if (a.ventureId) {
      const promoters = new Set((await this.db.select({ o: ventureInterests.organizationId }).from(ventureInterests).where(and(eq(ventureInterests.ventureId, a.ventureId), eq(ventureInterests.status, 'approved')))).map((r) => r.o));
      const p = fit.find((f) => promoters.has(f.id));
      if (p) return p.id;
    }
    return fit[0].id;
  }

  /** One run: filter lawful contacts, score, create leads above the threshold and draft a message for each lead with an e-mail. */
  async run(a: Agent, trigger: 'manual' | 'schedule', userId: string | null) {
    if (a.status === 'paused') throw new ConflictException('This agent is paused. Resume it before running.');
    if (a.audience === 'investors' && !a.clearedBy) throw new ConflictException('Investor agents need clearance from a super admin before they run.');
    const claims = blockedClaimsIn(`${a.pitch}\n${a.callToAction}`);
    if (claims.length) throw new ConflictException(`The pitch uses wording that is not allowed: ${claims.join(', ')}`);
    const [run] = await this.db.insert(growthRuns).values({ agentId: a.id, trigger, provider: 'rules', createdBy: userId }).returning();
    const already = new Set((await this.db.select({ c: growthLeads.contactId }).from(growthLeads).where(eq(growthLeads.agentId, a.id))).map((r) => r.c));
    const contacts = await this.db.select().from(growthContacts).where(inArray(growthContacts.sector, a.sectors)).orderBy(asc(growthContacts.createdAt)).limit(5000);
    const emails = contacts.map((c) => c.email?.toLowerCase()).filter(Boolean) as string[];
    const suppressed = new Set(emails.length ? (await this.db.select({ e: growthSuppressions.email }).from(growthSuppressions).where(inArray(growthSuppressions.email, emails))).map((r) => r.e) : []);
    const skipped: Partial<Record<Skip | 'below_threshold' | 'already_lead' | 'run_limit', number>> = {};
    const bump = (k: keyof typeof skipped) => { skipped[k] = (skipped[k] ?? 0) + 1; };
    const scored: { c: (typeof contacts)[number]; score: number; reasons: string[]; partner: string | null }[] = [];
    for (const c of contacts) {
      if (already.has(c.id)) { bump('already_lead'); continue; }
      const skip = eligibility(a, c, !!c.email && suppressed.has(c.email.toLowerCase()));
      if (skip) { bump(skip); continue; }
      const partner = await this.partnerFor(a, c.region);
      const { score, reasons } = scoreContact(a, c, { partnerNearby: !!partner });
      if (score < a.minScore) { bump('below_threshold'); continue; }
      scored.push({ c, score, reasons, partner });
    }
    scored.sort((x, y) => y.score - x.score);
    const take = scored.slice(0, a.maxLeadsPerRun);
    if (scored.length > take.length) skipped.run_limit = scored.length - take.length;
    const issuer = await this.issuerName(a);
    let drafted = 0;
    for (const s of take) {
      const [lead] = await this.db.insert(growthLeads).values({ agentId: a.id, contactId: s.c.id, runId: run.id, score: s.score, reasons: s.reasons, suggestedPartnerOrgId: s.partner }).onConflictDoNothing().returning();
      if (!lead || !s.c.email) continue;
      const token = randomToken(18);
      const d = rulesWriter.draft({ ...a, issuer }, s.c, s.reasons, `${config().WEB_BASE_URL}/unsubscribe?token=${token}`);
      await this.db.insert(growthMessages).values({
        leadId: lead.id, agentId: a.id, contactId: s.c.id, subject: d.subject, body: d.body, provider: d.provider, promptVersion: d.promptVersion, sources: d.sources,
        unsubscribeToken: token, status: d.blocked.length ? 'blocked' : 'draft', blockedReason: d.blocked.length ? `Uses wording that is not allowed: ${d.blocked.join(', ')}` : null,
      });
      drafted++;
    }
    const [done] = await this.db.update(growthRuns).set({ considered: contacts.length, created: take.length, drafted, skipped, finishedAt: new Date() }).where(eq(growthRuns.id, run.id)).returning();
    await this.db.update(growthAgents).set({ lastRunAt: new Date() }).where(eq(growthAgents.id, a.id));
    return done;
  }

  /** Scheduled runs for active agents whose cadence is due. */
  async runDue() {
    const agents = await this.db.select().from(growthAgents).where(and(eq(growthAgents.status, 'active'), inArray(growthAgents.cadence, ['daily', 'weekly'])));
    let n = 0;
    for (const a of agents) {
      const gap = a.cadence === 'daily' ? 86400_000 : 7 * 86400_000;
      if (a.lastRunAt && Date.now() - a.lastRunAt.getTime() < gap - 3600_000) continue;
      try { await this.run(a, 'schedule', null); n++; } catch (e) { this.log.warn(`${a.code}: ${(e as Error).message}`); }
    }
    return n;
  }

  async funnel(agentIds?: string[]) {
    const where = agentIds ? inArray(growthLeads.agentId, agentIds) : undefined;
    const leads = await this.db.select({ agentId: growthLeads.agentId, status: growthLeads.status, n: sql<number>`count(*)::int` }).from(growthLeads).where(where).groupBy(growthLeads.agentId, growthLeads.status);
    const msgs = await this.db.select({ agentId: growthMessages.agentId, status: growthMessages.status, n: sql<number>`count(*)::int` }).from(growthMessages).where(agentIds ? inArray(growthMessages.agentId, agentIds) : undefined).groupBy(growthMessages.agentId, growthMessages.status);
    return { leads, msgs };
  }
}

@ApiTags('growth-desk')
@Controller()
export class GrowthDeskController {
  constructor(@InjectDb() private db: Db, private svc: GrowthDeskService, private audit: AuditService, private mail: MailService) {}

  // ---------- dashboard ----------
  @Get('admin/growth')
  async dashboard(@Ctx() ctx: RequestContext) {
    staffOnly(ctx);
    const agents = await this.db.select({ a: growthAgents, venture: uniteVentures.name }).from(growthAgents).leftJoin(uniteVentures, eq(uniteVentures.id, growthAgents.ventureId)).orderBy(asc(growthAgents.name));
    const { leads, msgs } = await this.svc.funnel();
    const count = (rows: { agentId: string; status: string; n: number }[], agentId: string | null, statuses: string[]) => rows.filter((r) => (!agentId || r.agentId === agentId) && statuses.includes(r.status)).reduce((s, r) => s + r.n, 0);
    const [contacts] = await this.db.select({ total: sql<number>`count(*)::int`, usable: sql<number>`count(*) filter (where ${growthContacts.lawfulBasis} <> 'none' and ${growthContacts.optedOutAt} is null)::int`, optedOut: sql<number>`count(*) filter (where ${growthContacts.optedOutAt} is not null)::int` }).from(growthContacts);
    return {
      sendingEnabled: config().GROWTH_SENDING_ENABLED, provider: 'rules', aiProviderConfigured: config().AI_PROVIDER !== 'rules',
      totals: {
        agents: agents.length, active: agents.filter((r) => r.a.status === 'active').length, contacts: contacts.total, usableContacts: contacts.usable, optedOut: contacts.optedOut,
        toReview: count(leads, null, ['new']), awaitingApproval: count(msgs, null, ['draft']), approved: count(msgs, null, ['approved']), sent: count(msgs, null, ['sent', 'queued']),
        replied: count(leads, null, ['replied', 'meeting', 'won']), won: count(leads, null, ['won']),
      },
      agents: agents.map(({ a, venture }) => ({
        id: a.id, code: a.code, name: a.name, product: a.product, audience: a.audience, status: a.status, cadence: a.cadence, venture, lastRunAt: a.lastRunAt, needsClearance: a.audience === 'investors' && !a.clearedBy,
        leads: count(leads, a.id, ['new', 'approved', 'rejected', 'contacted', 'replied', 'meeting', 'won', 'lost']), toReview: count(leads, a.id, ['new']),
        awaitingApproval: count(msgs, a.id, ['draft']), sent: count(msgs, a.id, ['sent', 'queued']), replied: count(leads, a.id, ['replied', 'meeting', 'won']), won: count(leads, a.id, ['won']),
      })),
    };
  }

  // ---------- agents ----------
  @Post('admin/growth/agents')
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(GrowthAgentSchema)) b: z.infer<typeof GrowthAgentSchema>) {
    staffOnly(ctx);
    const claims = blockedClaimsIn(`${b.pitch}\n${b.callToAction}\n${b.product}`);
    if (claims.length) throw new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: [{ path: 'pitch', message: `Remove wording that is not allowed: ${claims.join(', ')}` }] });
    if (b.ventureId) {
      const [v] = await this.db.select().from(uniteVentures).where(eq(uniteVentures.id, b.ventureId)).limit(1);
      if (!v) throw new BadRequestException('Business not found');
      if (v.regulatedReason && !v.clearedAt) throw new ConflictException(`${v.name} needs regulatory review before it can be promoted.`);
    }
    const [a] = await this.db.insert(growthAgents).values({ ...b, ventureId: b.ventureId ?? null, code: `AG-${randomDigits(6)}`, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'growth.agent_created', objectType: 'growth_agent', objectId: a.id, after: { name: a.name, audience: a.audience } });
    return a;
  }

  /** "One agent per product": creates a draft agent for every open business that has none yet. */
  @Post('admin/growth/agents/from-businesses')
  @HttpCode(200)
  async fromBusinesses(@Ctx() ctx: RequestContext) {
    staffOnly(ctx);
    const have = new Set((await this.db.select({ v: growthAgents.ventureId }).from(growthAgents)).map((r) => r.v));
    const ventures = await this.db.select().from(uniteVentures).where(and(eq(uniteVentures.open, true), or(isNull(uniteVentures.regulatedReason), sql`${uniteVentures.clearedAt} is not null`))).orderBy(asc(uniteVentures.num));
    const rows = ventures.filter((v) => !have.has(v.id)).map((v) => {
      const audience = v.roles.map((r) => ROLE_TO_AUDIENCE[r]).find(Boolean) ?? 'buyers';
      return {
        code: `AG-${randomDigits(6)}`, name: `${v.name} — ${audience === 'partners' ? 'new partners' : audience === 'associations' ? 'associations' : 'customers'}`, ventureId: v.id, product: `${v.name}: ${v.tagline}`,
        audience, sectors: [v.sector], regions: [], countries: ['IN'], pitch: v.summary, callToAction: 'If this is relevant, reply to this e-mail and we will arrange a short call at a time that suits you.',
        cadence: 'weekly', status: 'draft', createdBy: ctx.userId,
      };
    });
    if (rows.length) await this.db.insert(growthAgents).values(rows);
    await this.audit.record(ctx, { action: 'growth.agents_from_businesses', objectType: 'growth_agent', after: { created: rows.length } });
    return { created: rows.length, alreadyHadAgent: ventures.length - rows.length };
  }

  @Get('admin/growth/agents/:id')
  async detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    staffOnly(ctx);
    const a = await this.svc.agent(id);
    const leads = await this.db.select({ l: growthLeads, c: growthContacts, partner: organizations.displayName }).from(growthLeads)
      .innerJoin(growthContacts, eq(growthContacts.id, growthLeads.contactId)).leftJoin(organizations, eq(organizations.id, growthLeads.suggestedPartnerOrgId))
      .where(eq(growthLeads.agentId, id)).orderBy(desc(growthLeads.score)).limit(500);
    const msgs = await this.db.select().from(growthMessages).where(eq(growthMessages.agentId, id)).orderBy(desc(growthMessages.createdAt)).limit(1000);
    const runs = await this.db.select().from(growthRuns).where(eq(growthRuns.agentId, id)).orderBy(desc(growthRuns.startedAt)).limit(10);
    const [sentToday] = await this.db.select({ n: sql<number>`count(*)::int` }).from(growthMessages).where(and(eq(growthMessages.agentId, id), gte(growthMessages.sentAt, startOfDay())));
    const [venture] = a.ventureId ? await this.db.select({ name: uniteVentures.name, slug: uniteVentures.slug }).from(uniteVentures).where(eq(uniteVentures.id, a.ventureId)) : [];
    return {
      agent: { ...a, venture: venture ?? null, needsClearance: a.audience === 'investors' && !a.clearedBy, sentToday: sentToday.n },
      sendingEnabled: config().GROWTH_SENDING_ENABLED,
      runs: runs.map((r) => ({ ...r, skipped: Object.entries(r.skipped as Record<string, number>).map(([k, n]) => ({ reason: SKIP_LABELS[k as Skip] ?? ({ below_threshold: 'Score below the threshold', already_lead: 'Already a lead of this agent', run_limit: 'Over the per-run limit' } as Record<string, string>)[k] ?? k, n })) })),
      leads: leads.map(({ l, c, partner }) => {
        const m = msgs.find((x) => x.leadId === l.id);
        return {
          id: l.id, score: l.score, reasons: l.reasons, status: l.status, suggestedPartner: partner, createdAt: l.createdAt,
          contact: { id: c.id, organizationName: c.organizationName, contactName: c.contactName, email: c.email, phone: c.phone, city: c.city, region: c.region, country: c.country, sector: c.sector, source: c.source, sourceDetail: c.sourceDetail, lawfulBasis: c.lawfulBasis, optedOut: !!c.optedOutAt },
          message: m ? { id: m.id, subject: m.subject, body: m.body, status: m.status, blockedReason: m.blockedReason, provider: m.provider, promptVersion: m.promptVersion, sources: m.sources, edited: m.edited, sentAt: m.sentAt } : null,
        };
      }),
    };
  }

  @Patch('admin/growth/agents/:id')
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(GrowthAgentSchema.partial().extend({ status: z.enum(['draft', 'active', 'paused']).optional() }))) b: Partial<z.infer<typeof GrowthAgentSchema>> & { status?: string }) {
    staffOnly(ctx);
    const a = await this.svc.agent(id);
    const next = { ...a, ...b };
    const claims = blockedClaimsIn(`${next.pitch}\n${next.callToAction}\n${next.product}`);
    if (claims.length) throw new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: [{ path: 'pitch', message: `Remove wording that is not allowed: ${claims.join(', ')}` }] });
    if (b.status === 'active' && next.audience === 'investors' && !a.clearedBy) throw new ConflictException('Investor agents need clearance from a super admin before they can be switched on.');
    if (b.audience === 'investors' && a.audience !== 'investors') Object.assign(b, { clearedBy: null, clearanceNote: null });
    const [u] = await this.db.update(growthAgents).set({ ...b, updatedAt: new Date() }).where(eq(growthAgents.id, id)).returning();
    await this.audit.record(ctx, { action: 'growth.agent_updated', objectType: 'growth_agent', objectId: id, before: { status: a.status }, after: b });
    return u;
  }

  @Post('admin/growth/agents/:id/clearance')
  @HttpCode(200)
  async clearance(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ note: z.string().trim().min(10).max(500) }))) b: { note: string }) {
    if (!ctx.platformRoles.includes('super_admin')) throw new ForbiddenException('Only a super admin can clear an investor agent');
    const a = await this.svc.agent(id);
    if (a.audience !== 'investors') throw new BadRequestException('Only investor agents need clearance');
    const [u] = await this.db.update(growthAgents).set({ clearedBy: ctx.userId, clearanceNote: b.note, updatedAt: new Date() }).where(eq(growthAgents.id, id)).returning();
    await this.audit.record(ctx, { action: 'growth.agent_cleared', objectType: 'growth_agent', objectId: id, reason: b.note });
    return u;
  }

  @Post('admin/growth/agents/:id/run')
  @HttpCode(200)
  async runNow(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    staffOnly(ctx);
    const run = await this.svc.run(await this.svc.agent(id), 'manual', ctx.userId);
    await this.audit.record(ctx, { action: 'growth.agent_run', objectType: 'growth_agent', objectId: id, after: { created: run.created, drafted: run.drafted } });
    return run;
  }

  // ---------- leads and messages ----------
  @Post('admin/growth/leads/:id/status')
  @HttpCode(200)
  async leadStatus(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ status: z.enum(['approved', 'rejected', 'contacted', 'replied', 'meeting', 'won', 'lost']) }))) b: { status: string }) {
    staffOnly(ctx);
    const [l] = await this.db.select().from(growthLeads).where(eq(growthLeads.id, id)).limit(1);
    if (!l) throw new NotFoundException('Lead not found');
    if (!(LEAD_NEXT[l.status] ?? []).includes(b.status)) throw new ConflictException(`A lead that is "${l.status}" cannot become "${b.status}".`);
    await this.db.update(growthLeads).set({ status: b.status, decidedBy: ctx.userId, updatedAt: new Date() }).where(eq(growthLeads.id, id));
    if (b.status === 'rejected') await this.db.update(growthMessages).set({ status: 'rejected' }).where(and(eq(growthMessages.leadId, id), inArray(growthMessages.status, ['draft', 'approved', 'blocked'])));
    await this.audit.record(ctx, { action: 'growth.lead_status', objectType: 'growth_lead', objectId: id, before: { status: l.status }, after: { status: b.status } });
    return { status: b.status };
  }

  private async message(id: string) {
    const [m] = await this.db.select().from(growthMessages).where(eq(growthMessages.id, id)).limit(1);
    if (!m) throw new NotFoundException('Message not found');
    return m;
  }

  @Patch('admin/growth/messages/:id')
  async edit(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(GrowthMessageEditSchema)) b: z.infer<typeof GrowthMessageEditSchema>) {
    staffOnly(ctx);
    const m = await this.message(id);
    if (!['draft', 'blocked'].includes(m.status)) throw new ConflictException('Only drafts waiting for approval can be edited');
    if (!b.body.includes(m.unsubscribeToken)) throw new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: [{ path: 'body', message: 'Keep the unsubscribe link at the end of the message' }] });
    const claims = blockedClaimsIn(`${b.subject}\n${b.body}`);
    const [u] = await this.db.update(growthMessages).set({ ...b, edited: true, status: claims.length ? 'blocked' : 'draft', blockedReason: claims.length ? `Uses wording that is not allowed: ${claims.join(', ')}` : null }).where(eq(growthMessages.id, id)).returning();
    await this.audit.record(ctx, { action: 'growth.message_edited', objectType: 'growth_message', objectId: id });
    return u;
  }

  @Post('admin/growth/messages/:id/decide')
  @HttpCode(200)
  async decide(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['approve', 'reject']) }))) b: { decision: 'approve' | 'reject' }) {
    staffOnly(ctx);
    const m = await this.message(id);
    if (m.status === 'blocked' && b.decision === 'approve') throw new ConflictException(m.blockedReason ?? 'This draft is blocked by a safety check. Edit it first.');
    if (m.status !== 'draft' && !(m.status === 'blocked' && b.decision === 'reject')) throw new ConflictException('This message has already been decided');
    const [c] = await this.db.select().from(growthContacts).where(eq(growthContacts.id, m.contactId)).limit(1);
    if (b.decision === 'approve' && (c.optedOutAt || c.lawfulBasis === 'none')) throw new ConflictException('This contact can no longer be contacted (opted out or no lawful basis).');
    const status = b.decision === 'approve' ? 'approved' : 'rejected';
    await this.db.update(growthMessages).set({ status, approvedBy: b.decision === 'approve' ? ctx.userId : null, approvedAt: b.decision === 'approve' ? new Date() : null }).where(eq(growthMessages.id, id));
    if (b.decision === 'approve') await this.db.update(growthLeads).set({ status: 'approved', decidedBy: ctx.userId, updatedAt: new Date() }).where(and(eq(growthLeads.id, m.leadId), eq(growthLeads.status, 'new')));
    await this.audit.record(ctx, { action: `growth.message_${status}`, objectType: 'growth_message', objectId: id });
    return { status };
  }

  /** Sends approved messages for one agent, within its daily cap. Off until a marketing e-mail service is configured. */
  @Post('admin/growth/agents/:id/send')
  @HttpCode(200)
  async send(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    staffOnly(ctx);
    if (!config().GROWTH_SENDING_ENABLED) throw new ConflictException('Sending is switched off until a separate marketing e-mail service is set up. Approved messages are kept and can be sent later.');
    const a = await this.svc.agent(id);
    if (a.status !== 'active') throw new ConflictException('Switch the agent on before sending.');
    const [today] = await this.db.select({ n: sql<number>`count(*)::int` }).from(growthMessages).where(and(eq(growthMessages.agentId, id), gte(growthMessages.sentAt, startOfDay())));
    const room = Math.max(0, a.dailySendCap - today.n);
    const queue = await this.db.select({ m: growthMessages, c: growthContacts }).from(growthMessages).innerJoin(growthContacts, eq(growthContacts.id, growthMessages.contactId))
      .where(and(eq(growthMessages.agentId, id), eq(growthMessages.status, 'approved'))).orderBy(asc(growthMessages.approvedAt)).limit(room);
    let sent = 0, blocked = 0;
    for (const { m, c } of queue) {
      const email = c.email?.toLowerCase();
      const [sup] = email ? await this.db.select().from(growthSuppressions).where(eq(growthSuppressions.email, email)).limit(1) : [];
      if (!email || sup || c.optedOutAt || c.lawfulBasis === 'none') { await this.db.update(growthMessages).set({ status: 'blocked', blockedReason: 'Contact opted out or can no longer be contacted' }).where(eq(growthMessages.id, m.id)); blocked++; continue; }
      const out = await this.mail.send('email', email, m.subject, m.body, { growthMessageId: m.id });
      await this.db.update(growthMessages).set({ status: out.status === 'failed' ? 'failed' : 'sent', sentAt: new Date(), outboxId: out.id }).where(eq(growthMessages.id, m.id));
      await this.db.update(growthLeads).set({ status: 'contacted', updatedAt: new Date() }).where(and(eq(growthLeads.id, m.leadId), inArray(growthLeads.status, ['new', 'approved'])));
      sent++;
    }
    const [left] = await this.db.select({ n: sql<number>`count(*)::int` }).from(growthMessages).where(and(eq(growthMessages.agentId, id), eq(growthMessages.status, 'approved')));
    await this.audit.record(ctx, { action: 'growth.messages_sent', objectType: 'growth_agent', objectId: id, after: { sent, blocked } });
    return { sent, blocked, waitingForTomorrow: left.n, dailyCap: a.dailySendCap };
  }

  // ---------- contacts (lead database) ----------
  @Get('admin/growth/contacts')
  async contacts(@Ctx() ctx: RequestContext, @Query('q') q?: string, @Query('basis') basis?: string, @Query('sector') sector?: string) {
    staffOnly(ctx);
    const rows = await this.db.select().from(growthContacts).where(and(
      q ? or(ilike(growthContacts.organizationName, `%${q}%`), ilike(growthContacts.contactName, `%${q}%`), ilike(growthContacts.email, `%${q}%`), ilike(growthContacts.city, `%${q}%`)) : undefined,
      basis === 'usable' ? and(sql`${growthContacts.lawfulBasis} <> 'none'`, isNull(growthContacts.optedOutAt)) : basis === 'opted_out' ? sql`${growthContacts.optedOutAt} is not null` : basis === 'none' ? eq(growthContacts.lawfulBasis, 'none') : undefined,
      sector ? eq(growthContacts.sector, sector) : undefined,
    )).orderBy(desc(growthContacts.createdAt)).limit(300);
    const [t] = await this.db.select({ n: sql<number>`count(*)::int` }).from(growthContacts);
    return { total: t.n, rows };
  }

  @Post('admin/growth/contacts')
  @HttpCode(201)
  async addContact(@Ctx() ctx: RequestContext, @Body(body(GrowthContactSchema)) b: z.infer<typeof GrowthContactSchema>) {
    staffOnly(ctx);
    if (b.email) {
      const [sup] = await this.db.select().from(growthSuppressions).where(eq(growthSuppressions.email, b.email)).limit(1);
      if (sup) throw new ConflictException('This address asked not to be contacted and cannot be added again.');
      const [dup] = await this.db.select({ id: growthContacts.id }).from(growthContacts).where(sql`lower(${growthContacts.email}) = ${b.email}`).limit(1);
      if (dup) throw new ConflictException('A contact with this e-mail is already in the database.');
    }
    const [c] = await this.db.insert(growthContacts).values({ ...b, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'growth.contact_added', objectType: 'growth_contact', objectId: c.id, after: { source: b.source, lawfulBasis: b.lawfulBasis } });
    return c;
  }

  /** CSV import (parsed in the browser). One source and lawful basis applies to the whole batch. */
  @Post('admin/growth/contacts/import')
  @HttpCode(200)
  async importContacts(@Ctx() ctx: RequestContext, @Body(body(ImportSchema)) b: z.infer<typeof ImportSchema>) {
    staffOnly(ctx);
    if (b.defaults.lawfulBasis === 'consent' && !b.defaults.consentEvidence) throw new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: [{ path: 'consentEvidence', message: 'Record how consent was given' }] });
    const invalid: { row: number; error: string }[] = [];
    const parsed: z.infer<typeof GrowthContactSchema>[] = [];
    b.rows.forEach((r, i) => {
      const p = GrowthContactSchema.safeParse({ ...r, ...b.defaults, tags: typeof r.tags === 'string' ? (r.tags as string).split(/[;|]/).map((x) => x.trim()).filter(Boolean) : r.tags });
      if (p.success) parsed.push(p.data); else invalid.push({ row: i + 2, error: p.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') });
    });
    const emails = parsed.map((p) => p.email).filter(Boolean) as string[];
    const suppressed = new Set(emails.length ? (await this.db.select({ e: growthSuppressions.email }).from(growthSuppressions).where(inArray(growthSuppressions.email, emails))).map((r) => r.e) : []);
    const existing = new Set(emails.length ? (await this.db.select({ e: sql<string>`lower(${growthContacts.email})` }).from(growthContacts).where(inArray(sql`lower(${growthContacts.email})`, emails))).map((r) => r.e) : []);
    const seen = new Set<string>();
    let duplicates = 0, skippedSuppressed = 0;
    const rows = parsed.filter((p) => {
      if (!p.email) return true;
      if (suppressed.has(p.email)) { skippedSuppressed++; return false; }
      if (existing.has(p.email) || seen.has(p.email)) { duplicates++; return false; }
      seen.add(p.email); return true;
    });
    if (rows.length) await this.db.insert(growthContacts).values(rows.map((r) => ({ ...r, createdBy: ctx.userId })));
    await this.audit.record(ctx, { action: 'growth.contacts_imported', objectType: 'growth_contact', after: { created: rows.length, duplicates, suppressed: skippedSuppressed, invalid: invalid.length, source: b.defaults.source, lawfulBasis: b.defaults.lawfulBasis } });
    return { created: rows.length, duplicates, suppressed: skippedSuppressed, invalid: invalid.slice(0, 50), invalidCount: invalid.length };
  }

  @Post('admin/growth/contacts/:id/opt-out')
  @HttpCode(200)
  async optOut(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    staffOnly(ctx);
    const [c] = await this.db.select().from(growthContacts).where(eq(growthContacts.id, id)).limit(1);
    if (!c) throw new NotFoundException('Contact not found');
    await optOutContact(this.db, c, 'manual');
    await this.audit.record(ctx, { action: 'growth.contact_opted_out', objectType: 'growth_contact', objectId: id });
    return { optedOut: true };
  }

  // ---------- public unsubscribe ----------
  @Public()
  @Get('public/unsubscribe')
  async unsubscribeInfo(@Query('token') token?: string) {
    const r = token ? await this.byToken(token) : null;
    if (!r) throw new NotFoundException('This link is not valid');
    const [user, domain] = (r.c.email ?? '').split('@');
    return { email: r.c.email ? `${user.slice(0, 2)}•••@${domain}` : null, organization: r.c.organizationName, alreadyOptedOut: !!r.c.optedOutAt };
  }

  @Public()
  @Post('public/unsubscribe')
  @HttpCode(200)
  async unsubscribe(@Body(body(z.object({ token: z.string().min(10).max(100) }))) b: { token: string }) {
    const r = await this.byToken(b.token);
    if (!r) throw new NotFoundException('This link is not valid');
    await optOutContact(this.db, r.c, 'unsubscribed');
    await this.audit.record(null, { action: 'growth.unsubscribed', objectType: 'growth_contact', objectId: r.c.id });
    return { optedOut: true };
  }

  private async byToken(token: string) {
    const [r] = await this.db.select({ c: growthContacts }).from(growthMessages).innerJoin(growthContacts, eq(growthContacts.id, growthMessages.contactId)).where(eq(growthMessages.unsubscribeToken, token)).limit(1);
    return r ?? null;
  }
}

/** Opt-out applies everywhere: contact flagged, address suppressed, unsent drafts blocked. */
async function optOutContact(db: Db, c: typeof growthContacts.$inferSelect, reason: string) {
  if (!c.optedOutAt) await db.update(growthContacts).set({ optedOutAt: new Date(), updatedAt: new Date() }).where(eq(growthContacts.id, c.id));
  if (c.email) await db.insert(growthSuppressions).values({ email: c.email.toLowerCase(), reason }).onConflictDoNothing();
  await db.update(growthMessages).set({ status: 'blocked', blockedReason: 'Contact opted out' }).where(and(eq(growthMessages.contactId, c.id), inArray(growthMessages.status, ['draft', 'approved'])));
}

@Module({ controllers: [GrowthDeskController], providers: [GrowthDeskService], exports: [GrowthDeskService] })
export class GrowthDeskModule {}
