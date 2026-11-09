'use client';
import { useState } from 'react';
import { PILOT_CONTINUE_LABELS, PILOT_FEATURE_LABELS } from '@collabiz/types';
import { Alert, Button, Card, EmptyState, LoadingState, PageHeader, Segmented } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Comment { id: string; createdAt: string; name: string; organization: string | null; platform: string; usefulness: number; ease: number; recommend: number; continueUse: string; used: string[]; mostValuable: string | null; blockers: string | null; wishlist: string | null; contact: string | null }
interface Results {
  days: number; responses: number; respondents: number; organizations: number; usefulness: number | null; ease: number | null; nps: number | null;
  continueUse: { yes: number; maybe: number; no: number }; used: { feature: string; count: number }[]; platforms: { web: number; mobile: number };
  weekly: { week: string; responses: number; usefulness: number | null; nps: number | null }[]; comments: Comment[];
}
const day = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function download(r: Results) {
  const head = ['Date', 'Name', 'Organisation', 'Platform', 'Usefulness (1-5)', 'Ease (1-5)', 'Recommend (0-10)', 'Keep using', 'Used', 'Most valuable', 'Blockers', 'Wishlist', 'Contact'];
  const rows = r.comments.map((c) => [c.createdAt.slice(0, 10), c.name, c.organization, c.platform, c.usefulness, c.ease, c.recommend, PILOT_CONTINUE_LABELS[c.continueUse], c.used.map((u) => PILOT_FEATURE_LABELS[u] ?? u).join('; '), c.mostValuable, c.blockers, c.wishlist, c.contact]);
  const blob = new Blob([[head, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `pilot-feedback-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(a.href);
}

/** Pilot results — what pilot partners say each week: usefulness, ease, recommendation score, blockers and requests. */
export default function PilotResults() {
  const [days, setDays] = useState('90');
  const q = useQuery<Results>(`/admin/pilot-feedback?days=${days}`);
  const r = q.data;
  const remind = useMutation(async () => api.post<{ reminded: number; alreadyAnswered: number }>('/admin/pilot-feedback/remind', {}));
  const maxUsed = Math.max(1, ...(r?.used.map((u) => u.count) ?? [1]));
  const total = r ? r.continueUse.yes + r.continueUse.maybe + r.continueUse.no : 0;
  return (
    <div>
      <PageHeader title="Pilot feedback" breadcrumb="Unite Group Administration"
        description="Weekly check-ins from pilot partners. Use it in the pilot review: are partners finding it useful, what blocks them, and would they keep using it?"
        actions={<div className="cz-row" style={{ gap: 8 }}>
          <Button variant="secondary" loading={remind.pending} onClick={() => remind.run()}>Send reminder</Button>
          {r && r.responses > 0 && <Button variant="secondary" onClick={() => download(r)}>Download CSV</Button>}
        </div>} />
      {remind.data && <Alert tone="success">Reminder sent to {remind.data.reminded} partner {remind.data.reminded === 1 ? 'contact' : 'contacts'} who haven’t checked in this week ({remind.data.alreadyAnswered} already have).</Alert>}
      {remind.error && <Alert tone="danger">{remind.error}</Alert>}
      <div style={{ marginBottom: 14 }}>
        <Segmented label="Period" value={days} onChange={setDays} options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
      </div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !r ? <LoadingState /> : !r.responses ? (
        <Card><EmptyState icon="messages" title="No check-ins in this period">Pilot partners send check-ins from Help &amp; support → Pilot check-in, on the web or in the mobile app.</EmptyState></Card>
      ) : (
        <div className="cz-stack cz-pilot-results" style={{ gap: 16 }}>
          <div className="cz-pilot-kpis" aria-label="Summary">
            <div className="cz-card"><span className="cz-muted">Check-ins</span><strong>{r.responses}</strong><span className="cz-muted">{r.respondents} people · {r.organizations} partners</span></div>
            <div className="cz-card"><span className="cz-muted">Usefulness</span><strong>{r.usefulness ?? '—'} <small style={{ fontSize: 14 }}>/ 5</small></strong><span className="cz-muted">Pilot target 4.0</span></div>
            <div className="cz-card"><span className="cz-muted">Ease of use</span><strong>{r.ease ?? '—'} <small style={{ fontSize: 14 }}>/ 5</small></strong><span className="cz-muted">Pilot target 3.5</span></div>
            <div className="cz-card"><span className="cz-muted">Recommendation score</span><strong>{r.nps ?? '—'}</strong><span className="cz-muted">% promoters − % detractors (target ≥ 20)</span></div>
            <div className="cz-card"><span className="cz-muted">Would keep using</span><strong>{total ? Math.round((r.continueUse.yes / total) * 100) : 0}%</strong><span className="cz-muted">{r.continueUse.maybe} not sure · {r.continueUse.no} no</span></div>
          </div>
          <div className="cz-pilot-grid">
            <Card title="What partners used">
              <div className="cz-stack" style={{ gap: 8 }}>
                {r.used.map((u) => <div key={u.feature} className="cz-pilot-bar"><span>{PILOT_FEATURE_LABELS[u.feature] ?? u.feature}</span><span><i style={{ width: `${(u.count / maxUsed) * 100}%` }} /></span><span>{u.count}</span></div>)}
              </div>
            </Card>
            <Card title="Week by week">
              <div className="cz-table-wrap"><table className="cz-table">
                <thead><tr><th scope="col">Week of</th><th scope="col">Check-ins</th><th scope="col">Usefulness</th><th scope="col">Recommendation</th></tr></thead>
                <tbody>{r.weekly.map((w) => <tr key={w.week}><td>{day(w.week)}</td><td>{w.responses}</td><td>{w.usefulness ?? '—'}</td><td>{w.nps ?? '—'}</td></tr>)}</tbody>
              </table></div>
              <p className="cz-muted" style={{ fontSize: 13, marginBottom: 0 }}>Web {r.platforms.web} · Mobile app {r.platforms.mobile}</p>
            </Card>
          </div>
          <Card title={`What partners wrote (${r.comments.filter((c) => c.blockers || c.wishlist || c.mostValuable).length})`}>
            <ul className="cz-stack" style={{ gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
              {r.comments.filter((c) => c.blockers || c.wishlist || c.mostValuable).map((c) => (
                <li key={c.id} className="cz-card cz-pilot-comment">
                  <span><strong>{c.name}</strong>{c.organization ? ` · ${c.organization}` : ''} <span className="cz-muted">· {day(c.createdAt)} · {c.platform === 'mobile' ? 'Mobile app' : 'Web'} · useful {c.usefulness}/5 · ease {c.ease}/5 · recommend {c.recommend}/10 · keep using: {PILOT_CONTINUE_LABELS[c.continueUse]}</span></span>
                  {c.blockers && <p><strong>Got in the way:</strong> {c.blockers}</p>}
                  {c.wishlist && <p><strong>Add or change:</strong> {c.wishlist}</p>}
                  {c.mostValuable && <p><strong>Most valuable:</strong> {c.mostValuable}</p>}
                  {c.contact ? <span className="cz-muted">May be contacted: <a href={`mailto:${c.contact}`}>{c.contact}</a></span> : <span className="cz-muted">Did not agree to be contacted</span>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
