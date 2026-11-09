/** Franchise network (units, checklist, monthly sales and royalty) and real-estate inventory (projects, units, partner holds). */
import { pgTable, uuid, text, timestamp, jsonb, integer, bigint, index, uniqueIndex, boolean, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

export const franchiseUnits = pgTable('franchise_units', {
  id: id(),
  code: text('code').notNull().unique(),
  brandOrgId: uuid('brand_org_id').notNull().references(() => organizations.id),
  franchiseeOrgId: uuid('franchisee_org_id').notNull().references(() => organizations.id),
  format: text('format').notNull(),
  city: text('city').notNull(),
  region: text('region').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('applied'),
  fee: bigint('fee', { mode: 'number' }),
  royaltyBps: integer('royalty_bps'),
  monthlyTarget: bigint('monthly_target', { mode: 'number' }),
  checklist: jsonb('checklist').notNull().default(sql`'{}'::jsonb`), // { key: ISO date done }
  decisionNote: text('decision_note'),
  decidedBy: uuid('decided_by').references(() => users.id),
  appliedBy: uuid('applied_by').notNull().references(() => users.id),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('franchise_units_brand_idx').on(t.brandOrgId, t.status), uniqueIndex('franchise_units_active_uq').on(t.franchiseeOrgId, t.brandOrgId, sql`lower(${t.city})`).where(sql`status not in ('rejected', 'closed')`)]);

export const franchiseReports = pgTable('franchise_reports', {
  id: id(),
  unitId: uuid('unit_id').notNull().references(() => franchiseUnits.id),
  month: text('month').notNull(), // YYYY-MM
  sales: bigint('sales', { mode: 'number' }).notNull(),
  orders: integer('orders').notNull(),
  royalty: bigint('royalty', { mode: 'number' }).notNull(),
  notes: text('notes'),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('franchise_reports_unit_month_uq').on(t.unitId, t.month)]);

export const propertyProjects = pgTable('property_projects', {
  id: id(),
  code: text('code').notNull().unique(),
  ownerOrgId: uuid('owner_org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  city: text('city').notNull(),
  region: text('region').notNull(),
  description: text('description').notNull(),
  reraNumber: text('rera_number'),
  commissionBps: integer('commission_bps').notNull().default(200),
  openToPartners: boolean('open_to_partners').notNull().default(false),
  status: text('status').notNull().default('selling'), // planning | selling | sold_out | closed
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const propertyUnits = pgTable('property_units', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => propertyProjects.id),
  unitNo: text('unit_no').notNull(),
  unitType: text('unit_type').notNull(),
  areaSqft: integer('area_sqft').notNull(),
  price: bigint('price', { mode: 'number' }).notNull(),
  status: text('status').notNull().default('available'), // available | held | booked | sold | blocked
  heldByOrgId: uuid('held_by_org_id').references(() => organizations.id),
  heldByUserId: uuid('held_by_user_id').references(() => users.id),
  heldUntil: timestamp('held_until', { withTimezone: true }),
  buyerName: text('buyer_name'),
  buyerCity: text('buyer_city'),
  consentMethod: text('consent_method'),
  agentRera: text('agent_rera'),
  bookedAt: timestamp('booked_at', { withTimezone: true }),
  soldAt: timestamp('sold_at', { withTimezone: true }),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('property_units_project_no_uq').on(t.projectId, t.unitNo), index('property_units_status_idx').on(t.projectId, t.status),
  check('property_units_hold', sql`${t.status} <> 'held' or (${t.heldByOrgId} is not null and ${t.heldUntil} is not null)`)]);
