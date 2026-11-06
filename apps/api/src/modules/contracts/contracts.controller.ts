/**
 * Stage 10 — Contracts & document workflows (screens 074, 148).
 *
 * Gate: an approved agreement version is immutable.
 *  - Every edit after a submission creates a new version; the text of a submitted version can never change, and an
 *    approved version cannot change at all. This is enforced twice: in this service and by a PostgreSQL trigger
 *    (migration 0008), so even direct SQL cannot alter an approved version.
 *  - Approval is a second pair of eyes: the approver must hold contract approval rights in the issuing organization
 *    and must not be the author of the version.
 *  - Signatures bind to the approved version's SHA-256: the signer submits the hash they saw, and a mismatch is refused.
 *    Signatures are append-only (trigger). Both parties signing executes the contract; an executed amendment
 *    supersedes the contract it amends.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, inArray, isNotNull, notInArray, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  assertTransition, ContractCreateSchema, ContractDraftSchema, ContractMachine, ContractReviewSchema, ContractSignSchema, ContractTerminateSchema, sectorName,
  type ContractState,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  agreementAcceptances, agreementTemplates, bids, collaborationTeams, contracts, contractSignatures, contractVersions, kybDocuments, leadClaims, memberships, negotiationMessages, notifications, opportunities, organizations, teamMembers, tenders, users,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { decryptField, randomDigits, sha256 } from '../../common/crypto';
import { Idempotent } from '../../common/idempotency';

type Contract = typeof contracts.$inferSelect;
type Terms = z.infer<typeof ContractDraftSchema>['terms'];

const KIND_LABEL: Record<string, string> = { loi: 'Letter of Intent', work_order: 'Work Order', contract: 'Contract' };
const CLOSED: ContractState[] = ['terminated', 'superseded'];
const inr = (minor?: number | null) => (minor == null ? 'to be agreed' : `INR ${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);

/** Starting text for a draft. Marked as a draft pending legal review (assumption A-08) — never presented as final legal text. */
function templateBody(kind: string, p: { code: string; issuer: string; counterparty: string; tender?: { code: string; title: string; scope: string; sector: string } | null; value?: number | null; paymentTerms?: string; timelineWeeks?: number }) {
  const head = `${KIND_LABEL[kind].toUpperCase()} — ${p.code}\nDRAFT TEMPLATE — SUBJECT TO LEGAL REVIEW BEFORE USE\n\nIssued by: ${p.issuer}\nIssued to: ${p.counterparty}\n`;
  const ref = p.tender ? `Reference: tender ${p.tender.code} — ${p.tender.title} (${sectorName(p.tender.sector)})\n` : '';
  const scope = p.tender ? `\nScope\n${p.tender.scope}\n` : '';
  const money = `\nConsideration\nTotal value: ${inr(p.value)} (exclusive of applicable taxes).${p.paymentTerms ? `\nPayment terms: ${p.paymentTerms}` : ''}\n`;
  const time = p.timelineWeeks ? `\nTimeline\nDelivery within ${p.timelineWeeks} weeks of the effective date, unless varied in writing.\n` : '';
  const tail = kind === 'loi'
    ? `\nNature of this letter\n1. This letter records the intention of ${p.issuer} to award the above work to ${p.counterparty}, subject to a definitive work order or contract.\n2. It does not by itself create an obligation to pay, other than for work expressly authorised in writing.\n3. This letter lapses if a definitive agreement is not signed within 30 days.\n`
    : `\nConditions\n1. Work is performed to the scope, specifications and quality standards in the tender documents and any agreed addenda.\n2. Changes to scope, price or timeline require a written change order approved by both parties.\n3. Invoices are payable against certified milestones; the issuer may withhold payment for non-conforming work.\n4. Confidential information is protected for three years after completion.\n5. Either party may terminate for material breach not cured within 15 days of written notice.\n6. Commission or fee arrangements with introducers on COLLABIZ are governed by their separate addenda and do not change this agreement.\n`;
  return `${head}${ref}${scope}${money}${time}${tail}`;
}

