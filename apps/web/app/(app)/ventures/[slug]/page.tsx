'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { INDIA_STATES, sectorName } from '@collabiz/types';
import { Alert, Button, Card, ChipSelect, DescriptionList, Icon, LoadingState, StatusBadge, TextArea } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { INTEREST, VentureMark, roleLabel, stageLabel, type Venture } from '@/components/Ventures';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type Detail = Venture & { roles: string[]; myInterest: { status: string; roles: string[]; regions: string[]; message: string; decisionNote: string | null } | null; offers: { id: string; code: string; title: string; deadline: string; status: string; myStatus: string }[]; promoters: number };
const PAGE = { key: 'venture', title: 'Unite business', access: 'partner' as const };

/** One Unite business: what it is, what partners can do, offers from it, and the request to promote it. */
export default function VenturePage() {
  const { slug } = useParams<{ slug: string }>();
  const q = useQuery<Detail>(`/ventures/${slug}`);
  const [f, setF] = useState<{ roles: string[]; regions: string[]; message: string }>({ roles: [], regions: [], message: '' });
  const ask = useMutation(async () => { await api.post(`/ventures/${slug}/interest`, f); q.reload(); return true; });
  const withdraw = useMutation(async () => { await api.post(`/ventures/${slug}/interest/withdraw`); q.reload(); return true; });
  if (q.loading) return <Screen page={PAGE}><LoadingState /></Screen>;
  if (q.error) return <Screen page={PAGE}><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const v = q.data!;
  const mine = v.myInterest && v.myInterest.status !== 'withdrawn' ? v.myInterest : null;
  return (
    <Screen page={{ ...PAGE, title: v.name }} eyebrow="Unite businesses" description={v.tagline}
      actions={<StatusBadge status={v.open ? 'open' : 'pending'} label={v.availability} />}>
      <p style={{ marginTop: -6 }}><Link href="/ventures" className="cz-back"><Icon name="prev" size={14} />All Unite businesses</Link></p>
      <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
        <div className="cz-stack">
          <Card>
            <div className="cz-venture-head" style={{ marginBottom: 12 }}><VentureMark name={v.name} sector={v.sector} size={56} /><div><strong style={{ fontSize: 18 }}>{v.name}</strong><span className="cz-muted">{v.category}</span></div></div>
            <p style={{ marginTop: 0 }}>{v.summary}</p>
            <DescriptionList items={[['Sector', sectorName(v.sector)], ['Stage', stageLabel(v.stage)], ['Run by', v.company ?? 'Unite Group'], ['Partners promoting it', String(v.promoters)], ['Rewards', v.rewardNote ?? 'Set in each offer']]} />
          </Card>
          <Card title="How partners help">
            <ul className="cz-check-list">{v.roles.map((r) => <li key={r}><Icon name="check" size={15} />{roleLabel(r)}</li>)}</ul>
          </Card>
        </div>
        <div className="cz-stack">
          {mine ? (
            <Card title="Your request" actions={<StatusBadge status={mine.status} tone={INTEREST[mine.status]?.[1]} label={INTEREST[mine.status]?.[0]} />}>
              {mine.status === 'approved' && <Alert tone="success">You are an approved promoter of {v.name}. Offers from this business reach you directly.</Alert>}
              {mine.status === 'pending' && <Alert tone="info">{v.company ?? 'Unite Group'} will review your request and reply by notification.</Alert>}
              {mine.status === 'declined' && <Alert tone="warning">Not approved{mine.decisionNote ? `: ${mine.decisionNote}` : ''}. You can ask again later.</Alert>}
              <p className="cz-muted" style={{ margin: '8px 0' }}>{mine.roles.map(roleLabel).join(' · ')}</p>
              <p style={{ whiteSpace: 'pre-line' }}>{mine.message}</p>
              {withdraw.error && <Alert tone="danger">{withdraw.error}</Alert>}
              {mine.status !== 'declined' && <Button variant="ghost" onClick={() => withdraw.run()} loading={withdraw.pending}>Stop promoting</Button>}
            </Card>
          ) : null}
          {(!mine || mine.status === 'declined') && (v.open ? (
            <Card title={`Promote ${v.name}`}>
              <form noValidate onSubmit={(e) => { e.preventDefault(); ask.run(); }}>
                {ask.error && <Alert tone="danger">{ask.error}</Alert>}
                <ChipSelect legend="How you will help" options={v.roles.map((r) => ({ value: r, label: roleLabel(r) }))} value={f.roles} onChange={(roles) => setF({ ...f, roles })} />
                <ChipSelect legend="Where (optional)" options={INDIA_STATES.map(([c, n]) => ({ value: c, label: n }))} value={f.regions} onChange={(regions) => setF({ ...f, regions })} />
                <TextArea label="Your network and plan" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} error={ask.fieldErrors.message} hint="Who you can reach and how. At least 20 characters." />
                <Button type="submit" variant="accent" loading={ask.pending} disabled={!f.roles.length || f.message.trim().length < 20}>Ask to promote {v.name}</Button>
              </form>
            </Card>
          ) : <Card title="Coming soon"><p style={{ margin: 0 }}>{v.name} is not open to partners yet. It will appear under “Open to partners” when Unite Group starts working with partners on it.</p></Card>)}
          <Card title={`Offers from ${v.name}`}>
            {!v.offers.length ? <p className="cz-muted" style={{ margin: 0 }}>No offers for you yet.{mine?.status === 'approved' ? ' They will appear here and on your Home page.' : ''}</p> : (
              <ul className="cz-pick-list">{v.offers.map((o) => <li key={o.id} className="cz-row" style={{ justifyContent: 'space-between' }}><Link href={`/offers/${o.id}`}>{o.title}</Link><span className="cz-muted cz-mono" style={{ fontSize: 12.5 }}>{o.code}</span></li>)}</ul>
            )}
          </Card>
        </div>
      </div>
    </Screen>
  );
}
