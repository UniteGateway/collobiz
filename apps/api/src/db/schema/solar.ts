/** Unite Solar sales desk (kits, quotes, power bills, referrals) and promotions (BOGO) for the online store and physical stores. */
import { pgTable, uuid, text, timestamp, jsonb, integer, bigint, index, uniqueIndex, date } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';

export const solarConfigs = pgTable('solar_configs', {
  id: id(),
  ownerOrgId: uuid('owner_org_id').notNull().unique().references(() => organizations.id),
  config: jsonb('config').notNull(), // overrides on DEFAULT_SOLAR_CONFIG
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: updatedAt(),
});

export const solarKits = pgTable('solar_kits', {
  id: id(),
  code: text('code').notNull().unique(),
  ownerOrgId: uuid('owner_org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  system: text('system').notNull(), // on_grid | hybrid | off_grid
  capacityW: integer('capacity_w').notNull(),
  panelW: integer('panel_w').notNull(),
  inverterW: integer('inverter_w').notNull(),
  batteryWh: integer('battery_wh'),
  phase: integer('phase').notNull().default(1),
  price: bigint('price', { mode: 'number' }).notNull(), // includes GST
  warrantyYears: integer('warranty_years').notNull(),
  includes: jsonb('includes').notNull().default(sql`'[]'::jsonb`),
  description: text('description').notNull(),
  status: text('status').notNull().default('active'), // active | retired
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('solar_kits_system_idx').on(t.system, t.capacityW)]);

export const solarBills = pgTable('solar_bills', {
  id: id(),
  orgId: uuid('org_id').references(() => organizations.id), // uploader's company (null: public referral form)
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  objectKey: text('object_key').notNull(),
  fileName: text('file_name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  sha256: text('sha256').notNull(),
  extract: jsonb('extract').notNull(),
  /** Bills hold personal data; the file is deleted after this date (the numbers stay on the quote). */
  deleteAfter: timestamp('delete_after', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const solarReferralCodes = pgTable('solar_referral_codes', {
  id: id(),
  code: text('code').notNull().unique(),
  ownerUserId: uuid('owner_user_id').references(() => users.id),
  ownerOrgId: uuid('owner_org_id').references(() => organizations.id),
  ownerName: text('owner_name').notNull(),
  ownerPhone: text('owner_phone'), // customers who were given a code after their installation
  sourceQuoteId: uuid('source_quote_id'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('solar_ref_codes_user_uq').on(t.ownerUserId), uniqueIndex('solar_ref_codes_quote_uq').on(t.sourceQuoteId)]);

export const solarReferrals = pgTable('solar_referrals', {
  id: id(),
  codeId: uuid('code_id').notNull().references(() => solarReferralCodes.id),
  name: text('name').notNull(),
  phone10: text('phone10').notNull(),
  city: text('city').notNull(),
  region: text('region').notNull(),
  segment: text('segment').notNull(),
  monthlyBill: bigint('monthly_bill', { mode: 'number' }),
  status: text('status').notNull().default('new'), // new | quoted | installed | rewarded | lost
  quoteId: uuid('quote_id'),
  reward: bigint('reward', { mode: 'number' }),
  rewardedAt: timestamp('rewarded_at', { withTimezone: true }),
  rewardedBy: uuid('rewarded_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('solar_referrals_phone_uq').on(t.phone10), index('solar_referrals_code_idx').on(t.codeId)]);

export const solarQuotes = pgTable('solar_quotes', {
  id: id(),
  code: text('code').notNull().unique(),
  ownerOrgId: uuid('owner_org_id').notNull().references(() => organizations.id), // Unite Solar
  partnerOrgId: uuid('partner_org_id').references(() => organizations.id), // the partner who quoted (earns commission)
  createdBy: uuid('created_by').notNull().references(() => users.id),
  customer: jsonb('customer').notNull(),
  phone10: text('phone10').notNull(),
  consentMethod: text('consent_method').notNull(),
  site: jsonb('site').notNull(),
  model: text('model').notNull(),
  system: text('system').notNull(),
  kitId: uuid('kit_id').references(() => solarKits.id),
  capacityW: integer('capacity_w').notNull(),
  calc: jsonb('calc').notNull(),
  total: bigint('total', { mode: 'number' }).notNull(),
  net: bigint('net', { mode: 'number' }).notNull(),
  commission: bigint('commission', { mode: 'number' }).notNull(),
  billId: uuid('bill_id').references(() => solarBills.id),
  referralId: uuid('referral_id').references(() => solarReferrals.id),
  notes: text('notes'),
  status: text('status').notNull().default('draft'),
  statusNote: text('status_note'),
  validUntil: date('valid_until').notNull(),
  commissionEntryId: uuid('commission_entry_id'),
  wonAt: timestamp('won_at', { withTimezone: true }),
  installedAt: timestamp('installed_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('solar_quotes_partner_idx').on(t.partnerOrgId, t.status), index('solar_quotes_status_idx').on(t.status)]);

// ---------------- Promotions (BOGO) ----------------
export const promotions = pgTable('promotions', {
  id: id(),
  code: text('code').notNull().unique(),
  ownerOrgId: uuid('owner_org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  buyQty: integer('buy_qty').notNull().default(1),
  getQty: integer('get_qty').notNull().default(1),
  scope: text('scope').notNull(), // all | sectors | items
  sectors: text('sectors').array().notNull().default(sql`'{}'::text[]`),
  itemRefs: text('item_refs').array().notNull().default(sql`'{}'::text[]`),
  channel: text('channel').notNull(), // online | store | both
  stores: text('stores').array().notNull().default(sql`'{}'::text[]`),
  maxFreePerOrder: integer('max_free_per_order').notNull().default(1),
  budgetUnits: integer('budget_units'),
  budgetValue: bigint('budget_value', { mode: 'number' }),
  usedUnits: integer('used_units').notNull().default(0),
  usedValue: bigint('used_value', { mode: 'number' }).notNull().default(0),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  terms: text('terms').notNull(),
  status: text('status').notNull().default('draft'), // draft | active | paused | ended
  createdBy: uuid('created_by').notNull().references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  erpRuleName: text('erp_rule_name'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const storeOrders = pgTable('store_orders', {
  id: id(),
  code: text('code').notNull().unique(),
  customer: jsonb('customer').notNull(),
  phone10: text('phone10').notNull(),
  lines: jsonb('lines').notNull(), // priced lines, including free units
  subtotal: bigint('subtotal', { mode: 'number' }).notNull(),
  freeValue: bigint('free_value', { mode: 'number' }).notNull().default(0),
  status: text('status').notNull().default('new'), // new | confirmed | fulfilled | cancelled
  referralCodeId: uuid('referral_code_id').references(() => solarReferralCodes.id),
  statusBy: uuid('status_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('store_orders_status_idx').on(t.status, t.createdAt)]);

export const promoVouchers = pgTable('promo_vouchers', {
  id: id(),
  code: text('code').notNull().unique(),
  promotionId: uuid('promotion_id').notNull().references(() => promotions.id),
  name: text('name').notNull(),
  phone10: text('phone10').notNull(),
  status: text('status').notNull().default('issued'), // issued | redeemed
  store: text('store'),
  billNo: text('bill_no'),
  itemRef: text('item_ref'),
  freeValue: bigint('free_value', { mode: 'number' }),
  redeemedBy: uuid('redeemed_by').references(() => users.id),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('promo_vouchers_person_uq').on(t.promotionId, t.phone10)]);

/** Every free unit given away — online order or in-store voucher — so budgets are exact and auditable. */
export const promoRedemptions = pgTable('promo_redemptions', {
  id: id(),
  promotionId: uuid('promotion_id').notNull().references(() => promotions.id),
  channel: text('channel').notNull(), // online | store
  store: text('store'),
  orderId: uuid('order_id').references(() => storeOrders.id),
  voucherId: uuid('voucher_id').references(() => promoVouchers.id),
  itemRef: text('item_ref').notNull(),
  units: integer('units').notNull(),
  value: bigint('value', { mode: 'number' }).notNull(),
  reversedAt: timestamp('reversed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('promo_redemptions_promo_idx').on(t.promotionId)]);
