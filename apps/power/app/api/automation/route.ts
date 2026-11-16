import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';
import { JOB_KINDS, ensureJobs, isDue } from '@/lib/automation';

/** Jobs with their schedule and last run, recent runs, and open alerts first. */
export const GET = handle(async () => {
  await requireRole('viewer');
  await ensureJobs();
  const [jobs, runs, alerts] = await Promise.all([
    db.automationJob.findMany({ orderBy: { createdAt: 'asc' } }),
    db.automationRun.findMany({ orderBy: { startedAt: 'desc' }, take: 30, include: { job: { select: { name: true } } } }),
    db.alert.findMany({ orderBy: [{ acknowledgedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }], take: 50 }),
  ]);
  return {
    jobs: jobs.map((j) => ({ ...j, what: JOB_KINDS[j.kind as keyof typeof JOB_KINDS]?.what ?? '', due: isDue(j) })),
    runs: runs.map((r) => ({ id: r.id, job: r.job.name, status: r.status, output: r.output, error: r.error, startedAt: r.startedAt, finishedAt: r.finishedAt })),
    alerts, schedulerConfigured: !!process.env.AUTOMATION_TOKEN,
  };
});
