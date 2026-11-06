'use client';
import { useMemo, useState } from 'react';
import { SCREENS, SCREEN_FAMILIES, SCREEN_STATUS } from '@collabiz/types';
import { DataTable, StatusBadge, Select, TextInput, Kpi, Grid } from '@collabiz/ui';

/** Live screen registry 001–165 (Stage 01 route scaffolding / traceability). */
export default function RegistryPage() {
  const [q, setQ] = useState('');
  const [fam, setFam] = useState('');
  const rows = useMemo(() => SCREENS.filter((s) => (!fam || String(s.family) === fam) && (!q || `${s.id} ${s.title} ${s.route}`.toLowerCase().includes(q.toLowerCase())))
    .map((s) => ({ ...s, status: SCREEN_STATUS[s.id]?.status ?? 'planned' })), [q, fam]);
  const count = (st: string) => SCREENS.filter((s) => (SCREEN_STATUS[s.id]?.status ?? 'planned') === st).length;
  return (
    <div className="cz-container cz-section">
      <h1>Screen registry</h1>
      <p className="cz-muted">All 165 principal screens from the Master Book with route, access rule, stage and implementation status.</p>
      <Grid cols={4}><Kpi label="Verified" value={count('verified')} accent /><Kpi label="Implemented" value={count('implemented')} /><Kpi label="Scaffolded" value={count('scaffolded')} /><Kpi label="Planned" value={count('planned')} /></Grid>
      <div className="cz-grid cz-grid-2" style={{ marginTop: 16 }}>
        <TextInput label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ID, title or route" />
        <Select label="Family" value={fam} onChange={(e) => setFam(e.target.value)} placeholder="All families" options={SCREEN_FAMILIES.map((f) => ({ value: String(f.id), label: `${String(f.id).padStart(2, '0')} ${f.name}` }))} />
      </div>
      <DataTable caption="Screens" rows={rows} columns={[
        { key: 'id', header: 'ID', render: (r) => <span className="cz-mono">{r.id}</span> },
        { key: 'title', header: 'Screen' },
        { key: 'route', header: 'Route', render: (r) => <span className="cz-mono">{r.app === 'admin' ? 'admin:' : ''}{r.route}</span> },
        { key: 'access', header: 'Access' },
        { key: 'stage', header: 'Stage' },
        { key: 'mobile', header: 'Mobile' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} tone={r.status === 'verified' ? 'success' : r.status === 'implemented' ? 'info' : 'neutral'} /> },
      ]} />
    </div>
  );
}
