'use client';
import { useState } from 'react';
import { Button, Card, DataTable, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ChartCard, ColumnChart, DonutChart, HBarChart } from '@/components/Charts';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface Rep { from: string; to: string; total: number; funnel: { name: string; reached: number }[]; partners: { partner: string; introduced: number; signed: number; active: number }[]; sources: { source: string; n: number }[]; countries: { country: string; n: number }[] }

/** Conversion, partner performance and source attribution — exportable with permission checks. */
export default function Eb5Reports() {
  const [r, setR] = useState({ from: '', to: '', country: '' });
  const q = useQuery<Rep>('/eb5/reports', { from: r.from || undefined, to: r.to || undefined, country: r.country || undefined });
  const csv = async () => {
    const text = await api.request<string>('GET', `/eb5/reports?format=csv${r.from ? `&from=${r.from}` : ''}${r.to ? `&to=${r.to}` : ''}${r.country ? `&country=${encodeURIComponent(r.country)}` : ''}`);
    const url = URL.createObjectURL(new Blob([typeof text === 'string' ? text : JSON.stringify(text)], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'go-eb5-partners.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const d = q.data;
  return (
    <Screen page={{ key: 'eb5-reports', title: 'GO EB5 reports', access: 'authenticated' }} eyebrow="GO EB5" description="Lead conversion, partner performance and source attribution. Possible duplicates are excluded. Exports are recorded in the audit log."
      actions={<><Button variant="secondary" onClick={csv}>Export CSV</Button><Button variant="ghost" onClick={() => window.print()}>Print / save as PDF</Button></>}>
      <div className="cz-ugp-filters" role="group" aria-label="Report filters">
        <label className="cz-mini-field">From<input type="date" aria-label="From" value={r.from} onChange={(e) => setR({ ...r, from: e.target.value })} /></label>
        <label className="cz-mini-field">To<input type="date" aria-label="To" value={r.to} onChange={(e) => setR({ ...r, to: e.target.value })} /></label>
        <label className="cz-mini-field">Country<input aria-label="Country" value={r.country} onChange={(e) => setR({ ...r, country: e.target.value })} placeholder="All" /></label>
      </div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : <>
        <div className="cz-chart-row">
          <ChartCard title="Conversion funnel" subtitle={`${d.total} leads reached each stage`}><ColumnChart caption="Leads reaching each stage" height={200} data={d.funnel.filter((_, i) => [0, 3, 4, 6, 8, 10, 11].includes(i)).map((f) => ({ label: f.name.replace('Consultation ', 'Consult. ').slice(0, 14), value: f.reached }))} /></ChartCard>
          <ChartCard title="Lead sources"><DonutChart caption="Lead sources" centre={{ value: String(d.total), label: 'leads' }} data={d.sources.map((s) => ({ label: s.source.replace('_', ' '), value: s.n }))} /></ChartCard>
          <ChartCard title="Leads by country"><HBarChart caption="Leads by country" data={d.countries.map((c) => ({ label: c.country, value: c.n }))} /></ChartCard>
        </div>
        <Card title="Partner performance">
          <DataTable rows={d.partners.map((p) => ({ ...p, id: p.partner }))} caption="Partner performance" columns={[
            { key: 'p', header: 'Partner', render: (p) => p.partner }, { key: 'i', header: 'Introduced', render: (p) => p.introduced }, { key: 's', header: 'Agreements signed', render: (p) => p.signed }, { key: 'a', header: 'Active engagements', render: (p) => p.active },
          ]} />
        </Card>
      </>}
    </Screen>
  );
}
