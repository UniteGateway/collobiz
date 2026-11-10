import { calibrateToCuf, CUF_SCENARIOS } from '@unite/power-engine';
import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { loadProject } from '@/lib/sim';

const memo = new Map<string, unknown>();
/** The 19–22 % CUF scenarios on both bases: whether reachable with this plant, energy, clipping and the other-basis CUF. */
export const GET = handle(async (req: Request) => {
  await requireRole('viewer');
  const p = await loadProject(new URL(req.url).searchParams.get('project'));
  const key = JSON.stringify(p.config.solar) + JSON.stringify(p.config.site);
  if (!memo.has(key)) {
    const rows = [];
    for (const basis of ['dc', 'ac'] as const) for (const c of CUF_SCENARIOS) {
      const r = calibrateToCuf(p.config, c, basis);
      rows.push({ target: c, basis, achievable: r.achievable, note: r.note ?? null, acMwh: r.year.acMwh, clippedMwh: r.year.clippedMwh, cufDc: r.year.cufDc.value, cufAc: r.year.cufAc.value, irradianceScale: r.year.irradianceScale, monthly: r.year.monthlyAcMwh });
    }
    memo.set(key, rows);
  }
  return { rows: memo.get(key) };
});
