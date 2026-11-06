import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { InviteMemberSchema, UpdateMemberRoleSchema } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { auditEvents, memberships, organizations, otpCodes, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireCaps, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { MailService } from '../../common/adapters';
import { randomToken, sha256 } from '../../common/crypto';
import { config } from '../../config';

/** Screen 144 — company team & sub-accounts; screen 030 activity feed (org-scoped audit). */
@ApiTags('organizations')
@Controller('orgs/current')
@RequireOrg()
export class OrganizationsController {
  constructor(@InjectDb() private db: Db, private audit: AuditService, private mail: MailService) {}

  @Get()
  async current(@Ctx() ctx: RequestContext) {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId!)).limit(1);
    return org;
  }

  @Get('members')
  @RequireCaps('org.read')
  async members(@Ctx() ctx: RequestContext) {
    return this.db
      .select({ membershipId: memberships.id, userId: users.id, fullName: users.fullName, email: users.email, role: memberships.role, status: memberships.status, joinedAt: memberships.createdAt, lastLoginAt: users.lastLoginAt })
      .from(memberships).innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.organizationId, ctx.orgId!), sql`${memberships.status} <> 'removed'`))
      .orderBy(memberships.createdAt);
  }

  @Post('members')
  @RequireCaps('org.team.manage')
  @HttpCode(201)
  async invite(@Ctx() ctx: RequestContext, @Body(body(InviteMemberSchema)) b: z.infer<typeof InviteMemberSchema>) {
    if (ctx.orgType !== 'partner_company') throw new BadRequestException('Team members can be added to company accounts only');
    let [user] = await this.db.select().from(users).where(sql`lower(${users.email}) = ${b.email}`).limit(1);
    let token: string | undefined;
    if (!user) {
      [user] = await this.db.insert(users).values({ email: b.email, fullName: b.fullName }).returning();
      token = randomToken(32);
      await this.db.insert(otpCodes).values({ userId: user.id, channel: 'email', purpose: 'invite', codeHash: sha256(`invite:${token}`), expiresAt: new Date(Date.now() + 7 * 86400_000) });
    }
    const existing = await this.db.select().from(memberships).where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, ctx.orgId!)));
    if (existing.some((m) => m.status !== 'removed')) throw new BadRequestException('This person is already a member of your organization');
    const [m] = await this.db.insert(memberships).values({ userId: user.id, organizationId: ctx.orgId!, role: b.role, status: token ? 'invited' : 'active', invitedBy: ctx.userId })
      .onConflictDoUpdate({ target: [memberships.userId, memberships.organizationId, memberships.role], set: { status: token ? 'invited' : 'active', invitedBy: ctx.userId } }).returning();
    await this.mail.send('email', b.email, 'You have been invited to COLLABIZ', token ? `Accept your invitation: /invite?token=${token}` : 'You were added to an organization on COLLABIZ.');
    await this.audit.record(ctx, { action: 'membership.invited', objectType: 'membership', objectId: m.id, after: { email: b.email, role: b.role } });
    return { membershipId: m.id, status: m.status, ...(token && (config().DEV_EXPOSE_OTP || config().NODE_ENV === 'test') ? { devInviteToken: token } : {}) };
  }

  @Patch('members/:membershipId')
  @RequireCaps('org.team.manage')
  async updateRole(@Ctx() ctx: RequestContext, @Param('membershipId', ParseUUIDPipe) id: string, @Body(body(UpdateMemberRoleSchema)) b: z.infer<typeof UpdateMemberRoleSchema>) {
    if (!['org_owner', 'org_admin', 'org_member'].includes(b.role)) throw new BadRequestException('Only organization roles can be assigned here');
    const m = await this.own(ctx, id);
    if (m.userId === ctx.userId) throw new ForbiddenException('You cannot change your own role');
    if (b.role === 'org_owner' && !ctx.orgRoles.includes('org_owner')) throw new ForbiddenException('Only an owner can appoint another owner');
    if (m.role === 'org_owner') await this.assertNotLastOwner(ctx.orgId!, m.id);
    const [u] = await this.db.update(memberships).set({ role: b.role }).where(eq(memberships.id, id)).returning();
    await this.audit.record(ctx, { action: 'membership.role_changed', objectType: 'membership', objectId: id, before: { role: m.role }, after: { role: b.role } });
    return u;
  }

  @Delete('members/:membershipId')
  @RequireCaps('org.team.manage')
  async remove(@Ctx() ctx: RequestContext, @Param('membershipId', ParseUUIDPipe) id: string) {
    const m = await this.own(ctx, id);
    if (m.role === 'org_owner') await this.assertNotLastOwner(ctx.orgId!, m.id);
    await this.db.update(memberships).set({ status: 'removed' }).where(eq(memberships.id, id));
    await this.audit.record(ctx, { action: 'membership.removed', objectType: 'membership', objectId: id, before: { role: m.role, status: m.status } });
    return { removed: true };
  }

  /** Screen 030 — organization activity centre (audit events scoped to this tenant). */
  @Get('activity')
  @RequireCaps('org.read')
  async activity(@Ctx() ctx: RequestContext, @Query('limit') limit = '50') {
    return this.db.select({ id: auditEvents.id, at: auditEvents.at, action: auditEvents.action, objectType: auditEvents.objectType, objectId: auditEvents.objectId, actorUserId: auditEvents.actorUserId, actorName: users.fullName, reason: auditEvents.reason })
      .from(auditEvents).leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .where(eq(auditEvents.organizationId, ctx.orgId!)).orderBy(desc(auditEvents.seq)).limit(Math.min(200, Number(limit) || 50));
  }

  /** Object-level check: membership must belong to the caller's active organization (404 otherwise — no enumeration). */
  private async own(ctx: RequestContext, id: string) {
    const [m] = await this.db.select().from(memberships).where(and(eq(memberships.id, id), eq(memberships.organizationId, ctx.orgId!))).limit(1);
    if (!m || m.status === 'removed') throw new NotFoundException('Member not found');
    return m;
  }
  private async assertNotLastOwner(orgId: string, excludingId: string) {
    const owners = await this.db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.role, 'org_owner'), eq(memberships.status, 'active')));
    if (owners.filter((o) => o.id !== excludingId).length === 0) throw new BadRequestException('An organization must keep at least one owner');
  }
}

