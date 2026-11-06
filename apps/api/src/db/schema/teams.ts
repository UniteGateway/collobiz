/** Stage 08 — collaboration teams & consortiums (§4.2 collaboration teams, §6.5: consortiums are agreements among named parties). */
import { pgTable, uuid, text, timestamp, jsonb, integer, doublePrecision, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { opportunities } from './opportunities';

export const collaborationTeams = pgTable('collaboration_teams', {
  id: id(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  purpose: text('purpose').notNull(),
  kind: text('kind').notNull().default('team'), // team | consortium
  opportunityId: uuid('opportunity_id').references(() => opportunities.id),
  leadOrgId: uuid('lead_org_id').notNull().references(() => organizations.id),
  status: text('status').notNull().default('forming'),
  ndaText: text('nda_text').notNull(),
  ndaHash: text('nda_hash').notNull(),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('teams_code_uq').on(t.code), index('teams_lead_idx').on(t.leadOrgId)]);

export const teamMembers = pgTable('team_members', {
  id: id(),
  teamId: uuid('team_id').notNull().references(() => collaborationTeams.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  role: text('role').notNull(), // lead | origination | execution | procurement | finance | management | specialist
  responsibilities: text('responsibilities'),
  status: text('status').notNull().default('invited'),
  invitedBy: uuid('invited_by').references(() => users.id),
  inviteMessage: text('invite_message'),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  ndaSignedAt: timestamp('nda_signed_at', { withTimezone: true }),
  ndaSignedBy: uuid('nda_signed_by').references(() => users.id),
  ndaTypedName: text('nda_typed_name'),
  revokedReason: text('revoked_reason'),
  matchScore: doublePrecision('match_score'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('team_members_uq').on(t.teamId, t.organizationId), index('team_members_org_idx').on(t.organizationId)]);

/** 063 — commercial sharing proposal (versioned); every member must approve before activation. */
export const teamProposals = pgTable('team_proposals', {
  id: id(),
  teamId: uuid('team_id').notNull().references(() => collaborationTeams.id),
  version: integer('version').notNull(),
  shares: jsonb('shares').notNull(), // [{ organizationId, sharePct, role }]
  terms: text('terms').notNull(),
  status: text('status').notNull().default('submitted'), // submitted | approved | rejected | superseded
  approvals: jsonb('approvals').notNull().default(sql`'[]'::jsonb`), // [{ organizationId, userId, decision, comment, at }]
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('team_proposals_ver_uq').on(t.teamId, t.version)]);

/** 156 — joint proposal sections, shared tasks and notes (members with signed NDA only). */
export const teamPosts = pgTable('team_posts', {
  id: id(),
  teamId: uuid('team_id').notNull().references(() => collaborationTeams.id),
  authorUserId: uuid('author_user_id').notNull().references(() => users.id),
  authorOrgId: uuid('author_org_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull(), // note | task | proposal_section
  title: text('title').notNull(),
  body: text('body').notNull(),
  assigneeOrgId: uuid('assignee_org_id').references(() => organizations.id),
  status: text('status').notNull().default('open'), // open | done
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('team_posts_team_idx').on(t.teamId)]);
