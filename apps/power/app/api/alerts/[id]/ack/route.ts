import { audit, HttpError, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireRole('analyst');
  const { id } = await ctx.params;
  const a = await db.alert.findUnique({ where: { id } });
  if (!a) throw new HttpError(404, 'Alert not found');
  if (a.acknowledgedAt) return a;
  const u = await db.alert.update({ where: { id }, data: { acknowledgedAt: new Date() } });
  await audit(s, 'alert.acknowledged', 'alert', id);
  return u;
});
