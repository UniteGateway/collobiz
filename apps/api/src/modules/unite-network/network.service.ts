/**
 * Shared logic for the Unite Solar Franchise Network (franchises and store partners). Packages are administrator-configured
 * and versioned; an application keeps the version it was priced with. Every money figure is computed here, on the server.
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { DEFAULT_PACKAGES, type PackageConfig } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  franchisePackages, franchiseUnits, groupCompanies, inventoryMovements, memberships, networkCommissions, notifications, partnerEntitlements, solarProducts, storeInventory,
} from '../../db/schema';
import type { RequestContext } from '../../common/context';

export type Unit = typeof franchiseUnits.$inferSelect;
export type Commission = typeof networkCommissions.$inferSelect;
export const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
export const financeRole = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'finance');
export const complianceRole = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'compliance');
export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso: string, d: number) => { const x = new Date(`${iso}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
export const addYears = (iso: string, y: number) => { const x = new Date(`${iso}T00:00:00Z`); x.setUTCFullYear(x.getUTCFullYear() + y); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
export const bad = (path: string, message: string) => new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: [{ path, message }] });
export const hist = (by: string, to: string, note?: string | null) => sql`history || ${JSON.stringify([{ at: new Date().toISOString(), by, to, status: to, note: note ?? null }])}::jsonb`;

@Injectable()
export class NetworkService {
  constructor(@InjectDb() private db: Db) {}

  /** Current (active) version of every package. The starting set supplied by Unite is stored on first use. */
  async packages(): Promise<(PackageConfig & { version: number })[]> {
    let rows = await this.db.select().from(franchisePackages).where(eq(franchisePackages.active, true)).orderBy(franchisePackages.code);
    if (!rows.length) {
      await this.db.insert(franchisePackages).values(DEFAULT_PACKAGES.map((c) => ({ code: c.code, version: 1, config: c }))).onConflictDoNothing();
      rows = await this.db.select().from(franchisePackages).where(eq(franchisePackages.active, true));
    }
    const order = DEFAULT_PACKAGES.map((p) => p.code as string);
    return rows.map((r) => ({ ...(r.config as PackageConfig), version: r.version })).sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
  }
  async pkg(code: string, version?: number | null) {
    await this.packages();
    const [r] = await this.db.select().from(franchisePackages).where(version ? and(eq(franchisePackages.code, code), eq(franchisePackages.version, version)) : and(eq(franchisePackages.code, code), eq(franchisePackages.active, true))).limit(1);
    if (!r) throw new NotFoundException('Package not found');
    return { ...(r.config as PackageConfig), version: r.version };
  }
  /** The franchisor: the Unite Solar group company (the first franchise-open group company if it is renamed). */
  async brandOrgId() {
    const [u] = await this.db.select({ id: groupCompanies.organizationId }).from(groupCompanies).where(ilike(groupCompanies.brandName, 'unite solar')).limit(1);
    if (u) return u.id;
    const [f] = await this.db.select({ id: groupCompanies.organizationId }).from(groupCompanies).where(eq(groupCompanies.franchiseOpen, true)).limit(1);
    if (!f) throw new ConflictException('Unite Solar is not set up as a group company yet');
    return f.id;
  }
  async unit(id: string) {
    const [u] = await this.db.select().from(franchiseUnits).where(eq(franchiseUnits.id, id)).limit(1);
    if (!u || !u.packageCode) throw new NotFoundException('Partner record not found');
    return u;
  }
  /** A network unit the caller's organisation owns, or any unit for staff. */
  async ownUnit(ctx: RequestContext, id: string) {
    const u = await this.unit(id);
    if (u.franchiseeOrgId !== ctx.orgId && !staff(ctx)) throw new NotFoundException('Partner record not found');
    return u;
  }
  async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const ms = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'announcement', title, body: text, link })));
  }
  async notifyStaff(title: string, text: string, link: string) {
    const ms = await this.db.selectDistinct({ u: memberships.userId }).from(memberships).where(and(inArray(memberships.role, ['unite_admin', 'super_admin']), eq(memberships.status, 'active')));
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'announcement', title, body: text, link })));
  }

  /** LeadDNA access is decided here only: an active entitlement from the District package, a verified add-on or an admin grant. */
  async leadDnaEntitlement(orgId: string | null) {
    if (!orgId) return null;
    const [e] = await this.db.select().from(partnerEntitlements).where(and(eq(partnerEntitlements.orgId, orgId), eq(partnerEntitlements.product, 'leaddna'), eq(partnerEntitlements.status, 'active'),
      sql`${partnerEntitlements.validFrom} <= ${today()}`, sql`(${partnerEntitlements.validTo} is null or ${partnerEntitlements.validTo} >= ${today()})`)).orderBy(desc(partnerEntitlements.createdAt)).limit(1);
    return e ?? null;
  }

  /**
   * Changes on-hand stock with a journal entry in the same transaction. The row is locked first, so two sales cannot both
   * take the last unit; stock can never go below zero (checked here and by a database constraint).
   */
  async move(tx: Db, p: { unitId: string; productId: string; delta: number; kind: string; unitCost: number; reference: string; userId: string; serials?: string[]; note?: string | null }) {
    await tx.insert(storeInventory).values({ unitId: p.unitId, productId: p.productId, qty: 0, value: 0 }).onConflictDoNothing();
    const [row] = await tx.select().from(storeInventory).where(and(eq(storeInventory.unitId, p.unitId), eq(storeInventory.productId, p.productId))).for('update');
    if (row.qty + p.delta < 0) {
      const [pr] = await tx.select({ name: solarProducts.name }).from(solarProducts).where(eq(solarProducts.id, p.productId));
      throw new ConflictException(`Not enough stock of ${pr?.name ?? 'this product'}: ${row.qty} on hand, ${-p.delta} needed`);
    }
    const qty = row.qty + p.delta;
    const value = qty === 0 ? 0 : Math.max(0, row.value + p.delta * p.unitCost);
    await tx.update(storeInventory).set({ qty, value, updatedAt: new Date() }).where(and(eq(storeInventory.unitId, p.unitId), eq(storeInventory.productId, p.productId)));
    await tx.insert(inventoryMovements).values({ unitId: p.unitId, productId: p.productId, kind: p.kind, qty: p.delta, unitCost: p.unitCost, reference: p.reference, serials: p.serials ?? [], note: p.note ?? null, createdBy: p.userId });
    return qty;
  }

  /** When an entry may move to "qualified": the facts that make it payable are verified. */
  qualifyBlocker(c: Commission, order?: { paymentVerified: boolean; fulfilmentStatus: string | null; status: string } | null) {
    const i = c.inputs as Record<string, unknown>;
    if (c.stream === 'product') {
      if (!order) return 'The order is missing';
      if (order.status === 'cancelled') return 'The order was cancelled';
      if (!order.paymentVerified) return 'Customer payment has not been verified';
      if (order.fulfilmentStatus !== 'accepted') return 'The customer has not accepted delivery / installation';
    }
    if (c.stream === 'inter_franchise' && !i.paymentVerified) return 'Project payment has not been verified';
    if (c.stream === 'investment' && c.compliance !== 'cleared') return 'Compliance has not cleared this investment';
    return null;
  }
}
