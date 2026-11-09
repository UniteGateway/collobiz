/** COLLABIZ V2 (additive): Deal Passports, AI team plans, project work packages, tender eligibility analyses. */
import { pgTable, uuid, text, timestamp, jsonb, integer, bigint, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { leadClaims } from './leads';
import { projects } from './projects';
import { tenders } from './tenders';
import { collaborationTeams } from './teams';

export const dealPassports = pgTable('deal_passports', {
  id: id(),
  code: text('code').notNull().unique(),
  claimId: uuid('claim_id').notNull().unique().references(() => leadClaims.id),
  ownerOrgId: uuid('owner_org_id').notNull().references(() => organizations.id),
  status: text('status').notNull().default('active'), // active | revoked
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

/** Organisations the owner (or Unite) lets see the passport. Access starts only after the party accepts the confidentiality undertaking. */
export const dealPassportParties = pgTable('deal_passport_parties', {
  id: id(),
  passportId: uuid('passport_id').notNull().references(() => dealPassports.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  role: text('role').notNull(),
  ndaHash: text('nda_hash').notNull(),
  ndaAcceptedAt: timestamp('nda_accepted_at', { withTimezone: true }),
  ndaAcceptedBy: uuid('nda_accepted_by').references(() => users.id),
  ndaTypedName: text('nda_typed_name'),
  grantedBy: uuid('granted_by').notNull().references(() => users.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [uniqueIndex('deal_passport_parties_uq').on(t.passportId, t.organizationId)]);

export const teamPlans = pgTable('team_plans', {
  id: id(),
  ownerOrgId: uuid('owner_org_id').notNull().references(() => organizations.id),
  sourceType: text('source_type').notNull(), // opportunity | project | tender
  sourceId: uuid('source_id').notNull(),
  title: text('title').notNull(),
  roles: jsonb('roles').notNull(),
  status: text('status').notNull().default('draft'), // draft | approved | cancelled
  teamId: uuid('team_id').references(() => collaborationTeams.id),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('team_plans_owner_idx').on(t.ownerOrgId)]);

export const teamPlanInvites = pgTable('team_plan_invites', {
  id: id(),
  planId: uuid('plan_id').notNull().references(() => teamPlans.id),
  roleKey: text('role_key').notNull(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  status: text('status').notNull().default('invited'), // invited | accepted | declined | rejected
  message: text('message'),
  invitedBy: uuid('invited_by').notNull().references(() => users.id),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('team_plan_invites_uq').on(t.planId, t.roleKey, t.organizationId)]);

export const workPackages = pgTable('work_packages', {
  id: id(),
  code: text('code').notNull().unique(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  category: text('category').notNull(),
  title: text('title').notNull(),
  scope: text('scope').notNull(),
  budget: bigint('budget', { mode: 'number' }).notNull(),
  eligibility: jsonb('eligibility').notNull().default(sql`'{}'::jsonb`),
  closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('draft'), // draft | open | awarded | in_progress | completed | cancelled
  awardedOrgId: uuid('awarded_org_id').references(() => organizations.id),
  awardedValue: bigint('awarded_value', { mode: 'number' }),
  progress: integer('progress').notNull().default(0),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('work_packages_project_idx').on(t.projectId), index('work_packages_status_idx').on(t.status)]);

export const workPackageBids = pgTable('work_package_bids', {
  id: id(),
  packageId: uuid('package_id').notNull().references(() => workPackages.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  days: integer('days').notNull(),
  note: text('note').notNull(),
  status: text('status').notNull().default('submitted'), // submitted | withdrawn | awarded | not_selected
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('work_package_bids_uq').on(t.packageId, t.organizationId)]);

export const tenderAnalyses = pgTable('tender_analyses', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  tenderId: uuid('tender_id').references(() => tenders.id),
  title: text('title').notNull(),
  fileName: text('file_name').notNull(),
  objectKey: text('object_key').notNull(),
  pages: integer('pages').notNull(),
  criteria: jsonb('criteria').notNull(),
  status: text('status').notNull().default('draft'), // draft | review_requested | reviewed
  reviewNote: text('review_note'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('tender_analyses_org_idx').on(t.orgId)]);
