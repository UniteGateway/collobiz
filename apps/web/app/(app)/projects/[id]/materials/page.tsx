'use client';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, EmptyState, Grid, LoadingState, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { fmtDate, ProjectTabs, useProject } from '@/components/Projects';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

const STATUSES = ['planned', 'ordered', 'delivered', 'installed'];

/** Screen 080 — Materials & Procurement Tracker. */
export default function Materials() {
  const p = useProject();
  const q = useQuery<any[]>(`/projects/${p.id}/materials`);
  const [f, setF] = useState({ item: '', spec: '', quantity: '', unit: 'nos', supplier: '', neededBy: '' });
  const add = useMutation(async () => { await api.post(`/projects/${p.id}/materials`, { item: f.item, spec: f.spec || undefined, quantity: Number(f.quantity) || 0, unit: f.unit, supplier: f.supplier || undefined, neededBy: f.neededBy || undefined }); setF({ item: '', spec: '', quantity: '', unit: 'nos', supplier: '', neededBy: '' }); q.reload(); return true; });
  const move = useMutation(async (m: any, status: string) => { await api.patch(`/projects/${p.id}/materials/${m.id}`, { status, ...(status === 'delivered' && m.deliveredQty < m.quantity ? { deliveredQty: m.quantity } : {}) }); q.reload(); return true; });
  if (p.loading) return <Screen id="080"><LoadingState /></Screen>;
  if (p.error) return <Screen id="080"><ApiErrorView error={p.error} onRetry={p.reload} /></Screen>;
  const d = p.data;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Screen id="080" title={d.title}>
      <ProjectTabs id={p.id} role={d.role} />
      {(add.error || move.error) && <Alert tone="danger">{add.error ?? move.error}</Alert>}
      <Card title="Materials">
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <DataTable caption="Materials" rows={q.data ?? []} empty={<EmptyState title="No materials planned" />} columns={[
            { key: 'item', header: 'Item', render: (m: any) => <>{m.item}{m.spec && <div className="cz-muted" style={{ fontSize: 12 }}>{m.spec}</div>}</> },
            { key: 'quantity', header: 'Qty', render: (m: any) => `${m.deliveredQty}/${m.quantity} ${m.unit}` },
            { key: 'supplier', header: 'Supplier', render: (m: any) => m.supplier ?? '—' },
            { key: 'neededBy', header: 'Needed by', render: (m: any) => <>{fmtDate(m.neededBy)}{m.neededBy && m.neededBy < today && ['planned', 'ordered'].includes(m.status) && <> <StatusBadge status="late" tone="danger" label="Late" /></>}</> },
            { key: 'status', header: 'Status', render: (m: any) => <StatusBadge status={m.status} /> },
            ...(d.role !== 'owner' ? [{ key: 'next', header: 'Update', render: (m: any) => { const nx = STATUSES[STATUSES.indexOf(m.status) + 1]; return nx ? <Button size="sm" variant="secondary" onClick={() => move.run(m, nx)} aria-label={`Mark ${m.item} ${nx}`}>Mark {nx}</Button> : null; } }] : []),
          ]} />
        )}
      </Card>
      {d.role === 'lead' && (
        <Card title="Add material">
          <Grid cols={3}>
            <TextInput label="Item" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} error={add.fieldErrors.item} />
            <TextInput label="Quantity" inputMode="numeric" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} error={add.fieldErrors.quantity} />
            <Select label="Unit" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} options={['nos', 'm', 'kg', 'set', 'lot', 'kWp'].map((u) => ({ value: u, label: u }))} />
            <TextInput label="Specification (optional)" value={f.spec} onChange={(e) => setF({ ...f, spec: e.target.value })} />
            <TextInput label="Supplier (optional)" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} />
            <TextInput label="Needed by" type="date" value={f.neededBy} onChange={(e) => setF({ ...f, neededBy: e.target.value })} />
          </Grid>
          <Button onClick={() => add.run()} loading={add.pending}>Add material</Button>
        </Card>
      )}
    </Screen>
  );
}
