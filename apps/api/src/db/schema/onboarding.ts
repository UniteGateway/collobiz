/** Stage 03 — onboarding, KYC/KYB, bank & tax, agreements, consent and data rights. */
import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, bigint, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

/** §6.3 "partners": capability tags, territories, certifications (+ profile content for 018/143). */
export const partnerProfiles = pgTable('partner_profiles', {
  organizationId: uuid('organization_id').primaryKey().references(() => organizations.id),
  kind: text('kind').notNull(), // individual | company
  // individual (014)
  profession: text('profession'),
  yearsExperience: integer('years_experience'),
  panEnc: text('pan_enc'),
  panLast4: text('pan_last4'),
  // company (015)
  tradeName: text('trade_name'),
  registrationNumber: text('registration_number'),
  gstin: text('gstin'),
  website: text('website'),
  employees: integer('employees'),
  annualTurnover: bigint('annual_turnover', { mode: 'number' }),
  // capabilities (016) & coverage (017)
  sectors: text('sectors').array().notNull().default(sql`'{}'::text[]`),
  skills: text('skills').array().notNull().default(sql`'{}'::text[]`),
  certifications: text('certifications').array().notNull().default(sql`'{}'::text[]`),
  capacityMax: bigint('capacity_max', { mode: 'number' }),
  regions: text('regions').array().notNull().default(sql`'{}'::text[]`),
  willingToTravel: boolean('willing_to_travel').notNull().default(false),
  // business profile (018)
  headline: text('headline'),
  about: text('about'),
  services: text('services').array().notNull().default(sql`'{}'::text[]`),
  pastProjects: jsonb('past_projects').notNull().default(sql`'[]'::jsonb`),
  consentToMatch: boolean('consent_to_match').notNull().default(true),
  completedSteps: text('completed_steps').array().notNull().default(sql`'{}'::text[]`),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('partner_profiles_gstin_idx').on(t.gstin)]);

export const kybDocuments = pgTable('kyb_documents', {
  id: id(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  docType: text('doc_type').notNull(),
  fileName: text('file_name').notNull(),
  objectKey: text('object_key').notNull(),
  sha256: text('sha256').notNull(),
  size: integer('size').notNull(),
  mime: text('mime').notNull(),
  scanStatus: text('scan_status').notNull().default('clean'),
  status: text('status').notNull().default('pending'), // pending | accepted | rejected | superseded
  reviewNote: text('review_note'),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('kyb_documents_org_idx').on(t.organizationId)]);

export const kybReviews = pgTable('kyb_reviews', {
  id: id(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  fromStatus: text('from_status').notNull(),
  toStatus: text('to_status').notNull(),
  reason: text('reason'),
  riskLevel: text('risk_level'),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('kyb_reviews_org_idx').on(t.organizationId)]);

/** Reviewer assignment for the verification queue (130). */
export const kybAssignments = pgTable('kyb_assignments', {
  organizationId: uuid('organization_id').primaryKey().references(() => organizations.id),
  reviewerId: uuid('reviewer_id').notNull().references(() => users.id),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bankProfiles = pgTable('bank_profiles', {
  organizationId: uuid('organization_id').primaryKey().references(() => organizations.id),
  accountHolder: text('account_holder').notNull(),
  accountNumberEnc: text('account_number_enc').notNull(),
  accountLast4: text('account_last4').notNull(),
  ifsc: text('ifsc').notNull(),
  bankName: text('bank_name').notNull(),
  panEnc: text('pan_enc').notNull(),
  panLast4: text('pan_last4').notNull(),
  gstRegistered: boolean('gst_registered').notNull(),
  gstin: text('gstin'),
  tdsSection: text('tds_section'),
  verified: boolean('verified').notNull().default(false),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: updatedAt(),
});

export const agreementTemplates = pgTable('agreement_templates', {
  id: id(),
  code: text('code').notNull(),
  version: integer('version').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  bodyHash: text('body_hash').notNull(),
  requiredFor: text('required_for').notNull().default('onboarding'),
  status: text('status').notNull().default('active'), // draft | active | retired
  legalReviewed: boolean('legal_reviewed').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('agreement_templates_code_ver_uq').on(t.code, t.version)]);

/** Click-to-accept e-sign evidence (B-08): typed name, IP, user agent, document hash, timestamp. */
export const agreementAcceptances = pgTable('agreement_acceptances', {
  id: id(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  templateCode: text('template_code').notNull(),
  version: integer('version').notNull(),
  typedName: text('typed_name').notNull(),
  docHash: text('doc_hash').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('agreement_acceptances_uq').on(t.organizationId, t.templateCode, t.version)]);

/** Partner risk & compliance flags (131). */
export const riskFlags = pgTable('risk_flags', {
  id: id(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull(), // duplicate_tax_id | sanctions_screen | document_mismatch | adverse_media | manual
  severity: text('severity').notNull(), // low | medium | high
  note: text('note').notNull(),
  source: text('source').notNull().default('manual'), // automatic | manual
  status: text('status').notNull().default('open'), // open | cleared
  createdBy: uuid('created_by').references(() => users.id),
  clearedBy: uuid('cleared_by').references(() => users.id),
  clearNote: text('clear_note'),
  createdAt: createdAt(),
  clearedAt: timestamp('cleared_at', { withTimezone: true }),
}, (t) => [index('risk_flags_org_idx').on(t.organizationId)]);

/** 149 — consent ledger (append-only; latest row per purpose wins). */
export const consents = pgTable('consents', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  purpose: text('purpose').notNull(),
  granted: boolean('granted').notNull(),
  createdAt: createdAt(),
}, (t) => [index('consents_user_idx').on(t.userId)]);

/** 149/150 — data subject requests (export, deletion, correction) with statutory due dates. */
export const dataRequests = pgTable('data_requests', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  kind: text('kind').notNull(), // export | deletion | correction | account_closure
  details: text('details'),
  status: text('status').notNull().default('open'), // open | in_progress | completed | rejected
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  resolution: text('resolution'),
  legalHold: boolean('legal_hold').notNull().default(false),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  createdAt: createdAt(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});
