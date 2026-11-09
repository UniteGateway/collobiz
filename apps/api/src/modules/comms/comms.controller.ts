/**
 * Stage 13 — Messaging, meetings and support (screens 105–112, 147, 150).
 *
 * Gate: message privacy, retention and escalation.
 *  - Privacy: message bodies are encrypted at rest; only thread members read them — there is no administrator
 *    bypass. Project threads derive membership from the project, so an organization removed from a project loses the
 *    conversation immediately. Staff see message content only when a member reports a specific message, and then only
 *    that message. Blocks stop direct messages.
 *  - Retention: each thread has a retention period; a retention run removes message bodies older than it (metadata
 *    kept for audit) unless compliance has placed the thread on legal hold.
 *  - Escalation: support tickets carry a first-response deadline by priority; overdue tickets escalate automatically
 *    to compliance, and requesters can escalate an overdue ticket themselves.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  AccountClosureSchema, AnnouncementSchema, assertTransition, ChatMessageSchema, DirectMessageSchema, FeedbackSchema, LegalHoldSchema, MANDATORY_NOTIFICATION_KINDS, MeetingSchema, MinutesSchema, NOTIFICATION_KINDS,
  NotificationPrefsSchema, ReportMessageSchema, RsvpSchema, TicketMachine, TicketReplySchema, TicketSchema, TicketStatusSchema, type TicketState,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  announcementReads, announcements, commissionEntries, contentPages, contracts, dataRequests, feedback, meetingAttendees, meetings, memberships, messages, messageThreads, notificationPreferences, notifications, organizations,
  projectMembers, projects, supportTickets, threadMembers, ticketMessages, userBlocks, users,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { decryptField, encryptField, randomDigits, randomToken } from '../../common/crypto';
import { MailService } from '../../common/adapters';
import { config } from '../../config';

type Thread = typeof messageThreads.$inferSelect;
const RETENTION_DAYS = { direct: 730, project: 2555 } as const; // 2 years for direct chat; 7 years for project records (§6.5)
const UNSEND_MINUTES = 15;
const SLA_HOURS: Record<string, number> = { urgent: 4, high: 8, normal: 24, low: 72 };
const year = () => new Date().getUTCFullYear();
const read = (enc: string | null) => (enc ? decryptField(enc) : null);

@Injectable()
export class CommsService {
  constructor(@InjectDb() private db: Db, private mail: MailService) {}

  /**
   * Single entry point for user notifications: always in-app; email only if the user's preference allows it
   * (mandatory kinds always email).
   */
  async notify(userId: string, kind: string, title: string, text: string, link: string) {
    await this.db.insert(notifications).values({ userId, kind, title, body: text, link });
    const [pref] = await this.db.select().from(notificationPreferences).where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.kind, kind))).limit(1);
    const mandatory = (MANDATORY_NOTIFICATION_KINDS as readonly string[]).includes(kind);
    if (mandatory || (pref?.email ?? kind !== 'message')) {
      const [u] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      if (u) await this.mail.send('email', u.email, title, `${text}\n\nOpen COLLABIZ: ${link}`, { kind });
    }
  }

  /** Who can read a thread right now. Project threads: active users of active project member organizations. */
  async access(ctx: RequestContext, t: Thread) {
    if (t.kind === 'project') {
      const orgs = ctx.memberships.map((m) => m.organizationId);
      const [m] = await this.db.select({ org: projectMembers.organizationId }).from(projectMembers).where(and(eq(projectMembers.projectId, t.projectId!), inArray(projectMembers.organizationId, orgs.length ? orgs : ['00000000-0000-0000-0000-000000000000']), eq(projectMembers.status, 'active'))).limit(1);
      if (!m) return null;
      return { orgId: m.org };
    }
    const [m] = await this.db.select().from(threadMembers).where(and(eq(threadMembers.threadId, t.id), eq(threadMembers.userId, ctx.userId))).limit(1);
    return m ? { orgId: m.organizationId } : null;
  }
  async load(ctx: RequestContext, id: string) {
    const [t] = await this.db.select().from(messageThreads).where(eq(messageThreads.id, id)).limit(1);
    const a = t ? await this.access(ctx, t) : null;
    if (!t || !a) throw new NotFoundException('Conversation not found');
    return { t, orgId: a.orgId };
  }
  /** Ensures the group thread for each project the caller's organization takes part in. */
  async ensureProjectThreads(ctx: RequestContext) {
    if (!ctx.orgId) return;
    const ps = await this.db.select({ id: projects.id, title: projects.title, code: projects.code }).from(projectMembers).innerJoin(projects, eq(projects.id, projectMembers.projectId)).where(and(eq(projectMembers.organizationId, ctx.orgId), eq(projectMembers.status, 'active')));
    for (const p of ps) {
      await this.db.insert(messageThreads).values({ kind: 'project', subject: `${p.code} · ${p.title}`, projectId: p.id, retentionDays: RETENTION_DAYS.project, createdBy: ctx.userId }).onConflictDoNothing();
    }
  }
  async recipients(t: Thread, exceptUserId: string) {
    if (t.kind === 'project') {
      const rows = await this.db.select({ userId: memberships.userId }).from(projectMembers).innerJoin(memberships, and(eq(memberships.organizationId, projectMembers.organizationId), eq(memberships.status, 'active')))
        .where(and(eq(projectMembers.projectId, t.projectId!), eq(projectMembers.status, 'active')));
      return [...new Set(rows.map((r) => r.userId))].filter((u) => u !== exceptUserId);
    }
    const rows = await this.db.select({ userId: threadMembers.userId, muted: threadMembers.muted }).from(threadMembers).where(eq(threadMembers.threadId, t.id));
    return rows.filter((r) => r.userId !== exceptUserId && !r.muted).map((r) => r.userId);
  }
  async blocked(a: string, b: string) {
    const rows = await this.db.select({ id: userBlocks.id }).from(userBlocks).where(or(and(eq(userBlocks.blockerUserId, a), eq(userBlocks.blockedUserId, b)), and(eq(userBlocks.blockerUserId, b), eq(userBlocks.blockedUserId, a)))).limit(1);
    return rows.length > 0;
  }
  async staffUsers(roles: string[]) {
    const rows = await this.db.select({ userId: memberships.userId }).from(memberships).innerJoin(organizations, eq(organizations.id, memberships.organizationId)).where(and(eq(organizations.type, 'platform'), inArray(memberships.role, roles), eq(memberships.status, 'active')));
    return [...new Set(rows.map((r) => r.userId))];
  }
  /** Escalates tickets whose first-response deadline has passed without a staff reply. */
  async escalateOverdue() {
    const due = await this.db.select().from(supportTickets).where(and(inArray(supportTickets.status, ['open', 'in_progress']), isNull(supportTickets.firstRespondedAt), lt(supportTickets.firstResponseDueAt, new Date())));
    for (const t of due) {
      const [u] = await this.db.update(supportTickets).set({ status: 'escalated', escalatedAt: new Date(), escalationReason: 'First-response deadline missed', version: t.version + 1, updatedAt: new Date() }).where(and(eq(supportTickets.id, t.id), eq(supportTickets.version, t.version))).returning();
      if (!u) continue;
      for (const s of await this.staffUsers(['compliance', 'super_admin'])) await this.notify(s, 'support', `Escalated: ${t.code}`, `${t.subject} — first-response deadline missed (${t.priority}).`, `/support/tickets?id=${t.id}`);
      await this.notify(t.requesterUserId, 'support', `Escalated: ${t.code}`, 'Your request missed its response time and has been escalated to a senior team.', `/support/tickets?id=${t.id}`);
    }
    return due.length;
  }
}

