/**
 * Module 13 — automation. Jobs are stored with a cron schedule (UTC). Each run is recorded with its output, and findings
 * become alerts that a person acknowledges. Jobs run on demand from the Automation page; scheduled runs need an external
 * scheduler to call POST /api/automation/due with the AUTOMATION_TOKEN bearer token (none runs inside the web server).
 *
 * The weather refresh is recorded as skipped: PVGIS and NASA POWER are not reachable from this environment, so the plant
 * keeps running on illustrative climate inputs. Nothing is reported as fetched that was not.
 */
import { db } from './db';
import { financeAnalysis } from './analysis';
import { loadProject, recordRun, runYear, yearView } from './sim';

export const JOB_KINDS = {
  tariff_watch: { name: 'Tariff record check', schedule: '0 1 * * *', what: 'Flags tariff records ending within 60 days, illustrative placeholders still in use, and changes waiting more than 7 days for review.' },
  daily_simulation: { name: 'Re-simulate the year', schedule: '0 2 * * *', what: 'Re-runs the year on the current project and records the result; alerts when the contract is not feasible.' },
  battery_health: { name: 'Battery health forecast', schedule: '0 3 * * 1', what: 'Projects usable battery capacity from this year’s cycling and alerts before augmentation is due.' },
  profitability: { name: 'Profitability check', schedule: '0 4 * * 1', what: 'Recomputes project finance; alerts when project IRR falls below the discount rate or minimum DSCR below 1.20.' },
  weather_update: { name: 'Weather data refresh (PVGIS / NASA POWER)', schedule: '0 5 1 * *', what: 'Would replace illustrative climate inputs with measured data. Blocked: these services are not reachable from this environment.' },
} as const;
export type JobKind = keyof typeof JOB_KINDS;

export async function ensureJobs() {
  const have = new Set((await db.automationJob.findMany({ select: { kind: true } })).map((j) => j.kind));
  const missing = (Object.keys(JOB_KINDS) as JobKind[]).filter((k) => !have.has(k));
  if (missing.length) await db.automationJob.createMany({ data: missing.map((k) => ({ kind: k, name: JOB_KINDS[k].name, schedule: JOB_KINDS[k].schedule, enabled: k !== 'weather_update', config: {} })) });
}

/** How often a cron expression fires, coarsely: a day-of-month means monthly, a day-of-week weekly, otherwise daily. */
export function periodDays(cron: string) {
  const [, , dom, , dow] = cron.trim().split(/\s+/);
  return dom && dom !== '*' ? 30 : dow && dow !== '*' ? 7 : 1;
}
export function isDue(job: { enabled: boolean; schedule: string; lastRunAt: Date | null }, now = new Date()) {
  return job.enabled && (!job.lastRunAt || now.getTime() - job.lastRunAt.getTime() >= periodDays(job.schedule) * 86400000 - 3600000);
}

type Alert = { kind: string; severity: 'info' | 'warning' | 'critical'; message: string };
async function raise(projectId: string | null, alerts: Alert[]) {
  for (const a of alerts) {
    // One open alert per message: repeated runs do not pile up duplicates.
    const open = await db.alert.findFirst({ where: { kind: a.kind, message: a.message, acknowledgedAt: null } });
    if (!open) await db.alert.create({ data: { ...a, projectId } });
  }
}

