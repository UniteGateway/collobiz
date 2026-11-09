/**
 * Screen 023 — Partner Home. One call that answers "what needs me today?" for the active organization:
 * next actions across every module, headline figures, pipeline, recommendations and readable recent activity.
 * Read-only; every query is scoped to the caller's active organization or user.
 */
import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { InjectDb, type Db } from '../../db/client';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { OpportunitiesModule } from '../opportunities/opportunities.controller';
import { OpportunitiesService } from '../opportunities/opportunities.service';

type Row = Record<string, unknown>;
const rows = (r: unknown) => ((r as { rows?: Row[] }).rows ?? (r as Row[]));

/** Plain-language sentences for audit actions shown to partners (anything unmapped is not shown). */
const ACTIVITY: Record<string, string> = {
  'lead.registered': 'Registered a protected lead', 'lead.protected': 'Lead protection confirmed', 'lead.released': 'Lead released to the partner exchange',
  'opportunity.applied': 'Applied to an opportunity', 'application.shortlisted': 'Application shortlisted', 'application.accepted': 'Application accepted',
  'crm.deal_stage_changed': 'Moved a deal to a new stage', 'crm.deal_created': 'Created a deal', 'crm.task_created': 'Added a follow-up task',
  'team.created': 'Created a collaboration team', 'team.invited': 'Invited a partner to a team', 'team.nda_signed': 'Signed a team NDA', 'team.active': 'Team activated',
  'bid.submitted': 'Submitted a sealed bid', 'bid.awarded': 'Bid awarded', 'contract.signed': 'Signed a contract', 'contract.executed': 'Contract executed',
  'project.progress_update': 'Posted a site update', 'milestone.submitted': 'Submitted a milestone for certification', 'milestone.certified': 'Milestone certified',
  'project.invoice_paid': 'Customer payment recorded', 'payout.requested': 'Requested a payout', 'payout.settled': 'Payout paid',
  'trade.quotation_submitted': 'Sent a quotation', 'po.issued': 'Issued a purchase order', 'po.delivered': 'Goods received', 'onboarding.submitted': 'Submitted verification',
};

@ApiTags('home')
@Controller('me/home')
@RequireOrg()
export class HomeController {
  constructor(@InjectDb() private db: Db, private opps: OpportunitiesService) {}

