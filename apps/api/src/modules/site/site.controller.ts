/**
 * Website content, guide chat and U meet (tested in test/site.e2e.ts).
 *
 *  - Social links and the YouTube video library are set by Unite admins; the public site only reads them.
 *  - The guide chat answers by rules with links to the right place. On request it hands the conversation to the Unite
 *    team (admin console → Guide chats); staff replies appear in the same chat. A visitor holds a random token for
 *    their conversation; members' conversations are also linked to their account.
 *  - U meet: instant meetings, video inside the room (configured provider), and chat for attendees only.
 */
import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { and, asc, desc, eq, inArray, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { GUIDE_WELCOME, GuideMessageSchema, SocialLinksSchema, VideoSchema, guideReply, youtubeId } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { guideConversations, guideMessages, meetingAttendees, meetingMessages, meetings, memberships, notifications, organizations, siteSettings, siteVideos, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomToken, sha256 } from '../../common/crypto';
import { config } from '../../config';

const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const InstantSchema = z.object({ title: z.string().trim().min(3).max(200).default('U meet'), minutes: z.number().int().min(15).max(480).default(60), attendeeUserIds: z.array(z.string().uuid()).max(50).default([]) });
const ChatSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const ReplySchema = z.object({ body: z.string().trim().min(1).max(3000) });

@ApiTags('site')
@Controller()
export class SiteController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  // ------------------------------------------------------------------ public website content
  @Public()
  @Get('public/site')
  async site() {
    const [social] = await this.db.select().from(siteSettings).where(eq(siteSettings.key, 'social')).limit(1);
    const videos = await this.db.select({ youtubeId: siteVideos.youtubeId, title: siteVideos.title, description: siteVideos.description, placements: siteVideos.placements }).from(siteVideos)
      .where(eq(siteVideos.published, true)).orderBy(asc(siteVideos.sort), desc(siteVideos.createdAt)).limit(200);
    return { social: social?.value ?? {}, videos };
  }

  @Get('admin/site')
  async adminSite(@Ctx() ctx: RequestContext) {
    if (!staff(ctx)) throw new ForbiddenException('Only Unite admins manage website content');
    const [social] = await this.db.select().from(siteSettings).where(eq(siteSettings.key, 'social')).limit(1);
    return { social: social?.value ?? {}, videos: await this.db.select().from(siteVideos).orderBy(asc(siteVideos.sort), desc(siteVideos.createdAt)) };
  }

  @Put('admin/site/social')
  async setSocial(@Ctx() ctx: RequestContext, @Body(body(SocialLinksSchema)) b: Record<string, string | undefined>) {
    if (!staff(ctx)) throw new ForbiddenException();
    const value = Object.fromEntries(Object.entries(b).filter(([, v]) => !!v));
    await this.db.insert(siteSettings).values({ key: 'social', value, updatedBy: ctx.userId }).onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: ctx.userId, updatedAt: new Date() } });
    await this.audit.record(ctx, { action: 'site.social_updated', objectType: 'site_settings', objectId: 'social', after: value });
    return { social: value };
  }

  @Post('admin/site/videos')
  @HttpCode(201)
  async addVideo(@Ctx() ctx: RequestContext, @Body(body(VideoSchema)) b: z.infer<typeof VideoSchema>) {
    if (!staff(ctx)) throw new ForbiddenException();
    const [v] = await this.db.insert(siteVideos).values({ youtubeId: youtubeId(b.url)!, title: b.title, description: b.description ?? null, placements: b.placements, sort: b.sort, published: b.published, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'site.video_added', objectType: 'site_video', objectId: v.id, after: { youtubeId: v.youtubeId, placements: v.placements } });
    return v;
  }

  @Put('admin/site/videos/:id')
  async updateVideo(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(VideoSchema)) b: z.infer<typeof VideoSchema>) {
    if (!staff(ctx)) throw new ForbiddenException();
    const [v] = await this.db.update(siteVideos).set({ youtubeId: youtubeId(b.url)!, title: b.title, description: b.description ?? null, placements: b.placements, sort: b.sort, published: b.published, updatedAt: new Date() }).where(eq(siteVideos.id, id)).returning();
    if (!v) throw new NotFoundException();
    return v;
  }

  @Delete('admin/site/videos/:id')
  async deleteVideo(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    if (!staff(ctx)) throw new ForbiddenException();
    const [v] = await this.db.delete(siteVideos).where(eq(siteVideos.id, id)).returning({ id: siteVideos.id });
    if (!v) throw new NotFoundException();
    await this.audit.record(ctx, { action: 'site.video_removed', objectType: 'site_video', objectId: id });
    return { ok: true };
  }

  // ------------------------------------------------------------------ guide chat
  private async thread(convId: string) {
    return this.db.select({ id: guideMessages.id, sender: guideMessages.sender, body: guideMessages.body, links: guideMessages.links, createdAt: guideMessages.createdAt, staff: users.fullName })
      .from(guideMessages).leftJoin(users, eq(users.id, guideMessages.staffUserId)).where(eq(guideMessages.conversationId, convId)).orderBy(asc(guideMessages.createdAt));
  }
  private async conv(token: string) {
    const [c] = await this.db.select().from(guideConversations).where(eq(guideConversations.tokenHash, sha256(token))).limit(1);
    if (!c) throw new NotFoundException('This chat has ended. Start a new one.');
    return c;
  }

  /** Visitor or member sends a message; the guide replies, or the team does once the chat is handed over. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('public/guide/messages')
  @HttpCode(200)
  async guide(@Ctx() ctx: RequestContext, @Body(body(GuideMessageSchema)) b: z.infer<typeof GuideMessageSchema>) {
    let token = b.token;
    let c = token ? await this.conv(token).catch(() => null) : null;
    if (!c) {
      token = randomToken(24);
      [c] = await this.db.insert(guideConversations).values({ tokenHash: sha256(token), userId: ctx?.userId ?? null, orgId: ctx?.orgId ?? null, page: b.page ?? null, name: b.name ?? null, email: b.email ?? null }).returning();
      await this.db.insert(guideMessages).values({ conversationId: c.id, sender: 'guide', body: GUIDE_WELCOME.text, links: GUIDE_WELCOME.links });
    }
    if (b.name || b.email) await this.db.update(guideConversations).set({ name: b.name ?? c.name, email: b.email ?? c.email }).where(eq(guideConversations.id, c.id));
    await this.db.insert(guideMessages).values({ conversationId: c.id, sender: 'visitor', body: b.text });
    const r = b.handover ? { ...guideReply('talk to a person'), handover: true } : guideReply(b.text);
    const withTeam = c.status === 'waiting' || c.status === 'answered';
    if (r.handover || withTeam) {
      const email = b.email ?? c.email;
      if (!withTeam) {
        if (!ctx?.userId && !email) {
          await this.db.insert(guideMessages).values({ conversationId: c.id, sender: 'guide', body: 'Please add your email so the Unite team can reply even if you leave this page.', links: [] });
        } else {
          await this.db.update(guideConversations).set({ status: 'waiting' }).where(eq(guideConversations.id, c.id));
          await this.db.insert(guideMessages).values({ conversationId: c.id, sender: 'guide', body: r.text, links: [] });
          const ms = await this.db.selectDistinct({ u: memberships.userId }).from(memberships).where(and(eq(memberships.status, 'active'), inArray(memberships.role, ['unite_admin', 'super_admin'])));
          if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'support', title: 'Guide chat: someone asked for a person', body: `“${b.text.slice(0, 140)}”${b.page ? ` on ${b.page}` : ''}`, link: '/guide-chats' })));
        }
      }
      // While the team handles the chat the guide stays quiet.
    } else {
      await this.db.insert(guideMessages).values({ conversationId: c.id, sender: 'guide', body: r.text, links: r.links });
    }
    await this.db.update(guideConversations).set({ lastMessageAt: new Date() }).where(eq(guideConversations.id, c.id));
    const [fresh] = await this.db.select({ status: guideConversations.status }).from(guideConversations).where(eq(guideConversations.id, c.id));
    return { token, status: fresh.status, messages: await this.thread(c.id) };
  }

  @Public()
  @Get('public/guide/messages')
  async guideThread(@Query('token') token: string) {
    if (!token) throw new BadRequestException();
    const c = await this.conv(token);
    return { status: c.status, messages: await this.thread(c.id) };
  }

  @Get('admin/guide/conversations')
  async guideInbox(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    if (!staff(ctx)) throw new ForbiddenException();
    const rows = await this.db.select({ c: guideConversations, user: users.fullName, org: organizations.displayName }).from(guideConversations)
      .leftJoin(users, eq(users.id, guideConversations.userId)).leftJoin(organizations, eq(organizations.id, guideConversations.orgId))
      .where(status === 'all' ? undefined : status ? eq(guideConversations.status, status) : or(eq(guideConversations.status, 'waiting'), eq(guideConversations.status, 'answered')))
      .orderBy(desc(guideConversations.lastMessageAt)).limit(200);
    return { items: rows.map(({ c, user, org }) => ({ id: c.id, status: c.status, name: user ?? c.name, email: c.email, organization: org, page: c.page, lastMessageAt: c.lastMessageAt, member: !!c.userId })) };
  }

  @Get('admin/guide/conversations/:id')
  async guideConv(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    if (!staff(ctx)) throw new ForbiddenException();
    const [c] = await this.db.select().from(guideConversations).where(eq(guideConversations.id, id)).limit(1);
    if (!c) throw new NotFoundException();
    return { id: c.id, status: c.status, name: c.name, email: c.email, page: c.page, messages: await this.thread(id) };
  }

  @Post('admin/guide/conversations/:id/reply')
  @HttpCode(201)
  async guideReplyStaff(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ReplySchema)) b: z.infer<typeof ReplySchema>) {
    if (!staff(ctx)) throw new ForbiddenException();
    const [c] = await this.db.select().from(guideConversations).where(eq(guideConversations.id, id)).limit(1);
    if (!c) throw new NotFoundException();
    if (c.status === 'closed') throw new ConflictException('This chat is closed');
    await this.db.insert(guideMessages).values({ conversationId: id, sender: 'staff', body: b.body, staffUserId: ctx.userId });
    await this.db.update(guideConversations).set({ status: 'answered', lastMessageAt: new Date() }).where(eq(guideConversations.id, id));
    if (c.userId) await this.db.insert(notifications).values({ userId: c.userId, kind: 'support', title: 'The Unite team replied in your chat', body: b.body.slice(0, 160), link: '/dashboard' });
    await this.audit.record(ctx, { action: 'guide.staff_replied', objectType: 'guide_conversation', objectId: id });
    return { ok: true };
  }

  @Post('admin/guide/conversations/:id/close')
  @HttpCode(200)
  async guideClose(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    if (!staff(ctx)) throw new ForbiddenException();
    await this.db.update(guideConversations).set({ status: 'closed' }).where(eq(guideConversations.id, id));
    return { ok: true };
  }

  // ------------------------------------------------------------------ U meet
  /** Start a meeting now (room open immediately) with optional invitees: colleagues or members of verified businesses. */
  @Post('umeet/instant')
  @RequireOrg()
  @HttpCode(201)
  async instant(@Ctx() ctx: RequestContext, @Body(body(InstantSchema)) b: z.infer<typeof InstantSchema>) {
    const people = b.attendeeUserIds.length ? await this.db.select({ userId: memberships.userId, orgId: memberships.organizationId, verified: organizations.verificationStatus }).from(memberships).innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(inArray(memberships.userId, b.attendeeUserIds), eq(memberships.status, 'active'), ne(organizations.type, 'platform'))) : [];
    const found = new Map(people.map((p) => [p.userId, p]));
    if (b.attendeeUserIds.some((u) => !found.has(u) || (found.get(u)!.verified !== 'verified' && found.get(u)!.orgId !== ctx.orgId))) throw new BadRequestException('Invite colleagues or members of verified businesses only');
    const now = new Date();
    const m = await this.db.transaction(async (tx) => {
      const [m] = await tx.insert(meetings).values({ title: b.title, startsAt: now, endsAt: new Date(now.getTime() + b.minutes * 60_000), organizerUserId: ctx.userId, organizerOrgId: ctx.orgId!, roomKey: randomToken(12) }).returning();
      await tx.insert(meetingAttendees).values([{ meetingId: m.id, userId: ctx.userId, organizationId: ctx.orgId!, rsvp: 'accepted' },
        ...[...new Set(b.attendeeUserIds)].filter((u) => u !== ctx.userId).map((u) => ({ meetingId: m.id, userId: u, organizationId: found.get(u)!.orgId }))]);
      return m;
    });
    const invitees = b.attendeeUserIds.filter((u) => u !== ctx.userId);
    if (invitees.length) await this.db.insert(notifications).values(invitees.map((u) => ({ userId: u, kind: 'meeting', title: `Join now: ${b.title}`, body: 'A U meet meeting has started.', link: `/meetings/${m.id}/room` })));
    return { id: m.id, title: m.title, room: `/meetings/${m.id}/room` };
  }

  /** Video provider for the room page (the room itself is checked on GET meetings/:id). */
  @Get('umeet/config')
  umeetConfig() {
    const c = config();
    return { provider: c.MEETING_PROVIDER, embed: c.MEETING_PROVIDER === 'jitsi', base: c.MEETING_PROVIDER === 'jitsi' ? c.MEETING_JITSI_BASE_URL : null };
  }

  private async attendee(ctx: RequestContext, meetingId: string) {
    const [a] = await this.db.select({ id: meetingAttendees.id }).from(meetingAttendees).where(and(eq(meetingAttendees.meetingId, meetingId), eq(meetingAttendees.userId, ctx.userId))).limit(1);
    if (!a) throw new NotFoundException('Meeting not found');
  }

  @Get('meetings/:id/messages')
  async chat(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.attendee(ctx, id);
    const rows = await this.db.select({ id: meetingMessages.id, body: meetingMessages.body, createdAt: meetingMessages.createdAt, userId: meetingMessages.userId, name: users.fullName }).from(meetingMessages)
      .innerJoin(users, eq(users.id, meetingMessages.userId)).where(eq(meetingMessages.meetingId, id)).orderBy(asc(meetingMessages.createdAt)).limit(500);
    return { items: rows.map((r) => ({ ...r, mine: r.userId === ctx.userId })) };
  }

  @Post('meetings/:id/messages')
  @HttpCode(201)
  async say(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ChatSchema)) b: z.infer<typeof ChatSchema>) {
    await this.attendee(ctx, id);
    const [m] = await this.db.insert(meetingMessages).values({ meetingId: id, userId: ctx.userId, body: b.body }).returning();
    return m;
  }
}

@Module({ controllers: [SiteController] })
export class SiteModule {}
