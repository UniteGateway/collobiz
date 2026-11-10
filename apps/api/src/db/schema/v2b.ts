/** COLLABIZ V2 Phase 2 (additive): payment receipts, consortium contributions and agreements, resolution centre. */
import { pgTable, uuid, text, timestamp, bigint, integer, date, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { projectInvoices, projects } from './projects';
import { collaborationTeams } from './teams';

/** Money actually received against an invoice — several receipts make a partial payment. */
export const paymentReceipts = pgTable('payment_receipts', {
  id: id(),
  invoiceId: uuid('invoice_id').notNull().references(() => projectInvoices.id),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  reference: text('reference').notNull(),
  receivedAt: date('received_at').notNull(),
  note: text('note'),
  recordedBy: uuid('recorded_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('payment_receipts_invoice_idx').on(t.invoiceId), uniqueIndex('payment_receipts_ref_uq').on(t.invoiceId, t.reference)]);

export const teamContributions = pgTable('team_contributions', {
  id: id(),
  teamId: uuid('team_id').notNull().references(() => collaborationTeams.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull(),
  description: text('description').notNull(),
  pledgedValue: bigint('pledged_value', { mode: 'number' }).notNull(),
  deliveredValue: bigint('delivered_value', { mode: 'number' }),
  evidence: text('evidence'),
  confirmedByOrgId: uuid('confirmed_by_org_id').references(() => organizations.id), // the lead confirms deliveries of others
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('team_contributions_team_idx').on(t.teamId)]);

export const teamAgreements = pgTable('team_agreements', {
  id: id(),
  teamId: uuid('team_id').notNull().references(() => collaborationTeams.id),
  kind: text('kind').notNull(), // mou | jv | amendment
  version: integer('version').notNull(),
  title: text('title').notNull(),
  decisionRule: text('decision_rule').notNull(),
  authority: text('authority').notNull(),
  body: text('body').notNull(),
  bodyHash: text('body_hash').notNull(),
  status: text('status').notNull().default('proposed'), // proposed | approved | superseded | withdrawn
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
}, (t) => [uniqueIndex('team_agreements_version_uq').on(t.teamId, t.version)]);

export const teamAgreementApprovals = pgTable('team_agreement_approvals', {
  id: id(),
  agreementId: uuid('agreement_id').notNull().references(() => teamAgreements.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  bodyHash: text('body_hash').notNull(),
  approvedBy: uuid('approved_by').notNull().references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('team_agreement_approvals_uq').on(t.agreementId, t.orgId)]);

/** Contract-responsibility disputes (lead, commission and XCHANGE disputes keep their own tables). */
export const resolutionCases = pgTable('resolution_cases', {
  id: id(),
  code: text('code').notNull().unique(),
  projectId: uuid('project_id').references(() => projects.id),
  raisedByOrgId: uuid('raised_by_org_id').notNull().references(() => organizations.id),
  againstOrgId: uuid('against_org_id').notNull().references(() => organizations.id),
  subject: text('subject').notNull(),
  statement: text('statement').notNull(),
  amount: bigint('amount', { mode: 'number' }),
  status: text('status').notNull().default('open'), // open | decided | appealed | closed
  decision: text('decision'),
  decisionNote: text('decision_note'),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  appealNote: text('appeal_note'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const resolutionEvents = pgTable('resolution_events', {
  id: id(),
  caseId: uuid('case_id').notNull().references(() => resolutionCases.id),
  orgId: uuid('org_id').references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  kind: text('kind').notNull(), // statement | response | evidence | decision | appeal
  body: text('body').notNull(),
  createdAt: createdAt(),
}, (t) => [index('resolution_events_case_idx').on(t.caseId)]);

/** Reviewer assigned to any dispute in the resolution centre (kind + source id). */
export const resolutionAssignments = pgTable('resolution_assignments', {
  id: id(),
  kind: text('kind').notNull(),
  sourceId: uuid('source_id').notNull(),
  reviewerUserId: uuid('reviewer_user_id').notNull().references(() => users.id),
  assignedBy: uuid('assigned_by').notNull().references(() => users.id),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('resolution_assignments_uq').on(t.kind, t.sourceId)]);
