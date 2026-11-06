/** Stage 11b — trading: supplier products, requirements, enquiries, quotations, purchase orders, shipments, territories, claims. */
import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex, bigint, date, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { catalogItems } from './catalog';
import { projects, projectMaterials } from './projects';

/** 086 — products listed by verified partner suppliers (traders, manufacturers, distributors). */
export const supplierProducts = pgTable('supplier_products', {
  id: id(),
  supplierOrgId: uuid('supplier_org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  sector: text('sector').notNull(),
  description: text('description').notNull(),
  sku: text('sku'),
  unit: text('unit').notNull(),
  price: bigint('price', { mode: 'number' }),
  currency: text('currency').notNull().default('INR'),
  moq: integer('moq').notNull().default(1),
  leadTimeDays: integer('lead_time_days').notNull().default(7),
  stock: text('stock').notNull().default('in_stock'), // in_stock | made_to_order | out_of_stock
  status: text('status').notNull().default('published'), // published | archived
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('supplier_products_supplier_idx').on(t.supplierOrgId), index('supplier_products_sector_idx').on(t.sector),
  index('supplier_products_fts_idx').using('gin', sql`to_tsvector('english', ${t.name} || ' ' || ${t.description})`)]);

/** 087 — buyer requirements (RFQs for goods). */
export const tradeRequirements = pgTable('trade_requirements', {
  id: id(),
  code: text('code').notNull(),
  buyerOrgId: uuid('buyer_org_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  sector: text('sector').notNull(),
  description: text('description'),
  items: jsonb('items').notNull(), // [{ item, spec, quantity, unit }]
  deliveryLocation: text('delivery_location').notNull(),
  region: text('region'),
  neededBy: date('needed_by'),
  closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
  invitedSupplierIds: uuid('invited_supplier_ids').array().notNull().default(sql`'{}'::uuid[]`), // empty = all verified suppliers in the sector
  projectId: uuid('project_id').references(() => projects.id),
  status: text('status').notNull().default('open'), // open | awarded | closed | cancelled
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('trade_requirements_code_uq').on(t.code), index('trade_requirements_sector_idx').on(t.sector, t.status)]);

/** 088 — enquiries & price requests (product- or catalogue-based), with a message thread. */
export const tradeEnquiries = pgTable('trade_enquiries', {
  id: id(),
  code: text('code').notNull(),
  buyerOrgId: uuid('buyer_org_id').notNull().references(() => organizations.id),
  supplierOrgId: uuid('supplier_org_id').notNull().references(() => organizations.id),
  intendedSupplierOrgId: uuid('intended_supplier_org_id').references(() => organizations.id), // set when routed to an authorised distributor
  supplierProductId: uuid('supplier_product_id').references(() => supplierProducts.id),
  catalogItemId: uuid('catalog_item_id').references(() => catalogItems.id),
  subject: text('subject').notNull(),
  quantity: text('quantity').notNull(),
  status: text('status').notNull().default('open'), // open | quoted | closed
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('trade_enquiries_code_uq').on(t.code), index('trade_enquiries_buyer_idx').on(t.buyerOrgId), index('trade_enquiries_supplier_idx').on(t.supplierOrgId)]);

export const enquiryMessages = pgTable('enquiry_messages', {
  id: id(),
  enquiryId: uuid('enquiry_id').notNull().references(() => tradeEnquiries.id),
  authorOrgId: uuid('author_org_id').notNull().references(() => organizations.id),
  authorUserId: uuid('author_user_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  createdAt: createdAt(),
});

/** 089 — supplier quotations. A supplier sees only its own quotes; the buyer sees all quotes for its requirement. */
export const quotations = pgTable('quotations', {
  id: id(),
  code: text('code').notNull(),
  supplierOrgId: uuid('supplier_org_id').notNull().references(() => organizations.id),
  buyerOrgId: uuid('buyer_org_id').notNull().references(() => organizations.id),
  requirementId: uuid('requirement_id').references(() => tradeRequirements.id),
  enquiryId: uuid('enquiry_id').references(() => tradeEnquiries.id),
  lines: jsonb('lines').notNull(), // [{ item, quantity, unit, unitPrice }]
  subtotal: bigint('subtotal', { mode: 'number' }).notNull(),
  taxPct: integer('tax_pct').notNull().default(18),
  total: bigint('total', { mode: 'number' }).notNull(),
  currency: text('currency').notNull().default('INR'),
  deliveryDays: integer('delivery_days').notNull(),
  validUntil: date('valid_until').notNull(),
  terms: text('terms'),
  status: text('status').notNull().default('submitted'), // submitted | withdrawn | accepted | rejected
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('quotations_code_uq').on(t.code), uniqueIndex('quotations_active_req_uq').on(t.requirementId, t.supplierOrgId).where(sql`status = 'submitted' and requirement_id is not null`)]);

/** 090/091 — purchase orders (state machine in packages/types). */
export const purchaseOrders = pgTable('purchase_orders', {
  id: id(),
  number: text('number').notNull(),
  buyerOrgId: uuid('buyer_org_id').notNull().references(() => organizations.id),
  supplierOrgId: uuid('supplier_org_id').notNull().references(() => organizations.id),
  quotationId: uuid('quotation_id').references(() => quotations.id),
  projectId: uuid('project_id').references(() => projects.id),
  projectMaterialId: uuid('project_material_id').references(() => projectMaterials.id),
  lines: jsonb('lines').notNull(),
  subtotal: bigint('subtotal', { mode: 'number' }).notNull(),
  taxPct: integer('tax_pct').notNull().default(18),
  total: bigint('total', { mode: 'number' }).notNull(),
  currency: text('currency').notNull().default('INR'),
  deliveryAddress: text('delivery_address').notNull(),
  deliveryBy: date('delivery_by').notNull(),
  paymentTerms: text('payment_terms').notNull(),
  status: text('status').notNull().default('draft'),
  cancelReason: text('cancel_reason'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('purchase_orders_number_uq').on(t.number), uniqueIndex('purchase_orders_quotation_uq').on(t.quotationId), index('purchase_orders_buyer_idx').on(t.buyerOrgId), index('purchase_orders_supplier_idx').on(t.supplierOrgId)]);

/** Append-only order history (gate: change logs). */
export const poEvents = pgTable('po_events', {
  id: id(),
  poId: uuid('po_id').notNull().references(() => purchaseOrders.id),
  action: text('action').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  note: text('note'),
  data: jsonb('data'),
  userId: uuid('user_id').notNull().references(() => users.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  createdAt: createdAt(),
}, (t) => [index('po_events_po_idx').on(t.poId, t.createdAt)]);

/** 092 — shipments with tracking events and goods receipt. */
export const shipments = pgTable('shipments', {
  id: id(),
  poId: uuid('po_id').notNull().references(() => purchaseOrders.id),
  carrier: text('carrier').notNull(),
  trackingNo: text('tracking_no').notNull(),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }).notNull().defaultNow(),
  eta: date('eta'),
  status: text('status').notNull().default('in_transit'), // in_transit | delivered
  events: jsonb('events').notNull().default(sql`'[]'::jsonb`), // [{ at, status, location, note }]
  receivedAt: timestamp('received_at', { withTimezone: true }),
  receivedBy: uuid('received_by').references(() => users.id),
  receivedLines: jsonb('received_lines'), // [{ item, received, damaged }]
  receiptNote: text('receipt_note'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('shipments_po_uq').on(t.poId)]);

/** 093 — distributor territories granted by a supplier/manufacturer. */
export const territories = pgTable('territories', {
  id: id(),
  supplierOrgId: uuid('supplier_org_id').notNull().references(() => organizations.id),
  distributorOrgId: uuid('distributor_org_id').notNull().references(() => organizations.id),
  region: text('region').notNull(),
  sector: text('sector').notNull(),
  exclusive: boolean('exclusive').notNull().default(false),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  targetValue: bigint('target_value', { mode: 'number' }),
  status: text('status').notNull().default('active'), // active | revoked
  revokedReason: text('revoked_reason'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('territories_lookup_idx').on(t.supplierOrgId, t.region, t.sector)]);

/** 094 — returns, warranty and claims against delivered orders. */
export const tradeClaims = pgTable('trade_claims', {
  id: id(),
  code: text('code').notNull(),
  poId: uuid('po_id').notNull().references(() => purchaseOrders.id),
  buyerOrgId: uuid('buyer_org_id').notNull().references(() => organizations.id),
  supplierOrgId: uuid('supplier_org_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull(), // return | warranty | damage | shortage
  description: text('description').notNull(),
  lines: jsonb('lines').notNull(), // [{ item, quantity }]
  amountClaimed: bigint('amount_claimed', { mode: 'number' }),
  status: text('status').notNull().default('open'), // open | accepted | rejected | resolved | escalated
  resolution: text('resolution'), // refund | replacement | credit_note | repair
  resolutionNote: text('resolution_note'),
  responseDueAt: timestamp('response_due_at', { withTimezone: true }).notNull(),
  history: jsonb('history').notNull().default(sql`'[]'::jsonb`),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('trade_claims_code_uq').on(t.code), index('trade_claims_po_idx').on(t.poId)]);

/** Evidence files for shipments (proof of delivery) and claims (photos). */
export const tradeDocuments = pgTable('trade_documents', {
  id: id(),
  ownerType: text('owner_type').notNull(), // claim | shipment
  ownerId: uuid('owner_id').notNull(),
  fileName: text('file_name').notNull(),
  objectKey: text('object_key').notNull(),
  sha256: text('sha256').notNull(),
  size: integer('size').notNull(),
  mime: text('mime').notNull(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('trade_documents_owner_idx').on(t.ownerType, t.ownerId)]);
