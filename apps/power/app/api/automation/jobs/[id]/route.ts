import { z } from 'zod';
import { audit, HttpError, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';

/** Admin: turn a job on or off. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireRole('admin');
  const { id } = await ctx.params;
  const b = z.object({ enabled: z.boolean() }).parse(await req.json());
  const job = await db.automationJob.findUnique({ where: { id } });
  if (!job) throw new HttpError(404, 'Job not found');
  const u = await db.automationJob.update({ where: { id }, data: { enabled: b.enabled } });
  await audit(s, b.enabled ? 'automation.enabled' : 'automation.disabled', 'automationJob', id, { enabled: job.enabled }, { enabled: b.enabled });
  return u;
});
