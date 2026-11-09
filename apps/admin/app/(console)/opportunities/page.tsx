'use client';
import { useMemo, useState } from 'react';
import { SECTORS, sectorName, newIdempotencyKey } from '@collabiz/types';
import { humanize, Alert, Button, Card, DataTable, Dialog, LoadingState, Money, PageHeader, Select, StatusBadge, Tabs, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { INDIA_STATES, toMinor } from '@/lib/regions';

const EMPTY = { title: '', summary: '', sector: 'solar', kind: 'project', city: '', region: '', estimatedValue: '', deadline: '', visibility: 'verified_partners', minLevel: 'verified', certs: '' };

/** Unite-owned listing publisher (route A, §2.1) — supports marketplace screens 031/032. */
export default function AdminOpportunities() {
  const { me } = useSession();
  const [tab, setTab] = useState('');
  const q = useQuery<any[]>('/admin/opportunities', { status: tab });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const key = useMemo(newIdempotencyKey, [open]);
  const companies = (me?.memberships ?? []).filter((m) => m.orgType === 'group_company');
  const [gc, setGc] = useState('');
  const create = useMutation(async () => {
    await api.request('POST', '/admin/opportunities', {
      title: f.title, summary: f.summary, sector: f.sector, kind: f.kind, route: 'unite_owned', city: f.city || undefined, region: f.region || undefined, estimatedValue: toMinor(f.estimatedValue),
      deadline: f.deadline ? new Date(f.deadline).toISOString() : undefined, visibility: f.visibility, minLevel: f.minLevel, requiredCertifications: f.certs.split(',').map((c) => c.trim()).filter(Boolean), groupCompanyId: gc || companies[0]?.organizationId, publish: true,
    }, { idempotencyKey: key });
    setOpen(false); setF(EMPTY); q.reload(); return true;
  });
  const close = useMutation(async (id: string) => { const reason = window.prompt('Reason for closing (min 5 characters)'); if (!reason) return false; await api.post(`/admin/opportunities/${id}/close`, { reason }); q.reload(); return true; });
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div>
      <PageHeader title="Opportunity publishing" breadcrumb="Unite Group Administration / Route A — Unite-owned business" actions={<Button onClick={() => setOpen(true)}>Publish opportunity</Button>} description="Publish Unite-owned products, jobs, RFQs, projects and distributor requests. Partner-originated leads arrive through the routing queue instead." />
      {close.error && <Alert tone="danger">{close.error}</Alert>}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: '', label: 'All' }, { value: 'qualification', label: 'Open' }, { value: 'submitted', label: 'Awaiting review (RFQs)' }, { value: 'lost', label: 'Closed' }]} />
      <Card>
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <DataTable caption="Opportunities" rows={q.data ?? []} columns={[
            { key: 'title', header: 'Opportunity', render: (o) => <><strong>{o.title}</strong><div className="cz-mono cz-muted">{o.code} · {o.ownerName}</div></> },
            { key: 'sector', header: 'Sector', render: (o) => sectorName(o.sector) },
            { key: 'source', header: 'Source', render: (o) => o.source.replace('_', ' ') },
            { key: 'value', header: 'Value', render: (o) => <Money minor={o.estimatedValue} /> },
            { key: 'applicants', header: 'Applicants' },
            { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
            { key: 'a', header: '', render: (o) => o.status === 'qualification' && <Button size="sm" variant="ghost" onClick={() => close.run(o.id)}>Close</Button> },
          ]} />
        )}
      </Card>
      <Dialog open={open} onClose={() => setOpen(false)} title="Publish Unite-owned opportunity">
        <form noValidate onSubmit={(e) => { e.preventDefault(); create.run(); }}>
          {create.error && <Alert tone="danger">{create.error}</Alert>}
          {companies.length > 1 && <Select label="Group company" value={gc} onChange={(e) => setGc(e.target.value)} options={companies.map((c) => ({ value: c.organizationId, label: c.orgName }))} />}
          <TextInput label="Title" value={f.title} onChange={set('title')} error={create.fieldErrors.title} />
          <TextArea label="Scope summary" value={f.summary} onChange={set('summary')} error={create.fieldErrors.summary} />
          <div className="cz-grid cz-grid-2">
            <Select label="Sector" value={f.sector} onChange={set('sector')} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
            <Select label="Type" value={f.kind} onChange={set('kind')} options={['project', 'product_supply', 'service', 'job', 'distributorship', 'rfq', 'tender'].map((k) => ({ value: k, label: humanize(k) }))} />
            <TextInput label="City" value={f.city} onChange={set('city')} />
            <Select label="State" value={f.region} onChange={set('region')} placeholder="—" options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} />
            <TextInput label="Indicative value ₹" inputMode="decimal" value={f.estimatedValue} onChange={set('estimatedValue')} />
            <TextInput label="Closing date" type="date" value={f.deadline} onChange={set('deadline')} />
            <Select label="Visible to" value={f.visibility} onChange={set('visibility')} options={[{ value: 'public', label: 'Public' }, { value: 'verified_partners', label: 'Signed-in partners' }]} />
            <Select label="Minimum level" value={f.minLevel} onChange={set('minLevel')} options={['registered', 'verified', 'certified', 'strategic'].map((l) => ({ value: l, label: l }))} />
          </div>
          <TextInput label="Required certifications (comma-separated)" value={f.certs} onChange={set('certs')} />
          <div className="cz-row"><Button type="submit" loading={create.pending}>Publish</Button><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
