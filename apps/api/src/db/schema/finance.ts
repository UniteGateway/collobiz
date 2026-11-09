/** Stage 12 — commission ledger & finance: policies, agreements, ledger entries, append-only journal, approvals, payouts, settlements, disputes. */
import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex, bigint, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { projects, milestones, projectInvoices } from './projects';
import { leadClaims } from './leads';
import { directOffers, directOfferResponses, offerSales } from './offers';

/** 135 — commission policy (rates in basis points; amounts in minor units). Active policies are immutable — retire and replace. */
export const commissionPolicies = pgTable('commission_policies', {
  id: id(),
  code: text('code').notNull(),
  version: integer('version').notNull().default(1),
  name: text('name').notNull(),
  sector: text('sector'), // null = any sector
  basis: text('basis').notNull(), // percent | flat | tiered
  rateBps: integer('rate_bps'),
  flatAmount: bigint('flat_amount', { mode: 'number' }),
  tiers: jsonb('tiers'), // [{ upTo, rateBps }]
  trigger: text('trigger').notNull().default('customer_payment'), // customer_payment — commission is earned only when the customer pays
  tdsBps: integer('tds_bps').notNull().default(500),
  clawbackDays: integer('clawback_days').notNull().default(90),
  status: text('status').notNull().default('draft'), // draft | active | retired
  legalReviewed: text('legal_reviewed').notNull().default('pending'), // pending | approved (B-10)
  createdBy: uuid('created_by').notNull().references(() => users.id),
  activatedBy: uuid('activated_by').references(() => users.id),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('commission_policies_code_ver_uq').on(t.code, t.version)]);

/** 096/157 — agreement between payer and beneficiary; the policy terms are frozen into a snapshot with a hash. */
export const commissionAgreements = pgTable('commission_agreements', {
  id: id(),
  code: text('code').notNull(),
  beneficiaryOrgId: uuid('beneficiary_org_id').notNull().references(() => organizations.id),
  payerOrgId: uuid('payer_org_id').notNull().references(() => organizations.id),
  projectId: uuid('project_id').references(() => projects.id), // a project agreement…
  offerId: uuid('offer_id').references(() => directOffers.id), // …or a direct-offer agreement (commission on sales)
  solarQuoteId: uuid('solar_quote_id'), // …or a Unite Solar quote won by the partner
  offerResponseId: uuid('offer_response_id').references(() => directOfferResponses.id),
  leadClaimId: uuid('lead_claim_id').references(() => leadClaims.id),
  policyId: uuid('policy_id').notNull().references(() => commissionPolicies.id),
  terms: jsonb('terms').notNull(), // frozen policy snapshot + shareBps + gst flag
  termsHash: text('terms_hash').notNull(),
  shareBps: integer('share_bps').notNull().default(10000),
  status: text('status').notNull().default('active'), // active | terminated
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('commission_agreements_code_uq').on(t.code), uniqueIndex('commission_agreements_project_beneficiary_uq').on(t.projectId, t.beneficiaryOrgId), uniqueIndex('commission_agreements_offer_response_uq').on(t.offerResponseId),
  check('commission_agreements_source_ck', sql`project_id is not null or offer_id is not null or solar_quote_id is not null`)]);