  @Get()
  async home(@Ctx() ctx: RequestContext) {
    const org = ctx.orgId!;
    const user = ctx.userId;
    const q = async (s: ReturnType<typeof sql>) => rows(await this.db.execute(s));
    const [figures] = await q(sql`select
      (select coalesce(sum(value),0)::bigint from crm_deals where organization_id = ${org} and stage not in ('won','lost')) as "pipelineValue",
      (select count(*)::int from crm_deals where organization_id = ${org} and stage not in ('won','lost')) as "openDeals",
      (select count(*)::int from lead_claims where introducer_org_id = ${org} and status in ('pending','protected','contested')) as "activeLeads",
      (select count(*)::int from lead_claims where introducer_org_id = ${org} and status = 'protected') as "protectedLeads",
      (select count(*)::int from project_members pm join projects p on p.id = pm.project_id where pm.organization_id = ${org} and pm.status = 'active' and p.status in ('planning','active','on_hold')) as "activeProjects",
      (select coalesce(sum(payable),0)::bigint from commission_entries where beneficiary_org_id = ${org} and status in ('earned','approved','invoiced')) as "earnedUnpaid",
      (select coalesce(sum(payable),0)::bigint from commission_entries where beneficiary_org_id = ${org} and status in ('estimated','eligible')) as "projected",
      (select count(*)::int from opportunity_applications where organization_id = ${org} and status in ('submitted','shortlisted')) as "openApplications"`);
    const actions: { kind: string; title: string; detail: string; href: string; due?: string | null; tone: 'urgent' | 'normal' }[] = [];
    const add = (list: Row[], f: (r: Row) => (typeof actions)[number]) => list.forEach((r) => actions.push(f(r)));
    add(await q(sql`select o.id, o.title, o.deadline, g.display_name as issuer from direct_offer_recipients r join direct_offers o on o.id = r.offer_id join organizations g on g.id = o.issuer_org_id where r.organization_id = ${org} and r.status in ('sent','viewed') and o.status = 'open' and o.deadline > now() order by o.deadline limit 5`),
      (r) => ({ kind: 'offer', title: `Offer from ${r.issuer}`, detail: String(r.title), href: `/offers/${r.id}`, due: new Date(String(r.deadline)).toISOString(), tone: 'normal' }));
    add(await q(sql`select t.id, t.name, l.display_name as lead from team_members m join collaboration_teams t on t.id = m.team_id join organizations l on l.id = t.lead_org_id where m.organization_id = ${org} and m.status in ('invited','accepted') and t.lead_org_id <> ${org} limit 5`),
      (r) => ({ kind: 'team', title: `Join ${r.name}`, detail: `${r.lead} invited your company — review and sign the NDA`, href: `/collaboration/requests`, tone: 'normal' }));
    add(await q(sql`select c.id, c.code, c.title from contracts c where c.status in ('approved','partially_signed') and (c.issuer_org_id = ${org} or c.counterparty_org_id = ${org})
        and not exists (select 1 from contract_signatures s where s.contract_id = c.id and s.organization_id = ${org}) limit 5`),
      (r) => ({ kind: 'contract', title: 'Sign contract', detail: `${r.title} (${r.code}) is approved and waiting for your signature`, href: `/vault?contract=${r.id}`, tone: 'urgent' }));
    add(await q(sql`select m.id, m.title, m.due_date, p.id as pid, p.title as project from milestones m join projects p on p.id = m.project_id where p.lead_org_id = ${org} and m.status = 'in_progress' and m.progress_pct = 100 limit 5`),
      (r) => ({ kind: 'milestone', title: 'Submit milestone for certification', detail: `${r.title} — ${r.project}`, href: `/projects/${r.pid}/certification`, due: String(r.due_date), tone: 'normal' }));
    add(await q(sql`select m.id, m.title, p.id as pid, p.title as project from milestones m join projects p on p.id = m.project_id where p.lead_org_id = ${org} and m.status = 'certified' limit 5`),
      (r) => ({ kind: 'invoice', title: 'Raise invoice', detail: `${r.title} is certified — ${r.project}`, href: `/projects/${r.pid}/certification`, tone: 'normal' }));
    add(await q(sql`select m.id, m.title, m.due_date, p.id as pid, p.title as project from milestones m join projects p on p.id = m.project_id where p.owner_org_id = ${org} and m.status = 'submitted' limit 5`),
      (r) => ({ kind: 'certify', title: 'Certify submitted milestone', detail: `${r.title} — ${r.project}`, href: `/projects/${r.pid}/certification`, tone: 'urgent' }));
    const [ready] = await q(sql`select count(*)::int as n, coalesce(sum(payable),0)::bigint as amount from commission_entries where beneficiary_org_id = ${org} and status = 'approved' and payout_id is null`);
    if (Number(ready.n) > 0) actions.push({ kind: 'payout', title: 'Request your payout', detail: `${ready.n} approved commission line(s) are ready`, href: '/payouts/request', tone: 'normal' });
    add(await q(sql`select id, title, due_at from crm_tasks where organization_id = ${org} and status = 'open' and due_at < now() + interval '2 days' order by due_at limit 5`),
      (r) => ({ kind: 'task', title: String(r.title), detail: 'Follow-up task', href: '/tasks', due: new Date(String(r.due_at)).toISOString(), tone: new Date(String(r.due_at)) < new Date() ? 'urgent' : 'normal' }));
    add(await q(sql`select id, number from purchase_orders where supplier_org_id = ${org} and status = 'issued' limit 5`),
      (r) => ({ kind: 'order', title: 'Accept purchase order', detail: `${r.number} is waiting for your confirmation`, href: `/trading/orders?id=${r.id}`, tone: 'urgent' }));
    add(await q(sql`select id, code from trade_claims where supplier_org_id = ${org} and status = 'open' limit 5`),
      (r) => ({ kind: 'claim', title: 'Respond to a claim', detail: `${r.code} — respond within 5 days`, href: `/trading/claims?id=${r.id}`, tone: 'urgent' }));
    add(await q(sql`select t.id, t.title, t.closes_at from tenders t where t.status = 'published' and t.closes_at > now() and t.closes_at < now() + interval '7 days' and t.issuer_org_id <> ${org}
        and exists (select 1 from bids b where b.tender_id = t.id and b.organization_id = ${org} and b.status = 'draft') limit 3`),
      (r) => ({ kind: 'tender', title: 'Finish your bid', detail: `${r.title} closes soon — your bid is still a draft`, href: `/tenders/${r.id}/bid`, due: new Date(String(r.closes_at)).toISOString(), tone: 'urgent' }));
    const pipeline = await q(sql`select stage, count(*)::int as n, coalesce(sum(value),0)::bigint as value from crm_deals where organization_id = ${org} group by stage`);
    const feed = await this.opps.feed(ctx);
    const activity = (await q(sql`select a.id, a.action, a.at, u.full_name as actor from audit_events a left join users u on u.id = a.actor_user_id where a.organization_id = ${org} order by a.seq desc limit 40`))
      .filter((r) => ACTIVITY[String(r.action)]).slice(0, 6).map((r) => ({ id: String(r.id), text: ACTIVITY[String(r.action)], actor: r.actor, at: r.at }));
    const order = { urgent: 0, normal: 1 };
    void user;
    return {
      figures: Object.fromEntries(Object.entries(figures).map(([k, v]) => [k, Number(v)])),
      actions: actions.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 8),
      pipeline: pipeline.map((p) => ({ stage: String(p.stage), count: Number(p.n), value: Number(p.value) })),
      recommendations: feed.items.slice(0, 4).map((r) => ({ id: r.opportunity.id, code: r.opportunity.code, title: r.opportunity.title, sector: r.opportunity.sector, city: r.opportunity.city, value: r.opportunity.estimatedValue, deadline: r.opportunity.deadline, score: r.match?.score ?? null, reasons: r.match?.factors.filter((f) => f.score >= 0.7).map((f) => f.factor).slice(0, 3) ?? [] })),
      activity,
    };
  }
}

@Module({ imports: [OpportunitiesModule], controllers: [HomeController] })
export class HomeModule {}
