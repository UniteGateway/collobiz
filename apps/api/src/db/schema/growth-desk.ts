/** AI Growth Desk — campaign agents, the lawful lead database, scored leads, drafted outreach, runs and the opt-out list. */
import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex, boolean, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { uniteVentures } from './offers';

export const growthAgents = pgTable('growth_agents', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  ventureId: uuid('venture_id').references(() => uniteVentures.id),
  product: text('product').notNull(),
  audience: text('audience').notNull(), // buyers | partners | associations | trade | investors
  sectors: text('sectors').array().notNull().default(sql`'{}'::text[]`),
  regions: text('regions').array().notNull().default(sql`'{}'::text[]`),
  countries: text('countries').array().notNull().default(sql`'{IN}'::text[]`),
  pitch: text('pitch').notNull(),
  callToAction: text('call_to_action').notNull(),
  cadence: text('cadence').notNull().default('weekly'),
  minScore: integer('min_score').notNull().default(45),
  maxLeadsPerRun: integer('max_leads_per_run').notNull().default(25),
  dailySendCap: integer('daily_send_cap').notNull().default(40),
  status: text('status').notNull().default('draft'), // draft | active | paused
  clearedBy: uuid('cleared_by').references(() => users.id), // investor agents: super admin clearance
  clearanceNote: text('clearance_note'),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const growthContacts = pgTable('growth_contacts', {
  id: id(),
  organizationName: text('organization_name').notNull(),
  contactName: text('contact_name'),
  email: text('email'),
  phone: text('phone'),
  website: text('website'),
  country: text('country').notNull().default('IN'),
  region: text('region'),
  city: text('city'),
  sector: text('sector').notNull(),
  kind: text('kind').notNull().default('company'), // company | association | investor | institution
  source: text('source').notNull(),
  sourceDetail: text('source_detail').notNull(),
  lawfulBasis: text('lawful_basis').notNull(),
  consentEvidence: text('consent_evidence'),
  optedOutAt: timestamp('opted_out_at', { withTimezone: true }),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('growth_contacts_email_uq').on(sql`lower(${t.email})`), index('growth_contacts_sector_idx').on(t.sector)]);

/** Global opt-out list: an address here is never contacted again, whichever agent or import brings it back. */
export const growthSuppressions = pgTable('growth_suppressions', {
  email: text('email').primaryKey(), // stored lower-case
  reason: text('reason').notNull(), // unsubscribed | complaint | bounced | manual
  createdAt: createdAt(),
});

export const growthRuns = pgTable('growth_runs', {
  id: id(),
  agentId: uuid('agent_id').notNull().references(() => growthAgents.id),
  trigger: text('trigger').notNull(), // manual | schedule
  provider: text('provider').notNull(),
  considered: integer('considered').notNull().default(0),
  created: integer('created').notNull().default(0),
  drafted: integer('drafted').notNull().default(0),
  skipped: jsonb('skipped').notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
});

export const growthLeads = pgTable('growth_leads', {
  id: id(),
  agentId: uuid('agent_id').notNull().references(() => growthAgents.id),
  contactId: uuid('contact_id').notNull().references(() => growthContacts.id),
  runId: uuid('run_id').references(() => growthRuns.id),
  score: integer('score').notNull(),
  reasons: jsonb('reasons').notNull().default([]),
  status: text('status').notNull().default('new'),
  suggestedPartnerOrgId: uuid('suggested_partner_org_id').references(() => organizations.id),
  decidedBy: uuid('decided_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('growth_leads_agent_contact_uq').on(t.agentId, t.contactId), check('growth_leads_score', sql`${t.score} between 0 and 100`)]);

export const growthMessages = pgTable('growth_messages', {
  id: id(),
  leadId: uuid('lead_id').notNull().references(() => growthLeads.id),
  agentId: uuid('agent_id').notNull().references(() => growthAgents.id),
  contactId: uuid('contact_id').notNull().references(() => growthContacts.id),
  channel: text('channel').notNull().default('email'),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  status: text('status').notNull().default('draft'), // draft | approved | rejected | queued | sent | failed | blocked
  blockedReason: text('blocked_reason'),
  provider: text('provider').notNull(),
  promptVersion: text('prompt_version').notNull(),
  sources: jsonb('sources').notNull().default([]),
  unsubscribeToken: text('unsubscribe_token').notNull().unique(),
  edited: boolean('edited').notNull().default(false),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  outboxId: uuid('outbox_id'),
  createdAt: createdAt(),
}, (t) => [index('growth_messages_status_idx').on(t.status)]);
