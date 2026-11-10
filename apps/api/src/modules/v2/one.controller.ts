/**
 * COLLABIZ ONE — "One opportunity. One team. One business." A guided journey for one opportunity across the six steps,
 * built only from records COLLABIZ already keeps (tested in test/xchange.e2e.ts › COLLABIZ ONE):
 *   1 Bring → 2 Analyse (team plan, gaps) → 3 Unite first review → 4 Assemble the team (NDA-signed members)
 *   → 5 Agree the commercial structure (approved sharing / commission agreement) → 6 Win, execute and settle.
 * A "virtual company" here is a collaboration workspace, never an incorporated legal entity.
 */
import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { InjectDb, type Db } from '../../db/client';
import {
  collaborationTeams, commissionAgreements, commissionEntries, dealPassports, leadClaims, milestones, opportunities, projects, routingEvents, teamMembers, teamPlans, teamProposals,
} from '../../db/schema';
import { Ctx, type RequestContext } from '../../common/context';

type Step = { key: string; title: string; status: 'done' | 'current' | 'todo'; summary: string; action?: { label: string; href: string } };
const platform = (ctx: RequestContext) => ctx.platformRoles.length > 0 && !ctx.mfaRequiredButMissing;

@ApiTags('collabiz one')
@Controller()
export class OneController {
  constructor(@InjectDb() private db: Db) {}

