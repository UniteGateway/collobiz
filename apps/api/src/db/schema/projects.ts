/** Stage 11a — project execution: milestones, evidence, inspections, certification, invoicing, closure, change log. */
import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex, bigint, date } from 'drizzle-orm/pg-core';
import { id, createdAt, updatedAt, organizations, users } from './core';
import { contracts } from './contracts';
import { tenders } from './tenders';

export const projects = pgTable('projects', {
  id: id(),
  code: text('code').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  ownerOrgId: uuid('owner_org_id').notNull().references(() => organizations.id), // client / issuer — certifies and pays
  leadOrgId: uuid('lead_org_id').notNull().references(() => organizations.id), // executing partner — plans and submits
  contractId: uuid('contract_id').references(() => contracts.id),
  tenderId: uuid('tender_id').references(() => tenders.id),
  value: bigint('value', { mode: 'number' }).notNull(),
  currency: text('currency').notNull().default('INR'),
  site: text('site'),
  region: text('region'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  status: text('status').notNull().default('planning'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  completionCode: text('completion_code'),
  completionHash: text('completion_hash'),
  completionSnapshot: jsonb('completion_snapshot'),
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('projects_code_uq').on(t.code), uniqueIndex('projects_contract_uq').on(t.contractId), index('projects_owner_idx').on(t.ownerOrgId), index('projects_lead_idx').on(t.leadOrgId)]);

/** 078 — owner, lead and subcontractors with allocated scope and value. */
export const projectMembers = pgTable('project_members', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  role: text('role').notNull(), // owner | lead | subcontractor
  scope: text('scope'),
  allocatedValue: bigint('allocated_value', { mode: 'number' }),
  status: text('status').notNull().default('active'), // active | removed
  addedBy: uuid('added_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('project_members_uq').on(t.projectId, t.organizationId)]);

/** 077 / 083 — milestones are the unit of certification and invoicing. */
export const milestones = pgTable('milestones', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  seq: integer('seq').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: date('due_date').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  assignedOrgId: uuid('assigned_org_id').references(() => organizations.id),
  requiresInspection: text('requires_inspection').notNull().default('quality'), // quality | safety | both | none
  status: text('status').notNull().default('planned'),
  progressPct: integer('progress_pct').notNull().default(0),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  submittedBy: uuid('submitted_by').references(() => users.id),
  submissionNote: text('submission_note'),
  certifiedAt: timestamp('certified_at', { withTimezone: true }),
  certifiedBy: uuid('certified_by').references(() => users.id),
  certifiedAmount: bigint('certified_amount', { mode: 'number' }),
  certificationNote: text('certification_note'),
  evidenceHash: text('evidence_hash'),
  rejectionReason: text('rejection_reason'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('milestones_seq_uq').on(t.projectId, t.seq)]);

/** 079 — site progress updates (notes + progress + linked photos/documents). */
export const projectUpdates = pgTable('project_updates', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  milestoneId: uuid('milestone_id').references(() => milestones.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  authorUserId: uuid('author_user_id').notNull().references(() => users.id),
  note: text('note').notNull(),
  progressPct: integer('progress_pct'),
  createdAt: createdAt(),
}, (t) => [index('project_updates_project_idx').on(t.projectId)]);

/** 081 — project documents (drawings, permits, photos, test reports, handover). New versions supersede, never overwrite. */
export const projectDocuments = pgTable('project_documents', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  milestoneId: uuid('milestone_id').references(() => milestones.id),
  updateId: uuid('update_id').references(() => projectUpdates.id),
  category: text('category').notNull(), // drawing | permit | photo | test_report | handover | other
  title: text('title').notNull(),
  fileName: text('file_name').notNull(),
  objectKey: text('object_key').notNull(),
  sha256: text('sha256').notNull(),
  size: integer('size').notNull(),
  mime: text('mime').notNull(),
  supersedesId: uuid('supersedes_id'),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('project_documents_project_idx').on(t.projectId)]);

/** 080 — materials & procurement tracker. */
export const projectMaterials = pgTable('project_materials', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  item: text('item').notNull(),
  spec: text('spec'),
  quantity: integer('quantity').notNull(),
  unit: text('unit').notNull(),
  supplier: text('supplier'),
  purchaseOrderId: uuid('purchase_order_id'),
  status: text('status').notNull().default('planned'), // planned | ordered | delivered | installed
  neededBy: date('needed_by'),
  deliveredQty: integer('delivered_qty').notNull().default(0),
  notes: text('notes'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** 082 — quality & safety inspections with item checklists. */
export const inspections = pgTable('inspections', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  milestoneId: uuid('milestone_id').references(() => milestones.id),
  kind: text('kind').notNull(), // quality | safety
  checklist: jsonb('checklist').notNull(), // [{ item, result: pass|fail|na, note }]
  result: text('result').notNull(), // pass | fail
  observations: text('observations'),
  correctiveAction: text('corrective_action'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: uuid('closed_by').references(() => users.id),
  inspectorUserId: uuid('inspector_user_id').notNull().references(() => users.id),
  inspectorOrgId: uuid('inspector_org_id').notNull().references(() => organizations.id),
  createdAt: createdAt(),
}, (t) => [index('inspections_project_idx').on(t.projectId)]);

/** 083 — invoices raised against certified milestones (payment received feeds commission triggers in Stage 12). */
export const projectInvoices = pgTable('project_invoices', {
  id: id(),
  number: text('number').notNull(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  milestoneId: uuid('milestone_id').notNull().references(() => milestones.id),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  issuedByOrgId: uuid('issued_by_org_id').notNull().references(() => organizations.id),
  status: text('status').notNull().default('issued'), // issued | paid
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentReference: text('payment_reference'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('project_invoices_number_uq').on(t.number), uniqueIndex('project_invoices_milestone_uq').on(t.milestoneId)]);

/** Gate: every change to schedule, value, scope or allocation is logged with who, when, before/after and why. Append-only. */
export const projectChangeLog = pgTable('project_change_log', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  entity: text('entity').notNull(), // project | milestone | member | material | document
  entityId: uuid('entity_id').notNull(),
  field: text('field').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  reason: text('reason'),
  userId: uuid('user_id').notNull().references(() => users.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  createdAt: createdAt(),
}, (t) => [index('project_change_log_project_idx').on(t.projectId, t.createdAt)]);
