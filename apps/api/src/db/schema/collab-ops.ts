/** Launch plans, capacity calendar, micro-contracts, demand pools and conditional commitments. Money in rupees (integers) unless noted. */
import { pgTable, uuid, text, timestamp, integer, jsonb, doublePrecision, date, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

/** A launch plan: the chosen business model plus the profile it was matched from. Progress = real applications + recorded steps. */
export const launchPlans = pgTable('launch_plans', {
  id: id(),
  code: text('code').notNull().unique(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  model: text('model').notNull(),
  profile: jsonb('profile').notNull(),
  stage: integer('stage').notNull().default(0),
  history: jsonb('history').notNull().default(sql`'[]'::jsonb`),
  status: text('status').notNull().default('active'), // active | closed
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('launch_plans_org_idx').on(t.orgId)]);

export const capacityOffers = pgTable('capacity_offers', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  units: integer('units').notNull(),
  fromDate: date('from_date').notNull(),
  toDate: date('to_date').notNull(),
  rateUnit: text('rate_unit').notNull(),
  rate: doublePrecision('rate'),
  state: text('state').notNull(),
  city: text('city'),
  notes: text('notes'),
  status: text('status').notNull().default('open'), // open | withdrawn
  demo: boolean('demo').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('capacity_offers_dates_idx').on(t.status, t.toDate)]);

export const capacityBookings = pgTable('capacity_bookings', {
  id: id(),
  offerId: uuid('offer_id').notNull().references(() => capacityOffers.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  units: integer('units').notNull(),
  fromDate: date('from_date').notNull(),
  toDate: date('to_date').notNull(),
  note: text('note'),
  status: text('status').notNull().default('requested'), // requested | accepted | declined | cancelled
  decisionNote: text('decision_note'),
  decidedBy: uuid('decided_by').references(() => users.id),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('capacity_bookings_offer_idx').on(t.offerId, t.status)]);

export const microContracts = pgTable('micro_contracts', {
  id: id(),
  code: text('code').notNull().unique(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull(),
  /** Unite product the job was posted through (xpert | partimer | zuppo); null when posted directly. */
  source: text('source'),
  state: text('state'),
  title: text('title').notNull(),
  scope: text('scope').notNull(),
  acceptance: text('acceptance').notNull(),
  quantity: integer('quantity').notNull(),
  unit: text('unit').notNull(),
  priceRs: integer('price_rs').notNull(),
  due: date('due').notNull(),
  status: text('status').notNull().default('open'), // open | assigned | submitted | accepted | paid | cancelled
  workerOrgId: uuid('worker_org_id').references(() => organizations.id),
  delivery: text('delivery'),
  paymentRef: text('payment_ref'),
  history: jsonb('history').notNull().default(sql`'[]'::jsonb`),
  demo: boolean('demo').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('micro_contracts_status_idx').on(t.status), index('micro_contracts_worker_idx').on(t.workerOrgId)]);

export const microApplications = pgTable('micro_applications', {
  id: id(),
  contractId: uuid('contract_id').notNull().references(() => microContracts.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  message: text('message').notNull(),
  status: text('status').notNull().default('applied'), // applied | chosen | not_chosen | withdrawn
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('micro_applications_uq').on(t.contractId, t.orgId)]);

export const demandPools = pgTable('demand_pools', {
  id: id(),
  code: text('code').notNull().unique(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  spec: text('spec').notNull(),
  unit: text('unit').notNull(),
  state: text('state').notNull(),
  targetQty: doublePrecision('target_qty').notNull(),
  joinBy: date('join_by').notNull(),
  neededBy: date('needed_by'),
  status: text('status').notNull().default('open'), // open | closed | cancelled
  demo: boolean('demo').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const poolMembers = pgTable('pool_members', {
  id: id(),
  poolId: uuid('pool_id').notNull().references(() => demandPools.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  qty: doublePrecision('qty').notNull(),
  status: text('status').notNull().default('joined'), // joined | left
  acceptedQuoteId: uuid('accepted_quote_id'),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('pool_members_uq').on(t.poolId, t.orgId)]);

export const poolQuotes = pgTable('pool_quotes', {
  id: id(),
  poolId: uuid('pool_id').notNull().references(() => demandPools.id),
  supplierOrgId: uuid('supplier_org_id').notNull().references(() => organizations.id),
  unitPriceRs: doublePrecision('unit_price_rs').notNull(),
  minQty: doublePrecision('min_qty').notNull(),
  validUntil: date('valid_until').notNull(),
  terms: text('terms').notNull(),
  status: text('status').notNull().default('open'), // open | withdrawn
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('pool_quotes_uq').on(t.poolId, t.supplierOrgId)]);

export const commitments = pgTable('commitments', {
  id: id(),
  code: text('code').notNull().unique(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  purpose: text('purpose').notNull(),
  deadline: date('deadline').notNull(),
  withdrawn: boolean('withdrawn').notNull().default(false),
  boundAt: timestamp('bound_at', { withTimezone: true }),
  history: jsonb('history').notNull().default(sql`'[]'::jsonb`),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const commitmentParties = pgTable('commitment_parties', {
  id: id(),
  commitmentId: uuid('commitment_id').notNull().references(() => commitments.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  role: text('role').notNull(),
  pledge: text('pledge').notNull(),
  pledgedAt: timestamp('pledged_at', { withTimezone: true }),
  pledgedBy: uuid('pledged_by').references(() => users.id),
  declined: boolean('declined').notNull().default(false),
}, (t) => [uniqueIndex('commitment_parties_uq').on(t.commitmentId, t.orgId)]);

export const commitmentConditions = pgTable('commitment_conditions', {
  id: id(),
  commitmentId: uuid('commitment_id').notNull().references(() => commitments.id),
  kind: text('kind').notNull(),
  text: text('text').notNull(),
  ownerOrgId: uuid('owner_org_id').notNull().references(() => organizations.id),
  evidence: text('evidence'),
  evidenceAt: timestamp('evidence_at', { withTimezone: true }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verifiedByOrg: uuid('verified_by_org').references(() => organizations.id),
  verifiedBy: uuid('verified_by').references(() => users.id),
});
