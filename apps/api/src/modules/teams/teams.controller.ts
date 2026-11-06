import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  assertTransition, MatchRequestSchema, NdaSignSchema, ProposalDecisionSchema, rankPartners, SharingProposalSchema, TeamCreateSchema, TeamInviteSchema, TeamMachine,
  TeamMemberMachine, TeamPostSchema, TeamRespondSchema, TeamRoleSchema, type TeamMemberState, type TeamState,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { collaborationTeams, memberships, notifications, opportunities, organizations, partnerProfiles, teamMembers, teamPosts, teamProposals, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireCaps, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomDigits, sha256 } from '../../common/crypto';
import { OpportunitiesModule } from '../opportunities/opportunities.controller';
import { OpportunitiesService } from '../opportunities/opportunities.service';

type Team = typeof collaborationTeams.$inferSelect;
type Member = typeof teamMembers.$inferSelect;
const ACTIVE_MEMBER = ['invited', 'accepted', 'nda_signed'];

function ndaText(t: { name: string; purpose: string }, lead: string) {
  return `MUTUAL NON-DISCLOSURE UNDERTAKING — DRAFT PENDING LEGAL REVIEW (Master Book §7.2)\n\nTeam: ${t.name}\nLead organization: ${lead}\nPurpose: ${t.purpose}\n\n1. Recipient scope: confidential information is shared only with the named team members and only for the purpose above.\n2. Use restriction: no use for any other opportunity, and no approach to the buyer outside the team without written consent.\n3. Retention: return or destroy confidential information within 30 days of leaving the team or the team dissolving.\n4. Survival: obligations survive for 3 years after the last disclosure.\n5. Client ownership and lead protection remain as registered on COLLABIZ.`;
}

@Injectable()
export class TeamsService {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  async load(id: string) {
    const [t] = await this.db.select().from(collaborationTeams).where(eq(collaborationTeams.id, id)).limit(1);
    if (!t) throw new NotFoundException('Team not found');
    return t;
  }
  async members(teamId: string) {
    return this.db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
  }
  /** Access level for the caller: 'full' (NDA signed or lead), 'invitee' (teaser + NDA), or none (404). */
  async access(ctx: RequestContext, t: Team) {
    const ms = await this.members(t.id);
    const mine = ms.find((m) => m.organizationId === ctx.orgId);
    if (t.leadOrgId === ctx.orgId) return { level: 'full' as const, me: mine ?? null, lead: true, members: ms };
    if (!mine || mine.status === 'revoked' || mine.status === 'declined') throw new NotFoundException('Team not found');
    return { level: mine.status === 'nda_signed' ? ('full' as const) : ('invitee' as const), me: mine, lead: false, members: ms };
  }
  assertLead(ctx: RequestContext, t: Team) {
    if (t.leadOrgId !== ctx.orgId || !(ctx.orgRoles.includes('org_owner') || ctx.orgRoles.includes('org_admin'))) throw new ForbiddenException('Only the lead organization’s owner or admin can do this');
  }
  async setTeam(ctx: RequestContext, t: Team, to: TeamState, reason: string, extra: Partial<Team> = {}) {
    if (t.status === to) return t;
    assertTransition(TeamMachine, t.status as TeamState, to);
    const [u] = await this.db.update(collaborationTeams).set({ ...extra, status: to, version: t.version + 1, updatedAt: new Date() }).where(and(eq(collaborationTeams.id, t.id), eq(collaborationTeams.version, t.version))).returning();
    if (!u) throw new ConflictException('The team was changed concurrently. Reload and try again.');
    await this.audit.record(ctx, { action: `team.${to}`, objectType: 'team', objectId: t.id, reason, before: { status: t.status }, after: { status: to } });
    return u;
  }
  async setMember(ctx: RequestContext, m: Member, to: TeamMemberState, extra: Partial<Member> = {}) {
    assertTransition(TeamMemberMachine, m.status as TeamMemberState, to);
    await this.db.update(teamMembers).set({ ...extra, status: to }).where(eq(teamMembers.id, m.id));
    await this.audit.record(ctx, { action: `team.member_${to}`, objectType: 'team', objectId: m.teamId, before: { status: m.status }, after: { status: to, organizationId: m.organizationId } });
  }
  async notifyOrg(orgId: string, title: string, body: string, link: string) {
    const ms = await this.db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    for (const m of ms) await this.db.insert(notifications).values({ userId: m.userId, kind: 'team', title, body, link });
  }
}

