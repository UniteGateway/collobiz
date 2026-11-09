/** Records of what COLLABIZ has posted to ERPNext, so nothing is ever posted twice. */
import { pgTable, uuid, text, timestamp, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, createdAt, updatedAt, users } from './core';

export const erpSyncRecords = pgTable('erp_sync_records', {
  id: id(),
  kind: text('kind').notNull(), // commission_entry
  sourceId: uuid('source_id').notNull(),
  erpDoctype: text('erp_doctype').notNull(),
  erpName: text('erp_name'),
  status: text('status').notNull(), // posted | failed
  error: text('error'),
  attempts: integer('attempts').notNull().default(0),
  postedBy: uuid('posted_by').references(() => users.id),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('erp_sync_kind_source_uq').on(t.kind, t.sourceId)]);
