'use client';
/**
 * Small, dependency-free charts for module dashboards. Categorical palette validated (CVD + normal-vision) with the
 * dataviz checker; marks with low surface contrast always carry visible values in the legend or labels, and every
 * chart has a screen-reader table. Hover shows a tooltip for each mark.
 */
import { useState } from 'react';

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'] as const;
type Datum = { label: string; value: number };
const fmtDefault = (v: number) => v.toLocaleString('en-IN');

function SrTable({ caption, rows, fmt }: { caption: string; rows: Datum[]; fmt: (v: number) => string }) {
  return <table className="cz-sr-only"><caption>{caption}</caption><tbody>{rows.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>{fmt(r.value)}</td></tr>)}</tbody></table>;
}

export function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <figure className="cz-chart-card"><figcaption><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</figcaption>{children}</figure>;
}

/** Vertical columns for one measure across categories (single series → no legend; the title names it). */
export function ColumnChart({ data, fmt = fmtDefault, caption, height = 180 }: { data: Datum[]; fmt?: (v: number) => string; caption: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="cz-colchart" style={{ height }} aria-hidden={false}>
      <div className="cz-colchart-plot" aria-hidden>
        {data.map((d, i) => (
          <div key={d.label} className="cz-colchart-col" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            {hover === i && <span className="cz-chart-tip">{d.label}: <strong>{fmt(d.value)}</strong></span>}
            <span className="cz-colchart-bar" style={{ height: `${d.value > 0 ? Math.max(3, (d.value / max) * 100) : 0}%`, background: SERIES[0] }} />
            <span className="cz-colchart-lbl">{d.label}</span>
          </div>
        ))}
      </div>
      <SrTable caption={caption} rows={data} fmt={fmt} />
    </div>
  );
}

/** Part-to-whole for up to five categories; legend carries every value. */
export function DonutChart({ data, fmt = fmtDefault, caption, centre }: { data: Datum[]; fmt?: (v: number) => string; caption: string; centre?: { value: string; label: string } }) {
  const [hover, setHover] = useState<number | null>(null);
  const parts = data.slice(0, 5); const total = parts.reduce((a, d) => a + Math.max(0, d.value), 0);
  const R = 52, C = 2 * Math.PI * R, GAP = total > 0 && parts.filter((p) => p.value > 0).length > 1 ? 2 : 0;
  let acc = 0;
  return (
    <div className="cz-donutchart">
      <svg viewBox="0 0 140 140" width="140" height="140" aria-hidden>
        <circle cx="70" cy="70" r={R} fill="none" stroke="#EEF1F5" strokeWidth="16" />
        {total > 0 && parts.map((d, i) => {
          const len = (Math.max(0, d.value) / total) * C; const off = acc; acc += len;
          return len > 0 ? <circle key={d.label} cx="70" cy="70" r={R} fill="none" stroke={SERIES[i]} strokeWidth={hover === i ? 20 : 16} strokeDasharray={`${Math.max(0, len - GAP)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 70 70)"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}><title>{`${d.label}: ${fmt(d.value)}`}</title></circle> : null;
        })}
        {centre && <><text x="70" y="68" textAnchor="middle" className="cz-donut-v">{centre.value}</text><text x="70" y="86" textAnchor="middle" className="cz-donut-l">{centre.label}</text></>}
      </svg>
      <ul className="cz-chart-legend">{parts.map((d, i) => (
        <li key={d.label} className={hover === i ? 'on' : ''} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <i style={{ background: SERIES[i] }} /><span>{d.label}</span><strong>{fmt(d.value)}</strong>{total > 0 && <em>{Math.round((Math.max(0, d.value) / total) * 100)}%</em>}</li>
      ))}</ul>
      <SrTable caption={caption} rows={parts} fmt={fmt} />
    </div>
  );
}

/** Ranked horizontal bars — names on the left, values on the right. */
export function HBarChart({ data, fmt = fmtDefault, caption, max: maxIn }: { data: Datum[]; fmt?: (v: number) => string; caption: string; max?: number }) {
  const max = maxIn ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <ul className="cz-hbarchart" aria-hidden>{data.map((d) => (
        <li key={d.label} title={`${d.label}: ${fmt(d.value)}`}><span className="cz-hbarchart-l">{d.label}</span>
          <span className="cz-hbarchart-track"><span style={{ width: `${d.value > 0 ? Math.max(2, (d.value / max) * 100) : 0}%`, background: SERIES[0] }} /></span><strong>{fmt(d.value)}</strong></li>
      ))}</ul>
      <SrTable caption={caption} rows={data} fmt={fmt} />
    </div>
  );
}
