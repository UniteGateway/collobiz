/**
 * COLLABIZ POWERTRADE — energy + business collaboration layer. Reuses organizations, users, contracts and the existing
 * finance ledger (benefits reference commission entries rather than copying them). Money in integer paise.
 */
import { pgTable, uuid, text, timestamp, boolean, integer, bigint, doublePrecision, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

/** One per organization: industry, state, interests and what it agrees to share. */
export const ptProfiles = pgTable('pt_profiles', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id).unique(),
  industry: text('industry').notNull(),
  state: text('state').notNull(),
  discom: text('discom'),
  gstin: text('gstin'),
  about: text('about'),
  interests: text('interests').array().notNull().default(sql`'{}'::text[]`),
  shareProducts: boolean('share_products').notNull().default(true),
  shareEnergySummary: boolean('share_energy_summary').notNull().default(false),
  /** Sample records for demonstrations are always shown with a "Sample" badge and never counted in production totals. */
  sample: boolean('sample').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Electricity profile, versioned: every save adds a row; the latest is current. */
export const ptEnergyNeeds = pgTable('pt_energy_needs', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  monthlyUnits: integer('monthly_units').notNull(),
  tariffPaisePerKwh: integer('tariff_paise_per_kwh').notNull(),
  contractDemandKva: doublePrecision('contract_demand_kva').notNull(),
  voltageKv: doublePrecision('voltage_kv').notNull(),
  consumerCategory: text('consumer_category').notNull(),
  peakSharePct: doublePrecision('peak_share_pct'),
  preferredSources: text('preferred_sources').array().notNull(),
  rtcNeeded: boolean('rtc_needed').notNull().default(false),
  ppaYears: integer('ppa_years').notNull(),
  rooftopKwp: doublePrecision('rooftop_kwp').notNull().default(0),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('pt_energy_org_idx').on(t.orgId, t.createdAt)]);

/** What the business can contribute: products, capacity, services, rooftops, land, distribution, capital. */
export const ptContributions = pgTable('pt_contributions', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  keywords: text('keywords').array().notNull().default(sql`'{}'::text[]`),
  capacity: text('capacity'),
  locations: text('locations'),
  exportCapable: boolean('export_capable').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('pt_contrib_org_idx').on(t.orgId)]);

/** Saved power-scenario comparisons (inputs, results and the provenance of every charge). */
export const ptScenarios = pgTable('pt_scenarios', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  inputs: jsonb('inputs').notNull(),
  results: jsonb('results').notNull(),
  illustrative: boolean('illustrative').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('pt_scen_org_idx').on(t.orgId, t.createdAt)]);

/** A collaboration under one of the six models, with documents, tax review and an attributable status history. */
export const ptCollaborations = pgTable('pt_collaborations', {
  id: id(),
  code: text('code').notNull().unique(),
  model: text('model').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  counterpartyOrgId: uuid('counterparty_org_id').references(() => organizations.id),
  supplyValuePaise: bigint('supply_value_paise', { mode: 'number' }),
  benefitValuePaise: bigint('benefit_value_paise', { mode: 'number' }),
  powerTariffPaisePerKwh: integer('power_tariff_paise_per_kwh'),
  powerUnitsPerMonth: integer('power_units_per_month'),
  status: text('status').notNull().default('draft'),
  /** { docType: { status: missing|provided|accepted|rejected, reference, by, at } } */
  documents: jsonb('documents').notNull().default(sql`'{}'::jsonb`),
  taxReview: text('tax_review').notNull().default('pending'), // pending | cleared | issues
  history: jsonb('history').notNull().default(sql`'[]'::jsonb`),
  contractIds: uuid('contract_ids').array().notNull().default(sql`'{}'::uuid[]`),
  sample: boolean('sample').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('pt_collab_org_idx').on(t.orgId), index('pt_collab_cp_idx').on(t.counterpartyOrgId)]);

/** Benefit ledger: earned commercial value, kept apart from energy savings and from sales turnover. */
export const ptBenefits = pgTable('pt_benefits', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  collaborationId: uuid('collaboration_id').references(() => ptCollaborations.id),
  source: text('source').notNull(),
  description: text('description').notNull(),
  grossPaise: bigint('gross_paise', { mode: 'number' }).notNull(),
  costsPaise: bigint('costs_paise', { mode: 'number' }).notNull().default(0),
  taxesPaise: bigint('taxes_paise', { mode: 'number' }).notNull().default(0),
  status: text('status').notNull(), // anticipated | earned | verified | collected
  collectedPaise: bigint('collected_paise', { mode: 'number' }).notNull().default(0),
  collectionRef: text('collection_ref'),
  evidence: text('evidence'),
  /** Link to an existing finance record (e.g. commission_entries.id) — referenced, never copied. */
  sourceRef: text('source_ref'),
  verifiedBy: uuid('verified_by').references(() => users.id),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  sample: boolean('sample').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('pt_benefit_org_idx').on(t.orgId), uniqueIndex('pt_benefit_source_ref_uq').on(t.orgId, t.sourceRef)]);

/** Allocation of collected benefit toward a month's power expense. Needs approval by Unite finance. */
export const ptAllocations = pgTable('pt_allocations', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  benefitId: uuid('benefit_id').notNull().references(() => ptBenefits.id),
  period: text('period').notNull(), // YYYY-MM
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  status: text('status').notNull().default('requested'), // requested | approved | rejected
  note: text('note'),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  requestedBy: uuid('requested_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('pt_alloc_org_idx').on(t.orgId, t.period)]);

/** Monthly power savings measured from bills (baseline vs actual), with evidence. */
export const ptEnergySavings = pgTable('pt_energy_savings', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  period: text('period').notNull(),
  baselinePaise: bigint('baseline_paise', { mode: 'number' }).notNull(),
  actualPaise: bigint('actual_paise', { mode: 'number' }).notNull(),
  evidence: text('evidence').notNull(),
  verified: boolean('verified').notNull().default(false),
  verifiedBy: uuid('verified_by').references(() => users.id),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('pt_savings_org_period_uq').on(t.orgId, t.period)]);
