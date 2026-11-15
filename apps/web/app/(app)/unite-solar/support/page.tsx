'use client';
import { useState } from 'react';
import { SERVICE_KINDS, SERVICE_KIND_LABELS } from '@collabiz/types';
import { Alert, Button, ButtonLink, DataTable, EmptyState, Select, Skeleton, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { PartnerGate, STATUS_TONE, usePartner } from '@/components/UniteSolar';

interface Req { id: string; number: string; kind: string; customerName: string; pincode: string | null; details: string; status: string; assignedTo: string | null; resolution: string | null; createdAt: string }

/** Support — site surveys, installation, service/warranty, loan and subsidy help and complaints for the partner's customers. */
export default function Support() {
  const p = usePartner();
  return (
    <Screen page={{ key: 'unite-solar-support', title: 'Customer service requests', access: 'partner' }} actions={<ButtonLink href="/support/tickets" variant="secondary">Platform support</ButtonLink>}>
      <PartnerGate p={p} need={(u) => (['approved', 'agreement_signed', 'setup', 'live'].includes(u.status) ? null : 'Service requests open once your application is approved.')}>{(u) => <Requests key={u.id} unitId={u.id} pincode={u.pincode} />}</PartnerGate>
    </Screen>
  );
}

function Requests({ unitId, pincode }: { unitId: string; pincode: string }) {
  const q = useQuery<Req[]>(`/network/units/${unitId}/service-requests`);
  const [f, setF] = useState({ kind: 'site_survey', customerName: '', customerPhone: '', pincode, details: '' });
  const save = useMutation(async () => { await api.post(`/network/units/${unitId}/service-requests`, { ...f, customerPhone: f.customerPhone || undefined, pincode: f.pincode || undefined }); setF({ ...f, customerName: '', customerPhone: '', details: '' }); q.reload(); });
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <section className="cz-card" aria-label="New request">
        <h2 style={{ marginTop: 0, fontSize: 17 }}>Raise a request</h2>
        <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); save.run(); }} noValidate>
          <div className="cz-grid cz-grid-2">
            <Select label="Request" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={SERVICE_KINDS.map((k) => ({ value: k, label: SERVICE_KIND_LABELS[k] }))} />
            <TextInput label="Customer name" value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} error={save.fieldErrors.customerName} />
            <TextInput label="Customer mobile (optional)" inputMode="tel" value={f.customerPhone} onChange={(e) => setF({ ...f, customerPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })} error={save.fieldErrors.customerPhone} />
            <TextInput label="PIN code" inputMode="numeric" value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
          </div>
          <TextArea label="Details" rows={3} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} error={save.fieldErrors.details} />
          {save.error && <Alert tone="danger">{save.error}</Alert>}
          <div><Button type="submit" loading={save.pending} disabled={!f.customerName || f.details.length < 10}>Send to Unite</Button></div>
        </form>
      </section>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={160} /> : (
        <section className="cz-card" aria-label="Requests"><DataTable caption="My requests" rows={q.data} empty={<EmptyState title="No requests yet" />} columns={[
          { key: 'n', header: 'Request', render: (r) => <><strong>{r.number}</strong> · {SERVICE_KIND_LABELS[r.kind]}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{r.createdAt.slice(0, 10)} · {r.customerName}{r.pincode ? ` · ${r.pincode}` : ''}</span></> },
          { key: 'd', header: 'Details', render: (r) => <>{r.details}{r.resolution ? <><br /><em>Resolution: {r.resolution}</em></> : null}</> },
          { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} tone={STATUS_TONE[r.status]} label={`${r.status.replace('_', ' ')}${r.assignedTo ? ` · ${r.assignedTo}` : ''}`} /> },
        ]} /></section>
      )}
    </div>
  );
}
