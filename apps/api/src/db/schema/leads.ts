/** Stage 06 — protected leads, Unite-first routing, duplicate review, ownership disputes (Master Book §2.3, §4.2, App. A). */
import { pgTable, uuid, text, timestamp, jsonb, integer, doublePrecision, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { opportunities } from './opportunities';

/** §6.3 customers: owned by the partner organization; consent provenance recorded. Also the CRM record (Stage 07). */
export const customers = pgTable('customers', {
  id: id(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  legalName: text('legal_name').notNull(),
  taxId: text('tax_id'),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  city: text('city'),
  country: text('country').notNull().default('IN'),
  consentProvenance: jsonb('consent_provenance'),
  restrictedContacts: boolean('restricted_contacts').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('customers_org_idx').on(t.organizationId)]);

/** §6.3 lead_claims: introducer, evidence, protected_until, ruling status. One claim per opportunity. */
export const leadClaims = pgTable('lead_claims', {
  id: id(),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id),
  introducerOrgId: uuid('introducer_org_id').notNull().references(() => organizations.id),
  introducerUserId: uuid('introducer_user_id').notNull().references(() => users.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  evidenceSummary: text('evidence_summary').notNull(),
  /** Immutable snapshot of what was registered; hash binds the certificate to it. */
  evidenceSnapshot: jsonb('evidence_snapshot').notNull(),
  evidenceHash: text('evidence_hash').notNull(),
  consent: jsonb('consent').notNull(),
  status: text('status').notNull().default('pending'),
  protectedFrom: timestamp('protected_from', { withTimezone: true }),
  protectedUntil: timestamp('protected_until', { withTimezone: true }),
  duplicateScore: doublePrecision('duplicate_score').notNull().default(0),
  certificateCode: text('certificate_code').notNull(),
  feeTrigger: text('fee_trigger').notNull().default('Customer payment received under the awarded contract (per commission addendum)'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('lead_claims_opp_uq').on(t.opportunityId), uniqueIndex('lead_claims_cert_uq').on(t.certificateCode), index('lead_claims_org_idx').on(t.introducerOrgId)]);

/** 047 — supporting documents for a lead (private storage, signed links). */
export const leadDocuments = pgTable('lead_documents', {
  id: id(),
  claimId: uuid('claim_id').notNull().references(() => leadClaims.id),
  fileName: text('file_name').notNull(),
  objectKey: text('object_key').notNull(),
  sha256: text('sha256').notNull(),
  size: integer('size').notNull(),
  mime: text('mime').notNull(),
  description: text('description'),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  createdAt: createdAt(),
});

/** 048/134 — candidate duplicates found at registration; ruled by compliance on evidence, not first-click. */
export const duplicateCandidates = pgTable('duplicate_candidates', {
  id: id(),
  claimId: uuid('claim_id').notNull().references(() => leadClaims.id),
  candidateClaimId: uuid('candidate_claim_id').notNull().references(() => leadClaims.id),
  score: doublePrecision('score').notNull(),
  reasons: text('reasons').array().notNull().default(sql`'{}'::text[]`),
  ruling: text('ruling').notNull().default('pending'), // pending | not_duplicate | duplicate_upheld_earlier | duplicate_upheld_this
  rulingReason: text('ruling_reason'),
  ruledBy: uuid('ruled_by').references(() => users.id),
  ruledAt: timestamp('ruled_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('dup_claim_idx').on(t.claimId)]);

/** §6.3 routing_events: Unite first-review window per opportunity (business calendar, pauses). */
export const routingEvents = pgTable('routing_events', {
  id: id(),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id),
  groupCompanyOrgId: uuid('group_company_org_id').notNull().references(() => organizations.id),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  slaMinutes: integer('sla_minutes').notNull(),
  calendar: jsonb('calendar').notNull(),
  pausedMinutes: integer('paused_minutes').notNull().default(0),
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  pauseReason: text('pause_reason'),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }),
  urgent: boolean('urgent').notNull().default(false),
  decision: text('decision'), // accept | release | reject
  reason: text('reason'),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('routing_open_idx').on(t.decidedAt), index('routing_opp_idx').on(t.opportunityId)]);

/** 153/134 (and later commission/payment disputes) — independent panel, evidence trail, appeal. */
export const disputes = pgTable('disputes', {
  id: id(),
  code: text('code').notNull(),
  kind: text('kind').notNull(), // lead_ownership | commission | payment
  subjectId: uuid('subject_id').notNull(),
  claimantOrgId: uuid('claimant_org_id').notNull().references(() => organizations.id),
  respondentOrgId: uuid('respondent_org_id').notNull().references(() => organizations.id),
  statement: text('statement').notNull(),
  status: text('status').notNull().default('open'),
  outcome: text('outcome'), // upheld | rejected | split
  rulingReason: text('ruling_reason'),
  panelUserId: uuid('panel_user_id').references(() => users.id),
  previousPanelUserIds: uuid('previous_panel_user_ids').array().notNull().default(sql`'{}'::uuid[]`),
  appealDeadline: timestamp('appeal_deadline', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (t) => [uniqueIndex('disputes_code_uq').on(t.code), index('disputes_subject_idx').on(t.subjectId)]);

export const disputeEntries = pgTable('dispute_entries', {
  id: id(),
  disputeId: uuid('dispute_id').notNull().references(() => disputes.id),
  organizationId: uuid('organization_id').references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  kind: text('kind').notNull().default('evidence'), // evidence | ruling | appeal | note
  body: text('body').notNull(),
  createdAt: createdAt(),
});
