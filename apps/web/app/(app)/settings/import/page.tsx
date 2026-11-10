'use client';
import { useRef, useState } from 'react';
import { CONSENT_BASES, SECTORS } from '@collabiz/types';
import { Alert, Button, Card, EmptyState, LoadingState, Select, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type Target = 'customers' | 'products';
interface Summary { ready: number; existing: number; rejected: number; missing: string[]; issues: { row: number; field: string; message: string }[]; sample: Record<string, string | number | null>[] }
interface Preview extends Summary { id: string; target: Target; source: string; fileName: string; header: number; mapping: Record<string, number>; columns: string[]; preview: string[][]; rowCount: number; fields: { key: string; label: string; required: boolean; hint?: string }[] }
interface Past { id: string; target: Target; source: string; fileName: string; status: string; created: number; skippedExisting: number; rejected: number; createdAt: string }
const TARGETS: Record<Target, string> = { customers: 'Customers (CRM)', products: 'Products (trading catalogue)' };

/** Import data — customers or products from CSV, Excel (.xlsx) or a Tally XML export. Nothing is saved until you confirm. */
export default function ImportData() {
  const hist = useQuery<Past[]>('/imports');
  const [target, setTarget] = useState<Target>('customers');
  const [p, setP] = useState<Preview | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [sum, setSum] = useState<Summary | null>(null);
  const [consent, setConsent] = useState('');
  const [sector, setSector] = useState('');
  const [done, setDone] = useState<{ created: number; skippedExisting: number; rejected: number } | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const up = useMutation(async (file: File) => {
    const fd = new FormData(); fd.append('target', target); fd.append('file', file);
    const r = await api.upload<Preview>('/imports/preview', fd);
    setP(r); setMap(r.mapping); setSum(r); setDone(null);
    return r;
  });
  const recheck = useMutation(async (m: Record<string, number>) => { const r = await api.post<Summary>(`/imports/${p!.id}/check`, { header: p!.header, mapping: m }); setSum(r); return r; });
  const commit = useMutation(async () => {
    const r = await api.post<{ created: number; skippedExisting: number; rejected: number }>(`/imports/${p!.id}/commit`, { target: p!.target, header: p!.header, mapping: map, ...(p!.target === 'customers' ? { consentBasis: consent } : { sector }) });
    setDone(r); setP(null); hist.reload(); return r;
  });
  const setCol = (key: string, v: string) => { const m = { ...map }; if (v === '') delete m[key]; else m[key] = Number(v); setMap(m); recheck.run(m); };
  return (
    <Screen page={{ key: 'import-data', title: 'Import data', access: 'partner' }} description="Bring your customers or products into COLLABIZ from a spreadsheet or from Tally. You see every row that will be added — and every row that will not, with the reason — before anything is saved.">
      {done && <Alert tone="success" title={`${done.created} ${done.created === 1 ? 'record' : 'records'} imported`}>{done.skippedExisting ? `${done.skippedExisting} already in COLLABIZ were skipped. ` : ''}{done.rejected ? `${done.rejected} rows had problems and were not imported.` : ''}</Alert>}
      {!p ? (
        <Card title="1. Choose a file">
          <div style={{ maxWidth: 360 }}><Select label="What are you importing?" value={target} onChange={(e) => setTarget(e.target.value as Target)} options={Object.entries(TARGETS).map(([value, label]) => ({ value, label }))} /></div>
          <div className="cz-drop">
            <strong>Drop the file here</strong>
            <span className="cz-muted" style={{ fontSize: 13 }}>CSV, Excel (.xlsx) or Tally XML (Gateway of Tally › Export › Masters). Up to 5,000 rows.</span>
            <input ref={ref} type="file" accept=".csv,.txt,.xlsx,.xml" aria-label="File to import" onChange={(e) => { const f = e.target.files?.[0]; if (f) up.run(f); e.target.value = ''; }} />
            {up.pending && <span className="cz-muted">Reading the file…</span>}
          </div>
          {up.error && <Alert tone="danger">{up.error}</Alert>}
        </Card>
      ) : (
        <>
          <Card title={`2. Check the columns — ${p.fileName}`}>
            <p className="cz-muted" style={{ margin: '0 0 10px', fontSize: 13.5 }}>{p.source === 'tally' ? 'Read from a Tally export. ' : ''}{p.rowCount} data rows. Change a column if COLLABIZ guessed wrong.</p>
            <div className="cz-grid cz-grid-2">{p.fields.map((f) => (
              <Select key={f.key} label={`${f.label}${f.required ? ' (required)' : ''}`} placeholder="Not in this file" value={map[f.key] != null ? String(map[f.key]) : ''} onChange={(e) => setCol(f.key, e.target.value)}
                options={p.columns.map((c, i) => ({ value: String(i), label: c || `Column ${i + 1}` }))} />
            ))}</div>
          </Card>
          {sum && (
            <Card title="3. Review">
              <div className="cz-figures">
                <div className="cz-figure"><span>Ready to import</span><strong className="cz-good">{sum.ready}</strong></div>
                <div className="cz-figure"><span>Already in COLLABIZ</span><strong>{sum.existing}</strong><small>skipped</small></div>
                <div className="cz-figure"><span>Rows with problems</span><strong style={{ color: sum.rejected ? 'var(--cz-danger)' : undefined }}>{sum.rejected}</strong><small>not imported</small></div>
              </div>
              {sum.missing.length > 0 && <Alert tone="warning">Choose a column for: {sum.missing.join(', ')}</Alert>}
              {sum.issues.length > 0 && (
                <div className="cz-table-wrap"><table className="cz-table cz-table-stack"><caption className="cz-sr-only">Rows that will not be imported</caption>
                  <thead><tr><th scope="col">Row</th><th scope="col">Field</th><th scope="col">Problem</th></tr></thead>
                  <tbody>{sum.issues.map((i, k) => <tr key={k} data-issue-row={i.row}><td data-label="Row">{i.row}</td><td data-label="Field">{i.field}</td><td data-label="Problem">{i.message}</td></tr>)}</tbody>
                </table></div>
              )}
              {sum.sample.length > 0 && <p className="cz-muted" style={{ fontSize: 13, margin: '10px 0 0' }}>First rows: {sum.sample.map((s) => String(s.legalName ?? s.name)).join(' · ')}</p>}
            </Card>
          )}
          <Card title="4. Import">
            {p.target === 'customers' ? (
              <div style={{ maxWidth: 520 }}><Select label="On what basis do you hold these contacts?" placeholder="Choose one" value={consent} onChange={(e) => setConsent(e.target.value)} options={Object.entries(CONSENT_BASES).map(([value, label]) => ({ value, label }))} /></div>
            ) : (
              <div style={{ maxWidth: 360 }}><Select label="Sector for these products" placeholder="Choose a sector" value={sector} onChange={(e) => setSector(e.target.value)} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} /></div>
            )}
            {p.target === 'customers' && <p className="cz-muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>Recorded with each contact under India’s data protection law. “Our own records” contacts are never used for outreach.</p>}
            {commit.error && <Alert tone="danger">{commit.error}</Alert>}
            <div className="cz-row" style={{ gap: 8 }}>
              <Button onClick={() => commit.run()} loading={commit.pending} disabled={!sum?.ready || (sum?.missing.length ?? 0) > 0 || (p.target === 'customers' ? !consent : !sector)}>Import {sum?.ready ?? 0} {p.target}</Button>
              <Button variant="ghost" onClick={() => { setP(null); setSum(null); }}>Start again</Button>
            </div>
          </Card>
        </>
      )}
      <Card title="Past imports">
        {hist.error ? <ApiErrorView error={hist.error} onRetry={hist.reload} /> : !hist.data ? <LoadingState /> : !hist.data.length ? <EmptyState icon="documents" title="Nothing imported yet" /> : (
          <ul className="cz-ws-list">{hist.data.map((h) => (
            <li key={h.id} data-import={h.fileName}><span><strong>{h.fileName}</strong> · {TARGETS[h.target]}{h.source === 'tally' ? ' · from Tally' : ''}<br /><span className="cz-muted" style={{ fontSize: 13 }}>{new Date(h.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}{h.status === 'committed' ? ` · ${h.created} added, ${h.skippedExisting} skipped, ${h.rejected} with problems` : ''}</span></span>
              <StatusBadge status={h.status} tone={h.status === 'committed' ? 'success' : 'neutral'} label={h.status === 'committed' ? 'Imported' : 'Not imported'} /></li>
          ))}</ul>
        )}
      </Card>
    </Screen>
  );
}
