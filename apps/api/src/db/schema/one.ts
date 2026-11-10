/** COLLABIZ ONE extras (additive): opportunity rescue, 48-hour team challenges, opportunity revival, expressions of interest. */
import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, organizations, users } from './core';
import { projects } from './projects';
import { opportunities } from './opportunities';

/** A stuck project's gaps; partners are searched only after every original party has authorised it. */
export const rescueRequests = pgTable('rescue_requests', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  gaps: text('gaps').array().notNull(),
  note: text('note').notNull(),
  status: text('status').notNull().default('awaiting_authorization'), // awaiting_authorization | searching | closed
  authorizations: jsonb('authorizations').notNull().default(sql`'[]'::jsonb`), // [{ orgId, userId, at }]
  createdByOrgId: uuid('created_by_org_id').notNull().references(() => organizations.id),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('rescue_project_idx').on(t.projectId)]);

/** A 48-hour call for partners to form a proposed execution team. The deadline is a coordination target, not a guarantee. */
export const teamChallenges = pgTable('team_challenges', {
  id: id(),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id),
  roles: text('roles').array().notNull(),
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('open'), // open | closed
  createdByOrgId: uuid('created_by_org_id').notNull().references(() => organizations.id),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('challenge_opp_idx').on(t.opportunityId)]);

/** Asking the owner's permission to revisit a lost or stalled opportunity. */
export const revivalRequests = pgTable('revival_requests', {
  id: id(),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id),
  requestedByOrgId: uuid('requested_by_org_id').notNull().references(() => organizations.id),
  requestedBy: uuid('requested_by').notNull().references(() => users.id),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('requested'), // requested | approved | declined
  decidedBy: uuid('decided_by').references(() => users.id),
  decisionNote: text('decision_note'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('revival_opp_idx').on(t.opportunityId)]);

/** A partner's expression of interest in a rescue (gaps) or a challenge (roles). */
export const oneInterests = pgTable('one_interests', {
  id: id(),
  kind: text('kind').notNull(), // rescue | challenge
  sourceId: uuid('source_id').notNull(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  items: text('items').array().notNull(),
  note: text('note').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('one_interests_uq').on(t.kind, t.sourceId, t.orgId)]);
