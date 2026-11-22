'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, LoadingState, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, useEb5 } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface P { id: string; name: string; sponsor: string; regionalCenter: string | null; location: string; sector: string; offeringStatus: string; demo: boolean }

/** EB-5 project directory. Nothing is shown as approved, TEA/rural or offering-ready without verified evidence. */
export default function Eb5Projects() {
  const { has } = useEb5();
  const q = useQuery<P[]>('/eb5/projects');
  const [f, setF] = useState({ name: '', sponsor: '', regionalCenter: '', location: '', sector: '', description: '' });
  const add = useMutation(async () => { await api.post('/eb5/projects', { ...f, regionalCenter: f.regionalCenter || undefined }); setF({ name: '', sponsor: '', regionalCenter: '', location: '', sector: '', description: '' }); q.reload(); return true; });
  return (
    <Screen page={{ key: 'eb5-projects', title: 'EB-5 projects', access: 'authenticated' }} eyebrow="GO EB5" description="Projects are recorded as proposed. TEA, business plan, economic report, I-956F and offering documents each need evidence that compliance verifies before a project can be marked as offering.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <DataTable rows={q.data} caption="EB-5 projects" columns={[
          { key: 'n', header: 'Project', render: (p) => <span><Link href={`/eb5/projects/${p.id}`}>{p.name}</Link><br /><span className="cz-muted" style={{ fontSize: 12 }}>{p.sector} · {p.location}</span></span> },
          { key: 's', header: 'Sponsor', render: (p) => p.sponsor }, { key: 'r', header: 'Regional center', render: (p) => p.regionalCenter ?? '—' },
          { key: 'o', header: 'Offering status', render: (p) => <Badge s={p.offeringStatus === 'proposed' ? 'pending' : p.offeringStatus} label={p.offeringStatus === 'proposed' ? 'Proposed only' : p.offeringStatus.replace('_', ' ')} /> },
        ]} />
      )}
      {has('citrus_admin', 'business_manager', 'regional_center', 'super_admin') && <Card title="Add a proposed project" className="cz-mt">
        {add.error && <Alert tone="danger">{add.error}</Alert>}
        <form noValidate className="cz-stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); add.run(); }}>
          <div className="cz-grid cz-grid-2">
            <TextInput label="Project name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={add.fieldErrors.name} /><TextInput label="Sponsor" value={f.sponsor} onChange={(e) => setF({ ...f, sponsor: e.target.value })} error={add.fieldErrors.sponsor} />
            <TextInput label="Regional center (optional)" value={f.regionalCenter} onChange={(e) => setF({ ...f, regionalCenter: e.target.value })} /><TextInput label="Location" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} error={add.fieldErrors.location} />
            <TextInput label="Sector" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} error={add.fieldErrors.sector} />
          </div>
          <TextArea label="Description" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={add.fieldErrors.description} />
          <div><Button type="submit" loading={add.pending}>Add as proposed</Button></div>
        </form>
      </Card>}
    </Screen>
  );
}
