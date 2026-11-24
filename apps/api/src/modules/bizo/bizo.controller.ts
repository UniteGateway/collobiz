/**
 * BIZO (bizo.one) ↔ COLLABIZ — lead exchange by file until BIZO's public API launches (tested in test/bizo.e2e.ts).
 *  - Into COLLABIZ: members export leads from BIZO and import them with the existing customer import (mapping, checks,
 *    duplicates skipped, consent basis recorded).
 *  - Out of COLLABIZ: the owner or an admin downloads their own customers in a BIZO-ready CSV. Contacts marked
 *    "restricted" (own records without outreach consent) go out WITHOUT personal contact details, because BIZO is
 *    used for outreach. Every export is audited.
 */
import { Controller, ForbiddenException, Get, Header, Module, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq } from 'drizzle-orm';
import { InjectDb, type Db } from '../../db/client';
import { auditEvents, customers } from '../../db/schema';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';

export const BIZO_COLUMNS = ['Company', 'Contact Name', 'Email', 'Phone', 'City', 'Country', 'Tax ID', 'Source', 'Notes'] as const;
const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  // Quote, and neutralise spreadsheet formulas (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(s) && !/^\+[\d\s()-]+$/.test(s) ? `'${s}` : s; // a plain phone number (+91 …) is not a formula
  return /[",\n\r]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
};

@ApiTags('bizo')
@Controller('bizo')
export class BizoController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private manager(ctx: RequestContext) {
    const orgId = ctx.orgId!;
    if (!ctx.memberships.some((m) => m.organizationId === orgId && (m.role === 'org_owner' || m.role === 'org_admin'))) throw new ForbiddenException('The owner or an admin of your business exports customers');
    return orgId;
  }

  @Get('status')
  @RequireOrg()
  async status(@Ctx() ctx: RequestContext) {
    const orgId = ctx.orgId!;
    const rows = await this.db.select({ restricted: customers.restrictedContacts }).from(customers).where(eq(customers.organizationId, orgId));
    const [last] = await this.db.select({ at: auditEvents.at }).from(auditEvents).where(and(eq(auditEvents.organizationId, orgId), eq(auditEvents.action, 'bizo.customers_exported'))).orderBy(desc(auditEvents.seq)).limit(1);
    return { customers: rows.length, restricted: rows.filter((r) => r.restricted).length, lastExportAt: last?.at ?? null, canExport: ctx.memberships.some((m) => m.organizationId === orgId && (m.role === 'org_owner' || m.role === 'org_admin')), columns: BIZO_COLUMNS };
  }

  @Get('export.csv')
  @RequireOrg()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@Ctx() ctx: RequestContext, @Res({ passthrough: true }) res: { setHeader: (k: string, v: string) => void }) {
    const orgId = this.manager(ctx);
    const rows = await this.db.select().from(customers).where(eq(customers.organizationId, orgId)).orderBy(customers.legalName);
    const lines = [BIZO_COLUMNS.join(',')];
    let withheld = 0;
    for (const c of rows) {
      const r = c.restrictedContacts;
      if (r) withheld++;
      lines.push([c.legalName, r ? '' : c.contactName, r ? '' : c.contactEmail, r ? '' : c.contactPhone, c.city, c.country, c.taxId, 'COLLABIZ CRM', r ? 'Contact details withheld: no outreach consent recorded in COLLABIZ' : ''].map(cell).join(','));
    }
    await this.audit.record(ctx, { action: 'bizo.customers_exported', objectType: 'organization', objectId: orgId, after: { rows: rows.length, contactsWithheld: withheld } });
    res.setHeader('Content-Disposition', `attachment; filename="collabiz-customers-for-bizo-${new Date().toISOString().slice(0, 10)}.csv"`);
    return '﻿' + lines.join('\r\n') + '\r\n';
  }
}

@Module({ controllers: [BizoController] })
export class BizoModule {}
