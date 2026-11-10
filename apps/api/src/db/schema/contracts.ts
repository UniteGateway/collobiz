/** Stage 10 — contracts (LOI, work order, contract) with immutable approved versions and e-sign evidence. */
import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex, bigint } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { tenders, bids } from './tenders';
import { directOffers, directOfferResponses } from './offers';

export const contracts = pgTable('contracts', {
  id: id(),
  code: text('code').notNull(),
  kind: text('kind').notNull(), // loi | work_order | contract
  title: text('title').notNull(),
  issuerOrgId: uuid('issuer_org_id').notNull().references(() => organizations.id),
  counterpartyOrgId: uuid('counterparty_org_id').notNull().references(() => organizations.id),
  tenderId: uuid('tender_id').references(() => tenders.id),
  bidId: uuid('bid_id').references(() => bids.id),
  offerId: uuid('offer_id').references(() => directOffers.id),
  offerResponseId: uuid('offer_response_id').references(() => directOfferResponses.id),
  value: bigint('value', { mode: 'number' }),
  currency: text('currency').notNull().default('INR'),
  status: text('status').notNull().default('draft'),
  supersedesId: uuid('supersedes_id'),
  supersededById: uuid('superseded_by_id'),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  terminatedAt: timestamp('terminated_at', { withTimezone: true }),
  terminationReason: text('termination_reason'),
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('contracts_code_uq').on(t.code), index('contracts_issuer_idx').on(t.issuerOrgId), index('contracts_counterparty_idx').on(t.counterpartyOrgId), index('contracts_tender_idx').on(t.tenderId)]);

/**
 * Each edit after a submission creates a new version. A database trigger (migration 0008) rejects any change to the
 * text of a submitted version and any change at all to an approved version — the acceptance gate for Stage 10.
 */
export const contractVersions = pgTable('contract_versions', {
  id: id(),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  versionNo: integer('version_no').notNull(),
  body: text('body').notNull(),
  terms: jsonb('terms').notNull().default(sql`'{}'::jsonb`), // { value, startDate, endDate, paymentTerms, deliverables }
  bodyHash: text('body_hash').notNull(),
  changeNote: text('change_note'),
  authorUserId: uuid('author_user_id').notNull().references(() => users.id),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedBy: uuid('approved_by').references(() => users.id),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  rejectedBy: uuid('rejected_by').references(() => users.id),
  reviewNote: text('review_note'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('contract_versions_uq').on(t.contractId, t.versionNo)]);

export const contractSignatures = pgTable('contract_signatures', {
  id: id(),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  versionId: uuid('version_id').notNull().references(() => contractVersions.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  typedName: text('typed_name').notNull(),
  title: text('signatory_title'),
  bodyHash: text('body_hash').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  /** typed (click-to-sign on the approved text) | wet_ink_upload (signed copy uploaded) | aadhaar_esign (via a licensed ESP — not connected). */
  method: text('method').notNull().default('typed'),
  evidenceKey: text('evidence_key'),
  evidenceSha256: text('evidence_sha256'),
  signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('contract_signatures_uq').on(t.versionId, t.organizationId)]);
