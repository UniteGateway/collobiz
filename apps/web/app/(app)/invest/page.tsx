'use client';
import { useState } from 'react';
import { Alert, Button, EmptyState, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { inr, type Offer } from '@/components/InvestKit';

/** Invest together — Unite group-investment offers (e.g. a property share per sq ft with rent shared pro rata). Interest only. */
export default function Invest() {
  const q = useQuery<Offer[]>('/invest/offers');
  return (
    <Screen page={{ key: 'invest', title: 'Invest together', access: 'partner' }} description="Group investment offers from Unite — own a share of an income-producing asset and receive rent in proportion to your share.">
      <Alert tone="warning" title="Interest only — no payments on COLLABIZ">Pooled investment in property and similar assets is regulated in India (SEBI). COLLABIZ records your non-binding interest only. It does not take money or allot units. Unite will contact you once an offer has the required clearance and offer documents. Rent shown is the sponsor’s projection, not a promise.</Alert>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={320} /> : !q.data.length ? <div className="cz-card" style={{ marginTop: 14 }}><EmptyState icon="building" title="No group investment offers yet">New offers from Unite appear here.</EmptyState></div> : (
        <div className="cz-invest-grid">{q.data.map((o) => <OfferCard key={o.id} o={o} onChange={q.reload} />)}</div>
      )}
    </Screen>
  );
}

function OfferCard({ o, onChange }: { o: Offer; onChange: () => void }) {
  const { me } = useSession();
  const [units, setUnits] = useState(o.mine?.units ?? Math.max(o.minUnits, Math.min(o.availableUnits + (o.mine?.units ?? 0), o.minUnits * 5)));
  const max = o.availableUnits + (o.mine?.units ?? 0);
  const share = Math.floor((o.projectedMonthlyRent * units) / o.totalUnits);
  const verified = me?.activeOrg?.verificationStatus === 'verified';
  const save = useMutation(async () => { await api.post(`/invest/offers/${o.id}/interest`, { units }); onChange(); });
  const withdraw = useMutation(async () => { await api.post(`/invest/offers/${o.id}/withdraw`); onChange(); });
  return (
    <article className="cz-card cz-offer" aria-label={o.title}>
      <div className="cz-offer-art" aria-hidden>
        <svg viewBox="0 0 320 120"><rect x="30" y="30" width="70" height="80" rx="4" /><rect x="110" y="10" width="80" height="100" rx="4" /><rect x="200" y="45" width="90" height="65" rx="4" />{Array.from({ length: 18 }, (_, i) => <rect key={i} className="w" x={118 + (i % 4) * 17} y={20 + Math.floor(i / 4) * 17} width="10" height="9" rx="1.5" />)}</svg>
        <span className="cz-offer-kind">{o.kindLabel}</span>
      </div>
      <div className="cz-row" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div><h2 style={{ margin: 0, fontSize: 17 }}>{o.title}</h2><span className="cz-muted" style={{ fontSize: 13 }}>{o.location} · by {o.sponsor} · {o.code}</span></div>
        <StatusBadge status={o.regulatoryStatus} tone={o.regulatoryStatus === 'cleared' ? 'success' : 'warning'} label={o.regulatoryStatus === 'cleared' ? 'Regulatory clearance recorded' : 'Awaiting regulatory clearance'} />
      </div>
      <p style={{ fontSize: 14 }}>{o.summary}</p>
      <dl className="cz-offer-facts">
        <div><dt>Price</dt><dd>{inr(o.unitPrice)} / {o.unitLabel}</dd></div>
        <div><dt>Asset value</dt><dd>{inr(o.assetValue)}</dd></div>
        <div><dt>Projected rent</dt><dd>{inr(o.rentPerUnitMonth)} / {o.unitLabel} / month</dd></div>
        <div><dt>Gross yield (projected)</dt><dd>{o.grossYieldPct}% a year</dd></div>
        <div><dt>Minimum</dt><dd>{o.minUnits.toLocaleString('en-IN')} {o.unitLabel}</dd></div>
        <div><dt>Lock-in</dt><dd>{o.lockInMonths ? `${o.lockInMonths} months` : 'None stated'}</dd></div>
      </dl>
      <div className="cz-offer-progress" role="img" aria-label={`${o.subscribedPct}% of ${o.totalUnits} ${o.unitLabel} has interest`}><span style={{ width: `${o.subscribedPct}%` }} /></div>
      <p className="cz-muted" style={{ fontSize: 12.5, margin: '6px 0 12px' }}>{o.interestUnits.toLocaleString('en-IN')} of {o.totalUnits.toLocaleString('en-IN')} {o.unitLabel} · {o.interestedMembers} member{o.interestedMembers === 1 ? '' : 's'} interested</p>
      {o.status === 'interest_open' && max >= o.minUnits ? (
        <div className="cz-offer-calc">
          <label htmlFor={`u-${o.id}`} style={{ fontWeight: 600, fontSize: 14 }}>How many {o.unitLabel}?</label>
          <div className="cz-row" style={{ gap: 12, alignItems: 'center' }}>
            <input aria-hidden tabIndex={-1} type="range" min={o.minUnits} max={max} step={Math.max(1, Math.round(o.minUnits / 2))} value={units} onChange={(e) => setUnits(Number(e.target.value))} style={{ flex: 1 }} />
            <input id={`u-${o.id}`} className="cz-input" style={{ width: 120 }} inputMode="numeric" value={units} onChange={(e) => setUnits(Math.min(max, Number(e.target.value.replace(/\D/g, '')) || 0))} />
          </div>
          <div className="cz-offer-out"><div><span className="cz-muted">You would invest</span><strong>{inr(units * o.unitPrice)}</strong></div><div><span className="cz-muted">Your rent share (projected)</span><strong>{inr(share)} / month</strong></div></div>
          {!verified && <Alert tone="info">Complete your verification (KYC) to register interest.</Alert>}
          {(save.error || withdraw.error) && <Alert tone="danger">{save.error ?? withdraw.error}</Alert>}
          <div className="cz-row" style={{ gap: 8 }}>
            <Button onClick={() => save.run()} loading={save.pending} disabled={!verified}>{o.mine ? 'Update my interest' : 'Register interest'}</Button>
            {o.mine && <Button variant="ghost" onClick={() => withdraw.run()} loading={withdraw.pending}>Withdraw</Button>}
          </div>
          {o.mine && <p style={{ fontSize: 13, margin: '8px 0 0' }}>Your interest: <strong>{o.mine.units.toLocaleString('en-IN')} {o.unitLabel}</strong> · {inr(o.mine.amount)} · projected rent {inr(o.mine.monthlyRentShare)} / month.</p>}
        </div>
      ) : <p className="cz-muted">{o.status === 'closed' ? 'This offer is closed.' : 'Fully subscribed by interest.'}</p>}
      {o.documentsUrl && <a href={o.documentsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>Offer documents</a>}
    </article>
  );
}
