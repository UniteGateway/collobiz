import { timingSafeEqual } from 'node:crypto';
import { HttpError } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';
import { ensureJobs, isDue, runJob } from '@/lib/automation';

export const maxDuration = 300;
/** For an external scheduler: runs every enabled job that is due. Needs `Authorization: Bearer $AUTOMATION_TOKEN`. */
export const POST = handle(async (req: Request) => {
  const token = process.env.AUTOMATION_TOKEN;
  if (!token) throw new HttpError(503, 'Scheduled automation is not configured (AUTOMATION_TOKEN is not set)');
  const got = Buffer.from((req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(token);
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(401, 'Invalid token');
  await ensureJobs();
  const due = (await db.automationJob.findMany()).filter((j) => isDue(j));
  const ran = [];
  for (const j of due) { const r = await runJob(j.id); ran.push({ job: j.name, status: r?.status }); }
  return { ran };
});
