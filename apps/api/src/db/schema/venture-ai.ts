/**
 * COLLABIZ VENTURE AI — opportunities, evidence, member capabilities, Venture Rooms, members (invitations with consent),
 * tasks, approvals and AI agent runs. Reuses organizations, users, notifications, audit events and contracts.
 */
import { pgTable, uuid, text, timestamp, boolean, integer, bigint, doublePrecision, jsonb, index, uniqueIndex, date } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

/** What an organization can contribute to new businesses (one row per organization). */
export const vaiCapabilities = pgTable('vai_capabilities', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id).unique(),
  roles: text('roles').array().notNull(),
  categories: text('categories').array().notNull().default(sql`'{}'::text[]`),
  countries: text('countries').array().notNull(),
  locations: text('locations'), capacity: text('capacity'), spareCapacity: text('spare_capacity'), machinery: text('machinery'), technology: text('technology'), moq: text('moq'),
  investmentMinPaise: bigint('investment_min_paise', { mode: 'number' }), investmentMaxPaise: bigint('investment_max_paise', { mode: 'number' }),
  certifications: text('certifications').array().notNull().default(sql`'{}'::text[]`),
  territories: text('territories').array().notNull().default(sql`'{}'::text[]`),
  languages: text('languages').array().notNull().default(sql`'{}'::text[]`),
  experience: text('experience'),
  available: boolean('available').notNull().default(true),
  contactPermission: text('contact_permission').notNull().default('via_collabiz'),
  updatedBy: uuid('updated_by').notNull().references(() => users.id),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('vai_cap_roles_idx').using('gin', t.roles)]);

