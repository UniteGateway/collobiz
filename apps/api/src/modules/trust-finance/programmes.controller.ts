/**
 * Unite programmes (open / not open yet, "notify me when it opens") and the Home "Get set up" checklist.
 * Opening a programme is a Unite staff action that records the responsible company's approval and notifies watchers.
 */
import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ASSET_LABELS, UNITE_PROGRAMMES, programmeByCode } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { memberships, notifications, programmeOpenings, programmeWatchers, proofShares } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';

const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');

@ApiTags('programmes')
@Controller()
export class ProgrammesController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  @Get('programmes')
  async list(@Ctx() ctx: RequestContext) {
    const opened = new Map((await this.db.select().from(programmeOpenings)).map((o) => [o.programme, o]));
    const watching = ctx.orgId ? new Set((await this.db.select({ p: programmeWatchers.programme }).from(programmeWatchers).where(eq(programmeWatchers.orgId, ctx.orgId))).map((w) => w.p)) : new Set<string>();
    const counts = new Map((await this.db.select({ p: programmeWatchers.programme, n: sql<number>`count(*)::int` }).from(programmeWatchers).groupBy(programmeWatchers.programme)).map((r) => [r.p, Number(r.n)]));
    return UNITE_PROGRAMMES.map((p) => ({ ...p, lookingForLabels: p.lookingFor.map((k) => ASSET_LABELS[k]), open: opened.has(p.code), openedAt: opened.get(p.code)?.openedAt ?? null, watching: watching.has(p.code), watchers: staff(ctx) ? counts.get(p.code) ?? 0 : undefined }));
  }

  @Post('programmes/:code/notify-me')
  @RequireOrg()
  @HttpCode(200)
  async notifyMe(@Ctx() ctx: RequestContext, @Param('code') code: string, @Body(body(z.object({ on: z.boolean().default(true) }))) b: { on: boolean }) {
    if (!programmeByCode(code)) throw new NotFoundException('Programme not found');
    if (b.on) await this.db.insert(programmeWatchers).values({ programme: code, orgId: ctx.orgId!, userId: ctx.userId }).onConflictDoNothing();
    else await this.db.delete(programmeWatchers).where(and(eq(programmeWatchers.programme, code), eq(programmeWatchers.orgId, ctx.orgId!)));
    return { code, watching: b.on };
  }

  @Post('admin/programmes/:code/open')
  @HttpCode(200)
  async open(@Ctx() ctx: RequestContext, @Param('code') code: string, @Body(body(z.object({ approvalNote: z.string().trim().min(10, 'Record who approved the opening and the reference').max(1000) }))) b: { approvalNote: string }) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const p = programmeByCode(code); if (!p) throw new NotFoundException('Programme not found');
    const [o] = await this.db.insert(programmeOpenings).values({ programme: code, openedBy: ctx.userId, approvalNote: b.approvalNote }).onConflictDoNothing().returning();
    if (!o) throw new BadRequestException('Already open');
    const users = await this.db.selectDistinct({ u: programmeWatchers.userId }).from(programmeWatchers).where(eq(programmeWatchers.programme, code));
    if (users.length) await this.db.insert(notifications).values(users.map((x) => ({ userId: x.u, kind: 'programme', title: `${p.title} is open`, body: `${p.company} has opened this programme. Apply from Collab → Unite programmes.`, link: '/collab/programs' })));
    await this.audit.record(ctx, { action: 'programme.opened', objectType: 'programme', objectId: code, after: { note: b.approvalNote, notified: users.length } });
    return { code, open: true, notified: users.length };
  }

  /** Home "Get set up" checklist — each step is read from real records. */
  @Get('me/setup-checklist')
  @RequireOrg()
  async setup(@Ctx() ctx: RequestContext) {
    const o = sql`${ctx.orgId}::uuid`;
    const one = async (q: ReturnType<typeof sql>) => { const r = await this.db.execute(q); const rows = (r as unknown as { rows?: { v: boolean }[] }).rows ?? (r as unknown as { v: boolean }[]); return !!rows[0]?.v; };
    const [team] = await this.db.select({ n: sql<number>`count(*)::int` }).from(memberships).where(and(eq(memberships.organizationId, ctx.orgId!), inArray(memberships.status, ['active', 'invited'])));
    const [share] = await this.db.select().from(proofShares).where(eq(proofShares.orgId, ctx.orgId!));
    const steps = [
      { key: 'verify', title: 'Verify your business', text: 'Unlocks applying, publishing and protected leads.', href: '/onboarding/kyc', done: ctx.orgVerificationStatus === 'verified' },
      { key: 'have_need', title: 'Tell us what you have and need', text: 'Space, team, machines, skills — we match you to work.', href: '/collab', done: await one(sql`select exists(select 1 from collab_assets where org_id = ${o}) or exists(select 1 from collab_needs where org_id = ${o}) as v`) },
      { key: 'offer', title: 'Post your first business offer', text: 'Partnership, contract, capacity or a sale.', href: '/business-offers/new', done: await one(sql`select exists(select 1 from business_offers b join opportunities p on p.id = b.opportunity_id where p.owner_org_id = ${o}) as v`) },
      { key: 'team', title: 'Invite your team', text: 'Colleagues act on deals with their own sign-in.', href: '/company/team', done: Number(team?.n ?? 0) > 1 },
      { key: 'qr', title: 'Publish your Business QR', text: 'One QR for counter, truck or card — shows your Proof record.', href: '/business-qr', done: !!share?.enabled },
    ];
    const done = steps.filter((s) => s.done).length;
    return { steps, done, total: steps.length, next: steps.find((s) => !s.done) ?? null };
  }
}
