import { POLICY_SOURCES, STATES, current } from '@unite/power-engine';
import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { approvedTariffs } from '@/lib/tariffs';

/** Regulatory source register plus the charge records in force today by state, with provenance. Nothing is silently zero. */
export const GET = handle(async () => {
  await requireRole('viewer');
  const recs = current(await approvedTariffs(), new Date().toISOString().slice(0, 10));
  return { sources: POLICY_SOURCES, states: STATES, charges: recs.map((r) => ({ key: r.key, jurisdiction: r.jurisdiction, chargeType: r.chargeType, value: r.value, unit: r.unit, provenance: r.provenance, orderTitle: r.orderTitle, orderUrl: r.orderUrl, effectiveFrom: r.effectiveFrom, version: r.version, waiver: r.waiver })) };
});
