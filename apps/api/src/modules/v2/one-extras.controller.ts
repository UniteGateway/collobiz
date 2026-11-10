/**
 * COLLABIZ ONE extras (tested in test/one-extras.e2e.ts)
 *  - Business DNA Passport: a company's capabilities, each marked evidenced (accepted KYB document, completed COLLABIZ project,
 *    published reviews, COLLABIZ certificates) or self-declared. Turnover is shown as a band.
 *  - Opportunity Rescue: a project party lists its gaps; partners are searched only once every original party (owner and lead)
 *    has authorised it. Matching partners can express interest; nothing binds anyone.
 *  - 48-hour team challenge: the opportunity owner lists roles; qualified partners express interest; coverage is shown.
 *    The deadline is a coordination target, not a guarantee.
 *  - Revival: a party asks the owner's permission to revisit a lost or stalled opportunity; suggestions are only suggestions.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CHALLENGE_HOURS, ChallengeCreateSchema, EVIDENCE_LABELS, InterestSchema, KYB_EVIDENCE, RESCUE_GAPS, RescueCreateSchema, RevivalDecisionSchema, RevivalRequestSchema, challengeCoverage, gapsCovered, revivalSuggestions, sectorName, turnoverBand, type Evidence, type RescueGap } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  certificates, kybDocuments, leadClaims, memberships, notifications, oneInterests, opportunities, organizations, partnerProfiles, partnerReviews, projectMembers, projects, rescueRequests, revivalRequests, teamChallenges, tenders, xchangeListings,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';

const platform = (ctx: RequestContext) => ctx.platformRoles.length > 0 && !ctx.mfaRequiredButMissing;
/** Owners and admins act for their company; a Unite group company's admins hold the unite_admin role. */
const manager = (ctx: RequestContext, orgId: string) => ctx.memberships.some((m) => m.organizationId === orgId && ['org_owner', 'org_admin', 'unite_admin'].includes(m.role));
const inOrg = (ctx: RequestContext, orgId: string) => ctx.memberships.some((m) => m.organizationId === orgId);

