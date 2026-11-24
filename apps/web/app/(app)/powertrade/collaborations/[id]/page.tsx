'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PT_MODELS, PT_STATUS, type PtModel, type PtStatus } from '@collabiz/types';
import { Alert, Button, Icon, Skeleton, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { PtNav, PtStatusBadge, rupees } from '@/components/Powertrade';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Detail {
  id: string; code: string; title: string; summary: string; model: PtModel; status: PtStatus; statusLabel: string; supplyValuePaise: number | null; benefitValuePaise: number | null; powerTariffPaisePerKwh: number | null; powerUnitsPerMonth: number | null;
  taxReview: string; required: { docType: string; label: string; status: string; reference: string | null }[]; next: PtStatus[];
  history: { from?: string; to: string; byName: string; at: string; note?: string | null }[];
}

/** One collaboration: the separate legs, documents checklist, workflow and attributable history. */
export default function PtCollaboration() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Detail>(`/powertrade/collaborations/${id}`);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const move = useMutation(async (to: string) => { const note = to === 'cancelled' || to === 'disputed' ? window.prompt('Reason') ?? undefined : undefined; await api.post(`/powertrade/collaborations/${id}/transition`, { to, note }); q.reload(); return true; });
  const doc = useMutation(async (docType: string) => { await api.post(`/powertrade/collaborations/${id}/documents`, { docType, status: 'provided', reference: refs[docType] }); q.reload(); return true; });
  const c = q.data;
  return (
    <Screen page={{ key: 'powertrade-collab', title: c?.title ?? 'Collaboration', access: 'partner' }} header={false}>
      <Link href="/powertrade/collaborations" className="cz-od-back"><Icon name="prev" size={16} />My collaborations</Link>
      <PtNav />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !c ? <Skeleton height={300} /> : (
        <div className="cz-stack" style={{ gap: 16 }} data-collab-detail={c.code}>
          <header className="cz-uc-head"><div><p className="cz-ph-eyebrow">{c.code} · {PT_MODELS[c.model].label}</p><h1>{c.title}</h1><p>{c.summary}</p></div><PtStatusBadge s={c.status} /></header>
          {(move.error || doc.error) && <Alert tone="danger">{move.error ?? doc.error}</Alert>}
          <div className="pt-legs">
            {c.supplyValuePaise != null && <div><span>Product / service supply</span><strong>{rupees(c.supplyValuePaise)}</strong><small>Its own supply agreement, PO and invoice</small></div>}
            {c.benefitValuePaise != null && <div><span>Separately agreed benefit</span><strong>{rupees(c.benefitValuePaise)}</strong><small>Rebate / value adjustment agreement</small></div>}
            {c.powerTariffPaisePerKwh != null && <div><span>Renewable power (separate PPA)</span><strong>₹{(c.powerTariffPaisePerKwh / 100).toFixed(2)}/kWh</strong><small>{c.powerUnitsPerMonth ? `${c.powerUnitsPerMonth.toLocaleString('en-IN')} units/month` : 'Units to be agreed'}</small></div>}
            <div><span>Tax review</span><strong>{c.taxReview === 'cleared' ? 'Cleared' : c.taxReview === 'issues' ? 'Issues found' : 'Pending'}</strong><small>By Unite finance or compliance</small></div>
          </div>
          <section className="cz-card"><h2 style={{ marginTop: 0 }}>Documents</h2>
            <ul className="pt-docs">{c.required.map((d) => (
              <li key={d.docType} data-doc={d.docType} data-status={d.status}>
                <span className="pt-doc-state">{d.status === 'accepted' ? '✓' : d.status === 'provided' ? '…' : d.status === 'rejected' ? '!' : '○'}</span>
                <div><strong>{d.label}</strong><span>{d.status === 'missing' ? 'Not provided' : `${d.status[0].toUpperCase()}${d.status.slice(1)}${d.reference ? ` · ${d.reference}` : ''}`}</span></div>
                {d.status !== 'accepted' && <form className="pt-doc-form" onSubmit={(e) => { e.preventDefault(); doc.run(d.docType); }}>
                  <TextInput label={`Reference for ${d.label}`} placeholder="Vault link, contract or PO number" value={refs[d.docType] ?? ''} onChange={(e) => setRefs({ ...refs, [d.docType]: e.target.value })} />
                  <Button type="submit" size="sm" variant="secondary" disabled={!(refs[d.docType] ?? '').trim()}>Mark provided</Button>
                </form>}
              </li>
            ))}</ul>
            <p className="cz-muted" style={{ fontSize: 13, marginBottom: 0 }}>Upload files to the <Link href="/vault">document vault</Link> or sign agreements in <Link href="/contracts">Contracts</Link>, then add the reference here. A Unite reviewer accepts each document.</p>
          </section>
          <section className="cz-card"><h2 style={{ marginTop: 0 }}>Next step</h2>
            {!c.next.length ? <p className="cz-muted">No further steps — this collaboration is {c.statusLabel.toLowerCase()}.</p> : (
              <div className="cz-row" style={{ gap: 8, flexWrap: 'wrap' }}>{c.next.map((s) => <Button key={s} size="sm" variant={s === 'cancelled' || s === 'disputed' || s === 'expired' ? 'ghost' : 'secondary'} onClick={() => move.run(s)} loading={move.pending}>{PT_STATUS[s]}</Button>)}</div>
            )}
            <p className="cz-muted" style={{ fontSize: 13 }}>Approval is recorded by a Unite reviewer after technical, regulatory and tax checks. Nothing here signs a PPA, moves money or nets invoices between different companies.</p>
          </section>
          <section className="cz-card"><h2 style={{ marginTop: 0 }}>History</h2>
            <ol className="pt-history">{c.history.map((h, i) => <li key={i}><strong>{PT_STATUS[h.to as PtStatus] ?? h.to}</strong> · {h.byName} · {new Date(h.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}{h.note ? ` — ${h.note}` : ''}</li>)}</ol>
          </section>
        </div>
      )}
    </Screen>
  );
}
