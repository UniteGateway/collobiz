/**
 * GO EB5 — EB-5 consultancy module (contracting entity CITRUS360 LLC). Personal data (contact details, application
 * content, documents) is encrypted at rest; contact identifiers are stored as hashes for duplicate checks. Money in US
 * cents. Investment capital is tracked only — never received or held by COLLABIZ.
 */
import { pgTable, uuid, text, timestamp, integer, bigint, boolean, jsonb, date, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

export const eb5Settings = pgTable('eb5_settings', {
  id: integer('id').primaryKey().default(1),
  values: jsonb('values').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: updatedAt(),
});

/** Staff roles for the module (partners and clients are derived from their own records). */
export const eb5Roles = pgTable('eb5_roles', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: text('role').notNull(),
  grantedBy: uuid('granted_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('eb5_roles_uq').on(t.userId, t.role)]);

export const eb5Partners = pgTable('eb5_partners', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull(), // immigration_adviser | business_consultant | financial_consultant | accountant | law_firm | project_representative | other
  role: text('role').notNull().default('bd_partner'), // bd_partner | referral_consultant
  jurisdiction: text('jurisdiction').notNull(),
  specialization: text('specialization').notNull(),
  credentials: text('credentials'),
  contactEmail: text('contact_email').notNull(),
  i956kStatus: text('i956k_status').notNull().default('not_assessed'), // not_assessed | not_required | pending | registered
  agreementStatus: text('agreement_status').notNull().default('none'), // none | sent | signed
  complianceStatus: text('compliance_status').notNull().default('pending'), // pending | approved | rejected | suspended
  complianceNote: text('compliance_note'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  linkToken: text('link_token').notNull().unique(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('eb5_partners_org_uq').on(t.orgId)]);

export const eb5Leads = pgTable('eb5_leads', {
  id: id(),
  code: text('code').notNull().unique(),
  partnerId: uuid('partner_id').references(() => eb5Partners.id),
  introducedBy: uuid('introduced_by').references(() => users.id),
  source: text('source').notNull(), // partner | partner_link | direct | website
  fullName: text('full_name').notNull(),
  country: text('country').notNull(),
  city: text('city'),
  contactEnc: text('contact_enc').notNull(), // {email, phone} encrypted
  emailHash: text('email_hash'),
  phoneHash: text('phone_hash'),
  familyMembers: text('family_members'),
  readiness: text('readiness').notNull(),
  timeline: text('timeline').notNull(),
  contactPreference: text('contact_preference').notNull(),
  consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
  consentText: text('consent_text').notNull(),
  assignedManagerId: uuid('assigned_manager_id').references(() => users.id),
  stage: integer('stage').notNull().default(0),
  followUpOn: date('follow_up_on'),
  notes: text('notes'),
  history: jsonb('history').notNull().default(sql`'[]'::jsonb`),
  /** Possible duplicate of an earlier lead (same email/phone hash): first introducer keeps ownership until compliance decides. */
  duplicateOf: uuid('duplicate_of'),
  ownershipDispute: jsonb('ownership_dispute'),
  clientUserId: uuid('client_user_id').references(() => users.id),
  attorneyUserId: uuid('attorney_user_id').references(() => users.id),
  projectId: uuid('project_id'),
  caseStage: integer('case_stage').notNull().default(0),
  closedReason: text('closed_reason'),
  demo: boolean('demo').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('eb5_leads_partner_idx').on(t.partnerId), index('eb5_leads_email_idx').on(t.emailHash), index('eb5_leads_phone_idx').on(t.phoneHash)]);

export const eb5Applications = pgTable('eb5_applications', {
  id: id(),
  code: text('code').notNull().unique(),
  leadId: uuid('lead_id').notNull().references(() => eb5Leads.id),
  clientUserId: uuid('client_user_id').notNull().references(() => users.id),
  status: text('status').notNull().default('draft'), // draft | submitted | under_review | reviewed
  dataEnc: text('data_enc').notNull(),
  photoKey: text('photo_key'),
  signedName: text('signed_name'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('eb5_applications_lead_uq').on(t.leadId)]);

export const eb5Consultations = pgTable('eb5_consultations', {
  id: id(),
  leadId: uuid('lead_id').notNull().references(() => eb5Leads.id),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  timezone: text('timezone').notNull(),
  durationMin: integer('duration_min').notNull().default(45),
  mode: text('mode').notNull(),
  kind: text('kind').notNull(), // Consultant | Attorney
  location: text('location'),
  agenda: text('agenda'),
  hostUserId: uuid('host_user_id').notNull().references(() => users.id),
  status: text('status').notNull().default('scheduled'), // scheduled | completed | cancelled | no_show
  attendance: text('attendance'),
  notes: text('notes'),
  history: jsonb('history').notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('eb5_consultations_lead_idx').on(t.leadId)]);

export const eb5Agreements = pgTable('eb5_agreements', {
  id: id(),
  code: text('code').notNull().unique(),
  leadId: uuid('lead_id').notNull().references(() => eb5Leads.id),
  version: integer('version').notNull().default(1),
  state: text('state').notNull().default('Draft'),
  terms: jsonb('terms').notNull(),
  body: text('body').notNull(),
  bodyHash: text('body_hash').notNull(),
  history: jsonb('history').notNull().default(sql`'[]'::jsonb`),
  clientSignedName: text('client_signed_name'),
  clientSignedAt: timestamp('client_signed_at', { withTimezone: true }),
  clientSignedIp: text('client_signed_ip'),
  counterSignedBy: uuid('counter_signed_by').references(() => users.id),
  counterSignedAt: timestamp('counter_signed_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('eb5_agreements_lead_idx').on(t.leadId)]);

export const eb5Invoices = pgTable('eb5_invoices', {
  id: id(),
  number: text('number').notNull().unique(),
  leadId: uuid('lead_id').notNull().references(() => eb5Leads.id),
  agreementId: uuid('agreement_id').references(() => eb5Agreements.id),
  ledger: text('ledger').notNull(), // see EB5_LEDGERS
  description: text('description').notNull(),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  currency: text('currency').notNull().default('USD'),
  status: text('status').notNull().default('issued'), // issued | payment_reported | verified | cancelled
  dueOn: date('due_on'),
  paymentReference: text('payment_reference'),
  paymentReportedAt: timestamp('payment_reported_at', { withTimezone: true }),
  verifiedBy: uuid('verified_by').references(() => users.id),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  receiptNumber: text('receipt_number'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('eb5_invoices_lead_idx').on(t.leadId)]);

export const eb5Documents = pgTable('eb5_documents', {
  id: id(),
  leadId: uuid('lead_id').notNull().references(() => eb5Leads.id),
  category: text('category').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull().default('requested'), // requested | uploaded | accepted | rejected | deleted
  requestedBy: uuid('requested_by').references(() => users.id),
  note: text('note'),
  objectKey: text('object_key'),
  sha256: text('sha256'),
  mime: text('mime'),
  size: integer('size'),
  version: integer('version').notNull().default(0),
  versions: jsonb('versions').notNull().default(sql`'[]'::jsonb`),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  reviewNote: text('review_note'),
  expiresOn: date('expires_on'),
  retainUntil: date('retain_until'),
  deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('eb5_documents_lead_idx').on(t.leadId)]);

export const eb5DocAccess = pgTable('eb5_doc_access', {
  id: id(),
  documentId: uuid('document_id').notNull().references(() => eb5Documents.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  action: text('action').notNull(), // view | download | upload | review | delete_request
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('eb5_doc_access_doc_idx').on(t.documentId)]);

export const eb5CaseMilestones = pgTable('eb5_case_milestones', {
  id: id(),
  leadId: uuid('lead_id').notNull().references(() => eb5Leads.id),
  stage: integer('stage').notNull(),
  statusSource: text('status_source').notNull(),
  note: text('note').notNull(),
  evidenceDocumentId: uuid('evidence_document_id').references(() => eb5Documents.id),
  visibleToClient: boolean('visible_to_client').notNull().default(false),
  recordedBy: uuid('recorded_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('eb5_case_lead_idx').on(t.leadId)]);

export const eb5Projects = pgTable('eb5_projects', {
  id: id(),
  name: text('name').notNull(),
  sponsor: text('sponsor').notNull(),
  regionalCenter: text('regional_center'),
  location: text('location').notNull(),
  sector: text('sector').notNull(),
  description: text('description').notNull(),
  investmentThresholdUsd: integer('investment_threshold_usd'),
  offeringStatus: text('offering_status').notNull().default('proposed'), // proposed | in_preparation | offering | closed
  /** Claims (TEA, business plan, economic report, I-956F, offering documents): each {status, evidence, by, at}; only set with evidence. */
  claims: jsonb('claims').notNull().default(sql`'{}'::jsonb`),
  jobMethodology: text('job_methodology'),
  milestones: jsonb('milestones').notNull().default(sql`'[]'::jsonb`),
  advisors: text('advisors'),
  demo: boolean('demo').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const eb5Tasks = pgTable('eb5_tasks', {
  id: id(),
  leadId: uuid('lead_id').references(() => eb5Leads.id),
  title: text('title').notNull(),
  dueOn: date('due_on').notNull(),
  assigneeId: uuid('assignee_id').notNull().references(() => users.id),
  doneAt: timestamp('done_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('eb5_tasks_assignee_idx').on(t.assigneeId)]);

/** Partner compensation — compliance-controlled records only. Nothing is calculated or paid automatically. */
export const eb5Compensation = pgTable('eb5_compensation', {
  id: id(),
  partnerId: uuid('partner_id').notNull().references(() => eb5Partners.id),
  leadId: uuid('lead_id').references(() => eb5Leads.id),
  description: text('description').notNull(),
  amountCents: bigint('amount_cents', { mode: 'number' }),
  status: text('status').notNull().default('pending_legal'), // pending_legal | approved | rejected
  legalReference: text('legal_reference'),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
});