/** Ledger entries — one per project milestone. Amounts are recomputed only by the server from frozen terms. */
export const commissionEntries = pgTable('commission_entries', {
  id: id(),
  agreementId: uuid('agreement_id').notNull().references(() => commissionAgreements.id),
  beneficiaryOrgId: uuid('beneficiary_org_id').notNull().references(() => organizations.id),
  milestoneId: uuid('milestone_id').references(() => milestones.id), // a project milestone…
  offerSaleId: uuid('offer_sale_id').references(() => offerSales.id), // …or a sale registered under a direct offer
  solarQuoteId: uuid('solar_quote_id'), // …or a won Unite Solar quote
  projectInvoiceId: uuid('project_invoice_id').references(() => projectInvoices.id),
  description: text('description').notNull(),
  baseAmount: bigint('base_amount', { mode: 'number' }).notNull(),
  gross: bigint('gross', { mode: 'number' }).notNull(),
  share: bigint('share', { mode: 'number' }).notNull(),
  deductions: jsonb('deductions').notNull().default(sql`'[]'::jsonb`),
  taxable: bigint('taxable', { mode: 'number' }).notNull(),
  gst: bigint('gst', { mode: 'number' }).notNull(),
  tds: bigint('tds', { mode: 'number' }).notNull(),
  payable: bigint('payable', { mode: 'number' }).notNull(),
  status: text('status').notNull().default('estimated'),
  holdReason: text('hold_reason'),
  earnedAt: timestamp('earned_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  payoutId: uuid('payout_id'),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('commission_entries_agreement_milestone_uq').on(t.agreementId, t.milestoneId), index('commission_entries_beneficiary_idx').on(t.beneficiaryOrgId, t.status), uniqueIndex('commission_entries_agreement_sale_uq').on(t.agreementId, t.offerSaleId),
  check('commission_entries_source_ck', sql`milestone_id is not null or offer_sale_id is not null or solar_quote_id is not null`)]);

/** Append-only journal of every ledger movement (gate). */
export const commissionJournal = pgTable('commission_journal', {
  id: id(),
  entryId: uuid('entry_id').notNull().references(() => commissionEntries.id),
  action: text('action').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  amount: bigint('amount', { mode: 'number' }),
  note: text('note'),
  userId: uuid('user_id').references(() => users.id), // null = system (e.g. payment trigger)
  createdAt: createdAt(),
}, (t) => [index('commission_journal_entry_idx').on(t.entryId, t.createdAt)]);

export const commissionApprovals = pgTable('commission_approvals', {
  id: id(),
  entryId: uuid('entry_id').notNull().references(() => commissionEntries.id),
  approverUserId: uuid('approver_user_id').notNull().references(() => users.id),
  note: text('note'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('commission_approvals_uq').on(t.entryId, t.approverUserId)]);

/** 099 — payout request with the partner's own invoice number; settled exactly once (idempotent settlement). */
export const payoutRequests = pgTable('payout_requests', {
  id: id(),
  code: text('code').notNull(),
  beneficiaryOrgId: uuid('beneficiary_org_id').notNull().references(() => organizations.id),
  partnerInvoiceNo: text('partner_invoice_no').notNull(),
  taxable: bigint('taxable', { mode: 'number' }).notNull(),
  gst: bigint('gst', { mode: 'number' }).notNull(),
  tds: bigint('tds', { mode: 'number' }).notNull(),
  payable: bigint('payable', { mode: 'number' }).notNull(),
  status: text('status').notNull().default('requested'), // requested | approved | rejected | settled
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  requestedBy: uuid('requested_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('payout_requests_code_uq').on(t.code), uniqueIndex('payout_requests_invoice_uq').on(t.beneficiaryOrgId, t.partnerInvoiceNo)]);

/** 100 — one settlement per payout and per bank reference: a second attempt cannot pay twice. */
export const settlements = pgTable('settlements', {
  id: id(),
  payoutId: uuid('payout_id').notNull().references(() => payoutRequests.id),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  bankReference: text('bank_reference').notNull(),
  method: text('method').notNull().default('neft'),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
  recordedBy: uuid('recorded_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('settlements_payout_uq').on(t.payoutId), uniqueIndex('settlements_bank_ref_uq').on(t.bankReference)]);

/** 104/159 — commission and payment disputes. */
export const financeDisputes = pgTable('finance_disputes', {
  id: id(),
  code: text('code').notNull(),
  kind: text('kind').notNull(), // commission | payment
  entryId: uuid('entry_id').references(() => commissionEntries.id),
  payoutId: uuid('payout_id').references(() => payoutRequests.id),
  raisedByOrgId: uuid('raised_by_org_id').notNull().references(() => organizations.id),
  reason: text('reason').notNull(),
  expectedAmount: bigint('expected_amount', { mode: 'number' }),
  status: text('status').notNull().default('open'),
  outcome: text('outcome'), // upheld | rejected | adjusted
  resolution: text('resolution'),
  adjustedAmount: bigint('adjusted_amount', { mode: 'number' }),
  priorStatus: text('prior_status'),
  messages: jsonb('messages').notNull().default(sql`'[]'::jsonb`),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('finance_disputes_code_uq').on(t.code)]);

/** 103 — project finance enquiries (feature-flagged; introductions only, no lending on platform — B-09). */
export const financeEnquiries = pgTable('finance_enquiries', {
  id: id(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  projectId: uuid('project_id').references(() => projects.id),
  purpose: text('purpose').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  tenorMonths: integer('tenor_months'),
  consentToShare: text('consent_to_share').notNull(),
  status: text('status').notNull().default('submitted'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
});
