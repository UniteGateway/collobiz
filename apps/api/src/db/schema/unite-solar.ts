/**
 * Unite Solar Franchise Network. Reuses franchise_units (one record per franchise or store), contracts, franchise_orders,
 * organisations, lead claims, courses, marketing assets and referral codes. New tables only for what had no home.
 * Money in paise, rates in basis points.
 */
import { pgTable, uuid, text, timestamp, jsonb, integer, bigint, boolean, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { franchiseUnits, franchiseOrders } from './franchise-property';

/** Administrator-configured packages; editing creates a new version (applications keep the version they priced). */
export const franchisePackages = pgTable('franchise_packages', {
  id: id(),
  code: text('code').notNull(),
  version: integer('version').notNull().default(1),
  active: boolean('active').notNull().default(true),
  config: jsonb('config').notNull(), // PackageConfig
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('franchise_packages_code_ver_uq').on(t.code, t.version)]);

export const franchiseTerritories = pgTable('franchise_territories', {
  id: id(),
  level: text('level').notNull(), // pincode | mandal | city | district
  name: text('name').notNull(),
  state: text('state').notNull(),
  district: text('district').notNull(),
  pincodes: text('pincodes').array().notNull().default(sql`'{}'::text[]`),
  exclusive: boolean('exclusive').notNull().default(true),
  status: text('status').notNull().default('available'), // available | reserved | allocated | expired
  unitId: uuid('unit_id').references(() => franchiseUnits.id),
  expiresOn: text('expires_on'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('franchise_territories_district_idx').on(t.state, t.district, t.status)]);

/** Software and other entitlements (LeadDNA). Activated only by package activation, a verified add-on or an admin grant. */
export const partnerEntitlements = pgTable('partner_entitlements', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  unitId: uuid('unit_id').references(() => franchiseUnits.id),
  product: text('product').notNull(), // leaddna
  source: text('source').notNull(), // package | addon | admin_grant
  status: text('status').notNull().default('active'), // active | suspended | revoked
  validFrom: text('valid_from').notNull(),
  validTo: text('valid_to'),
  note: text('note'),
  grantedBy: uuid('granted_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('partner_entitlements_org_idx').on(t.orgId, t.product, t.status)]);

export const solarProducts = pgTable('solar_products', {
  id: id(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  brand: text('brand').notNull(),
  model: text('model'),
  hsn: text('hsn').notNull(),
  gstBps: integer('gst_bps').notNull(),
  specification: text('specification').notNull(),
  warrantyMonths: integer('warranty_months').notNull(),
  mrp: bigint('mrp', { mode: 'number' }).notNull(),
  partnerPrice: bigint('partner_price', { mode: 'number' }).notNull(),
  customerPrice: bigint('customer_price', { mode: 'number' }).notNull(),
  commissionBps: integer('commission_bps').notNull(),
  reorderLevel: integer('reorder_level').notNull().default(0),
  serialised: boolean('serialised').notNull().default(false),
  imageUrl: text('image_url'), datasheetUrl: text('datasheet_url'), installation: text('installation'),
  kitId: uuid('kit_id'), // the matching Unite Solar sales-desk kit, when this product is a kit
  status: text('status').notNull().default('active'),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, () => [check('solar_products_commission_ck', sql`commission_bps between 0 and 1000`)]);

/** On-hand stock per store and product. Never negative (database check), changed only with a movement in the same transaction. */
export const storeInventory = pgTable('store_inventory', {
  unitId: uuid('unit_id').notNull().references(() => franchiseUnits.id),
  productId: uuid('product_id').notNull().references(() => solarProducts.id),
  qty: integer('qty').notNull().default(0),
  value: bigint('value', { mode: 'number' }).notNull().default(0), // at partner price
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('store_inventory_uq').on(t.unitId, t.productId), check('store_inventory_qty_ck', sql`qty >= 0`)]);

/** Append-only stock journal. */
export const inventoryMovements = pgTable('inventory_movements', {
  id: id(),
  unitId: uuid('unit_id').notNull().references(() => franchiseUnits.id),
  productId: uuid('product_id').notNull().references(() => solarProducts.id),
  kind: text('kind').notNull(), // allocation_received | sale | return | damage | adjustment | transfer_in | transfer_out
  qty: integer('qty').notNull(), // signed
  unitCost: bigint('unit_cost', { mode: 'number' }).notNull(),
  reference: text('reference').notNull(),
  serials: text('serials').array().notNull().default(sql`'{}'::text[]`),
  note: text('note'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('inventory_movements_unit_idx').on(t.unitId, t.productId)]);

/** Opening stock for stock-store partners: allocated at partner price within the package's stock value, invoiced, received. */
export const stockAllocations = pgTable('stock_allocations', {
  id: id(),
  unitId: uuid('unit_id').notNull().references(() => franchiseUnits.id),
  number: text('number').notNull().unique(),
  lines: jsonb('lines').notNull(), // [{ productId, sku, name, qty, unitCost, serials }]
  value: bigint('value', { mode: 'number' }).notNull(),
  gst: bigint('gst', { mode: 'number' }).notNull(),
  status: text('status').notNull().default('dispatched'), // dispatched | received | cancelled
  invoiceNumber: text('invoice_number').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
});

/** Earnings ledger for the network's five streams. One entry per (stream, source, beneficiary). */
export const networkCommissions = pgTable('network_commissions', {
  id: id(),
  stream: text('stream').notNull(),
  beneficiaryOrgId: uuid('beneficiary_org_id').notNull().references(() => organizations.id),
  unitId: uuid('unit_id').references(() => franchiseUnits.id),
  sourceRef: text('source_ref').notNull(), // e.g. order line, district period, project reference
  orderId: uuid('order_id').references(() => franchiseOrders.id),
  description: text('description').notNull(),
  base: bigint('base', { mode: 'number' }).notNull(),
  baseLabel: text('base_label').notNull(),
  rateBps: integer('rate_bps').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  status: text('status').notNull().default('pending'),
  inputs: jsonb('inputs').notNull().default(sql`'{}'::jsonb`), // calculation inputs (P&L, pool, contributors, receipts)
  compliance: text('compliance'), // investment: pending | cleared | blocked
  settlementId: uuid('settlement_id'),
  history: jsonb('history').notNull().default(sql`'[]'::jsonb`),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('network_commissions_uq').on(t.stream, t.sourceRef, t.beneficiaryOrgId), index('network_commissions_org_idx').on(t.beneficiaryOrgId, t.status)]);

export const networkSettlements = pgTable('network_settlements', {
  id: id(),
  number: text('number').notNull().unique(),
  beneficiaryOrgId: uuid('beneficiary_org_id').notNull().references(() => organizations.id),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  entries: integer('entries').notNull(),
  status: text('status').notNull().default('payable'), // payable | paid
  paymentReference: text('payment_reference'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const demoMaterials = pgTable('demo_materials', {
  id: id(),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // display_stand | sample_panel | inverter_demo | kit_sample | display_board | brochure | catalogue
  ownership: text('ownership').notNull(), // company_owned | partner_owned | returnable
  unitValue: bigint('unit_value', { mode: 'number' }).notNull().default(0),
  chargeable: boolean('chargeable').notNull().default(false),
  maxPerPartner: integer('max_per_partner').notNull().default(5),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const demoAllocations = pgTable('demo_allocations', {
  id: id(),
  unitId: uuid('unit_id').notNull().references(() => franchiseUnits.id),
  materialId: uuid('material_id').notNull().references(() => demoMaterials.id),
  qty: integer('qty').notNull(),
  status: text('status').notNull().default('requested'),
  note: text('note'),
  history: jsonb('history').notNull().default(sql`'[]'::jsonb`),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Site surveys, installations, service, loan and subsidy help, complaints — raised by partners for their customers. */
export const serviceRequests = pgTable('service_requests', {
  id: id(),
  number: text('number').notNull().unique(),
  unitId: uuid('unit_id').notNull().references(() => franchiseUnits.id),
  kind: text('kind').notNull(),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone'),
  pincode: text('pincode'),
  orderId: uuid('order_id').references(() => franchiseOrders.id),
  details: text('details').notNull(),
  status: text('status').notNull().default('open'), // open | assigned | in_progress | resolved | closed
  assignedTo: text('assigned_to'),
  resolution: text('resolution'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
