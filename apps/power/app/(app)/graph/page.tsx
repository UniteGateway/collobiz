'use client';
/**
 * Module 5 — interactive power graph. All charts share one syncId, so hovering any chart shows the values at the same
 * timestamp in every chart. Zoom/pan uses a brush whose range is applied to every chart.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, Bar, Brush, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Sankey, Tooltip, XAxis, YAxis } from 'recharts';
import { Pause, Play } from 'lucide-react';
import { Button, Card, Select, Stat } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { SimLoading } from '@/components/Loading';
import { useScenario } from '@/components/Scenario';
import { useApi } from '@/lib/client';
import { MONTHS, useYear } from '@/lib/useSim';

interface Pt { t: number; time: string; solar: number; direct: number; charge: number; discharge: number; batteryToLoad: number; export: number; uncontractedExport: number; curtailed: number; unserved: number; load: number; soc: number; price: number; consumerTariff: number }
type View = 'day' | 'month' | 'year';
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const doyOf = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); return Math.min(364, Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000)); };
const isoOf = (doy: number) => new Date(Date.UTC(2027, 0, 1 + doy)).toISOString().slice(0, 10);
const COLORS = { solar: '#f59e0b', direct: '#16a34a', charge: '#93c5fd', discharge: '#1e6bff', soc: '#0b1f3a', export: '#6366f1', curtailed: '#f97316', unserved: '#ef4444', price: '#64748b' };

async function svgToPng(el: HTMLElement | null, name: string) {
  const svgs = el?.querySelectorAll('svg.recharts-surface');
  if (!svgs?.length) return;
  const rects = [...svgs].map((s) => s.getBoundingClientRect());
  const W = Math.max(...rects.map((r) => r.width)), H = rects.reduce((a, r) => a + r.height + 12, 0);
  const canvas = document.createElement('canvas'); canvas.width = W * 2; canvas.height = H * 2;
  const ctx = canvas.getContext('2d')!; ctx.scale(2, 2); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  let y = 0;
  for (const s of svgs) {
    const r = s.getBoundingClientRect();
    const clone = s.cloneNode(true) as SVGElement; clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const img = new Image();
    await new Promise<void>((res) => { img.onload = () => res(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`; });
    ctx.drawImage(img, 0, y, r.width, r.height); y += r.height + 12;
  }
  const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = name; a.click();
}

/** Sankey node with its name and energy, so the diagram reads without hovering. */
function SankeyNode(props: { x?: number; y?: number; width?: number; height?: number; payload?: { name: string; value: number } }) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={Math.max(height, 1)} fill="#0b1f3a" rx={2} />
      <text x={x + width + 6} y={y + height / 2} dominantBaseline="middle" fontSize={12} fill="currentColor">{payload.name}</text>
      <text x={x + width + 6} y={y + height / 2 + 14} dominantBaseline="middle" fontSize={11} fill="#64748b">{payload.value.toLocaleString('en-IN', { maximumFractionDigits: 1 })} MWh</text>
    </g>
  );
}

