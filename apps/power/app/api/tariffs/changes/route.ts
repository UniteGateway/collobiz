import { z } from 'zod';
import { audit, HttpError, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';

export const ProposedSchema = z.object({
  key: z.string().min(3).max(80),
  value: z.number().finite().min(0),
  provenance: z.enum(['verified', 'user']),
  orderTitle: z.string().trim().min(3).max(300),
  orderUrl: z.string().url().max(500).optional().or(z.literal('')),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  notes: z.string().max(1000).optional(),
}).refine((x) => x.provenance !== 'verified' || !!x.orderUrl, { message: 'A verified value needs the link to the official order', path: ['orderUrl'] });

export const GET = handle(async () => {
  await requireRole('viewer');
  return { changes: await db.regulatoryChange.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }) };
});

/** Propose a change to a tariff record. It takes effect only after an admin approves it. */
export const POST = handle(async (req: Request) => {
  const s = await requireRole('analyst');
  const b = ProposedSchema.parse(await req.json());
  const existing = await db.tariffRecord.findFirst({ where: { key: b.key }, orderBy: { version: 'desc' } });
  if (!existing) throw new HttpError(404, `No tariff record with key ${b.key}`);
  const c = await db.regulatoryChange.create({ data: { key: b.key, proposed: { ...b, previousValue: existing.value, previousVersion: existing.version }, sourceTitle: b.orderTitle, sourceUrl: b.orderUrl || null, detectedBy: 'user' } });
  await audit(s, 'tariff.change_proposed', 'regulatoryChange', c.id, { value: existing.value }, b);
  return c;
});