  /** Opportunities this company is driving: ones it owns, registered as a lead, or is building a team for. */
  private async myOpportunityIds(orgId: string) {
    const owned = await this.db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.ownerOrgId, orgId));
    const claimed = await this.db.select({ id: leadClaims.opportunityId }).from(leadClaims).where(eq(leadClaims.introducerOrgId, orgId));
    const teams = await this.db.select({ id: collaborationTeams.opportunityId }).from(teamMembers).innerJoin(collaborationTeams, eq(collaborationTeams.id, teamMembers.teamId)).where(and(eq(teamMembers.organizationId, orgId), inArray(teamMembers.status, ['accepted', 'nda_signed'])));
    const plans = await this.db.select({ id: teamPlans.sourceId }).from(teamPlans).where(and(eq(teamPlans.ownerOrgId, orgId), eq(teamPlans.sourceType, 'opportunity')));
    return [...new Set([...owned, ...claimed, ...teams, ...plans].map((x) => x.id).filter(Boolean) as string[])];
  }

  @Get('one')
  async list(@Ctx() ctx: RequestContext) {
    if (!ctx.orgId) return [];
    const ids = await this.myOpportunityIds(ctx.orgId);
    const out = [];
    for (const id of ids.slice(0, 40)) { const j = await this.journey(ctx, id, false); out.push({ id, code: j.opportunity.code, title: j.opportunity.title, value: j.opportunity.estimatedValue, done: j.steps.filter((s) => s.status === 'done').length, current: j.steps.find((s) => s.status === 'current')?.title ?? 'Settled' }); }
    return out.sort((a, b) => b.done - a.done);
  }

  @Get('one/:opportunityId')
  async get(@Ctx() ctx: RequestContext, @Param('opportunityId', ParseUUIDPipe) id: string) { return this.journey(ctx, id, true); }

  private async journey(ctx: RequestContext, id: string, check: boolean) {
    const [o] = await this.db.select().from(opportunities).where(eq(opportunities.id, id));
    if (!o) throw new NotFoundException('Opportunity not found');
    if (check && !platform(ctx) && !(ctx.orgId && (await this.myOpportunityIds(ctx.orgId)).includes(id))) throw new NotFoundException('Opportunity not found');
    const org = ctx.orgId ?? '';
    const [claim] = await this.db.select().from(leadClaims).where(and(eq(leadClaims.opportunityId, id), or(eq(leadClaims.introducerOrgId, org), eq(leadClaims.status, 'protected')))).orderBy(desc(leadClaims.createdAt)).limit(1);
    const [passport] = claim ? await this.db.select({ code: dealPassports.code }).from(dealPassports).where(eq(dealPassports.claimId, claim.id)) : [];
    const [routing] = await this.db.select().from(routingEvents).where(eq(routingEvents.opportunityId, id)).orderBy(desc(routingEvents.createdAt)).limit(1);
    const [plan] = await this.db.select().from(teamPlans).where(and(eq(teamPlans.sourceType, 'opportunity'), eq(teamPlans.sourceId, id))).orderBy(desc(teamPlans.createdAt)).limit(1);
    const [team] = await this.db.select().from(collaborationTeams).where(eq(collaborationTeams.opportunityId, id)).orderBy(desc(collaborationTeams.createdAt)).limit(1);
    const members = team ? await this.db.select({ s: teamMembers.status }).from(teamMembers).where(eq(teamMembers.teamId, team.id)) : [];
    const [proposal] = team ? await this.db.select().from(teamProposals).where(and(eq(teamProposals.teamId, team.id), eq(teamProposals.status, 'approved'))).limit(1) : [];
    const agreements = claim ? await this.db.select().from(commissionAgreements).where(eq(commissionAgreements.leadClaimId, claim.id)) : [];
    const projIds = agreements.map((a) => a.projectId).filter(Boolean) as string[];
    const projs = projIds.length ? await this.db.select().from(projects).where(inArray(projects.id, projIds)) : [];
    const ms = projIds.length ? await this.db.select({ s: milestones.status }).from(milestones).where(inArray(milestones.projectId, projIds)) : [];
    const entries = agreements.length ? await this.db.select({ s: commissionEntries.status, p: commissionEntries.payable }).from(commissionEntries).where(inArray(commissionEntries.agreementId, agreements.map((a) => a.id))) : [];
    const roles = (plan?.roles as { gaps?: string[] }[] | undefined) ?? [];
    const signed = members.filter((m) => m.s === 'nda_signed').length;

    const raw: Omit<Step, 'status'>[] & { done: boolean }[] = [
      { key: 'bring', title: 'Bring the opportunity', done: true, summary: `${o.code} — ${o.title}${claim ? ` · registered lead ${claim.certificateCode}` : ''}${passport ? ` · Deal Passport ${passport.code}` : ''}`, action: claim && passport ? { label: 'Open Deal Passport', href: `/leads/${claim.id}/passport` } : claim ? undefined : { label: 'Register as a protected lead', href: `/opportunities/${id}` } },
      { key: 'analyse', title: 'Analyse what it needs', done: !!plan, summary: plan ? `${roles.length} roles planned · ${roles.reduce((a, r) => a + (r.gaps?.length ?? 0), 0)} gaps to close` : 'Work out the roles, licences, capacity and partners needed', action: plan ? { label: 'Open team plan', href: `/ai/team-plans/${plan.id}` } : { label: 'Build team plan', href: `/ai/team-builder?opportunity=${id}` } },
      { key: 'review', title: 'Unite first review', done: !!routing?.decision || (!!claim && ['protected', 'upheld'].includes(claim.status)), summary: routing?.decision ? `Unite decided: ${routing.decision.replace(/_/g, ' ')}` : claim ? `Lead ${claim.status}` : 'Unite group companies get the first look under the Unite-first rules', action: claim ? { label: 'See review', href: `/leads/${claim.id}/review-status` } : undefined },
      { key: 'assemble', title: 'Assemble the team', done: team?.status === 'active', summary: team ? `${team.name} · ${signed} of ${members.length} members signed the NDA · ${team.status.replace(/_/g, ' ')}` : plan?.status === 'approved' ? 'Team created from the plan' : 'Invite partners for each role and approve the team', action: team ? { label: 'Open team', href: `/teams/${team.id}/members` } : plan ? { label: 'Invite partners', href: `/ai/team-plans/${plan.id}` } : undefined },
      { key: 'structure', title: 'Agree the commercial structure', done: !!proposal || agreements.length > 0, summary: proposal ? `Sharing agreed: ${(proposal.shares as { sharePct: number }[]).map((s) => `${s.sharePct}%`).join(' / ')}` : agreements.length ? `${agreements.length} commission agreement(s) signed` : 'Roles, authority and earnings shares — approved by every member', action: team ? { label: 'Sharing and terms', href: `/teams/${team.id}/workspace` } : undefined },
      { key: 'deliver', title: 'Win, execute and settle', done: projs.length > 0 && projs.every((p) => ['completed', 'closed'].includes(p.status)) && entries.length > 0 && entries.every((e) => e.s === 'settled'), summary: projs.length ? `${projs.length} project(s) · ${ms.filter((m) => ['certified', 'invoiced', 'paid'].includes(m.s)).length}/${ms.length} milestones certified · commission ${entries.filter((e) => ['earned', 'approved', 'invoiced', 'settled'].includes(e.s)).length}/${entries.length} earned` : 'Contract, execution, milestones and verified payments', action: projs[0] ? { label: 'Open project', href: `/projects/${projs[0].id}` } : undefined },
    ] as never;
    const firstOpen = (raw as unknown as { done: boolean }[]).findIndex((s) => !s.done);
    const steps: Step[] = (raw as unknown as (Step & { done: boolean })[]).map((s, i) => ({ key: s.key, title: s.title, summary: s.summary, action: s.action, status: s.done ? 'done' : i === firstOpen ? 'current' : 'todo' }));
    return { opportunity: { id: o.id, code: o.code, title: o.title, sector: o.sector, region: o.region, estimatedValue: o.estimatedValue }, steps, note: 'A virtual company on COLLABIZ is a collaboration workspace among named parties. Forming a legal JV or company is a separate legal process.' };
  }
}
