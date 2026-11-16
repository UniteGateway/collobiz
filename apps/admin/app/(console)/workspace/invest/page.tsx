'use client';
import { useState } from 'react';
import { INVESTMENT_KINDS, INVESTMENT_KIND_LABELS } from '@collabiz/types';
import { Alert, Button, DataTable, Dialog, LoadingState, Segmented, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, WorkspaceNav } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type R = Record<string, any>;
const inr = (p: number | null | undefined) => (p == null ? '—' : `₹${Math.round(Number(p) / 100).toLocaleString('en-IN')}`);
const blank = { title: '', kind: 'property_share', summary: '', location: '', unitLabel: 'sq ft', totalUnits: '', unitPrice: '', minUnits: '1', projectedMonthlyRent: '', lockInMonths: '0', sponsor: '', documentsUrl: '' };

/** Group investments & community moderation. Offers take non-binding interest only until a super admin records clearance. */
export default function InvestAdmin() {
  const [tab, setTab] = useState('offers');
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Invest together" accent="& community" sub="List group-investment offers (e.g. property shares per sq ft with rent pro rata), review interest, record regulatory clearance — and moderate the community wall." chips={['Offers', 'Interest book', 'Regulatory gate', 'Moderation']} />
      <Segmented label="Section" value={tab} onChange={setTab} options={[{ value: 'offers', label: 'Investment offers' }, { value: 'moderation', label: 'Community moderation' }]} />
      <div style={{ marginTop: 14 }}>{tab === 'offers' ? <Offers /> : <Moderation />}</div>
    </div>
  );
}

