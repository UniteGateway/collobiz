import { ForbiddenException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Db } from '../../db/client';
import { memberships, notifications } from '../../db/schema';
import type { RequestContext } from '../../common/context';

export const today = () => new Date().toISOString().slice(0, 10);
export const isManager = (ctx: RequestContext, org: string) => ctx.memberships.some((m) => m.organizationId === org && ['org_owner', 'org_admin'].includes(m.role));
export function mustBeVerified(ctx: RequestContext, what: string) {
  if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException(`Complete your business verification (KYB) before you ${what}`);
}
export async function notifyOrg(db: Db, orgId: string, kind: string, title: string, body: string, link: string) {
  const ms = await db.selectDistinct({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active'), inArray(memberships.role, ['org_owner', 'org_admin', 'unite_admin'])));
  if (ms.length) await db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind, title, body, link })));
}
/** Sequential human-readable codes, e.g. MIC-2026-300001. */
export async function nextCode(db: Db, table: PgTable, prefix: string, base: number) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return `${prefix}-${new Date().getFullYear()}-${String(base + Number(n) + 1).padStart(6, '0')}`;
}