@Injectable()
export class ContractsService {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  async load(ctx: RequestContext, id: string) {
    const [c] = await this.db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    const party = c ? this.party(ctx, c) : null;
    if (!c || !party) throw new NotFoundException('Contract not found');
    // Internal drafts stay inside the issuing organization until a version is approved.
    if (party === 'counterparty' && !(await this.approved(c.id))) throw new NotFoundException('Contract not found');
    return c;
  }
  party(ctx: RequestContext, c: Contract): 'issuer' | 'counterparty' | null {
    const orgs = ctx.memberships.map((m) => m.organizationId);
    if (orgs.includes(c.issuerOrgId)) return 'issuer';
    if (orgs.includes(c.counterpartyOrgId)) return 'counterparty';
    return null;
  }
  canManage(ctx: RequestContext, c: Contract) {
    return ctx.orgId === c.issuerOrgId && ctx.caps.has('contract.manage');
  }
  canApproveRole(ctx: RequestContext, c: Contract) {
    return ctx.orgId === c.issuerOrgId && (ctx.caps.has('contract.approve') || ctx.caps.has('org.manage'));
  }
  canSignFor(ctx: RequestContext, c: Contract) {
    return (ctx.orgId === c.issuerOrgId || ctx.orgId === c.counterpartyOrgId) && (ctx.caps.has('contract.manage') || ctx.caps.has('org.manage'));
  }
  versions(contractId: string) {
    return this.db.select().from(contractVersions).where(eq(contractVersions.contractId, contractId)).orderBy(asc(contractVersions.versionNo));
  }
  async latest(contractId: string) {
    const [v] = await this.db.select().from(contractVersions).where(eq(contractVersions.contractId, contractId)).orderBy(desc(contractVersions.versionNo)).limit(1);
    return v;
  }
  async approved(contractId: string) {
    const [v] = await this.db.select().from(contractVersions).where(and(eq(contractVersions.contractId, contractId), isNotNull(contractVersions.approvedAt))).orderBy(desc(contractVersions.versionNo)).limit(1);
    return v ?? null;
  }
  async set(ctx: RequestContext, c: Contract, to: ContractState, reason: string | undefined, extra: Partial<Contract> = {}, tx: Db = this.db) {
    assertTransition(ContractMachine, c.status as ContractState, to);
    const [u] = await tx.update(contracts).set({ ...extra, status: to, version: c.version + 1, updatedAt: new Date() }).where(and(eq(contracts.id, c.id), eq(contracts.version, c.version))).returning();
    if (!u) throw new ConflictException('The contract was changed concurrently. Reload and try again.');
    await this.audit.record(ctx, { action: `contract.${to}`, objectType: 'contract', objectId: c.id, reason, before: { status: c.status }, after: { status: to } }, tx);
    return u;
  }
  async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const ms = await this.db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    for (const m of ms) await this.db.insert(notifications).values({ userId: m.userId, kind: 'contract', title, body: text, link });
  }
  async view(ctx: RequestContext, c: Contract) {
    const [vs, sigs, orgs] = await Promise.all([
      this.versions(c.id),
      this.db.select({ s: contractSignatures, name: organizations.displayName }).from(contractSignatures).innerJoin(organizations, eq(organizations.id, contractSignatures.organizationId)).where(eq(contractSignatures.contractId, c.id)).orderBy(asc(contractSignatures.signedAt)),
      this.db.select({ id: organizations.id, name: organizations.displayName }).from(organizations).where(inArray(organizations.id, [c.issuerOrgId, c.counterpartyOrgId])),
    ]);
    const authors = vs.length ? await this.db.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, [...new Set(vs.flatMap((v) => [v.authorUserId, v.approvedBy, v.rejectedBy].filter(Boolean) as string[]))])) : [];
    const name = (id?: string | null) => authors.find((a) => a.id === id)?.name ?? null;
    const party = this.party(ctx, c)!;
    const latest = vs[vs.length - 1];
    const approved = [...vs].reverse().find((v) => v.approvedAt) ?? null;
    const signedByMe = sigs.some((s) => s.s.organizationId === ctx.orgId && s.s.versionId === approved?.id);
    // The counterparty never sees unsubmitted internal drafts — only versions that reached review.
    const visible = party === 'issuer' ? vs : vs.filter((v) => v.approvedAt);
    return {
      id: c.id, code: c.code, kind: c.kind, kindLabel: KIND_LABEL[c.kind], title: c.title, status: c.status, value: c.value, currency: c.currency, tenderId: c.tenderId,
      issuer: orgs.find((o) => o.id === c.issuerOrgId)?.name, counterparty: orgs.find((o) => o.id === c.counterpartyOrgId)?.name, issuerOrgId: c.issuerOrgId, counterpartyOrgId: c.counterpartyOrgId,
      supersedesId: c.supersedesId, supersededById: c.supersededById, executedAt: c.executedAt, terminatedAt: c.terminatedAt, terminationReason: c.terminationReason, createdAt: c.createdAt,
      party, version: c.version,
      versions: visible.map((v) => ({ id: v.id, versionNo: v.versionNo, body: v.body, terms: v.terms, bodyHash: v.bodyHash, changeNote: v.changeNote, author: name(v.authorUserId), submittedAt: v.submittedAt, approvedAt: v.approvedAt, approvedBy: name(v.approvedBy), rejectedAt: v.rejectedAt, rejectedBy: name(v.rejectedBy), reviewNote: v.reviewNote, locked: !!(v.submittedAt || v.approvedAt) })),
      approvedVersionId: approved?.id ?? null,
      signatures: sigs.map((s) => ({ organization: s.name, organizationId: s.s.organizationId, typedName: s.s.typedName, title: s.s.title, versionId: s.s.versionId, bodyHash: s.s.bodyHash, signedAt: s.s.signedAt })),
      permissions: {
        edit: this.canManage(ctx, c) && c.status === 'draft',
        submit: this.canManage(ctx, c) && c.status === 'draft' && !!latest && !latest.submittedAt,
        review: this.canApproveRole(ctx, c) && c.status === 'in_review' && latest?.authorUserId !== ctx.userId,
        reviewBlockedReason: c.status === 'in_review' && this.canApproveRole(ctx, c) && latest?.authorUserId === ctx.userId ? 'You wrote this version, so another approver must review it.' : null,
        sign: this.canSignFor(ctx, c) && ['approved', 'partially_signed'].includes(c.status) && !signedByMe,
        amend: this.canManage(ctx, c) && ['approved', 'partially_signed', 'executed'].includes(c.status) && !c.supersededById,
        terminate: this.canManage(ctx, c) && c.status === 'executed',
      },
    };
  }
}

