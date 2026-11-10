/** Bank statement import (additive): uploaded statements and their lines, matched to project invoices. */
import { pgTable, uuid, text, timestamp, bigint, integer, date, index, uniqueIndex, jsonb, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, organizations, users } from './core';
import { projectInvoices } from './projects';
import { paymentReceipts } from './v2b';

export const bankStatements = pgTable('bank_statements', {
  id: id(),
  /** The company whose bank account this is; null when Unite finance imports across companies. */
  orgId: uuid('org_id').references(() => organizations.id),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  fileName: text('file_name').notNull(),
  fileHash: text('file_hash').notNull(),
  layout: text('layout').notNull(),
  periodFrom: date('period_from'),
  periodTo: date('period_to'),
  lineCount: integer('line_count').notNull(),
  skippedCount: integer('skipped_count').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('bank_statements_hash_uq').on(t.uploadedBy, t.fileHash)]);

export const bankStatementLines = pgTable('bank_statement_lines', {
  id: id(),
  statementId: uuid('statement_id').notNull().references(() => bankStatements.id),
  seq: integer('seq').notNull(),
  txnDate: date('txn_date').notNull(),
  description: text('description').notNull(),
  reference: text('reference'),
  direction: text('direction').notNull(), // credit | debit
  amount: bigint('amount', { mode: 'number' }).notNull(),
  utr: text('utr'),
  status: text('status').notNull().default('unmatched'), // unmatched | suggested | matched | ignored
  suggestedInvoiceId: uuid('suggested_invoice_id').references(() => projectInvoices.id),
  matchScore: integer('match_score'),
  matchReason: text('match_reason'),
  receiptId: uuid('receipt_id').references(() => paymentReceipts.id),
  createdAt: createdAt(),
}, (t) => [index('bank_statement_lines_stmt_idx').on(t.statementId), index('bank_statement_lines_utr_idx').on(t.utr)]);

/** Bulk import (CSV/.xlsx or Tally XML) of customers or products: previewed, mapped and checked before anything is written. */
export const bulkImports = pgTable('bulk_imports', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  target: text('target').notNull(), // customers | products
  source: text('source').notNull(), // file | tally
  fileName: text('file_name').notNull(),
  fileHash: text('file_hash').notNull(),
  rows: jsonb('rows').notNull(), // the parsed table, kept until committed so the mapping can be adjusted without re-uploading
  status: text('status').notNull().default('previewed'), // previewed | committed
  header: integer('header'),
  mapping: jsonb('mapping'),
  consentBasis: text('consent_basis'),
  created: integer('created').notNull().default(0),
  skippedExisting: integer('skipped_existing').notNull().default(0),
  rejected: integer('rejected').notNull().default(0),
  createdAt: createdAt(),
  committedAt: timestamp('committed_at', { withTimezone: true }),
}, (t) => [index('bulk_imports_org_idx').on(t.orgId)]);

/** Seller / buyer details GST documents need (GSTIN, registered address, PIN, state). One per company. */
export const taxProfiles = pgTable('tax_profiles', {
  orgId: uuid('org_id').primaryKey().references(() => organizations.id),
  gstin: text('gstin').notNull(),
  legalName: text('legal_name').notNull(),
  tradeName: text('trade_name'),
  address1: text('address1').notNull(),
  address2: text('address2'),
  city: text('city').notNull(),
  pincode: text('pincode').notNull(),
  stateCode: text('state_code').notNull(),
  /** The business says its aggregate turnover is above the e-invoicing limit (₹5 crore today). */
  einvoiceApplicable: boolean('einvoice_applicable').notNull().default(false),
  /** Udyam registration number (MSME) — TReDS discounting is for MSME suppliers. */
  udyamNumber: text('udyam_number'),
  updatedBy: uuid('updated_by').notNull().references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Prepared GST JSON (e-invoice or e-way bill). Filing needs a provider; until then the business uploads the JSON itself. */
export const gstDocuments = pgTable('gst_documents', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull(), // einvoice | ewaybill
  sourceType: text('source_type').notNull(), // project_invoice | purchase_order
  sourceId: uuid('source_id').notNull(),
  docNo: text('doc_no').notNull(),
  payload: jsonb('payload').notNull(),
  payloadHash: text('payload_hash').notNull(),
  issues: jsonb('issues').notNull(),
  ready: boolean('ready').notNull(),
  totalValue: bigint('total_value', { mode: 'number' }).notNull(),
  /** Set only from the government system's reply (via a provider) — never filled in by COLLABIZ itself. */
  irn: text('irn'),
  ewbNo: text('ewb_no'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('gst_documents_org_idx').on(t.orgId), index('gst_documents_source_idx').on(t.sourceType, t.sourceId)]);

/** WhatsApp opt-in per person (recorded consent). Messages start only once a WhatsApp Business provider is connected. */
export const channelPreferences = pgTable('channel_preferences', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  whatsappNumber: text('whatsapp_number'),
  whatsappOptIn: boolean('whatsapp_opt_in').notNull().default(false),
  optInAt: timestamp('opt_in_at', { withTimezone: true }),
  optInText: text('opt_in_text'),
  kinds: text('kinds').array().notNull().default(sql`'{}'::text[]`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** An invoice prepared for upload on a TReDS platform by the supplier. COLLABIZ never handles the financing or the money. */
export const tredsReferrals = pgTable('treds_referrals', {
  id: id(),
  invoiceId: uuid('invoice_id').notNull().references(() => projectInvoices.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  platform: text('platform').notNull(), // rxil | m1xchange | invoicemart
  status: text('status').notNull().default('prepared'), // prepared | withdrawn
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('treds_referrals_invoice_uq').on(t.invoiceId, t.platform)]);

/** Tenders read from a public feed file (RSS/XML) for Unite to review before anything is published to partners. */
export const tenderLeads = pgTable('tender_leads', {
  id: id(),
  source: text('source').notNull(),
  externalId: text('external_id').notNull(),
  title: text('title').notNull(),
  link: text('link'),
  buyer: text('buyer'),
  summary: text('summary'),
  closesAt: timestamp('closes_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  sector: text('sector'),
  status: text('status').notNull().default('new'), // new | shortlisted | dismissed
  importedBy: uuid('imported_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('tender_leads_ext_uq').on(t.source, t.externalId)]);
