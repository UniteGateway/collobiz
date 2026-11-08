'use client';
import { useEffect, useState } from 'react';
import { COUNTRIES, SECTORS } from '@collabiz/types';
import { Alert, Icon, Segmented, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface Check { route: { direction: string; originName: string; destinationName: string }; items: { key: string; label: string; detail: string; done: boolean }[]; disclaimer: string }

/** Screen 126 — Cross-border compliance checklist: what to prepare for a route. Guidance, not legal advice. */
export default function Compliance() {
  const [enquiryId, setEnquiryId] = useState<string | null>(null);
  const [route, setRoute] = useState({ direction: 'export', other: 'AE', sector: 'power_equipment' });
  useEffect(() => { setEnquiryId(new URLSearchParams(window.location.search).get('enquiryId')); }, []);
  const query = enquiryId ? { enquiryId, sector: route.sector } : { direction: route.direction, origin: route.direction === 'export' ? 'IN' : route.other, destination: route.direction === 'export' ? route.other : 'IN', sector: route.sector };
  const q = useQuery<Check>('/global/compliance', query);
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => { if (q.data) setDone(q.data.items.filter((i) => i.done).map((i) => i.key)); }, [q.data]);
  const toggle = async (k: string) => {
    const next = done.includes(k) ? done.filter((x) => x !== k) : [...done, k];
    setDone(next);
    if (enquiryId) await api.put(`/global/enquiries/${enquiryId}/checklist`, { done: next }).catch(() => {});
  };
  const items = q.data?.items ?? [];
  return (
    <Screen id="126" title="Cross-border checklist" description="Documents and approvals to prepare before goods move. Tick items off as you go.">
      {!enquiryId && (
        <div className="cz-ai-query">
          <div><span className="cz-sched-label">Direction</span><Segmented label="Direction" value={route.direction} onChange={(v) => setRoute({ ...route, direction: v })} options={[{ value: 'export', label: 'Export' }, { value: 'import', label: 'Import' }]} /></div>
          <label className="cz-sched-label">{route.direction === 'export' ? 'Destination' : 'Origin'}<select className="cz-select" value={route.other} onChange={(e) => setRoute({ ...route, other: e.target.value })}>{COUNTRIES.filter(([c]) => c !== 'IN').map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
          <label className="cz-sched-label">Sector<select className="cz-select" value={route.sector} onChange={(e) => setRoute({ ...route, sector: e.target.value })}>{SECTORS.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
        </div>
      )}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={300} /> : (
        <>
          <Alert tone="warning" title="Guidance only.">{q.data.disclaimer}</Alert>
          <section className="cz-card" aria-labelledby="cl-h">
            <div className="cz-card-head"><h2 id="cl-h">{q.data.route.direction === 'export' ? 'Export' : 'Import'} · {q.data.route.originName} → {q.data.route.destinationName}</h2><span className="cz-muted">{done.length} of {items.length} ready</span></div>
            <div className="cz-factor-track" aria-hidden><span style={{ width: `${items.length ? (done.length / items.length) * 100 : 0}%` }} /></div>
            <ul className="cz-checklist-big">
              {items.map((i) => (
                <li key={i.key}>
                  <label data-done={done.includes(i.key) || undefined}>
                    <input type="checkbox" checked={done.includes(i.key)} onChange={() => toggle(i.key)} />
                    <span className="cz-check-box" aria-hidden>{done.includes(i.key) && <Icon name="check" size={14} />}</span>
                    <span><strong>{i.label}</strong><span className="cz-muted">{i.detail}</span></span>
                  </label>
                </li>
              ))}
            </ul>
            {!enquiryId && <p className="cz-muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>Ticks here aren’t saved. Open the checklist from an enquiry to keep your progress.</p>}
          </section>
        </>
      )}
    </Screen>
  );
}
