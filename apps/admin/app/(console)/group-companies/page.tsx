'use client';
import { useState } from 'react';
import { SECTORS, sectorName } from '@collabiz/types';
import { Alert, Button, Card, ChipSelect, DataTable, Dialog, LoadingState, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

/** Screen 128 — Group Companies & Business Units (legal entity ≠ brand). */
export default function GroupCompaniesAdmin() {
  const { me } = useSession();
  const canManage = me?.capabilities.includes('group.manage');
  const q = useQuery<any[]>('/admin/group-companies');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ legalName: '', legalEntityCode: '', brandName: '', country: 'IN', description: '' });
  const [sectors, setSectors] = useState<string[]>([]);
  const [unitFor, setUnitFor] = useState<any>(null);
  const [unit, setUnit] = useState('');
  const create = useMutation(async () => { await api.post('/admin/group-companies', { ...f, sectors, description: f.description || undefined }); setOpen(false); q.reload(); return true; });
  const toggle = useMutation(async (orgId: string, status: string) => { await api.patch(`/admin/group-companies/${orgId}`, { status }); q.reload(); return true; });
  const addUnit = useMutation(async () => { await api.post(`/admin/group-companies/${unitFor.org.id}/units`, { name: unit, sectors: unitFor.gc?.sectors ?? [] }); setUnitFor(null); setUnit(''); q.reload(); return true; });
  return (
    <Screen id="128" actions={canManage && <Button onClick={() => setOpen(true)}>Add group company</Button>} description="Each Unite Group company is a separate legal entity. Its brand is shown to partners; the legal entity signs contracts and invoices.">
      {toggle.error && <Alert tone="danger">{toggle.error}</Alert>}
      <Card>
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <DataTable caption="Group companies" rows={(q.data ?? []).map((r) => ({ ...r, id: r.org.id }))} columns={[
            { key: 'brand', header: 'Brand', render: (r) => <strong>{r.gc?.brandName ?? r.org.displayName}</strong> },
            { key: 'legal', header: 'Legal entity', render: (r) => <>{r.org.legalName}<div className="cz-mono" style={{ fontSize: 12 }}>{r.gc?.legalEntityCode ?? 'not registered'}</div></> },
            { key: 'sectors', header: 'Sectors', render: (r) => (r.gc?.sectors ?? []).map(sectorName).join(', ') },
            { key: 'units', header: 'Business units', render: (r) => r.units },
            { key: 'sla', header: 'First-review SLA', render: (r) => (r.gc ? `${r.gc.slaMinutes / 60} business h` : '—') },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.gc?.status ?? 'unregistered'} /> },
            { key: 'a', header: '', render: (r) => canManage && r.gc && <div className="cz-row" style={{ gap: 4 }}>
              <Button size="sm" variant="secondary" onClick={() => setUnitFor(r)}>Add unit</Button>
              <Button size="sm" variant="ghost" onClick={() => toggle.run(r.org.id, r.gc.status === 'active' ? 'inactive' : 'active')}>{r.gc.status === 'active' ? 'Deactivate' : 'Activate'}</Button>
            </div> },
          ]} />
        )}
      </Card>
      <Dialog open={open} onClose={() => setOpen(false)} title="Register group company">
        <form noValidate onSubmit={(e) => { e.preventDefault(); create.run(); }}>
          {create.error && <Alert tone="danger">{create.error}</Alert>}
          <TextInput label="Registered legal name" value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} error={create.fieldErrors.legalName} />
          <TextInput label="Legal entity code" value={f.legalEntityCode} onChange={(e) => setF({ ...f, legalEntityCode: e.target.value.toUpperCase() })} error={create.fieldErrors.legalEntityCode} hint="Uppercase letters, digits and hyphens" />
          <TextInput label="Brand name" value={f.brandName} onChange={(e) => setF({ ...f, brandName: e.target.value })} error={create.fieldErrors.brandName} />
          <ChipSelect legend="Sectors" value={sectors} onChange={setSectors} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
          <TextArea label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div className="cz-row"><Button type="submit" loading={create.pending}>Create</Button><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      </Dialog>
      <Dialog open={!!unitFor} onClose={() => setUnitFor(null)} title="Add business unit">
        {addUnit.error && <Alert tone="danger">{addUnit.error}</Alert>}
        <TextInput label="Unit name" value={unit} onChange={(e) => setUnit(e.target.value)} error={addUnit.fieldErrors.name} />
        <div className="cz-row"><Button onClick={() => addUnit.run()} loading={addUnit.pending}>Add</Button><Button variant="secondary" onClick={() => setUnitFor(null)}>Cancel</Button></div>
      </Dialog>
    </Screen>
  );
}