@ApiTags('messaging')
@Controller()
export class CommsController {
  constructor(@InjectDb() private db: Db, private svc: CommsService, private audit: AuditService) {}

  // ---------- 105 inbox ----------
  @Get('inbox')
  @RequireOrg()
  async inbox(@Ctx() ctx: RequestContext) {
    await this.svc.ensureProjectThreads(ctx);
    const direct = await this.db.select({ t: messageThreads, lastReadAt: threadMembers.lastReadAt }).from(threadMembers).innerJoin(messageThreads, eq(messageThreads.id, threadMembers.threadId)).where(eq(threadMembers.userId, ctx.userId));
    const orgs = ctx.memberships.map((m) => m.organizationId);
    const proj = await this.db.select({ t: messageThreads }).from(messageThreads).innerJoin(projectMembers, and(eq(projectMembers.projectId, messageThreads.projectId), eq(projectMembers.status, 'active')))
      .where(and(eq(messageThreads.kind, 'project'), inArray(projectMembers.organizationId, orgs))).groupBy(messageThreads.id);
    const all = [...direct.map((d) => ({ t: d.t, lastReadAt: d.lastReadAt })), ...proj.map((p) => ({ t: p.t, lastReadAt: null as Date | null }))];
    const out = [];
    for (const { t, lastReadAt } of all) {
      const [last] = await this.db.select({ m: messages, author: users.fullName }).from(messages).innerJoin(users, eq(users.id, messages.authorUserId)).where(eq(messages.threadId, t.id)).orderBy(desc(messages.createdAt)).limit(1);
      const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(eq(messages.threadId, t.id), ne(messages.authorUserId, ctx.userId), lastReadAt ? gt(messages.createdAt, lastReadAt) : sql`true`, t.kind === 'project' ? sql`false` : sql`true`));
      let title = t.subject ?? 'Conversation';
      if (t.kind === 'direct') {
        const others = await this.db.select({ name: users.fullName, org: organizations.displayName }).from(threadMembers).innerJoin(users, eq(users.id, threadMembers.userId)).innerJoin(organizations, eq(organizations.id, threadMembers.organizationId)).where(and(eq(threadMembers.threadId, t.id), ne(threadMembers.userId, ctx.userId)));
        title = others.map((o) => `${o.name} (${o.org})`).join(', ') || title;
      }
      out.push({ id: t.id, kind: t.kind, title, subject: t.subject, projectId: t.projectId, lastMessageAt: t.lastMessageAt, unread: n,
        preview: last ? { author: last.author, text: last.m.purgedAt ? 'Message removed under the retention policy' : last.m.deletedAt ? 'Message deleted' : (read(last.m.bodyEnc) ?? '').slice(0, 140), at: last.m.createdAt } : null });
    }
    return out.sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));
  }

  /** People the caller may start a direct conversation with: active users of other verified organizations. */
  @Get('chat/contacts')
  @RequireOrg()
  async contacts(@Ctx() ctx: RequestContext, @Query('q') q?: string) {
    const term = q?.trim().slice(0, 60);
    const rows = await this.db.select({ userId: users.id, name: users.fullName, org: organizations.displayName, orgId: organizations.id }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(eq(memberships.status, 'active'), eq(organizations.verificationStatus, 'verified'), ne(organizations.type, 'platform'), ne(users.id, ctx.userId), term ? or(sql`${users.fullName} ilike ${'%' + term + '%'}`, sql`${organizations.displayName} ilike ${'%' + term + '%'}`) : undefined)).orderBy(organizations.displayName, users.fullName).limit(50);
    return rows;
  }

  // ---------- 106 direct chat ----------
  @Post('chat/direct')
  @RequireOrg()
  @HttpCode(201)
  async startDirect(@Ctx() ctx: RequestContext, @Body(body(DirectMessageSchema)) b: z.infer<typeof DirectMessageSchema>) {
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Verify your organization to message other partners');
    if (b.recipientUserId === ctx.userId) throw new BadRequestException('You cannot message yourself');
    const [rm] = await this.db.select({ orgId: memberships.organizationId, verified: organizations.verificationStatus, type: organizations.type }).from(memberships).innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(eq(memberships.userId, b.recipientUserId), eq(memberships.status, 'active'), ne(organizations.type, 'platform'))).limit(1);
    if (!rm || rm.verified !== 'verified') throw new BadRequestException({ message: 'Check the highlighted fields', fields: { recipientUserId: 'You can message members of verified organizations only' } });
    if (await this.svc.blocked(ctx.userId, b.recipientUserId)) throw new ForbiddenException('You cannot message this person');
    // Reuse the existing 1:1 thread between the two users if there is one
    const [existing] = await this.db.select({ id: messageThreads.id }).from(messageThreads).innerJoin(threadMembers, eq(threadMembers.threadId, messageThreads.id))
      .where(and(eq(messageThreads.kind, 'direct'), eq(threadMembers.userId, ctx.userId), sql`exists (select 1 from thread_members x where x.thread_id = ${messageThreads.id} and x.user_id = ${b.recipientUserId})`)).limit(1);
    const threadId = existing?.id ?? (await this.db.transaction(async (tx) => {
      const [t] = await tx.insert(messageThreads).values({ kind: 'direct', subject: b.subject, retentionDays: RETENTION_DAYS.direct, createdBy: ctx.userId }).returning();
      await tx.insert(threadMembers).values([{ threadId: t.id, userId: ctx.userId, organizationId: ctx.orgId!, lastReadAt: new Date() }, { threadId: t.id, userId: b.recipientUserId, organizationId: rm.orgId }]);
      return t.id;
    }));
    await this.post(ctx, threadId, { body: b.body });
    return { threadId };
  }

  @Get('chat/threads/:id')
  async thread(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Query('before') before?: string) {
    const { t } = await this.svc.load(ctx, id);
    const rows = await this.db.select({ m: messages, author: users.fullName, org: organizations.displayName }).from(messages).innerJoin(users, eq(users.id, messages.authorUserId)).innerJoin(organizations, eq(organizations.id, messages.authorOrgId))
      .where(and(eq(messages.threadId, id), before ? lt(messages.createdAt, new Date(before)) : undefined)).orderBy(desc(messages.createdAt)).limit(100);
    if (t.kind === 'direct') await this.db.update(threadMembers).set({ lastReadAt: new Date() }).where(and(eq(threadMembers.threadId, id), eq(threadMembers.userId, ctx.userId)));
    const members = t.kind === 'direct'
      ? await this.db.select({ userId: users.id, name: users.fullName, org: organizations.displayName }).from(threadMembers).innerJoin(users, eq(users.id, threadMembers.userId)).innerJoin(organizations, eq(organizations.id, threadMembers.organizationId)).where(eq(threadMembers.threadId, id))
      : await this.db.select({ userId: users.id, name: users.fullName, org: organizations.displayName }).from(projectMembers).innerJoin(memberships, and(eq(memberships.organizationId, projectMembers.organizationId), eq(memberships.status, 'active'))).innerJoin(users, eq(users.id, memberships.userId)).innerJoin(organizations, eq(organizations.id, projectMembers.organizationId)).where(and(eq(projectMembers.projectId, t.projectId!), eq(projectMembers.status, 'active')));
    const cutoff = Date.now() - UNSEND_MINUTES * 60_000;
    return {
      id: t.id, kind: t.kind, subject: t.subject, projectId: t.projectId, retentionDays: t.retentionDays, legalHold: t.legalHold, members,
      messages: rows.reverse().map((r) => ({ id: r.m.id, author: r.author, org: r.org, mine: r.m.authorUserId === ctx.userId, createdAt: r.m.createdAt,
        body: r.m.purgedAt ? null : r.m.deletedAt ? null : read(r.m.bodyEnc), state: r.m.purgedAt ? 'purged' : r.m.deletedAt ? 'deleted' : 'visible',
        canDelete: r.m.authorUserId === ctx.userId && !r.m.deletedAt && !r.m.purgedAt && r.m.createdAt.getTime() > cutoff })),
    };
  }

  @Post('chat/threads/:id/messages')
  @HttpCode(201)
  async postMessage(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ChatMessageSchema)) b: { body: string }) {
    return this.post(ctx, id, b);
  }

  private async post(ctx: RequestContext, id: string, b: { body: string }) {
    const { t, orgId } = await this.svc.load(ctx, id);
    if (t.kind === 'direct') {
      const others = await this.db.select({ userId: threadMembers.userId }).from(threadMembers).where(and(eq(threadMembers.threadId, id), ne(threadMembers.userId, ctx.userId)));
      for (const o of others) if (await this.svc.blocked(ctx.userId, o.userId)) throw new ForbiddenException('You cannot message this person');
    }
    const [m] = await this.db.insert(messages).values({ threadId: id, authorUserId: ctx.userId, authorOrgId: orgId, bodyEnc: encryptField(b.body) }).returning();
    await this.db.update(messageThreads).set({ lastMessageAt: m.createdAt }).where(eq(messageThreads.id, id));
    const [me] = await this.db.select({ name: users.fullName }).from(users).where(eq(users.id, ctx.userId));
    for (const r of await this.svc.recipients(t, ctx.userId)) await this.svc.notify(r, 'message', `New message from ${me.name}`, t.kind === 'project' ? `In ${t.subject}` : 'Open the conversation to read it.', t.kind === 'project' ? `/chat/groups/${id}` : `/chat/${id}`);
    return { id: m.id, createdAt: m.createdAt };
  }

  /** Unsend within 15 minutes: the ciphertext is removed, a placeholder remains. */
  @Post('chat/messages/:id/delete')
  @HttpCode(200)
  async unsend(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [m] = await this.db.select().from(messages).where(eq(messages.id, id)).limit(1);
    if (!m || m.authorUserId !== ctx.userId) throw new NotFoundException('Message not found');
    if (m.deletedAt || m.purgedAt) throw new ConflictException('Already removed');
    if (m.createdAt.getTime() < Date.now() - UNSEND_MINUTES * 60_000) throw new ConflictException(`Messages can be deleted within ${UNSEND_MINUTES} minutes of sending`);
    await this.db.update(messages).set({ bodyEnc: null, deletedAt: new Date() }).where(eq(messages.id, id));
    return { ok: true };
  }

  /** Report: the only path by which staff ever see a message — one message, copied into a support ticket. */
  @Post('chat/messages/:id/report')
  @HttpCode(201)
  async report(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ReportMessageSchema)) b: { reason: string }) {
    const [m] = await this.db.select().from(messages).where(eq(messages.id, id)).limit(1);
    if (!m) throw new NotFoundException('Message not found');
    await this.svc.load(ctx, m.threadId);
    if (m.authorUserId === ctx.userId) throw new BadRequestException('You cannot report your own message');
    const excerpt = read(m.bodyEnc) ?? '(message no longer available)';
    const [tk] = await this.db.insert(supportTickets).values({ code: `TKT-${year()}-${randomDigits(6)}`, requesterUserId: ctx.userId, organizationId: ctx.orgId, category: 'abuse', priority: 'high', subject: 'Reported message', firstResponseDueAt: new Date(Date.now() + SLA_HOURS.high * 3600_000), reportedMessageId: id, reportedExcerpt: excerpt.slice(0, 4000) }).returning();
    await this.db.insert(ticketMessages).values({ ticketId: tk.id, authorUserId: ctx.userId, body: b.reason });
    await this.audit.record(ctx, { action: 'chat.message_reported', objectType: 'message', objectId: id, after: { ticket: tk.code } });
    for (const s of await this.svc.staffUsers(['moderator', 'compliance'])) await this.svc.notify(s, 'support', `Message reported: ${tk.code}`, b.reason.slice(0, 140), `/support/tickets?id=${tk.id}`);
    return { ticketId: tk.id, code: tk.code };
  }

  @Post('chat/blocks/:userId')
  @HttpCode(201)
  async block(@Ctx() ctx: RequestContext, @Param('userId', ParseUUIDPipe) userId: string) {
    if (userId === ctx.userId) throw new BadRequestException('You cannot block yourself');
    await this.db.insert(userBlocks).values({ blockerUserId: ctx.userId, blockedUserId: userId }).onConflictDoNothing();
    await this.audit.record(ctx, { action: 'chat.user_blocked', objectType: 'user', objectId: userId });
    return { ok: true };
  }

  @Post('chat/blocks/:userId/remove')
  @HttpCode(200)
  async unblock(@Ctx() ctx: RequestContext, @Param('userId', ParseUUIDPipe) userId: string) {
    await this.db.delete(userBlocks).where(and(eq(userBlocks.blockerUserId, ctx.userId), eq(userBlocks.blockedUserId, userId)));
    return { ok: true };
  }

  @Post('chat/threads/:id/mute')
  @HttpCode(200)
  async mute(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ muted: z.boolean() }))) b: { muted: boolean }) {
    const { t } = await this.svc.load(ctx, id);
    if (t.kind !== 'direct') throw new BadRequestException('Project conversations follow your notification preferences');
    await this.db.update(threadMembers).set({ muted: b.muted }).where(and(eq(threadMembers.threadId, id), eq(threadMembers.userId, ctx.userId)));
    return { muted: b.muted };
  }

  // ---------- retention (compliance) ----------
  @Post('admin/messaging/threads/:id/legal-hold')
  @HttpCode(200)
  async legalHold(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(LegalHoldSchema)) b: z.infer<typeof LegalHoldSchema>) {
    if (!ctx.caps.has('lead.dispute.rule') || !ctx.platformRoles.includes('compliance')) throw new ForbiddenException('Compliance only');
    const [t] = await this.db.update(messageThreads).set({ legalHold: b.hold, legalHoldReason: b.hold ? b.reason : null }).where(eq(messageThreads.id, id)).returning();
    if (!t) throw new NotFoundException();
    await this.audit.record(ctx, { action: b.hold ? 'chat.legal_hold_set' : 'chat.legal_hold_released', objectType: 'message_thread', objectId: id, reason: b.reason });
    return { id: t.id, legalHold: t.legalHold }; // no message content is returned to staff
  }

  /** Retention run (scheduled in production; callable by compliance). Removes bodies past retention; keeps metadata. */
  @Post('admin/messaging/retention/run')
  @HttpCode(200)
  async retention(@Ctx() ctx: RequestContext) {
    if (!ctx.platformRoles.some((r) => ['compliance', 'super_admin'].includes(r))) throw new ForbiddenException('Compliance only');
    const purged = await this.db.execute(sql`update messages m set body_enc = null, purged_at = now() from message_threads t
      where m.thread_id = t.id and m.purged_at is null and t.legal_hold = false and m.created_at < now() - make_interval(days => t.retention_days) returning m.id`);
    const n = (purged as unknown as { rowCount?: number }).rowCount ?? (purged as unknown as unknown[]).length ?? 0;
    await this.audit.record(ctx, { action: 'chat.retention_run', objectType: 'messaging', objectId: null as unknown as string, after: { purged: n } });
    return { purged: n };
  }

  // ---------- 108/109 meetings ----------
  @Post('meetings')
  @RequireOrg()
  @HttpCode(201)
  async schedule(@Ctx() ctx: RequestContext, @Body(body(MeetingSchema)) b: z.infer<typeof MeetingSchema>) {
    if (new Date(b.startsAt).getTime() < Date.now() - 5 * 60_000) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { startsAt: 'Choose a time in the future' } });
    const people = await this.db.select({ userId: memberships.userId, orgId: memberships.organizationId, verified: organizations.verificationStatus }).from(memberships).innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(inArray(memberships.userId, b.attendeeUserIds), eq(memberships.status, 'active'), ne(organizations.type, 'platform')));
    const found = new Map(people.map((p) => [p.userId, p]));
    const bad = b.attendeeUserIds.filter((u) => !found.has(u) || (found.get(u)!.verified !== 'verified' && found.get(u)!.orgId !== ctx.orgId));
    if (bad.length) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { attendeeUserIds: 'Invite colleagues or members of verified organizations only' } });
    if (b.projectId) {
      const [pm] = await this.db.select().from(projectMembers).where(and(eq(projectMembers.projectId, b.projectId), eq(projectMembers.organizationId, ctx.orgId!), eq(projectMembers.status, 'active'))).limit(1);
      if (!pm) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { projectId: 'You are not on this project' } });
    }
    const m = await this.db.transaction(async (tx) => {
      const [m] = await tx.insert(meetings).values({ title: b.title, agenda: b.agenda, startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt), organizerUserId: ctx.userId, organizerOrgId: ctx.orgId!, projectId: b.projectId, roomKey: randomToken(12) }).returning();
      await tx.insert(meetingAttendees).values([{ meetingId: m.id, userId: ctx.userId, organizationId: ctx.orgId!, rsvp: 'accepted' }, ...[...new Set(b.attendeeUserIds)].filter((u) => u !== ctx.userId).map((u) => ({ meetingId: m.id, userId: u, organizationId: found.get(u)!.orgId }))]);
      return m;
    });
    for (const u of b.attendeeUserIds.filter((x) => x !== ctx.userId)) await this.svc.notify(u, 'meeting', `Meeting invite: ${b.title}`, `${new Date(b.startsAt).toUTCString()}`, `/meetings?id=${m.id}`);
    return m;
  }

  @Get('meetings')
  async myMeetings(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ m: meetings, rsvp: meetingAttendees.rsvp, organizer: users.fullName }).from(meetingAttendees).innerJoin(meetings, eq(meetings.id, meetingAttendees.meetingId)).innerJoin(users, eq(users.id, meetings.organizerUserId))
      .where(eq(meetingAttendees.userId, ctx.userId)).orderBy(asc(meetings.startsAt));
    return rows.map((r) => ({ id: r.m.id, title: r.m.title, startsAt: r.m.startsAt, endsAt: r.m.endsAt, status: r.m.status, organizer: r.organizer, isOrganizer: r.m.organizerUserId === ctx.userId, myRsvp: r.rsvp, projectId: r.m.projectId, hasMinutes: !!r.m.minutes, actionItems: (r.m.actionItems as unknown[]).length }));
  }

  private async meetingFor(ctx: RequestContext, id: string) {
    const [m] = await this.db.select().from(meetings).where(eq(meetings.id, id)).limit(1);
    const [me] = m ? await this.db.select().from(meetingAttendees).where(and(eq(meetingAttendees.meetingId, id), eq(meetingAttendees.userId, ctx.userId))).limit(1) : [];
    if (!m || !me) throw new NotFoundException('Meeting not found');
    return { m, me };
  }

  /** 108 — room details. Video is supplied by the configured provider; without one, scheduling/agenda/minutes still work. */
  @Get('meetings/:id')
  async meeting(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { m } = await this.meetingFor(ctx, id);
    const att = await this.db.select({ a: meetingAttendees, name: users.fullName, org: organizations.displayName }).from(meetingAttendees).innerJoin(users, eq(users.id, meetingAttendees.userId)).innerJoin(organizations, eq(organizations.id, meetingAttendees.organizationId)).where(eq(meetingAttendees.meetingId, id));
    const provider = config().MEETING_PROVIDER;
    const now = Date.now();
    const joinable = m.status === 'scheduled' && now >= m.startsAt.getTime() - 15 * 60_000 && now <= m.endsAt.getTime() + 30 * 60_000;
    return { ...m, roomKey: undefined, isOrganizer: m.organizerUserId === ctx.userId, attendees: att.map((x) => ({ userId: x.a.userId, name: x.name, org: x.org, rsvp: x.a.rsvp, joinedAt: x.a.joinedAt })),
      video: { provider, configured: provider === 'jitsi', joinable, joinUrl: provider === 'jitsi' && joinable ? `${config().MEETING_JITSI_BASE_URL}/collabiz-${m.roomKey}` : null } };
  }

  @Post('meetings/:id/rsvp')
  @HttpCode(200)
  async rsvp(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(RsvpSchema)) b: z.infer<typeof RsvpSchema>) {
    const { m } = await this.meetingFor(ctx, id);
    if (m.status !== 'scheduled') throw new ConflictException('This meeting is not open for responses');
    await this.db.update(meetingAttendees).set({ rsvp: b.rsvp }).where(and(eq(meetingAttendees.meetingId, id), eq(meetingAttendees.userId, ctx.userId)));
    if (m.organizerUserId !== ctx.userId) await this.svc.notify(m.organizerUserId, 'meeting', `RSVP: ${m.title}`, `A participant responded: ${b.rsvp}`, `/meetings?id=${id}`);
    return { rsvp: b.rsvp };
  }

  @Post('meetings/:id/join')
  @HttpCode(200)
  async join(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { m } = await this.meetingFor(ctx, id);
    const now = Date.now();
    if (!(m.status === 'scheduled' && now >= m.startsAt.getTime() - 15 * 60_000 && now <= m.endsAt.getTime() + 30 * 60_000)) throw new ConflictException('The room opens 15 minutes before the start time');
    await this.db.update(meetingAttendees).set({ joinedAt: new Date() }).where(and(eq(meetingAttendees.meetingId, id), eq(meetingAttendees.userId, ctx.userId), isNull(meetingAttendees.joinedAt)));
    return { ok: true };
  }

  @Put('meetings/:id/minutes')
  async minutes(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(MinutesSchema)) b: z.infer<typeof MinutesSchema>) {
    const { m } = await this.meetingFor(ctx, id);
    if (m.organizerUserId !== ctx.userId) throw new ForbiddenException('Only the organizer records the minutes');
    if (m.status === 'cancelled') throw new ConflictException('This meeting was cancelled');
    const [u] = await this.db.update(meetings).set({ minutes: b.minutes, actionItems: b.actionItems, status: m.startsAt.getTime() <= Date.now() ? 'completed' : m.status, updatedAt: new Date() }).where(eq(meetings.id, id)).returning();
    const att = await this.db.select({ userId: meetingAttendees.userId }).from(meetingAttendees).where(eq(meetingAttendees.meetingId, id));
    for (const a of att.filter((x) => x.userId !== ctx.userId)) await this.svc.notify(a.userId, 'meeting', `Minutes: ${m.title}`, `${b.actionItems.length} action item(s) recorded.`, `/meetings/${id}/room`);
    return u;
  }

  @Post('meetings/:id/cancel')
  @HttpCode(200)
  async cancelMeeting(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(500) }))) b: { reason: string }) {
    const { m } = await this.meetingFor(ctx, id);
    if (m.organizerUserId !== ctx.userId) throw new ForbiddenException('Only the organizer can cancel');
    if (m.status !== 'scheduled') throw new ConflictException('Only scheduled meetings can be cancelled');
    const [u] = await this.db.update(meetings).set({ status: 'cancelled', cancelReason: b.reason, updatedAt: new Date() }).where(eq(meetings.id, id)).returning();
    const att = await this.db.select({ userId: meetingAttendees.userId }).from(meetingAttendees).where(eq(meetingAttendees.meetingId, id));
    for (const a of att.filter((x) => x.userId !== ctx.userId)) await this.svc.notify(a.userId, 'meeting', `Cancelled: ${m.title}`, b.reason, `/meetings?id=${id}`);
    return u;
  }

  // ---------- 110 announcements ----------
  @Post('admin/announcements')
  @HttpCode(201)
  async announce(@Ctx() ctx: RequestContext, @Body(body(AnnouncementSchema)) b: z.infer<typeof AnnouncementSchema>) {
    if (!ctx.platformRoles.some((r) => ['super_admin', 'unite_admin', 'moderator'].includes(r))) throw new ForbiddenException('Only COLLABIZ staff publish announcements');
    const [a] = await this.db.insert(announcements).values({ ...b, expiresAt: b.expiresAt ? new Date(b.expiresAt) : null, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'announcement.published', objectType: 'announcement', objectId: a.id, after: { title: a.title, audience: a.audience } });
    return a;
  }

  @Get('announcements')
  async announcementsList(@Ctx() ctx: RequestContext) {
    const types = ctx.memberships.map((m) => m.orgType);
    const verifiedPartner = ctx.orgVerificationStatus === 'verified' && (ctx.orgType === 'partner_company' || ctx.orgType === 'partner_individual');
    const audiences = ['all', ...(types.some((t) => t === 'partner_company' || t === 'partner_individual') ? ['partners'] : []), ...(verifiedPartner ? ['verified_partners'] : []), ...(types.includes('group_company') ? ['group_companies'] : [])];
    const rows = await this.db.select({ a: announcements, readAt: announcementReads.readAt }).from(announcements).leftJoin(announcementReads, and(eq(announcementReads.announcementId, announcements.id), eq(announcementReads.userId, ctx.userId)))
      .where(and(inArray(announcements.audience, ctx.platformRoles.length ? ['all', 'partners', 'verified_partners', 'group_companies'] : audiences), or(isNull(announcements.expiresAt), gt(announcements.expiresAt, new Date())))).orderBy(desc(announcements.important), desc(announcements.publishedAt)).limit(100);
    return rows.map((r) => ({ ...r.a, read: !!r.readAt }));
  }

  @Post('announcements/:id/read')
  @HttpCode(200)
  async markAnnouncement(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.insert(announcementReads).values({ announcementId: id, userId: ctx.userId }).onConflictDoNothing();
    return { ok: true };
  }

  // ---------- 111 notifications & 147 preferences ----------
  @Get('notifications')
  async center(@Ctx() ctx: RequestContext, @Query('kind') kind?: string, @Query('unread') unread?: string) {
    const rows = await this.db.select().from(notifications).where(and(eq(notifications.userId, ctx.userId), kind ? eq(notifications.kind, kind) : undefined, unread === 'true' ? isNull(notifications.readAt) : undefined)).orderBy(desc(notifications.createdAt)).limit(200);
    const counts = await this.db.select({ kind: notifications.kind, n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt))).groupBy(notifications.kind);
    return { items: rows, unreadByKind: Object.fromEntries(counts.map((c) => [c.kind, c.n])), unread: counts.reduce((s, c) => s + c.n, 0) };
  }

  @Post('notifications/read')
  @HttpCode(200)
  async readNotifications(@Ctx() ctx: RequestContext, @Body(body(z.object({ ids: z.array(z.string().uuid()).max(500).optional(), all: z.boolean().optional() }))) b: { ids?: string[]; all?: boolean }) {
    if (!b.all && !b.ids?.length) throw new BadRequestException('Choose notifications to mark as read');
    await this.db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt), b.all ? undefined : inArray(notifications.id, b.ids!)));
    return { ok: true };
  }

  @Get('me/notification-preferences')
  async prefs(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, ctx.userId));
    return NOTIFICATION_KINDS.map((k) => {
      const r = rows.find((x) => x.kind === k);
      const mandatory = (MANDATORY_NOTIFICATION_KINDS as readonly string[]).includes(k);
      return { kind: k, inApp: true, email: mandatory ? true : r?.email ?? k !== 'message', sms: r?.sms ?? false, push: r?.push ?? true, mandatory };
    });
  }

  @Put('me/notification-preferences')
  async savePrefs(@Ctx() ctx: RequestContext, @Body(body(NotificationPrefsSchema)) b: z.infer<typeof NotificationPrefsSchema>) {
    for (const p of b.preferences) {
      const mandatory = (MANDATORY_NOTIFICATION_KINDS as readonly string[]).includes(p.kind);
      if (mandatory && !p.email) throw new BadRequestException(`Email notices for ${p.kind} cannot be switched off — they carry legal or financial information`);
      await this.db.insert(notificationPreferences).values({ userId: ctx.userId, kind: p.kind, email: p.email, sms: p.sms, push: p.push })
        .onConflictDoUpdate({ target: [notificationPreferences.userId, notificationPreferences.kind], set: { email: p.email, sms: p.sms, push: p.push, updatedAt: new Date() } });
    }
    await this.audit.record(ctx, { action: 'notifications.preferences_updated', objectType: 'user', objectId: ctx.userId, after: b.preferences.map((p) => `${p.kind}:${p.email ? 'E' : ''}${p.sms ? 'S' : ''}${p.push ? 'P' : ''}`) });
    return this.prefs(ctx);
  }
}

