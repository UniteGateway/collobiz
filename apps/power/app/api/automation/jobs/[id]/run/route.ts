import { audit, HttpError, requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { runJob } from '@/lib/automation';

export const maxDuration = 180;
/** Analyst or admin: run a job now. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireRole('analyst');
  const { id } = await ctx.params;
  const run = await runJob(id);
  if (!run) throw new HttpError(404, 'Job not found');
  await audit(s, 'automation.run', 'automationJob', id, undefined, { status: run.status });
  return run;
});
