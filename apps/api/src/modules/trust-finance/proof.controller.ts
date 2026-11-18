/**
 * Proof — performance passport. Built only from records both sides confirmed on COLLABIZ: certified milestones,
 * completed projects, accepted XCHANGE deliveries, accepted micro-contracts, honoured capacity bookings, paid invoices,
 * worker-confirmed micro payments, executed contracts and activated commitments; plus disputes raised against the
 * business. Nothing self-declared counts. A business may publish its summary at a public link (its Business QR).
 */
import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { eq, sql, type SQL } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { pct, proofLevel } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { organizations, proofShares } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';

type Row = { id: string; ref: string; amount: number | null; on_time: boolean | null };
interface Line { key: string; label: string; count: number; detail: string; evidence: string[] }

@ApiTags('proof')
@Controller('proof')
export class ProofController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}
  private async q(s: SQL): Promise<Row[]> { const r = await this.db.execute(s); return ((r as unknown as { rows?: Row[] }).rows ?? (r as unknown as Row[])); }
  private inr(paise: number) { const r = paise / 100; return r >= 1e7 ? `₹${(r / 1e7).toFixed(2)} Cr` : r >= 1e5 ? `₹${(r / 1e5).toFixed(2)} L` : `₹${Math.round(r).toLocaleString('en-IN')}`; }

  async passport(orgId: string) {
    const [org] = await this.db.select({ name: organizations.displayName, city: organizations.city, kyb: organizations.verificationStatus, since: organizations.createdAt }).from(organizations).where(eq(organizations.id, orgId));
    if (!org) throw new NotFoundException();
    const o = sql`${orgId}::uuid`;
    const projects = await this.q(sql`select id, code as ref, value as amount, null::boolean as on_time from projects where lead_org_id = ${o} and status in ('completed', 'closed')`);
    const ms = await this.q(sql`select m.id, p.code || ' #' || m.seq as ref, coalesce(m.certified_amount, m.amount) as amount, case when m.submitted_at is null then null else m.submitted_at::date <= m.due_date end as on_time
      from milestones m join projects p on p.id = m.project_id where m.certified_at is not null and coalesce(m.assigned_org_id, p.lead_org_id) = ${o} order by p.code, m.seq`);
    const xd = await this.q(sql`select l.id, d.code as ref, l.value as amount, null::boolean as on_time from xchange_legs l join xchange_deals d on d.id = l.deal_id where l.from_org_id = ${o} and l.status = 'accepted'`);
    const micro = await this.q(sql`select id, code as ref, price_rs * 100 as amount, null::boolean as on_time from micro_contracts where worker_org_id = ${o} and status in ('accepted', 'paid')`);
    const cap = await this.q(sql`select b.id, o.title as ref, null::bigint as amount, null::boolean as on_time from capacity_bookings b join capacity_offers o on o.id = b.offer_id where o.org_id = ${o} and b.status = 'accepted' and b.to_date < current_date`);
    const paid = await this.q(sql`select i.id, i.number as ref, i.amount, (i.due_date is null or i.paid_at::date <= i.due_date) as on_time from project_invoices i join projects p on p.id = i.project_id where p.owner_org_id = ${o} and i.status = 'paid'`);
    const microPaid = await this.q(sql`select id, code as ref, price_rs * 100 as amount, null::boolean as on_time from micro_contracts where org_id = ${o} and status = 'paid' and history @> '[{"status":"payment_confirmed"}]'::jsonb`);
    const contracts = await this.q(sql`select id, code as ref, value as amount, null::boolean as on_time from contracts where executed_at is not null and (issuer_org_id = ${o} or counterparty_org_id = ${o})`);
    const commits = await this.q(sql`select c.id, c.code as ref, null::bigint as amount, null::boolean as on_time from commitments c join commitment_parties p on p.commitment_id = c.id where p.org_id = ${o} and c.bound_at is not null`);
    const disputes = await this.q(sql`select id, code as ref, null::bigint as amount, (status = 'decided') as on_time from resolution_cases where against_org_id = ${o}`);
    const posterPaid = await this.q(sql`select id, code as ref, null::bigint as amount, null::boolean as on_time from micro_contracts where org_id = ${o} and status = 'paid'`);
    const sum = (r: Row[]) => r.reduce((a, x) => a + Number(x.amount ?? 0), 0);
    const ev = (r: Row[]) => r.slice(0, 6).map((x) => x.ref);
    const msOnTime = pct(ms.filter((m) => m.on_time === true).length, ms.filter((m) => m.on_time !== null).length);
    const payOnTime = pct(paid.filter((m) => m.on_time === true).length, paid.filter((m) => m.on_time !== null).length);
    const line = (key: string, label: string, r: Row[], detail: string): Line => ({ key, label, count: r.length, detail: r.length ? detail : '—', evidence: ev(r) });
    const sections = [
      { title: 'Delivery', lines: [
        line('projects', 'Projects completed as lead', projects, `${this.inr(sum(projects))} total contract value`),
        line('milestones', 'Milestones certified by clients', ms, msOnTime === null ? 'Submission dates not recorded' : `${msOnTime}% submitted by the due date`),
        line('xchange', 'XCHANGE deliveries accepted', xd, `${this.inr(sum(xd))} value`),
        line('micro', 'Micro-contracts accepted', micro, `${this.inr(sum(micro))} of work`),
        line('capacity', 'Capacity bookings honoured', cap, 'Completed bookings accepted by you'),
      ] },
      { title: 'Payment', lines: [
        line('invoices_paid', 'Invoices paid to suppliers', paid, payOnTime === null ? 'Due dates not recorded' : `${payOnTime}% paid by the due date`),
        line('micro_paid', 'Micro-contract payments confirmed by workers', microPaid, `${this.inr(sum(microPaid))} paid`),
      ] },
      { title: 'Agreements', lines: [
        line('contracts', 'Contracts executed (both parties signed)', contracts, `${this.inr(sum(contracts))} total value`),
        line('commitments', 'Conditional commitments activated', commits, 'Every party pledged and every condition verified'),
      ] },
      { title: 'Disputes', lines: [{ key: 'disputes', label: 'Disputes raised against this business', count: disputes.length, detail: disputes.length ? `${disputes.length} raised` : 'None', evidence: [] }] },
    ];
    const records = projects.length + ms.length + xd.length + micro.length + cap.length + paid.length + microPaid.length + contracts.length + commits.length;
    return {
      name: org.name, city: org.city, verified: org.kyb === 'verified', since: org.since, records, level: proofLevel(records, msOnTime, 0),
      measures: [
        { label: 'On-time delivery', value: msOnTime, hint: msOnTime === null ? (ms.length ? 'Submission dates not recorded' : 'No records yet') : 'of certified milestones submitted by the due date' },
        { label: 'On-time payment', value: payOnTime, hint: payOnTime === null ? 'No records yet' : 'of supplier invoices paid by the due date' },
        { label: 'Micro payments confirmed', value: pct(microPaid.length, posterPaid.length), hint: posterPaid.length ? 'of micro-contracts you paid, confirmed by the worker' : 'No records yet' },
      ],
      sections,
      note: 'Computed only from records both parties confirmed on COLLABIZ. Self-declared profile information is not counted, and a verified profile does not mean every transaction was verified.',
    };
  }

  @Get()
  @RequireOrg()
  async mine(@Ctx() ctx: RequestContext) {
    const [s] = await this.db.select().from(proofShares).where(eq(proofShares.orgId, ctx.orgId!));
    return { ...(await this.passport(ctx.orgId!)), share: s ? { token: s.token, enabled: s.enabled } : null };
  }

  @Post('share')
  @RequireOrg()
  @HttpCode(200)
  async share(@Ctx() ctx: RequestContext, @Body(body(z.object({ enabled: z.boolean() }))) b: { enabled: boolean }) {
    const [cur] = await this.db.select().from(proofShares).where(eq(proofShares.orgId, ctx.orgId!));
    const token = cur?.token ?? randomBytes(9).toString('base64url');
    if (cur) await this.db.update(proofShares).set({ enabled: b.enabled }).where(eq(proofShares.orgId, ctx.orgId!));
    else await this.db.insert(proofShares).values({ orgId: ctx.orgId!, token, enabled: b.enabled, createdBy: ctx.userId });
    await this.audit.record(ctx, { action: b.enabled ? 'proof.shared' : 'proof.unshared', objectType: 'organization', objectId: ctx.orgId! });
    return { token, enabled: b.enabled };
  }

  /** Public summary behind a Business QR — only when the business turned sharing on. No contact details, no amounts. */
  @Public()
  @Get('public/:token')
  async publicView(@Param('token') token: string) {
    const [s] = await this.db.select().from(proofShares).where(eq(proofShares.token, token));
    if (!s || !s.enabled) throw new NotFoundException('This Proof link is not active');
    const p = await this.passport(s.orgId);
    return { name: p.name, city: p.city, verified: p.verified, since: p.since, level: p.level, records: p.records, measures: p.measures,
      sections: p.sections.map((x) => ({ title: x.title, lines: x.lines.map((l) => ({ label: l.label, count: l.count })) })), note: p.note };
  }
}
