import { z } from 'zod';
import { audit, HttpError, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';

const d = (s?: string) => (s ? new Date(`${s}T00:00:00Z`) : null);
/** Admin decision on a proposed change. Approval writes a new version of the record and supersedes the previous one. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireRole('admin');
  const { id } = await ctx.params;
  const b = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().max(1000).optional() }).parse(await req.json());
  const c = await db.regulatoryChange.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, 'Change not found');
  if (c.status !== 'pending') throw new HttpError(409, `This change was already ${c.status}`);
  const p = c.proposed as { value: number; provenance: string; orderTitle: string; orderUrl?: string; orderDate?: string; effectiveFrom: string; effectiveTo?: string; notes?: string };
  const result = await db.$transaction(async (tx) => {
    if (b.decision === 'reject') return tx.regulatoryChange.update({ where: { id }, data: { status: 'rejected', reviewer: s.email, reviewNote: b.note, decidedAt: new Date() } });
    const prev = await tx.tariffRecord.findFirst({ where: { key: c.key }, orderBy: { version: 'desc' } });
    if (!prev) throw new HttpError(404, 'The record no longer exists');
    // The previous version stays in force until the new one starts.
    const start = d(p.effectiveFrom)!;
    await tx.tariffRecord.update({ where: { id: prev.id }, data: { status: 'superseded', effectiveTo: prev.effectiveTo && prev.effectiveTo < start ? prev.effectiveTo : new Date(start.getTime() - 86400000) } });
    await tx.tariffRecord.create({ data: {
      key: prev.key, jurisdiction: prev.jurisdiction, chargeType: prev.chargeType, unit: prev.unit, voltageKv: prev.voltageKv, minKv: prev.minKv, maxKv: prev.maxKv, consumerCategory: prev.consumerCategory,
      waiver: prev.waiver ?? undefined, conditions: prev.conditions, value: p.value, provenance: p.provenance, orderTitle: p.orderTitle, orderUrl: p.orderUrl || null, orderDate: d(p.orderDate),
      effectiveFrom: start, effectiveTo: d(p.effectiveTo), version: prev.version + 1, status: 'approved', notes: p.notes ?? null, enteredBy: c.detectedBy, approvedBy: s.email, approvedAt: new Date(),
    } });
    return tx.regulatoryChange.update({ where: { id }, data: { status: 'approved', reviewer: s.email, reviewNote: b.note, decidedAt: new Date() } });
  });
  await audit(s, `tariff.change_${b.decision}d`, 'regulatoryChange', id, undefined, { key: c.key, value: p.value });
  return result;
});