function Offers() {
  const q = useQuery<R[]>('/admin/invest/offers');
  const [f, setF] = useState(blank);
  const [book, setBook] = useState<R | null>(null);
  const rows = useQuery<R[]>(book ? `/admin/invest/offers/${book.id}/interests` : null);
  const create = useMutation(async () => {
    const n = (v: string) => Number(v.replace(/[,\s]/g, ''));
    await api.post('/admin/invest/offers', { ...f, totalUnits: n(f.totalUnits), unitPrice: Math.round(n(f.unitPrice) * 100), minUnits: n(f.minUnits), projectedMonthlyRent: Math.round(n(f.projectedMonthlyRent) * 100), lockInMonths: n(f.lockInMonths), documentsUrl: f.documentsUrl || undefined });
    setF(blank); q.reload();
  });
  const status = useMutation(async (o: R, to: string) => { await api.post(`/admin/invest/offers/${o.id}/status`, { to }); q.reload(); });
  const clear = useMutation(async (o: R) => {
    const reference = window.prompt('Regulatory clearance reference (e.g. SEBI SM REIT registration number / legal opinion reference)'); if (!reference) return;
    const note = window.prompt('Note — what was checked and by whom (10+ characters)'); if (!note) return;
    await api.post(`/admin/invest/offers/${o.id}/clearance`, { reference, note }); q.reload();
  });
  const t = (k: keyof typeof blank, label: string, hint?: string) => <TextInput label={label} hint={hint} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} error={create.fieldErrors[k]} />;
  const err = create.error ?? status.error ?? clear.error;
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <Alert tone="warning" title="Regulated activity">Pooling money from the public into a shared asset is regulated in India (SEBI — Small &amp; Medium REITs; otherwise a possible collective investment scheme). COLLABIZ only records non-binding interest. Do not collect money or allot units outside an approved structure. A super admin records the clearance reference before Unite contacts interested members.</Alert>
      {err && <Alert tone="danger">{err}</Alert>}
      <section className="cz-card" aria-label="New offer">
        <h2 style={{ marginTop: 0, fontSize: 17 }}>New offer (saved as draft)</h2>
        <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); create.run(); }}>
          <div className="cz-grid cz-grid-2">{t('title', 'Title')}<Select label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={INVESTMENT_KINDS.map((k) => ({ value: k, label: INVESTMENT_KIND_LABELS[k] }))} /></div>
          <TextArea label="Summary" rows={3} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} error={create.fieldErrors.summary} />
          <div className="cz-grid cz-grid-3">
            {t('location', 'Location')}{t('sponsor', 'Sponsor / issuer')}{t('unitLabel', 'Unit (e.g. sq ft)')}
            {t('totalUnits', 'Total units')}{t('unitPrice', 'Price per unit (₹)')}{t('minUnits', 'Minimum units')}
            {t('projectedMonthlyRent', 'Projected rent for the whole asset (₹ / month)')}{t('lockInMonths', 'Lock-in (months)')}{t('documentsUrl', 'Offer documents link (optional)')}
          </div>
          <div><Button type="submit" loading={create.pending}>Save draft</Button></div>
        </form>
      </section>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <section className="cz-card"><DataTable caption="Offers" rows={q.data} columns={[
          { key: 't', header: 'Offer', render: (o: R) => <><strong>{o.title}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{o.code} · {o.kindLabel} · {o.location}</span></> },
          { key: 'p', header: 'Price · rent', render: (o: R) => <>{inr(o.unitPrice)}/{o.unitLabel}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{inr(o.projectedMonthlyRent)}/month · {o.grossYieldPct}% gross</span></> },
          { key: 'i', header: 'Interest', render: (o: R) => `${o.interestUnits.toLocaleString('en-IN')} / ${o.totalUnits.toLocaleString('en-IN')} (${o.interestedMembers})` },
          { key: 's', header: 'Status', render: (o: R) => <><StatusBadge status={o.status} tone={o.status === 'interest_open' ? 'success' : 'neutral'} label={o.statusLabel} /><br /><StatusBadge status={o.regulatoryStatus} tone={o.regulatoryStatus === 'cleared' ? 'success' : 'warning'} label={o.regulatoryStatus === 'cleared' ? `Cleared · ${o.clearanceReference}` : 'Clearance pending'} /></> },
          { key: 'a', header: '', render: (o: R) => <div className="cz-row" style={{ gap: 4, flexWrap: 'wrap' }}>
            {o.status !== 'interest_open' && <Button size="sm" variant="secondary" onClick={() => status.run(o, 'interest_open')}>Open for interest</Button>}
            {o.status === 'interest_open' && <Button size="sm" variant="ghost" onClick={() => status.run(o, 'closed')}>Close</Button>}
            {o.regulatoryStatus !== 'cleared' && <Button size="sm" variant="ghost" onClick={() => clear.run(o)}>Record clearance (super admin)</Button>}
            <Button size="sm" variant="ghost" onClick={() => setBook(o)}>Interest list</Button>
          </div> },
        ]} /></section>
      )}
      <Dialog open={!!book} onClose={() => setBook(null)} title={book ? `Interest — ${book.title}` : 'Interest'}>
        {!rows.data ? <LoadingState /> : <DataTable caption="Interested members" rows={rows.data} columns={[
          { key: 'n', header: 'Member', render: (r: R) => <>{r.name}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{r.org ?? ''} · {r.email}</span></> },
          { key: 'u', header: book?.unitLabel ?? 'Units', render: (r: R) => Number(r.units).toLocaleString('en-IN') },
          { key: 'r', header: 'Rent share / month', render: (r: R) => inr(r.monthlyRentShare) },
          { key: 's', header: 'Status', render: (r: R) => r.status },
        ]} />}
      </Dialog>
    </div>
  );
}

function Moderation() {
  const q = useQuery<R[]>('/admin/community/reported');
  const remove = useMutation(async (p: R) => { const reason = window.prompt('Reason for removing this post'); if (!reason) return; await api.post(`/community/posts/${p.id}/remove`, { reason }); q.reload(); });
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  if (!q.data) return <LoadingState />;
  return (
    <section className="cz-card">{remove.error && <Alert tone="danger">{remove.error}</Alert>}<DataTable caption="Reported posts" rows={q.data} empty={<p className="cz-muted">No reported posts.</p>} columns={[
      { key: 'b', header: 'Post', render: (p: R) => <><strong>{p.author}</strong><br />{p.body}</> },
      { key: 'r', header: 'Reports', render: (p: R) => p.reports },
      { key: 'a', header: '', render: (p: R) => <Button size="sm" variant="danger" onClick={() => remove.run(p)}>Remove</Button> },
    ]} /></section>
  );
}
