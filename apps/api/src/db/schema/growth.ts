/**
 * Stage 14 — reputation, learning, marketing and AI assistance.
 *  - Reputation comes from verified outcomes (certified milestones) and reviews tied to a shared project; never from payment.
 *  - A review under appeal is excluded from the score until compliance decides; the decider cannot belong to the subject.
 *  - AI output is stored as a reviewable draft with its sources and prompt version; it never changes contractual or financial state.
 */
import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { projects } from './projects';
import { opportunities } from './opportunities';

/** 164 — reviews between organizations that worked on the same project. One per reviewer organization, subject and project. */
export const partnerReviews = pgTable('partner_reviews', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  reviewerOrgId: uuid('reviewer_org_id').notNull().references(() => organizations.id),
  reviewerUserId: uuid('reviewer_user_id').notNull().references(() => users.id),
  subjectOrgId: uuid('subject_org_id').notNull().references(() => organizations.id),
  quality: integer('quality').notNull(), // 1-5
  timeliness: integer('timeliness').notNull(), // 1-5
  communication: integer('communication').notNull(), // 1-5
  comment: text('comment').notNull(),
  status: text('status').notNull().default('published'), // published | under_appeal | removed
  response: text('response'), // subject's public reply
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('partner_reviews_unique').on(t.projectId, t.reviewerOrgId, t.subjectOrgId), index('partner_reviews_subject_idx').on(t.subjectOrgId)]);

/** 164 — appeals against a review. Open appeals exclude the review from the score; compliance decides. */
export const reputationAppeals = pgTable('reputation_appeals', {
  id: id(),
  subjectOrgId: uuid('subject_org_id').notNull().references(() => organizations.id),
  reviewId: uuid('review_id').notNull().references(() => partnerReviews.id),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('open'), // open | upheld | rejected
  createdBy: uuid('created_by').notNull().references(() => users.id),
  decidedBy: uuid('decided_by').references(() => users.id),
  decisionReason: text('decision_reason'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('reputation_appeals_status_idx').on(t.status)]);

/** 116/117 — courses with modules and an assessment. Correct answers never leave the server. */
export const courses = pgTable('courses', {
  id: id(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  sector: text('sector'),
  level: text('level').notNull().default('foundation'), // foundation | professional | expert
  minutes: integer('minutes').notNull(),
  modules: jsonb('modules').notNull(), // [{ title, body }]
  questions: jsonb('questions').notNull(), // [{ q, options: string[], answer: number }]
  passMark: integer('pass_mark').notNull().default(70),
  validDays: integer('valid_days').notNull().default(730),
  status: text('status').notNull().default('published'),
  createdAt: createdAt(),
});

export const courseProgress = pgTable('course_progress', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  courseId: uuid('course_id').notNull().references(() => courses.id),
  completedModules: integer('completed_modules').array().notNull().default(sql`'{}'::int[]`),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [uniqueIndex('course_progress_unique').on(t.userId, t.courseId)]);

export const assessmentAttempts = pgTable('assessment_attempts', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  organizationId: uuid('organization_id').references(() => organizations.id),
  courseId: uuid('course_id').notNull().references(() => courses.id),
  score: integer('score').notNull(),
  passed: boolean('passed').notNull(),
  answers: jsonb('answers').notNull(),
  createdAt: createdAt(),
}, (t) => [index('assessment_attempts_user_idx').on(t.userId, t.courseId)]);

/** 118 — certificates are verifiable by code (public check shows holder, course and validity only). */
export const certificates = pgTable('certificates', {
  id: id(),
  code: text('code').notNull().unique(),
  userId: uuid('user_id').notNull().references(() => users.id),
  organizationId: uuid('organization_id').references(() => organizations.id),
  courseId: uuid('course_id').notNull().references(() => courses.id),
  score: integer('score').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  hash: text('hash').notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

/** 113/115 — approved marketing assets (brochure copy, social posts, guides). */
export const marketingAssets = pgTable('marketing_assets', {
  id: id(),
  kind: text('kind').notNull(), // brochure | social | guide
  title: text('title').notNull(),
  body: text('body').notNull(),
  sector: text('sector'),
  channel: text('channel'), // linkedin | whatsapp | email (social)
  minLevel: text('min_level').notNull().default('registered'),
  status: text('status').notNull().default('approved'), // draft | approved | retired
  approvedBy: uuid('approved_by').references(() => users.id),
  createdAt: createdAt(),
});

export const assetUses = pgTable('asset_uses', {
  id: id(),
  assetId: uuid('asset_id').references(() => marketingAssets.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  kind: text('kind').notNull(), // copy | download | cobrand
  createdAt: createdAt(),
});

/** 072/160/161/162 — every AI suggestion is a draft with provenance; people accept, edit or reject it. */
export const aiSuggestions = pgTable('ai_suggestions', {
  id: id(),
  kind: text('kind').notNull(), // proposal_draft | team_builder | partner_match | opportunity_match
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id),
  input: jsonb('input').notNull(),
  output: jsonb('output').notNull(),
  sources: jsonb('sources').notNull().default(sql`'[]'::jsonb`),
  provider: text('provider').notNull(),
  promptVersion: text('prompt_version').notNull(),
  status: text('status').notNull().default('draft'), // draft | accepted | edited | rejected
  feedback: text('feedback'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('ai_suggestions_org_idx').on(t.organizationId, t.kind)]);

/** 140 — feature switches for each AI capability (administrators can turn one off immediately). */
export const aiSettings = pgTable('ai_settings', {
  kind: text('kind').primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: updatedAt(),
});
