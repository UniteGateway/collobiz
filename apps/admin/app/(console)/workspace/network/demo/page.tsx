'use client';
import { useState } from 'react';
import { Alert, Button, DataTable, LoadingState, Select, StatusBadge, TextInput, Checkbox } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { WorkspaceNav } from '@/components/Workspace';
import { NetworkTabs, TONE, inr } from '@/components/Network';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type R = Record<string, any>;
const KINDS = ['display_stand', 'sample_panel', 'inverter_demo', 'kit_sample', 'display_board', 'brochure', 'catalogue'];

/** Demo materials (request → approval → dispatch → delivery → confirmation → return/damage) and customer service requests. */
export default function DemoAndService() {
  const d = useQuery<{ materials: R[]; requests: R[] }>('/admin/network/demo');
  const s = useQuery<R[]>('/admin/network/service-requests');
  const [m, setM] = useState({ name: '', kind: 'display_stand', ownership: 'company_owned', unitValue: '', chargeable: false, maxPerPartner: '2' });
  const step = useMutation(async (r: R, to: string) => { const note = to === 'rejected' ? window.prompt('Reason') ?? undefined : undefined; await api.post(`/network/demo/${r.id}/status`, { to, note }); d.reload(); });
  const create = useMutation(async () => { await api.post('/admin/network/demo-materials', { ...m, unitValue: Math.round(Number(m.unitValue || 0) * 100), maxPerPartner: Number(m.maxPerPartner) }); setM({ ...m, name: '' }); d.reload(); });
  const svc = useMutation(async (r: R, status: string) => {
    const extra = status === 'assigned' ? { assignedTo: window.prompt('Assign to (team / engineer)') ?? undefined } : status === 'resolved' ? { resolution: window.prompt('How was it resolved?') ?? undefined } : {};
    await api.post(`/admin/network/service-requests/${r.id}`, { status, ...extra }); s.reload();
  });
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <h1 style={{ margin: '8px 0 12px' }}>Demo materials & service</h1>
      <NetworkTabs />
      {(step.error || create.error || svc.error) && <Alert tone="danger">{step.error ?? create.error ?? svc.error}</Alert>}
      {d.error ? <ApiErrorView error={d.error} onRetry={d.reload} /> : !d.data ? <LoadingState /> : (
        <div className="cz-stack" style={{ gap: 16 }}>
          <section className="cz-card"><DataTable caption="Demo material requests" rows={d.data.requests} columns={[
            { key: 'p', header: 'Partner', render: (r: R) => `${r.partner} (${r.unitCode})` }, { key: 'm', header: 'Material', render: (r: R) => `${r.qty} × ${r.name}` },
            { key: 's', header: 'Status', render: (r: R) => <StatusBadge status={r.status} tone={TONE[r.status]} label={r.status} /> },
            { key: 'a', header: '', render: (r: R) => <div className="cz-row" style={{ gap: 4 }}>{r.adminActions.map((to: string) => <Button key={to} size="sm" variant={to === 'rejected' ? 'ghost' : 'secondary'} onClick={() => step.run(r, to)}>{to === 'approved' ? 'Approve' : to === 'rejected' ? 'Reject' : to === 'dispatched' ? 'Dispatch' : 'Delivered'}</Button>)}</div> },
          ]} /></section>
          <section className="cz-card">
            <DataTable caption="Material catalogue" rows={d.data.materials} columns={[
              { key: 'n', header: 'Material', render: (x: R) => x.name }, { key: 'o', header: 'Ownership', render: (x: R) => x.ownership.replace('_', ' ') }, { key: 'v', header: 'Value', render: (x: R) => `${inr(x.unitValue)}${x.chargeable ? ' (chargeable)' : ''}` }, { key: 'l', header: 'Limit / partner', render: (x: R) => x.maxPerPartner },
            ]} />
            <form className="cz-row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); create.run(); }}>
              <TextInput label="New material" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />
              <Select label="Kind" value={m.kind} onChange={(e) => setM({ ...m, kind: e.target.value })} options={KINDS.map((k) => ({ value: k, label: k.replace('_', ' ') }))} />
              <Select label="Ownership" value={m.ownership} onChange={(e) => setM({ ...m, ownership: e.target.value })} options={[{ value: 'company_owned', label: 'Company-owned' }, { value: 'partner_owned', label: 'Partner-owned' }, { value: 'returnable', label: 'Returnable' }]} />
              <TextInput label="Value (₹)" value={m.unitValue} onChange={(e) => setM({ ...m, unitValue: e.target.value.replace(/\D/g, '') })} />
              <TextInput label="Limit per partner" value={m.maxPerPartner} onChange={(e) => setM({ ...m, maxPerPartner: e.target.value.replace(/\D/g, '') })} />
              <Checkbox label="Chargeable" checked={m.chargeable} onChange={(e) => setM({ ...m, chargeable: e.target.checked })} />
              <Button type="submit" loading={create.pending} disabled={m.name.length < 3}>Add</Button>
            </form>
          </section>
        </div>
      )}
      {s.error ? <ApiErrorView error={s.error} onRetry={s.reload} /> : !s.data ? null : (
        <section className="cz-card" style={{ marginTop: 16 }}><DataTable caption="Customer service requests" rows={s.data} columns={[
          { key: 'n', header: 'Request', render: (r: R) => <><strong>{r.number}</strong> · {r.kind.replace('_', ' ')}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{r.partner} · {r.customerName}{r.pincode ? ` · ${r.pincode}` : ''}</span></> },
          { key: 'd', header: 'Details', render: (r: R) => <>{r.details}{r.resolution ? <><br /><em>{r.resolution}</em></> : null}</> },
          { key: 's', header: 'Status', render: (r: R) => <StatusBadge status={r.status} tone={TONE[r.status]} label={`${r.status.replace('_', ' ')}${r.assignedTo ? ` · ${r.assignedTo}` : ''}`} /> },
          { key: 'a', header: '', render: (r: R) => <div className="cz-row" style={{ gap: 4 }}>{r.status === 'open' && <Button size="sm" variant="secondary" onClick={() => svc.run(r, 'assigned')}>Assign</Button>}{['open', 'assigned', 'in_progress'].includes(r.status) && <Button size="sm" onClick={() => svc.run(r, 'resolved')}>Resolve</Button>}{r.status === 'resolved' && <Button size="sm" variant="ghost" onClick={() => svc.run(r, 'closed')}>Close</Button>}</div> },
        ]} /></section>
      )}
    </div>
  );
}
