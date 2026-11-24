/**
 * Unite Club — a members' business club with local chapters (in the spirit of Rotary, Lions or BNI): regular chapter
 * meetings, one member per business category in a chapter, referrals between members, service projects and events.
 * Separate from the Unite Industry Club (OEM, brand licence and power).
 */
import { pgTable, uuid, text, timestamp, boolean, integer, index, uniqueIndex, bigint } from 'drizzle-orm/pg-core';

import { id, createdAt, updatedAt, organizations, users } from './core';
import { meetings } from './comms';

export const ucChapters = pgTable('uc_chapters', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  state: text('state'),
  country: text('country').notNull().default('IN'),
  about: text('about').notNull(),
  /** e.g. "Every Tuesday, 7:30 am" — set by the chapter. */
  meetingSchedule: text('meeting_schedule').notNull(),
  venue: text('venue'),
  meetsOnline: boolean('meets_online').notNull().default(false),
  /** One member per business category (classification), as in Rotary and BNI. */
  exclusiveCategories: boolean('exclusive_categories').notNull().default(true),
  status: text('status').notNull().default('proposed'), // proposed | active | declined | closed
  proposedBy: uuid('proposed_by').notNull().references(() => users.id),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNote: text('decision_note'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('uc_chapters_status_idx').on(t.status)]);

export const ucMembers = pgTable('uc_members', {
  id: id(),
  chapterId: uuid('chapter_id').notNull().references(() => ucChapters.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  /** The member's business category in this chapter, e.g. "Chartered accountant". */
  category: text('category').notNull(),
  role: text('role').notNull().default('member'), // president | secretary | treasurer | member
  status: text('status').notNull().default('applied'), // applied | active | declined | left
  intro: text('intro'),
  sponsorUserId: uuid('sponsor_user_id').references(() => users.id),
  decidedBy: uuid('decided_by').references(() => users.id),
  joinedAt: timestamp('joined_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('uc_members_chapter_user_uq').on(t.chapterId, t.userId), index('uc_members_user_idx').on(t.userId)]);

/** Chapter meetings, service projects, socials and visits. An event can have a U meet room. */
export const ucEvents = pgTable('uc_events', {
  id: id(),
  chapterId: uuid('chapter_id').notNull().references(() => ucChapters.id),
  kind: text('kind').notNull(), // meeting | service | social | visit
  title: text('title').notNull(),
  details: text('details'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  venue: text('venue'),
  meetingId: uuid('meeting_id').references(() => meetings.id),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  cancelled: boolean('cancelled').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index('uc_events_chapter_idx').on(t.chapterId, t.startsAt)]);

export const ucRsvps = pgTable('uc_rsvps', {
  id: id(),
  eventId: uuid('event_id').notNull().references(() => ucEvents.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  answer: text('answer').notNull(), // going | not_going
  attended: boolean('attended').notNull().default(false),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('uc_rsvps_event_user_uq').on(t.eventId, t.userId)]);

/**
 * A referral from one member to another: someone who needs what the other member sells. Contact details are passed
 * only with the person's consent. The value of business won is reported by the receiving member (self-reported).
 */
export const ucReferrals = pgTable('uc_referrals', {
  id: id(),
  chapterId: uuid('chapter_id').notNull().references(() => ucChapters.id),
  fromUserId: uuid('from_user_id').notNull().references(() => users.id),
  toUserId: uuid('to_user_id').notNull().references(() => users.id),
  contactName: text('contact_name').notNull(),
  contactPhone: text('contact_phone'),
  contactEmail: text('contact_email'),
  need: text('need').notNull(),
  consent: boolean('consent').notNull(),
  status: text('status').notNull().default('given'), // given | contacted | won | lost
  reportedValueMinor: bigint('reported_value_minor', { mode: 'number' }),
  note: text('note'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('uc_referrals_to_idx').on(t.toUserId), index('uc_referrals_from_idx').on(t.fromUserId), index('uc_referrals_chapter_idx').on(t.chapterId)]);

export const ucServiceHours = pgTable('uc_service_hours', {
  id: id(),
  eventId: uuid('event_id').notNull().references(() => ucEvents.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  hours: integer('hours').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('uc_service_hours_uq').on(t.eventId, t.userId)]);
