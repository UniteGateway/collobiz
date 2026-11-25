/**
 * COLLABIZ COMEARN — commission marketplace. Companies post earning opportunities; members join by accepting frozen terms,
 * register protected leads and move through eight tracked stages to a commission that the paying company verifies, approves
 * and transfers. Reuses organizations, users, notifications and audit events.
 */
import { pgTable, uuid, text, timestamp, integer, bigint, jsonb, index, uniqueIndex, date, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

export const ceOpportunities = pgTable('ce_opportunities', {
  id: id(),
  code: text('code').notNull().unique(),
  orgId: uuid('org_id').notNull().references(() => organizations.id), // the company that pays the commission
  title: text('title').notNull(), type: text('type').notNull(), category: text('category').notNull(),
  description: text('description').notNull(), idealEarner: text('ideal_earner'), territory: text('territory').notNull(),
  estimatedValuePaise: bigint('estimated_value_paise', { mode: 'number' }),
  model: text('model').notNull(), rateBps: integer('rate_bps'), fixedPaise: bigint('fixed_paise', { mode: 'number' }),
  milestones: jsonb('milestones').notNull().default(sql`'[]'::jsonb`), recurringMonths: integer('recurring_months'),
  trigger: text('trigger').notNull(), paymentDays: integer('payment_days').notNull().default(30), maxEarners: integer('max_earners'),
  licenceNote: text('licence_note'),
  /** Where the opportunity came from: { module: 'franchise' | 'venture_ai' | 'xchange' | 'exim' | 'requirement', id } */
  source: jsonb('source'),
  featuredUntil: date('featured_until'),
  /** Unite review: the company's own offer; rate_bps / fixed_paise become the member-facing rate once Unite releases it with its margin. */
  companyRateBps: integer('company_rate_bps'), companyFixedPaise: bigint('company_fixed_paise', { mode: 'number' }),
  uniteMarginBps: integer('unite_margin_bps'), uniteMarginPaise: bigint('unite_margin_paise', { mode: 'number' }),
  approvedVersion: integer('approved_version'), releasedBy: uuid('released_by').references(() => users.id), releasedAt: timestamp('released_at', { withTimezone: true }), reviewNote: text('review_note'),
  uniteGuaranteed: boolean('unite_guaranteed').notNull().default(false),
  sample: boolean('sample').notNull().default(false),
  status: text('status').notNull().default('draft'), // draft | live | paused | closed | private (created from a selected bid)
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('ce_opps_status_idx').on(t.status, t.category), index('ce_opps_org_idx').on(t.orgId)]);

/** A member (earner) working an opportunity. `terms` + `termsHash` are the accepted commission agreement. */
export const ceEngagements = pgTable('ce_engagements', {
  id: id(),
  code: text('code').notNull().unique(),
  opportunityId: uuid('opportunity_id').notNull().references(() => ceOpportunities.id),
  earnerOrgId: uuid('earner_org_id').notNull().references(() => organizations.id),
  earnerUserId: uuid('earner_user_id').notNull().references(() => users.id),
  stage: text('stage').notNull().default('selected'),
  terms: jsonb('terms'), termsHash: text('terms_hash'), acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  status: text('status').notNull().default('active'), // active | withdrawn | disputed | closed
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex('ce_eng_opp_earner_uq').on(t.opportunityId, t.earnerOrgId), index('ce_eng_earner_idx').on(t.earnerOrgId)]);

/** Protected customer lead. The fingerprint is unique per opportunity: the first registration owns the introduction. */
export const ceLeads = pgTable('ce_leads', {
  id: id(),
  engagementId: uuid('engagement_id').notNull().references(() => ceEngagements.id).unique(),
  opportunityId: uuid('opportunity_id').notNull().references(() => ceOpportunities.id),
  certificateCode: text('certificate_code').notNull().unique(),
  customerName: text('customer_name').notNull(), customerCompany: text('customer_company'), city: text('city').notNull(),
  contactName: text('contact_name').notNull(), phone: text('phone'), email: text('email'), gstin: text('gstin'),
  requirement: text('requirement').notNull(), estimatedValuePaise: bigint('estimated_value_paise', { mode: 'number' }),
  fingerprint: text('fingerprint').notNull(), recordHash: text('record_hash').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('ce_leads_opp_fp_uq').on(t.opportunityId, t.fingerprint)]);

/** Append-only history of stage changes (who, when, amount, reference). */
export const ceEvents = pgTable('ce_events', {
  id: id(),
  engagementId: uuid('engagement_id').notNull().references(() => ceEngagements.id),
  stage: text('stage').notNull(), note: text('note'), amountPaise: bigint('amount_paise', { mode: 'number' }), reference: text('reference'),
  byUserId: uuid('by_user_id').notNull().references(() => users.id), byOrgId: uuid('by_org_id').notNull().references(() => organizations.id),
  createdAt: createdAt(),
}, (t) => [index('ce_events_eng_idx').on(t.engagementId)]);

/** COMEARN commission ledger — paid by the posting company directly to the earner. */
export const ceCommissions = pgTable('ce_commissions', {
  id: id(),
  engagementId: uuid('engagement_id').notNull().references(() => ceEngagements.id),
  payerOrgId: uuid('payer_org_id').notNull().references(() => organizations.id), earnerOrgId: uuid('earner_org_id').notNull().references(() => organizations.id),
  description: text('description').notNull(), milestoneIndex: integer('milestone_index'),
  basePaise: bigint('base_paise', { mode: 'number' }).notNull(), grossPaise: bigint('gross_paise', { mode: 'number' }).notNull(),
  tdsPaise: bigint('tds_paise', { mode: 'number' }).notNull().default(0), netPaise: bigint('net_paise', { mode: 'number' }).notNull(),
  uniteMarginPaise: bigint('unite_margin_paise', { mode: 'number' }).notNull().default(0), // owed by the company to Unite, on top of the member's commission
  platformFeeBps: integer('platform_fee_bps').notNull().default(0), platformFeePaise: bigint('platform_fee_paise', { mode: 'number' }).notNull().default(0), platformFeePayer: text('platform_fee_payer'),
  status: text('status').notNull().default('pending_approval'), // pending_approval | approved | paid | disputed | cancelled
  dueOn: date('due_on'), verifiedBy: uuid('verified_by').references(() => users.id), approvedBy: uuid('approved_by').references(() => users.id), approvedAt: timestamp('approved_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }), paymentReference: text('payment_reference'), tdsCertificateRef: text('tds_certificate_ref'), receivedConfirmedAt: timestamp('received_confirmed_at', { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('ce_comm_earner_idx').on(t.earnerOrgId), index('ce_comm_payer_idx').on(t.payerOrgId)]);

export const ceDisputes = pgTable('ce_disputes', {
  id: id(),
  engagementId: uuid('engagement_id').notNull().references(() => ceEngagements.id),
  raisedByOrgId: uuid('raised_by_org_id').notNull().references(() => organizations.id), raisedBy: uuid('raised_by').notNull().references(() => users.id),
  reason: text('reason').notNull(), status: text('status').notNull().default('open'), // open | resolved
  ruling: text('ruling'), ruledBy: uuid('ruled_by').references(() => users.id), ruledAt: timestamp('ruled_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('ce_disputes_eng_idx').on(t.engagementId)]);

/** Reverse marketplace: a member posts a genuine customer requirement; verified companies bid commissions.
 *  Customer identity is private to the member until a bid is selected — bidders see only the anonymised need. */
export const ceRequirements = pgTable('ce_requirements', {
  id: id(),
  code: text('code').notNull().unique(),
  orgId: uuid('org_id').notNull().references(() => organizations.id), createdBy: uuid('created_by').notNull().references(() => users.id),
  title: text('title').notNull(), category: text('category').notNull(), description: text('description').notNull(), city: text('city').notNull(),
  estimatedValuePaise: bigint('estimated_value_paise', { mode: 'number' }), closesOn: date('closes_on').notNull(),
  customer: jsonb('customer').notNull(), // private: { customerName, customerCompany, contactName, phone, email, gstin }
  fingerprint: text('fingerprint').notNull(),
  status: text('status').notNull().default('open'), // open | awarded | closed
  selectedBidId: uuid('selected_bid_id'), engagementId: uuid('engagement_id'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('ce_req_status_idx').on(t.status, t.category), index('ce_req_org_idx').on(t.orgId)]);

/** Sealed commission bids: a company sees only its own bid; the member sees all bids on their requirement. */
export const ceBids = pgTable('ce_bids', {
  id: id(),
  requirementId: uuid('requirement_id').notNull().references(() => ceRequirements.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id), createdBy: uuid('created_by').notNull().references(() => users.id),
  model: text('model').notNull(), rateBps: integer('rate_bps'), fixedPaise: bigint('fixed_paise', { mode: 'number' }),
  trigger: text('trigger').notNull(), paymentDays: integer('payment_days').notNull().default(30),
  proposal: text('proposal').notNull(), // what the company offers the customer
  status: text('status').notNull().default('submitted'), // submitted | withdrawn | selected | not_selected
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex('ce_bids_req_org_uq').on(t.requirementId, t.orgId)]);

/** Team on an engagement: the lead member invites others for a share of the commission pool; every member must accept. */
export const ceTeamMembers = pgTable('ce_team_members', {
  id: id(),
  engagementId: uuid('engagement_id').notNull().references(() => ceEngagements.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  role: text('role').notNull(), sharePct: integer('share_pct_bp').notNull(), // basis points of the pool (10000 = 100%)
  status: text('status').notNull().default('invited'), // lead | invited | accepted | declined | left
  matchPercent: integer('match_percent'), matchReasons: jsonb('match_reasons').notNull().default(sql`'[]'::jsonb`),
  invitedBy: uuid('invited_by').references(() => users.id), respondedBy: uuid('responded_by').references(() => users.id), respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('ce_team_eng_org_uq').on(t.engagementId, t.orgId), index('ce_team_org_idx').on(t.orgId)]);

/** Each team member's part of a paid commission, owed by the lead member; the receiving member confirms. */
export const ceAllocations = pgTable('ce_allocations', {
  id: id(),
  commissionId: uuid('commission_id').notNull().references(() => ceCommissions.id),
  teamMemberId: uuid('team_member_id').notNull().references(() => ceTeamMembers.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  status: text('status').notNull().default('owed'), // owed | paid | confirmed
  reference: text('reference'), paidAt: timestamp('paid_at', { withTimezone: true }), confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('ce_alloc_comm_member_uq').on(t.commissionId, t.teamMemberId)]);

/** Negotiation between Unite and the offering company before a listing is released. */
export const ceNegotiations = pgTable('ce_negotiations', {
  id: id(),
  opportunityId: uuid('opportunity_id').notNull().references(() => ceOpportunities.id),
  fromSide: text('from_side').notNull(), // unite | company
  proposedRateBps: integer('proposed_rate_bps'), proposedFixedPaise: bigint('proposed_fixed_paise', { mode: 'number' }),
  note: text('note').notNull(),
  status: text('status').notNull().default('open'), // open | accepted | declined | info
  createdBy: uuid('created_by').notNull().references(() => users.id), respondedBy: uuid('responded_by').references(() => users.id), respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('ce_neg_opp_idx').on(t.opportunityId)]);

/** Ratings after a paid commission: the member rates the company, the company rates the member. One per side per engagement. */
export const ceRatings = pgTable('ce_ratings', {
  id: id(),
  engagementId: uuid('engagement_id').notNull().references(() => ceEngagements.id),
  fromOrgId: uuid('from_org_id').notNull().references(() => organizations.id), toOrgId: uuid('to_org_id').notNull().references(() => organizations.id),
  asRole: text('as_role').notNull(), // company (rating of a paying company) | earner (rating of a member)
  stars: integer('stars').notNull(), comment: text('comment'),
  createdBy: uuid('created_by').notNull().references(() => users.id), createdAt: createdAt(),
}, (t) => [uniqueIndex('ce_ratings_eng_from_uq').on(t.engagementId, t.fromOrgId), index('ce_ratings_to_idx').on(t.toOrgId, t.asRole)]);
