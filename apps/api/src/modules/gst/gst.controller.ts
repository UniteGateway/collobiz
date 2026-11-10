/**
 * GST documents (tested in test/gst.e2e.ts): company tax profile, GSTIN checks, and e-invoice / e-way bill JSON prepared from
 * COLLABIZ project invoices and purchase orders. COLLABIZ validates against the portals' published rules and lets the
 * business download the JSON to upload on the government portal. Filing through a GSP — and so any IRN or e-way bill
 * number — is not connected (blocker: gst_filing); COLLABIZ never shows a number it did not receive from the government system.
 */
import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { GST_STATE_CODES, GstPrepareSchema, TaxProfileSchema, buildEInvoice, buildEwayBill, isValidGstin, isValidPan, panOfGstin, type GstDoc, type GstParty } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { gstDocuments, organizations, partnerProfiles, projectInvoices, projects, purchaseOrders, taxProfiles } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { sha256 } from '../../common/crypto';
import { PROVIDERS, providerConnected, providerStatus, requireProvider } from '../../common/providers';

const manager = (ctx: RequestContext, orgId: string) => ctx.memberships.some((m) => m.organizationId === orgId && (m.role === 'org_owner' || m.role === 'org_admin'));
const member = (ctx: RequestContext, orgId: string) => ctx.memberships.some((m) => m.organizationId === orgId);
type PoLine = { item: string; quantity: number; unit: string; unitPrice: number };

