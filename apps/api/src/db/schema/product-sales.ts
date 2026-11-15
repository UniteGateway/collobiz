/** Group-company product sales: customer enquiries registered by any seller, and the commission rate rules. */
import { pgTable, uuid, text, timestamp, jsonb, integer, bigint, boolean, index, uniqueIndex, date, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

export const productEnquiries = pgTable('product_enquiries', {
  id: id(),
  code: text('code').notNull().unique(),
  brandOrgId: uuid('brand_org_id').notNull().references(() => organizations.id),
  sellerOrgId: uuid('seller_org_id').notNull().references(() => organizations.id),
  sellerUserId: uuid('seller_user_id').notNull().references(() => users.id),
  channel: text('channel').notNull(), // franchise | store | partner | agent
  customerName: text('customer_name').notNull(),
  customerKey: text('customer_key').notNull(),
  customerPhone: text('customer_phone'),
  customerEmail: text('customer_email'),
  city: text('city').notNull(), state: text('state').notNull(), pincode: text('pincode').notNull(),
  lines: jsonb('lines').notNull(), // [{ catalogItemId, sku, name, productLine, category, qty, note, rateBps }]
  requirement: text('requirement').notNull(),
  consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('submitted'),
  protectedUntil: date('protected_until').notNull(),
  quoteValue: bigint('quote_value', { mode: 'number' }),
  orderValue: bigint('order_value', { mode: 'number' }), // excl. GST
  invoiceNumber: text('invoice_number'),
  paymentReference: text('payment_reference'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  rateBps: integer('rate_bps'), // frozen when the order is won
  commissionEntryId: uuid('commission_entry_id'),
  assignedTo: text('assigned_to'),
  lostReason: text('lost_reason'),
  history: jsonb('history').notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('product_enquiries_seller_idx').on(t.sellerOrgId, t.status), index('product_enquiries_brand_idx').on(t.brandOrgId, t.status),
  uniqueIndex('product_enquiries_customer_uq').on(t.brandOrgId, t.customerKey).where(sql`status not in ('lost', 'withdrawn')`)]);

/** Commission rate rules per company, product line and category (≤ 10%). The most specific active rule applies. */
export const productCommissionRules = pgTable('product_commission_rules', {
  id: id(),
  brandOrgId: uuid('brand_org_id').notNull().references(() => organizations.id),
  productLine: text('product_line'),
  category: text('category'),
  rateBps: integer('rate_bps').notNull(),
  active: boolean('active').notNull().default(true),
  note: text('note'),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('product_commission_rules_uq').on(t.brandOrgId, sql`coalesce(${t.productLine}, '')`, sql`coalesce(${t.category}, '')`), check('product_commission_rules_rate_ck', sql`rate_bps between 0 and 1000`)]);
