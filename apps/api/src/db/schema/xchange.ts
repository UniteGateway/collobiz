/** COLLABIZ XCHANGE — barter listings (offers and needs, incl. idle capacity), exchange agreements, legs and approvals. */
import { pgTable, uuid, text, timestamp, bigint, date, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

export const xchangeListings = pgTable('xchange_listings', {
  id: id(),
  code: text('code').notNull().unique(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  side: text('side').notNull(), // offer | need
  category: text('category').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  quantity: text('quantity'),
  value: bigint('value', { mode: 'number' }).notNull(),
  valueBasis: text('value_basis').notNull(),
  region: text('region').notNull(),
  accepts: text('accepts').array().notNull().default(sql`'{barter}'::text[]`),
  availableUntil: date('available_until'),
  status: text('status').notNull().default('active'), // active | paused | closed
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('xchange_listings_match_idx').on(t.status, t.category, t.side)]);

export const xchangeDeals = pgTable('xchange_deals', {
  id: id(),
  code: text('code').notNull().unique(),
  kind: text('kind').notNull(), // direct | part_cash | multi
  status: text('status').notNull().default('proposed'), // proposed | agreed | completed | cancelled | disputed
  termsKey: text('terms_key').notNull(),
  note: text('note'),
  proposedByOrgId: uuid('proposed_by_org_id').notNull().references(() => organizations.id),
  proposedBy: uuid('proposed_by').notNull().references(() => users.id),
  agreedAt: timestamp('agreed_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const xchangeLegs = pgTable('xchange_legs', {
  id: id(),
  dealId: uuid('deal_id').notNull().references(() => xchangeDeals.id),
  fromOrgId: uuid('from_org_id').notNull().references(() => organizations.id),
  toOrgId: uuid('to_org_id').notNull().references(() => organizations.id),
  listingId: uuid('listing_id').references(() => xchangeListings.id),
  description: text('description').notNull(),
  value: bigint('value', { mode: 'number' }).notNull(),
  cash: bigint('cash', { mode: 'number' }).notNull().default(0),
  status: text('status').notNull().default('pending'), // pending | delivered | accepted | disputed
  deliveryNote: text('delivery_note'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  disputeReason: text('dispute_reason'),
}, (t) => [index('xchange_legs_deal_idx').on(t.dealId)]);

export const xchangeApprovals = pgTable('xchange_approvals', {
  id: id(),
  dealId: uuid('deal_id').notNull().references(() => xchangeDeals.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  termsKey: text('terms_key').notNull(),
  approvedBy: uuid('approved_by').notNull().references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('xchange_approvals_uq').on(t.dealId, t.orgId)]);
