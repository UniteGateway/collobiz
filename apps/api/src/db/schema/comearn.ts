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
  status: text('status').notNull().default('draft'), // draft | live | paused | closed
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
  paidAt: timestamp('paid_at', { withTimezone: true }), paymentReference: text('payment_reference'), receivedConfirmedAt: timestamp('received_confirmed_at', { withTimezone: true }),
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
