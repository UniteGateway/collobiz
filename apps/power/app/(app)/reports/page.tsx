'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Layers, Receipt } from 'lucide-react';
import { Button, Card, Field, Notice } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { useScenario } from '@/components/Scenario';

/** Module 12 — reports: one place to download the management report, simulation data and proposals. */
export default function Reports() {
  const { query } = useScenario();
  const [day, setDay] = useState(172);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string>();
  const download = async (url: string, name: string) => {
    setBusy(true); setErr(undefined);
    try {
      const res = await fetch(url); if (!res.ok) throw new Error((await res.json().catch(() => ({ message: 'Download failed' }))).message);
      const href = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = href; a.download = name; a.click(); URL.revokeObjectURL(href);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const item = (Icon: typeof Download, title: string, text: string, action: React.ReactNode) => (
    <Card><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-navy-900 text-white"><Icon size={20} aria-hidden /></span>
      <div className="flex-1"><h2 className="text-[15px] font-semibold">{title}</h2><p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{text}</p><div className="mt-3 flex flex-wrap items-end gap-2">{action}</div></div></div></Card>
  );
  return (
    <>
      <PageTitle title="Reports" subtitle="Downloads use the scenario chosen at the top of the screen (dispatch mode, weather and CUF target)." />
      {err && <div className="mb-4"><Notice tone="red">{err}</Notice></div>}
      <div className="grid gap-4 xl:grid-cols-2">
        {item(FileText, 'Management report (PDF)', 'Plant, generation, dispatch and reliability, evacuation options, AP open-access landed cost and project finance with sensitivities — on one basis.',
          <Button onClick={() => download(`/api/reports/management?${query}`, 'management-report.pdf')} disabled={busy}><Download size={16} aria-hidden /> {busy ? 'Preparing…' : 'Download PDF'}</Button>)}
        {item(FileSpreadsheet, 'Year of hourly data (CSV)', '8,760 rows: solar, direct supply, battery charge and discharge, export, curtailment, unserved energy and state of charge.',
          <Button variant="secondary" onClick={() => download(`/api/sim/export?${query}&range=year`, 'year-hourly.csv')} disabled={busy}><Download size={16} aria-hidden /> Download CSV</Button>)}
        {item(FileSpreadsheet, 'One day in 15-minute steps (CSV)', 'Every interval of a chosen day, for checking dispatch decisions in detail.',
          <><Field label="Day of the year" type="number" min={0} max={364} value={day} onChange={(e) => setDay(Math.max(0, Math.min(364, Number(e.target.value))))} className="w-40" />
            <Button variant="secondary" onClick={() => download(`/api/sim/export?${query}&range=day&day=${day}`, `day-${day + 1}.csv`)} disabled={busy}><Download size={16} aria-hidden /> Download CSV</Button></>)}
        {item(Receipt, 'Customer savings proposal (PDF)', 'Built for one industrial consumer from their bill and tariff — prepare it on the Industrial Savings page.',
          <Link href="/savings" className="text-sm font-medium text-blue-500 underline">Open Industrial Savings</Link>)}
        {item(Layers, 'Hybrid scenario reports', 'Decision reports for solar + wind + battery scenarios, with review stages and checklists.',
          <Link href="/hybrid" className="text-sm font-medium text-blue-500 underline">Open Hybrid Power Lab</Link>)}
      </div>
    </>
  );
}
