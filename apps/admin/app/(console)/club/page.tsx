'use client';
import { useState } from 'react';
import { CLUB_REVIEW_CHECKS } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, EmptyState, LoadingState, Segmented, StatusBadge, TextArea } from '@collabiz/ui';
import { BannerHeader } from '@/components/Banner';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Product { id: string; code: string; name: string; category: string; sectorName: string; description: string; brandLabel: string; powerFree: boolean; powerOffer: string | null; certifications: string[]; monthlyCapacity: number | null; unit: string | null; mrp: number | null; status: string; statusLabel: string; maker: string; makerVerification: string; reviewNote: string | null; checks: string[] }
interface Power { id: string; code: string; organization: string; needLabel: string; sanctionedLoadKw: number | null; monthlyUnits: number | null; monthlyBill: number | null; state: string; city: string; note: string | null; status: string; statusLabel: string; createdAt: string }
const inr = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

/** Unite Industry Club — OEM product reviews (approval lists the product in the Unite Powertek catalogue) and power requests. */
export default function ClubAdmin() {
  const [tab, setTab] = useState('products');
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <BannerHeader title="Unite Industry Club" description="Approve members’ products for the Unite Powertek brand, and handle requests to buy green power. Approval needs every check, including the signed brand licence." />
      <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'products', label: 'Product reviews' }, { value: 'power', label: 'Power requests' }]} />
      {tab === 'products' ? <Products /> : <PowerRequests />}
    </div>
  );
}

function Products() {
  const [status, setStatus] = useState('submitted');
  const q = useQuery<{ items: Product[] }>(`/admin/club/products?status=${status}`);
  return (
    <>
      <Segmented label="Status" value={status} onChange={setStatus} options={[{ value: 'submitted', label: 'Waiting for review' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Not approved' }, { value: 'withdrawn', label: 'Withdrawn' }]} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.items.length
        ? <Card><EmptyState icon="package" title="Nothing here">No club products in this state.</EmptyState></Card>
        : q.data.items.map((p) => <Review key={p.id} p={p} onDone={q.reload} />)}
    </>
  );
}

function Review({ p, onDone }: { p: Product; onDone: () => void }) {
  const [checks, setChecks] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const m = useMutation(async (decision: 'approve' | 'reject') => { await api.post(`/admin/club/products/${p.id}/review`, { decision, checks, note: note || undefined }); onDone(); return true; });
  return (
    <Card>
      <div data-club-product={p.code}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div><h2 style={{ margin: 0 }}>{p.name}</h2><p className="cz-muted" style={{ margin: '4px 0 0' }}>{p.code} · {p.category} · {p.sectorName} · by {p.maker} (KYB: {p.makerVerification})</p></div>
          <StatusBadge status={p.status} label={p.statusLabel} tone={p.status === 'approved' ? 'success' : p.status === 'submitted' ? 'info' : 'neutral'} />
        </div>
        <p>{p.description}</p>
        <ul className="cz-muted" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Brand: {p.brandLabel}</li>
          <li>Free power: {p.powerFree ? p.powerOffer : 'No'}</li>
          {p.certifications.length > 0 && <li>Certifications: {p.certifications.join(', ')}</li>}
          {p.monthlyCapacity && <li>Capacity: {p.monthlyCapacity.toLocaleString('en-IN')} {p.unit ?? ''} a month</li>}
          {p.mrp && <li>MRP: {inr(p.mrp)}</li>}
          {p.reviewNote && <li>Review note: {p.reviewNote}</li>}
        </ul>
        {p.status === 'submitted' && (
          <div className="cz-stack" style={{ gap: 8, marginTop: 12 }}>
            <fieldset className="cz-fieldset"><legend>Checks you did</legend>
              {CLUB_REVIEW_CHECKS.map((c) => <Checkbox key={c.code} label={c.label} checked={checks.includes(c.code)} onChange={(e) => setChecks((v) => (e.target.checked ? [...v, c.code] : v.filter((x) => x !== c.code)))} />)}
            </fieldset>
            <TextArea label="Note to the member (needed to decline)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            {m.error && <Alert tone="danger">{m.error}</Alert>}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button disabled={m.pending || checks.length < CLUB_REVIEW_CHECKS.length} onClick={() => m.run('approve')}>Approve and list in Powertek catalogue</Button>
              <Button variant="secondary" disabled={m.pending} onClick={() => m.run('reject')}>Decline</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function PowerRequests() {
  const q = useQuery<{ items: Power[] }>('/admin/club/power-requests');
  const m = useMutation(async (id: string, to: string) => { await api.post(`/admin/club/power-requests/${id}/status`, { to }); q.reload(); return true; });
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  if (!q.data) return <LoadingState />;
  if (!q.data.items.length) return <Card><EmptyState icon="value" title="No power requests yet">Members’ requests to buy power appear here.</EmptyState></Card>;
  return (
    <Card>
      <div className="cz-table-wrap"><table className="cz-table">
        <thead><tr><th>Request</th><th>Business</th><th>Need</th><th>Consumption</th><th>Place</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{q.data.items.map((r) => (
          <tr key={r.id}>
            <td>{r.code}<div className="cz-muted">{new Date(r.createdAt).toLocaleDateString('en-IN')}</div></td>
            <td>{r.organization}</td><td>{r.needLabel}{r.note && <div className="cz-muted">{r.note}</div>}</td>
            <td>{[r.monthlyUnits && `${r.monthlyUnits.toLocaleString('en-IN')} units/month`, r.monthlyBill && `${inr(r.monthlyBill)}/month`, r.sanctionedLoadKw && `${r.sanctionedLoadKw} kW load`].filter(Boolean).join(' · ')}</td>
            <td>{r.city}, {r.state}</td><td>{r.statusLabel}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
              {r.status === 'new' && <Button size="sm" variant="secondary" onClick={() => m.run(r.id, 'in_progress')}>Start</Button>}
              {r.status === 'in_progress' && <Button size="sm" variant="secondary" onClick={() => m.run(r.id, 'proposal_sent')}>Proposal sent</Button>}
              {r.status !== 'closed' && <Button size="sm" variant="ghost" onClick={() => m.run(r.id, 'closed')}>Close</Button>}
            </td>
          </tr>
        ))}</tbody>
      </table></div>
    </Card>
  );
}
