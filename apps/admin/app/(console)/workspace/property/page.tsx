'use client';
import Link from 'next/link';
import { useState } from 'react';
import { INDIA_STATES, PROPERTY_KINDS, PROPERTY_KIND_LABELS, RERA_REQUIRED_KINDS } from '@collabiz/types';
import { Alert, Button, Card, Dialog, EmptyState, LoadingState, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, KpiRow, WorkspaceNav, inr } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Project { id: string; code: string; name: string; kind: string; city: string; owner: string | null; reraNumber: string | null; openToPartners: boolean; units: number; available: number; held: number; booked: number; sold: number; soldValue: number; availableValue: number }
interface Res { projects: Project[]; totals: { units: number; available: number; held: number; booked: number; sold: number; soldValue: number; availableValue: number }; owners: { id: string; name: string }[] }

/** Real estate — Unite projects and unit inventory sold through channel partners. */
export default function PropertyAdmin() {
  const q = useQuery<Res>('/admin/property');
  const [creating, setCreating] = useState(false);
  const d = q.data;
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Real Estate &" accent="Property" sub="Industrial parks, homes, commercial space and plots across Unite companies — unit inventory, partner holds, bookings and sales." chips={['Unit inventory', 'Partner holds (48 h)', 'RERA checks', 'Channel-partner commission']} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <KpiRow tint="amber" items={[['company', d.projects.length, 'Projects', `${d.projects.filter((p) => p.openToPartners).length} open to partners`], ['check', d.totals.available, 'Units available', inr(d.totals.availableValue)], ['clock', d.totals.held, 'Held by partners', 'for their buyers'], ['value', inr(d.totals.soldValue), 'Booked and sold', `${d.totals.booked + d.totals.sold} units`]]} />
          <Card>
            <div className="cz-ws-section-head"><h2>Projects</h2><Button size="sm" onClick={() => setCreating(true)}>New project</Button></div>
            {!d.projects.length ? <EmptyState icon="company" title="No projects yet" /> : (
              <ul className="cz-stack" style={{ gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>{d.projects.map((p) => (
                <li key={p.id} className="cz-card cz-lead" data-project={p.name}>
                  <div className="cz-lead-head"><Link href={`/workspace/property/${p.id}`}><strong>{p.name}</strong></Link><span className="cz-muted">{PROPERTY_KIND_LABELS[p.kind]} · {p.owner} · {p.city}{p.reraNumber ? ` · RERA ${p.reraNumber}` : ''}</span>
                    <span style={{ marginLeft: 'auto' }}><StatusBadge status={p.openToPartners ? 'open' : 'closed'} tone={p.openToPartners ? 'success' : 'neutral'} label={p.openToPartners ? 'Open to partners' : 'Not open to partners'} /></span></div>
                  <span className="cz-muted" style={{ fontSize: 13 }}>{p.units} units · {p.available} available · {p.held} held · {p.booked} booked · {p.sold} sold · {inr(p.soldValue)} booked and sold</span>
                </li>
              ))}</ul>
            )}
          </Card>
          <NewProject open={creating} owners={d.owners} onClose={() => setCreating(false)} onDone={() => { setCreating(false); q.reload(); }} />
        </>
      )}
    </div>
  );
}

function NewProject({ open, owners, onClose, onDone }: { open: boolean; owners: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ ownerOrgId: '', name: '', kind: 'industrial_park', city: '', region: '', description: '', reraNumber: '', commission: '2' });
  const save = useMutation(async () => { const r = await api.post('/admin/property/projects', { ...f, ownerOrgId: f.ownerOrgId || owners[0]?.id, commissionBps: Math.round(Number(f.commission || 0) * 100) }); onDone(); return r; });
  const e = save.fieldErrors;
  return (
    <Dialog open={open} onClose={onClose} title="New project">
      <form className="cz-stack" style={{ gap: 10 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }} noValidate>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <Select label="Developer (Unite company)" value={f.ownerOrgId || owners[0]?.id || ''} onChange={(ev) => setF({ ...f, ownerOrgId: ev.target.value })} options={owners.map((o) => ({ value: o.id, label: o.name }))} />
        <TextInput label="Project name" value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} error={e.name} />
        <Select label="Type" value={f.kind} onChange={(ev) => setF({ ...f, kind: ev.target.value })} options={PROPERTY_KINDS.map((k) => ({ value: k, label: PROPERTY_KIND_LABELS[k] }))} />
        <TextInput label="City" value={f.city} onChange={(ev) => setF({ ...f, city: ev.target.value })} error={e.city} />
        <Select label="State" value={f.region} placeholder="Choose a state" onChange={(ev) => setF({ ...f, region: ev.target.value })} options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} error={e.region} />
        <TextArea label="Description" rows={3} value={f.description} onChange={(ev) => setF({ ...f, description: ev.target.value })} error={e.description} />
        <TextInput label={`RERA registration number${RERA_REQUIRED_KINDS.has(f.kind) ? ' (needed before partners can sell)' : ' (if any)'}`} value={f.reraNumber} onChange={(ev) => setF({ ...f, reraNumber: ev.target.value })} />
        <TextInput label="Channel-partner commission (%)" inputMode="decimal" value={f.commission} onChange={(ev) => setF({ ...f, commission: ev.target.value.replace(/[^\d.]/g, '') })} />
        <Button type="submit" loading={save.pending} disabled={!f.name || !f.city || !f.region}>Create project</Button>
      </form>
    </Dialog>
  );
}
