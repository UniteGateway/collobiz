'use client';
import { useState } from 'react';
import { OEM_STATUS } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, EmptyState, LoadingState, Segmented, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { BannerHeader } from '@/components/Banner';
import { BrandProducts } from '@/components/BrandProductEditor';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface App { id: string; code: string; productName: string; roleLabel: string; businessTypeLabel: string; name: string; email: string; phone: string; company: string | null; state: string; district: string | null; city: string; territory: string | null; details: Record<string, unknown>; match: { score: number; suggestedRole: string | null; reasons: string[] } | null; orgId: string | null; status: string; statusLabel: string; approvedTerritory: string | null; createdAt: string }
interface Oem { slug: string; name: string; oemPartner: string | null; oemStatus: string | null; oemPublic: boolean; open: boolean; stage: string }

/** Unite brand products — channel-partner applications and OEM manufacturer records. */
export default function BrandChannelsAdmin() {
  const [tab, setTab] = useState('products');
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <BannerHeader title="Unite brand products" description="Add a product once — its microsite, web address, partner applications, matching rules and dealer CRM are created when you publish. Review distributor, dealer, store, franchise and manufacturer applications, and keep each product's OEM manufacturer record." />
      <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'products', label: 'Products' }, { value: 'apps', label: 'Applications' }, { value: 'oem', label: 'OEM manufacturers' }]} />
      {tab === 'products' ? <BrandProducts /> : tab === 'apps' ? <Apps /> : <Oems />}
    </div>
  );
}

function Apps() {
  const [status, setStatus] = useState('submitted');
  const q = useQuery<{ items: App[] }>(`/admin/brand-products/applications?status=${status}`);
  return (
    <>
      <Segmented label="Status" value={status} onChange={setStatus} options={[{ value: 'submitted', label: 'New' }, { value: 'shortlisted', label: 'Shortlisted' }, { value: 'approved', label: 'Approved' }, { value: 'declined', label: 'Declined' }]} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.items.length ? <Card><EmptyState icon="briefcase" title="Nothing here">No applications in this state.</EmptyState></Card>
        : q.data.items.map((a) => <AppCard key={a.id} a={a} onDone={q.reload} />)}
    </>
  );
}