export const vaiOpportunities = pgTable('vai_opportunities', {
  id: id(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  type: text('type').notNull(),
  problem: text('problem').notNull(), marketGap: text('market_gap').notNull(), targetCustomers: text('target_customers').notNull(), proposedSolution: text('proposed_solution').notNull(),
  competitors: text('competitors'), technology: text('technology'), manufacturing: text('manufacturing'),
  investmentPaise: bigint('investment_paise', { mode: 'number' }), marginPct: doublePrecision('margin_pct'),
  countries: text('countries').array().notNull(),
  risks: text('risks'), regulatory: text('regulatory'),
  /** Required roles: [{ role, count, categories, countries, note }] */
  roles: jsonb('roles').notNull().default(sql`'[]'::jsonb`),
  /** { inputs, checks, weights, result } from the scoring engine */
  score: jsonb('score'),
  /** Combination concept: naming options, sizing (e.g. Solar Conveyor) with its inputs and results */
  concept: jsonb('concept'),
  /** { inputs, result, sensitivity } from the financial engine */
  finance: jsonb('finance'),
  status: text('status').notNull().default('draft'),
  origin: text('origin').notNull().default('member'), // member | admin | combination | pilot
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  decidedBy: uuid('decided_by').references(() => users.id), decidedAt: timestamp('decided_at', { withTimezone: true }), decisionNote: text('decision_note'),
  version: integer('version').notNull().default(1),
  sample: boolean('sample').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('vai_opp_status_idx').on(t.status)]);

/** Evidence behind an opportunity: verified facts need a source and date; assumptions and forecasts are labelled. */
export const vaiEvidence = pgTable('vai_evidence', {
  id: id(),
  opportunityId: uuid('opportunity_id').notNull().references(() => vaiOpportunities.id),
  kind: text('kind').notNull(), statement: text('statement').notNull(), source: text('source'), sourceDate: date('source_date'),
  addedBy: uuid('added_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('vai_evid_opp_idx').on(t.opportunityId)]);

/** Venture Room — a digital workspace, not a legal entity. An SPV/LLP/JV is recorded only if the members form one. */
export const vaiVentures = pgTable('vai_ventures', {
  id: id(),
  code: text('code').notNull().unique(),
  opportunityId: uuid('opportunity_id').notNull().references(() => vaiOpportunities.id).unique(),
  name: text('name').notNull(),
  status: text('status').notNull().default('forming'),
  legalStructure: text('legal_structure'),
  aiBudgetPaise: bigint('ai_budget_paise', { mode: 'number' }).notNull().default(0),
  sample: boolean('sample').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

/** Members of a Venture Room. An invitation is a row with status 'invited'; nothing binds a member until they accept. */
export const vaiMembers = pgTable('vai_members', {
  id: id(),
  ventureId: uuid('venture_id').notNull().references(() => vaiVentures.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  role: text('role').notNull(),
  status: text('status').notNull().default('invited'), // owner | invited | accepted | declined | left
  message: text('message'), investmentPaise: bigint('investment_paise', { mode: 'number' }), earningsNote: text('earnings_note'), risksNote: text('risks_note'),
  matchPercent: integer('match_percent'), matchReasons: jsonb('match_reasons').notNull().default(sql`'[]'::jsonb`),
  invitedBy: uuid('invited_by').references(() => users.id), respondedBy: uuid('responded_by').references(() => users.id), respondedAt: timestamp('responded_at', { withTimezone: true }),
  /** Participation terms proposed by the venture owner (VaiTermsSchema) and the draft contract they generated in Contracts. */
  terms: jsonb('terms'), contractId: uuid('contract_id'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('vai_members_role_uq').on(t.ventureId, t.orgId, t.role), index('vai_members_org_idx').on(t.orgId)]);

export const vaiTasks = pgTable('vai_tasks', {
  id: id(),
  ventureId: uuid('venture_id').notNull().references(() => vaiVentures.id),
  title: text('title').notNull(),
  assigneeMemberId: uuid('assignee_member_id').references(() => vaiMembers.id),
  dueOn: date('due_on'), milestone: boolean('milestone').notNull().default(false),
  status: text('status').notNull().default('open'),
  createdBy: uuid('created_by').notNull().references(() => users.id), doneBy: uuid('done_by').references(() => users.id), doneAt: timestamp('done_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('vai_tasks_venture_idx').on(t.ventureId)]);

/** Approval requests: binding agreements, money, purchase orders, publication of material claims, production release… */
export const vaiApprovals = pgTable('vai_approvals', {
  id: id(),
  ventureId: uuid('venture_id').notNull().references(() => vaiVentures.id),
  kind: text('kind').notNull(), title: text('title').notNull(), detail: text('detail'), amountPaise: bigint('amount_paise', { mode: 'number' }),
  status: text('status').notNull().default('pending'),
  requestedBy: uuid('requested_by').notNull().references(() => users.id), decidedBy: uuid('decided_by').references(() => users.id), decidedAt: timestamp('decided_at', { withTimezone: true }), note: text('note'),
  createdAt: createdAt(),
}, (t) => [index('vai_appr_venture_idx').on(t.ventureId, t.status)]);

/** Every AI agent run: provider, model, status, token use and estimated cost. Output is advisory text, never a record of money. */
export const vaiAgentRuns = pgTable('vai_agent_runs', {
  id: id(),
  ventureId: uuid('venture_id').references(() => vaiVentures.id),
  opportunityId: uuid('opportunity_id').references(() => vaiOpportunities.id),
  agent: text('agent').notNull(), instruction: text('instruction').notNull(),
  provider: text('provider').notNull(), model: text('model'),
  status: text('status').notNull(), // completed | failed | blocked
  output: text('output'), error: text('error'),
  inputTokens: integer('input_tokens').notNull().default(0), outputTokens: integer('output_tokens').notNull().default(0),
  costPaise: bigint('cost_paise', { mode: 'number' }).notNull().default(0),
  orgId: uuid('org_id').references(() => organizations.id),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('vai_runs_venture_idx').on(t.ventureId), index('vai_runs_created_idx').on(t.createdAt)]);