@ApiTags('gst')
@Controller()
export class GstController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private myOrg(ctx: RequestContext, write = false) {
    if (!ctx.orgId || !(write ? manager(ctx, ctx.orgId) : member(ctx, ctx.orgId))) throw new ForbiddenException(write ? 'A company owner or admin manages tax details' : 'Choose your company first');
    return ctx.orgId;
  }

  // ---------- Tax profile and GSTIN checks ----------
  @Get('tax/profile')
  async profile(@Ctx() ctx: RequestContext) {
    const orgId = this.myOrg(ctx);
    const [p] = await this.db.select().from(taxProfiles).where(eq(taxProfiles.orgId, orgId));
    if (p) return { ...p, state: GST_STATE_CODES[p.stateCode], saved: true };
    const [o] = await this.db.select().from(organizations).where(eq(organizations.id, orgId));
    const [pp] = await this.db.select({ gstin: partnerProfiles.gstin }).from(partnerProfiles).where(eq(partnerProfiles.organizationId, orgId));
    return { saved: false, gstin: pp?.gstin ?? '', legalName: o?.legalName ?? '', tradeName: o?.displayName ?? '', address1: '', address2: '', city: o?.city ?? '', pincode: '', einvoiceApplicable: false };
  }

  @Put('tax/profile')
  async saveProfile(@Ctx() ctx: RequestContext, @Body(body(TaxProfileSchema)) b: z.infer<typeof TaxProfileSchema>) {
    const orgId = this.myOrg(ctx, true);
    const stateCode = b.gstin.slice(0, 2);
    const v = { ...b, tradeName: b.tradeName || null, address2: b.address2 || null, udyamNumber: b.udyamNumber || null, stateCode, updatedBy: ctx.userId, updatedAt: new Date() };
    await this.db.insert(taxProfiles).values({ orgId, ...v }).onConflictDoUpdate({ target: taxProfiles.orgId, set: v });
    await this.audit.record(ctx, { action: 'tax.profile_saved', objectType: 'organization', objectId: orgId, after: { gstin: b.gstin, stateCode, einvoiceApplicable: b.einvoiceApplicable } });
    return { ...v, state: GST_STATE_CODES[stateCode], saved: true };
  }

  /** Local checks only (format, check digit, state, embedded PAN). Whether the registration is active needs a live lookup. */
  @Get('tax/gstin/:gstin')
  check(@Param('gstin') raw: string) {
    const g = raw.trim().toUpperCase();
    const valid = isValidGstin(g);
    return { gstin: g, valid, state: valid ? GST_STATE_CODES[g.slice(0, 2)] ?? null : null, pan: valid ? panOfGstin(g) : null, panValid: valid && isValidPan(panOfGstin(g)),
      live: { connected: providerConnected('gstin_lookup'), note: PROVIDERS.gstin_lookup.manual } };
  }

  @Get('integrations')
  integrations() { return providerStatus(); }

  // ---------- Documents ----------
  /** What this company can prepare GST documents for: invoices it issued and purchase orders it supplies. */
  @Get('gst/sources')
  async sources(@Ctx() ctx: RequestContext) {
    const orgId = this.myOrg(ctx);
    const invs = await this.db.select({ i: projectInvoices, p: projects }).from(projectInvoices).innerJoin(projects, eq(projects.id, projectInvoices.projectId)).where(eq(projectInvoices.issuedByOrgId, orgId)).orderBy(desc(projectInvoices.issuedAt)).limit(100);
    const pos = await this.db.select().from(purchaseOrders).where(and(eq(purchaseOrders.supplierOrgId, orgId), notInArray(purchaseOrders.status, ['draft', 'cancelled']))).orderBy(desc(purchaseOrders.createdAt)).limit(100);
    const buyers = [...invs.map((x) => x.p.ownerOrgId), ...pos.map((p) => p.buyerOrgId)];
    const names = buyers.length ? await this.db.select({ id: organizations.id, n: organizations.displayName }).from(organizations).where(inArray(organizations.id, buyers)) : [];
    const docs = await this.db.select({ id: gstDocuments.id, kind: gstDocuments.kind, sourceId: gstDocuments.sourceId, ready: gstDocuments.ready, createdAt: gstDocuments.createdAt }).from(gstDocuments).where(eq(gstDocuments.orgId, orgId)).orderBy(desc(gstDocuments.createdAt));
    const [tp] = await this.db.select().from(taxProfiles).where(eq(taxProfiles.orgId, orgId));
    const buyerTp = buyers.length ? await this.db.select({ orgId: taxProfiles.orgId }).from(taxProfiles).where(inArray(taxProfiles.orgId, buyers)) : [];
    const n = (id: string) => names.find((x) => x.id === id)?.n ?? '—';
    const latest = (sid: string) => ({ einvoice: docs.find((d) => d.sourceId === sid && d.kind === 'einvoice') ?? null, ewaybill: docs.find((d) => d.sourceId === sid && d.kind === 'ewaybill') ?? null });
    return {
      profileReady: !!tp, einvoiceApplicable: tp?.einvoiceApplicable ?? false, filing: { connected: providerConnected('gst_filing'), note: PROVIDERS.gst_filing.manual },
      items: [
        ...invs.map(({ i, p }) => ({ source: 'project_invoice', id: i.id, number: i.number, date: i.issuedAt, buyer: n(p.ownerOrgId), buyerProfile: buyerTp.some((x) => x.orgId === p.ownerOrgId), taxable: i.amount, kind: 'services', description: `${p.code} — ${p.title}`, lines: [{ description: `${p.title} — milestone invoice ${i.number}`, qty: 1, unit: 'OTH', unitPrice: i.amount, isService: true }], ...latest(i.id) })),
        ...pos.map((po) => ({ source: 'purchase_order', id: po.id, number: po.number, date: po.createdAt, buyer: n(po.buyerOrgId), buyerProfile: buyerTp.some((x) => x.orgId === po.buyerOrgId), taxable: po.subtotal, gstRate: po.taxPct, kind: 'goods', description: po.deliveryAddress, lines: (po.lines as PoLine[]).map((l) => ({ description: l.item, qty: l.quantity, unit: l.unit, unitPrice: l.unitPrice, isService: false })), ...latest(po.id) })),
      ],
    };
  }

  private async party(orgId: string): Promise<GstParty | null> {
    const [t] = await this.db.select().from(taxProfiles).where(eq(taxProfiles.orgId, orgId));
    return t ? { gstin: t.gstin, legalName: t.legalName, tradeName: t.tradeName, address1: t.address1, address2: t.address2, city: t.city, pincode: t.pincode, stateCode: t.stateCode } : null;
  }

  @Post('gst/prepare')
  @HttpCode(201)
  async prepare(@Ctx() ctx: RequestContext, @Body(body(GstPrepareSchema)) b: z.infer<typeof GstPrepareSchema>) {
    const orgId = this.myOrg(ctx, true);
    const seller = await this.party(orgId);
    if (!seller) throw new BadRequestException('Save your company’s tax profile (GSTIN and registered address) first');
    let buyerOrg: string, number: string, date: Date, taxable: number;
    if (b.source === 'project_invoice') {
      const [r] = await this.db.select({ i: projectInvoices, p: projects }).from(projectInvoices).innerJoin(projects, eq(projects.id, projectInvoices.projectId)).where(eq(projectInvoices.id, b.sourceId));
      if (!r || r.i.issuedByOrgId !== orgId) throw new NotFoundException('Invoice not found');
      buyerOrg = r.p.ownerOrgId; number = r.i.number; date = r.i.issuedAt; taxable = r.i.amount;
    } else {
      const [po] = await this.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, b.sourceId));
      if (!po || po.supplierOrgId !== orgId) throw new NotFoundException('Purchase order not found');
      buyerOrg = po.buyerOrgId; number = po.number; date = po.createdAt; taxable = po.subtotal;
    }
    // The lines must add up to the document COLLABIZ already holds — the GST document cannot quietly change the amount.
    const sum = b.lines.reduce((a, l) => a + Math.round(l.qty * l.unitPrice), 0);
    if (Math.abs(sum - taxable) > 100) throw new BadRequestException(`The lines add up to ₹${(sum / 100).toLocaleString('en-IN')} but the ${b.source === 'project_invoice' ? 'invoice' : 'order'} is ₹${(taxable / 100).toLocaleString('en-IN')} before GST`);
    let buyer = await this.party(buyerOrg);
    if (!buyer) {
      const [o] = await this.db.select().from(organizations).where(eq(organizations.id, buyerOrg));
      const [pp] = await this.db.select({ gstin: partnerProfiles.gstin }).from(partnerProfiles).where(eq(partnerProfiles.organizationId, buyerOrg));
      if (!b.buyer) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { buyer: 'The buyer has no tax profile — give their billing address and PIN code' } });
      const g = pp?.gstin?.toUpperCase() ?? null;
      buyer = { gstin: g, legalName: o.legalName, tradeName: o.displayName, address1: b.buyer.address1, city: b.buyer.city, pincode: b.buyer.pincode, stateCode: g?.slice(0, 2) ?? b.placeOfSupply ?? seller.stateCode };
    }
    const doc: GstDoc = { type: 'INV', number, date: date.toISOString().slice(0, 10), seller, buyer, placeOfSupply: b.placeOfSupply, lines: b.lines };
    const r = b.kind === 'einvoice' ? buildEInvoice(doc) : buildEwayBill(doc, b.transport ?? { mode: 1, distanceKm: 0 });
    const [d] = await this.db.insert(gstDocuments).values({ orgId, kind: b.kind, sourceType: b.source, sourceId: b.sourceId, docNo: number, payload: r.payload, payloadHash: sha256(JSON.stringify(r.payload)), issues: r.issues, ready: r.ready, totalValue: r.totals.total, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: `gst.${b.kind}_prepared`, objectType: b.source, objectId: b.sourceId, after: { doc: d.id, ready: r.ready, issues: r.issues.length, total: r.totals.total } });
    return { id: d.id, ready: r.ready, issues: r.issues, totals: { taxable: r.totals.taxable, cgst: r.totals.cgst, sgst: r.totals.sgst, igst: r.totals.igst, total: r.totals.total, interState: r.totals.inter, placeOfSupply: r.totals.pos },
      ...('validityDays' in r ? { validityDays: r.validityDays, belowThreshold: r.belowThreshold } : {}), filing: { connected: providerConnected('gst_filing'), note: PROVIDERS.gst_filing.manual } };
  }

  @Get('gst/documents/:id/json')
  async json(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const orgId = this.myOrg(ctx);
    const [d] = await this.db.select().from(gstDocuments).where(and(eq(gstDocuments.id, id), eq(gstDocuments.orgId, orgId)));
    if (!d) throw new NotFoundException('Document not found');
    if (!d.ready) throw new BadRequestException('Fix the listed problems and prepare it again before downloading');
    return d.payload;
  }

  @Post('gst/documents/:id/file')
  @HttpCode(200)
  async file(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const orgId = this.myOrg(ctx, true);
    const [d] = await this.db.select().from(gstDocuments).where(and(eq(gstDocuments.id, id), eq(gstDocuments.orgId, orgId)));
    if (!d) throw new NotFoundException('Document not found');
    return requireProvider('gst_filing');
  }
}

@Module({ controllers: [GstController] })
export class GstModule {}
