/**
 * Direct offers — Unite Group companies send work, products to sell or markets to develop straight to chosen partners
 * (all verified partners, a hand-picked list, or a filtered group), instead of a public listing or a sealed tender.
 *  - Pricing is set by Unite (partners accept the stated terms), quoted by partners, or either.
 *  - Rewards: commission, revenue share, profit share, equity, fixed fee or reseller margin. Profit share and equity are
 *    indicative until a signed agreement exists in Contracts; selection freezes the agreed terms with a hash.
 *  - Partners only see offers addressed to them and never see other partners' responses.
 * Money is stored in paise; percentages in basis points (1% = 100).
 */
import { pgTable, uuid, text, timestamp, jsonb, integer, bigint, boolean, index, uniqueIndex, date, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

/** A partner's declared spare capacity: offices, people and the kind of work they are looking for. */
export const partnerCapacity = pgTable('partner_capacity', {
  organizationId: uuid('organization_id').primaryKey().references(() => organizations.id),
  hasOffice: boolean('has_office').notNull().default(false),
  officeLocations: text('office_locations').array().notNull().default(sql`'{}'::text[]`),
  totalManpower: integer('total_manpower').notNull().default(0),
  idleManpower: integer('idle_manpower').notNull().default(0),
  idleSkills: text('idle_skills').array().notNull().default(sql`'{}'::text[]`),
  availableFrom: date('available_from'),
  lookingFor: text('looking_for').array().notNull().default(sql`'{}'::text[]`),
  notes: text('notes'),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: updatedAt(),
});

export const directOffers = pgTable('direct_offers', {
  id: id(),
  code: text('code').notNull(),
  issuerOrgId: uuid('issuer_org_id').notNull().references(() => organizations.id),
  ventureId: uuid('venture_id').references((): AnyPgColumn => uniteVentures.id), // the Unite business this offer promotes
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  kind: text('kind').notNull(), // sell_products | marketing | project_work | manpower | local_presence | partnership
  sector: text('sector').notNull(),
  regions: text('regions').array().notNull().default(sql`'{}'::text[]`), // Indian state codes or country codes; empty = anywhere
  targetMode: text('target_mode').notNull(), // all | selected | filtered
  targetFilter: jsonb('target_filter'),
  pricing: text('pricing').notNull(), // unite_price | partner_quote | either
  unitePrice: bigint('unite_price', { mode: 'number' }),
  priceUnit: text('price_unit'),
  uniteRewardModel: text('unite_reward_model'),
  uniteRewardBps: integer('unite_reward_bps'),
  uniteRewardAmount: bigint('unite_reward_amount', { mode: 'number' }),
  rewardModels: text('reward_models').array().notNull(), // models a partner may propose
  needsOffice: boolean('needs_office').notNull().default(false),
  minManpower: integer('min_manpower'),
  exclusive: boolean('exclusive').notNull().default(false),
  maxSelections: integer('max_selections').notNull().default(1),
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('open'), // open | closed | withdrawn
  closedReason: text('closed_reason'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('direct_offers_code_uq').on(t.code), index('direct_offers_issuer_idx').on(t.issuerOrgId, t.status)]);

export const directOfferRecipients = pgTable('direct_offer_recipients', {
  id: id(),
  offerId: uuid('offer_id').notNull().references(() => directOffers.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  status: text('status').notNull().default('sent'), // sent | viewed | responded | declined | selected | not_selected
  declineReason: text('decline_reason'),
  viewedAt: timestamp('viewed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('direct_offer_recipients_uq').on(t.offerId, t.organizationId), index('direct_offer_recipients_org_idx').on(t.organizationId)]);

export const directOfferResponses = pgTable('direct_offer_responses', {
  id: id(),
  offerId: uuid('offer_id').notNull().references(() => directOffers.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  mode: text('mode').notNull(), // accept_terms | proposal
  price: bigint('price', { mode: 'number' }),
  priceUnit: text('price_unit'),
  rewardModel: text('reward_model').notNull(),
  rewardBps: integer('reward_bps'),
  rewardAmount: bigint('reward_amount', { mode: 'number' }),
  manpower: integer('manpower'),
  hasOffice: boolean('has_office').notNull().default(false),
  officeLocation: text('office_location'),
  startDate: date('start_date'),
  message: text('message').notNull(),
  status: text('status').notNull().default('submitted'), // submitted | withdrawn | selected | not_selected
  version: integer('version').notNull().default(1),
  termsHash: text('terms_hash'),
  decidedBy: uuid('decided_by').references(() => users.id),
  decisionNote: text('decision_note'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('direct_offer_responses_uq').on(t.offerId, t.organizationId), index('direct_offer_responses_offer_idx').on(t.offerId, t.status)]);

/**
 * Sales registered by a selected partner under a direct offer (buyer introductions). The buyer must have agreed to be
 * introduced; a buyer can be registered once per offer. Unite Group moves the sale on; "paid" is the customer payment that
 * makes any commission earned.
 */
export const offerSales = pgTable('offer_sales', {
  id: id(),
  code: text('code').notNull(),
  offerId: uuid('offer_id').notNull().references(() => directOffers.id),
  responseId: uuid('response_id').notNull().references(() => directOfferResponses.id),
  partnerOrgId: uuid('partner_org_id').notNull().references(() => organizations.id),
  buyerName: text('buyer_name').notNull(),
  buyerKey: text('buyer_key').notNull(), // normalised name + city, for duplicate detection
  buyerCity: text('buyer_city').notNull(),
  contactName: text('contact_name'),
  contactPhone: text('contact_phone'),
  contactEmail: text('contact_email'),
  description: text('description').notNull(),
  estimatedValue: bigint('estimated_value', { mode: 'number' }),
  consentMethod: text('consent_method').notNull(),
  status: text('status').notNull().default('registered'), // registered | in_discussion | quoted | won | paid | lost | withdrawn
  saleValue: bigint('sale_value', { mode: 'number' }),
  invoiceNumber: text('invoice_number'),
  paymentReference: text('payment_reference'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  lostReason: text('lost_reason'),
  history: jsonb('history').notNull().default(sql`'[]'::jsonb`), // [{ at, status, note, by }]
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('offer_sales_code_uq').on(t.code), index('offer_sales_offer_idx').on(t.offerId, t.status), index('offer_sales_partner_idx').on(t.partnerOrgId),
  uniqueIndex('offer_sales_buyer_uq').on(t.offerId, t.buyerKey).where(sql`status not in ('lost', 'withdrawn')`)]);

/**
 * Unite Group businesses (ventures) partners can promote. Regulated ventures stay closed until a super admin records
 * regulatory clearance; partners and the public never see them before that.
 */
export const uniteVentures = pgTable('unite_ventures', {
  id: id(),
  num: integer('num').notNull(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  sector: text('sector').notNull(),
  tagline: text('tagline').notNull(),
  summary: text('summary').notNull(),
  stage: text('stage').notNull(), // concept | pilot | building | live
  roles: text('roles').array().notNull().default(sql`'{}'::text[]`),
  open: boolean('open').notNull().default(false),
  regulatedReason: text('regulated_reason'),
  clearedAt: timestamp('cleared_at', { withTimezone: true }),
  clearedBy: uuid('cleared_by').references(() => users.id),
  clearanceNote: text('clearance_note'),
  groupCompanyOrgId: uuid('group_company_org_id').references(() => organizations.id),
  rewardNote: text('reward_note'),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('unite_ventures_slug_uq').on(t.slug)]);

/** A partner asks to promote a venture; Unite approves or declines. Approved partners are the venture's promoters. */
export const ventureInterests = pgTable('venture_interests', {
  id: id(),
  ventureId: uuid('venture_id').notNull().references(() => uniteVentures.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  roles: text('roles').array().notNull(),
  regions: text('regions').array().notNull().default(sql`'{}'::text[]`),
  message: text('message').notNull(),
  status: text('status').notNull().default('pending'), // pending | approved | declined | withdrawn
  decidedBy: uuid('decided_by').references(() => users.id),
  decisionNote: text('decision_note'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('venture_interests_uq').on(t.ventureId, t.organizationId)]);
