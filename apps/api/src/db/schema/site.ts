/**
 * Website content managed from the admin console — social links, the video library (YouTube), the guide chat that helps
 * new and existing people (with hand-over to the Unite team) — and chat inside U meet video meetings.
 */
import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { meetings } from './comms';

/** Key/value settings shown on the public site (e.g. key 'social' → { facebook: url, … }). */
export const siteSettings = pgTable('site_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull().default(sql`'{}'::jsonb`),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: updatedAt(),
});

/** Videos Unite has published on YouTube, placed on pages by admins. */
export const siteVideos = pgTable('site_videos', {
  id: id(),
  youtubeId: text('youtube_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  /** Where it shows: 'home', 'page:/about', 'product:<slug>' … */
  placements: text('placements').array().notNull().default(sql`'{}'::text[]`),
  sort: integer('sort').notNull().default(0),
  published: boolean('published').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Guide chat: a visitor or member talks to the COLLABIZ guide, and can ask for a person. */
export const guideConversations = pgTable('guide_conversations', {
  id: id(),
  tokenHash: text('token_hash').notNull().unique(),
  userId: uuid('user_id').references(() => users.id),
  orgId: uuid('org_id').references(() => organizations.id),
  name: text('name'),
  email: text('email'),
  page: text('page'),
  /** open (guide only) | waiting (asked for a person) | answered | closed */
  status: text('status').notNull().default('open'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [index('guide_conv_status_idx').on(t.status, t.lastMessageAt)]);

export const guideMessages = pgTable('guide_messages', {
  id: id(),
  conversationId: uuid('conversation_id').notNull().references(() => guideConversations.id),
  sender: text('sender').notNull(), // visitor | guide | staff
  body: text('body').notNull(),
  links: jsonb('links').notNull().default(sql`'[]'::jsonb`),
  staffUserId: uuid('staff_user_id').references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('guide_msg_conv_idx').on(t.conversationId, t.createdAt)]);

/** Chat inside a U meet meeting (attendees only). */
export const meetingMessages = pgTable('meeting_messages', {
  id: id(),
  meetingId: uuid('meeting_id').notNull().references(() => meetings.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  createdAt: createdAt(),
}, (t) => [index('meeting_msg_idx').on(t.meetingId, t.createdAt)]);
