/**
 * COLLAB — resource-first collaboration (Master Upgrade §5–§7). Business offers extend the canonical `opportunities`
 * record (route `partner_listing`) instead of creating a second opportunity store. Proposals hang off an application;
 * mutual acceptance generates the agreement in Contracts. Money in paise.
 */
import { pgTable, uuid, text, timestamp, jsonb, integer, bigint, boolean, date, doublePrecision, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { opportunities, opportunityApplications } from './opportunities';

/** What I have — one row per resource; an organisation can declare many. */
export const collabAssets = pgTable('collab_assets', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  city: text('city'),
  region: text('region'),
  country: text('country').notNull().default('IN'),
  capacity: doublePrecision('capacity'),
  sectors: text('sectors').array().notNull().default(sql`'{}'::text[]`),
  models: text('models').array().notNull().default(sql`'{}'::text[]`),
  available: boolean('available').notNull().default(true),
  visibility: text('visibility').notNull().default('verified_partners'), // private | verified_partners
  /** self_declared → evidence_submitted → verified (by Unite staff). Verification covers this resource only. */
  verification: text('verification').notNull().default('self_declared'),
  verifiedBy: uuid('verified_by').references(() => users.id),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('collab_assets_org_idx').on(t.orgId), index('collab_assets_kind_idx').on(t.kind)]);

/** What I need. */
export const collabNeeds = pgTable('collab_needs', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull(),
  description: text('description').notNull(),
  sectors: text('sectors').array().notNull().default(sql`'{}'::text[]`),
  regions: text('regions').array().notNull().default(sql`'{}'::text[]`),
  zeroUpfrontOnly: boolean('zero_upfront_only').notNull().default(false),
  visibility: text('visibility').notNull().default('verified_partners'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('collab_needs_org_idx').on(t.orgId)]);

/** Business-offer details for an opportunity published by a partner. One row per opportunity. */
export const businessOffers = pgTable('business_offers', {
  opportunityId: uuid('opportunity_id').primaryKey().references(() => opportunities.id),
  category: text('category').notNull(),
  side: text('side').notNull(), // offering | seeking
  status: text('status').notNull().default('draft'),
  expiresOn: date('expires_on').notNull(),
  upfrontRequired: boolean('upfront_required').notNull(),
  upfrontAmount: bigint('upfront_amount', { mode: 'number' }),
  eligibility: text('eligibility'),
  territory: text('territory'),
  assetIds: uuid('asset_ids').array().notNull().default(sql`'{}'::uuid[]`),
  uniteFirstConsent: boolean('unite_first_consent').notNull().default(false),
  uniteReviewUntil: timestamp('unite_review_until', { withTimezone: true }),
  uniteReviewOrgId: uuid('unite_review_org_id').references(() => organizations.id),
  /** Set when the first-look window ends (the Unite company passed, or the window lapsed) and the offer is listed for everyone. */
  uniteReleasedAt: timestamp('unite_released_at', { withTimezone: true }),
  uniteDecision: text('unite_decision'), // interested | pass
  uniteDecisionNote: text('unite_decision_note'),
  uniteDecidedAt: timestamp('unite_decided_at', { withTimezone: true }),
  reminded7At: timestamp('reminded_7_at', { withTimezone: true }),
  reminded1At: timestamp('reminded_1_at', { withTimezone: true }),
  /** What the moderator actually checked, shown to viewers (never a guarantee). */
  checks: text('checks').array().notNull().default(sql`'{}'::text[]`),
  moderationNote: text('moderation_note'),
  moderatedBy: uuid('moderated_by').references(() => users.id),
  moderatedAt: timestamp('moderated_at', { withTimezone: true }),
  renewals: integer('renewals').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('business_offers_status_idx').on(t.status, t.expiresOn), index('business_offers_category_idx').on(t.category)]);

