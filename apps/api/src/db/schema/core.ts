/**
 * Stage 01–02 tables: platform infrastructure (audit, outbox, idempotency) and identity/tenancy.
 * Master Book §6.3 core entities: users, organizations, memberships, audit_events.
 */
import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, uniqueIndex, index, bigserial } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const id = () => uuid('id').primaryKey().defaultRandom();
export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull(),
  phone: text('phone'),
  fullName: text('full_name').notNull(),
  passwordHash: text('password_hash'),
  /** OIDC subject when IDENTITY_PROVIDER=oidc; `local:<id>` otherwise */
  authSubject: text('auth_subject'),
  status: text('status').notNull().default('active'), // active | suspended | closed
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
  mfaSecretEnc: text('mfa_secret_enc'),
  mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true }),
  locale: text('locale').notNull().default('en-IN'),
  currency: text('currency').notNull().default('INR'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('users_email_uq').on(sql`lower(${t.email})`)]);

export const organizations = pgTable('organizations', {
  id: id(),
  legalName: text('legal_name').notNull(),
  displayName: text('display_name').notNull(),
  type: text('type').notNull(), // platform | group_company | partner_company | partner_individual
  country: text('country').notNull().default('IN'),
  city: text('city'),
  verificationStatus: text('verification_status').notNull().default('not_started'),
  membershipLevel: text('membership_level').notNull().default('registered'),
  partnerTypes: text('partner_types').array().notNull().default(sql`'{}'::text[]`),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('organizations_type_idx').on(t.type), index('organizations_verif_idx').on(t.verificationStatus)]);

export const memberships = pgTable('memberships', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  role: text('role').notNull(),
  status: text('status').notNull().default('active'), // active | invited | removed
  invitedBy: uuid('invited_by').references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('memberships_uq').on(t.userId, t.organizationId, t.role), index('memberships_org_idx').on(t.organizationId)]);

export const refreshTokens = pgTable('refresh_tokens', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull(),
  familyId: uuid('family_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('refresh_tokens_hash_uq').on(t.tokenHash), index('refresh_tokens_family_idx').on(t.familyId)]);

export const otpCodes = pgTable('otp_codes', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  channel: text('channel').notNull(), // email | phone
  purpose: text('purpose').notNull().default('verify'),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: createdAt(),
});

/** Tamper-evident audit trail: each row hashes its payload chained with the previous row's hash. */
export const auditEvents = pgTable('audit_events', {
  seq: bigserial('seq', { mode: 'number' }).primaryKey(),
  id: uuid('id').notNull().defaultRandom(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  actorUserId: uuid('actor_user_id'),
  organizationId: uuid('organization_id'),
  action: text('action').notNull(),
  objectType: text('object_type').notNull(),
  objectId: text('object_id'),
  reason: text('reason'),
  before: jsonb('before'),
  after: jsonb('after'),
  beforeHash: text('before_hash'),
  afterHash: text('after_hash'),
  prevHash: text('prev_hash'),
  hash: text('hash').notNull(),
  ip: text('ip'),
  requestId: text('request_id'),
}, (t) => [index('audit_object_idx').on(t.objectType, t.objectId), index('audit_org_idx').on(t.organizationId), index('audit_actor_idx').on(t.actorUserId)]);

export const idempotencyKeys = pgTable('idempotency_keys', {
  id: id(),
  userId: uuid('user_id'),
  key: text('key').notNull(),
  route: text('route').notNull(),
  requestHash: text('request_hash').notNull(),
  statusCode: integer('status_code'),
  response: jsonb('response'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('idempotency_uq').on(t.userId, t.key, t.route)]);

/** Outbox for e-mail/SMS/integration events (adapter pattern §6.5). */
export const outboxMessages = pgTable('outbox_messages', {
  id: id(),
  channel: text('channel').notNull(), // email | sms | push | integration
  recipient: text('recipient'),
  subject: text('subject'),
  body: text('body'),
  payload: jsonb('payload'),
  status: text('status').notNull().default('pending'), // pending | sent | failed
  attempts: integer('attempts').notNull().default(0),
  createdAt: createdAt(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
}, (t) => [index('outbox_status_idx').on(t.status)]);

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  description: text('description'),
  updatedAt: updatedAt(),
});

/** Public enquiries from the contact page (screen 010). */
export const enquiries = pgTable('enquiries', {
  id: id(),
  reference: text('reference').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  organization: text('organization'),
  topic: text('topic').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('enquiries_ref_uq').on(t.reference)]);
