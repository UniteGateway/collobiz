/** Unite Green Park — energy listings (plants and buyer demand), protected introductions with deal stages, and the licensed-trader directory. */
import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, doublePrecision, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

export const energyListings = pgTable('energy_listings', {
  id: id(),
  code: text('code').notNull().unique(),
  side: text('side').notNull(), // plant | buyer
  category: text('category').notNull(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  state: text('state').notNull(),
  district: text('district').notNull(),
  source: text('source').notNull(), // solar | wind | hybrid | bess | any
  stage: text('stage'), // plants: planned | construction | operational
  capacityMw: doublePrecision('capacity_mw').notNull(), // plant capacity, or MW required for buyers
  availableMw: doublePrecision('available_mw'),
  tariffRsKwh: doublePrecision('tariff_rs_kwh'), // plants: indicative tariff; buyers: current tariff
  targetRsKwh: doublePrecision('target_rs_kwh'),
  ppaYears: integer('ppa_years'),
  models: text('models').array().notNull().default(sql`'{}'::text[]`),
  description: text('description').notNull(),
  /** Buyer identity and site details (company, DISCOM, consumption…) — shown only to the owner, staff, and after an accepted introduction. */
  private: jsonb('private').notNull().default(sql`'{}'::jsonb`),
  confidential: boolean('confidential').notNull().default(false),
  status: text('status').notNull().default('pending'), // pending | live | rejected | closed
  moderationNote: text('moderation_note'),
  moderatedBy: uuid('moderated_by').references(() => users.id),
  moderatedAt: timestamp('moderated_at', { withTimezone: true }),
  demo: boolean('demo').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('energy_listings_status_idx').on(t.status, t.side), index('energy_listings_state_idx').on(t.state)]);

export const energyIntroductions = pgTable('energy_introductions', {
  id: id(),
  listingId: uuid('listing_id').notNull().references(() => energyListings.id),
  fromOrgId: uuid('from_org_id').notNull().references(() => organizations.id),
  message: text('message').notNull(),
  status: text('status').notNull().default('requested'), // requested | accepted | declined | withdrawn
  /** Index into ENERGY_DEAL_STAGES (0 = introduction requested). */
  stage: integer('stage').notNull().default(0),
  history: jsonb('history').notNull().default(sql`'[]'::jsonb`), // [{ stage, by, at, note }]
  requestedBy: uuid('requested_by').notNull().references(() => users.id),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('energy_intro_uq').on(t.listingId, t.fromOrgId), index('energy_intro_from_idx').on(t.fromOrgId)]);

export const energyTraders = pgTable('energy_traders', {
  id: id(),
  name: text('name').notNull(),
  licenceNo: text('licence_no').notNull(),
  authority: text('authority').notNull(), // CERC | SERC
  state: text('state'),
  category: text('category').notNull(),
  validUntil: text('valid_until').notNull(),
  website: text('website'),
  verified: boolean('verified').notNull().default(false),
  checkedBy: uuid('checked_by').references(() => users.id),
  checkedAt: timestamp('checked_at', { withTimezone: true }),
  demo: boolean('demo').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('energy_traders_licence_uq').on(t.authority, t.licenceNo)]);
