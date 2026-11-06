'use client';
import { useState } from 'react';
import { colors, Alert, Button, Card, Checkbox, ChipSelect, DataTable, EmptyState, ErrorState, FactorBars, Grid, Kpi, LoadingState, Money, PermissionDenied, ProgressBar, Select, StatusBadge, Stepper, Tabs, TextInput, Timeline } from '@collabiz/ui';

/** Stage 01 component preview ("previews" deliverable). Not a numbered product screen. */
export default function DesignSystemPage() {
  const [chips, setChips] = useState<string[]>(['solar']);
  const [tab, setTab] = useState('states');
  return (
    <div className="cz-container cz-section">
      <h1>COLLABIZ design system</h1>
      <p className="cz-muted">Tokens are shared with the React Native app (packages/ui/src/tokens.ts). Breakpoints: 1440 / 1024 / 768 / 390 / 360.</p>
      <Card title="Colour tokens">
        <div className="cz-row">
          {Object.entries(colors).map(([k, v]) => (
            <div key={k} style={{ width: 120 }}><div style={{ height: 48, background: v, borderRadius: 8, border: '1px solid #ddd' }} /><div style={{ fontSize: 12 }}><strong>{k}</strong><br /><span className="cz-mono">{v}</span></div></div>
          ))}
        </div>
      </Card>
      <Card title="KPI cards & progress">
        <Grid cols={4}>
          <Kpi label="Project progress" value="68%" accent /><Kpi label="Milestones" value="12 / 18" /><Kpi label="Contract value" value={<Money minor={3_80_00_000_00} />} /><Kpi label="Lead decision time" value="3.2 h" hint="Median, business hours" />
        </Grid>
        <div style={{ marginTop: 16 }}><Stepper steps={['Submitted', 'Reviewed', 'Approved', 'Completed']} current={2} /></div>
        <ProgressBar value={68} label="Project progress" />
      </Card>
      <Card title="Buttons, badges & forms">
        <div className="cz-row" style={{ marginBottom: 12 }}>
          <Button>Primary</Button><Button variant="accent">Accent</Button><Button variant="secondary">Secondary</Button><Button variant="danger">Danger</Button><Button disabled>Disabled</Button><Button loading>Loading</Button>
        </div>
        <div className="cz-row" style={{ marginBottom: 12 }}>
          {['verified', 'under_review', 'reupload_requested', 'rejected', 'estimated', 'settled', 'disputed', 'draft'].map((s) => <StatusBadge key={s} status={s} />)}
        </div>
        <Grid cols={2}>
          <div><TextInput label="Company legal name" hint="As per incorporation certificate" /><TextInput label="GSTIN" error="Invalid GSTIN" defaultValue="27ABC" /></div>
          <div><Select label="Sector" options={[{ value: 'solar', label: 'Solar & Renewable Energy' }]} /><Checkbox label="I consent to explainable partner matching" /><ChipSelect legend="Sectors" value={chips} onChange={setChips} options={[{ value: 'solar', label: 'Solar' }, { value: 'epc', label: 'EPC' }, { value: 'trading', label: 'Trading' }]} /></div>
        </Grid>
        <Alert tone="info">Info alert</Alert><Alert tone="success">Success alert</Alert><Alert tone="warning">Warning alert</Alert><Alert tone="danger">Error alert</Alert>
      </Card>
      <Card title="Data states">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'states', label: 'States' }, { value: 'table', label: 'Table' }, { value: 'ai', label: 'AI explanation' }]} />
        {tab === 'states' && <Grid cols={2}><LoadingState /><EmptyState title="No opportunities yet" >Saved searches will alert you.</EmptyState><ErrorState error="Network unavailable" onRetry={() => undefined} /><PermissionDenied /></Grid>}
        {tab === 'table' && <DataTable columns={[{ key: 'pkg', header: 'Work package' }, { key: 'owner', header: 'Owner' }, { key: 'due', header: 'Due' }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> }]} rows={[{ id: '1', pkg: 'Civil foundations', owner: 'EPC Partner', due: '18 Nov', status: 'in_progress' }, { id: '2', pkg: 'Electrical panels', owner: 'Powertek', due: '24 Nov', status: 'approved' }]} />}
        {tab === 'ai' && <FactorBars factors={[{ factor: 'Sector', weight: 35, score: 1, detail: 'Works in solar' }, { factor: 'Geography', weight: 20, score: 0.7, detail: 'Partial coverage' }]} />}
      </Card>
      <Card title="Timeline"><Timeline items={[{ id: '1', at: new Date().toISOString(), title: 'Lead registered', detail: 'Evidence snapshot sealed' }]} /></Card>
    </div>
  );
}