/** Screens 055, 056, 057 — partner discovery (public profile fields only; never contacts or bank data). */
@ApiTags('partners')
@Controller('partners')
export class PartnersController {
  constructor(@InjectDb() private db: Db, private opps: OpportunitiesService) {}

  @Get()
  async directory(@Ctx() ctx: RequestContext, @Query('q') q?: string, @Query('sector') sector?: string, @Query('region') region?: string, @Query('type') type?: string) {
    const rows = await this.db.select({ o: organizations, p: partnerProfiles }).from(organizations).innerJoin(partnerProfiles, eq(partnerProfiles.organizationId, organizations.id))
      .where(and(eq(organizations.verificationStatus, 'verified'), inArray(organizations.type, ['partner_company', 'partner_individual']),
        q ? or(ilike(organizations.displayName, `%${q}%`), ilike(partnerProfiles.headline, `%${q}%`), sql`${q} ilike any(${partnerProfiles.skills})`) : undefined,
        sector ? sql`${sector} = any(${partnerProfiles.sectors})` : undefined, region ? sql`${region} = any(${partnerProfiles.regions})` : undefined,
        type ? sql`${type} = any(${organizations.partnerTypes})` : undefined)).orderBy(organizations.displayName).limit(100);
    return rows.map((r) => this.publicProfile(r.o, r.p, ctx));
  }

  @Get(':id')
  async profile(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [r] = await this.db.select({ o: organizations, p: partnerProfiles }).from(organizations).innerJoin(partnerProfiles, eq(partnerProfiles.organizationId, organizations.id))
      .where(and(eq(organizations.id, id), eq(organizations.verificationStatus, 'verified'))).limit(1);
    if (!r) throw new NotFoundException('Partner not found');
    return { ...this.publicProfile(r.o, r.p, ctx), about: r.p.about, services: r.p.services, pastProjects: r.p.pastProjects };
  }

  private publicProfile(o: typeof organizations.$inferSelect, p: typeof partnerProfiles.$inferSelect, ctx: RequestContext) {
    return { id: o.id, name: o.displayName, type: o.type, partnerTypes: o.partnerTypes, city: o.city, country: o.country, level: o.membershipLevel, headline: p.headline, sectors: p.sectors, regions: p.regions, certifications: p.certifications, skills: p.skills, capacityMax: p.capacityMax, isMe: o.id === ctx.orgId };
  }

  /** 057 / 161 — explainable partner match suggestions. Only verified partners who consented to matching are ranked. */
  @Post('match')
  @RequireOrg()
  @HttpCode(200)
  async match(@Ctx() ctx: RequestContext, @Body(body(MatchRequestSchema)) b: z.infer<typeof MatchRequestSchema>) {
    let target: { category: string; region?: string; value?: number; requiredCertifications: string[] } = { category: b.sector, region: b.region, value: b.value, requiredCertifications: b.requiredCertifications };
    if (b.opportunityId) {
      const { row } = await this.opps.getVisible(ctx, b.opportunityId);
      target = { category: row.sector, region: row.region ?? undefined, value: row.estimatedValue ?? undefined, requiredCertifications: row.requiredCertifications };
    }
    const rows = await this.db.select({ o: organizations, p: partnerProfiles }).from(organizations).innerJoin(partnerProfiles, eq(partnerProfiles.organizationId, organizations.id))
      .where(and(eq(organizations.verificationStatus, 'verified'), ne(organizations.id, ctx.orgId!)));
    const suggestions = rankPartners(rows.map((r) => ({ id: r.o.id, name: r.o.displayName, sectors: r.p.sectors, regions: r.p.regions, capacityMax: r.p.capacityMax, certifications: r.p.certifications, reputationScore: null, verified: true, consentToMatch: r.p.consentToMatch })), target, 10);
    return { target, suggestions, excludedForConsent: rows.filter((r) => !r.p.consentToMatch).length };
  }
}

