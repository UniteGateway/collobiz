'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { FRANCHISE_FORMAT_LABELS, FRANCHISE_STATUS_LABELS, INDIA_STATES } from '@collabiz/types';
import { Alert, Button, Card, DescriptionList, LoadingState, PageHeader, StatusBadge, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { WorkspaceNav, inr } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Unit { id: string; code: string; brand: string; franchisee: string; format: string; city: string; region: string; message: string; status: string; fee: number | null; royaltyBps: number | null; monthlyTarget: number | null; decisionNote: string | null; openedAt: string | null; createdAt: string; next: string[]; checklist: { key: string; label: string; doneAt: string | null }[]; reports: { month: string; sales: number; orders: number; royalty: number }[] }
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function FranchiseUnit() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Unit>(`/admin/franchise/${id}`);
  const [f, setF] = useState({ note: '', fee: '', royalty: '', target: '' });
  const act = useMutation(async (body: Record<string, unknown>, path = 'status') => { const r = await api.post(`/admin/franchise/${id}/${path}`, body); q.reload(); return r; });
  const u = q.data;
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  if (!u) return <LoadingState />;
  const toPaise = (v: string) => (v ? Math.round(Number(v) * 100) : undefined);
  const decide = (status: string) => act.run({ status, note: f.note || undefined, ...(status === 'approved' ? { fee: toPaise(f.fee), royaltyBps: f.royalty ? Math.round(Number(f.royalty) * 100) : undefined, monthlyTarget: toPaise(f.target) } : {}) });
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <PageHeader title={`${u.brand} — ${u.city}`} breadcrumb="Franchise network" description={`${u.franchisee} · ${FRANCHISE_FORMAT_LABELS[u.format]} · ${u.code}`} actions={<StatusBadge status={u.status} label={FRANCHISE_STATUS_LABELS[u.status]} />} />
      {act.error && <Alert tone="danger">{act.error}</Alert>}
      <div className="cz-ws-cols">
        <div className="cz-ws">
          <Card title="Application">
            <DescriptionList items={[['Franchisee', u.franchisee], ['Where', `${u.city}, ${INDIA_STATES.find(([c]) => c === u.region)?.[1] ?? u.region}`], ['Applied', day(u.createdAt)], ['What they wrote', u.message],
              ['Fee', u.fee != null ? inr(u.fee) : 'Not set'], ['Royalty', u.royaltyBps != null ? `${u.royaltyBps / 100}% of sales` : 'Not set'], ['Monthly target', u.monthlyTarget != null ? inr(u.monthlyTarget) : 'Not set'], ['Opened', day(u.openedAt)], ...(u.decisionNote ? [['Last note', u.decisionNote] as [string, string]] : [])]} />
          </Card>
          <Card title="Monthly sales">
            {!u.reports.length ? <p className="cz-muted" style={{ margin: 0 }}>No sales reported yet.</p> : (
              <div className="cz-table-wrap"><table className="cz-table"><caption className="cz-sr-only">Monthly sales</caption>
                <thead><tr><th scope="col">Month</th><th scope="col" style={{ textAlign: 'right' }}>Sales</th><th scope="col" style={{ textAlign: 'right' }}>Orders</th><th scope="col" style={{ textAlign: 'right' }}>Royalty</th></tr></thead>
                <tbody>{u.reports.map((r) => <tr key={r.month}><td>{r.month}</td><td style={{ textAlign: 'right' }}>{inr(r.sales)}</td><td style={{ textAlign: 'right' }}>{r.orders}</td><td style={{ textAlign: 'right' }}>{inr(r.royalty)}</td></tr>)}</tbody>
              </table></div>
            )}
          </Card>
        </div>
        <aside className="cz-ws-side">
          {u.next.length > 0 && (
            <Card title="Next step">
              <div className="cz-stack" style={{ gap: 10 }}>
                {u.next.includes('approved') && (
                  <>
                    <TextInput label="Franchise fee (₹)" inputMode="numeric" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value.replace(/[^\d.]/g, '') })} />
                    <TextInput label="Royalty (% of sales)" inputMode="decimal" value={f.royalty} onChange={(e) => setF({ ...f, royalty: e.target.value.replace(/[^\d.]/g, '') })} error={act.fieldErrors.royaltyBps} />
                    <TextInput label="Monthly sales target (₹, optional)" inputMode="numeric" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value.replace(/[^\d.]/g, '') })} />
                  </>
                )}
                <TextInput label="Note to the franchisee (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
                <div className="cz-row" style={{ gap: 8 }}>{u.next.map((s) => <Button key={s} size="sm" variant={['rejected', 'closed', 'suspended'].includes(s) ? 'secondary' : 'primary'} loading={act.pending} onClick={() => decide(s)}>{s === 'approved' ? 'Approve' : s === 'rejected' ? 'Decline' : s === 'live' ? 'Go live' : FRANCHISE_STATUS_LABELS[s]}</Button>)}</div>
              </div>
            </Card>
          )}
          {!['applied', 'rejected', 'closed'].includes(u.status) && (
            <Card title="Set-up checklist">
              <ul className="cz-ws-list">{u.checklist.map((c) => (
                <li key={c.key}><span>{c.label}{c.doneAt ? <><br /><span className="cz-muted" style={{ fontSize: 12 }}>Done {day(c.doneAt)}</span></> : null}</span>
                  <button type="button" role="switch" aria-checked={!!c.doneAt} aria-label={c.label} className="cz-switch" data-on={c.doneAt ? true : undefined} onClick={() => act.run({ key: c.key, done: !c.doneAt }, 'checklist')}><span /></button></li>
              ))}</ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
