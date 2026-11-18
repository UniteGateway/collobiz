/**
 * Capacity calendar — verified businesses publish dated spare capacity (people, seats, vehicles, machines, lines,
 * space, pallets, shifts); others request bookings for exact dates. Accepting checks that enough units are free on
 * every day of the booking (accepted bookings only), so capacity is never double-booked.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, gte, inArray, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { CapacityBookingSchema, CapacityOfferSchema, capacityFree, capacityTypeLabel, opsStateName } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { capacityBookings, capacityOffers, organizations } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { isManager, mustBeVerified, notifyOrg, today } from './shared';

type Offer = typeof capacityOffers.$inferSelect;
type Booking = typeof capacityBookings.$inferSelect;
const span = (b: { fromDate: string; toDate: string; units: number }) => ({ units: b.units, from: b.fromDate, to: b.toDate });

@ApiTags('capacity')
@Controller('capacity')
export class CapacityController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private async accepted(offerIds: string[]) {
    return offerIds.length ? this.db.select().from(capacityBookings).where(and(inArray(capacityBookings.offerId, offerIds), eq(capacityBookings.status, 'accepted'))) : [];
  }
  private view(o: Offer, org: string | null, booked: Booking[], from?: string, to?: string) {
    const f = from ?? (today() > o.fromDate ? today() : o.fromDate); const t = to ?? o.toDate;
    return { id: o.id, type: o.type, typeLabel: capacityTypeLabel(o.type), title: o.title, units: o.units, free: f > t ? 0 : capacityFree(span(o), booked.filter((b) => b.offerId === o.id).map(span), f, t),
      from: o.fromDate, to: o.toDate, rateUnit: o.rateUnit, rate: o.rate, state: o.state, stateName: opsStateName(o.state), city: o.city, notes: o.notes, status: o.status, demo: o.demo, org, orgId: o.orgId };
  }

  @Get('offers')
  async find(@Ctx() ctx: RequestContext, @Query('type') type?: string, @Query('state') state?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('min') min?: string) {
    const f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : undefined; const t = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : f;
    const rows = await this.db.select({ o: capacityOffers, org: organizations.displayName }).from(capacityOffers).innerJoin(organizations, eq(organizations.id, capacityOffers.orgId))
      .where(and(eq(capacityOffers.status, 'open'), gte(capacityOffers.toDate, today()), type ? eq(capacityOffers.type, type) : undefined, state ? eq(capacityOffers.state, state) : undefined,
        f ? lte(capacityOffers.fromDate, f) : undefined, t ? gte(capacityOffers.toDate, t) : undefined))
      .orderBy(capacityOffers.fromDate).limit(200);
    const booked = await this.accepted(rows.map((r) => r.o.id));
    const need = Math.max(0, Number(min) || 0);
    return rows.map((r) => ({ ...this.view(r.o, r.org, booked, f, t), mine: r.o.orgId === ctx.orgId })).filter((x) => x.free >= Math.max(1, need));
  }

  @Post('offers')
  @RequireOrg()
  @HttpCode(201)
  async publish(@Ctx() ctx: RequestContext, @Body(body(CapacityOfferSchema)) b: z.infer<typeof CapacityOfferSchema>) {
    mustBeVerified(ctx, 'publish capacity');
    if (b.to < today()) throw new BadRequestException('These dates are already in the past');
    const [o] = await this.db.insert(capacityOffers).values({ orgId: ctx.orgId!, type: b.type, title: b.title, units: b.units, fromDate: b.from, toDate: b.to, rateUnit: b.rateUnit, rate: b.rateUnit === 'negotiable' ? null : b.rate ?? null, state: b.state, city: b.city || null, notes: b.notes || null, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'capacity.published', objectType: 'capacity_offer', objectId: o.id, after: { type: b.type, units: b.units, from: b.from, to: b.to } });
    return this.view(o, null, []);
  }

  @Post('offers/:id/withdraw')
  @RequireOrg()
  @HttpCode(200)
  async withdraw(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [o] = await this.db.select().from(capacityOffers).where(eq(capacityOffers.id, id)).limit(1);
    if (!o || o.orgId !== ctx.orgId) throw new NotFoundException('Capacity not found');
    await this.db.update(capacityOffers).set({ status: 'withdrawn', updatedAt: new Date() }).where(eq(capacityOffers.id, id));
    const open = await this.db.update(capacityBookings).set({ status: 'declined', decisionNote: 'Capacity withdrawn by the owner', updatedAt: new Date() }).where(and(eq(capacityBookings.offerId, id), eq(capacityBookings.status, 'requested'))).returning();
    for (const b of open) await notifyOrg(this.db, b.orgId, 'capacity', 'Booking request closed', `${o.title} was withdrawn by its owner.`, '/capacity/mine');
    await this.audit.record(ctx, { action: 'capacity.withdrawn', objectType: 'capacity_offer', objectId: id });
    return { id, status: 'withdrawn' };
  }

  @Post('offers/:id/book')
  @RequireOrg()
  @HttpCode(201)
  async book(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(CapacityBookingSchema)) b: z.infer<typeof CapacityBookingSchema>) {
    mustBeVerified(ctx, 'book capacity');
    const [o] = await this.db.select().from(capacityOffers).where(eq(capacityOffers.id, id)).limit(1);
    if (!o || o.status !== 'open') throw new NotFoundException('Capacity not found');
    if (o.orgId === ctx.orgId) throw new BadRequestException('This is your own capacity');
    if (b.from < o.fromDate || b.to > o.toDate) throw new BadRequestException(`Choose dates between ${o.fromDate} and ${o.toDate}`);
    if (b.from < today()) throw new BadRequestException('Choose dates from today onwards');
    const free = capacityFree(span(o), (await this.accepted([id])).map(span), b.from, b.to);
    if (b.units > free) throw new ConflictException(`Only ${free} ${capacityTypeLabel(o.type).toLowerCase()} free on every day of those dates`);
    const [r] = await this.db.insert(capacityBookings).values({ offerId: id, orgId: ctx.orgId!, units: b.units, fromDate: b.from, toDate: b.to, note: b.note || null, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'capacity.booking_requested', objectType: 'capacity_booking', objectId: r.id, after: { offer: id, units: b.units, from: b.from, to: b.to } });
    await notifyOrg(this.db, o.orgId, 'capacity', `Booking request: ${o.title}`, `${b.units} for ${b.from} – ${b.to}. Accept or decline in My capacity.`, '/capacity/mine');
    return { id: r.id, status: r.status };
  }

  @Post('bookings/:id/decide')
  @RequireOrg()
  @HttpCode(200)
  async decide(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['accept', 'decline']), note: z.string().trim().max(500).optional() }))) b: { decision: 'accept' | 'decline'; note?: string }) {
    const [r] = await this.db.select({ b: capacityBookings, o: capacityOffers }).from(capacityBookings).innerJoin(capacityOffers, eq(capacityOffers.id, capacityBookings.offerId)).where(eq(capacityBookings.id, id)).limit(1);
    if (!r || r.o.orgId !== ctx.orgId) throw new NotFoundException('Booking not found');
    if (!isManager(ctx, r.o.orgId)) throw new ForbiddenException('Only an owner or admin can decide bookings');
    if (r.b.status !== 'requested') throw new ConflictException('Already decided');
    if (b.decision === 'accept') {
      const free = capacityFree(span(r.o), (await this.accepted([r.o.id])).map(span), r.b.fromDate, r.b.toDate);
      if (r.b.units > free) throw new ConflictException(`Only ${free} free on every day of those dates — decline or ask them to change the dates`);
    }
    const status = b.decision === 'accept' ? 'accepted' : 'declined';
    await this.db.update(capacityBookings).set({ status, decisionNote: b.note || null, decidedBy: ctx.userId, updatedAt: new Date() }).where(eq(capacityBookings.id, id));
    await this.audit.record(ctx, { action: `capacity.booking_${status}`, objectType: 'capacity_booking', objectId: id });
    await notifyOrg(this.db, r.b.orgId, 'capacity', `Booking ${status}: ${r.o.title}`, b.note ?? `${r.b.units} for ${r.b.fromDate} – ${r.b.toDate}.`, '/capacity/mine');
    return { id, status };
  }

  @Post('bookings/:id/cancel')
  @RequireOrg()
  @HttpCode(200)
  async cancel(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [r] = await this.db.select({ b: capacityBookings, o: capacityOffers }).from(capacityBookings).innerJoin(capacityOffers, eq(capacityOffers.id, capacityBookings.offerId)).where(eq(capacityBookings.id, id)).limit(1);
    if (!r || r.b.orgId !== ctx.orgId) throw new NotFoundException('Booking not found');
    if (!['requested', 'accepted'].includes(r.b.status)) throw new ConflictException('This booking is already closed');
    await this.db.update(capacityBookings).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(capacityBookings.id, id));
    await this.audit.record(ctx, { action: 'capacity.booking_cancelled', objectType: 'capacity_booking', objectId: id });
    await notifyOrg(this.db, r.o.orgId, 'capacity', `Booking cancelled: ${r.o.title}`, `${r.b.units} for ${r.b.fromDate} – ${r.b.toDate} was cancelled by the requester.`, '/capacity/mine');
    return { id, status: 'cancelled' };
  }

  @Get('mine')
  @RequireOrg()
  async mine(@Ctx() ctx: RequestContext) {
    const offers = await this.db.select().from(capacityOffers).where(eq(capacityOffers.orgId, ctx.orgId!)).orderBy(desc(capacityOffers.createdAt));
    const booked = await this.accepted(offers.map((o) => o.id));
    const toMe = offers.length ? await this.db.select({ b: capacityBookings, title: capacityOffers.title, type: capacityOffers.type, from: organizations.displayName }).from(capacityBookings).innerJoin(capacityOffers, eq(capacityOffers.id, capacityBookings.offerId)).innerJoin(organizations, eq(organizations.id, capacityBookings.orgId))
      .where(inArray(capacityBookings.offerId, offers.map((o) => o.id))).orderBy(desc(capacityBookings.createdAt)) : [];
    const mineOut = await this.db.select({ b: capacityBookings, title: capacityOffers.title, type: capacityOffers.type, owner: organizations.displayName }).from(capacityBookings).innerJoin(capacityOffers, eq(capacityOffers.id, capacityBookings.offerId)).innerJoin(organizations, eq(organizations.id, capacityOffers.orgId))
      .where(eq(capacityBookings.orgId, ctx.orgId!)).orderBy(desc(capacityBookings.createdAt));
    const bk = (x: { b: Booking; title: string; type: string }, who: string) => ({ id: x.b.id, offerId: x.b.offerId, title: x.title, typeLabel: capacityTypeLabel(x.type), units: x.b.units, from: x.b.fromDate, to: x.b.toDate, note: x.b.note, status: x.b.status, decisionNote: x.b.decisionNote, org: who, createdAt: x.b.createdAt });
    return { offers: offers.map((o) => this.view(o, null, booked)), requests: toMe.map((x) => bk(x, x.from)), bookings: mineOut.map((x) => bk(x, x.owner)) };
  }

  /** Calendar entries for one month: my capacity, accepted bookings and pending requests — both directions. */
  @Get('calendar')
  @RequireOrg()
  async calendar(@Ctx() ctx: RequestContext, @Query('month') month?: string) {
    const m = month && /^\d{4}-\d{2}$/.test(month) ? month : today().slice(0, 7);
    const start = `${m}-01`; const endD = new Date(Date.parse(`${start}T00:00:00Z`)); endD.setUTCMonth(endD.getUTCMonth() + 1); endD.setUTCDate(0); const end = endD.toISOString().slice(0, 10);
    const offers = await this.db.select().from(capacityOffers).where(and(eq(capacityOffers.orgId, ctx.orgId!), eq(capacityOffers.status, 'open'), lte(capacityOffers.fromDate, end), gte(capacityOffers.toDate, start)));
    const bookings = await this.db.select({ b: capacityBookings, o: capacityOffers }).from(capacityBookings).innerJoin(capacityOffers, eq(capacityOffers.id, capacityBookings.offerId))
      .where(and(or(eq(capacityOffers.orgId, ctx.orgId!), eq(capacityBookings.orgId, ctx.orgId!)), inArray(capacityBookings.status, ['requested', 'accepted']), lte(capacityBookings.fromDate, end), gte(capacityBookings.toDate, start)));
    return {
      month: m, start, end,
      entries: [
        ...offers.map((o) => ({ kind: 'capacity', id: o.id, title: o.title, from: o.fromDate, to: o.toDate, units: o.units })),
        ...bookings.map((x) => ({ kind: x.b.status === 'accepted' ? 'booking' : 'requested', id: x.b.id, title: x.o.title, from: x.b.fromDate, to: x.b.toDate, units: x.b.units, direction: x.o.orgId === ctx.orgId ? 'to_me' : 'mine' })),
      ],
    };
  }
}
