'use client';
import Link from 'next/link';
import { useState } from 'react';
import { CLUB_POWER_NEEDS, INDIA_STATES } from '@collabiz/types';
import { Alert, Button, Card, EmptyState, LoadingState, Select, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface R { id: string; code: string; needLabel: string; city: string; state: string; monthlyUnits: number | null; statusLabel: string; createdAt: string }

/** Unite Industry Club — buy green power for the member's own premises. */
export default function ClubPower() {
  const q = useQuery<{ items: R[] }>('/club/power-requests');
  const [f, setF] = useState({ need: 'open_access', state: 'Telangana', city: '', monthlyUnits: '', monthlyBill: '', sanctionedLoadKw: '', note: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const [done, setDone] = useState<string | null>(null);
  const m = useMutation(async () => {
    const r = await api.post<{ code: string }>('/club/power-requests', {
      need: f.need, state: f.state, city: f.city, note: f.note || undefined, monthlyUnits: f.monthlyUnits ? Number(f.monthlyUnits) : undefined,
      monthlyBill: f.monthlyBill ? Math.round(Number(f.monthlyBill) * 100) : undefined, sanctionedLoadKw: f.sanctionedLoadKw ? Number(f.sanctionedLoadKw) : undefined,
    });
    setDone(r.code); q.reload(); return true;
  });
  const fe = m.fieldErrors;
  return (
    <Screen page={{ key: 'club-power', title: 'Buy green power', access: 'partner' }} eyebrow="UNITE INDUSTRY CLUB"
      description="Tell the Unite energy desk what your business uses. It finds open access, group captive or PPA options from solar, wind and hybrid plants, or rooftop solar for your premises.">
      <div className="cz-stack" style={{ gap: 16 }}>
        <Card>
          <form className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} data-form="club-power">
            <Select label="What do you need?" value={f.need} onChange={set('need')} options={CLUB_POWER_NEEDS.map((n) => ({ value: n.code, label: n.label }))} />
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <Select label="State" value={f.state} onChange={set('state')} options={INDIA_STATES.map(([, n]) => ({ value: n, label: n }))} />
              <TextInput label="City" value={f.city} onChange={set('city')} error={fe.city} required />
              <TextInput label="Units a month (kWh)" inputMode="numeric" value={f.monthlyUnits} onChange={set('monthlyUnits')} error={fe.monthlyUnits} />
              <TextInput label="Bill a month in ₹" inputMode="decimal" value={f.monthlyBill} onChange={set('monthlyBill')} />
              <TextInput label="Sanctioned load (kW)" inputMode="decimal" value={f.sanctionedLoadKw} onChange={set('sanctionedLoadKw')} />
            </div>
            <TextArea label="Anything else (optional)" value={f.note} onChange={set('note')} rows={2} />
            {m.error && <Alert tone="danger">{m.error}</Alert>}
            {done && <Alert tone="success">Request {done} sent to the Unite energy desk. You will be notified when it moves.</Alert>}
            <div><Button type="submit" disabled={m.pending}>{m.pending ? 'Sending…' : 'Send power request'}</Button></div>
            <p className="cz-muted" style={{ fontSize: 14, margin: 0 }}>Plant owners and DISCOMs supply power under their own agreements; COLLABIZ does not sell power or quote tariffs here. You can also browse plants on the <Link href="/energy">Green Park energy market</Link>.</p>
          </form>
        </Card>
        <Card>
          <h2>My power requests</h2>
          {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.items.length ? <EmptyState icon="value" title="No requests yet">Your power requests and their progress appear here.</EmptyState> : (
            <ul className="cz-board-list">{q.data.items.map((r) => <li key={r.id}><strong>{r.code}</strong> — {r.needLabel} · {r.city}, {r.state}{r.monthlyUnits ? ` · ${r.monthlyUnits.toLocaleString('en-IN')} units/month` : ''}<div className="cz-board-why"><span className="cz-chip">{r.statusLabel}</span></div></li>)}</ul>
          )}
        </Card>
      </div>
    </Screen>
  );
}
