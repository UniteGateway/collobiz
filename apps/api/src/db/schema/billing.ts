/** COLLABIZ subscription plans (additive). Payments are recorded manually by Unite finance until a payment gateway is connected. */
import { pgTable, uuid, text, timestamp, bigint, jsonb, date } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations, users } from './core';

export const platformPlans = pgTable('platform_plans', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  priceMonthly: bigint('price_monthly', { mode: 'number' }), // paise, excl. GST; null = not set yet
  priceYearly: bigint('price_yearly', { mode: 'number' }),
  limits: jsonb('limits').notNull().default(sql`'{}'::jsonb`),
  features: text('features').array().notNull().default(sql`'{}'::text[]`),
  status: text('status').notNull().default('draft'), // draft | published
  sort: bigint('sort', { mode: 'number' }).notNull().default(0),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orgSubscriptions = pgTable('org_subscriptions', {
  orgId: uuid('org_id').primaryKey().references(() => organizations.id),
  planCode: text('plan_code').notNull().references(() => platformPlans.code),
  status: text('status').notNull().default('active'), // active | requested
  requestedPlan: text('requested_plan'),
  requestedCycle: text('requested_cycle'),
  requestedBy: uuid('requested_by').references(() => users.id),
  requestedAt: timestamp('requested_at', { withTimezone: true }),
  cycle: text('cycle'),
  periodEnd: date('period_end'),
  paymentReference: text('payment_reference'),
  activatedBy: uuid('activated_by').references(() => users.id),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
