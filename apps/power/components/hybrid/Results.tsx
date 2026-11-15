'use client';
/** Results of a scenario: decision, delivery compliance hour by hour, energy flows, battery, money and checks. Units on every chart. */
import { useMemo, useState } from 'react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Card, Notice, Stat } from '@/components/ui';
import { DECISION_TEXT, DECISION_TONE, MONTHS, TECH_TEXT, cr, gwh, pctN } from '@/lib/hybridClient';

type R = Record<string, any>;
const C = { solar: '#f5b301', wind: '#1e6bff', batR: '#16a34a', batG: '#64748b', bal: '#a855f7', uns: '#ef4444', load: '#0b1f3a', exp: '#94a3b8', cur: '#fca5a5' };
const fmt = (v: unknown, unit: string) => `${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${unit}`;

export function Results({ results: r, series, inputs }: { results: R; series: Record<string, number[]> | null; inputs: R }) {
  const s = r.summary, c = r.compliance, f = r.finance, d = r.decision;
  const days = series ? series.S.length / 24 : 0;
  const worst = c.worstDay?.day ?? 0;
  const [day, setDay] = useState<number>(worst);
  const dayData = useMemo(() => !series ? [] : Array.from({ length: 24 }, (_, h) => {
    const i = day * 24 + h, g = (k: string) => series[k]?.[i] ?? 0;
    return { h: `${String(h).padStart(2, '0')}:00`, solar: g('solarDirect'), wind: g('windDirect'), batR: g('batteryRenewable'), batG: g('batteryGrid'), bal: g('balancing'), uns: g('unserved'), load: g('L'),
      chS: -g('chargeSolar'), chW: -g('chargeWind'), chG: -g('chargeGrid'), exp: g('export'), cur: g('curtailed'), soc: g('soc'), S: g('S'), W: g('W') };
  }), [series, day]);
  const monthly = s.monthly.map((m: R, i: number) => ({ m: MONTHS[i], solar: m.solar / 1000, wind: m.wind / 1000, delivered: m.delivered / 1000, demand: m.demand / 1000, fulfil: c.monthlyFulfilment[i] * 100 }));
  const rev = [{ k: 'PPA (off-peak)', v: s.revenue.ppa / 1e7 }, { k: 'Peak', v: s.revenue.peak / 1e7 }, { k: 'Merchant', v: s.revenue.merchant / 1e7 }, { k: 'Grid charging', v: -s.revenue.gridChargeCost / 1e7 }, { k: 'Balancing', v: -s.revenue.balancingCost / 1e7 }, { k: 'BESS auxiliary', v: -s.revenue.auxCost / 1e7 }, { k: 'Penalties', v: -s.revenue.penalties / 1e7 }];
  const charge = [{ k: 'Solar', v: s.chargeSolarMwh }, { k: 'Wind', v: s.chargeWindMwh }, { k: 'Grid', v: s.chargeGridMwh }];
  const date = (doy: number) => new Date(Date.UTC(inputs.year ?? 2027, 0, 1 + doy)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="text-[12px] font-medium uppercase tracking-wide text-slate-500">Decision status</div>
            <div className="mt-1 flex items-center gap-2"><Badge tone={DECISION_TONE[d.status]}>{DECISION_TEXT[d.status]}</Badge><span className="text-[14px] text-slate-600 dark:text-slate-300">Technically: {TECH_TEXT[c.technical]}</span></div>
            <ul className="mt-2 list-disc pl-5 text-[13px] text-slate-600 dark:text-slate-300">{d.why.map((w: string) => <li key={w}>{w}</li>)}</ul></div>
          <p className="max-w-sm text-[12px] text-slate-500">{r.screening ? 'Screening run — representative days only.' : `Full year, ${s.solverDays} daily optimisations (${s.nonOptimalDays} not optimal) in ${(r.computedMs / 1000).toFixed(1)} s.`} Energy balance error {Math.abs(r.reconciliation.generationError).toFixed(4)} MWh. Positive returns never make a scenario feasible on their own.</p>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Contract delivered" value={pctN(c.reliability)} tone={c.meetsAllowedShortfall ? 'green' : 'red'} hint={`allowed shortfall ${pctN(inputs.product.allowedShortfall, 0)}`} />
        <Stat label="Hours fully served" value={pctN(c.hoursFullyServedShare, 0)} hint={`${c.hoursFullyServed} of ${c.hoursWithDemand} h`} />
        <Stat label="Unmet demand" value={gwh(s.shortfallMwh)} tone={s.shortfallMwh > 0 ? 'red' : 'green'} hint={c.longestShortfallRunHours ? `longest gap ${c.longestShortfallRunHours} h` : 'none'} />
        <Stat label="Renewable share" value={pctN(c.renewableShare)} hint="of delivered energy" />
        <Stat label="Project IRR" value={pctN(f.projectIrr)} hint={`equity ${pctN(f.equityIrr)} · min DSCR ${f.minDscr?.toFixed(2) ?? '—'}`} />
        <Stat label="Landed tariff" value={`₹${r.landed.landedRsKwh.toFixed(2)}`} hint={`buyer ${r.landed.buyerSavingRsKwh >= 0 ? 'saves' : 'pays'} ₹${Math.abs(r.landed.buyerSavingRsKwh).toFixed(2)}/kWh`} />
      </div>
      {s.shortfallMwh > 0 && <Notice tone="red" title="Unmet contracted demand">{gwh(s.shortfallMwh)} a year is not delivered. Worst month: {MONTHS[c.worstMonth]} ({pctN(c.monthlyFulfilment[c.worstMonth])}). Largest single shortfall event {c.largestShortfallEventMwh.toFixed(0)} MWh — covering it from storage alone would need roughly {c.indicativeExtraBessMwh.toFixed(0)} MWh more nameplate (indicative; generation to charge it must also exist).</Notice>}

      <Card title="Hour-by-hour dispatch on one day" subtitle="MW. Bars above zero supply the contract; bars below zero charge the battery. Black line: contracted demand."
>
        {series && <label className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">Day<input type="range" min={0} max={days - 1} value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="Day of year" className="w-40 accent-blue-600" /><span className="w-16 tabular-nums">{date(day)}</span><button type="button" className="text-blue-600 hover:underline" onClick={() => setDay(worst)}>worst day</button></label>}
        {!series ? <p className="text-sm text-slate-500">Loading hourly data…</p> : (
          <div className="h-[340px]"><ResponsiveContainer>
            <ComposedChart data={dayData} stackOffset="sign" syncId="day">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="h" fontSize={11} interval={2} /><YAxis fontSize={11} unit=" MW" width={64} />
              <Tooltip formatter={(v, n) => [fmt(Math.abs(Number(v)), 'MW'), n]} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="solar" name="Solar → buyer" stackId="a" fill={C.solar} isAnimationActive={false} />
              <Bar dataKey="wind" name="Wind → buyer" stackId="a" fill={C.wind} isAnimationActive={false} />
              <Bar dataKey="batR" name="Battery (renewable) → buyer" stackId="a" fill={C.batR} isAnimationActive={false} />
              <Bar dataKey="batG" name="Battery (grid-charged) → buyer" stackId="a" fill={C.batG} isAnimationActive={false} />
              <Bar dataKey="bal" name="Balancing power" stackId="a" fill={C.bal} isAnimationActive={false} />
              <Bar dataKey="uns" name="Not delivered" stackId="a" fill={C.uns} isAnimationActive={false} />
              <Bar dataKey="chS" name="Solar → battery" stackId="a" fill="#fde68a" isAnimationActive={false} />
              <Bar dataKey="chW" name="Wind → battery" stackId="a" fill="#93c5fd" isAnimationActive={false} />
              <Bar dataKey="chG" name="Grid → battery" stackId="a" fill="#cbd5e1" isAnimationActive={false} />
              <Line dataKey="load" name="Contracted demand" stroke={C.load} strokeWidth={2} dot={false} type="stepAfter" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer></div>
        )}
      </Card>
      {series && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Generation available and battery state of charge" subtitle="MW (left) and SOC % (right) on the same day">
            <div className="h-[260px]"><ResponsiveContainer>
              <ComposedChart data={dayData} syncId="day"><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="h" fontSize={11} interval={2} /><YAxis yAxisId="mw" fontSize={11} unit=" MW" width={64} /><YAxis yAxisId="soc" orientation="right" fontSize={11} unit="%" domain={[0, 100]} width={44} />
                <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Area yAxisId="mw" dataKey="S" name="Solar available (MW)" fill={C.solar} stroke={C.solar} fillOpacity={0.25} isAnimationActive={false} />
                <Area yAxisId="mw" dataKey="W" name="Wind available (MW)" fill={C.wind} stroke={C.wind} fillOpacity={0.2} isAnimationActive={false} />
                <Line yAxisId="mw" dataKey="cur" name="Curtailed (MW)" stroke={C.uns} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                <Line yAxisId="soc" dataKey="soc" name="Battery SOC (%)" stroke={C.batR} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer></div>
          </Card>
          <Card title="How often each hour is fully served" subtitle="Share of the year’s days on which the contract was met in that hour (%), all hours with demand">
            <div className="h-[260px]"><ResponsiveContainer>
              <BarChart data={r.byHour.map((x: R) => ({ h: String(x.hour).padStart(2, '0'), served: x.served == null ? null : x.served * 100 }))}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="h" fontSize={11} /><YAxis fontSize={11} unit="%" domain={[0, 100]} width={44} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(0)}%`, 'Days fully served']} /><Bar dataKey="served" fill={C.wind} isAnimationActive={false} /></BarChart>
            </ResponsiveContainer></div>
          </Card>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Monthly energy" subtitle="GWh generated, delivered and contracted; seasonal resource variability">
          <div className="h-[280px]"><ResponsiveContainer>
            <ComposedChart data={monthly}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="m" fontSize={11} /><YAxis fontSize={11} unit=" GWh" width={64} /><Tooltip formatter={(v, n) => [fmt(v, 'GWh'), n]} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="solar" name="Solar generated" stackId="g" fill={C.solar} isAnimationActive={false} /><Bar dataKey="wind" name="Wind generated" stackId="g" fill={C.wind} isAnimationActive={false} />
              <Line dataKey="demand" name="Contracted" stroke={C.load} strokeWidth={2} isAnimationActive={false} /><Line dataKey="delivered" name="Delivered" stroke={C.batR} strokeWidth={2} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer></div>
        </Card>
        <Card title="Annual revenue and costs" subtitle="₹ crore, year 1, at the prices entered">
          <div className="h-[280px]"><ResponsiveContainer>
            <BarChart data={rev} layout="vertical" margin={{ left: 30 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" fontSize={11} unit=" cr" /><YAxis type="category" dataKey="k" fontSize={11} width={100} /><Tooltip formatter={(v) => [cr(Number(v), 2), '']} /><Bar dataKey="v" fill={C.load} isAnimationActive={false} /></BarChart>
          </ResponsiveContainer></div>
          <p className="text-[13px]">Net: <strong>{cr(s.revenue.net / 1e7, 2)}</strong> · peak deliveries {gwh(s.peakDeliveredMwh)} · off-peak {gwh(s.offPeakDeliveredMwh)}</p>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Battery" subtitle="Charging by source and throughput (MWh/yr)">
          <div className="h-[160px]"><ResponsiveContainer><BarChart data={charge}><XAxis dataKey="k" fontSize={11} /><YAxis fontSize={11} unit=" MWh" width={70} /><Tooltip formatter={(v) => [fmt(v, 'MWh'), 'Charged']} /><Bar dataKey="v" fill={C.batR} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
          <dl className="mt-2 grid grid-cols-2 gap-1 text-[13px]"><dt className="text-slate-500">Discharged</dt><dd>{fmt(s.dischargeMwh, 'MWh')}</dd><dt className="text-slate-500">Conversion losses</dt><dd>{fmt(s.batteryLossMwh, 'MWh')}</dd><dt className="text-slate-500">Auxiliary use</dt><dd>{fmt(s.auxMwh, 'MWh')}</dd><dt className="text-slate-500">Equivalent cycles</dt><dd>{s.equivalentCycles.toFixed(0)} / yr</dd><dt className="text-slate-500">Grid-charged → buyer</dt><dd>{fmt(s.batteryGridToLoadMwh, 'MWh')} (not renewable)</dd></dl>
        </Card>
        <Card title="Land and grid" subtitle="Preliminary until site engineering">
          <dl className="grid grid-cols-2 gap-1 text-[13px]"><dt className="text-slate-500">Land needed</dt><dd className={r.land.ok ? '' : 'text-red-500'}>{r.land.requiredAcres.toFixed(0)} of {r.land.availableAcres} acres</dd><dt className="text-slate-500">Peak injection</dt><dd>{r.grid.maxPoiMw.toFixed(1)} MW of {r.grid.exportMw} MW</dd><dt className="text-slate-500">Transformer loading</dt><dd>{pctN(r.grid.transformerLoading, 0)}</dd><dt className="text-slate-500">Line losses</dt><dd>{r.grid.annualLineLossMwh == null ? 'not estimated' : fmt(r.grid.annualLineLossMwh, 'MWh/yr')}</dd><dt className="text-slate-500">Curtailed</dt><dd>{fmt(s.curtailSolarMwh + s.curtailWindMwh, 'MWh')}</dd></dl>
          <ul className="mt-2 space-y-1 text-[12px]">{r.grid.issues.map((i: R) => <li key={i.message} className={i.severity === 'block' ? 'text-red-500' : i.severity === 'warning' ? 'text-amber-600' : 'text-slate-500'}>{i.message}</li>)}</ul>
        </Card>
        <Card title="Landed cost to the buyer" subtitle={`${inputs.state} → ${inputs.destinationState} · ${inputs.structure.replace(/_/g, ' ')}`}>
          <ul className="space-y-1 text-[13px]">{r.landed.lines.map((l: R) => <li key={l.key} className="flex justify-between gap-2"><span>{l.label} <span className="text-slate-400">({l.jurisdiction})</span></span><span className="tabular-nums">₹{l.perKwhReceived.toFixed(3)}/kWh {l.provenance === 'illustrative' && <Badge tone="amber">Illustrative</Badge>}</span></li>)}</ul>
          <p className="mt-2 text-[13px]">Energy received {pctN(r.landed.energyReceivedMwh / Math.max(1, r.landed.energyInjectedMwh))} of injected after losses. Landed <strong>₹{r.landed.landedRsKwh.toFixed(2)}/kWh</strong> vs present tariff ₹{r.consumerTariff}.</p>
          {r.landed.flags.map((x: string) => <p key={x} className="mt-1 text-[12px] text-amber-600">{x}</p>)}
        </Card>
      </div>
      <Card title="Project cash flow" subtitle={`₹ crore. Capex ${cr(f.capex.total, 0)} · NPV ${cr(f.npvCr, 0)} · LCOE ₹${f.lcoeRsKwh.toFixed(2)}/kWh · LCOS ${f.lcosRsKwh == null ? '—' : `₹${f.lcosRsKwh.toFixed(2)}/kWh`} · break-even average tariff ${f.breakEvenTariffRsKwh == null ? '—' : `₹${f.breakEvenTariffRsKwh.toFixed(2)}/kWh`} · payback ${f.paybackYear ?? '> term'}`}>
        <div className="h-[260px]"><ResponsiveContainer>
          <ComposedChart data={f.years}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="year" fontSize={11} /><YAxis yAxisId="cr" fontSize={11} unit=" cr" width={64} /><YAxis yAxisId="d" orientation="right" fontSize={11} width={40} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="cr" dataKey="ebitdaCr" name="EBITDA (₹ cr)" fill={C.wind} isAnimationActive={false} /><Bar yAxisId="cr" dataKey="equityCfCr" name="Equity cash flow (₹ cr)" fill={C.batR} isAnimationActive={false} /><Bar yAxisId="cr" dataKey="augmentationCr" name="BESS augmentation (₹ cr)" fill={C.uns} isAnimationActive={false} />
            <Line yAxisId="d" dataKey="dscr" name="DSCR" stroke={C.load} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer></div>
        <ul className="mt-2 list-disc pl-5 text-[12px] text-slate-500">{f.notes.map((n: string) => <li key={n}>{n}</li>)}</ul>
      </Card>
      <p className="text-[12px] text-slate-500">Data: {r.sources.solar}. Wind: {r.sources.wind}{r.sources.windCuf ? ` (resulting CUF ${pctN(r.sources.windCuf.value)} on ${r.sources.windCuf.denominator})` : ''}.</p>
    </div>
  );
}
