import { HttpError, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireRole('viewer');
  const r = await db.hybridCombinationRun.findUnique({ where: { id: (await ctx.params).id } });
  if (!r) throw new HttpError(404, 'Run not found');
  return r;
});