/** Screens 058–064, 124, 154–156 — teams & consortiums. */
@ApiTags('teams')
@Controller('teams')
@RequireOrg()
export class TeamsController {
  constructor(@InjectDb() private db: Db, private svc: TeamsService, private audit: AuditService, private opps: OpportunitiesService) {}

  @Get()
  async mine(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ t: collaborationTeams, m: teamMembers, lead: organizations.displayName }).from(teamMembers).innerJoin(collaborationTeams, eq(collaborationTeams.id, teamMembers.teamId)).innerJoin(organizations, eq(organizations.id, collaborationTeams.leadOrgId))
      .where(and(eq(teamMembers.organizationId, ctx.orgId!), inArray(teamMembers.status, ACTIVE_MEMBER))).orderBy(desc(collaborationTeams.createdAt));
    return rows.map((r) => ({ id: r.t.id, code: r.t.code, name: r.t.name, kind: r.t.kind, status: r.t.status, lead: r.lead, isLead: r.t.leadOrgId === ctx.orgId, myRole: r.m.role, myStatus: r.m.status }));
  }

  /** 154 — create a collaboration team (or 124 consortium). The lead organization joins as a member with a signed NDA. */
  @Post()
  @RequireCaps('team.manage')
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(TeamCreateSchema)) b: z.infer<typeof TeamCreateSchema>) {
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Only verified partners can form teams');
    if (b.opportunityId) await this.opps.getVisible(ctx, b.opportunityId);
    const [lead] = await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId!)).limit(1);
    const text = ndaText(b, lead.displayName);
    const t = await this.db.transaction(async (tx) => {
      const [t] = await tx.insert(collaborationTeams).values({ code: `TM-${randomDigits(6)}`, name: b.name, purpose: b.purpose, kind: b.kind, opportunityId: b.opportunityId, leadOrgId: ctx.orgId!, ndaText: text, ndaHash: sha256(text), createdBy: ctx.userId }).returning();
      const [u] = await tx.select().from(users).where(eq(users.id, ctx.userId));
      await tx.insert(teamMembers).values({ teamId: t.id, organizationId: ctx.orgId!, role: b.leadRole, responsibilities: 'Team lead: coordination, buyer relationship and approvals', status: 'nda_signed', invitedBy: ctx.userId, respondedAt: new Date(), ndaSignedAt: new Date(), ndaSignedBy: ctx.userId, ndaTypedName: u.fullName });
      await this.audit.record(ctx, { action: b.kind === 'consortium' ? 'consortium.created' : 'team.created', objectType: 'team', objectId: t.id, after: { name: b.name, kind: b.kind, ndaHash: t.ndaHash } }, tx as unknown as Db);
      return t;
    });
    return t;
  }

  /** Full detail for NDA-signed members; invitees get a teaser + NDA only (no private disclosure without permission). */
  @Get(':id')
  async detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    const a = await this.svc.access(ctx, t);
    const orgs = await this.db.select({ id: organizations.id, name: organizations.displayName, level: organizations.membershipLevel }).from(organizations).where(inArray(organizations.id, a.members.map((m) => m.organizationId)));
    const name = (x: string) => orgs.find((o) => o.id === x)?.name ?? '—';
    const base = { id: t.id, code: t.code, name: t.name, kind: t.kind, status: t.status, lead: name(t.leadOrgId), isLead: a.lead, myMembership: a.me, access: a.level, ndaHash: t.ndaHash };
    if (a.level === 'invitee') return { ...base, purpose: t.purpose, ndaText: t.ndaText, members: a.members.filter((m) => ACTIVE_MEMBER.includes(m.status)).map((m) => ({ organization: name(m.organizationId), role: m.role })) };
    const [opp] = t.opportunityId ? await this.db.select().from(opportunities).where(eq(opportunities.id, t.opportunityId)).limit(1) : [];
    const proposals = await this.db.select().from(teamProposals).where(eq(teamProposals.teamId, id)).orderBy(desc(teamProposals.version));
    return {
      ...base, purpose: t.purpose, ndaText: t.ndaText, activatedAt: t.activatedAt, version: t.version,
      opportunity: opp ? { id: opp.id, code: opp.code, title: opp.title, summary: opp.summary, estimatedValue: opp.estimatedValue, status: opp.status } : null,
      members: a.members.map((m) => ({ ...m, organization: name(m.organizationId), level: orgs.find((o) => o.id === m.organizationId)?.level })),
      proposals: proposals.map((p) => ({ ...p, shares: (p.shares as { organizationId: string; sharePct: number }[]).map((s) => ({ ...s, organization: name(s.organizationId) })) })),
    };
  }

  /** 058 — invite a verified partner (status forming → nda_pending). */
  @Post(':id/invitations')
  @RequireCaps('team.manage')
  @HttpCode(201)
  async invite(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(TeamInviteSchema)) b: z.infer<typeof TeamInviteSchema>) {
    const t = await this.svc.load(id);
    this.svc.assertLead(ctx, t);
    if (['active', 'dissolved'].includes(t.status) && t.kind !== 'consortium') throw new BadRequestException('Members cannot be added after activation; create a new team version');
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, b.organizationId)).limit(1);
    if (!org || org.verificationStatus !== 'verified' || !['partner_company', 'partner_individual'].includes(org.type)) throw new BadRequestException('Only verified partners can be invited');
    const existing = (await this.svc.members(id)).find((m) => m.organizationId === b.organizationId);
    let m: Member;
    if (existing && ACTIVE_MEMBER.includes(existing.status)) throw new ConflictException('This partner is already invited or a member');
    if (existing) {
      [m] = await this.db.update(teamMembers).set({ status: 'invited', role: b.role, responsibilities: b.responsibilities, inviteMessage: b.message, invitedBy: ctx.userId, respondedAt: null, ndaSignedAt: null, ndaSignedBy: null, ndaTypedName: null, revokedReason: null, matchScore: b.matchScore }).where(eq(teamMembers.id, existing.id)).returning();
    } else {
      [m] = await this.db.insert(teamMembers).values({ teamId: id, organizationId: b.organizationId, role: b.role, responsibilities: b.responsibilities, inviteMessage: b.message, invitedBy: ctx.userId, matchScore: b.matchScore }).returning();
    }
    if (t.status === 'forming') await this.svc.setTeam(ctx, t, 'nda_pending', 'First invitation sent');
    await this.svc.notifyOrg(b.organizationId, `Collaboration invitation: ${t.name}`, `${b.role} — ${b.responsibilities}`, '/collaboration/requests');
    await this.audit.record(ctx, { action: 'team.invited', objectType: 'team', objectId: id, after: { organizationId: b.organizationId, role: b.role } });
    return m;
  }

  /** 059 — incoming requests are listed via GET /collaboration/requests; respond here. */
  @Post(':id/respond')
  @HttpCode(200)
  async respond(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(TeamRespondSchema)) b: z.infer<typeof TeamRespondSchema>) {
    if (!ctx.orgRoles.includes('org_owner') && !ctx.orgRoles.includes('org_admin')) throw new ForbiddenException('Only your organization owner or admin can respond');
    const t = await this.svc.load(id);
    const { me } = await this.svc.access(ctx, t);
    if (!me || me.status !== 'invited') throw new BadRequestException('No pending invitation');
    await this.svc.setMember(ctx, me, b.decision === 'accept' ? 'accepted' : 'declined', { respondedAt: new Date() });
    await this.svc.notifyOrg(t.leadOrgId, `Invitation ${b.decision}ed`, t.name, `/teams/${id}/members`);
    return { status: b.decision === 'accept' ? 'accepted' : 'declined' };
  }

  /** 062 — sign the team NDA (typed-name evidence bound to the NDA hash). Unlocks workspace access. */
  @Post(':id/nda/sign')
  @HttpCode(200)
  async sign(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(NdaSignSchema)) b: z.infer<typeof NdaSignSchema>) {
    const t = await this.svc.load(id);
    const { me } = await this.svc.access(ctx, t);
    if (!me || me.status !== 'accepted') throw new BadRequestException('Accept the invitation before signing the NDA');
    const [u] = await this.db.select().from(users).where(eq(users.id, ctx.userId));
    if (u.fullName.trim().toLowerCase() !== b.typedName.trim().toLowerCase()) throw new BadRequestException({ statusCode: 400, message: 'Type your full name exactly as registered', issues: [{ path: 'typedName', message: `Type "${u.fullName}"` }] });
    await this.svc.setMember(ctx, me, 'nda_signed', { ndaSignedAt: new Date(), ndaSignedBy: ctx.userId, ndaTypedName: b.typedName });
    await this.audit.record(ctx, { action: 'team.nda_signed', objectType: 'team', objectId: id, after: { ndaHash: t.ndaHash, typedName: b.typedName } });
    return { status: 'nda_signed', ndaHash: t.ndaHash };
  }

  /** 061 — roles & responsibilities. */
  @Patch(':id/members/:memberId')
  @RequireCaps('team.manage')
  async role(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('memberId', ParseUUIDPipe) memberId: string, @Body(body(TeamRoleSchema)) b: z.infer<typeof TeamRoleSchema>) {
    const t = await this.svc.load(id);
    this.svc.assertLead(ctx, t);
    const [m] = await this.db.select().from(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, id))).limit(1);
    if (!m) throw new NotFoundException();
    const [u] = await this.db.update(teamMembers).set({ role: b.role, responsibilities: b.responsibilities }).where(eq(teamMembers.id, memberId)).returning();
    await this.audit.record(ctx, { action: 'team.role_changed', objectType: 'team', objectId: id, before: { role: m.role, responsibilities: m.responsibilities }, after: b });
    return u;
  }

  /** Revoke a member: access ends immediately. */
  @Post(':id/members/:memberId/revoke')
  @RequireCaps('team.manage')
  @HttpCode(200)
  async revoke(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('memberId', ParseUUIDPipe) memberId: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(1000) }))) b: { reason: string }) {
    const t = await this.svc.load(id);
    this.svc.assertLead(ctx, t);
    const [m] = await this.db.select().from(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, id))).limit(1);
    if (!m) throw new NotFoundException();
    if (m.organizationId === t.leadOrgId) throw new BadRequestException('The lead organization cannot be revoked; dissolve the team instead');
    await this.svc.setMember(ctx, m, 'revoked', { revokedReason: b.reason });
    await this.svc.notifyOrg(m.organizationId, `Removed from team ${t.name}`, b.reason, '/collaboration/requests');
    return { status: 'revoked' };
  }

  /** 063 — commercial sharing proposal; all NDA-signed members must approve. */
  @Post(':id/proposals')
  @RequireCaps('team.manage')
  @HttpCode(201)
  async propose(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(SharingProposalSchema)) b: z.infer<typeof SharingProposalSchema>) {
    let t = await this.svc.load(id);
    this.svc.assertLead(ctx, t);
    const ms = (await this.svc.members(id)).filter((m) => ACTIVE_MEMBER.includes(m.status));
    const pending = ms.filter((m) => m.status !== 'nda_signed');
    if (pending.length) throw new BadRequestException(`All members must sign the NDA first (${pending.length} pending)`);
    const ids = new Set(ms.map((m) => m.organizationId));
    if (b.shares.length !== ids.size || b.shares.some((s) => !ids.has(s.organizationId))) throw new BadRequestException('Include exactly one share for every current team member');
    const [{ v }] = await this.db.select({ v: sql<number>`coalesce(max(${teamProposals.version}), 0)::int` }).from(teamProposals).where(eq(teamProposals.teamId, id));
    await this.db.update(teamProposals).set({ status: 'superseded' }).where(and(eq(teamProposals.teamId, id), eq(teamProposals.status, 'submitted')));
    const roles = Object.fromEntries(ms.map((m) => [m.organizationId, m.role]));
    const [p] = await this.db.insert(teamProposals).values({ teamId: id, version: v + 1, shares: b.shares.map((s) => ({ ...s, role: roles[s.organizationId] })), terms: b.terms, createdBy: ctx.userId,
      approvals: [{ organizationId: ctx.orgId, userId: ctx.userId, decision: 'approve', comment: 'Proposed by lead', at: new Date().toISOString() }] }).returning();
    if (t.status === 'nda_pending') t = await this.svc.setTeam(ctx, t, 'proposal', `Sharing proposal v${p.version} submitted`);
    else if (t.status === 'approval_pending') t = await this.svc.setTeam(ctx, t, 'proposal', `Revised proposal v${p.version}`);
    for (const m of ms) if (m.organizationId !== ctx.orgId) await this.svc.notifyOrg(m.organizationId, `Review commercial sharing proposal v${p.version}`, t.name, `/teams/${id}/sharing`);
    await this.audit.record(ctx, { action: 'team.proposal_submitted', objectType: 'team', objectId: id, after: { version: p.version, shares: b.shares } });
    return p;
  }

  @Post(':id/proposals/:pid/decision')
  @HttpCode(200)
  async decide(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string, @Body(body(ProposalDecisionSchema)) b: z.infer<typeof ProposalDecisionSchema>) {
    let t = await this.svc.load(id);
    const a = await this.svc.access(ctx, t);
    if (a.level !== 'full') throw new ForbiddenException('Sign the NDA first');
    if (!ctx.orgRoles.includes('org_owner') && !ctx.orgRoles.includes('org_admin')) throw new ForbiddenException('Only your organization owner or admin can approve commercial terms');
    const [p] = await this.db.select().from(teamProposals).where(and(eq(teamProposals.id, pid), eq(teamProposals.teamId, id))).limit(1);
    if (!p || p.status !== 'submitted') throw new BadRequestException('This proposal is not open for decisions');
    const approvals = (p.approvals as { organizationId: string; decision: string }[]).filter((x) => x.organizationId !== ctx.orgId);
    approvals.push({ organizationId: ctx.orgId!, userId: ctx.userId, decision: b.decision, comment: b.comment, at: new Date().toISOString() } as never);
    const shares = p.shares as { organizationId: string }[];
    const allApproved = shares.every((s) => approvals.some((x) => x.organizationId === s.organizationId && x.decision === 'approve'));
    const status = b.decision === 'reject' ? 'rejected' : allApproved ? 'approved' : 'submitted';
    await this.db.update(teamProposals).set({ approvals, status }).where(eq(teamProposals.id, pid));
    if (status === 'approved' && t.status === 'proposal') t = await this.svc.setTeam(ctx, t, 'approval_pending', `Proposal v${p.version} approved by all members`);
    await this.svc.notifyOrg(t.leadOrgId, `Proposal v${p.version}: ${b.decision} by a member`, b.comment ?? '', `/teams/${id}/sharing`);
    await this.audit.record(ctx, { action: `team.proposal_${b.decision}`, objectType: 'team', objectId: id, reason: b.comment, after: { version: p.version, status } });
    return { status, teamStatus: t.status };
  }

  /** 064 — activation requires every member's signed NDA and an approved sharing proposal. */
  @Post(':id/activate')
  @RequireCaps('team.manage')
  @HttpCode(200)
  async activate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    this.svc.assertLead(ctx, t);
    const ms = (await this.svc.members(id)).filter((m) => ACTIVE_MEMBER.includes(m.status));
    const [p] = await this.db.select().from(teamProposals).where(and(eq(teamProposals.teamId, id), eq(teamProposals.status, 'approved'))).orderBy(desc(teamProposals.version)).limit(1);
    const problems = [
      ...(ms.length < 2 ? ['A team needs at least two organizations'] : []),
      ...ms.filter((m) => m.status !== 'nda_signed').map(() => 'A member has not signed the NDA'),
      ...(!p ? ['No approved commercial sharing proposal'] : []),
    ];
    if (problems.length) throw new BadRequestException({ statusCode: 400, message: 'Team cannot be activated yet', issues: [...new Set(problems)].map((m) => ({ path: 'activation', message: m })) });
    const u = await this.svc.setTeam(ctx, t, 'active', 'All members signed and approved', { activatedAt: new Date() });
    for (const m of ms) if (m.organizationId !== ctx.orgId) await this.svc.notifyOrg(m.organizationId, `Team activated: ${t.name}`, 'Collaboration is live', `/teams/${id}/workspace`);
    return u;
  }

  @Post(':id/dissolve')
  @RequireCaps('team.manage')
  @HttpCode(200)
  async dissolve(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(1000) }))) b: { reason: string }) {
    const t = await this.svc.load(id);
    this.svc.assertLead(ctx, t);
    return this.svc.setTeam(ctx, t, 'dissolved', b.reason);
  }

  /** 156 — joint proposal & team workspace (NDA-signed members only). */
  @Get(':id/posts')
  async posts(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.svc.load(id);
    const a = await this.svc.access(ctx, t);
    if (a.level !== 'full') throw new ForbiddenException('Sign the team NDA to access the workspace');
    return this.db.select({ p: teamPosts, author: users.fullName, org: organizations.displayName }).from(teamPosts).innerJoin(users, eq(users.id, teamPosts.authorUserId)).innerJoin(organizations, eq(organizations.id, teamPosts.authorOrgId))
      .where(eq(teamPosts.teamId, id)).orderBy(desc(teamPosts.createdAt)).then((r) => r.map((x) => ({ ...x.p, author: x.author, org: x.org })));
  }

  @Post(':id/posts')
  @HttpCode(201)
  async post(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(TeamPostSchema)) b: z.infer<typeof TeamPostSchema>) {
    const t = await this.svc.load(id);
    const a = await this.svc.access(ctx, t);
    if (a.level !== 'full') throw new ForbiddenException('Sign the team NDA to access the workspace');
    if (t.status === 'dissolved') throw new BadRequestException('This team is dissolved');
    if (b.assigneeOrgId && !a.members.some((m) => m.organizationId === b.assigneeOrgId && m.status === 'nda_signed')) throw new BadRequestException('Tasks can be assigned to signed members only');
    const [p] = await this.db.insert(teamPosts).values({ teamId: id, authorUserId: ctx.userId, authorOrgId: ctx.orgId!, ...b }).returning();
    return p;
  }

  @Patch(':id/posts/:postId')
  async updatePost(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('postId', ParseUUIDPipe) postId: string, @Body(body(z.object({ status: z.enum(['open', 'done']) }))) b: { status: string }) {
    const t = await this.svc.load(id);
    const a = await this.svc.access(ctx, t);
    if (a.level !== 'full') throw new ForbiddenException();
    const [p] = await this.db.update(teamPosts).set({ status: b.status, updatedAt: new Date() }).where(and(eq(teamPosts.id, postId), eq(teamPosts.teamId, id))).returning();
    if (!p) throw new NotFoundException();
    return p;
  }
}

