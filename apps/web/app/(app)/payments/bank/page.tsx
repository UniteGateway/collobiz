'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Alert, Card, EmptyState, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { EarningsTabs } from '@/components/Finance';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface S { id: string; fileName: string; company: string; periodFrom: string | null; periodTo: string | null; lineCount: number; matched: number; suggested: number; unmatched: number; ignored: number; createdAt: string }
const d = (x: string | null) => (x ? new Date(x).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Bank statement import — upload your own statement; COLLABIZ suggests which invoice each credit or debit settles. */
export default function BankStatements() {
  const router = useRouter();
  const q = useQuery<S[]>('/finance/bank-statements');
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const up = useMutation(async (file: File) => { const fd = new FormData(); fd.append('file', file); const r = await api.upload<{ id: string }>('/finance/bank-statements', fd); router.push(`/payments/bank/${r.id}`); return r; });
  return (
    <Screen page={{ key: 'bank-statements', title: 'Bank statements', access: 'partner' }} description="Upload your company’s bank statement to match payments to project invoices. COLLABIZ reads only the file you upload — it is not connected to your bank.">
      <EarningsTabs />
      <Card title="Import a statement">
        <div className="cz-drop" data-over={over || undefined} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) up.run(f); }}>
          <strong>Drop the statement here</strong>
          <span className="cz-muted" style={{ fontSize: 13 }}>CSV or Excel (.xlsx) as downloaded from net banking — up to 15 MB. Old .xls files: save as .xlsx first.</span>
          <input ref={ref} type="file" accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Bank statement (CSV or Excel)" onChange={(e) => { const f = e.target.files?.[0]; if (f) up.run(f); }} />
          {up.pending && <span className="cz-muted">Reading the statement…</span>}
        </div>
        {up.error && <Alert tone="danger">{up.error}</Alert>}
        <p className="cz-muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>Credits you match are reported to the client, who confirms them before they count as received.</p>
      </Card>
      <Card title="Imported statements">
        {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.length ? <EmptyState icon="earnings" title="No statements imported yet" /> : (
          <ul className="cz-ws-list">{q.data.map((s) => (
            <li key={s.id} data-statement={s.fileName}><span><Link href={`/payments/bank/${s.id}`}><strong>{s.fileName}</strong></Link><br /><span className="cz-muted" style={{ fontSize: 13 }}>{s.company} · {d(s.periodFrom)} – {d(s.periodTo)} · {s.lineCount} transactions</span></span>
              <span className="cz-muted" style={{ fontSize: 13 }}>{s.matched} matched · {s.suggested} to review · {s.unmatched} unmatched</span></li>
          ))}</ul>
        )}
      </Card>
    </Screen>
  );
}
