/** Bank statement import (additive): uploaded statements and their lines, matched to project invoices. */
import { pgTable, uuid, text, bigint, integer, date, index, uniqueIndex } from 'drizzle-orm/pg-core';
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
