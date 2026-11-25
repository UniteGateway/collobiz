import { and, eq, inArray, sql } from 'drizzle-orm';
import { ceRatingSummary } from '@collabiz/types';
import type { Db } from '../../db/client';
import { ceRatings } from '../../db/schema';

/** Average stars per organization for one role ('company' = as paying company, 'earner' = as member). Real ratings only. */
export async function ratingsFor(db: Db, orgIds: string[], role: 'company' | 'earner') {
  const ids = [...new Set(orgIds)];
  if (!ids.length) return new Map<string, { avg: number; count: number }>();
  const rows = await db.select({ org: ceRatings.toOrgId, stars: sql<number[]>`array_agg(${ceRatings.stars})` }).from(ceRatings).where(and(inArray(ceRatings.toOrgId, ids), eq(ceRatings.asRole, role))).groupBy(ceRatings.toOrgId);
  return new Map(rows.map((r) => [r.org, ceRatingSummary(r.stars.map(Number))!]));
}
