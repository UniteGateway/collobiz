/** Catalogues, brochures, DPRs, datasheets and other documents per module — an uploaded file or a link. */
import { pgTable, uuid, text, integer, index } from 'drizzle-orm/pg-core';
import { id, createdAt, updatedAt, users } from './core';

export const moduleDocuments = pgTable('module_documents', {
  id: id(),
  moduleKey: text('module_key').notNull(),
  title: text('title').notNull(),
  kind: text('kind').notNull(),
  description: text('description'),
  objectKey: text('object_key'), // uploaded file (private storage, served by signed link)
  fileName: text('file_name'),
  mime: text('mime'),
  size: integer('size'),
  sha256: text('sha256'),
  url: text('url'), // or a link (in-app path or https)
  visibility: text('visibility').notNull().default('partners'),
  status: text('status').notNull().default('published'), // published | archived
  version: integer('version').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(100),
  opens: integer('opens').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('module_documents_module_idx').on(t.moduleKey, t.status)]);
