'use client';
import { useState } from 'react';
import { Icon, Segmented, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface A { asOf: string; funnel: { registered: number; submitted: number; verified: number }; opportunities: { route: string; status: string; count: number; value: number }[]; routing: { total: number; withinSla: number; breached: number; open: number }; leads: { total: number; protected: number; contested: number }; ledger: { status: string; count: number; amount: number }[]; support: { total: number; onTime: number; escalated: number; csat: number | null }; tenders: { total: number; awarded: number; bids: number }; projects: { total: number; active: number; certified: number; onTime: number }; series: { month: string; partners: number; opportunities: number; leads: number; paid: number }[]; ai: { kind: string; count: number; useful: number; rejected: number }[] }
const inr = (m: number) => { const r = m / 100; return r >= 1e7 ? `₹${(r / 1e7).toFixed(1)} Cr` : r >= 1e5 ? `₹${(r / 1e5).toFixed(1)} L` : `₹${Math.round(r).toLocaleString('en-IN')}`; };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const LEDGER = ['estimated', 'eligible', 'earned', 'approved', 'invoiced', 'paid', 'disputed', 'on_hold', 'reversed'];

/** Screen 139 — Performance analytics & BI. Aggregates only; no personal data. */
export default function Analytics() {
  const [months, setMonths] = useState('6');
  const [metric, setMetric] = useState<'partners' | 'opportunities' | 'leads' | 'paid'>('partners');
  const q = useQuery<A>('/admin/analytics', { months });
  const d = q.data;
  const max = d ? Math.max(1, ...d.series.map((s) => s[metric])) : 1;
  const csv = () => {
    if (!d) return;
    const lines = ['month,partners,opportunities,leads,commission_paid_inr', ...d.series.map((s) => `${s.month},${s.partners},${s.opportunities},${s.leads},${s.paid / 100}`)];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `collabiz-analytics-${d.asOf.slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Screen id="139" title="Analytics" description="How the network is performing — partner growth, Unite-first routing, delivery, money and support. Aggregates only; no personal data.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <Skeleton height={400} /> : (
        <div className="cz-ta">
          <div className="cz-ta-kpis">
            <div className="cz-ta-kpi" style={{ cursor: 'default' }}><span className="cz-ta-kpi-top"><span>Verified partners</span><Icon name="verify" size={16} /></span><strong>{d.funnel.verified}</strong><span className="cz-ta-kpi-hint">{d.funnel.registered} registered · {pct(d.funnel.verified, d.funnel.registered)} verified</span></div>
            <div className="cz-ta-kpi" style={{ cursor: 'default' }} data-tone={d.routing.breached ? 'warn' : undefined}><span className="cz-ta-kpi-top"><span>Unite-first reviews on time</span><Icon name="clock" size={16} /></span><strong>{pct(d.routing.withinSla, d.routing.withinSla + d.routing.breached)}</strong><span className="cz-ta-kpi-hint">{d.routing.breached} late · {d.routing.open} open</span></div>
            <div className="cz-ta-kpi" style={{ cursor: 'default' }}><span className="cz-ta-kpi-top"><span>Milestones on time</span><Icon name="projects" size={16} /></span><strong>{pct(d.projects.onTime, d.projects.certified)}</strong><span className="cz-ta-kpi-hint">{d.projects.certified} certified · {d.projects.active} active projects</span></div>
            <div className="cz-ta-kpi" style={{ cursor: 'default' }}><span className="cz-ta-kpi-top"><span>Support replies on time</span><Icon name="help" size={16} /></span><strong>{pct(d.support.onTime, d.support.total)}</strong><span className="cz-ta-kpi-hint">{d.support.escalated} escalated{d.support.csat != null ? ` · satisfaction ${d.support.csat}/5` : ''}</span></div>
          </div>
          <section className="cz-card" aria-labelledby="tr-h">
            <div className="cz-card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
              <h2 id="tr-h">Trend</h2>
              <div className="cz-row" style={{ gap: 8 }}>
                <Segmented label="Metric" value={metric} onChange={(v) => setMetric(v as never)} options={[{ value: 'partners', label: 'New partners' }, { value: 'opportunities', label: 'Opportunities' }, { value: 'leads', label: 'Leads' }, { value: 'paid', label: 'Commission paid' }]} />
                <Segmented label="Period" value={months} onChange={setMonths} options={[{ value: '6', label: '6 months' }, { value: '12', label: '12 months' }]} />
                <button type="button" className="cz-chip-btn" onClick={csv}><Icon name="download" size={14} />CSV</button>
              </div>
            </div>
            <ol className="cz-bars" aria-label={`${metric} by month`}>
              {d.series.map((s) => <li key={s.month}><span style={{ height: `${(s[metric] / max) * 100}%` }} aria-hidden /><strong>{metric === 'paid' ? inr(s.paid) : s[metric]}</strong>{new Date(`${s.month}-01`).toLocaleDateString('en-IN', { month: 'short' })}</li>)}
            </ol>
          </section>
          <div className="cz-perf">
            <section className="cz-card" aria-labelledby="led-h">
              <h2 id="led-h" className="cz-help-h">Commission ledger</h2>
              <table className="cz-ta-table"><caption className="cz-sr-only">Commission by state</caption><thead><tr><th scope="col">State</th><th scope="col" className="cz-num">Lines</th><th scope="col" className="cz-num">Amount</th></tr></thead>
                <tbody>{[...d.ledger].sort((a, b) => LEDGER.indexOf(a.status) - LEDGER.indexOf(b.status)).map((l) => <tr key={l.status} style={{ cursor: 'default' }}><td>{l.status.replace('_', ' ').replace(/^./, (c) => c.toUpperCase())}</td><td className="cz-num">{l.count}</td><td className="cz-num">{inr(l.amount)}</td></tr>)}</tbody></table>
            </section>
            <section className="cz-card" aria-labelledby="fn-h">
              <h2 id="fn-h" className="cz-help-h">Partner funnel & activity</h2>
              <dl className="cz-sheet-facts">
                <div><dt>Registered</dt><dd>{d.funnel.registered}</dd></div><div><dt>Submitted for verification</dt><dd>{d.funnel.submitted}</dd></div>
                <div><dt>Protected leads</dt><dd>{d.leads.protected} of {d.leads.total}</dd></div><div><dt>Contested leads</dt><dd>{d.leads.contested}</dd></div>
                <div><dt>Tenders awarded</dt><dd>{d.tenders.awarded} of {d.tenders.total}</dd></div><div><dt>Sealed bids</dt><dd>{d.tenders.bids}</dd></div>
                <div><dt>AI outputs reviewed useful</dt><dd>{d.ai.reduce((s, a) => s + a.useful, 0)} of {d.ai.reduce((s, a) => s + a.count, 0)}</dd></div>
                <div><dt>Open opportunity value</dt><dd>{inr(d.opportunities.filter((o) => ['accepted', 'released', 'qualification', 'proposal'].includes(o.status)).reduce((s, o) => s + o.value, 0))}</dd></div>
              </dl>
            </section>
          </div>
          <p className="cz-ai-prov"><Icon name="info" size={13} />Figures as of {new Date(d.asOf).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.</p>
        </div>
      )}
    </Screen>
  );
}
