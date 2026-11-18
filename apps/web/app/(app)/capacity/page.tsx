'use client';
import { useState } from 'react';
import { CAPACITY_TYPES } from '@collabiz/types';
import { Alert, Button, ButtonLink, Dialog, EmptyState, Skeleton, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { DemoTag, Meter, OpsCard, STATE_OPTIONS, dt, num, rateText, type CapacityOffer } from '@/components/Ops';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';


/** Capacity calendar — find dated spare capacity from verified businesses and request a booking. */
export default function FindCapacity() {
  const [type, setType] = useState(''); const [state, setState] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [min, setMin] = useState('');
  const q = useQuery<CapacityOffer[]>('/capacity/offers', { type: type || undefined, state: state || undefined, from: from || undefined, to: to || undefined, min: min || undefined });
  const [pick, setPick] = useState<CapacityOffer | null>(null);
  const [f, setF] = useState({ units: '1', from: '', to: '', note: '' });
  const [done, setDone] = useState('');
  const book = useMutation(async () => { await api.post(`/capacity/offers/${pick!.id}/book`, { units: Number(f.units), from: f.from, to: f.to, note: f.note || undefined }); setDone(`Booking requested from ${pick!.org}. You will be notified when they accept or decline.`); setPick(null); q.reload(); return true; });
  const open = (o: CapacityOffer) => { setPick(o); setF({ units: '1', from: from || (o.from > new Date().toISOString().slice(0, 10) ? o.from : new Date().toISOString().slice(0, 10)), to: to || from || o.to, note: '' }); };
  return (
    <Screen page={{ key: 'capacity', title: 'Capacity calendar', access: 'partner' }} eyebrow="Capacity"
      description="Book spare capacity from verified businesses — trained people, office seats, vehicles, machines, production lines and space — for exact dates."
      actions={<ButtonLink href="/capacity/mine?publish=1" variant="accent">Publish my capacity</ButtonLink>}>
      {done && <Alert tone="success">{done}</Alert>}
      <div className="cz-ugp-filters" role="group" aria-label="Filter capacity">
        <label className="cz-mini-field">Capacity type<select aria-label="Capacity type" value={type} onChange={(e) => setType(e.target.value)}><option value="">Any</option>{CAPACITY_TYPES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
        <label className="cz-mini-field">State<select aria-label="State" value={state} onChange={(e) => setState(e.target.value)}><option value="">Any</option>{STATE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
        <label className="cz-mini-field">From<input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="cz-mini-field">To<input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="cz-mini-field">At least (units)<input inputMode="numeric" aria-label="At least (units)" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} /></label>
      </div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={260} /> : !q.data.length ? <EmptyState title="No capacity matches">Try other dates or a wider area.</EmptyState> : (
        <div className="cz-ops-grid">{q.data.map((o) => (
          <OpsCard key={o.id} testId="capacity-card" eyebrow={o.typeLabel} tone="green" badges={<><span className="cz-muted">{o.stateName}</span><DemoTag on={o.demo} /></>} title={o.title} text={o.notes}
            meta={[['Free', <span key="f"><strong>{num(o.free)}</strong> of {num(o.units)}</span>], ['Dates', `${dt(o.from)} – ${dt(o.to)}`], ['Rate', rateText(o)], ['From', o.org ?? '—']]}
            foot={<><Meter value={o.free} max={o.units} label={`${o.free} of ${o.units} free`} />{o.mine ? <span className="cz-muted">Your capacity</span> : <Button size="sm" onClick={() => open(o)}>Request booking</Button>}</>} />
        ))}</div>
      )}
      <Dialog open={!!pick} onClose={() => setPick(null)} title={pick ? `Book: ${pick.title}` : 'Book'}>
        {pick && <form noValidate className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); book.run(); }}>
          <p className="cz-muted" style={{ margin: 0 }}>{pick.org} · {num(pick.free)} {pick.typeLabel.toLowerCase()} free · available {dt(pick.from)} – {dt(pick.to)} · {rateText(pick)}</p>
          {book.error && <Alert tone="danger">{book.error}</Alert>}
          <TextInput label={`How many (${pick.typeLabel.toLowerCase()})`} inputMode="numeric" value={f.units} onChange={(e) => setF({ ...f, units: e.target.value.replace(/\D/g, '') })} error={book.fieldErrors.units} />
          <div className="cz-grid cz-grid-2"><TextInput label="From" type="date" value={f.from} min={pick.from} max={pick.to} onChange={(e) => setF({ ...f, from: e.target.value })} error={book.fieldErrors.from} />
            <TextInput label="To" type="date" value={f.to} min={pick.from} max={pick.to} onChange={(e) => setF({ ...f, to: e.target.value })} error={book.fieldErrors.to} /></div>
          <TextArea label="Note to the owner (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={3} />
          <div className="cz-row" style={{ gap: 8 }}><Button type="submit" loading={book.pending}>Send booking request</Button><Button type="button" variant="ghost" onClick={() => setPick(null)}>Cancel</Button></div>
        </form>}
      </Dialog>
    </Screen>
  );
}
