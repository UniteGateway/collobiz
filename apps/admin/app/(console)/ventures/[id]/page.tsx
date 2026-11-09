'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { VENTURE_ROLE_LABELS, VENTURE_STAGES, VENTURE_STAGE_LABELS, levelLabel, regionLabel, sectorName } from '@collabiz/types';
import { Alert, Button, Card, DescriptionList, EmptyState, Icon, Kpi, LoadingState, PageHeader, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Interest { id: string; partner: string; city: string | null; level: string; roles: string[]; regions: string[]; message: string; status: string; decisionNote: string | null; updatedAt: string }
interface Detail { id: string; name: string; category: string; sector: string; tagline: string; summary: string; stage: string; open: boolean; availability: string; company: string | null; groupCompanyOrgId: string | null; regulated: boolean; regulatedReason: string | null; cleared: boolean; clearanceNote: string | null; roles: string[]; interests: Interest[]; offers: { id: string; code: string; title: string; status: string }[]; sales: { leads: number; won: number; wonValue: number } }
const INTEREST: Record<string, string> = { pending: 'Awaiting decision', approved: 'Promoter', declined: 'Declined', withdrawn: 'Withdrawn' };

/** One Unite business: settings, promotion requests and results. */
export default function VentureAdmin() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const q = useQuery<Detail>(`/admin/ventures/${id}`);
  const [note, setNote] = useState('');
  const save = useMutation(async (b: Record<string, unknown>) => { await api.request('PATCH', `/admin/ventures/${id}`, b); q.reload(); return true; });
  const clear = useMutation(async () => { await api.post(`/admin/ventures/${id}/clearance`, { note }); setNote(''); q.reload(); return true; });
  if (q.loading) return <LoadingState />;
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  const v = q.data!;
  const locked = v.regulated && !v.cleared;
  return (
    <div>
      <PageHeader title={v.name} breadcrumb="Unite Group Administration / Unite businesses" description={`${v.tagline} · ${v.category}`}
        actions={<div className="cz-row">{!locked && <Button size="sm" variant={v.open ? 'secondary' : 'accent'} loading={save.pending} onClick={() => save.run({ open: !v.open })}>{v.open ? 'Close to partners' : 'Open to partners'}</Button>}<StatusBadge status={locked ? 'on_hold' : v.open ? 'open' : 'pending'} label={v.availability} /></div>} />
      <p style={{ marginTop: -6 }}><Link href="/ventures" className="cz-back"><Icon name="prev" size={14} />All businesses</Link></p>
      {save.error && <Alert tone="danger">{save.error}</Alert>}
      {locked && (
        <Card title="Regulatory review required">
          <Alert tone="warning">{v.regulatedReason}. Partners and the public cannot see or promote {v.name} until a super admin records that the review is complete.</Alert>
          {me?.platformRoles.includes('super_admin') && (
            <>{clear.error && <Alert tone="danger">{clear.error}</Alert>}
              <TextInput label="Clearance record (licence, legal opinion or regulated partner reference)" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button variant="danger" disabled={note.trim().length < 20} loading={clear.pending} onClick={() => clear.run()}>Record regulatory clearance</Button></>
          )}
        </Card>
      )}
      {v.cleared && v.clearanceNote && <Alert tone="success">Regulatory clearance recorded: {v.clearanceNote}</Alert>}
      <div className="cz-grid cz-grid-4" style={{ margin: '0 0 20px' }}>
        <Kpi label="Promoters" value={v.interests.filter((i) => i.status === 'approved').length} />
        <Kpi label="Requests" value={v.interests.filter((i) => i.status === 'pending').length} />
        <Kpi label="Buyers registered" value={v.sales.leads} />
        <Kpi label="Won" value={`₹${Math.round(v.sales.wonValue / 100).toLocaleString('en-IN')}`} accent hint={`${v.sales.won} sale${v.sales.won === 1 ? '' : 's'}`} />
      </div>
      <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
        <Card title="About">
          <p style={{ marginTop: 0 }}>{v.summary}</p>
          <DescriptionList items={[['Sector', sectorName(v.sector)], ['Run by', v.company ?? 'Unite Group'], ['Partners can', v.roles.map((r) => VENTURE_ROLE_LABELS[r]).join(', ')]]} />
          <Select label="Stage" value={v.stage} onChange={(e) => save.run({ stage: e.target.value })} options={VENTURE_STAGES.map((s) => ({ value: s, label: VENTURE_STAGE_LABELS[s] }))} />
        </Card>
        <Card title="Offers for this business" actions={v.open ? <Link href={`/offers/new?venture=${v.id}`} className="cz-btn cz-btn-secondary cz-btn-sm">New offer</Link> : undefined}>
          {!v.offers.length ? <p className="cz-muted" style={{ margin: 0 }}>No offers yet.{v.open ? ' Send one to approved promoters or to any group of partners.' : ''}</p> : (
            <ul className="cz-pick-list">{v.offers.map((o) => <li key={o.id} className="cz-row" style={{ justifyContent: 'space-between' }}><Link href={`/offers/${o.id}`}>{o.title}</Link><StatusBadge status={o.status} /></li>)}</ul>
          )}
        </Card>
      </div>
      <Card title="Partners who want to promote it">
        {!v.interests.length ? <EmptyState icon="users" title="No requests yet" /> : <ul className="cz-review-list">{v.interests.map((i) => <InterestItem key={i.id} i={i} ventureId={v.id} onDone={q.reload} />)}</ul>}
      </Card>
    </div>
  );
}

function InterestItem({ i, ventureId, onDone }: { i: Interest; ventureId: string; onDone: () => void }) {
  const [note, setNote] = useState('');
  const m = useMutation(async (decision: 'approved' | 'declined') => { await api.post(`/admin/ventures/${ventureId}/interests/${i.id}/decide`, { decision, note }); onDone(); return decision; });
  return (
    <li className="cz-card cz-review" data-interest={i.partner}>
      <div className="cz-review-head"><div><strong>{i.partner}</strong> <span className="cz-muted" style={{ fontSize: 13 }}>· {levelLabel(i.level)}{i.city ? ` · ${i.city}` : ''}</span></div><StatusBadge status={i.status === 'approved' ? 'active' : i.status} label={INTEREST[i.status]} /></div>
      <span className="cz-muted" style={{ fontSize: 13 }}>{i.roles.map((r) => VENTURE_ROLE_LABELS[r]).join(' · ')}{i.regions.length ? ` · ${i.regions.map(regionLabel).join(', ')}` : ''}</span>
      <p style={{ margin: '4px 0', whiteSpace: 'pre-line' }}>{i.message}</p>
      {i.decisionNote && <p className="cz-muted" style={{ margin: 0 }}>Note: {i.decisionNote}</p>}
      {i.status === 'pending' && (
        <div className="cz-inset">
          {m.error && <Alert tone="danger">{m.error}</Alert>}
          <TextArea label={`Note to ${i.partner}`} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="cz-row"><Button variant="accent" disabled={note.trim().length < 5} loading={m.pending} onClick={() => m.run('approved')}>Approve as promoter</Button><Button variant="secondary" disabled={note.trim().length < 5} onClick={() => m.run('declined')}>Decline</Button></div>
        </div>
      )}
    </li>
  );
}
