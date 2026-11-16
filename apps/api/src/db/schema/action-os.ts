/**
 * COLLABIZ ACTION OS — action items per user, plans, preferences, deliveries, integrations and feedback.
 * Items are derived from source records (built-in connectors) or posted by registered integrations; each keeps its source
 * link and verification state. One item per (user, source app, source record, kind). One plan per (user, kind, period).
 * One delivery per (dedupe key) so retries never send twice.
 */
import { pgTable, uuid, text, timestamp, integer, bigint, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

export const actionItems = pgTable('action_items', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  sourceApp: text('source_app').notNull(),
  sourceModule: text('source_module').notNull(),
  sourceRecordId: text('source_record_id').notNull(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  recordUrl: text('record_url').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }),
  valuePaise: bigint('value_paise', { mode: 'number' }),
  risk: text('risk').notNull().default('none'),
  mandatory: boolean('mandatory').notNull().default(false),
  verification: text('verification').notNull().default('confirmed'), // confirmed | reported | missing | ai
  confidentiality: text('confidentiality').notNull().default('normal'),
  sourceStatus: text('source_status').notNull().default(''),
  band: text('band').notNull().default('P3'),
  score: integer('score').notNull().default(0),
  scoreParts: jsonb('score_parts').notNull().default(sql`'[]'::jsonb`),
  rule: text('rule'),
  status: text('status').notNull().default('open'), // open | done | snoozed | archived | resolved (source closed)
  snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  pinned: boolean('pinned').notNull().default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
  assignedTo: uuid('assigned_to').references(() => users.id),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }),
  doneAt: timestamp('done_at', { withTimezone: true }),
  doneBy: uuid('done_by').references(() => users.id),
  doneNote: text('done_note'),
  integrationId: uuid('integration_id'),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('action_items_identity_uq').on(t.userId, t.sourceApp, t.sourceRecordId, t.kind), index('action_items_user_status_idx').on(t.userId, t.status, t.band)]);

export const actionPlans = pgTable('action_plans', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  kind: text('kind').notNull(), // weekly | daily | on_demand
  periodKey: text('period_key').notNull(), // 2026-W47 | 2026-11-16 | on-demand timestamp
  timeZone: text('time_zone').notNull(),
  summary: text('summary').notNull(),
  counts: jsonb('counts').notNull(),
  sections: jsonb('sections').notNull(),
  items: jsonb('items').notNull(), // snapshot of the plan items (titles, links, bands, verification) at generation
  trigger: text('trigger').notNull().default('schedule'), // schedule | manual
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('action_plans_period_uq').on(t.userId, t.kind, t.periodKey), index('action_plans_user_idx').on(t.userId, t.generatedAt)]);

export const actionPreferences = pgTable('action_preferences', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  prefs: jsonb('prefs').notNull(),
  updatedAt: updatedAt(),
});

export const actionDeliveries = pgTable('action_deliveries', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  planId: uuid('plan_id').references(() => actionPlans.id),
  itemId: uuid('item_id').references(() => actionItems.id),
  channel: text('channel').notNull(), // inapp | push | email | whatsapp
  dedupeKey: text('dedupe_key').notNull(),
  /** queued | sent (handed to our own outbox/stream) | delivered (provider confirmed) | not_configured | no_consent | quiet_hours | failed */
  status: text('status').notNull(),
  detail: text('detail'),
  providerRef: text('provider_ref'),
  attempts: integer('attempts').notNull().default(1),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('action_deliveries_dedupe_uq').on(t.dedupeKey), index('action_deliveries_user_idx').on(t.userId, t.createdAt)]);

/** Connected apps that post events. The secret is stored as a SHA-256 hash; the plain value is shown once. */
export const actionIntegrations = pgTable('action_integrations', {
  id: id(),
  appKey: text('app_key').notNull(),
  name: text('name').notNull(),
  secretHash: text('secret_hash').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  /** Organisations this app may post events for (tenant boundary). */
  orgIds: uuid('org_ids').array().notNull().default(sql`'{}'::uuid[]`),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  lastEventAt: timestamp('last_event_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('action_integrations_app_uq').on(t.appKey)]);

/** Raw events from integrations, kept for provenance and idempotency. */
export const actionSourceEvents = pgTable('action_source_events', {
  id: id(),
  integrationId: uuid('integration_id').notNull().references(() => actionIntegrations.id),
  eventId: text('event_id').notNull(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  payload: jsonb('payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('action_source_events_uq').on(t.integrationId, t.eventId)]);

export const actionFeedback = pgTable('action_feedback', {
  id: id(),
  itemId: uuid('item_id').notNull().references(() => actionItems.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  kind: text('kind').notNull(), // useful | not_relevant | already_done | incorrect_data | wrong_priority | wrong_owner | duplicate | not_mine
  note: text('note'),
  createdAt: createdAt(),
}, (t) => [index('action_feedback_item_idx').on(t.itemId)]);

export const actionComments = pgTable('action_comments', {
  id: id(),
  itemId: uuid('item_id').notNull().references(() => actionItems.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  createdAt: createdAt(),
}, (t) => [index('action_comments_item_idx').on(t.itemId)]);
