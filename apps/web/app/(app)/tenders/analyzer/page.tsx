'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Card, EmptyState, LoadingState, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

const STATUS: Record<string, string> = { draft: 'Not reviewed', review_requested: 'Review requested', reviewed: 'Reviewed by Unite' };

/** Screen 170 — Tender eligibility analyzer: upload a tender PDF, see every condition with its page and line. */
export default function TenderAnalyzer() {
  const router = useRouter();
  const q = useQuery<{ id: string; title: string; pages: number; criteria: number; status: string; createdAt: string }[]>('/tender-analyses');
  const [title, setTitle] = useState('');
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const up = useMutation(async (file: File) => { const fd = new FormData(); fd.append('file', file); if (title) fd.append('title', title); const r = await api.upload<{ id: string }>('/tender-analyses', fd); router.push(`/tenders/analyzer/${r.id}`); return r; });
  return (
    <Screen page={{ key: 'tender-analyzer', title: 'Tender eligibility analyzer', access: 'partner' }} description="Upload a tender document. COLLABIZ finds the eligibility conditions — turnover, experience, certificates, registrations, equipment, manpower, EMD and deadlines — shows where each one is in the document, and compares them with your profile.">
      <Card title="Analyse a tender">
        <TextInput label="Tender name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="cz-drop" data-over={over || undefined} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) up.run(f); }}>
          <strong>Drop the tender PDF here</strong>
          <span className="cz-muted" style={{ fontSize: 13 }}>NIT, RFP or bid document — up to 15 MB. Scanned PDFs without text cannot be read yet.</span>
          <input ref={ref} type="file" accept="application/pdf" aria-label="Tender document (PDF)" onChange={(e) => { const f = e.target.files?.[0]; if (f) up.run(f); }} />
          {up.pending && <span className="cz-muted">Reading the document…</span>}
        </div>
        {up.error && <Alert tone="danger">{up.error}</Alert>}
        <p className="cz-muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>Results are indicative. You can ask a Unite reviewer to confirm them against the original document.</p>
      </Card>
      <Card title="Your analyses">
        {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.length ? <EmptyState icon="tenders" title="No tenders analysed yet" /> : (
          <ul className="cz-ws-list">{q.data.map((a) => <li key={a.id} data-analysis={a.title}><span><Link href={`/tenders/analyzer/${a.id}`}><strong>{a.title}</strong></Link><br /><span className="cz-muted" style={{ fontSize: 13 }}>{a.criteria} conditions · {a.pages} pages · {new Date(a.createdAt).toLocaleDateString('en-IN')}</span></span><StatusBadge status={a.status} label={STATUS[a.status]} /></li>)}</ul>
        )}
      </Card>
    </Screen>
  );
}
