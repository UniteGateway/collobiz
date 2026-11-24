/**
 * Unite Club — chapters, members, meetings and events, referrals and service (tested in test/unite-club.e2e.ts).
 *
 *  - Any member of a business on COLLABIZ can propose a chapter; a Unite admin approves it and the proposer becomes
 *    its president. People apply to join an active chapter; the chapter's president or secretary decides.
 *  - One member per business category in a chapter when the chapter chooses that rule (the default).
 *  - Only active members see the chapter's member list, events and referrals. The public sees the chapter, its
 *    schedule and which business categories are filled — not member names.
 *  - Referral contact details are passed only with the person's consent; business won is reported by the member.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { UC_OFFICERS, UC_VALUES, UcApplySchema, UcChapterSchema, UcDecisionSchema, UcEventSchema, UcHoursSchema, UcReferralSchema, UcReferralUpdateSchema, UcRoleSchema, UcRsvpSchema, ucCategoryKey, ucChapterSlug } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { meetingAttendees, meetings, memberships, notifications, organizations, ucChapters, ucEvents, ucMembers, ucReferrals, ucRsvps, ucServiceHours, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomToken } from '../../common/crypto';

type Chapter = typeof ucChapters.$inferSelect;
const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const publicChapter = (c: Chapter, members: number, categories: string[]) => ({ slug: c.slug, name: c.name, city: c.city, state: c.state, country: c.country, about: c.about, meetingSchedule: c.meetingSchedule, meetsOnline: c.meetsOnline, exclusiveCategories: c.exclusiveCategories, members, categories });

@ApiTags('unite-club')
@Controller()
export class UniteClubController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private async chapter(slug: string) {
    const [c] = await this.db.select().from(ucChapters).where(eq(ucChapters.slug, slug)).limit(1);
    if (!c) throw new NotFoundException('Chapter not found');
    return c;
  }
  private async active(chapterId: string) {
    return this.db.select({ m: ucMembers, name: users.fullName, org: organizations.displayName }).from(ucMembers).innerJoin(users, eq(users.id, ucMembers.userId)).innerJoin(organizations, eq(organizations.id, ucMembers.orgId))
      .where(and(eq(ucMembers.chapterId, chapterId), eq(ucMembers.status, 'active'))).orderBy(asc(ucMembers.category));
  }
  private async me(ctx: RequestContext, chapterId: string) {
    const [m] = await this.db.select().from(ucMembers).where(and(eq(ucMembers.chapterId, chapterId), eq(ucMembers.userId, ctx.userId))).limit(1);
    return m ?? null;
  }
  private async member(ctx: RequestContext, chapterId: string) {
    const m = await this.me(ctx, chapterId);
    if (!m || m.status !== 'active') throw new ForbiddenException('Only members of this chapter can do this');
    return m;
  }
  private async officer(ctx: RequestContext, chapterId: string) {
    if (staff(ctx)) return null;
    const m = await this.member(ctx, chapterId);
    if (!UC_OFFICERS.includes(m.role as never)) throw new ForbiddenException('Only the chapter president or secretary can do this');
    return m;
  }
  private async seatTaken(c: Chapter, category: string, exceptUser?: string) {
    if (!c.exclusiveCategories) return false;
    const key = ucCategoryKey(category);
    return (await this.active(c.id)).some((x) => ucCategoryKey(x.m.category) === key && x.m.userId !== exceptUser);
  }
  private async notify(userIds: string[], title: string, body: string, link: string) {
    const ids = [...new Set(userIds)];
    if (ids.length) await this.db.insert(notifications).values(ids.map((u) => ({ userId: u, kind: 'club', title, body, link })));
  }

  // ------------------------------------------------------------------ public
  @Public()
  @Get('public/unite-club')
  async overview() {
    const chapters = await this.db.select().from(ucChapters).where(eq(ucChapters.status, 'active')).orderBy(asc(ucChapters.city), asc(ucChapters.name));
    const counts = chapters.length ? await this.db.select({ chapterId: ucMembers.chapterId, n: sql<number>`count(*)::int`, cats: sql<string[]>`array_agg(${ucMembers.category} order by ${ucMembers.category})` }).from(ucMembers)
      .where(and(inArray(ucMembers.chapterId, chapters.map((c) => c.id)), eq(ucMembers.status, 'active'))).groupBy(ucMembers.chapterId) : [];
    const by = new Map(counts.map((c) => [c.chapterId, c]));
    const [refs] = await this.db.select({ n: sql<number>`count(*)::int` }).from(ucReferrals);
    return {
      values: UC_VALUES,
      chapters: chapters.map((c) => publicChapter(c, by.get(c.id)?.n ?? 0, by.get(c.id)?.cats ?? [])),
      stats: { chapters: chapters.length, members: counts.reduce((s, c) => s + c.n, 0), referrals: refs.n },
    };
  }

  @Public()
  @Get('public/unite-club/chapters/:slug')
  async publicChapterPage(@Param('slug') slug: string) {
    const c = await this.chapter(slug);
    if (c.status !== 'active') throw new NotFoundException('Chapter not found');
    const ms = await this.active(c.id);
    const events = await this.db.select({ title: ucEvents.title, kind: ucEvents.kind, startsAt: ucEvents.startsAt, endsAt: ucEvents.endsAt }).from(ucEvents)
      .where(and(eq(ucEvents.chapterId, c.id), eq(ucEvents.cancelled, false), gte(ucEvents.endsAt, new Date()))).orderBy(asc(ucEvents.startsAt)).limit(6);
    return { ...publicChapter(c, ms.length, ms.map((x) => x.m.category)), events };
  }

  // ------------------------------------------------------------------ members
  @Get('unite-club/me')
  async mine(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ m: ucMembers, c: ucChapters }).from(ucMembers).innerJoin(ucChapters, eq(ucChapters.id, ucMembers.chapterId))
      .where(and(eq(ucMembers.userId, ctx.userId), ne(ucMembers.status, 'left'))).orderBy(desc(ucMembers.createdAt));
    return { items: rows.map(({ m, c }) => ({ slug: c.slug, name: c.name, city: c.city, chapterStatus: c.status, role: m.role, status: m.status, category: m.category, decisionNote: c.decisionNote })) };
  }

  @Post('unite-club/chapters')
  @RequireOrg()
  @HttpCode(201)
  async propose(@Ctx() ctx: RequestContext, @Body(body(UcChapterSchema)) b: z.infer<typeof UcChapterSchema>) {
    const slug = ucChapterSlug(b.name, b.city);
    const out = await this.db.transaction(async (tx) => {
      const [c] = await tx.insert(ucChapters).values({ slug, name: b.name, city: b.city, state: b.state ?? null, country: b.country, about: b.about, meetingSchedule: b.meetingSchedule, venue: b.venue ?? null, meetsOnline: b.meetsOnline, exclusiveCategories: b.exclusiveCategories, proposedBy: ctx.userId })
        .onConflictDoNothing().returning();
      if (!c) throw new ConflictException('A chapter with this name already exists in this city');
      await tx.insert(ucMembers).values({ chapterId: c.id, userId: ctx.userId, orgId: ctx.orgId!, category: b.category, role: 'president', status: 'applied' });
      return c;
    });
    const admins = await this.db.selectDistinct({ u: memberships.userId }).from(memberships).where(and(eq(memberships.status, 'active'), inArray(memberships.role, ['unite_admin', 'super_admin'])));
    await this.notify(admins.map((a) => a.u), `New Unite Club chapter proposed: ${b.name}`, `${b.city} · ${b.meetingSchedule}`, '/my-club');
    await this.audit.record(ctx, { action: 'unite_club.chapter_proposed', objectType: 'uc_chapter', objectId: out.id, after: { slug, city: b.city } });
    return { slug: out.slug, status: out.status };
  }

  @Post('unite-club/chapters/:slug/apply')
  @RequireOrg()
  @HttpCode(201)
  async apply(@Ctx() ctx: RequestContext, @Param('slug') slug: string, @Body(body(UcApplySchema)) b: z.infer<typeof UcApplySchema>) {
    const c = await this.chapter(slug);
    if (c.status !== 'active') throw new BadRequestException('This chapter is not open yet');
    const cur = await this.me(ctx, c.id);
    if (cur && cur.status !== 'left' && cur.status !== 'declined') throw new ConflictException(cur.status === 'active' ? 'You are already a member' : 'Your application is with the chapter');
    if (await this.seatTaken(c, b.category)) throw new ConflictException({ message: 'Check the highlighted fields', fields: { category: 'This chapter already has a member in this business category' } });
    const values = { chapterId: c.id, userId: ctx.userId, orgId: ctx.orgId!, category: b.category, intro: b.intro ?? null, role: 'member', status: 'applied', decidedBy: null, joinedAt: null };
    if (cur) await this.db.update(ucMembers).set({ ...values, updatedAt: new Date() }).where(eq(ucMembers.id, cur.id));
    else await this.db.insert(ucMembers).values(values);
    const officers = (await this.active(c.id)).filter((x) => UC_OFFICERS.includes(x.m.role as never)).map((x) => x.m.userId);
    await this.notify(officers, `${c.name}: new application`, `A ${b.category} applied to join.`, `/my-club/${c.slug}`);
    return { status: 'applied' };
  }

  @Get('unite-club/chapters/:slug')
  async chapterView(@Ctx() ctx: RequestContext, @Param('slug') slug: string) {
    const c = await this.chapter(slug);
    const mine = await this.me(ctx, c.id);
    if (!staff(ctx) && mine?.status !== 'active') throw new ForbiddenException('Only members of this chapter can see it');
    const isOfficer = staff(ctx) || UC_OFFICERS.includes(mine!.role as never);
    const members = await this.active(c.id);
    const applications = isOfficer ? await this.db.select({ m: ucMembers, name: users.fullName, org: organizations.displayName }).from(ucMembers).innerJoin(users, eq(users.id, ucMembers.userId)).innerJoin(organizations, eq(organizations.id, ucMembers.orgId))
      .where(and(eq(ucMembers.chapterId, c.id), eq(ucMembers.status, 'applied'))) : [];
    const evs = await this.db.select().from(ucEvents).where(and(eq(ucEvents.chapterId, c.id), gte(ucEvents.endsAt, new Date(Date.now() - 30 * 86_400_000)))).orderBy(asc(ucEvents.startsAt)).limit(30);
    const rs = evs.length ? await this.db.select().from(ucRsvps).where(inArray(ucRsvps.eventId, evs.map((e) => e.id))) : [];
    const hrs = evs.length ? await this.db.select().from(ucServiceHours).where(inArray(ucServiceHours.eventId, evs.map((e) => e.id))) : [];
    const refs = await this.db.select({ r: ucReferrals }).from(ucReferrals).where(eq(ucReferrals.chapterId, c.id)).orderBy(desc(ucReferrals.createdAt));
    const nameOf = new Map(members.map((x) => [x.m.userId, x.name]));
    const visible = refs.filter(({ r }) => r.fromUserId === ctx.userId || r.toUserId === ctx.userId);
    return {
      chapter: { ...publicChapter(c, members.length, members.map((x) => x.m.category)), venue: c.venue, status: c.status },
      me: mine ? { role: mine.role, category: mine.category, userId: mine.userId } : null, isOfficer,
      members: members.map((x) => ({ id: x.m.id, userId: x.m.userId, name: x.name, org: x.org, category: x.m.category, role: x.m.role, joinedAt: x.m.joinedAt })),
      applications: applications.map((x) => ({ id: x.m.id, name: x.name, org: x.org, category: x.m.category, intro: x.m.intro, appliedAt: x.m.createdAt })),
      events: evs.map((e) => ({ id: e.id, kind: e.kind, title: e.title, details: e.details, startsAt: e.startsAt, endsAt: e.endsAt, venue: e.venue, cancelled: e.cancelled, room: e.meetingId ? `/meetings/${e.meetingId}/room` : null,
        going: rs.filter((r) => r.eventId === e.id && r.answer === 'going').length, myAnswer: rs.find((r) => r.eventId === e.id && r.userId === ctx.userId)?.answer ?? null,
        serviceHours: hrs.filter((h) => h.eventId === e.id).reduce((s, h) => s + h.hours, 0), myHours: hrs.find((h) => h.eventId === e.id && h.userId === ctx.userId)?.hours ?? null })),
      // Referrals: everyone sees chapter totals; details only for the giver and receiver.
      referralStats: { given: refs.length, won: refs.filter(({ r }) => r.status === 'won').length, reportedValueMinor: refs.reduce((s, { r }) => s + (r.status === 'won' ? r.reportedValueMinor ?? 0 : 0), 0) },
      referrals: visible.map(({ r }) => ({ id: r.id, direction: r.toUserId === ctx.userId ? 'received' : 'given', from: nameOf.get(r.fromUserId) ?? 'Former member', to: nameOf.get(r.toUserId) ?? 'Former member',
        contactName: r.contactName, need: r.need, status: r.status, reportedValueMinor: r.reportedValueMinor, note: r.note, createdAt: r.createdAt,
        ...(r.toUserId === ctx.userId ? { contactPhone: r.contactPhone, contactEmail: r.contactEmail } : {}) })),
    };
  }

  @Post('unite-club/chapters/:slug/members/:id/decide')
  @HttpCode(200)
  async decide(@Ctx() ctx: RequestContext, @Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Body(body(UcDecisionSchema)) b: z.infer<typeof UcDecisionSchema>) {
    const c = await this.chapter(slug);
    await this.officer(ctx, c.id);
    const [m] = await this.db.select().from(ucMembers).where(and(eq(ucMembers.id, id), eq(ucMembers.chapterId, c.id))).limit(1);
    if (!m || m.status !== 'applied') throw new ConflictException('This application has already been decided');
    if (b.decision === 'approve' && await this.seatTaken(c, m.category, m.userId)) throw new ConflictException('This chapter already has a member in this business category');
    await this.db.update(ucMembers).set({ status: b.decision === 'approve' ? 'active' : 'declined', decidedBy: ctx.userId, joinedAt: b.decision === 'approve' ? new Date() : null, updatedAt: new Date() }).where(eq(ucMembers.id, id));
    await this.notify([m.userId], b.decision === 'approve' ? `Welcome to ${c.name}` : `${c.name}: application not accepted`, b.decision === 'approve' ? 'You are now a member. See the next meeting and meet the members.' : (b.note ?? 'The chapter could not accept your application now.'), `/my-club/${c.slug}`);
    await this.audit.record(ctx, { action: `unite_club.member_${b.decision === 'approve' ? 'approved' : 'declined'}`, objectType: 'uc_member', objectId: id });
    return { status: b.decision === 'approve' ? 'active' : 'declined' };
  }

  @Post('unite-club/chapters/:slug/members/:id/role')
  @HttpCode(200)
  async setRole(@Ctx() ctx: RequestContext, @Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Body(body(UcRoleSchema)) b: z.infer<typeof UcRoleSchema>) {
    const c = await this.chapter(slug);
    if (!staff(ctx) && (await this.member(ctx, c.id)).role !== 'president') throw new ForbiddenException('Only the chapter president can change roles');
    const [m] = await this.db.select().from(ucMembers).where(and(eq(ucMembers.id, id), eq(ucMembers.chapterId, c.id), eq(ucMembers.status, 'active'))).limit(1);
    if (!m) throw new NotFoundException();
    await this.db.transaction(async (tx) => {
      // One president, secretary and treasurer at a time: handing over a role makes the previous holder a member.
      if (b.role !== 'member') await tx.update(ucMembers).set({ role: 'member', updatedAt: new Date() }).where(and(eq(ucMembers.chapterId, c.id), eq(ucMembers.role, b.role), ne(ucMembers.id, id)));
      await tx.update(ucMembers).set({ role: b.role, updatedAt: new Date() }).where(eq(ucMembers.id, id));
    });
    await this.audit.record(ctx, { action: 'unite_club.role_changed', objectType: 'uc_member', objectId: id, after: { role: b.role } });
    return { ok: true };
  }

  @Post('unite-club/chapters/:slug/leave')
  @HttpCode(200)
  async leave(@Ctx() ctx: RequestContext, @Param('slug') slug: string) {
    const c = await this.chapter(slug);
    const m = await this.member(ctx, c.id);
    if (m.role === 'president' && (await this.active(c.id)).length > 1) throw new ConflictException('Hand the president role to another member before leaving');
    await this.db.update(ucMembers).set({ status: 'left', role: 'member', updatedAt: new Date() }).where(eq(ucMembers.id, m.id));
    return { ok: true };
  }

  // ------------------------------------------------------------------ events
  @Post('unite-club/chapters/:slug/events')
  @HttpCode(201)
  async addEvent(@Ctx() ctx: RequestContext, @Param('slug') slug: string, @Body(body(UcEventSchema)) b: z.infer<typeof UcEventSchema>) {
    const c = await this.chapter(slug);
    if (c.status !== 'active') throw new BadRequestException('This chapter is not active');
    const off = await this.officer(ctx, c.id);
    if (new Date(b.startsAt).getTime() < Date.now() - 5 * 60_000) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { startsAt: 'Choose a time in the future' } });
    const members = await this.active(c.id);
    const ev = await this.db.transaction(async (tx) => {
      let meetingId: string | null = null;
      if (b.online) {
        if (!off) throw new BadRequestException('Only a chapter officer can open an online room');
        // A U meet room for every active member of the chapter.
        const [m] = await tx.insert(meetings).values({ title: `${c.name}: ${b.title}`, agenda: b.details ?? null, startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt), organizerUserId: ctx.userId, organizerOrgId: off.orgId, roomKey: randomToken(12) }).returning();
        await tx.insert(meetingAttendees).values(members.map((x) => ({ meetingId: m.id, userId: x.m.userId, organizationId: x.m.orgId, rsvp: x.m.userId === ctx.userId ? 'accepted' : 'pending' })));
        meetingId = m.id;
      }
      const [e] = await tx.insert(ucEvents).values({ chapterId: c.id, kind: b.kind, title: b.title, details: b.details ?? null, startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt), venue: b.venue ?? (b.online ? 'Online — U meet' : c.venue), meetingId, createdBy: ctx.userId }).returning();
      return e;
    });
    await this.notify(members.map((x) => x.m.userId).filter((u) => u !== ctx.userId), `${c.name}: ${b.title}`, new Date(b.startsAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }), `/my-club/${c.slug}`);
    return { id: ev.id, room: ev.meetingId ? `/meetings/${ev.meetingId}/room` : null };
  }

  private async eventFor(ctx: RequestContext, id: string) {
    const [e] = await this.db.select().from(ucEvents).where(eq(ucEvents.id, id)).limit(1);
    if (!e) throw new NotFoundException();
    await this.member(ctx, e.chapterId);
    return e;
  }

  @Post('unite-club/events/:id/rsvp')
  @HttpCode(200)
  async rsvp(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(UcRsvpSchema)) b: z.infer<typeof UcRsvpSchema>) {
    const e = await this.eventFor(ctx, id);
    if (e.cancelled || e.endsAt < new Date()) throw new BadRequestException('This event is over');
    await this.db.insert(ucRsvps).values({ eventId: id, userId: ctx.userId, answer: b.answer }).onConflictDoUpdate({ target: [ucRsvps.eventId, ucRsvps.userId], set: { answer: b.answer, updatedAt: new Date() } });
    return { answer: b.answer };
  }

  @Post('unite-club/events/:id/hours')
  @HttpCode(200)
  async hours(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(UcHoursSchema)) b: z.infer<typeof UcHoursSchema>) {
    const e = await this.eventFor(ctx, id);
    if (e.kind !== 'service') throw new BadRequestException('Service hours are for service projects');
    if (e.startsAt > new Date()) throw new BadRequestException('Log hours once the project has started');
    await this.db.insert(ucServiceHours).values({ eventId: id, userId: ctx.userId, hours: b.hours }).onConflictDoUpdate({ target: [ucServiceHours.eventId, ucServiceHours.userId], set: { hours: b.hours } });
    return { hours: b.hours };
  }

  // ------------------------------------------------------------------ referrals
  @Post('unite-club/chapters/:slug/referrals')
  @HttpCode(201)
  async refer(@Ctx() ctx: RequestContext, @Param('slug') slug: string, @Body(body(UcReferralSchema)) b: z.infer<typeof UcReferralSchema>) {
    const c = await this.chapter(slug);
    await this.member(ctx, c.id);
    if (b.toUserId === ctx.userId) throw new BadRequestException('Pass the referral to another member');
    const to = (await this.active(c.id)).find((x) => x.m.userId === b.toUserId);
    if (!to) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { toUserId: 'Choose a member of this chapter' } });
    const [r] = await this.db.insert(ucReferrals).values({ chapterId: c.id, fromUserId: ctx.userId, toUserId: b.toUserId, contactName: b.contactName, contactPhone: b.contactPhone ?? null, contactEmail: b.contactEmail ?? null, need: b.need, consent: true }).returning({ id: ucReferrals.id });
    await this.notify([b.toUserId], `Referral from a ${c.name} member`, `${b.contactName}: ${b.need.slice(0, 120)}`, `/my-club/${c.slug}`);
    await this.audit.record(ctx, { action: 'unite_club.referral_given', objectType: 'uc_referral', objectId: r.id });
    return { id: r.id };
  }

  @Post('unite-club/referrals/:id')
  @HttpCode(200)
  async updateReferral(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(UcReferralUpdateSchema)) b: z.infer<typeof UcReferralUpdateSchema>) {
    const [r] = await this.db.select().from(ucReferrals).where(eq(ucReferrals.id, id)).limit(1);
    if (!r || r.toUserId !== ctx.userId) throw new NotFoundException('Referral not found');
    await this.db.update(ucReferrals).set({ status: b.status, reportedValueMinor: b.status === 'won' ? b.reportedValueMinor ?? null : null, note: b.note ?? r.note, updatedAt: new Date() }).where(eq(ucReferrals.id, id));
    if (b.status === 'won') await this.notify([r.fromUserId], 'Your referral became business', `${r.contactName} — thank you for the referral.`, '/my-club');
    return { status: b.status };
  }

  // ------------------------------------------------------------------ admin
  @Get('admin/unite-club/chapters')
  async adminList(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    if (!staff(ctx)) throw new ForbiddenException();
    const rows = await this.db.select({ c: ucChapters, by: users.fullName }).from(ucChapters).innerJoin(users, eq(users.id, ucChapters.proposedBy))
      .where(status ? eq(ucChapters.status, status) : undefined).orderBy(desc(ucChapters.createdAt));
    const counts = rows.length ? await this.db.select({ id: ucMembers.chapterId, n: sql<number>`count(*) filter (where ${ucMembers.status} = 'active')::int` }).from(ucMembers).where(inArray(ucMembers.chapterId, rows.map((r) => r.c.id))).groupBy(ucMembers.chapterId) : [];
    return { items: rows.map(({ c, by }) => ({ id: c.id, slug: c.slug, name: c.name, city: c.city, state: c.state, country: c.country, about: c.about, meetingSchedule: c.meetingSchedule, status: c.status, proposedBy: by, createdAt: c.createdAt, members: counts.find((x) => x.id === c.id)?.n ?? 0 })) };
  }

  @Post('admin/unite-club/chapters/:id/decide')
  @HttpCode(200)
  async adminDecide(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(UcDecisionSchema)) b: z.infer<typeof UcDecisionSchema>) {
    if (!staff(ctx)) throw new ForbiddenException();
    const [c] = await this.db.select().from(ucChapters).where(eq(ucChapters.id, id)).limit(1);
    if (!c) throw new NotFoundException();
    if (c.status !== 'proposed') throw new ConflictException('This chapter has already been decided');
    await this.db.transaction(async (tx) => {
      await tx.update(ucChapters).set({ status: b.decision === 'approve' ? 'active' : 'declined', decidedBy: ctx.userId, decidedAt: new Date(), decisionNote: b.note ?? null, updatedAt: new Date() }).where(eq(ucChapters.id, id));
      if (b.decision === 'approve') await tx.update(ucMembers).set({ status: 'active', joinedAt: new Date(), decidedBy: ctx.userId, updatedAt: new Date() }).where(and(eq(ucMembers.chapterId, id), eq(ucMembers.userId, c.proposedBy)));
    });
    await this.notify([c.proposedBy], b.decision === 'approve' ? `${c.name} is approved — you are its president` : `${c.name} was not approved`, b.decision === 'approve' ? 'Invite members and schedule your first meeting.' : (b.note ?? 'Contact the Unite team for details.'), `/my-club/${c.slug}`);
    await this.audit.record(ctx, { action: `unite_club.chapter_${b.decision === 'approve' ? 'approved' : 'declined'}`, objectType: 'uc_chapter', objectId: id });
    return { status: b.decision === 'approve' ? 'active' : 'declined' };
  }
}

@Module({ controllers: [UniteClubController] })
export class UniteClubModule {}