@ApiTags('one extras')
@Controller()
export class OneExtrasController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private async notify(orgIds: string[], title: string, text: string, link: string) {
    const ms = orgIds.length ? await this.db.select({ u: memberships.userId }).from(memberships).where(and(inArray(memberships.organizationId, orgIds), eq(memberships.status, 'active'))) : [];
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'announcement', title, body: text, link })));
  }

  // ================= Business DNA Passport =================
  @Get('dna/:orgId')
  async dna(@Ctx() ctx: RequestContext, @Param('orgId', ParseUUIDPipe) orgId: string) {
    const [o] = await this.db.select().from(organizations).where(eq(organizations.id, orgId));
    if (!o || (o.verificationStatus !== 'verified' && !inOrg(ctx, orgId) && !platform(ctx))) throw new NotFoundException('Company not found');
    const [p] = await this.db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, orgId));
    const docs = await this.db.select({ t: kybDocuments.docType }).from(kybDocuments).where(and(eq(kybDocuments.organizationId, orgId), eq(kybDocuments.status, 'accepted')));
    const done = await this.db.select({ p: projects, sector: tenders.sector }).from(projects).leftJoin(tenders, eq(tenders.id, projects.tenderId))
      .where(and(inArray(projects.status, ['completed', 'closed']), or(eq(projects.leadOrgId, orgId), sql`exists (select 1 from ${projectMembers} pm where pm.project_id = ${projects.id} and pm.organization_id = ${orgId} and pm.status = 'active')`)));
    const reviews = await this.db.select({ q: partnerReviews.quality, t: partnerReviews.timeliness, c: partnerReviews.communication }).from(partnerReviews).where(and(eq(partnerReviews.subjectOrgId, orgId), eq(partnerReviews.status, 'published')));
    const certs = await this.db.select({ id: certificates.id }).from(certificates).where(and(eq(certificates.organizationId, orgId), sql`${certificates.revokedAt} is null`));
    const capacity = await this.db.select({ title: xchangeListings.title }).from(xchangeListings).where(and(eq(xchangeListings.orgId, orgId), eq(xchangeListings.side, 'offer'), eq(xchangeListings.status, 'active')));
    const deliveredSectors = new Set(done.map((d) => d.sector).filter((x): x is string => !!x));
    const item = (label: string, value: string, evidence: Evidence, source: string) => ({ label, value, evidence, evidenceLabel: EVIDENCE_LABELS[evidence], source });
    const avg = (k: 'q' | 't' | 'c') => (reviews.length ? Math.round((reviews.reduce((a, r) => a + Number(r[k]), 0) / reviews.length) * 10) / 10 : null);
    const sections = [
      { title: 'Registrations', items: docs.length ? [...new Set(docs.map((d) => d.t))].map((t) => item(KYB_EVIDENCE[t] ?? t.replace(/_/g, ' '), 'On file and accepted by Unite', 'evidenced', 'KYB document reviewed by Unite')) : [item('Registrations', 'No accepted documents yet', 'self_declared', '—')] },
      { title: 'Sectors', items: (p?.sectors ?? []).map((s) => (deliveredSectors.has(s) ? item(sectorName(s), 'Delivered on COLLABIZ', 'evidenced', `${done.filter((d) => d.sector === s).length} completed project(s)`) : item(sectorName(s), 'Stated in profile', 'self_declared', 'Company profile'))) },
      { title: 'Delivery record', items: [item('Completed COLLABIZ projects', String(done.length), done.length ? 'evidenced' : 'self_declared', done.length ? done.map((d) => d.p.code).join(', ') : 'None yet'),
        ...(reviews.length ? [item('Client reviews', `${reviews.length} · quality ${avg('q')} · on time ${avg('t')} · communication ${avg('c')} (of 5)`, 'evidenced', 'Published reviews from project counterparties')] : [])] },
      { title: 'Size', items: [item('Turnover', turnoverBand(p?.annualTurnover) ?? 'Not given', 'self_declared', docs.some((d) => d.t === 'financials') ? 'Financial statements on file' : 'Company profile'), item('People', p?.employees ? String(p.employees) : 'Not given', 'self_declared', 'Company profile')] },
      { title: 'Skills, certifications and equipment', items: [
        ...(p?.skills ?? []).map((s) => item(s, 'Skill', 'self_declared', 'Company profile')),
        ...(p?.certifications ?? []).map((c) => item(c, 'Certification', 'self_declared', 'Stated — upload the certificate for review to evidence it')),
        ...(certs.length ? [item('COLLABIZ training certificates', String(certs.length), 'evidenced', 'Issued by COLLABIZ Academy')] : []),
        ...capacity.map((c) => item(c.title, 'Spare capacity listed on XCHANGE', 'self_declared', 'XCHANGE listing')),
      ] },
    ];
    const all = sections.flatMap((s) => s.items);
    return { orgId, name: o.displayName, city: o.city, verified: o.verificationStatus === 'verified', sections, evidencedShare: all.length ? Math.round((all.filter((i) => i.evidence === 'evidenced').length / all.length) * 100) : 0,
      note: 'Evidenced items are backed by documents Unite reviewed or by work completed on COLLABIZ. Self-declared items are the company’s own statements.' };
  }

  // ================= Opportunity Rescue =================
  private async projectParties(projectId: string) {
    const [p] = await this.db.select().from(projects).where(eq(projects.id, projectId));
    if (!p) throw new NotFoundException('Project not found');
    return { p, parties: [...new Set([p.ownerOrgId, p.leadOrgId])] };
  }

  @Post('projects/:id/rescue')
  @HttpCode(201)
  async rescue(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(RescueCreateSchema)) b: z.infer<typeof RescueCreateSchema>) {
    const { p, parties } = await this.projectParties(id);
    const mine = parties.find((o) => manager(ctx, o));
    if (!mine) throw new ForbiddenException('The project owner or lead contractor asks for a rescue');
    if ((await this.db.select({ id: rescueRequests.id }).from(rescueRequests).where(and(eq(rescueRequests.projectId, id), ne(rescueRequests.status, 'closed')))).length) throw new ConflictException('A rescue is already open for this project');
    const [r] = await this.db.insert(rescueRequests).values({ projectId: id, gaps: b.gaps, note: b.note, createdByOrgId: mine, createdBy: ctx.userId, authorizations: [{ orgId: mine, userId: ctx.userId, at: new Date().toISOString() }], status: parties.length === 1 ? 'searching' : 'awaiting_authorization' }).returning();
    await this.notify(parties.filter((o) => o !== mine), `Authorise a rescue search on ${p.code}?`, 'Partners will be searched to close the gaps listed — only with your authorisation.', `/projects/${id}/rescue`);
    await this.audit.record(ctx, { action: 'one.rescue_requested', objectType: 'project', objectId: id, after: b });
    return r;
  }

  @Post('rescue/:rid/authorize')
  @HttpCode(200)
  async authorizeRescue(@Ctx() ctx: RequestContext, @Param('rid', ParseUUIDPipe) rid: string) {
    const [r] = await this.db.select().from(rescueRequests).where(eq(rescueRequests.id, rid));
    if (!r) throw new NotFoundException('Rescue not found');
    const { parties } = await this.projectParties(r.projectId);
    const mine = parties.find((o) => manager(ctx, o));
    if (!mine) throw new ForbiddenException('Only the project owner or lead contractor authorises');
    const auths = r.authorizations as { orgId: string }[];
    if (auths.some((a) => a.orgId === mine)) throw new ConflictException('Your company has already authorised');
    const next = [...auths, { orgId: mine, userId: ctx.userId, at: new Date().toISOString() }];
    const all = parties.every((o) => next.some((a) => a.orgId === o));
    await this.db.update(rescueRequests).set({ authorizations: next, status: all ? 'searching' : r.status }).where(eq(rescueRequests.id, rid));
    await this.audit.record(ctx, { action: 'one.rescue_authorised', objectType: 'project', objectId: r.projectId, after: { rescue: rid, all } });
    return { status: all ? 'searching' : r.status };
  }

  @Get('projects/:id/rescue')
  async rescueView(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { p, parties } = await this.projectParties(id);
    if (!parties.some((o) => inOrg(ctx, o)) && !platform(ctx)) throw new NotFoundException('Project not found');
    const [r] = await this.db.select().from(rescueRequests).where(eq(rescueRequests.projectId, id)).orderBy(desc(rescueRequests.createdAt)).limit(1);
    const names = await this.db.select({ id: organizations.id, n: organizations.displayName }).from(organizations).where(inArray(organizations.id, parties));
    const base = { project: { id: p.id, code: p.code, title: p.title }, parties: names.map((x) => ({ id: x.id, name: x.n })), gaps: Object.entries(RESCUE_GAPS).map(([k, g]) => ({ key: k, label: g.label })), canRequest: parties.some((o) => manager(ctx, o)) };
    if (!r) return { ...base, rescue: null, candidates: [], interests: [] };
    const auths = r.authorizations as { orgId: string; at: string }[];
    let candidates: { orgId: string; name: string; city: string | null; covers: string[] }[] = [];
    if (r.status === 'searching') {
      const rows = await this.db.select({ o: organizations, pp: partnerProfiles }).from(organizations).innerJoin(partnerProfiles, eq(partnerProfiles.organizationId, organizations.id)).where(and(eq(organizations.verificationStatus, 'verified'), sql`${organizations.id} not in (${sql.join(parties.map((x) => sql`${x}`), sql`, `)})`)).limit(300);
      candidates = rows.map(({ o, pp }) => ({ orgId: o.id, name: o.displayName, city: o.city, covers: gapsCovered({ partnerTypes: o.partnerTypes, skills: pp.skills, services: pp.services }, r.gaps as RescueGap[]).map((g) => RESCUE_GAPS[g].label) })).filter((c) => c.covers.length).sort((a, b) => b.covers.length - a.covers.length).slice(0, 20);
    }
    const ints = await this.db.select({ i: oneInterests, n: organizations.displayName }).from(oneInterests).innerJoin(organizations, eq(organizations.id, oneInterests.orgId)).where(and(eq(oneInterests.kind, 'rescue'), eq(oneInterests.sourceId, r.id)));
    return { ...base, rescue: { id: r.id, status: r.status, gaps: (r.gaps as RescueGap[]).map((g) => RESCUE_GAPS[g].label), note: r.note, authorized: parties.map((o) => ({ orgId: o, name: names.find((x) => x.id === o)?.n, at: auths.find((a) => a.orgId === o)?.at ?? null })), canAuthorize: parties.some((o) => manager(ctx, o) && !auths.some((a) => a.orgId === o)) },
      candidates, interests: ints.map((x) => ({ org: x.n, items: x.i.items, note: x.i.note, at: x.i.createdAt })) };
  }

  @Post('rescue/:rid/invite/:orgId')
  @HttpCode(200)
  async invite(@Ctx() ctx: RequestContext, @Param('rid', ParseUUIDPipe) rid: string, @Param('orgId', ParseUUIDPipe) orgId: string) {
    const [r] = await this.db.select().from(rescueRequests).where(eq(rescueRequests.id, rid));
    if (!r) throw new NotFoundException('Rescue not found');
    const { p, parties } = await this.projectParties(r.projectId);
    if (!parties.some((o) => manager(ctx, o))) throw new ForbiddenException('Only the project parties invite');
    if (r.status !== 'searching') throw new ConflictException('Every original party must authorise the search first');
    await this.notify([orgId], `Can you help on ${p.code}?`, `The project team needs: ${(r.gaps as RescueGap[]).map((g) => RESCUE_GAPS[g].label).join(', ')}.`, `/rescue/${rid}`);
    await this.audit.record(ctx, { action: 'one.rescue_invited', objectType: 'project', objectId: p.id, after: { rescue: rid, orgId } });
    return { ok: true };
  }

  @Get('rescue/:rid')
  async rescuePublic(@Ctx() ctx: RequestContext, @Param('rid', ParseUUIDPipe) rid: string) {
    const [r] = await this.db.select().from(rescueRequests).where(eq(rescueRequests.id, rid));
    if (!r || r.status !== 'searching') throw new NotFoundException('Not open');
    const { p } = await this.projectParties(r.projectId);
    const [mine] = ctx.orgId ? await this.db.select().from(oneInterests).where(and(eq(oneInterests.kind, 'rescue'), eq(oneInterests.sourceId, rid), eq(oneInterests.orgId, ctx.orgId))) : [];
    return { id: r.id, project: `${p.code} — ${p.title}`, region: p.region, gaps: (r.gaps as RescueGap[]).map((g) => ({ key: g, label: RESCUE_GAPS[g].label })), note: r.note, myInterest: mine ? { items: mine.items, note: mine.note } : null };
  }

  @Post('rescue/:rid/interest')
  @HttpCode(201)
  async rescueInterest(@Ctx() ctx: RequestContext, @Param('rid', ParseUUIDPipe) rid: string, @Body(body(InterestSchema)) b: z.infer<typeof InterestSchema>) {
    const [r] = await this.db.select().from(rescueRequests).where(eq(rescueRequests.id, rid));
    if (!r || r.status !== 'searching') throw new NotFoundException('Not open');
    const { parties } = await this.projectParties(r.projectId);
    if (!ctx.orgId || parties.includes(ctx.orgId)) throw new ForbiddenException('Only other companies express interest');
    if (b.items.some((i) => !(r.gaps as string[]).includes(i))) throw new BadRequestException('Choose from the gaps listed');
    await this.db.insert(oneInterests).values({ kind: 'rescue', sourceId: rid, orgId: ctx.orgId, items: b.items, note: b.note, createdBy: ctx.userId }).onConflictDoUpdate({ target: [oneInterests.kind, oneInterests.sourceId, oneInterests.orgId], set: { items: b.items, note: b.note } });
    await this.notify(parties, 'A partner offered to help', `Interest in: ${b.items.map((g) => RESCUE_GAPS[g as RescueGap]?.label ?? g).join(', ')}`, `/projects/${r.projectId}/rescue`);
    return { ok: true };
  }

  // ================= 48-hour team challenge =================
  private async oppOwner(ctx: RequestContext, oid: string) {
    const [o] = await this.db.select().from(opportunities).where(eq(opportunities.id, oid));
    if (!o) throw new NotFoundException('Opportunity not found');
    const [claim] = await this.db.select({ by: leadClaims.introducerOrgId }).from(leadClaims).where(eq(leadClaims.opportunityId, oid)).limit(1);
    const owners = [o.ownerOrgId, claim?.by].filter((x): x is string => !!x);
    return { o, owners, isOwner: owners.some((x) => manager(ctx, x)) || platform(ctx) };
  }

  @Post('opportunities/:id/challenge')
  @HttpCode(201)
  async startChallenge(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ChallengeCreateSchema)) b: z.infer<typeof ChallengeCreateSchema>) {
    const { o, owners, isOwner } = await this.oppOwner(ctx, id);
    if (!isOwner) throw new ForbiddenException('The opportunity owner or introducer starts a team challenge');
    if ((await this.db.select({ id: teamChallenges.id }).from(teamChallenges).where(and(eq(teamChallenges.opportunityId, id), eq(teamChallenges.status, 'open'), sql`${teamChallenges.deadline} > now()`))).length) throw new ConflictException('A challenge is already running');
    const [c] = await this.db.insert(teamChallenges).values({ opportunityId: id, roles: [...new Set(b.roles)], deadline: new Date(Date.now() + CHALLENGE_HOURS * 3600_000), createdByOrgId: owners.find((x) => manager(ctx, x)) ?? o.ownerOrgId, createdBy: ctx.userId }).returning();
    const qualified = await this.db.select({ id: organizations.id }).from(organizations).innerJoin(partnerProfiles, eq(partnerProfiles.organizationId, organizations.id)).where(and(eq(organizations.verificationStatus, 'verified'), sql`${o.sector} = any(${partnerProfiles.sectors})`, sql`${organizations.id} not in (${sql.join(owners.map((x) => sql`${x}`), sql`, `)})`)).limit(200);
    await this.notify(qualified.map((q) => q.id), `48-hour team challenge: ${o.title}`, `Roles needed: ${c.roles.join(', ')}.`, `/challenges/${c.id}`);
    await this.audit.record(ctx, { action: 'one.challenge_started', objectType: 'opportunity', objectId: id, after: { roles: c.roles, invited: qualified.length } });
    return { ...c, invited: qualified.length };
  }

  @Get('challenges/:cid')
  async challenge(@Ctx() ctx: RequestContext, @Param('cid', ParseUUIDPipe) cid: string) {
    const [c] = await this.db.select().from(teamChallenges).where(eq(teamChallenges.id, cid));
    if (!c) throw new NotFoundException('Challenge not found');
    const { o, owners, isOwner } = await this.oppOwner(ctx, c.opportunityId);
    const ints = await this.db.select({ i: oneInterests, org: organizations }).from(oneInterests).innerJoin(organizations, eq(organizations.id, oneInterests.orgId)).where(and(eq(oneInterests.kind, 'challenge'), eq(oneInterests.sourceId, cid)));
    const open = c.status === 'open' && c.deadline > new Date();
    const mine = ctx.orgId ? ints.find((x) => x.i.orgId === ctx.orgId) : undefined;
    return {
      id: c.id, opportunity: { id: o.id, title: o.title, sector: sectorName(o.sector), city: o.city }, roles: c.roles, deadline: c.deadline, open, isOwner,
      coverage: challengeCoverage(c.roles, ints.map((x) => ({ org: x.org.displayName, roles: x.i.items, verified: x.org.verificationStatus === 'verified' }))),
      interests: isOwner ? ints.map((x) => ({ org: x.org.displayName, orgId: x.org.id, roles: x.i.items, note: x.i.note, verified: x.org.verificationStatus === 'verified' })) : [],
      myInterest: mine ? { roles: mine.i.items, note: mine.i.note } : null, canJoin: open && !!ctx.orgId && !owners.includes(ctx.orgId),
      note: 'The 48-hour deadline is a coordination target, not a guarantee of award or a commitment by anyone.',
    };
  }

  @Post('challenges/:cid/interest')
  @HttpCode(201)
  async join(@Ctx() ctx: RequestContext, @Param('cid', ParseUUIDPipe) cid: string, @Body(body(InterestSchema)) b: z.infer<typeof InterestSchema>) {
    const [c] = await this.db.select().from(teamChallenges).where(eq(teamChallenges.id, cid));
    if (!c) throw new NotFoundException('Challenge not found');
    if (!(c.status === 'open' && c.deadline > new Date())) throw new ConflictException('This challenge has closed');
    const { owners } = await this.oppOwner(ctx, c.opportunityId);
    if (!ctx.orgId || owners.includes(ctx.orgId)) throw new ForbiddenException('Only other companies take part');
    if (b.items.some((r) => !c.roles.includes(r))) throw new BadRequestException('Choose from the roles listed');
    await this.db.insert(oneInterests).values({ kind: 'challenge', sourceId: cid, orgId: ctx.orgId, items: b.items, note: b.note, createdBy: ctx.userId }).onConflictDoUpdate({ target: [oneInterests.kind, oneInterests.sourceId, oneInterests.orgId], set: { items: b.items, note: b.note } });
    return { ok: true };
  }

  // ================= Revival =================
  @Get('revival')
  async revivable(@Ctx() ctx: RequestContext) {
    if (!ctx.orgId) return { items: [] };
    const mineClaims = await this.db.select({ o: leadClaims.opportunityId }).from(leadClaims).where(eq(leadClaims.introducerOrgId, ctx.orgId));
    const ids = mineClaims.map((x) => x.o);
    const opps = await this.db.select().from(opportunities).where(and(or(eq(opportunities.ownerOrgId, ctx.orgId), ids.length ? inArray(opportunities.id, ids) : undefined), or(inArray(opportunities.status, ['lost', 'closed', 'released']), sql`${opportunities.deadline} < now()`))).orderBy(desc(opportunities.updatedAt)).limit(50);
    const reqs = opps.length ? await this.db.select().from(revivalRequests).where(inArray(revivalRequests.opportunityId, opps.map((o) => o.id))) : [];
    return { items: opps.map((o) => ({ id: o.id, code: o.code, title: o.title, status: o.status, sector: sectorName(o.sector), value: o.estimatedValue, deadline: o.deadline, owner: o.ownerOrgId === ctx.orgId, request: reqs.filter((r) => r.opportunityId === o.id).map((r) => ({ id: r.id, status: r.status, reason: r.reason, decisionNote: r.decisionNote })).at(-1) ?? null, suggestions: revivalSuggestions(o) })) };
  }

  @Post('opportunities/:id/revival')
  @HttpCode(201)
  async askRevival(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(RevivalRequestSchema)) b: z.infer<typeof RevivalRequestSchema>) {
    const { o, owners } = await this.oppOwner(ctx, id);
    const mine = owners.find((x) => manager(ctx, x));
    if (!mine) throw new ForbiddenException('The opportunity owner or introducer asks to revive it');
    if ((await this.db.select({ id: revivalRequests.id }).from(revivalRequests).where(and(eq(revivalRequests.opportunityId, id), eq(revivalRequests.status, 'requested')))).length) throw new ConflictException('A revival request is already waiting');
    const isOwner = mine === o.ownerOrgId;
    const [r] = await this.db.insert(revivalRequests).values({ opportunityId: id, requestedByOrgId: mine, requestedBy: ctx.userId, reason: b.reason, status: isOwner ? 'approved' : 'requested', ...(isOwner ? { decidedBy: ctx.userId, decidedAt: new Date(), decisionNote: 'Owner revived its own opportunity' } : {}) }).returning();
    if (!isOwner) await this.notify([o.ownerOrgId], `Permission asked to revive: ${o.title}`, b.reason.slice(0, 200), '/one/revival');
    await this.audit.record(ctx, { action: 'one.revival_requested', objectType: 'opportunity', objectId: id, after: { status: r.status } });
    return r;
  }

  @Post('revival/:rid/decide')
  @HttpCode(200)
  async decideRevival(@Ctx() ctx: RequestContext, @Param('rid', ParseUUIDPipe) rid: string, @Body(body(RevivalDecisionSchema)) b: z.infer<typeof RevivalDecisionSchema>) {
    const [r] = await this.db.select().from(revivalRequests).where(eq(revivalRequests.id, rid));
    if (!r) throw new NotFoundException('Request not found');
    const [o] = await this.db.select().from(opportunities).where(eq(opportunities.id, r.opportunityId));
    if (!manager(ctx, o.ownerOrgId) && !platform(ctx)) throw new ForbiddenException('Only the opportunity owner decides');
    if (r.status !== 'requested') throw new ConflictException('Already decided');
    await this.db.update(revivalRequests).set({ status: b.decision, decisionNote: b.note ?? null, decidedBy: ctx.userId, decidedAt: new Date() }).where(eq(revivalRequests.id, rid));
    await this.notify([r.requestedByOrgId], b.decision === 'approved' ? `You may revive: ${o.title}` : `Revival declined: ${o.title}`, b.note ?? '', '/one/revival');
    await this.audit.record(ctx, { action: `one.revival_${b.decision}`, objectType: 'opportunity', objectId: o.id, after: b });
    return { status: b.decision };
  }
}
