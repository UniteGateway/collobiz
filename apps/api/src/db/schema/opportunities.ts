/** Stage 05 — opportunity marketplace (shared with Stage 06 lead protection & routing). */
import { pgTable, uuid, text, timestamp, jsonb, integer, bigint, boolean, doublePrecision, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

export const opportunities = pgTable('opportunities', {
  id: id(),
  code: text('code').notNull(), // stable human-readable identifier, e.g. OPP-2026-00042
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  sector: text('sector').notNull(),
  kind: text('kind').notNull(),
  route: text('route').notNull(), // unite_owned | partner_originated | partner_exchange | joint_execution
  source: text('source').notNull(), // unite_listing | partner_lead | rfq | partner_listing
  city: text('city'),
  region: text('region'),
  country: text('country').notNull().default('IN'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  estimatedValue: bigint('estimated_value', { mode: 'number' }),
  currency: text('currency').notNull().default('INR'),
  deadline: timestamp('deadline', { withTimezone: true }),
  visibility: text('visibility').notNull().default('verified_partners'), // public | verified_partners | invited | private
  minLevel: text('min_level').notNull().default('verified'),
  requiredCertifications: text('required_certifications').array().notNull().default(sql`'{}'::text[]`),
  ownerOrgId: uuid('owner_org_id').notNull().references(() => organizations.id), // originator / publisher
  groupCompanyOrgId: uuid('group_company_org_id').references(() => organizations.id), // matched Unite company
  status: text('status').notNull().default('draft'),
  listed: boolean('listed').notNull().default(false), // shown in marketplace
  buyerConfidential: boolean('buyer_confidential').notNull().default(false),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('opportunities_code_uq').on(t.code),
  index('opportunities_status_idx').on(t.status, t.listed),
  index('opportunities_sector_idx').on(t.sector),
  index('opportunities_fts_idx').using('gin', sql`to_tsvector('english', ${t.title} || ' ' || ${t.summary})`),
]);

/** Immutable, versioned status history (§4.3). */
export const opportunityEvents = pgTable('opportunity_events', {
  id: id(),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id),
  version: integer('version').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  reason: text('reason'),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('opportunity_events_ver_uq').on(t.opportunityId, t.version)]);

export const opportunityApplications = pgTable('opportunity_applications', {
  id: id(),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  applicantUserId: uuid('applicant_user_id').notNull().references(() => users.id),
  message: text('message').notNull(),
  proposedValue: bigint('proposed_value', { mode: 'number' }),
  teamId: uuid('team_id'),
  status: text('status').notNull().default('submitted'), // submitted | shortlisted | accepted | rejected | withdrawn
  decisionReason: text('decision_reason'),
  decidedBy: uuid('decided_by').references(() => users.id),
  eligibilitySnapshot: jsonb('eligibility_snapshot'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('applications_opp_idx').on(t.opportunityId), uniqueIndex('applications_active_uq').on(t.opportunityId, t.organizationId).where(sql`status <> 'withdrawn'`)]);

export const savedOpportunities = pgTable('saved_opportunities', {
  userId: uuid('user_id').notNull().references(() => users.id),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.opportunityId] })]);

export const savedSearches = pgTable('saved_searches', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  query: jsonb('query').notNull(),
  alert: boolean('alert').notNull().default(true),
  lastAlertAt: timestamp('last_alert_at', { withTimezone: true }),
  createdAt: createdAt(),
});

/** In-app notifications (also used by Stage 13 notification centre, screen 111). */
export const notifications = pgTable('notifications', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  link: text('link'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('notifications_user_idx').on(t.userId, t.readAt)]);

/** 040 — buyer requirement submissions from the public site (consent recorded). */
export const rfqRequests = pgTable('rfq_requests', {
  id: id(),
  reference: text('reference').notNull(),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id),
  contactName: text('contact_name').notNull(),
  contactEmail: text('contact_email').notNull(),
  contactPhone: text('contact_phone'),
  submittedByUserId: uuid('submitted_by_user_id').references(() => users.id),
  consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('rfq_ref_uq').on(t.reference)]);

import { pgSequence } from 'drizzle-orm/pg-core';
export const opportunityCodeSeq = pgSequence('opportunity_code_seq', { startWith: 1000 });