function AppCard({ a, onDone }: { a: App; onDone: () => void }) {
  const [territory, setTerritory] = useState(a.territory ?? `${a.district ?? a.city}, ${a.state}`);
  const [note, setNote] = useState('');
  const m = useMutation(async (decision: string) => { await api.post(`/admin/brand-products/applications/${a.id}/decide`, { decision, territory: decision === 'approve' ? territory : undefined, note: note || undefined }); onDone(); return true; });
  const d = a.details as { warehouseSqft?: number; showroomSqft?: number; currentBrands?: string; experienceYears?: number; capacity?: string; message?: string };
  return (
    <Card>
      <div data-channel-app={a.code}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div><h2 style={{ margin: 0 }}>{a.productName} — {a.roleLabel}</h2><p className="cz-muted" style={{ margin: '4px 0 0' }}>{a.code} · {a.name}{a.company ? `, ${a.company}` : ''} · {a.city}{a.district ? `, ${a.district}` : ''}, {a.state} · {a.email} · {a.phone}</p></div>
          <StatusBadge status={a.status} label={a.statusLabel} tone={a.status === 'approved' ? 'success' : a.status === 'declined' ? 'neutral' : 'info'} />
        </div>
        <ul className="cz-muted" style={{ paddingLeft: 18 }}>
          <li>Business today: {a.businessTypeLabel}{d.experienceYears != null ? ` · ${d.experienceYears} years` : ''}{d.currentBrands ? ` · sells ${d.currentBrands}` : ''}</li>
          {(d.warehouseSqft || d.showroomSqft) && <li>{d.warehouseSqft ? `Warehouse ${d.warehouseSqft.toLocaleString('en-IN')} sq ft` : ''}{d.warehouseSqft && d.showroomSqft ? ' · ' : ''}{d.showroomSqft ? `Showroom ${d.showroomSqft.toLocaleString('en-IN')} sq ft` : ''}</li>}
          {d.capacity && <li>Capacity: {d.capacity}</li>}
          {a.territory && <li>Wants to cover: {a.territory}</li>}
          {d.message && <li>“{d.message}”</li>}
          {a.match && <li>Matching agent: {a.match.score}% fit{a.match.suggestedRole ? ` · suggests ${a.match.suggestedRole}` : ''} — {a.match.reasons.join(' · ')}</li>}
          <li>{a.orgId ? 'Linked to a COLLABIZ business account' : 'Not linked yet — the applicant needs a COLLABIZ business account with this email before approval'}</li>
          {a.approvedTerritory && <li>Approved territory: {a.approvedTerritory}</li>}
        </ul>
        {['submitted', 'shortlisted'].includes(a.status) && (
          <div className="cz-stack" style={{ gap: 8 }}>
            <div className="cz-grid cz-grid-2"><TextInput label="Territory (for approval)" value={territory} onChange={(e) => setTerritory(e.target.value)} /><TextInput label="Note (needed to decline)" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            {m.error && <Alert tone="danger">{m.error}</Alert>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button disabled={m.pending} onClick={() => m.run('approve')}>Approve</Button>
              {a.status === 'submitted' && <Button variant="secondary" disabled={m.pending} onClick={() => m.run('shortlist')}>Shortlist</Button>}
              <Button variant="ghost" disabled={m.pending} onClick={() => m.run('decline')}>Decline</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function Oems() {
  const q = useQuery<{ items: Oem[]; canPublish: boolean }>('/admin/brand-products/oem');
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  if (!q.data) return <LoadingState />;
  return (
    <div className="cz-stack" style={{ gap: 12 }}>
      <Alert tone="info">Manufacturer names are internal. The public page shows “an approved manufacturer” and the status until a super admin makes the name public — do that only once the OEM agreement allows it.</Alert>
      {q.data.items.map((o) => <OemRow key={o.slug} o={o} canPublish={q.data!.canPublish} onDone={q.reload} />)}
    </div>
  );
}
function OemRow({ o, canPublish, onDone }: { o: Oem; canPublish: boolean; onDone: () => void }) {
  const [f, setF] = useState({ oemPartner: o.oemPartner ?? '', oemStatus: o.oemStatus ?? 'planned', oemPublic: o.oemPublic });
  const m = useMutation(async () => { await api.post(`/admin/brand-products/oem/${o.slug}`, { oemPartner: f.oemPartner || undefined, oemStatus: f.oemStatus, ...(canPublish ? { oemPublic: f.oemPublic } : {}) }); onDone(); return true; });
  return (
    <Card>
      <div data-oem={o.slug}>
        <h2 style={{ marginTop: 0 }}>{o.name} <span className="cz-muted" style={{ fontSize: 14, fontWeight: 400 }}>· {o.open ? 'open to partners' : 'not yet open to partners (open it on the Unite businesses page)'}</span></h2>
        <div className="cz-grid cz-grid-2">
          <TextInput label="OEM manufacturer" value={f.oemPartner} onChange={(e) => setF({ ...f, oemPartner: e.target.value })} />
          <Select label="Status" value={f.oemStatus} onChange={(e) => setF({ ...f, oemStatus: e.target.value })} options={Object.entries(OEM_STATUS).map(([value, label]) => ({ value, label }))} />
        </div>
        {canPublish && <Checkbox label="Show the manufacturer's name on the public page" checked={f.oemPublic} onChange={(e) => setF({ ...f, oemPublic: e.target.checked })} />}
        {m.error && <Alert tone="danger">{m.error}</Alert>}
        <div style={{ marginTop: 8 }}><Button size="sm" disabled={m.pending} onClick={() => m.run()}>Save</Button></div>
      </div>
    </Card>
  );
}