@ApiTags('contracts')
@Controller()
@RequireOrg()
export class ContractsController {
  constructor(@InjectDb() private db: Db, private svc: ContractsService, private audit: AuditService) {}

  /** Contracts where my organization is a party (both sides). Optional tender filter for 074. */
  @Get('contracts')
  async list(@Ctx() ctx: RequestContext, @Query('tenderId') tenderId?: string) {
    if (tenderId && !z.string().uuid().safeParse(tenderId).success) throw new BadRequestException('Malformed identifier');
    const orgs = ctx.memberships.map((m) => m.organizationId);
    const rows = await this.db.select().from(contracts).where(and(or(inArray(contracts.issuerOrgId, orgs), inArray(contracts.counterpartyOrgId, orgs)), tenderId ? eq(contracts.tenderId, tenderId) : undefined)).orderBy(desc(contracts.createdAt));
    const names = rows.length ? await this.db.select({ id: organizations.id, name: organizations.displayName }).from(organizations).where(inArray(organizations.id, [...new Set(rows.flatMap((r) => [r.issuerOrgId, r.counterpartyOrgId]))])) : [];
    // Internal drafts are listed to the counterparty only once a version has been approved.
    const approvedIds = rows.length ? new Set((await this.db.select({ c: contractVersions.contractId }).from(contractVersions).where(and(inArray(contractVersions.contractId, rows.map((r) => r.id)), isNotNull(contractVersions.approvedAt)))).map((x) => x.c)) : new Set<string>();
    return rows.filter((r) => orgs.includes(r.issuerOrgId) || approvedIds.has(r.id)).map((r) => ({
      id: r.id, code: r.code, kind: r.kind, kindLabel: KIND_LABEL[r.kind], title: r.title, status: r.status, value: r.value, currency: r.currency, tenderId: r.tenderId,
      issuer: names.find((n) => n.id === r.issuerOrgId)?.name, counterparty: names.find((n) => n.id === r.counterpartyOrgId)?.name, party: orgs.includes(r.issuerOrgId) ? 'issuer' : 'counterparty', executedAt: r.executedAt, createdAt: r.createdAt,
    }));
  }