/** Screen 059 — Incoming Collaboration Requests. */
@ApiTags('teams')
@Controller('collaboration')
@RequireOrg()
export class CollaborationController {
  constructor(@InjectDb() private db: Db) {}
  @Get('requests')
  async requests(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ m: teamMembers, t: collaborationTeams, lead: organizations.displayName }).from(teamMembers).innerJoin(collaborationTeams, eq(collaborationTeams.id, teamMembers.teamId)).innerJoin(organizations, eq(organizations.id, collaborationTeams.leadOrgId))
      .where(and(eq(teamMembers.organizationId, ctx.orgId!), ne(collaborationTeams.leadOrgId, ctx.orgId!))).orderBy(desc(teamMembers.createdAt));
    return rows.map((r) => ({ memberId: r.m.id, teamId: r.t.id, team: r.t.name, kind: r.t.kind, purpose: r.t.purpose, lead: r.lead, role: r.m.role, responsibilities: r.m.responsibilities, message: r.m.inviteMessage, status: r.m.status, matchScore: r.m.matchScore, invitedAt: r.m.createdAt, revokedReason: r.m.revokedReason }));
  }
}

@Module({ imports: [OpportunitiesModule], controllers: [PartnersController, TeamsController, CollaborationController], providers: [TeamsService] })
export class TeamsModule {}
