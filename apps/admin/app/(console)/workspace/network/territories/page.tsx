'use client';
import { useState } from 'react';
import { TERRITORY_LEVELS } from '@collabiz/types';
import { Alert, Button, Checkbox, DataTable, LoadingState, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { WorkspaceNav } from '@/components/Workspace';
import { NetworkTabs, TONE } from '@/components/Network';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type R = Record<string, any>;

/** Territories — PIN code / mandal / city / district grants. Overlapping exclusive grants are refused by the server. */
export default function Territories() {
  const q = useQuery<R[]>('/admin/network/territories');
  const [f, setF] = useState({ level: 'mandal', name: '', state: '', district: '', pincodes: '', exclusive: true });
  const create = useMutation(async () => { await api.post('/admin/network/territories', { ...f, pincodes: f.pincodes.split(/[\s,]+/).filter(Boolean) }); setF({ ...f, name: '', pincodes: '' }); q.reload(); });
  const act = useMutation(async (t: R, action: string) => {
    const note = window.prompt(`Reason to ${action} ${t.name}`); if (!note) return;
    const expiresOn = action === 'renew' ? window.prompt('New expiry date (YYYY-MM-DD)') ?? undefined : undefined;
    const unitId = action === 'reassign' ? window.prompt('Partner record id to reassign to') ?? undefined : undefined;
    await api.post(`/admin/network/territories/${t.id}/action`, { action, note, expiresOn, unitId }); q.reload();
  });
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <h1 style={{ margin: '8px 0 12px' }}>Territories</h1>
      <NetworkTabs />
      <form className="cz-card cz-stack" style={{ gap: 10, marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); create.run(); }} aria-label="New territory">
        <h2 style={{ margin: 0, fontSize: 17 }}>Open a territory</h2>
        <div className="cz-row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Select label="Level" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} options={TERRITORY_LEVELS.map((l) => ({ value: l, label: l }))} />
          <TextInput label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={create.fieldErrors.name} />
          <TextInput label="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} />
          <TextInput label="District" value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} />
          <TextInput label="PIN codes" value={f.pincodes} onChange={(e) => setF({ ...f, pincodes: e.target.value })} hint="Comma-separated; leave empty for a whole district" error={create.fieldErrors.pincodes} />
          <Checkbox label="Exclusive" checked={f.exclusive} onChange={(e) => setF({ ...f, exclusive: e.target.checked })} />
          <Button type="submit" loading={create.pending} disabled={!f.name || !f.state || !f.district}>Create</Button>
        </div>
        {(create.error || act.error) && <Alert tone="danger">{create.error ?? act.error}</Alert>}
      </form>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <section className="cz-card"><DataTable caption="Territories" rows={q.data} columns={[
          { key: 'n', header: 'Territory', render: (t: R) => <><strong>{t.name}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{t.level} · {t.district}, {t.state}{t.exclusive ? ' · exclusive' : ''}</span></> },
          { key: 'p', header: 'PIN codes', render: (t: R) => t.pincodes.join(', ') || 'Whole district' },
          { key: 's', header: 'Status', render: (t: R) => <StatusBadge status={t.status} tone={TONE[t.status]} label={t.status} /> },
          { key: 'u', header: 'Partner', render: (t: R) => (t.partner ? `${t.partner} (${t.unitCode})` : '—') }, { key: 'e', header: 'Expires', render: (t: R) => t.expiresOn ?? '—' },
          { key: 'a', header: '', render: (t: R) => <div className="cz-row" style={{ gap: 4, flexWrap: 'wrap' }}>
            {t.status === 'reserved' && <Button size="sm" variant="ghost" onClick={() => act.run(t, 'release')}>Release</Button>}
            {t.status === 'allocated' && <Button size="sm" variant="ghost" onClick={() => act.run(t, 'renew')}>Renew</Button>}
            {['reserved', 'allocated'].includes(t.status) && <Button size="sm" variant="ghost" onClick={() => act.run(t, 'reassign')}>Reassign</Button>}
            {t.status !== 'expired' && <Button size="sm" variant="ghost" onClick={() => act.run(t, 'expire')}>Expire</Button>}
          </div> },
        ]} /></section>
      )}
    </div>
  );
}