/** Screen 129 — admin users & permissions; screen 141 — audit logs & security centre. */
@ApiTags('admin')
@Controller('admin')
export class AdminIdentityController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  @Get('users')
  @RequireCaps('users.manage')
  async users(@Query('q') q?: string, @Query('limit') limit = '50') {
    const where = q ? or(ilike(users.email, `%${q}%`), ilike(users.fullName, `%${q}%`)) : undefined;
    const rows = await this.db.select({ id: users.id, email: users.email, fullName: users.fullName, status: users.status, mfaEnabled: sql<boolean>`${users.mfaEnabledAt} is not null`, emailVerified: sql<boolean>`${users.emailVerifiedAt} is not null`, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt })
      .from(users).where(where).orderBy(desc(users.createdAt)).limit(Math.min(200, Number(limit) || 50));
    const ms = rows.length ? await this.db.select({ id: memberships.id, userId: memberships.userId, role: memberships.role, status: memberships.status, organizationId: organizations.id, orgName: organizations.displayName, orgType: organizations.type })
      .from(memberships).innerJoin(organizations, eq(organizations.id, memberships.organizationId)).where(inArray(memberships.userId, rows.map((r) => r.id))) : [];
    return rows.map((r) => ({ ...r, memberships: ms.filter((m) => m.userId === r.id && m.status !== 'removed') }));
  }

  @Get('organizations')
  @RequireCaps('users.manage')
  orgs(@Query('type') type?: string) {
    return this.db.select().from(organizations).where(type ? eq(organizations.type, type) : undefined).orderBy(organizations.displayName).limit(500);
  }

  @Post('role-assignments')
  @RequireCaps('users.manage')
  @HttpCode(201)
  async assign(@Ctx() ctx: RequestContext, @Body(body(z.object({ userId: z.string().uuid(), organizationId: z.string().uuid(), role: z.enum(['super_admin', 'unite_admin', 'compliance', 'finance', 'routing_owner', 'moderator']), reason: z.string().trim().min(5).max(500) }))) b: { userId: string; organizationId: string; role: string; reason: string }) {
    if (b.userId === ctx.userId) throw new ForbiddenException('You cannot change your own privileges');
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, b.organizationId)).limit(1);
    if (!org || !['platform', 'group_company'].includes(org.type)) throw new BadRequestException('Platform roles can only be held in Unite Group organizations');
    const [m] = await this.db.insert(memberships).values({ userId: b.userId, organizationId: b.organizationId, role: b.role, status: 'active', invitedBy: ctx.userId })
      .onConflictDoUpdate({ target: [memberships.userId, memberships.organizationId, memberships.role], set: { status: 'active' } }).returning();
    await this.audit.record(ctx, { action: 'admin.role_granted', objectType: 'membership', objectId: m.id, reason: b.reason, after: { userId: b.userId, organizationId: b.organizationId, role: b.role } });
    return m;
  }

  @Delete('role-assignments/:id')
  @RequireCaps('users.manage')
  async revoke(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Query('reason') reason?: string) {
    const [m] = await this.db.select().from(memberships).where(eq(memberships.id, id)).limit(1);
    if (!m) throw new NotFoundException();
    if (m.userId === ctx.userId) throw new ForbiddenException('You cannot change your own privileges');
    if (!reason || reason.trim().length < 5) throw new BadRequestException('A reason is required');
    await this.db.update(memberships).set({ status: 'removed' }).where(eq(memberships.id, id));
    await this.audit.record(ctx, { action: 'admin.role_revoked', objectType: 'membership', objectId: id, reason, before: { role: m.role, status: m.status } });
    return { revoked: true };
  }

  @Post('users/:id/status')
  @RequireCaps('users.manage')
  @HttpCode(200)
  async setStatus(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ status: z.enum(['active', 'suspended']), reason: z.string().trim().min(5).max(500) }))) b: { status: string; reason: string }) {
    if (id === ctx.userId) throw new ForbiddenException('You cannot suspend yourself');
    const [before] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!before) throw new NotFoundException();
    await this.db.update(users).set({ status: b.status, updatedAt: new Date() }).where(eq(users.id, id));
    await this.audit.record(ctx, { action: `admin.user_${b.status}`, objectType: 'user', objectId: id, reason: b.reason, before: { status: before.status }, after: { status: b.status } });
    return { id, status: b.status };
  }

  @Get('audit')
  @RequireCaps('audit.read')
  async auditLog(@Query('objectType') objectType?: string, @Query('objectId') objectId?: string, @Query('action') action?: string, @Query('actor') actor?: string, @Query('limit') limit = '100') {
    const conds = [objectType && eq(auditEvents.objectType, objectType), objectId && eq(auditEvents.objectId, objectId), action && ilike(auditEvents.action, `%${action}%`), actor && eq(auditEvents.actorUserId, actor)].filter(Boolean) as ReturnType<typeof eq>[];
    return this.db.select({ seq: auditEvents.seq, id: auditEvents.id, at: auditEvents.at, action: auditEvents.action, objectType: auditEvents.objectType, objectId: auditEvents.objectId, reason: auditEvents.reason, actorUserId: auditEvents.actorUserId, actorEmail: users.email, organizationId: auditEvents.organizationId, ip: auditEvents.ip, beforeHash: auditEvents.beforeHash, afterHash: auditEvents.afterHash, hash: auditEvents.hash, before: auditEvents.before, after: auditEvents.after })
      .from(auditEvents).leftJoin(users, eq(users.id, auditEvents.actorUserId)).where(conds.length ? and(...conds) : undefined).orderBy(desc(auditEvents.seq)).limit(Math.min(500, Number(limit) || 100));
  }

  @Get('audit/verify')
  @RequireCaps('audit.read')
  verify() {
    return this.audit.verifyChain();
  }

  @Get('security/summary')
  @RequireCaps('audit.read')
  async security() {
    const [r] = await this.db.execute<{ failed24h: number; locked: number; admins_without_mfa: number; suspended: number }>(sql`
      select
        (select count(*)::int from audit_events where action = 'auth.login_failed' and at > now() - interval '24 hours') as "failed24h",
        (select count(*)::int from users where locked_until > now()) as "locked",
        (select count(distinct m.user_id)::int from memberships m join users u on u.id = m.user_id join organizations o on o.id = m.organization_id
           where o.type in ('platform','group_company') and m.status = 'active' and m.role in ('super_admin','unite_admin','compliance','finance','routing_owner') and u.mfa_enabled_at is null) as "admins_without_mfa",
        (select count(*)::int from users where status = 'suspended') as "suspended"`).then((x) => x.rows);
    return r;
  }
}
