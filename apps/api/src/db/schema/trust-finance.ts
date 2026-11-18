/** Credit notes, recorded expenses, opt-in public Proof links (Business QR) and "notify me" requests for Unite programmes. Money in paise. */
import { pgTable, uuid, text, timestamp, bigint, date, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, createdAt, organizations, users } from './core';
import { projectInvoices } from './projects';

export const creditNotes = pgTable('credit_notes', {
  id: id(),
  number: text('number').notNull().unique(),
  invoiceId: uuid('invoice_id').notNull().references(() => projectInvoices.id),
  issuedByOrgId: uuid('issued_by_org_id').notNull().references(() => organizations.id),
  toOrgId: uuid('to_org_id').notNull().references(() => organizations.id),
  reason: text('reason').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  note: text('note').notNull(),
  /** On a paid invoice the credit is a refund: recorded when actually paid. */
  refundDue: boolean('refund_due').notNull().default(false),
  refundPaidAt: date('refund_paid_at'),
  refundReference: text('refund_reference'),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
}, (t) => [index('credit_notes_invoice_idx').on(t.invoiceId), index('credit_notes_to_idx').on(t.toOrgId)]);

export const expenses = pgTable('expenses', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  date: date('date').notNull(),
  category: text('category').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  description: text('description').notNull(),
  vendor: text('vendor'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('expenses_org_date_idx').on(t.orgId, t.date)]);

/** A business chooses to publish its Proof summary at a public link (printed as its Business QR). */
export const proofShares = pgTable('proof_shares', {
  orgId: uuid('org_id').primaryKey().references(() => organizations.id),
  token: text('token').notNull().unique(),
  enabled: boolean('enabled').notNull().default(true),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const programmeWatchers = pgTable('programme_watchers', {
  id: id(),
  programme: text('programme').notNull(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('programme_watchers_uq').on(t.programme, t.orgId)]);

/** A programme is open only once Unite staff record the responsible company's approval. */
export const programmeOpenings = pgTable('programme_openings', {
  programme: text('programme').primaryKey(),
  openedBy: uuid('opened_by').notNull().references(() => users.id),
  approvalNote: text('approval_note').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
});