export default function PowerGraph() {
  const { query, s, set } = useScenario();
  const year = useYear();
  const [view, setView] = useState<View>('day');
  const [day, setDay] = useState(80);
  const [month, setMonth] = useState(2);
  const [idx, setIdx] = useState(52);
  const [playing, setPlaying] = useState(false);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const dayQ = useApi<{ points: Pt[] }>(`/api/sim/day?${query}&day=${day}`);
  useEffect(() => { if (!playing) return; const t = setInterval(() => setIdx((i) => (i + 1) % 96), 250); return () => clearInterval(t); }, [playing]);
  useEffect(() => setRange(null), [view, day, month]);

  const data = useMemo(() => {
    if (view === 'day') return (dayQ.data?.points ?? []).map((p) => ({ ...p, x: p.time }));
    if (!year.data) return [];
    if (view === 'month') return year.data.daily.slice(MONTH_START[month], MONTH_START[month] + [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month]).map((d) => ({ x: String(d.day - MONTH_START[month] + 1), solar: d.solar, direct: d.direct, charge: d.charged, discharge: d.battery, export: d.exported, curtailed: d.curtailed, unserved: d.unserved, load: d.demand }));
    return year.data.monthly.map((m, i) => ({ x: MONTHS[i], solar: m.solar, direct: m.direct, charge: m.charged, discharge: m.battery, export: m.exported, curtailed: m.curtailed, unserved: m.unserved, load: m.demand }));
  }, [view, dayQ.data, year.data, month]);
  const shown = range ? data.slice(range.start, range.end + 1) : data;
  const unit = view === 'day' ? 'MW' : 'MWh';
  const cur = view === 'day' ? (dayQ.data?.points[idx] ?? null) : null;

  const sankey = useMemo(() => {
    const src = view === 'day' ? (dayQ.data?.points ?? []).reduce((a, p) => ({ solar: a.solar + p.solar / 4, direct: a.direct + p.direct / 4, charge: a.charge + p.charge / 4, battLoad: a.battLoad + p.batteryToLoad / 4, battExp: a.battExp + (p.discharge - p.batteryToLoad) / 4, exp: a.exp + (p.uncontractedExport - (p.discharge - p.batteryToLoad)) / 4, cur: a.cur + p.curtailed / 4 }), { solar: 0, direct: 0, charge: 0, battLoad: 0, battExp: 0, exp: 0, cur: 0 })
      : (() => { const rows = view === 'month' ? year.data?.daily.slice(MONTH_START[month], MONTH_START[month] + 31) ?? [] : year.data?.daily ?? []; const s0 = year.data?.summary; const k = rows.length && s0 ? rows.reduce((a, r) => a + r.battery, 0) / Math.max(1e-9, s0.batteryToLoadMwh) : 0;
        return rows.reduce((a, r) => ({ solar: a.solar + r.solar, direct: a.direct + r.direct, charge: a.charge + r.charged, battLoad: a.battLoad + r.battery, battExp: a.battExp, exp: a.exp + r.exported, cur: a.cur + r.curtailed }), { solar: 0, direct: 0, charge: 0, battLoad: 0, battExp: (s0?.batteryToExportMwh ?? 0) * k, exp: -((s0?.batteryToExportMwh ?? 0) * k), cur: 0 }); })();
    const loss = Math.max(0, src.charge - src.battLoad - src.battExp);
    const nodes = [{ name: 'Solar generation' }, { name: 'Direct to industry' }, { name: 'Battery charging' }, { name: 'Uncontracted export' }, { name: 'Curtailed' }, { name: 'Battery to industry' }, { name: 'Battery losses' }, { name: 'Battery to export' }, { name: 'Grid delivery (POI)' }];
    const L = (source: number, target: number, value: number) => ({ source, target, value: Math.max(0, value) });
    const links = [L(0, 1, src.direct), L(0, 2, src.charge), L(0, 3, src.exp), L(0, 4, src.cur), L(2, 5, src.battLoad), L(2, 6, loss), L(2, 7, src.battExp), L(1, 8, src.direct), L(5, 8, src.battLoad), L(3, 8, src.exp), L(7, 8, src.battExp)].filter((l) => l.value > 1e-6);
    return { nodes, links, total: src.solar };
  }, [view, dayQ.data, year.data, month]);

  if (!year.data) return <><PageTitle title="Interactive Power Graph" /><SimLoading error={year.error} /></>;
  const brush = (r: { startIndex?: number; endIndex?: number }) => { if (r.startIndex != null && r.endIndex != null) setRange({ start: r.startIndex, end: r.endIndex }); };
  const common = { data: shown, syncId: 'power', margin: { top: 8, right: 16, left: 4, bottom: 0 } };
  const tt = <Tooltip formatter={(v, n) => [`${Number(v).toFixed(view === 'day' ? 2 : 0)} ${String(n).includes('SOC') ? '%' : String(n).includes('price') ? '₹/kWh' : unit}`, n]} />;
  return (
    <>
      <PageTitle title="Interactive Power Graph" subtitle="Hover any chart to see every value at that moment. Drag the handles under the first chart to zoom and pan." actions={
        <div className="flex flex-wrap gap-2 no-print">
          <a href={view === 'day' ? `/api/sim/export?${query}&day=${day}` : `/api/sim/export?${query}&range=year`}><Button variant="secondary" size="sm">CSV</Button></a>
          <Button variant="secondary" size="sm" onClick={() => svgToPng(ref.current, `unite-power-${view}.png`)}>PNG</Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>PDF</Button>
        </div>} />
      <Card className="mb-4 no-print">
        <div className="flex flex-wrap items-end gap-3">
          <div role="group" aria-label="View" className="flex rounded-full bg-slate-100 p-1 dark:bg-white/10">{(['day', 'month', 'year'] as View[]).map((v) => <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`rounded-full px-4 py-1.5 text-sm capitalize ${view === v ? 'bg-white shadow dark:bg-navy-800' : ''}`}>{v}</button>)}</div>
          {view === 'day' && <label className="flex flex-col gap-1 text-[13px] font-medium">Date<input type="date" min="2027-01-01" max="2027-12-31" value={isoOf(day)} onChange={(e) => e.target.value && setDay(doyOf(e.target.value))} className="h-10 rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10" /></label>}
          {view === 'month' && <Select label="Month" value={String(month)} onChange={(e) => setMonth(Number(e.target.value))} options={MONTHS.map((m, i) => ({ value: String(i), label: m }))} />}
          <Select label="Weather scenario" value={s.scenario} onChange={(e) => set({ scenario: e.target.value as never })} options={[{ value: 'typical', label: 'Typical year' }, { value: 'sunny', label: 'Sunny' }, { value: 'monsoon_heavy', label: 'Heavy monsoon' }, { value: 'low_production', label: 'Low production' }]} />
          {view === 'day' && (
            <div className="flex min-w-[260px] flex-1 items-end gap-3">
              <Button variant="secondary" size="sm" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause playback' : 'Play the day'}>{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? 'Pause' : 'Play'}</Button>
              <label className="flex flex-1 flex-col gap-1 text-[13px] font-medium">Time {cur?.time ?? ''}<input type="range" min={0} max={95} value={idx} onChange={(e) => setIdx(Number(e.target.value))} aria-label="Time of day" className="accent-blue-500" /></label>
            </div>
          )}
          {range && <Button variant="ghost" size="sm" onClick={() => setRange(null)}>Reset zoom</Button>}
        </div>
      </Card>
      {cur && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
          <Stat label="Solar" value={`${cur.solar.toFixed(1)}`} hint="MW" tone="amber" /><Stat label="To industry" value={`${(cur.direct + cur.batteryToLoad).toFixed(1)}`} hint={`of ${cur.load.toFixed(0)} MW`} tone="green" />
          <Stat label="Charging" value={cur.charge.toFixed(1)} hint="MW" tone="blue" /><Stat label="Discharging" value={cur.discharge.toFixed(1)} hint="MW" tone="blue" />
          <Stat label="SOC" value={`${cur.soc.toFixed(0)}%`} /><Stat label="Grid export" value={cur.export.toFixed(1)} hint="MW at POI" />
          <Stat label="Curtailed" value={cur.curtailed.toFixed(1)} hint="MW" tone="amber" /><Stat label="Price" value={`₹${cur.price.toFixed(2)}`} hint="/kWh (illustrative)" />
        </div>
      )}
      <div ref={ref} className="grid gap-4">
        <Card title={`Power flows (${unit})`} subtitle={view === 'day' ? 'Solar, delivery, battery charge and discharge, export' : 'Energy per period'}>
          <div className="h-80"><ResponsiveContainer><ComposedChart {...common}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="x" minTickGap={24} /><YAxis />{tt}<Legend />
            <Area dataKey="solar" name="Solar generation" stroke={COLORS.solar} fill={COLORS.solar} fillOpacity={0.15} isAnimationActive={false} />
            <Line dataKey="direct" name="Direct industrial delivery" stroke={COLORS.direct} dot={false} strokeWidth={2} isAnimationActive={false} />
            {view === 'day'
              ? <><Area type="stepAfter" dataKey="charge" name="BESS charging" stroke={COLORS.charge} fill={COLORS.charge} fillOpacity={0.45} isAnimationActive={false} /><Area type="stepAfter" dataKey="discharge" name="BESS discharging" stroke={COLORS.discharge} fill={COLORS.discharge} fillOpacity={0.45} isAnimationActive={false} /></>
              : <><Bar dataKey="charge" name="BESS charging" fill={COLORS.charge} isAnimationActive={false} /><Bar dataKey="discharge" name="BESS discharging" fill={COLORS.discharge} isAnimationActive={false} /></>}
            <Line dataKey="export" name="Grid export" stroke={COLORS.export} dot={false} strokeDasharray="4 3" isAnimationActive={false} />
            {view === 'day' && cur && <ReferenceLine x={cur.time} stroke="#0b1f3a" strokeDasharray="2 2" />}
            {!range && <Brush dataKey="x" height={22} stroke="#1e6bff" travellerWidth={8} onChange={brush} />}
          </ComposedChart></ResponsiveContainer></div>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          {view === 'day' && <Card title="Battery state of charge (%)"><div className="h-56"><ResponsiveContainer><ComposedChart {...common}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="x" minTickGap={24} /><YAxis domain={[0, 100]} />{tt}<Area dataKey="soc" name="SOC" stroke={COLORS.soc} fill={COLORS.soc} fillOpacity={0.1} isAnimationActive={false} />{cur && <ReferenceLine x={cur.time} stroke="#0b1f3a" strokeDasharray="2 2" />}</ComposedChart></ResponsiveContainer></div></Card>}
          <Card title={`Curtailment and unserved load (${unit})`}><div className="h-56"><ResponsiveContainer><ComposedChart {...common}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="x" minTickGap={24} /><YAxis />{tt}<Area dataKey="curtailed" name="Curtailed energy" stroke={COLORS.curtailed} fill={COLORS.curtailed} fillOpacity={0.2} isAnimationActive={false} /><Area dataKey="unserved" name="Unserved load" stroke={COLORS.unserved} fill={COLORS.unserved} fillOpacity={0.2} isAnimationActive={false} />{view === 'day' && cur && <ReferenceLine x={cur.time} stroke="#0b1f3a" strokeDasharray="2 2" />}</ComposedChart></ResponsiveContainer></div></Card>
          {view === 'day' && <Card title="Hourly electricity price (₹/kWh)" subtitle="Merchant price and the consumer’s tariff — illustrative until replaced"><div className="h-56"><ResponsiveContainer><ComposedChart {...common}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="x" minTickGap={24} /><YAxis />{tt}<Line type="stepAfter" dataKey="price" name="Merchant price" stroke={COLORS.price} dot={false} isAnimationActive={false} /><Line type="stepAfter" dataKey="consumerTariff" name="Consumer tariff price" stroke="#16a34a" dot={false} strokeDasharray="4 3" isAnimationActive={false} />{cur && <ReferenceLine x={cur.time} stroke="#0b1f3a" strokeDasharray="2 2" />}</ComposedChart></ResponsiveContainer></div></Card>}
        </div>
        <Card title="Energy flow" subtitle={`${view === 'day' ? `Day ${day + 1}` : view === 'month' ? MONTHS[month] : 'Year'} — MWh from solar generation to grid delivery`}>
          {sankey.links.length ? <div className="h-80"><ResponsiveContainer><Sankey data={sankey} nodePadding={28} nodeWidth={12} margin={{ top: 10, right: 160, bottom: 10, left: 10 }} link={{ stroke: '#1e6bff', strokeOpacity: 0.25 }} node={<SankeyNode />}><Tooltip formatter={(v) => `${Number(v).toFixed(1)} MWh`} /></Sankey></ResponsiveContainer></div> : <p className="text-sm text-slate-500">No solar energy in this period.</p>}
          <p className="mt-2 text-[12px] text-slate-500">Battery losses are the difference between energy charged and energy discharged (round-trip efficiency); discharge is never counted as generation.</p>
        </Card>
      </div>
    </>
  );
}
