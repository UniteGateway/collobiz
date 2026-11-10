import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { dayView, loadProject, runYear } from '@/lib/sim';
import { projectIdOf, simRequest } from '@/lib/simreq';

const csv = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => (typeof c === 'number' ? (Number.isInteger(c) ? String(c) : c.toFixed(4)) : `"${String(c).replace(/"/g, '""')}"`)).join(',')).join('\r\n');

/** CSV export: ?range=day&day=N (15-minute) or ?range=year (8,760 hourly rows). */
export const GET = handle(async (req: Request) => {
  await requireRole('viewer');
  const u = new URL(req.url);
  const p = await loadProject(projectIdOf(req.url));
  const sim = await runYear(p.config, p.prices, simRequest(req.url));
  let body: string, name: string;
  if (u.searchParams.get('range') === 'year') {
    const head = ['hour_of_year', 'day', 'hour', 'solar_mw', 'direct_mw', 'bess_charge_mw', 'bess_discharge_mw', 'soc_mwh', 'poi_export_mw', 'curtailed_mw', 'unserved_mw', 'demand_mw'];
    const rows: (string | number)[][] = [head];
    sim.days.forEach((d) => { for (let h = 0; h < 24; h++) { const q = d.intervals.slice(h * 4, h * 4 + 4); const avg = (f: (x: typeof q[number]) => number) => q.reduce((a, x) => a + f(x), 0) / 4; rows.push([d.day * 24 + h, d.day + 1, h, avg((x) => x.solar), avg((x) => x.sd), avg((x) => x.sc + x.gc), avg((x) => x.bd + x.be), q[3].socMwh, avg((x) => x.exportMw), avg((x) => x.cur), avg((x) => x.uns), avg((x) => x.load)]); } });
    body = csv(rows); name = 'unite-power-8760h.csv';
  } else {
    const v = dayView(sim, Number(u.searchParams.get('day') ?? 0));
    body = csv([['time', 'solar_mw', 'direct_mw', 'charge_mw', 'discharge_mw', 'soc_pct', 'poi_export_mw', 'curtailed_mw', 'unserved_mw', 'price_rs_kwh'], ...v.points.map((x) => [x.time, x.solar, x.direct, x.charge, x.discharge, x.soc, x.export, x.curtailed, x.unserved, x.price])]);
    name = `unite-power-day-${v.day + 1}.csv`;
  }
  return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"` } });
});
