'use client';
import Link from 'next/link';
import { useState } from 'react';
import { COUNTRIES } from '@collabiz/types';
import { Alert, Button, EmptyState, Icon, Segmented, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Enq { id: string; code: string; direction: string; product: string; hsCode: string | null; quantity: string; originName: string; destinationName: string; incoterm: string; status: string; response: string | null; org: string; mine: boolean; handler: boolean; createdAt: string }
const STATUS: Record<string, [string, string]> = { open: ['Awaiting reply', 'info'], quoted: ['Replied', 'success'], closed: ['Closed', 'neutral'] };

/** Screen 122 — Import / export enquiry desk. Enquiries go to Unite Exim, which replies here. */
export default function ImportExport() {
  const q = useQuery<Enq[]>('/global/enquiries');
  const [dir, setDir] = useState<'export' | 'import'>('export');
  const [f, setF] = useState({ product: '', hsCode: '', quantity: '', other: 'AE', incoterm: 'FOB', notes: '' });
  const [reply, setReply] = useState<Record<string, string>>({});
  const m = useMutation(async () => {
    const e = await api.post<{ code: string; id: string }>('/global/enquiries', { direction: dir, product: f.product, hsCode: f.hsCode || undefined, quantity: f.quantity, originCountry: dir === 'export' ? 'IN' : f.other, destinationCountry: dir === 'export' ? f.other : 'IN', incoterm: f.incoterm, notes: f.notes || undefined });
    setF({ ...f, product: '', hsCode: '', quantity: '', notes: '' }); await q.reload(); return e;
  });
  const respond = useMutation(async (id: string) => { await api.post(`/global/enquiries/${id}/respond`, { response: reply[id] }); await q.reload(); return true; });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Screen id="122" title="Import & export" description="Tell Unite Exim what you need to move across borders. They reply with sourcing, freight and documentation options.">
      <div className="cz-help">
        <form className="cz-card cz-sched" onSubmit={(e) => { e.preventDefault(); m.run(); }} aria-labelledby="xe-h">
          <h2 id="xe-h" className="cz-help-h cz-sched-wide" style={{ margin: 0 }}>New enquiry</h2>
          <div className="cz-sched-wide"><Segmented label="Direction" value={dir} onChange={(v) => setDir(v as 'export' | 'import')} options={[{ value: 'export', label: 'Export from India' }, { value: 'import', label: 'Import into India' }]} /></div>
          {m.data && <div className="cz-sched-wide"><Alert tone="success" title={`Enquiry ${m.data.code} sent to Unite Exim.`}><Link href={`/global/compliance?enquiryId=${m.data.id}`}>See the documents checklist</Link></Alert></div>}
          {m.error && <div className="cz-sched-wide"><Alert tone="danger">{m.error}{Object.values(m.fieldErrors).length ? ` — ${Object.values(m.fieldErrors).join('; ')}` : ''}</Alert></div>}
          <label className="cz-sched-wide">Product<input className="cz-input" value={f.product} onChange={set('product')} placeholder="e.g. Distribution transformers 250 kVA" /></label>
          <label>HS code (optional)<input className="cz-input" inputMode="numeric" value={f.hsCode} onChange={(e) => setF({ ...f, hsCode: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="850423" /></label>
          <label>Quantity<input className="cz-input" value={f.quantity} onChange={set('quantity')} placeholder="20 units" /></label>
          <label>{dir === 'export' ? 'Destination' : 'Origin'}<select className="cz-select" value={f.other} onChange={set('other')}>{COUNTRIES.filter(([c]) => c !== 'IN').map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
          <label>Incoterm<select className="cz-select" value={f.incoterm} onChange={set('incoterm')}>{['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP'].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="cz-sched-wide">Notes<textarea className="cz-input" rows={3} value={f.notes} onChange={set('notes')} placeholder="Specifications, certifications needed, delivery window" /></label>
          <div className="cz-sched-wide"><Button type="submit" variant="accent" loading={m.pending} disabled={f.product.trim().length < 3 || !f.quantity.trim()}>Send to Unite Exim</Button></div>
        </form>
        <section aria-labelledby="ex-h">
          <h2 id="ex-h" className="cz-help-h">Enquiries</h2>
          {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={160} /> : !q.data.length ? <div className="cz-card"><EmptyState icon="trading" title="No enquiries yet" /></div> : (
            <ul className="cz-review-list">{q.data.map((e) => (
              <li key={e.id} className="cz-card cz-review" data-enquiry={e.code}>
                <div className="cz-review-head"><strong>{e.product}</strong><StatusBadge status={e.status} tone={STATUS[e.status]?.[1] as never} label={STATUS[e.status]?.[0] ?? e.status} /></div>
                <span className="cz-muted" style={{ fontSize: 13 }}><span className="cz-mono">{e.code}</span> · {e.direction === 'export' ? 'Export' : 'Import'} · {e.originName} → {e.destinationName} · {e.quantity} · {e.incoterm}{!e.mine ? ` · from ${e.org}` : ''}</span>
                {e.response && <blockquote className="cz-review-reply"><strong>Unite Exim</strong>{e.response}</blockquote>}
                {e.mine && <Link href={`/global/compliance?enquiryId=${e.id}`} className="cz-link-arrow">Documents checklist<Icon name="arrow" size={14} /></Link>}
                {e.handler && e.status === 'open' && (
                  <form className="cz-stack" style={{ gap: 8 }} onSubmit={(ev) => { ev.preventDefault(); respond.run(e.id); }}>
                    <textarea className="cz-input" rows={2} aria-label={`Reply to ${e.code}`} value={reply[e.id] ?? ''} onChange={(ev) => setReply({ ...reply, [e.id]: ev.target.value })} placeholder="Sourcing, freight and documentation options" />
                    <Button type="submit" size="sm" disabled={(reply[e.id] ?? '').trim().length < 10} loading={respond.pending}>Reply</Button>
                  </form>
                )}
              </li>
            ))}</ul>
          )}
        </section>
      </div>
    </Screen>
  );
}
