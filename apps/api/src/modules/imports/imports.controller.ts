/**
 * Bulk import of customers and products from CSV / Excel (.xlsx) or a Tally XML export (tested in test/bulk-import.e2e.ts).
 * Preview → adjust the column mapping → check → commit. Every rejected row is listed with its reason; records already in
 * COLLABIZ are skipped (or reported). Customer imports record a consent basis for each contact (DPDP Act); "own records"
 * contacts are marked restricted so they are never used for outreach.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { BulkCommitSchema, CONSENT_BASES, IMPORT_TARGETS, IMPORT_TARGET_KEYS, SECTORS, dedupeKey, guessMapping, validateImport, type FieldSpec, type ImportTarget } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { bulkImports, customers, supplierProducts } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { sha256 } from '../../common/crypto';
import { MAX_UPLOAD_BYTES } from '../../common/adapters';
import { readTable } from '../../common/sheets';
import { looksLikeTally, tallyRows } from '../../common/tally';

const MAX_ROWS = 5000;
const manager = (ctx: RequestContext, orgId: string) => ctx.memberships.some((m) => m.organizationId === orgId && (m.role === 'org_owner' || m.role === 'org_admin'));
const MappingSchema = z.object({ header: z.number().int().min(0), mapping: z.record(z.string(), z.number().int().min(0)) });

@ApiTags('imports')
@Controller('imports')
export class ImportsController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private org(ctx: RequestContext) {
    if (!ctx.orgId || !manager(ctx, ctx.orgId)) throw new ForbiddenException('A company owner or admin imports data');
    return ctx.orgId;
  }
  private async load(ctx: RequestContext, id: string) {
    const [i] = await this.db.select().from(bulkImports).where(and(eq(bulkImports.id, id), eq(bulkImports.orgId, this.org(ctx))));
    if (!i) throw new NotFoundException('Import not found');
    return i;
  }
  /** Keys of what this company already has, to skip re-imports. */
  private async existing(orgId: string, target: ImportTarget) {
    if (target === 'customers') return new Set((await this.db.select({ legalName: customers.legalName, taxId: customers.taxId, contactPhone: customers.contactPhone }).from(customers).where(eq(customers.organizationId, orgId))).flatMap((c) => [dedupeKey('customers', c), ...(c.taxId ? [] : [`n:${c.legalName.toLowerCase()}|`])]));
    return new Set((await this.db.select({ name: supplierProducts.name, sku: supplierProducts.sku }).from(supplierProducts).where(eq(supplierProducts.supplierOrgId, orgId))).map((p) => dedupeKey('products', p)));
  }
  private async check(i: typeof bulkImports.$inferSelect, header: number, mapping: Record<string, number>) {
    const rows = i.rows as string[][];
    const v = validateImport(rows, i.target as ImportTarget, header, mapping);
    const have = await this.existing(i.orgId, i.target as ImportTarget);
    const fresh = v.records.filter((r) => !have.has(dedupeKey(i.target as ImportTarget, r.data)));
    return { ...v, fresh, existing: v.records.length - fresh.length };
  }
  private summary(i: typeof bulkImports.$inferSelect, c: Awaited<ReturnType<ImportsController['check']>>) {
    return { ready: c.fresh.length, existing: c.existing, rejected: c.issues.length, missing: c.missing, issues: c.issues.slice(0, 200), sample: c.fresh.slice(0, 5).map((r) => r.data) };
  }

  @Post('preview')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  @HttpCode(201)
  async preview(@Ctx() ctx: RequestContext, @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined, @Body() raw: Record<string, string>) {
    const orgId = this.org(ctx);
    const target = raw.target as ImportTarget;
    if (!IMPORT_TARGET_KEYS.includes(target)) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { target: 'Choose what you are importing' } });
    if (!file) throw new BadRequestException('Attach a CSV, Excel (.xlsx) or Tally XML file');
    const tally = file.originalname.toLowerCase().endsWith('.xml') || looksLikeTally(file.buffer);
    const rows = tally ? tallyRows(file.buffer, target) : await readTable(file);
    if (rows.length < 2) throw new BadRequestException('The file has no data rows');
    if (rows.length > MAX_ROWS + 15) throw new BadRequestException(`Split files longer than ${MAX_ROWS.toLocaleString('en-IN')} rows`);
    const g = guessMapping(rows, target);
    const [i] = await this.db.insert(bulkImports).values({ orgId, userId: ctx.userId, target, source: tally ? 'tally' : 'file', fileName: file.originalname.slice(0, 200), fileHash: sha256(file.buffer.toString('base64')), rows: rows.map((r) => r.map((c) => c.slice(0, 2000))), header: g.header, mapping: g.mapping }).returning();
    const c = await this.check(i, g.header, g.mapping);
    return { id: i.id, target, source: i.source, fileName: i.fileName, header: g.header, mapping: g.mapping, columns: rows[g.header] ?? [], preview: rows.slice(g.header + 1, g.header + 6), rowCount: rows.length - g.header - 1, fields: (IMPORT_TARGETS[target].fields as readonly FieldSpec[]).map(({ key, label, required, hint }) => ({ key, label, required: !!required, hint })), ...this.summary(i, c) };
  }

  @Post(':id/check')
  @HttpCode(200)
  async recheck(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(MappingSchema)) b: z.infer<typeof MappingSchema>) {
    const i = await this.load(ctx, id);
    if (i.status !== 'previewed') throw new ConflictException('This import is already done');
    return this.summary(i, await this.check(i, b.header, b.mapping));
  }

  @Post(':id/commit')
  @HttpCode(200)
  async commit(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(BulkCommitSchema)) b: z.infer<typeof BulkCommitSchema>) {
    const i = await this.load(ctx, id);
    if (i.status !== 'previewed') throw new ConflictException('This import is already done');
    if (b.target !== i.target) throw new BadRequestException('Target does not match the preview');
    if (i.target === 'customers' && !b.consentBasis) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { consentBasis: 'Say on what basis you hold these contacts' } });
    if (i.target === 'products' && !SECTORS.some((s) => s.code === b.sector)) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { sector: 'Choose the sector these products belong to' } });
    const c = await this.check(i, b.header, b.mapping);
    if (c.missing.length) throw new BadRequestException(`Map these columns first: ${c.missing.join(', ')}`);
    if (!c.fresh.length) throw new BadRequestException('Nothing new to import');
    const at = new Date().toISOString();
    await this.db.transaction(async (tx) => {
      for (let k = 0; k < c.fresh.length; k += 500) {
        const chunk = c.fresh.slice(k, k + 500).map((r) => r.data);
        if (i.target === 'customers') {
          await tx.insert(customers).values(chunk.map((d) => ({ organizationId: i.orgId, legalName: String(d.legalName), taxId: (d.taxId as string) ?? null, contactName: (d.contactName as string) ?? null, contactPhone: (d.contactPhone as string) ?? null, contactEmail: (d.contactEmail as string) ?? null, city: (d.city as string) ?? null,
            consentProvenance: { source: i.source === 'tally' ? 'tally_import' : 'bulk_import', basis: b.consentBasis, basisText: CONSENT_BASES[b.consentBasis!], importId: i.id, file: i.fileName, by: ctx.userId, at },
            restrictedContacts: b.consentBasis === 'own_records' })));
        } else {
          await tx.insert(supplierProducts).values(chunk.map((d) => ({ supplierOrgId: i.orgId, name: String(d.name), sector: b.sector!, description: String(d.description ?? d.name) + (d.hsn ? ` (HSN ${d.hsn})` : ''), sku: (d.sku as string) ?? null, unit: String(d.unit), price: (d.price as number) ?? null, moq: (d.moq as number) || 1, leadTimeDays: (d.leadTimeDays as number) || 7, createdBy: ctx.userId })));
        }
      }
      await tx.update(bulkImports).set({ status: 'committed', header: b.header, mapping: b.mapping, consentBasis: b.consentBasis ?? null, created: c.fresh.length, skippedExisting: c.existing, rejected: c.issues.length, committedAt: new Date(), rows: [] }).where(eq(bulkImports.id, id));
    });
    await this.audit.record(ctx, { action: `import.${i.target}`, objectType: 'bulk_import', objectId: id, after: { file: i.fileName, source: i.source, created: c.fresh.length, skipped: c.existing, rejected: c.issues.length, consentBasis: b.consentBasis } });
    return { created: c.fresh.length, skippedExisting: c.existing, rejected: c.issues.length };
  }

  @Get()
  async list(@Ctx() ctx: RequestContext) {
    const orgId = this.org(ctx);
    return this.db.select({ id: bulkImports.id, target: bulkImports.target, source: bulkImports.source, fileName: bulkImports.fileName, status: bulkImports.status, created: bulkImports.created, skippedExisting: bulkImports.skippedExisting, rejected: bulkImports.rejected, consentBasis: bulkImports.consentBasis, createdAt: bulkImports.createdAt, committedAt: bulkImports.committedAt })
      .from(bulkImports).where(eq(bulkImports.orgId, orgId)).orderBy(desc(bulkImports.createdAt)).limit(50);
  }
}

@Module({ controllers: [ImportsController] })
export class ImportsModule {}
