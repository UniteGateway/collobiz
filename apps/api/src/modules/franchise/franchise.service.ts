/** Shared franchise unit loading and the unit view used by both franchise controllers. */
import { Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { FRANCHISE_CHECKLIST, FRANCHISE_NEXT } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { franchiseReports, franchiseUnits, organizations } from '../../db/schema';

const thisMonth = () => new Date().toISOString().slice(0, 7);

@Injectable()
export class FranchiseService {
  constructor(@InjectDb() private db: Db) {}
  async unit(id: string) {
    const [u] = await this.db.select().from(franchiseUnits).where(eq(franchiseUnits.id, id)).limit(1);
    if (!u) throw new NotFoundException('Franchise not found');
    return u;
  }
  async view(ids?: string[]) {
    const brand = sql<string>`(select display_name from organizations o where o.id = ${franchiseUnits.brandOrgId})`;
    const rows = await this.db.select({ u: franchiseUnits, brand, franchisee: organizations.displayName }).from(franchiseUnits).innerJoin(organizations, eq(organizations.id, franchiseUnits.franchiseeOrgId))
      .where(ids ? inArray(franchiseUnits.id, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']) : undefined).orderBy(desc(franchiseUnits.updatedAt));
    const reports = rows.length ? await this.db.select().from(franchiseReports).where(inArray(franchiseReports.unitId, rows.map((r) => r.u.id))).orderBy(desc(franchiseReports.month)) : [];
    return rows.map(({ u, brand, franchisee }) => {
      const reps = reports.filter((r) => r.unitId === u.id);
      const done = u.checklist as Record<string, string>;
      return {
        id: u.id, code: u.code, brand, franchisee, franchiseeOrgId: u.franchiseeOrgId, brandOrgId: u.brandOrgId, format: u.format, city: u.city, region: u.region, message: u.message, status: u.status,
        fee: u.fee, royaltyBps: u.royaltyBps, monthlyTarget: u.monthlyTarget, decisionNote: u.decisionNote, openedAt: u.openedAt, createdAt: u.createdAt, next: FRANCHISE_NEXT[u.status] ?? [],
        checklist: FRANCHISE_CHECKLIST.map(([key, label]) => ({ key, label, doneAt: done[key] ?? null })),
        reports: reps.map((r) => ({ month: r.month, sales: r.sales, orders: r.orders, royalty: r.royalty, notes: r.notes })),
        salesThisMonth: reps.find((r) => r.month === thisMonth())?.sales ?? 0, royaltyTotal: reps.reduce((a, r) => a + r.royalty, 0), salesTotal: reps.reduce((a, r) => a + r.sales, 0),
      };
    });
  }
}

