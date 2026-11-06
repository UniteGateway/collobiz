/** Stage 07 — CRM: deals (pipeline), append-only activities, follow-up tasks. Customers live in leads.ts. */
import { pgTable, uuid, text, timestamp, integer, bigint, index } from 'drizzle-orm/pg-core';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { customers, leadClaims } from './leads';

export const crmDeals = pgTable('crm_deals', {
  id: id(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  leadClaimId: uuid('lead_claim_id').references(() => leadClaims.id),
  title: text('title').notNull(),
  value: bigint('value', { mode: 'number' }),
  currency: text('currency').notNull().default('INR'),
  stage: text('stage').notNull().default('new'),
  ownerUserId: uuid('owner_user_id').references(() => users.id),
  expectedClose: timestamp('expected_close', { withTimezone: true }),
  lostReason: text('lost_reason'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('crm_deals_org_idx').on(t.organizationId, t.stage)]);

/** Append-only activity history (§9 Stage 07 "activity history"); stage changes are recorded automatically. */
export const crmActivities = pgTable('crm_activities', {
  id: id(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  subjectType: text('subject_type').notNull(), // customer | deal | lead
  subjectId: uuid('subject_id').notNull(),
  kind: text('kind').notNull(), // note | call | email | meeting | stage_change | system
  body: text('body').notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('crm_act_subject_idx').on(t.subjectType, t.subjectId), index('crm_act_org_idx').on(t.organizationId, t.at)]);

export const crmTasks = pgTable('crm_tasks', {
  id: id(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  assigneeUserId: uuid('assignee_user_id').notNull().references(() => users.id),
  customerId: uuid('customer_id').references(() => customers.id),
  dealId: uuid('deal_id').references(() => crmDeals.id),
  leadClaimId: uuid('lead_claim_id').references(() => leadClaims.id),
  status: text('status').notNull().default('open'), // open | done
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('crm_tasks_org_due_idx').on(t.organizationId, t.dueAt)]);
