'use client';
import { useState } from 'react';
import { sectorName } from '@collabiz/types';
import { Alert, Button, Card, EmptyState, LoadingState, PageHeader, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Lead { id: string; source: string; title: string; link: string | null; buyer: string | null; summary: string | null; closesAt: string | null; sector: string | null; status: string; matchingPartners: number }
interface R { autoFetch: { connected: boolean; note: string }; leads: Lead[] }
const TONE: Record<string, 'info' | 'success' | 'neutral'> = { new: 'info', shortlisted: 'success', dismissed: 'neutral' };

/** Tender feed — public tenders imported from a feed file for Unite to review and pass to matching partners. */
export default function TenderFeed() {
  const q = useQuery<R>('/admin/tender-leads');
  const [source, setSource] = useState('CPPP');
  const [show, setShow] = useState('new');
  const up = useMutation(async (file: File) => { const fd = new FormData(); fd.append('source', source); fd.append('file', file); const r = await api.upload<{ added: number; skipped: number }>('/admin/tender-feed', fd); q.reload(); return r; });
  const fetch = useMutation(async () => api.post('/admin/tender-feed/fetch'));
  const set = useMutation(async (a: { id: string; status: string }) => { await api.post(`/admin/tender-leads/${a.id}/status`, { status: a.status }); q.reload(); return true; });
  const rows = q.data?.leads.filter((l) => show === 'all' || l.status === show) ?? [];
  return (
    <div className="cz-stack" style={{ gap: 18 }}>
      <PageHeader title="Tender feed" breadcrumb="Opportunities & routing" description="Public tenders read from a feed file (RSS or Atom from CPPP, GeM or a state portal). Review them and shortlist the ones worth sending to partners. Nothing reaches partners automatically." />
      <Card title="Import a feed file">
        <div className="cz-row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 200 }}><TextInput label="Source name" value={source} onChange={(e) => setSource(e.target.value)} /></div>
          <input type="file" accept=".xml,.rss,application/rss+xml,application/xml,text/xml" aria-label="Feed file (RSS or XML)" onChange={(e) => { const f = e.target.files?.[0]; if (f) up.run(f); e.target.value = ''; }} />
          <Button variant="secondary" onClick={() => fetch.run()} loading={fetch.pending}>Fetch automatically</Button>
        </div>
        {up.data && <Alert tone="success">{up.data.added} new {up.data.added === 1 ? 'tender' : 'tenders'} added{up.data.skipped ? `, ${up.data.skipped} already imported or without a title` : ''}.</Alert>}
        {(up.error || fetch.error) && <Alert tone={fetch.error ? 'info' : 'danger'}>{up.error ?? fetch.error}</Alert>}
        {q.data && !q.data.autoFetch.connected && <p className="cz-muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>Automatic fetching is not connected: {q.data.autoFetch.note}</p>}
      </Card>
      <div style={{ maxWidth: 240 }}><Select label="Show" value={show} onChange={(e) => setShow(e.target.value)} options={[{ value: 'new', label: 'New' }, { value: 'shortlisted', label: 'Shortlisted' }, { value: 'dismissed', label: 'Dismissed' }, { value: 'all', label: 'All' }]} /></div>
      <Card>{q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !rows.length ? <EmptyState icon="tenders" title="No tenders here" /> : (
        <ul className="cz-ws-list">{rows.map((l) => (
          <li key={l.id} data-lead={l.title.slice(0, 40)} style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ flex: '1 1 360px' }}>{l.link ? <a href={l.link} target="_blank" rel="noopener noreferrer"><strong>{l.title}</strong></a> : <strong>{l.title}</strong>}<br />
              <span className="cz-muted" style={{ fontSize: 13 }}>{l.source}{l.buyer ? ` · ${l.buyer}` : ''}{l.closesAt ? ` · closes ${new Date(l.closesAt).toLocaleDateString('en-IN')}` : ''} · {l.sector ? `${sectorName(l.sector)} · ${l.matchingPartners} verified ${l.matchingPartners === 1 ? 'partner' : 'partners'} in this sector` : 'sector not recognised'}</span></span>
            <span className="cz-row" style={{ gap: 8 }}><StatusBadge status={l.status} tone={TONE[l.status]} />
              {l.status !== 'shortlisted' && <Button size="sm" onClick={() => set.run({ id: l.id, status: 'shortlisted' })}>Shortlist</Button>}
              {l.status !== 'dismissed' && <Button size="sm" variant="ghost" onClick={() => set.run({ id: l.id, status: 'dismissed' })}>Dismiss</Button>}</span>
          </li>
        ))}</ul>
      )}</Card>
    </div>
  );
}
