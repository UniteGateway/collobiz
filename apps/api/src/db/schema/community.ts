/** Community presence and wall; group-investment offers and non-binding expressions of interest. */
import { pgTable, uuid, text, timestamp, integer, bigint, boolean, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { id, createdAt, updatedAt, organizations, users } from './core';

export const userPresence = pgTable('user_presence', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  visible: boolean('visible').notNull().default(true), // members can hide that they are online
});

export const communityPosts = pgTable('community_posts', {
  id: id(),
  authorUserId: uuid('author_user_id').notNull().references(() => users.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  body: text('body').notNull(),
  topic: text('topic').notNull().default('general'),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  reports: integer('reports').notNull().default(0),
  status: text('status').notNull().default('visible'), // visible | removed
  createdAt: createdAt(),
}, (t) => [index('community_posts_created_idx').on(t.status, t.createdAt)]);

export const communityComments = pgTable('community_comments', {
  id: id(),
  postId: uuid('post_id').notNull().references(() => communityPosts.id),
  authorUserId: uuid('author_user_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  createdAt: createdAt(),
}, (t) => [index('community_comments_post_idx').on(t.postId)]);

export const communityLikes = pgTable('community_likes', {
  postId: uuid('post_id').notNull().references(() => communityPosts.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] })]);

export const investmentOffers = pgTable('investment_offers', {
  id: id(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  kind: text('kind').notNull(),
  summary: text('summary').notNull(),
  location: text('location').notNull(),
  unitLabel: text('unit_label').notNull().default('sq ft'),
  totalUnits: bigint('total_units', { mode: 'number' }).notNull(),
  unitPrice: bigint('unit_price', { mode: 'number' }).notNull(),
  minUnits: bigint('min_units', { mode: 'number' }).notNull().default(1),
  projectedMonthlyRent: bigint('projected_monthly_rent', { mode: 'number' }).notNull(),
  lockInMonths: integer('lock_in_months').notNull().default(0),
  sponsor: text('sponsor').notNull(),
  documentsUrl: text('documents_url'),
  status: text('status').notNull().default('draft'), // draft | interest_open | closed
  regulatoryStatus: text('regulatory_status').notNull().default('pending'), // pending | cleared
  clearanceReference: text('clearance_reference'),
  clearedBy: uuid('cleared_by').references(() => users.id),
  clearedAt: timestamp('cleared_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const investmentInterests = pgTable('investment_interests', {
  id: id(),
  offerId: uuid('offer_id').notNull().references(() => investmentOffers.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  orgId: uuid('org_id').references(() => organizations.id),
  units: bigint('units', { mode: 'number' }).notNull(),
  note: text('note'),
  status: text('status').notNull().default('interested'), // interested | withdrawn
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('investment_interests_uq').on(t.offerId, t.userId)]);

/** Mobile push tokens (Expo). Sending stays off until a push provider is configured. */
export const pushTokens = pgTable('push_tokens', {
  token: text('token').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  platform: text('platform').notNull(), // ios | android
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('push_tokens_user_idx').on(t.userId)]);
