/** Ads and videos placed on partner dashboards by Unite admins (optionally for one business domain and date window). */
import { pgTable, uuid, text, integer, boolean, index } from 'drizzle-orm/pg-core';
import { id, createdAt, updatedAt, users } from './core';

export const dashboardContent = pgTable('dashboard_content', {
  id: id(),
  kind: text('kind').notNull(), // ad | video
  title: text('title').notNull(),
  body: text('body'),
  url: text('url').notNull(), // ad: where the button goes; video: YouTube / Vimeo link
  ctaLabel: text('cta_label'),
  imageKey: text('image_key'), // optional ad image in private storage
  theme: text('theme'), // null = every domain
  startsOn: text('starts_on'), endsOn: text('ends_on'),
  sortOrder: integer('sort_order').notNull().default(100),
  active: boolean('active').notNull().default(true),
  clicks: integer('clicks').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('dashboard_content_kind_idx').on(t.kind, t.active)]);
