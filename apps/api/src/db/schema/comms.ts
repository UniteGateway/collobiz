/** Stage 13 — messaging (encrypted, retention-bound), meetings, announcements, notification preferences, support tickets, feedback. */
import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { projects } from './projects';

/** 105/106/107 — conversation threads. Project threads derive membership from the project, so removal revokes access at once. */
export const messageThreads = pgTable('message_threads', {
  id: id(),
  kind: text('kind').notNull(), // direct | project
  subject: text('subject'),
  projectId: uuid('project_id').references(() => projects.id),
  retentionDays: integer('retention_days').notNull(), // messages older than this are purged (body removed), unless on legal hold
  legalHold: boolean('legal_hold').notNull().default(false),
  legalHoldReason: text('legal_hold_reason'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('message_threads_project_uq').on(t.projectId)]);

export const threadMembers = pgTable('thread_members', {
  id: id(),
  threadId: uuid('thread_id').notNull().references(() => messageThreads.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  muted: boolean('muted').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('thread_members_uq').on(t.threadId, t.userId)]);

/** Bodies are AES-256-GCM encrypted at rest; a purge removes the ciphertext and keeps only metadata. */
export const messages = pgTable('messages', {
  id: id(),
  threadId: uuid('thread_id').notNull().references(() => messageThreads.id),
  authorUserId: uuid('author_user_id').notNull().references(() => users.id),
  authorOrgId: uuid('author_org_id').notNull().references(() => organizations.id),
  bodyEnc: text('body_enc'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  purgedAt: timestamp('purged_at', { withTimezone: true }),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('messages_thread_idx').on(t.threadId, t.createdAt)]);

export const userBlocks = pgTable('user_blocks', {
  id: id(),
  blockerUserId: uuid('blocker_user_id').notNull().references(() => users.id),
  blockedUserId: uuid('blocked_user_id').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('user_blocks_uq').on(t.blockerUserId, t.blockedUserId)]);

/** 108/109 — meetings with attendees, agenda and minutes; video is provided by a configurable adapter. */
export const meetings = pgTable('meetings', {
  id: id(),
  title: text('title').notNull(),
  agenda: text('agenda'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  organizerUserId: uuid('organizer_user_id').notNull().references(() => users.id),
  organizerOrgId: uuid('organizer_org_id').notNull().references(() => organizations.id),
  projectId: uuid('project_id').references(() => projects.id),
  roomKey: text('room_key').notNull(),
  status: text('status').notNull().default('scheduled'), // scheduled | cancelled | completed
  minutes: text('minutes'),
  actionItems: jsonb('action_items').notNull().default(sql`'[]'::jsonb`),
  cancelReason: text('cancel_reason'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const meetingAttendees = pgTable('meeting_attendees', {
  id: id(),
  meetingId: uuid('meeting_id').notNull().references(() => meetings.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  rsvp: text('rsvp').notNull().default('pending'), // pending | accepted | declined | tentative
  joinedAt: timestamp('joined_at', { withTimezone: true }),
}, (t) => [uniqueIndex('meeting_attendees_uq').on(t.meetingId, t.userId)]);

/** 110 — platform announcements with audience targeting and read receipts. */
export const announcements = pgTable('announcements', {
  id: id(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  audience: text('audience').notNull().default('all'), // all | partners | verified_partners | group_companies
  sector: text('sector'),
  important: boolean('important').notNull().default(false),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const announcementReads = pgTable('announcement_reads', {
  announcementId: uuid('announcement_id').notNull().references(() => announcements.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('announcement_reads_uq').on(t.announcementId, t.userId)]);

/** 147 — per-kind, per-channel preferences. In-app is always on; mandatory kinds keep email on. */
export const notificationPreferences = pgTable('notification_preferences', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  kind: text('kind').notNull(),
  email: boolean('email').notNull().default(true),
  sms: boolean('sms').notNull().default(false),
  push: boolean('push').notNull().default(true),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('notification_preferences_uq').on(t.userId, t.kind)]);

/** 112 — support tickets with SLA-driven escalation; 150 feeds feedback and closure here. */
export const supportTickets = pgTable('support_tickets', {
  id: id(),
  code: text('code').notNull(),
  requesterUserId: uuid('requester_user_id').notNull().references(() => users.id),
  organizationId: uuid('organization_id').references(() => organizations.id),
  category: text('category').notNull(), // account | verification | payments | technical | abuse | other
  priority: text('priority').notNull().default('normal'), // urgent | high | normal | low
  subject: text('subject').notNull(),
  status: text('status').notNull().default('open'),
  assigneeUserId: uuid('assignee_user_id').references(() => users.id),
  firstResponseDueAt: timestamp('first_response_due_at', { withTimezone: true }).notNull(),
  firstRespondedAt: timestamp('first_responded_at', { withTimezone: true }),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }),
  escalationReason: text('escalation_reason'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  reportedMessageId: uuid('reported_message_id').references(() => messages.id),
  reportedExcerpt: text('reported_excerpt'), // the only message content staff ever see — the reported message
  satisfaction: integer('satisfaction'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('support_tickets_code_uq').on(t.code), index('support_tickets_status_idx').on(t.status, t.firstResponseDueAt)]);

export const ticketMessages = pgTable('ticket_messages', {
  id: id(),
  ticketId: uuid('ticket_id').notNull().references(() => supportTickets.id),
  authorUserId: uuid('author_user_id').notNull().references(() => users.id),
  fromStaff: boolean('from_staff').notNull().default(false),
  internal: boolean('internal').notNull().default(false), // staff-only note
  body: text('body').notNull(),
  createdAt: createdAt(),
});

export const feedback = pgTable('feedback', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  rating: integer('rating').notNull(),
  area: text('area').notNull(),
  comment: text('comment'),
  createdAt: createdAt(),
});
