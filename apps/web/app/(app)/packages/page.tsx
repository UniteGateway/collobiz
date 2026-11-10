'use client';
import { useState } from 'react';
import { Alert, Button, Card, Dialog, EmptyState, LoadingState, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Pkg { id: string; code: string; title: string; scope: string; categoryLabel: string; budget: number; closesAt: string; project: { code: string; title: string; region: string | null }; eligible: boolean; reasons: string[]; myBid: { amount: number; days: number; status: string } | null }
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

/** Screen 169 — Open work packages: parts of larger projects that verified partners can bid for. */
export default function OpenPackages() {
  const q = useQuery<Pkg[]>('/packages');
  const [bidding, setBidding] = useState<Pkg | null>(null);
  return (
    <Screen page={{ key: 'open-packages', title: 'Open work packages', access: 'partner' }} description="Civil, electrical, procurement, installation, logistics and O&M packages from larger projects. Bid on the ones you are eligible for; the project manager awards each package.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.length ? <Card><EmptyState icon="projects" title="No open packages right now">You are notified when a package matching your sectors opens.</EmptyState></Card> : (
        <div className="cz-stack" style={{ gap: 12 }}>{q.data.map((w) => (
          <Card key={w.id}>
            <div data-open-package={w.title} className="cz-stack" style={{ gap: 6 }}>
              <div className="cz-lead-head"><strong>{w.title}</strong><span className="cz-muted">{w.categoryLabel} · {w.project.code} — {w.project.title} · budget {rupees(w.budget)} · closes {new Date(w.closesAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                <span style={{ marginLeft: 'auto' }}>{w.myBid ? <StatusBadge status={w.myBid.status} label={`Your bid ${rupees(w.myBid.amount)}`} /> : <StatusBadge status={w.eligible ? 'open' : 'blocked'} tone={w.eligible ? 'success' : 'neutral'} label={w.eligible ? 'You can bid' : 'Not eligible'} />}</span></div>
              <p style={{ margin: 0, fontSize: 14 }}>{w.scope}</p>
              {!w.eligible && <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>Why: {w.reasons.join(' · ')}</p>}
              {w.eligible && <div><Button size="sm" variant={w.myBid ? 'secondary' : 'primary'} onClick={() => setBidding(w)}>{w.myBid ? 'Revise bid' : 'Bid'}</Button></div>}
            </div>
          </Card>
        ))}</div>
      )}
      <BidDialog pkg={bidding} onClose={() => setBidding(null)} onDone={() => { setBidding(null); q.reload(); }} />
    </Screen>
  );
}

function BidDialog({ pkg, onClose, onDone }: { pkg: Pkg | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ amount: '', days: '', note: '' });
  const bid = useMutation(async () => { const r = await api.post(`/packages/${pkg!.id}/bids`, { amount: Math.round(Number(f.amount) * 100), days: Number(f.days), note: f.note }); onDone(); return r; });
  return (
    <Dialog open={!!pkg} onClose={onClose} title={pkg ? `Bid: ${pkg.title}` : 'Bid'}>
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); bid.run(); }} noValidate>
        {bid.error && <Alert tone="danger">{bid.error}</Alert>}
        <div className="cz-grid cz-grid-2" style={{ gap: '0 12px' }}>
          <TextInput label="Your price (₹)" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} error={bid.fieldErrors.amount} hint={pkg ? `Budget ${rupees(pkg.budget)}` : undefined} />
          <TextInput label="Days to complete" inputMode="numeric" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value.replace(/\D/g, '') })} error={bid.fieldErrors.days} />
        </div>
        <TextArea label="Why you (team, equipment, similar work)" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} error={bid.fieldErrors.note} />
        <div><Button type="submit" loading={bid.pending} disabled={!f.amount || !f.days || f.note.length < 10}>Submit bid</Button></div>
      </form>
    </Dialog>
  );
}