// ---------------------------------------------------------------------------------------------------------------------

function isStaff(ctx: RequestContext) {
  return ctx.caps.has('support.manage') || ctx.platformRoles.some((r) => ['compliance', 'super_admin'].includes(r));
}

@ApiTags('support')
@Controller()
export class SupportController {
  constructor(@InjectDb() private db: Db, private svc: CommsService, private audit: AuditService) {}

  // ---------- 112 tickets ----------
  @Post('support/tickets')
  @HttpCode(201)
  async open(@Ctx() ctx: RequestContext, @Body(body(TicketSchema)) b: z.infer<typeof TicketSchema>) {
    const [t] = await this.db.insert(supportTickets).values({ code: `TKT-${year()}-${randomDigits(6)}`, requesterUserId: ctx.userId, organizationId: ctx.orgId, category: b.category, priority: b.priority, subject: b.subject, firstResponseDueAt: new Date(Date.now() + SLA_HOURS[b.priority] * 3600_000) }).returning();
    await this.db.insert(ticketMessages).values({ ticketId: t.id, authorUserId: ctx.userId, body: b.body });
    for (const s of await this.svc.staffUsers(['moderator'])) await this.svc.notify(s, 'support', `New ticket ${t.code} (${b.priority})`, b.subject, `/support/tickets?id=${t.id}`);
    return t;
  }

