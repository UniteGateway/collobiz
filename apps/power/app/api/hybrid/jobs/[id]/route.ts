import { HttpError, requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { getJob } from '@/lib/hybrid';

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireRole('viewer');
  const j = getJob((await ctx.params).id);
  if (!j) throw new HttpError(404, 'Job not found (the server may have restarted) — start it again');
  return { ...j, elapsedMs: Date.now() - j.startedAt };
});
