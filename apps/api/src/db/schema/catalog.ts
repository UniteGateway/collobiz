/** Stage 04 — Unite Group companies, catalogue (products & services), success stories. */
import { pgTable, uuid, text, timestamp, jsonb, integer, bigint, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

/** Legal entity record for a Unite Group company. A brand is NOT the legal entity (Stage 04 prompt). */
export const groupCompanies = pgTable('group_companies', {
  organizationId: uuid('organization_id').primaryKey().references(() => organizations.id),
  legalEntityCode: text('legal_entity_code').notNull(),
  brandName: text('brand_name').notNull(),
  sectors: text('sectors').array().notNull().default(sql`'{}'::text[]`),
  billingIdentity: text('billing_identity'),
  description: text('description'),
  website: text('website'),
  status: text('status').notNull().default('active'), // active | inactive
  /** Workspace: kind of company in the group (parent, operating, manufacturing, infra, projects, jv, international, media, business, trade, fintech, allied). */
  category: text('category').notNull().default('business'),
  /** Workspace: holding company, if any. */
  parentOrgId: uuid('parent_org_id').references(() => organizations.id),
  /** Takes part in Unite-first lead routing (needs a configured review team and SLA). */
  receivesLeads: boolean('receives_leads').notNull().default(true),
  /** Shown on the public website's group-company list (off until legal names and details are confirmed). */
  listedPublicly: boolean('listed_publicly').notNull().default(true),
  /** Unite-first routing: first-review window and business calendar (Stage 06, screen 133). */
  slaMinutes: integer('sla_minutes').notNull().default(240),
  calendar: jsonb('calendar').notNull().default(sql`'{"timezone":"Asia/Kolkata","workdays":[1,2,3,4,5],"startHour":9,"endHour":18,"holidays":[]}'::jsonb`),
  autoReleaseOnBreach: boolean('auto_release_on_breach').notNull().default(false),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('group_companies_code_uq').on(t.legalEntityCode)]);

/** Business units within a group company (128). */
export const businessUnits = pgTable('business_units', {
  id: id(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  sectors: text('sectors').array().notNull().default(sql`'{}'::text[]`),
  headUserId: uuid('head_user_id').references(() => users.id),
  createdAt: createdAt(),
});

export const catalogItems = pgTable('catalog_items', {
  id: id(),
  ownerOrgId: uuid('owner_org_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull(), // product | service
  name: text('name').notNull(),
  sector: text('sector').notNull(),
  description: text('description').notNull(),
  sku: text('sku'),
  unit: text('unit'),
  listPrice: bigint('list_price', { mode: 'number' }),
  currency: text('currency').notNull().default('INR'),
  priceVisibility: text('price_visibility').notNull().default('verified_partners'),
  visibility: text('visibility').notNull().default('public'), // public | partners | private
  specs: jsonb('specs').notNull().default(sql`'{}'::jsonb`),
  status: text('status').notNull().default('draft'), // draft | published | archived
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('catalog_items_owner_idx').on(t.ownerOrgId), index('catalog_items_sector_idx').on(t.sector),
  index('catalog_items_fts_idx').using('gin', sql`to_tsvector('english', ${t.name} || ' ' || ${t.description})`)]);

/** 008 — Success stories & case studies (moderated; published only with partner consent). */
export const successStories = pgTable('success_stories', {
  id: id(),
  title: text('title').notNull(),
  sector: text('sector').notNull(),
  summary: text('summary').notNull(),
  body: text('body').notNull(),
  metrics: jsonb('metrics').notNull().default(sql`'[]'::jsonb`),
  partnerOrgIds: uuid('partner_org_ids').array().notNull().default(sql`'{}'::uuid[]`),
  partnerConsent: boolean('partner_consent').notNull().default(false),
  status: text('status').notNull().default('draft'),
  createdBy: uuid('created_by').references(() => users.id),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: createdAt(),
});