  @Get('support/tickets')
  async list(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    await this.svc.escalateOverdue();
    const staff = isStaff(ctx);
    const rows = await this.db.select({ t: supportTickets, requester: users.fullName }).from(supportTickets).innerJoin(users, eq(users.id, supportTickets.requesterUserId))
      .where(and(staff ? undefined : eq(supportTickets.requesterUserId, ctx.userId), status ? eq(supportTickets.status, status) : undefined)).orderBy(desc(supportTickets.updatedAt)).limit(200);
    return { staff, tickets: rows.map((r) => ({ ...r.t, reportedExcerpt: staff ? r.t.reportedExcerpt : undefined, requester: r.requester, overdue: !r.t.firstRespondedAt && r.t.firstResponseDueAt < new Date() && !['resolved', 'closed'].includes(r.t.status) })) };
  }

  private async ticketFor(ctx: RequestContext, id: string) {
    const [t] = await this.db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
    const staff = isStaff(ctx);
    if (!t || !(staff || t.requesterUserId === ctx.userId)) throw new NotFoundException('Ticket not found');
    return { t, staff };
  }

  @Get('support/tickets/:id')
  async ticket(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { t, staff } = await this.ticketFor(ctx, id);
    const msgs = await this.db.select({ m: ticketMessages, author: users.fullName }).from(ticketMessages).innerJoin(users, eq(users.id, ticketMessages.authorUserId)).where(and(eq(ticketMessages.ticketId, id), staff ? undefined : eq(ticketMessages.internal, false))).orderBy(asc(ticketMessages.createdAt));
    if (staff && t.reportedMessageId) await this.audit.record(ctx, { action: 'support.reported_message_viewed', objectType: 'message', objectId: t.reportedMessageId });
    return { ...t, reportedExcerpt: staff ? t.reportedExcerpt : undefined, staff, canEscalate: !staff && ['open', 'in_progress'].includes(t.status) && !t.firstRespondedAt && t.firstResponseDueAt < new Date(),
      messages: msgs.map((x) => ({ id: x.m.id, body: x.m.body, author: x.m.fromStaff ? `${x.author} (COLLABIZ Support)` : x.author, fromStaff: x.m.fromStaff, internal: x.m.internal, createdAt: x.m.createdAt })) };
  }