async function execute(kind: string): Promise<{ status: 'ok' | 'skipped'; output: Record<string, unknown>; alerts: Alert[]; projectId: string | null }> {
  const p = await loadProject();
  const req = { mode: 'max_reliability' as const, scenario: 'typical' as const };
  if (kind === 'tariff_watch') {
    const soon = new Date(Date.now() + 60 * 86400000);
    const recs = await db.tariffRecord.findMany({ where: { status: 'approved' } });
    const ending = recs.filter((r) => r.effectiveTo && r.effectiveTo <= soon);
    const illus = recs.filter((r) => r.provenance === 'illustrative');
    const stale = await db.regulatoryChange.count({ where: { status: 'pending', createdAt: { lt: new Date(Date.now() - 7 * 86400000) } } });
    const alerts: Alert[] = [];
    if (ending.length) alerts.push({ kind: 'tariff_watch', severity: 'warning', message: `${ending.length} tariff record(s) end within 60 days: ${ending.slice(0, 5).map((r) => r.key).join(', ')}${ending.length > 5 ? '…' : ''}` });
    if (illus.length) alerts.push({ kind: 'tariff_watch', severity: 'warning', message: `${illus.length} of ${recs.length} tariff records are still illustrative placeholders — replace them with the orders in force.` });
    if (stale) alerts.push({ kind: 'tariff_watch', severity: 'info', message: `${stale} proposed tariff change(s) have waited more than 7 days for review.` });
    return { status: 'ok', output: { records: recs.length, endingSoon: ending.length, illustrative: illus.length, staleChanges: stale }, alerts, projectId: p.id };
  }
  if (kind === 'daily_simulation' || kind === 'battery_health' || kind === 'profitability') {
    const sim = await runYear(p.config, p.prices, req);
    if (kind === 'daily_simulation') {
      await recordRun(p.id, sim);
      const v = yearView(sim), a = v.feasibility.annual;
      const alerts: Alert[] = a.feasibility === 'not_feasible' ? [{ kind, severity: 'critical', message: `The ${p.config.delivery.contractedMw} MW contract is not feasible on the typical year (coverage ${(a.coverage * 100).toFixed(1)}%; limiting factor: ${String(a.limiting).replace(/_/g, ' ')}).` }] : [];
      return { status: 'ok', output: { coverage: a.coverage, feasibility: a.feasibility, notFeasibleDays: a.notFeasibleDays, solarMwh: v.solar.acMwh }, alerts, projectId: p.id };
    }
    if (kind === 'battery_health') {
      const t = yearView(sim).bess.trajectory;
      const first = t.find((x) => x.augmentMwh > 0);
      const alerts: Alert[] = first && first.year <= 3 ? [{ kind, severity: 'warning', message: `Battery augmentation of ${first.augmentMwh.toFixed(1)} MWh is due in year ${first.year} at the current cycling.` }] : [];
      return { status: 'ok', output: { firstAugmentationYear: first?.year ?? null, augmentMwh: first?.augmentMwh ?? 0 }, alerts, projectId: p.id };
    }
    const fa = financeAnalysis(sim), f = fa.result, rate = fa.inputs.discountRate;
    const alerts: Alert[] = [];
    if (f.projectIrr == null || f.projectIrr < rate) alerts.push({ kind, severity: 'warning', message: `Project IRR ${f.projectIrr == null ? 'cannot be computed' : `${(f.projectIrr * 100).toFixed(1)}%`} is below the ${(rate * 100).toFixed(1)}% discount rate (illustrative costs).` });
    if (f.minDscr != null && f.minDscr < 1.2) alerts.push({ kind, severity: 'warning', message: `Minimum DSCR ${f.minDscr.toFixed(2)} is below 1.20 (illustrative costs).` });
    return { status: 'ok', output: { projectIrr: f.projectIrr, minDscr: f.minDscr, npvCr: f.npvCr, costBasis: fa.inputs.provenance }, alerts, projectId: p.id };
  }
  if (kind === 'weather_update') return { status: 'skipped', output: { reason: 'PVGIS and NASA POWER are not reachable from this environment; climate inputs stay illustrative.' }, alerts: [], projectId: p.id };
  throw new Error(`Unknown job kind ${kind}`);
}

export async function runJob(id: string) {
  const job = await db.automationJob.findUnique({ where: { id } });
  if (!job) return null;
  const run = await db.automationRun.create({ data: { jobId: id, status: 'running' } });
  try {
    const r = await execute(job.kind);
    await raise(r.projectId, r.alerts);
    await db.automationJob.update({ where: { id }, data: { lastRunAt: new Date() } });
    return db.automationRun.update({ where: { id: run.id }, data: { status: r.status, output: { ...r.output, alerts: r.alerts.length } as never, finishedAt: new Date() } });
  } catch (e) {
    return db.automationRun.update({ where: { id: run.id }, data: { status: 'failed', error: String((e as Error).message).slice(0, 500), finishedAt: new Date() } });
  }
}
