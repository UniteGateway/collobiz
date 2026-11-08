/**
 * Stages 15–16 — international expansion, alliances, regional settings, content management.
 *  - Country partnership is granted by Unite Group after review; the applicant can never approve itself (R4.7).
 *  - Alliance/JV proposals are decided only by the receiving organization; nothing becomes binding here —
 *    agreed proposals move to the contracts module for drafting and signature.
 *  - Exchange rates are dated, manually maintained reference rates for display only; ledgers stay in INR.
 */
import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex, boolean, numeric, date } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

/** 120 — application to become the country partner for a market. */
export const countryPartnerApplications = pgTable('country_partner_applications', {
  id: id(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  country: text('country').notNull(),
  sectors: text('sectors').array().notNull(),
  localEntity: text('local_entity').notNull(), // registered company in the market
  localRegistration: text('local_registration').notNull(),
  teamSize: integer('team_size').notNull(),
  plan: text('plan').notNull(), // first-year market plan
  references: jsonb('references').notNull().default(sql`'[]'::jsonb`),
  status: text('status').notNull().default('submitted'), // submitted | approved | rejected | withdrawn
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  decidedBy: uuid('decided_by').references(() => users.id),
  decisionReason: text('decision_reason'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('cpa_status_idx').on(t.status)]);

/** 121 — territories held by country partners. One active exclusive partner per country and sector. */
export const countryTerritories = pgTable('country_territories', {
  id: id(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  country: text('country').notNull(),
  sectors: text('sectors').array().notNull(),
  exclusive: boolean('exclusive').notNull().default(false),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
  status: text('status').notNull().default('active'), // active | ended
  applicationId: uuid('application_id').references(() => countryPartnerApplications.id),
  createdAt: createdAt(),
}, (t) => [index('ct_country_idx').on(t.country, t.status)]);

/** 122 — cross-border import/export enquiries, routed to Unite Exim. */
export const crossBorderEnquiries = pgTable('cross_border_enquiries', {
  id: id(),
  code: text('code').notNull().unique(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  direction: text('direction').notNull(), // import | export
  product: text('product').notNull(),
  hsCode: text('hs_code'),
  quantity: text('quantity').notNull(),
  originCountry: text('origin_country').notNull(),
  destinationCountry: text('destination_country').notNull(),
  incoterm: text('incoterm').notNull().default('FOB'),
  targetDate: date('target_date'),
  notes: text('notes'),
  routedToOrgId: uuid('routed_to_org_id').references(() => organizations.id),
  status: text('status').notNull().default('open'), // open | quoted | closed
  response: text('response'),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  checklistDone: text('checklist_done').array().notNull().default(sql`'{}'::text[]`),
  createdAt: createdAt(),
}, (t) => [index('cbe_org_idx').on(t.organizationId)]);

/** 123 — JV / strategic alliance / distribution proposals between organizations. */
export const allianceProposals = pgTable('alliance_proposals', {
  id: id(),
  code: text('code').notNull().unique(),
  kind: text('kind').notNull(), // joint_venture | strategic_alliance | distribution
  proposerOrgId: uuid('proposer_org_id').notNull().references(() => organizations.id),
  targetOrgId: uuid('target_org_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  scope: text('scope').notNull(),
  markets: text('markets').array().notNull(),
  sectors: text('sectors').array().notNull(),
  proposerSharePct: integer('proposer_share_pct'),
  durationMonths: integer('duration_months').notNull(),
  status: text('status').notNull().default('submitted'), // submitted | in_discussion | accepted | declined | withdrawn
  createdBy: uuid('created_by').notNull().references(() => users.id),
  decidedBy: uuid('decided_by').references(() => users.id),
  decisionReason: text('decision_reason'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('ap_target_idx').on(t.targetOrgId), index('ap_proposer_idx').on(t.proposerOrgId)]);

/** 146 — per-user regional preferences (language, display currency, time zone, date style). */
export const userPreferences = pgTable('user_preferences', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  language: text('language').notNull().default('en-IN'),
  currency: text('currency').notNull().default('INR'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  dateStyle: text('date_style').notNull().default('dmy'),
  updatedAt: updatedAt(),
});

/** 146 — indicative reference rates (display only). Ledgers, invoices and commission remain in INR. */
export const fxRates = pgTable('fx_rates', {
  id: id(),
  currency: text('currency').notNull(),
  inrPerUnit: numeric('inr_per_unit', { precision: 14, scale: 4 }).notNull(),
  asOf: date('as_of').notNull(),
  source: text('source').notNull(),
  setBy: uuid('set_by').references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('fx_rates_unique').on(t.currency, t.asOf)]);

/** 142 — managed content pages (help articles, policy pages), versioned per locale. */
export const contentPages = pgTable('content_pages', {
  id: id(),
  slug: text('slug').notNull(),
  locale: text('locale').notNull().default('en-IN'),
  kind: text('kind').notNull(), // help | policy | page
  title: text('title').notNull(),
  body: text('body').notNull(),
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('draft'), // draft | published | archived
  updatedBy: uuid('updated_by').references(() => users.id),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('content_pages_slug_locale').on(t.slug, t.locale)]);

/** Append-only history of content changes (who changed what, when). */
export const contentRevisions = pgTable('content_revisions', {
  id: id(),
  pageId: uuid('page_id').notNull().references(() => contentPages.id),
  version: integer('version').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  changedBy: uuid('changed_by').notNull().references(() => users.id),
  note: text('note'),
  createdAt: createdAt(),
});

