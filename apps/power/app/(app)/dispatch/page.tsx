'use client';
import { Badge, Card, Notice, crore, mwh, pct } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { SimLoading } from '@/components/Loading';
import { useScenario } from '@/components/Scenario';
import { useApi } from '@/lib/client';
import { FEAS, LIMITING } from '@/lib/useSim';

interface ModeRow { mode: string; label: string; summary: Record<string, number>; revenue: { net: number; ppa: number; peak: number; merchant: number }; feasibility: { feasibility: string; limiting: string; coverage: number }; firmAvailability: number }
const PRIORITY = ['Deliver the agreed solar power directly to industry', 'Charge the battery from solar surplus', 'Store energy for higher-value evening hours', 'Discharge during the contracted peak period', 'Minimise curtailment', 'Account for transmission charges and battery wear', 'Report unmet demand', 'Optionally firm the contract with separately priced grid power'];

/** Module 4 — smart dispatch: daily linear optimisation (HiGHS) in three operating modes, compared side by side. */
export default function Dispatch() {
  const { query, s } = useScenario();
  const q = useApi<{ modes: ModeRow[] }>(`/api/sim/modes?${query}`);
  return (
    <>
      <PageTitle title="Smart Dispatch" subtitle="Each day’s 96 fifteen-minute intervals are solved as a linear programme (HiGHS, open source), carrying battery charge from day to day and valuing energy kept for the next morning. Energy balance, the 35 MW export limit, battery power and SOC limits are checked in every interval." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Priority logic" subtitle="What the optimiser is asked to respect">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">{PRIORITY.map((x) => <li key={x}>{x}</li>)}</ol>
        </Card>
        <Card title="Operating modes" subtitle={`Header selection: ${s.mode.replace(/_/g, ' ')}`} className="lg:col-span-2">
          <ul className="space-y-2 text-sm">
            <li><strong>Maximum developer profit</strong> — maximises PPA, peak and merchant revenue less battery wear, grid purchases and contract shortfall penalties.</li>
            <li><strong>Maximum customer savings</strong> — maximises the buyer’s avoided tariff minus the price paid, so energy goes to the hours where the buyer’s tariff is highest.</li>
            <li><strong>Maximum reliability 6 AM–10 PM</strong> — minimises unserved contracted energy first; everything else is secondary.</li>
          </ul>
          <p className="mt-3 text-[12px] text-slate-500">Grid firming (priority 8) is off unless enabled; grid charging is off unless allowed on Project Configuration.</p>
        </Card>
      </div>
      <Card title="Modes compared for the selected weather" subtitle="Full year, 35,040 intervals each" className="mt-4">
        {!q.data ? <SimLoading error={q.error} /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Dispatch modes compared</caption>
            <thead className="text-left text-[12px] text-slate-500"><tr><th className="py-2">Mode</th><th className="text-right">Direct to industry</th><th className="text-right">Battery to industry</th><th className="text-right">Exported</th><th className="text-right">Curtailed</th><th className="text-right">Unserved</th><th className="text-right">Coverage</th><th className="text-right">Cycles</th><th className="text-right">Net revenue</th><th>Contract</th></tr></thead>
            <tbody>{q.data.modes.map((m) => { const F = FEAS[m.feasibility.feasibility as keyof typeof FEAS]; return (
              <tr key={m.mode} className="border-t border-slate-100 dark:border-white/10" data-mode={m.mode}><td className="py-2 font-medium">{m.label}</td><td className="text-right tabular-nums">{mwh(m.summary.directMwh)}</td><td className="text-right tabular-nums">{mwh(m.summary.batteryToLoadMwh)}</td><td className="text-right tabular-nums">{mwh(m.summary.exportUncontractedMwh + m.summary.batteryToExportMwh)}</td><td className="text-right tabular-nums">{mwh(m.summary.curtailedMwh)}</td><td className="text-right tabular-nums">{mwh(m.summary.unservedMwh)}</td><td className="text-right tabular-nums">{pct(m.summary.demandCoverage)}</td><td className="text-right tabular-nums">{m.summary.equivalentCycles.toFixed(0)}</td><td className="text-right tabular-nums">{crore(m.revenue.net)}</td><td><Badge tone={F.tone}>{F.label}</Badge><div className="text-[11px] text-slate-500">{LIMITING[m.feasibility.limiting]}</div></td></tr>); })}</tbody></table></div>
        )}
      </Card>
      <div className="mt-4"><Notice tone="amber">Revenue uses the PPA, peak and merchant prices on Project Configuration — illustrative until replaced with contract and exchange data.</Notice></div>
    </>
  );
}
