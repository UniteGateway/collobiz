/**
 * COLLABIZ COMEARN — commission marketplace. Companies post earning opportunities; members join by accepting frozen terms,
 * register protected leads and move through eight tracked stages to a commission that the paying company verifies, approves
 * and transfers. Reuses organizations, users, notifications and audit events.
 */
import { pgTable, uuid, text, timestamp, integer, bigint, jsonb, index, uniqueIndex, date } from 'drizzle-orm/pg-core';
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
