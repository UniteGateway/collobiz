/**
 * Catalogues, brochures, DPRs, datasheets and other documents for every module (tested in test/module-documents.e2e.ts).
 * Unite admins upload a file (PDF / image, type-checked and scanned by the storage adapter) or add a link; viewers see only
 * what their visibility allows. Files are served through short-lived signed links; every open is counted and audited.
 * Replacing a file keeps the same document and raises its version.
 */
import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { DOCUMENT_KIND_LABELS, DOCUMENT_MODULE_LABELS, ModuleDocumentSchema, type ModuleDocumentInput } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { moduleDocuments } from '../../db/schema';
import { Ctx, OptionalCtx, Public, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { StorageService } from '../../common/adapters';
import { viewerOf, type Viewer } from '../../common/viewer';
import { MAX_UPLOAD_BYTES } from '../../common/adapters';

type Doc = typeof moduleDocuments.$inferSelect;
const staff = (ctx: RequestContext | null) => !!ctx?.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
/** Which visibility levels this viewer may see. */
function levels(v: Viewer, ctx: RequestContext | null) {
  if (staff(ctx) || v.platform) return ['public', 'partners', 'verified_partners', 'staff'];
  if (!v.authenticated) return ['public'];
  return v.verified || ctx?.orgType === 'group_company' ? ['public', 'partners', 'verified_partners'] : ['public', 'partners'];
}
const view = (d: Doc) => ({
  id: d.id, moduleKey: d.moduleKey, module: DOCUMENT_MODULE_LABELS[d.moduleKey] ?? d.moduleKey, title: d.title, kind: d.kind, kindLabel: DOCUMENT_KIND_LABELS[d.kind] ?? d.kind,
  description: d.description, source: d.objectKey ? 'file' : 'link', fileName: d.fileName, mime: d.mime, size: d.size, url: d.objectKey ? null : d.url,
  visibility: d.visibility, status: d.status, version: d.version, opens: d.opens, updatedAt: d.updatedAt,
});
/** Multipart form fields arrive as strings. */
function parseForm(raw: Record<string, unknown>): ModuleDocumentInput {
  const r = ModuleDocumentSchema.safeParse({ ...raw, sortOrder: raw.sortOrder != null && raw.sortOrder !== '' ? Number(raw.sortOrder) : undefined, url: raw.url || undefined, description: raw.description || undefined });
  if (!r.success) throw new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  return r.data;
}

@ApiTags('documents')
@Controller()
export class ModuleDocumentsController {
  constructor(@InjectDb() private db: Db, private storage: StorageService, private audit: AuditService) {}

  /** Documents for one module (or all), newest first within the admin's order. Public documents need no sign-in. */
  @Public()
  @Get('documents')
  async list(@OptionalCtx() ctx: RequestContext | null, @Query('module') moduleKey?: string, @Query('kind') kind?: string) {
    const rows = await this.db.select().from(moduleDocuments).where(and(eq(moduleDocuments.status, 'published'), inArray(moduleDocuments.visibility, levels(viewerOf(ctx), ctx)),
      moduleKey ? inArray(moduleDocuments.moduleKey, moduleKey === 'all' ? Object.keys(DOCUMENT_MODULE_LABELS) : [moduleKey, 'general']) : undefined, kind ? eq(moduleDocuments.kind, kind) : undefined))
      .orderBy(asc(moduleDocuments.sortOrder), desc(moduleDocuments.updatedAt));
    return rows.map(view);
  }

  /** Opens a document: a signed 5-minute download link for files, or the stored link. */
  @Public()
  @Post('documents/:id/open')
  @HttpCode(200)
  async open(@OptionalCtx() ctx: RequestContext | null, @Param('id', ParseUUIDPipe) id: string) {
    const [d] = await this.db.select().from(moduleDocuments).where(eq(moduleDocuments.id, id)).limit(1);
    if (!d || d.status !== 'published' || !levels(viewerOf(ctx), ctx).includes(d.visibility)) throw new NotFoundException('Document not found');
    await this.db.update(moduleDocuments).set({ opens: sql`${moduleDocuments.opens} + 1` }).where(eq(moduleDocuments.id, id));
    if (ctx) await this.audit.record(ctx, { action: 'document.opened', objectType: 'module_document', objectId: id });
    return { url: d.objectKey ? this.storage.signedUrl(d.objectKey, 300) : d.url, fileName: d.fileName };
  }

  // ---------------------------------------------------------------- Unite admins
  @Get('admin/documents')
  async all(@Ctx() ctx: RequestContext, @Query('module') moduleKey?: string) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const rows = await this.db.select().from(moduleDocuments).where(moduleKey ? eq(moduleDocuments.moduleKey, moduleKey) : undefined).orderBy(asc(moduleDocuments.moduleKey), asc(moduleDocuments.sortOrder), desc(moduleDocuments.updatedAt));
    return rows.map(view);
  }

  /** Adds a document: attach a file, or give a link. */
  @Post('admin/documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async create(@Ctx() ctx: RequestContext, @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string } | undefined, @Body() raw: Record<string, unknown>) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const b = parseForm(raw);
    if (!file && !b.url) throw new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: [{ path: 'file', message: 'Attach a file or give a link' }] });
    const stored = file ? await this.storage.put(file.buffer, file.mimetype, `documents/${b.moduleKey}`) : null;
    const [d] = await this.db.insert(moduleDocuments).values({
      ...b, description: b.description ?? null, url: stored ? null : b.url ?? null, objectKey: stored?.key ?? null, fileName: file?.originalname.slice(0, 200) ?? null, mime: stored?.mime ?? null, size: stored?.size ?? null, sha256: stored?.sha256 ?? null, createdBy: ctx.userId,
    }).returning();
    await this.audit.record(ctx, { action: 'document.added', objectType: 'module_document', objectId: d.id, after: { module: b.moduleKey, title: b.title, kind: b.kind, file: d.fileName, sha256: d.sha256, url: d.url } });
    return view(d);
  }

  /** Edits details; a new file replaces the old one and raises the version. */
  @Post('admin/documents/:id')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string } | undefined, @Body() raw: Record<string, unknown>) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const [cur] = await this.db.select().from(moduleDocuments).where(eq(moduleDocuments.id, id)).limit(1);
    if (!cur) throw new NotFoundException('Document not found');
    const b = parseForm(raw);
    const stored = file ? await this.storage.put(file.buffer, file.mimetype, `documents/${b.moduleKey}`) : null;
    const [d] = await this.db.update(moduleDocuments).set({
      ...b, description: b.description ?? null, updatedAt: new Date(),
      ...(stored ? { objectKey: stored.key, fileName: file!.originalname.slice(0, 200), mime: stored.mime, size: stored.size, sha256: stored.sha256, url: null, version: cur.version + 1 } : !cur.objectKey ? { url: b.url ?? cur.url } : {}),
    }).where(eq(moduleDocuments.id, id)).returning();
    await this.audit.record(ctx, { action: 'document.updated', objectType: 'module_document', objectId: id, before: { title: cur.title, version: cur.version, visibility: cur.visibility }, after: { title: d.title, version: d.version, visibility: d.visibility, sha256: d.sha256 } });
    return view(d);
  }

  @Post('admin/documents/:id/status')
  @HttpCode(200)
  async status(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() b: { status?: string }) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    if (!['published', 'archived'].includes(b?.status ?? '')) throw new BadRequestException('Status must be published or archived');
    const [d] = await this.db.update(moduleDocuments).set({ status: b.status!, updatedAt: new Date() }).where(eq(moduleDocuments.id, id)).returning();
    if (!d) throw new NotFoundException('Document not found');
    await this.audit.record(ctx, { action: `document.${b.status}`, objectType: 'module_document', objectId: id });
    return view(d);
  }
}

@Module({ controllers: [ModuleDocumentsController] })
export class ModuleDocumentsModule {}
