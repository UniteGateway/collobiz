'use client';
import { useState } from 'react';
import { CLUB_REVIEW_CHECKS, DISPUTE_OPTIONS, countryName, marketsLabel } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, EmptyState, LoadingState, Segmented, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { BannerHeader } from '@/components/Banner';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Product { id: string; code: string; name: string; category: string; sectorName: string; description: string; brandLabel: string; powerFree: boolean; powerOffer: string | null; certifications: string[]; monthlyCapacity: number | null; unit: string | null; mrp: number | null; currency: string; markets: string[]; originCountry: string; contractId: string | null; status: string; statusLabel: string; maker: string; makerVerification: string; reviewNote: string | null; checks: string[] }
interface Power { id: string; code: string; organization: string; needLabel: string; sanctionedLoadKw: number | null; monthlyUnits: number | null; monthlyBill: number | null; state: string; city: string; note: string | null; status: string; statusLabel: string; createdAt: string }
const inr = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

/** Unite Industry Club — OEM product reviews (approval lists the product in the Unite Powertek catalogue) and power requests. */
export default function ClubAdmin() {
  const [tab, setTab] = useState('products');
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <BannerHeader title="Unite Industry Club" description="Approve members’ products for the Unite Powertek brand (approval issues a brand licence that both sides sign online), handle requests to buy green power, and record counsel approval of the legal templates." />
      <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'products', label: 'Product reviews' }, { value: 'power', label: 'Power requests' }, { value: 'legal', label: 'Legal templates' }]} />
      {tab === 'products' ? <Products /> : tab === 'power' ? <PowerRequests /> : <Templates />}
    </div>
  );
}

function Products() {
  const [status, setStatus] = useState('submitted');
  const q = useQuery<{ items: Product[] }>(`/admin/club/products?status=${status}`);
  return (
    <>
      <Segmented label="Status" value={status} onChange={setStatus} options={[{ value: 'submitted', label: 'Waiting for review' }, { value: 'licence_pending', label: 'Licence to sign' }, { value: 'approved', label: 'Licensed' }, { value: 'rejected', label: 'Not approved' }, { value: 'withdrawn', label: 'Withdrawn' }]} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.items.length
        ? <Card><EmptyState icon="package" title="Nothing here">No club products in this state.</EmptyState></Card>
        : q.data.items.map((p) => <Review key={p.id} p={p} onDone={q.reload} />)}
    </>
  );
}

function Review({ p, onDone }: { p: Product; onDone: () => void }) {
  const [checks, setChecks] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [lic, setLic] = useState({ termMonths: '36', warrantyMonths: '12', dispute: 'india', commercial: 'Prices, discounts, payment terms and any royalty or margin will be agreed in writing between the parties before the first purchase order. No royalty, margin or fee is payable through COLLABIZ.' });
  const m = useMutation(async (decision: 'approve' | 'reject') => {
    await api.post(`/admin/club/products/${p.id}/review`, { decision, checks, note: note || undefined, licence: { termMonths: Number(lic.termMonths), warrantyMonths: Number(lic.warrantyMonths), dispute: lic.dispute, commercial: lic.commercial } });
    onDone(); return true;
  });
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
          {p.mrp && <li>MRP: {p.currency} {(p.mrp / 100).toLocaleString('en-IN')}</li>}
          <li>Made in {countryName(p.originCountry)} · Markets: {marketsLabel(p.markets)}</li>
          {p.reviewNote && <li>Review note: {p.reviewNote}</li>}
        </ul>
        {p.status === 'submitted' && (
          <div className="cz-stack" style={{ gap: 8, marginTop: 12 }}>
            <fieldset className="cz-fieldset"><legend>Checks you did</legend>
              {CLUB_REVIEW_CHECKS.map((c) => <Checkbox key={c.code} label={c.label} checked={checks.includes(c.code)} onChange={(e) => setChecks((v) => (e.target.checked ? [...v, c.code] : v.filter((x) => x !== c.code)))} />)}
            </fieldset>
            <fieldset className="cz-fieldset"><legend>Brand licence issued on approval</legend>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <TextInput label="Term (months)" inputMode="numeric" value={lic.termMonths} onChange={(e) => setLic({ ...lic, termMonths: e.target.value })} />
                <TextInput label="Warranty (months)" inputMode="numeric" value={lic.warrantyMonths} onChange={(e) => setLic({ ...lic, warrantyMonths: e.target.value })} />
                <Select label="Law and disputes" value={lic.dispute} onChange={(e) => setLic({ ...lic, dispute: e.target.value })} options={DISPUTE_OPTIONS.map((d) => ({ value: d.code, label: d.label }))} />
              </div>
              <TextArea label="Commercial terms (Schedule C)" rows={3} value={lic.commercial} onChange={(e) => setLic({ ...lic, commercial: e.target.value })} />
            </fieldset>
            <TextArea label="Note to the member (needed to decline)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            {m.error && <Alert tone="danger">{m.error}</Alert>}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button disabled={m.pending || checks.length < CLUB_REVIEW_CHECKS.length} onClick={() => m.run('approve')}>Approve and issue brand licence</Button>
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

interface Tpl { id: string; code: string; version: number; title: string; status: string; legalReviewed: boolean; legalReviewedBy: string | null; legalReviewedAt: string | null; bodyHash: string }
function Templates() {
  const q = useQuery<{ items: Tpl[]; canApprove: boolean }>('/admin/club/templates');
  const [counsel, setCounsel] = useState('');
  const m = useMutation(async (code: string) => { await api.post(`/admin/club/templates/${code}/counsel-approval`, { counsel }); q.reload(); return true; });
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  if (!q.data) return <LoadingState />;
  return (
    <Card>
      <p className="cz-muted" style={{ marginTop: 0 }}>Record counsel approval only after Unite’s lawyer has approved this exact version (identified by its fingerprint). Changing a template’s text creates a new, unapproved version; documents from unapproved versions carry a pilot-draft notice.</p>
      {q.data.canApprove && <div style={{ maxWidth: 420, marginBottom: 12 }}><TextInput label="Counsel (name and firm)" value={counsel} onChange={(e) => setCounsel(e.target.value)} /></div>}
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <div className="cz-table-wrap"><table className="cz-table">
        <thead><tr><th>Template</th><th>Version</th><th>Status</th><th>Counsel</th><th>Fingerprint</th><th /></tr></thead>
        <tbody>{q.data.items.map((t) => (
          <tr key={t.id} data-template={t.code}>
            <td>{t.title}</td><td>{t.version}</td><td>{t.status === 'active' ? 'In use' : 'Retired'}</td>
            <td>{t.legalReviewed ? `${t.legalReviewedBy} · ${t.legalReviewedAt ? new Date(t.legalReviewedAt).toLocaleDateString('en-IN') : ''}` : 'Not yet approved'}</td>
            <td><code>{t.bodyHash.slice(0, 12)}…</code></td>
            <td>{q.data!.canApprove && t.status === 'active' && !t.legalReviewed && <Button size="sm" variant="secondary" disabled={counsel.trim().length < 3 || m.pending} onClick={() => m.run(t.code)}>Record counsel approval</Button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </Card>
  );
}
