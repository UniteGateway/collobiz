'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, DescriptionList, Icon, Skeleton, StatusBadge, TextArea } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Disclaimer, SOURCE_PHOTO, mw, rs, type EnergyListing } from '@/components/Energy';
import { photo } from '@/lib/photos';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface H { stage: number; at: string; note: string }
interface Intro { id: string; from?: string; city?: string | null; message?: string; status: string; stage: number; history: H[]; createdAt?: string }
interface D extends EnergyListing { stages: string[]; myIntroduction: Intro | null; introductions: Intro[] }
const PRIV: Record<string, string> = { company: 'Company', industry: 'Industry', discom: 'DISCOM', consumerCategory: 'Consumer category', contractDemandMva: 'Contract demand (MVA)', voltageKv: 'Voltage (kV)', monthlyMwh: 'Monthly consumption (MWh)', startBy: 'Expected start', openAccessEligible: 'Open-access eligible', storageRequired: 'Storage required' };

/** 19-stage deal room for an accepted introduction. */
function DealRoom({ intro, stages, onChange }: { intro: Intro; stages: string[]; onChange: () => void }) {
  const [note, setNote] = useState('');
  const move = useMutation(async (to: number) => { await api.post(`/energy/introductions/${intro.id}/stage`, { stage: to, note }); setNote(''); onChange(); return true; });
  return (
    <Card title="Deal room" subtitle={`Stage ${intro.stage + 1} of ${stages.length}: ${stages[intro.stage]}`}>
      <ol className="cz-ugp-stages">{stages.map((s, i) => <li key={s} data-state={i < intro.stage ? 'done' : i === intro.stage ? 'now' : 'next'}><span>{i + 1}</span>{s}</li>)}</ol>
      {move.error && <Alert tone="danger">{move.error}</Alert>}
      <TextArea label="Note for this step" rows={2} value={note} onChange={(e) => setNote(e.target.value)} hint="What happened — both parties see it" />
      <div className="cz-row" style={{ gap: 8 }}>
        {intro.stage < stages.length - 1 && <Button size="sm" variant="accent" disabled={note.trim().length < 3} loading={move.pending} onClick={() => move.run(intro.stage + 1)}>Mark “{stages[intro.stage + 1]}” done</Button>}
        {intro.stage > 1 && <Button size="sm" variant="ghost" disabled={note.trim().length < 3} onClick={() => move.run(intro.stage - 1)}>Step back</Button>}
      </div>
      {intro.history.length > 0 && <ul className="cz-ugp-history">{[...intro.history].reverse().map((h, i) => <li key={i}><strong>{stages[h.stage]}</strong> · {new Date(h.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}<br /><span>{h.note}</span></li>)}</ul>}
    </Card>
  );
}

export default function ListingPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<D>(`/energy/listings/${id}`);
  const [msg, setMsg] = useState('');
  const ask = useMutation(async () => { await api.post(`/energy/listings/${id}/introductions`, { message: msg }); q.reload(); return true; });
  const decide = useMutation(async (iid: string, decision: string) => { await api.post(`/energy/introductions/${iid}/decide`, { decision }); q.reload(); return true; });
  const d = q.data;
  return (
    <Screen page={{ key: 'energy-listing', title: d?.title ?? 'Energy listing', access: 'partner' }} eyebrow={d ? `${d.code} · ${d.categoryLabel}` : 'Unite Green Park'}
      actions={d ? <StatusBadge status={d.status} label={d.status === 'live' ? 'Live' : d.status === 'pending' ? 'Being checked' : d.status} /> : undefined}>
      <p style={{ marginTop: -6 }}><Link href="/energy" className="cz-back"><Icon name="prev" size={14} />Energy marketplace</Link></p>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <Skeleton height={300} /> : (
        <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
          <div className="cz-stack" style={{ gap: 16 }}>
            <div className="cz-ugp-detail-img"><img src={photo(SOURCE_PHOTO[d.source] ?? 'energy-solar-sky')} alt="" aria-hidden /><span className={`cz-ugp-side cz-ugp-${d.side}`}>{d.side === 'plant' ? 'Supply' : 'Demand'}</span></div>
            {d.demo && <Alert tone="warning">Demo listing — not verified. Not an actual plant, buyer or tariff offer.</Alert>}
            {d.isOwner && d.status === 'pending' && <Alert tone="info">COLLABIZ is checking this listing. It becomes visible to verified businesses once approved.</Alert>}
            {d.moderationNote && <Alert tone="warning" title="Note from COLLABIZ">{d.moderationNote}</Alert>}
            <Card>
              <p style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>{d.description}</p>
              <DescriptionList items={[[d.side === 'plant' ? 'Capacity' : 'Required', mw(d.capacityMw)], ...(d.side === 'plant' ? [['Available', mw(d.availableMw ?? d.capacityMw)] as [string, string]] : []),
                [d.side === 'plant' ? 'Indicative tariff' : 'Current tariff', rs(d.tariffRsKwh)], ...(d.targetRsKwh ? [['Target delivered cost', rs(d.targetRsKwh)] as [string, string]] : []), ['PPA', d.ppaYears ? `${d.ppaYears} years` : '—'],
                ['Models', d.models.join(', ') || '—'], ['Location', `${d.stateName}${d.district ? ` · ${d.district}` : ''}`], ['Listed by', d.owner ?? '—']]} />
            </Card>
            {d.private && Object.values(d.private).some((x) => x != null) && <Card title="Shared details" subtitle="Visible to you because you own this listing or an introduction was accepted">
              <DescriptionList items={Object.entries(d.private).filter(([, x]) => x != null).map(([k, x]) => [PRIV[k] ?? k, typeof x === 'boolean' ? (x ? 'Yes' : 'No') : String(x)] as [string, string])} /></Card>}
          </div>
          <div className="cz-stack" style={{ gap: 16 }}>
            {!d.isOwner && (d.myIntroduction ? (
              d.myIntroduction.status === 'accepted' ? <DealRoom intro={d.myIntroduction} stages={d.stages} onChange={q.reload} />
                : <Card title="Your introduction request"><StatusBadge status={d.myIntroduction.status} label={d.myIntroduction.status === 'requested' ? 'Waiting for the owner' : d.myIntroduction.status} /><p className="cz-muted">Your request is time-stamped to your business. Details are shared once the owner accepts.</p></Card>
            ) : d.status === 'live' ? (
              <Card title="Request an introduction" subtitle="Protected and time-stamped to your business">
                {ask.error && <Alert tone="danger">{ask.error}</Alert>}
                <TextArea label="Your proposal" rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} error={ask.fieldErrors.message} hint="Who you are, what you offer or need, MW and timing (at least 20 characters)" />
                <Button variant="accent" disabled={msg.trim().length < 20} loading={ask.pending} onClick={() => ask.run()}>Request introduction</Button>
              </Card>
            ) : null)}
            {d.isOwner && (
              <Card title={`Introduction requests (${d.introductions.length})`}>
                {decide.error && <Alert tone="danger">{decide.error}</Alert>}
                {!d.introductions.length ? <p className="cz-muted" style={{ margin: 0 }}>No requests yet.</p> : d.introductions.map((i) => (
                  <div key={i.id} className="cz-ugp-intro">
                    <div><strong>{i.from}</strong>{i.city ? <span className="cz-muted"> · {i.city}</span> : null}<p>{i.message}</p></div>
                    {i.status === 'requested' ? <div className="cz-row" style={{ gap: 6 }}><Button size="sm" variant="accent" onClick={() => decide.run(i.id, 'accept')}>Accept and share details</Button><Button size="sm" variant="ghost" onClick={() => decide.run(i.id, 'decline')}>Decline</Button></div>
                      : i.status === 'accepted' ? <DealRoom intro={i} stages={d.stages} onChange={q.reload} /> : <StatusBadge status={i.status} label={i.status} />}
                  </div>
                ))}
              </Card>
            )}
            <Disclaimer />
          </div>
        </div>
      )}
    </Screen>
  );
}
