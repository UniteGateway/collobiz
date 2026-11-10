/**
 * Bank statement import (tested in test/bank-import.e2e.ts). A company uploads its own statement (CSV or .xlsx); credits are
 * matched to invoices it issued, debits to invoices it must pay. Unite finance can import across companies. Matches are
 * suggestions until a person confirms; a payee's confirmed match is a *reported* payment the payer (or finance) confirms
 * before it counts. COLLABIZ only reads a file the user uploads — it has no connection to any bank.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, asc, desc, eq, inArray, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { StatementMatchSchema, parseBankStatement, suggestMatches, type OpenInvoice } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { bankStatementLines, bankStatements, paymentReceipts, projectInvoices, projects } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { sha256 } from '../../common/crypto';
import { MAX_UPLOAD_BYTES } from '../../common/adapters';
import { readTable } from '../../common/sheets';
import { Phase2Service } from './phase2.controller';

const money = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'finance') && !ctx.mfaRequiredButMissing;
const manager = (ctx: RequestContext, orgId: string) => ctx.memberships.some((m) => m.organizationId === orgId && (m.role === 'org_owner' || m.role === 'org_admin'));
type Stmt = typeof bankStatements.$inferSelect;

@ApiTags('bank statements')
@Controller('finance')
export class BankImportController {
  constructor(@InjectDb() private db: Db, private svc: Phase2Service, private audit: AuditService) {}

  private canSee(ctx: RequestContext, s: Stmt) {
    return money(ctx) || s.uploadedBy === ctx.userId || (!!s.orgId && manager(ctx, s.orgId));
  }
  private async load(ctx: RequestContext, id: string) {
    const [s] = await this.db.select().from(bankStatements).where(eq(bankStatements.id, id));
    if (!s || !this.canSee(ctx, s)) throw new NotFoundException('Statement not found');
    return s;
  }

  /** Invoices a line may settle: credits → the company's own invoices to clients; debits → invoices it has to pay. */
  private async openInvoices(s: Stmt, direction: string): Promise<(OpenInvoice & { projectId: string; issuer: string; payer: string })[]> {
    const rows = await this.db.select({ i: projectInvoices, p: projects }).from(projectInvoices).innerJoin(projects, eq(projects.id, projectInvoices.projectId))
      .where(and(ne(projectInvoices.status, 'paid'), s.orgId ? (direction === 'credit' ? eq(projectInvoices.issuedByOrgId, s.orgId) : eq(projects.ownerOrgId, s.orgId)) : undefined));
    if (!rows.length) return [];
    const recs = await this.db.select().from(paymentReceipts).where(inArray(paymentReceipts.invoiceId, rows.map((r) => r.i.id)));
    const name = await this.svc.names(rows.flatMap((r) => [r.i.issuedByOrgId, r.p.ownerOrgId]));
    return rows.map(({ i, p }) => {
      const rs = recs.filter((r) => r.invoiceId === i.id);
      const issuer = name(i.issuedByOrgId), payer = name(p.ownerOrgId);
      return { id: i.id, number: i.number, amount: i.amount, outstanding: i.amount - rs.reduce((a, r) => a + r.amount, 0), issuedAt: i.issuedAt, counterparty: direction === 'credit' ? payer : issuer, knownReferences: rs.map((r) => r.reference), projectId: p.id, issuer, payer };
    });
  }

  @Post('bank-statements')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  @HttpCode(201)
  async upload(@Ctx() ctx: RequestContext, @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined, @Body() raw: Record<string, string>) {
    if (!file) throw new BadRequestException('Attach the statement file (CSV or .xlsx)');
    const orgId = raw.orgId || (money(ctx) ? null : ctx.orgId);
    if (orgId ? !manager(ctx, orgId) : !money(ctx)) throw new ForbiddenException('A company owner or admin imports its own statement; Unite finance can import across companies');
    let parsed;
    try { parsed = parseBankStatement(await readTable(file)); } catch (e) { if (e instanceof BadRequestException) throw e; throw new BadRequestException((e as Error).message); }
    if (!parsed.lines.length) throw new BadRequestException('No transactions found in this statement');
    if (parsed.lines.length > 5000) throw new BadRequestException('Split statements longer than 5,000 lines');
    const hash = sha256(file.buffer.toString('base64'));
    const [s] = await this.db.insert(bankStatements).values({ orgId, uploadedBy: ctx.userId, fileName: file.originalname.slice(0, 200), fileHash: hash, layout: parsed.layout, periodFrom: parsed.from, periodTo: parsed.to, lineCount: parsed.lines.length, skippedCount: parsed.skipped.length }).onConflictDoNothing().returning();
    if (!s) throw new ConflictException('You have already imported this exact file');
    const open = { credit: await this.openInvoices(s, 'credit'), debit: await this.openInvoices(s, 'debit') };
    const norm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '');
    let suggested = 0, recorded = 0;
    const values = parsed.lines.map((l) => {
      const known = l.utr ? open[l.direction].find((i) => (i.knownReferences ?? []).some((r) => norm(r).includes(norm(l.utr!)))) : undefined;
      if (known) { recorded++; return { ...l, statementId: s.id, status: 'unmatched', matchReason: `Already recorded on ${known.number}` }; }
      const m = suggestMatches(l, open[l.direction]);
      if (m.best) { suggested++; return { ...l, statementId: s.id, status: 'suggested', suggestedInvoiceId: m.best.invoiceId, matchScore: m.best.score, matchReason: m.best.reason }; }
      return { ...l, statementId: s.id, status: 'unmatched', matchReason: m.ambiguous ? 'Several invoices fit — choose one' : null };
    });
    for (let i = 0; i < values.length; i += 500) await this.db.insert(bankStatementLines).values(values.slice(i, i + 500));
    await this.audit.record(ctx, { action: 'finance.statement_imported', objectType: 'bank_statement', objectId: s.id, after: { file: s.fileName, lines: s.lineCount, suggested, layout: s.layout } });
    return { id: s.id, lines: s.lineCount, skipped: parsed.skipped.length, suggested, alreadyRecorded: recorded, period: [parsed.from, parsed.to], layout: parsed.layout };
  }

  @Get('bank-statements')
  async list(@Ctx() ctx: RequestContext) {
    const mine = ctx.memberships.filter((m) => m.role === 'org_owner' || m.role === 'org_admin').map((m) => m.organizationId);
    const rows = await this.db.select().from(bankStatements).where(money(ctx) ? undefined : or(eq(bankStatements.uploadedBy, ctx.userId), mine.length ? inArray(bankStatements.orgId, mine) : undefined)).orderBy(desc(bankStatements.createdAt)).limit(100);
    if (!rows.length) return [];
    const lines = await this.db.select({ s: bankStatementLines.statementId, st: bankStatementLines.status }).from(bankStatementLines).where(inArray(bankStatementLines.statementId, rows.map((r) => r.id)));
    const name = await this.svc.names(rows.map((r) => r.orgId));
    return rows.map((r) => {
      const ls = lines.filter((l) => l.s === r.id);
      const c = (st: string) => ls.filter((l) => l.st === st).length;
      return { ...r, company: r.orgId ? name(r.orgId) : 'All companies (Unite finance)', matched: c('matched'), suggested: c('suggested'), unmatched: c('unmatched'), ignored: c('ignored') };
    });
  }

  @Get('bank-statements/:id')
  async one(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const s = await this.load(ctx, id);
    const lines = await this.db.select().from(bankStatementLines).where(eq(bankStatementLines.statementId, id)).orderBy(asc(bankStatementLines.seq));
    const open = { credit: await this.openInvoices(s, 'credit'), debit: await this.openInvoices(s, 'debit') };
    const nums = new Map([...open.credit, ...open.debit].map((i) => [i.id, i]));
    const matchedIds = lines.map((l) => l.receiptId).filter((x): x is string => !!x);
    const recs = matchedIds.length ? await this.db.select({ r: paymentReceipts, n: projectInvoices.number }).from(paymentReceipts).innerJoin(projectInvoices, eq(projectInvoices.id, paymentReceipts.invoiceId)).where(inArray(paymentReceipts.id, matchedIds)) : [];
    const name = await this.svc.names([s.orgId]);
    return {
      ...s, company: s.orgId ? name(s.orgId) : 'All companies (Unite finance)', payeeReports: !!s.orgId && !money(ctx),
      lines: lines.map((l) => {
        const rec = recs.find((x) => x.r.id === l.receiptId);
        const live = l.status === 'unmatched' || l.status === 'suggested' ? suggestMatches(l, open[l.direction as 'credit' | 'debit']).candidates : [];
        const opt = (iid: string) => { const i = nums.get(iid); return i ? { invoiceId: i.id, number: i.number, outstanding: i.outstanding, counterparty: i.counterparty, projectId: i.projectId } : null; };
        return {
          id: l.id, seq: l.seq, txnDate: l.txnDate, description: l.description, reference: l.reference, utr: l.utr, direction: l.direction, amount: l.amount, status: l.status, matchReason: l.matchReason, matchScore: l.matchScore,
          suggested: l.suggestedInvoiceId && l.status === 'suggested' ? opt(l.suggestedInvoiceId) : null,
          candidates: live.map((c) => ({ ...opt(c.invoiceId), reason: c.reason, score: c.score })).filter((c) => c.invoiceId),
          options: l.status === 'unmatched' || l.status === 'suggested' ? open[l.direction as 'credit' | 'debit'].filter((i) => i.outstanding >= l.amount).slice(0, 50).map((i) => opt(i.id)) : [],
          receipt: rec ? { invoice: rec.n, pending: rec.r.pending, reference: rec.r.reference } : null,
        };
      }),
    };
  }

  @Post('bank-statement-lines/:lid/match')
  @HttpCode(200)
  async match(@Ctx() ctx: RequestContext, @Param('lid', ParseUUIDPipe) lid: string, @Body(body(StatementMatchSchema)) b: z.infer<typeof StatementMatchSchema>) {
    const [l] = await this.db.select().from(bankStatementLines).where(eq(bankStatementLines.id, lid));
    if (!l) throw new NotFoundException('Line not found');
    const s = await this.load(ctx, l.statementId);
    if (!(money(ctx) || (s.orgId && manager(ctx, s.orgId)))) throw new ForbiddenException('A company owner or admin confirms matches');
    if (l.status === 'matched' || l.status === 'ignored') throw new ConflictException('This line is already settled');
    const inv = (await this.openInvoices(s, l.direction)).find((i) => i.id === b.invoiceId);
    if (!inv) throw new BadRequestException('Choose one of the open invoices offered for this line');
    const [row] = await this.db.select().from(projectInvoices).where(eq(projectInvoices.id, inv.id));
    // The payee's statement proves money arrived only to the payee — the payer (or finance) confirms before it counts.
    const pending = !money(ctx) && l.direction === 'credit';
    const reference = l.utr ?? l.reference ?? `STMT-${l.id.slice(0, 8).toUpperCase()}`;
    const r = await this.svc.applyReceipt(ctx, row, { amount: l.amount, reference, receivedAt: l.txnDate, note: l.description.slice(0, 300) }, { source: 'bank_statement', pending, statementLineId: l.id });
    await this.db.update(bankStatementLines).set({ status: 'matched', receiptId: r.receipt.id, suggestedInvoiceId: inv.id }).where(eq(bankStatementLines.id, lid));
    return { status: 'matched', invoice: inv.number, pending: r.pending, paid: r.paid, outstanding: r.outstanding };
  }

  @Post('bank-statement-lines/:lid/ignore')
  @HttpCode(200)
  async ignore(@Ctx() ctx: RequestContext, @Param('lid', ParseUUIDPipe) lid: string) {
    const [l] = await this.db.select().from(bankStatementLines).where(eq(bankStatementLines.id, lid));
    if (!l) throw new NotFoundException('Line not found');
    await this.load(ctx, l.statementId);
    if (l.status === 'matched') throw new ConflictException('A matched line cannot be ignored');
    await this.db.update(bankStatementLines).set({ status: l.status === 'ignored' ? 'unmatched' : 'ignored' }).where(eq(bankStatementLines.id, lid));
    return { status: l.status === 'ignored' ? 'unmatched' : 'ignored' };
  }
}
