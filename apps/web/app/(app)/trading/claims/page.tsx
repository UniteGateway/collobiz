'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Button, Card, DataTable, EmptyState, Grid, LoadingState, Select, StatusBadge, TextArea, TextInput, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { inr, TradingTabs, when } from '@/components/Trading';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { toMinor } from '@/lib/regions';

export default function ClaimsPage() {
  return <Suspense fallback={<LoadingState />}><Claims /></Suspense>;
}

/** Screen 094 — Returns, Warranty & Claims (photo evidence, supplier deadline, escalation to COLLABIZ). */
function Claims() {
  const params = useSearchParams();
  const list = useQuery<any[]>('/trading/claims');
  const orders = useQuery<any[]>('/trading/purchase-orders', { side: 'buyer' });
  const [sel, setSel] = useState<string | null>(params.get('id'));
  const [f, setF] = useState({ poId: '', kind: 'damage', description: '', item: '', quantity: '', amount: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [resp, setResp] = useState({ resolution: 'replacement', note: '' });
  const delivered = (orders.data ?? []).filter((o) => ['delivered', 'closed'].includes(o.status));
  const po = delivered.find((o) => o.id === f.poId);
  const raise = useMutation(async () => {
    const fd = new FormData();
    fd.append('payload', JSON.stringify({ poId: f.poId, kind: f.kind, description: f.description, lines: [{ item: f.item, quantity: Number(f.quantity) || 0 }], amountClaimed: toMinor(f.amount) }));
    files.forEach((x) => fd.append('files', x));
    const c = await api.upload<any>('/trading/claims', fd); list.reload(); setSel(c.id); return c;
  });
  const act = useMutation(async (path: string, b: unknown) => { await api.post(`/trading/claims/${sel}/${path}`, b); setResp({ ...resp, note: '' }); list.reload(); return true; });
  const c = (list.data ?? []).find((x) => x.id === sel);
  const open = async (docId: string) => { const r = await api.get<{ url: string }>(`/trading/documents/${docId}/url`); window.open(r.url, '_blank', 'noopener'); };
  return (
    <Screen id="094">
      <TradingTabs />
      <Card title="Claims">
        {list.loading ? <LoadingState /> : list.error ? <ApiErrorView error={list.error} onRetry={list.reload} /> : (
          <DataTable caption="Claims" rows={list.data ?? []} empty={<EmptyState title="No claims" />} columns={[
            { key: 'code', header: 'Claim', render: (x: any) => <><Button size="sm" variant="ghost" onClick={() => setSel(x.id)} aria-label={`Open ${x.code}`}>{x.code}</Button><div className="cz-muted" style={{ fontSize: 12 }}>{x.poNumber}</div></> },
            { key: 'kind', header: 'Type', render: (x: any) => <StatusBadge status={x.kind} tone="brand" /> },
            { key: 'side', header: 'Side', render: (x: any) => (x.side === 'buyer' ? 'Raised by us' : 'Raised by buyer') },
            { key: 'amountClaimed', header: 'Amount', render: (x: any) => inr(x.amountClaimed) },
            { key: 'due', header: 'Supplier response due', render: (x: any) => <>{when(x.responseDueAt)}{x.overdue && <> <StatusBadge status="overdue" tone="danger" /></>}</> },
            { key: 'status', header: 'Status', render: (x: any) => <StatusBadge status={x.status} /> },
          ]} />
        )}
      </Card>
      {c && (
        <Card title={`${c.code} — ${c.kind}`} actions={<StatusBadge status={c.status} />}>
          {act.error && <Alert tone="danger">{act.error}</Alert>}
          <p style={{ whiteSpace: 'pre-wrap' }}>{c.description}</p>
          <p>{c.lines.map((l: any) => `${l.item} × ${l.quantity}`).join('; ')}{c.resolution ? ` · resolution: ${c.resolution.replace('_', ' ')}` : ''}{c.resolutionNote ? ` — ${c.resolutionNote}` : ''}</p>
          {c.evidence.map((d: any) => <Button key={d.id} size="sm" variant="ghost" onClick={() => open(d.id)} aria-label={`Open evidence ${d.fileName}`}>📷 {d.fileName}</Button>)}
          <Timeline items={c.history.map((h: any, i: number) => ({ id: String(i), at: h.at, title: h.action, detail: h.note }))} />
          {c.side === 'supplier' && c.status === 'open' && (
            <section aria-label="Respond to claim">
              <Select label="Resolution (if accepting)" value={resp.resolution} onChange={(e) => setResp({ ...resp, resolution: e.target.value })} options={[{ value: 'replacement', label: 'Replacement' }, { value: 'refund', label: 'Refund' }, { value: 'credit_note', label: 'Credit note' }, { value: 'repair', label: 'Repair' }]} />
              <TextArea label="Response" rows={2} value={resp.note} onChange={(e) => setResp({ ...resp, note: e.target.value })} />
              <div className="cz-row">
                <Button onClick={() => act.run('respond', { decision: 'accept', resolution: resp.resolution, note: resp.note })} disabled={resp.note.trim().length < 5}>Accept claim</Button>
                <Button variant="danger" onClick={() => act.run('respond', { decision: 'reject', note: resp.note })} disabled={resp.note.trim().length < 5}>Reject claim</Button>
              </div>
            </section>
          )}
          {c.side === 'buyer' && (c.status === 'accepted' || c.status === 'rejected' || c.overdue) && (
            <section aria-label="Next step">
              <TextArea label="Note" rows={2} value={resp.note} onChange={(e) => setResp({ ...resp, note: e.target.value })} />
              <div className="cz-row">
                {c.status === 'accepted' && <Button onClick={() => act.run('resolve', { note: resp.note })} disabled={resp.note.trim().length < 5}>Confirm resolved</Button>}
                {(c.status === 'rejected' || c.overdue) && <Button variant="danger" onClick={() => act.run('escalate', { note: resp.note })} disabled={resp.note.trim().length < 10}>Escalate to COLLABIZ</Button>}
              </div>
            </section>
          )}
        </Card>
      )}
      <Card title="Raise a claim">
        {raise.error && <Alert tone="danger">{raise.error}</Alert>}
        <Grid cols={2}>
          <Select label="Delivered order" value={f.poId} onChange={(e) => setF({ ...f, poId: e.target.value, item: '' })} placeholder="Choose an order" options={delivered.map((o) => ({ value: o.id, label: `${o.number} · ${o.supplier}` }))} />
          <Select label="Claim type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={[{ value: 'damage', label: 'Damaged in transit' }, { value: 'shortage', label: 'Short supply' }, { value: 'return', label: 'Return' }, { value: 'warranty', label: 'Warranty' }]} />
          <Select label="Item" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} placeholder="Choose an item" options={(po?.lines ?? []).map((l: any) => ({ value: l.item, label: l.item }))} />
          <TextInput label="Quantity affected" inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
          <TextInput label="Amount claimed (₹, optional)" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} error={raise.fieldErrors.amountClaimed} />
          <label className="cz-field"><span className="cz-label">Photos{['damage', 'warranty'].includes(f.kind) ? ' (required)' : ' (optional)'}</span><input aria-label="Claim photos" type="file" multiple accept="image/*,.pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} /></label>
        </Grid>
        {raise.fieldErrors.files && <p className="cz-error-text">{raise.fieldErrors.files}</p>}
        <TextArea label="What went wrong?" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={raise.fieldErrors.description} />
        <Button onClick={() => raise.run()} disabled={!f.poId || !f.item} loading={raise.pending}>Raise claim</Button>
      </Card>
    </Screen>
  );
}