  @Post('support/tickets/:id/messages')
  @HttpCode(201)
  async reply(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(TicketReplySchema)) b: z.infer<typeof TicketReplySchema>) {
    const { t, staff } = await this.ticketFor(ctx, id);
    if (t.status === 'closed') throw new ConflictException('This ticket is closed; open a new one');
    if (b.internal && !staff) throw new ForbiddenException('Only support staff add internal notes');
    const [m] = await this.db.insert(ticketMessages).values({ ticketId: id, authorUserId: ctx.userId, fromStaff: staff, internal: b.internal, body: b.body }).returning();
    if (staff && !b.internal) {
      await this.db.update(supportTickets).set({ firstRespondedAt: t.firstRespondedAt ?? new Date(), status: t.status === 'open' ? 'in_progress' : t.status, assigneeUserId: t.assigneeUserId ?? ctx.userId, version: t.version + 1, updatedAt: new Date() }).where(eq(supportTickets.id, id));
      await this.svc.notify(t.requesterUserId, 'support', `Reply on ${t.code}`, b.body.slice(0, 140), `/support/tickets?id=${id}`);
    } else if (!staff && t.status === 'resolved') {
      assertTransition(TicketMachine, 'resolved', 'open');
      await this.db.update(supportTickets).set({ status: 'open', resolvedAt: null, version: t.version + 1, updatedAt: new Date() }).where(eq(supportTickets.id, id)); // reply re-opens
    } else await this.db.update(supportTickets).set({ updatedAt: new Date() }).where(eq(supportTickets.id, id));
    return m;
  }

  @Post('support/tickets/:id/status')
  @HttpCode(200)
  async setStatus(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(TicketStatusSchema)) b: z.infer<typeof TicketStatusSchema>) {
    const { t, staff } = await this.ticketFor(ctx, id);
    if (!staff && !(b.status === 'closed' && t.status === 'resolved')) throw new ForbiddenException('Only support staff change ticket status (you can close a resolved ticket)');
    assertTransition(TicketMachine, t.status as TicketState, b.status as TicketState);
    const [u] = await this.db.update(supportTickets).set({ status: b.status, resolvedAt: b.status === 'resolved' ? new Date() : t.resolvedAt, version: t.version + 1, updatedAt: new Date() }).where(and(eq(supportTickets.id, id), eq(supportTickets.version, t.version))).returning();
    if (!u) throw new ConflictException('The ticket was changed concurrently');
    if (b.note) await this.db.insert(ticketMessages).values({ ticketId: id, authorUserId: ctx.userId, fromStaff: staff, body: b.note });
    if (staff) await this.svc.notify(t.requesterUserId, 'support', `${t.code}: ${b.status.replace('_', ' ')}`, b.note ?? '', `/support/tickets?id=${id}`);
    return u;
  }

  /** Requester escalation: allowed when the first-response deadline has passed without a reply. */
  @Post('support/tickets/:id/escalate')
  @HttpCode(200)
  async escalate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(10).max(1000) }))) b: { reason: string }) {
    const { t } = await this.ticketFor(ctx, id);
    if (t.requesterUserId !== ctx.userId) throw new ForbiddenException('Only the requester escalates');
    if (!(['open', 'in_progress'].includes(t.status) && !t.firstRespondedAt && t.firstResponseDueAt < new Date())) throw new ConflictException('You can escalate once the response deadline has passed without a reply');
    assertTransition(TicketMachine, t.status as TicketState, 'escalated');
    const [u] = await this.db.update(supportTickets).set({ status: 'escalated', escalatedAt: new Date(), escalationReason: b.reason, version: t.version + 1, updatedAt: new Date() }).where(eq(supportTickets.id, id)).returning();
    for (const s of await this.svc.staffUsers(['compliance', 'super_admin'])) await this.svc.notify(s, 'support', `Escalated by requester: ${t.code}`, b.reason, `/support/tickets?id=${id}`);
    await this.audit.record(ctx, { action: 'support.escalated', objectType: 'support_ticket', objectId: id, reason: b.reason });
    return u;
  }

  @Post('support/tickets/:id/rating')
  @HttpCode(200)
  async rate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ satisfaction: z.number().int().min(1).max(5) }))) b: { satisfaction: number }) {
    const { t } = await this.ticketFor(ctx, id);
    if (t.requesterUserId !== ctx.userId || !['resolved', 'closed'].includes(t.status)) throw new ConflictException('Rate a ticket after it is resolved');
    const [u] = await this.db.update(supportTickets).set({ satisfaction: b.satisfaction }).where(eq(supportTickets.id, id)).returning();
    return u;
  }

  /** Scheduled in production; callable by support staff and used by the ticket list. */
  @Post('admin/support/sweep')
  @HttpCode(200)
  async sweep(@Ctx() ctx: RequestContext) {
    if (!isStaff(ctx)) throw new ForbiddenException('Support staff only');
    return { escalated: await this.svc.escalateOverdue() };
  }

  // ---------- 150 help, feedback & closure ----------
  @Get('help/articles')
  async help() {
    // Published help pages from the content system (142) take precedence; the built-in set is the fallback.
    const managed = await this.db.select().from(contentPages).where(and(eq(contentPages.kind, 'help'), eq(contentPages.status, 'published'), eq(contentPages.locale, 'en-IN'))).orderBy(contentPages.createdAt);
    if (managed.length) return managed.map((p) => ({ id: p.slug, title: p.title, body: p.body }));
    return [
      { id: 'protected-leads', title: 'How lead protection works', body: 'Register the customer with consent and evidence. Unite reviews within 4 business hours; your certificate shows the protection window.' },
      { id: 'earned-commission', title: 'When is commission earned?', body: 'Only when the customer pays for a certified milestone under the contract. Projected amounts are estimates.' },
      { id: 'teams-nda', title: 'Forming a collaboration team', body: 'Invite verified partners; they see the team workspace only after accepting and signing the NDA.' },
      { id: 'sealed-bids', title: 'Are my tender bids private?', body: 'Yes. Bids are encrypted and sealed until opening; competitors never see your price.' },
      { id: 'data-rights', title: 'Your data rights', body: 'Export your data or request correction or deletion from Settings → Privacy. Some records are kept for legal retention periods.' },
    ];
  }

  @Post('feedback')
  @HttpCode(201)
  async feedback(@Ctx() ctx: RequestContext, @Body(body(FeedbackSchema)) b: z.infer<typeof FeedbackSchema>) {
    const [f] = await this.db.insert(feedback).values({ userId: ctx.userId, rating: b.rating, area: b.area, comment: b.comment }).returning();
    return { id: f.id, thanks: true };
  }

  /** Closure blockers: sole owner of an organization with live contracts, projects or unpaid commission. */
  @Get('account/closure-check')
  async closureCheck(@Ctx() ctx: RequestContext) {
    const blockers: string[] = [];
    for (const m of ctx.memberships.filter((x) => x.role === 'org_owner')) {
      const owners = await this.db.select({ n: sql<number>`count(*)::int` }).from(memberships).where(and(eq(memberships.organizationId, m.organizationId), eq(memberships.role, 'org_owner'), eq(memberships.status, 'active')));
      if (owners[0].n > 1) continue;
      const [c] = await this.db.select({ n: sql<number>`count(*)::int` }).from(contracts).where(and(or(eq(contracts.issuerOrgId, m.organizationId), eq(contracts.counterpartyOrgId, m.organizationId)), inArray(contracts.status, ['approved', 'partially_signed', 'executed'])));
      const [p] = await this.db.select({ n: sql<number>`count(*)::int` }).from(projectMembers).innerJoin(projects, eq(projects.id, projectMembers.projectId)).where(and(eq(projectMembers.organizationId, m.organizationId), eq(projectMembers.status, 'active'), inArray(projects.status, ['planning', 'active', 'on_hold'])));
      const [e] = await this.db.select({ n: sql<number>`count(*)::int` }).from(commissionEntries).where(and(eq(commissionEntries.beneficiaryOrgId, m.organizationId), inArray(commissionEntries.status, ['earned', 'approved', 'invoiced', 'disputed', 'on_hold'])));
      if (c.n) blockers.push(`${m.orgName}: ${c.n} live contract(s) — transfer ownership or complete them first`);
      if (p.n) blockers.push(`${m.orgName}: ${p.n} active project(s) — add another owner or close them first`);
      if (e.n) blockers.push(`${m.orgName}: ${e.n} commission line(s) not yet paid — wait for settlement or add another owner`);
    }
    const [open] = await this.db.select({ id: dataRequests.id }).from(dataRequests).where(and(eq(dataRequests.userId, ctx.userId), eq(dataRequests.kind, 'account_closure'), inArray(dataRequests.status, ['open', 'in_progress']))).limit(1);
    return { canClose: blockers.length === 0 && !open, blockers, pendingRequest: !!open };
  }

  @Post('account/closure')
  @HttpCode(201)
  async close(@Ctx() ctx: RequestContext, @Body(body(AccountClosureSchema)) b: z.infer<typeof AccountClosureSchema>) {
    const [u] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, ctx.userId));
    if (u.email.toLowerCase() !== b.confirmEmail.toLowerCase()) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { confirmEmail: 'Type the email address of this account' } });
    const check = await this.closureCheck(ctx);
    if (check.pendingRequest) throw new ConflictException('A closure request is already in progress');
    if (check.blockers.length) throw new ConflictException({ message: 'Your account cannot be closed yet', problems: check.blockers });
    const [r] = await this.db.insert(dataRequests).values({ userId: ctx.userId, kind: 'account_closure', details: b.reason, dueAt: new Date(Date.now() + 30 * 86400_000) }).returning();
    await this.audit.record(ctx, { action: 'privacy.account_closure_requested', objectType: 'data_request', objectId: r.id });
    await this.svc.notify(ctx.userId, 'security', 'Account closure requested', 'Your account will be closed in 30 days. Sign in and cancel from Help if this was not you.', '/help');
    return { id: r.id, effectiveAfter: r.dueAt };
  }
}

@Module({ controllers: [CommsController, SupportController], providers: [CommsService], exports: [CommsService] })
export class CommsModule {}
