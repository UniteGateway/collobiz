/** Stage 09 — tenders/RFQs with sealed two-envelope bids, evaluators, negotiation. */
import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex, bigint } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { opportunities } from './opportunities';

export const tenders = pgTable('tenders', {
  id: id(),
  code: text('code').notNull(),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id),
  issuerOrgId: uuid('issuer_org_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  scope: text('scope').notNull(),
  sector: text('sector').notNull(),
  workPackage: text('work_package'),
  budget: bigint('budget', { mode: 'number' }),
  currency: text('currency').notNull().default('INR'),
  closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
  eligibility: jsonb('eligibility').notNull().default(sql`'{}'::jsonb`), // { minLevel, sectors[], certifications[] }
  techWeight: integer('tech_weight').notNull().default(70),
  minTechScore: integer('min_tech_score').notNull().default(60),
  status: text('status').notNull().default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  cancelReason: text('cancel_reason'),
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('tenders_code_uq').on(t.code), index('tenders_issuer_idx').on(t.issuerOrgId), index('tenders_status_idx').on(t.status)]);

export const tenderDocuments = pgTable('tender_documents', {
  id: id(),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id),
  title: text('title').notNull(),
  fileName: text('file_name').notNull(),
  objectKey: text('object_key').notNull(),
  sha256: text('sha256').notNull(),
  size: integer('size').notNull(),
  mime: text('mime').notNull(),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const tenderEvaluators = pgTable('tender_evaluators', {
  id: id(),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: text('role').notNull(), // technical | commercial | both
  addedBy: uuid('added_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('tender_evaluators_uq').on(t.tenderId, t.userId)]);

/** Sealed bid: both envelopes AES-256-GCM encrypted; sealedHash commits to the submitted content. */
export const bids = pgTable('bids', {
  id: id(),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  submittedBy: uuid('submitted_by').references(() => users.id),
  teamId: uuid('team_id'),
  status: text('status').notNull().default('draft'),
  technicalEnc: text('technical_enc').notNull(),
  commercialEnc: text('commercial_enc').notNull(),
  sealedHash: text('sealed_hash'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  qualificationReason: text('qualification_reason'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('bids_tender_idx').on(t.tenderId), uniqueIndex('bids_active_uq').on(t.tenderId, t.organizationId).where(sql`status <> 'withdrawn'`)]);

export const bidScores = pgTable('bid_scores', {
  id: id(),
  bidId: uuid('bid_id').notNull().references(() => bids.id),
  evaluatorUserId: uuid('evaluator_user_id').notNull().references(() => users.id),
  kind: text('kind').notNull(), // technical | commercial
  score: integer('score').notNull(),
  criteria: jsonb('criteria').notNull().default(sql`'{}'::jsonb`),
  comment: text('comment').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('bid_scores_uq').on(t.bidId, t.evaluatorUserId, t.kind)]);

/** 073 — negotiation & revision thread between issuer and one bidder; revised prices are versioned. */
export const negotiationMessages = pgTable('negotiation_messages', {
  id: id(),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id),
  bidId: uuid('bid_id').notNull().references(() => bids.id),
  authorUserId: uuid('author_user_id').notNull().references(() => users.id),
  authorOrgId: uuid('author_org_id').notNull().references(() => organizations.id),
  body: text('body').notNull(),
  revisedAmount: bigint('revised_amount', { mode: 'number' }),
  createdAt: createdAt(),
}, (t) => [index('neg_bid_idx').on(t.bidId)]);