  /** 074 — the issuer drafts an LOI, work order or contract for an awarded tender, prefilled from the award. */
  @Post('tenders/:id/contracts')
  @HttpCode(201)
  async createFromAward(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) tenderId: string, @Body(body(ContractCreateSchema)) b: z.infer<typeof ContractCreateSchema>) {
    const [t] = await this.db.select().from(tenders).where(eq(tenders.id, tenderId)).limit(1);
    if (!t || !ctx.memberships.some((m) => m.organizationId === t.issuerOrgId)) throw new NotFoundException('Tender not found');
    if (ctx.orgId !== t.issuerOrgId || !ctx.caps.has('contract.manage')) throw new ForbiddenException('Only the issuing organization’s contract managers can draft award documents');
    if (t.status !== 'awarded') throw new ConflictException('Award documents can be drafted only after the tender is awarded');
    const [win] = await this.db.select().from(bids).where(and(eq(bids.tenderId, tenderId), eq(bids.status, 'awarded'))).limit(1);
    if (!win) throw new ConflictException('No awarded bid found');
    const open = await this.db.select({ id: contracts.id }).from(contracts).where(and(eq(contracts.tenderId, tenderId), eq(contracts.kind, b.kind), notInArray(contracts.status, CLOSED))).limit(1);
    if (open.length) throw new ConflictException(`A ${KIND_LABEL[b.kind].toLowerCase()} already exists for this tender. Amend it instead of creating another.`);
    const [{ issuer }] = await this.db.select({ issuer: organizations.displayName }).from(organizations).where(eq(organizations.id, t.issuerOrgId));
    const [{ counterparty }] = await this.db.select({ counterparty: organizations.displayName }).from(organizations).where(eq(organizations.id, win.organizationId));
    const commercial = JSON.parse(decryptField(win.commercialEnc)) as { amount: number; paymentTerms: string };
    const technical = JSON.parse(decryptField(win.technicalEnc)) as { timelineWeeks: number };
    const [rev] = await this.db.select({ a: negotiationMessages.revisedAmount }).from(negotiationMessages).where(and(eq(negotiationMessages.bidId, win.id), isNotNull(negotiationMessages.revisedAmount))).orderBy(desc(negotiationMessages.createdAt)).limit(1);
    const value = rev?.a ?? commercial.amount; // latest negotiated price, as used by the tender award
    const code = `CTR-${new Date().getUTCFullYear()}-${randomDigits(6)}`;
    const text = templateBody(b.kind, { code, issuer, counterparty, tender: t, value, paymentTerms: commercial.paymentTerms, timelineWeeks: technical.timelineWeeks });
    const terms: Terms = { value, paymentTerms: commercial.paymentTerms };
    const c = await this.db.transaction(async (tx) => {
      const [c] = await tx.insert(contracts).values({ code, kind: b.kind, title: b.title ?? `${KIND_LABEL[b.kind]} — ${t.title}`, issuerOrgId: t.issuerOrgId, counterpartyOrgId: win.organizationId, tenderId, bidId: win.id, value, currency: t.currency, createdBy: ctx.userId }).returning();
      await tx.insert(contractVersions).values({ contractId: c.id, versionNo: 1, body: text, terms, bodyHash: sha256(text), changeNote: 'Generated from the tender award', authorUserId: ctx.userId });
      await this.audit.record(ctx, { action: 'contract.created', objectType: 'contract', objectId: c.id, after: { code, kind: b.kind, tenderId, counterpartyOrgId: win.organizationId, value } }, tx as unknown as Db);
      return c;
    });
    return this.svc.view(ctx, c);
  }

  @Get('contracts/:id')
  async detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.svc.load(ctx, id);
    return this.svc.view(ctx, c);
  }

  /** Edits the draft. A version that was submitted (and then rejected) is never edited — a new version is created. */
  @Put('contracts/:id/draft')
  async saveDraft(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ContractDraftSchema)) b: z.infer<typeof ContractDraftSchema>) {
    const c = await this.svc.load(ctx, id);
    if (!this.svc.canManage(ctx, c)) throw new ForbiddenException('Only the issuing organization’s contract managers can edit drafts');
    if (c.status !== 'draft') throw new ConflictException(c.status === 'in_review' ? 'This version is in review. Wait for the decision before editing.' : 'Approved versions cannot be edited. Create an amendment instead.');
    const latest = await this.svc.latest(id);
    const hash = sha256(b.body);
    if (latest && !latest.submittedAt && !latest.approvedAt) {
      await this.db.update(contractVersions).set({ body: b.body, terms: b.terms, bodyHash: hash, changeNote: b.changeNote ?? latest.changeNote, authorUserId: ctx.userId }).where(eq(contractVersions.id, latest.id));
    } else {
      await this.db.insert(contractVersions).values({ contractId: id, versionNo: (latest?.versionNo ?? 0) + 1, body: b.body, terms: b.terms, bodyHash: hash, changeNote: b.changeNote, authorUserId: ctx.userId });
    }
    if (b.terms.value !== undefined && b.terms.value !== c.value) await this.db.update(contracts).set({ value: b.terms.value, updatedAt: new Date() }).where(eq(contracts.id, id));
    await this.audit.record(ctx, { action: 'contract.draft_saved', objectType: 'contract', objectId: id, after: { bodyHash: hash } });
    return this.svc.view(ctx, (await this.svc.load(ctx, id)));
  }

  @Post('contracts/:id/submit')
  @HttpCode(200)
  async submit(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.svc.load(ctx, id);
    if (!this.svc.canManage(ctx, c)) throw new ForbiddenException('Only the issuing organization’s contract managers can submit');
    const latest = await this.svc.latest(id);
    if (c.status !== 'draft' || !latest || latest.submittedAt) throw new ConflictException('There is no unsubmitted draft. Edit the contract to create a new version first.');
    const u = await this.db.transaction(async (tx) => {
      await tx.update(contractVersions).set({ submittedAt: new Date() }).where(eq(contractVersions.id, latest.id));
      return this.svc.set(ctx, c, 'in_review', undefined, {}, tx as unknown as Db);
    });
    const approvers = await this.db.select({ userId: memberships.userId, role: memberships.role }).from(memberships).where(and(eq(memberships.organizationId, c.issuerOrgId), eq(memberships.status, 'active')));
    for (const a of approvers.filter((x) => x.userId !== latest.authorUserId)) await this.db.insert(notifications).values({ userId: a.userId, kind: 'contract', title: `Review requested: ${c.code}`, body: `Version ${latest.versionNo} of “${c.title}” needs an approver other than its author.`, link: `/vault?contract=${id}` });
    return this.svc.view(ctx, u);
  }

  /** Second-person review. Approving freezes the version permanently. */
  @Post('contracts/:id/review')
  @HttpCode(200)
  async review(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ContractReviewSchema)) b: z.infer<typeof ContractReviewSchema>) {
    const c = await this.svc.load(ctx, id);
    if (!this.svc.canApproveRole(ctx, c)) throw new ForbiddenException('Only contract approvers of the issuing organization can review');
    if (c.status !== 'in_review') throw new ConflictException('This contract is not awaiting review');
    const latest = await this.svc.latest(id);
    if (latest.authorUserId === ctx.userId) throw new ForbiddenException('You wrote this version, so another approver must review it');
    const u = await this.db.transaction(async (tx) => {
      if (b.decision === 'approve') {
        await tx.update(contractVersions).set({ approvedAt: new Date(), approvedBy: ctx.userId, reviewNote: b.note }).where(eq(contractVersions.id, latest.id));
        return this.svc.set(ctx, c, 'approved', b.note, {}, tx as unknown as Db);
      }
      await tx.update(contractVersions).set({ rejectedAt: new Date(), rejectedBy: ctx.userId, reviewNote: b.note }).where(eq(contractVersions.id, latest.id));
      return this.svc.set(ctx, c, 'draft', b.note, {}, tx as unknown as Db);
    });
    await this.audit.record(ctx, { action: `contract.version_${b.decision === 'approve' ? 'approved' : 'rejected'}`, objectType: 'contract_version', objectId: latest.id, reason: b.note, after: { versionNo: latest.versionNo, bodyHash: latest.bodyHash } });
    if (b.decision === 'approve') await this.svc.notifyOrg(c.counterpartyOrgId, `Ready to sign: ${c.code}`, `${c.title} has been approved and is ready for your signature.`, `/vault?contract=${id}`);
    return this.svc.view(ctx, u);
  }

  /** Typed-name e-signature bound to the approved version hash (click-to-sign evidence, B-08). */
  @Post('contracts/:id/sign')
  @Idempotent()
  @HttpCode(200)
  async sign(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ContractSignSchema)) b: z.infer<typeof ContractSignSchema>, @Req() req: { headers: Record<string, string | undefined> }) {
    const c = await this.svc.load(ctx, id);
    if (!this.svc.canSignFor(ctx, c)) throw new ForbiddenException('Only an authorised signatory (owner, admin or contract manager) of a party can sign');
    if (!['approved', 'partially_signed'].includes(c.status)) throw new ConflictException('Only approved contracts can be signed');
    const v = await this.svc.approved(id);
    if (!v) throw new ConflictException('No approved version to sign');
    if (sha256(v.body) !== v.bodyHash) throw new ConflictException('Integrity check failed for the approved version. Signing is blocked; contact support.');
    if (b.bodyHash !== v.bodyHash) throw new ConflictException('The document changed since you opened it. Reload and review the approved text before signing.');
    const existing = await this.db.select({ id: contractSignatures.id }).from(contractSignatures).where(and(eq(contractSignatures.versionId, v.id), eq(contractSignatures.organizationId, ctx.orgId!))).limit(1);
    if (existing.length) throw new ConflictException('Your organization has already signed this version');
    const out = await this.db.transaction(async (tx) => {
      await tx.insert(contractSignatures).values({ contractId: id, versionId: v.id, organizationId: ctx.orgId!, userId: ctx.userId, typedName: b.typedName, title: b.title, bodyHash: v.bodyHash, ip: ctx.ip, userAgent: req.headers['user-agent']?.slice(0, 300) });
      const orgsSigned = new Set((await tx.select({ o: contractSignatures.organizationId }).from(contractSignatures).where(eq(contractSignatures.versionId, v.id))).map((x) => x.o));
      const both = orgsSigned.has(c.issuerOrgId) && orgsSigned.has(c.counterpartyOrgId);
      const u = await this.svc.set(ctx, c, both ? 'executed' : 'partially_signed', undefined, both ? { executedAt: new Date() } : {}, tx as unknown as Db);
      if (both && c.supersedesId) {
        const [old] = await tx.select().from(contracts).where(eq(contracts.id, c.supersedesId)).limit(1);
        if (old && !CLOSED.includes(old.status as ContractState)) await this.svc.set(ctx, old, 'superseded', `Superseded by ${c.code}`, { supersededById: c.id }, tx as unknown as Db);
      }
      return u;
    });
    await this.audit.record(ctx, { action: 'contract.signed', objectType: 'contract', objectId: id, after: { versionId: v.id, bodyHash: v.bodyHash, organizationId: ctx.orgId, typedName: b.typedName } });
    const other = ctx.orgId === c.issuerOrgId ? c.counterpartyOrgId : c.issuerOrgId;
    await this.svc.notifyOrg(other, out.status === 'executed' ? `Executed: ${c.code}` : `Signed by the other party: ${c.code}`, out.status === 'executed' ? `${c.title} is fully signed.` : `${c.title} is waiting for your signature.`, `/vault?contract=${id}`);
    return this.svc.view(ctx, out);
  }

  /** Amendment: a new draft contract that supersedes this one once it is executed. The original stays valid until then. */
  @Post('contracts/:id/amend')
  @HttpCode(201)
  async amend(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.svc.load(ctx, id);
    if (!this.svc.canManage(ctx, c)) throw new ForbiddenException('Only the issuing organization’s contract managers can amend');
    if (!['approved', 'partially_signed', 'executed'].includes(c.status) || c.supersededById) throw new ConflictException('Only approved or executed contracts can be amended');
    const pending = await this.db.select({ id: contracts.id }).from(contracts).where(and(eq(contracts.supersedesId, id), notInArray(contracts.status, CLOSED))).limit(1);
    if (pending.length) throw new ConflictException('An amendment is already in progress for this contract');
    const v = (await this.svc.approved(id))!;
    const code = `CTR-${new Date().getUTCFullYear()}-${randomDigits(6)}`;
    const text = v.body.replace(c.code, `${code} (amends ${c.code})`);
    const n = await this.db.transaction(async (tx) => {
      const [n] = await tx.insert(contracts).values({ code, kind: c.kind, title: `${c.title} — Amendment`, issuerOrgId: c.issuerOrgId, counterpartyOrgId: c.counterpartyOrgId, tenderId: c.tenderId, bidId: c.bidId, value: c.value, currency: c.currency, supersedesId: c.id, createdBy: ctx.userId }).returning();
      await tx.insert(contractVersions).values({ contractId: n.id, versionNo: 1, body: text, terms: v.terms, bodyHash: sha256(text), changeNote: `Amendment of ${c.code} v${v.versionNo}`, authorUserId: ctx.userId });
      await this.audit.record(ctx, { action: 'contract.amendment_started', objectType: 'contract', objectId: c.id, after: { amendmentId: n.id, code } }, tx as unknown as Db);
      return n;
    });
    return this.svc.view(ctx, n);
  }

  @Post('contracts/:id/terminate')
  @HttpCode(200)
  async terminate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ContractTerminateSchema)) b: z.infer<typeof ContractTerminateSchema>) {
    const c = await this.svc.load(ctx, id);
    if (!this.svc.canManage(ctx, c)) throw new ForbiddenException('Only the issuing organization’s contract managers can terminate');
    const u = await this.svc.set(ctx, c, 'terminated', b.reason, { terminatedAt: new Date(), terminationReason: b.reason });
    await this.svc.notifyOrg(c.counterpartyOrgId, `Terminated: ${c.code}`, b.reason, `/vault?contract=${id}`);
    return this.svc.view(ctx, u);
  }

  /** Plain-text download of one version with its hash, for records and printing. */
  @Get('contracts/:id/versions/:vid/text')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async text(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('vid', ParseUUIDPipe) vid: string, @Res({ passthrough: true }) res: { setHeader: (k: string, v: string) => void }) {
    const c = await this.svc.load(ctx, id);
    const [v] = await this.db.select().from(contractVersions).where(and(eq(contractVersions.id, vid), eq(contractVersions.contractId, id))).limit(1);
    if (!v || (this.svc.party(ctx, c) === 'counterparty' && !v.approvedAt)) throw new NotFoundException();
    res.setHeader('X-Content-SHA256', v.bodyHash);
    res.setHeader('Content-Disposition', `attachment; filename="${c.code}-v${v.versionNo}.txt"`);
    await this.audit.record(ctx, { action: 'contract.downloaded', objectType: 'contract_version', objectId: vid });
    return `${v.body}\n\n---\nVersion ${v.versionNo} · SHA-256 ${v.bodyHash}${v.approvedAt ? ` · approved ${v.approvedAt.toISOString()}` : ' · not approved'}\n`;
  }

  /** 148 — documents & agreements vault for the active organization. */
  @Get('vault')
  async vault(@Ctx() ctx: RequestContext) {
    const org = ctx.orgId!;
    const [agreements, kyb, ndas, certs] = await Promise.all([
      this.db.select({ a: agreementAcceptances, title: agreementTemplates.title, signer: users.fullName }).from(agreementAcceptances)
        .innerJoin(agreementTemplates, and(eq(agreementTemplates.code, agreementAcceptances.templateCode), eq(agreementTemplates.version, agreementAcceptances.version)))
        .innerJoin(users, eq(users.id, agreementAcceptances.userId)).where(eq(agreementAcceptances.organizationId, org)).orderBy(desc(agreementAcceptances.acceptedAt)),
      this.db.select({ id: kybDocuments.id, docType: kybDocuments.docType, fileName: kybDocuments.fileName, status: kybDocuments.status, sha256: kybDocuments.sha256, createdAt: kybDocuments.createdAt }).from(kybDocuments).where(eq(kybDocuments.organizationId, org)).orderBy(desc(kybDocuments.createdAt)),
      this.db.select({ teamId: collaborationTeams.id, name: collaborationTeams.name, code: collaborationTeams.code, ndaHash: collaborationTeams.ndaHash, signedAt: teamMembers.ndaSignedAt, typedName: teamMembers.ndaTypedName }).from(teamMembers)
        .innerJoin(collaborationTeams, eq(collaborationTeams.id, teamMembers.teamId)).where(and(eq(teamMembers.organizationId, org), isNotNull(teamMembers.ndaSignedAt))).orderBy(desc(teamMembers.ndaSignedAt)),
      this.db.select({ id: leadClaims.id, certificateCode: leadClaims.certificateCode, status: leadClaims.status, protectedUntil: leadClaims.protectedUntil, evidenceHash: leadClaims.evidenceHash, title: opportunities.title }).from(leadClaims)
        .innerJoin(opportunities, eq(opportunities.id, leadClaims.opportunityId)).where(eq(leadClaims.introducerOrgId, org)).orderBy(desc(leadClaims.createdAt)),
    ]);
    return {
      contracts: await this.list(ctx),
      agreements: agreements.map((r) => ({ id: r.a.id, title: r.title, code: r.a.templateCode, version: r.a.version, typedName: r.a.typedName, signer: r.signer, docHash: r.a.docHash, acceptedAt: r.a.acceptedAt })),
      verification: kyb,
      ndas,
      certificates: certs.map((c) => ({ ...c, verifyPath: `/verify-certificate?code=${c.certificateCode}` })),
    };
  }
}

@Module({ controllers: [ContractsController], providers: [ContractsService] })
export class ContractsModule {}