/** Commercial proposal rounds on an application. Rounds alternate; accepting a round generates the agreement. */
export const collabProposals = pgTable('collab_proposals', {
  id: id(),
  applicationId: uuid('application_id').notNull().references(() => opportunityApplications.id),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id),
  round: integer('round').notNull(),
  fromOrgId: uuid('from_org_id').notNull().references(() => organizations.id),
  toOrgId: uuid('to_org_id').notNull().references(() => organizations.id),
  terms: jsonb('terms').notNull(),
  status: text('status').notNull().default('sent'), // sent | superseded | accepted | withdrawn | declined
  contractId: uuid('contract_id'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('collab_proposals_round_uq').on(t.applicationId, t.round), index('collab_proposals_opp_idx').on(t.opportunityId)]);

/** A publisher invites a specific verified partner to apply to an open offer. One invitation per offer and partner. */
export const collabInvitations = pgTable('collab_invitations', {
  id: id(),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id),
  fromOrgId: uuid('from_org_id').notNull().references(() => organizations.id),
  toOrgId: uuid('to_org_id').notNull().references(() => organizations.id),
  message: text('message').notNull(),
  status: text('status').notNull().default('sent'), // sent | declined (applied / closed are derived)
  declineReason: text('decline_reason'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  respondedBy: uuid('responded_by').references(() => users.id),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('collab_invitations_uq').on(t.opportunityId, t.toOrgId), index('collab_invitations_to_idx').on(t.toOrgId)]);

/** JOIN — an organisation's industry and the ways it wants to collaborate with Unite Group (drives its board). */
export const collabJoinProfiles = pgTable('collab_join_profiles', {
  orgId: uuid('org_id').primaryKey().references(() => organizations.id),
  sector: text('sector').notNull(),
  intents: text('intents').array().notNull().default(sql`'{}'::text[]`),
  about: text('about'),
  city: text('city'),
  /** Public business page (microsite) at /club/m/:slug — only when the member switches it on. */
  micrositePublic: boolean('microsite_public').notNull().default(false),
  slug: text('slug').unique(),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Unite Industry Club — a member's product submitted to be sold under the Unite Powertek brand (OEM), optionally with free power. */
export const clubProducts = pgTable('club_products', {
  id: id(),
  code: text('code').notNull().unique(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  category: text('category').notNull(),
  sector: text('sector').notNull(),
  description: text('description').notNull(),
  brandOption: text('brand_option').notNull(), // unite_powertek | powered_by_unite
  powerFree: boolean('power_free').notNull().default(false),
  powerOffer: text('power_offer'),
  certifications: text('certifications').array().notNull().default(sql`'{}'::text[]`),
  monthlyCapacity: integer('monthly_capacity'),
  unit: text('unit'),
  mrp: bigint('mrp', { mode: 'number' }), // paise
  status: text('status').notNull().default('draft'), // draft | submitted | approved | rejected | withdrawn
  checks: text('checks').array().notNull().default(sql`'{}'::text[]`),
  reviewNote: text('review_note'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  /** The Unite Powertek catalogue item created on approval (sold through the product-sales module). */
  catalogItemId: uuid('catalog_item_id'),
  history: jsonb('history').notNull().default(sql`'[]'::jsonb`),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('club_products_org_idx').on(t.orgId), index('club_products_status_idx').on(t.status)]);

/** Unite Industry Club — a member asks to buy green power; the energy desk handles it. */
export const clubPowerRequests = pgTable('club_power_requests', {
  id: id(),
  code: text('code').notNull().unique(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  need: text('need').notNull(),
  sanctionedLoadKw: doublePrecision('sanctioned_load_kw'),
  monthlyUnits: integer('monthly_units'),
  monthlyBill: bigint('monthly_bill', { mode: 'number' }), // paise
  state: text('state').notNull(),
  city: text('city').notNull(),
  note: text('note'),
  status: text('status').notNull().default('new'), // new | in_progress | proposal_sent | closed
  history: jsonb('history').notNull().default(sql`'[]'::jsonb`),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('club_power_org_idx').on(t.orgId)]);
