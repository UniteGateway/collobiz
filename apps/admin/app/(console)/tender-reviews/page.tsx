'use client';
import { useState } from 'react';
import { CRITERION_LABELS } from '@collabiz/types';
import { Alert, Button, Card, Dialog, EmptyState, LoadingState, PageHeader, StatusBadge, TextArea } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Item { id: string; title: string; organization: string; pages: number; criteria: number; status: string; createdAt: string }
interface Row { id: string; kind: keyof typeof CRITERION_LABELS; label: string; page: number; line: number; text: string; status: string }

/** Tender eligibility reviews — a Unite reviewer checks extracted conditions against the original document and confirms. */
export default function TenderReviews() {
  const q = useQuery<Item[]>('/admin/tender-analyses');
  const [open, setOpen] = useState<Item | null>(null);
  return (
    <div className="cz-stack" style={{ gap: 18 }}>
      <PageHeader title="Tender eligibility reviews" breadcrumb="Tenders" description="Partners ask Unite to confirm the conditions COLLABIZ extracted from a tender. Check each one against the original document before confirming." />
      <Card>{q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.length ? <EmptyState icon="tenders" title="No reviews requested" /> : (
        <ul className="cz-ws-list">{q.data.map((a) => (
          <li key={a.id} data-review={a.title}><span><strong>{a.title}</strong><br /><span className="cz-muted" style={{ fontSize: 13 }}>{a.organization} · {a.criteria} conditions · {a.pages} pages · {new Date(a.createdAt).toLocaleDateString('en-IN')}</span></span>
            <StatusBadge status={a.status} tone={a.status === 'reviewed' ? 'success' : 'warning'} label={a.status === 'reviewed' ? 'Reviewed' : 'Waiting'} />
            {a.status === 'review_requested' && <Button size="sm" onClick={() => setOpen(a)}>Review</Button>}</li>
        ))}</ul>
      )}</Card>
      <Review item={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); q.reload(); }} />
    </div>
  );
}

function Review({ item, onClose, onDone }: { item: Item | null; onClose: () => void; onDone: () => void }) {
  const d = useQuery<{ rows: Row[] }>(item ? `/tender-analyses/${item.id}` : null);
  const [note, setNote] = useState('');
  const save = useMutation(async () => { await api.post(`/tender-analyses/${item!.id}/review`, { note }); setNote(''); onDone(); return true; });
  return (
    <Dialog open={!!item} onClose={onClose} title={item ? `Review: ${item.title}` : 'Review'}>
      <div className="cz-stack" style={{ gap: 10 }}>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        {!d.data ? <LoadingState /> : <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, maxHeight: 280, overflow: 'auto' }}>{d.data.rows.map((r) => <li key={r.id}><strong>{CRITERION_LABELS[r.kind]}: {r.label}</strong> — p.{r.page} l.{r.line}: “{r.text}”</li>)}</ul>}
        <TextArea label="What you checked and any corrections" rows={4} value={note} onChange={(e) => setNote(e.target.value)} error={save.fieldErrors.note} />
        <div><Button onClick={() => save.run()} loading={save.pending} disabled={note.trim().length < 10}>Confirm review</Button></div>
      </div>
    </Dialog>
  );
}
