'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { sectorName, newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, ButtonLink, Card, DataTable, DescriptionList, LoadingState, Money, StatusBadge, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ROUTE_LABEL } from '@/components/Opportunities';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { regionName } from '@/lib/regions';

/** Screen 036 — Opportunity Detail Page (with publisher applicant review). */
export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/opportunities/${id}`);
  const apps = useQuery<any[]>(q.data?.isOwner ? `/opportunities/${id}/applications` : null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const save = useMutation(async () => { if (q.data.saved) await api.delete(`/opportunities/${id}/save`); else await api.post(`/opportunities/${id}/save`); q.reload(); return true; });
  const decide = useMutation(async (appId: string, status: string) => { await api.request('POST', `/opportunities/${id}/applications/${appId}/decision`, { status, reason: reasons[appId] ?? '' }, { idempotencyKey: newIdempotencyKey() }); apps.reload(); return true; });
  if (q.loading) return <Screen id="036"><LoadingState /></Screen>;
  if (q.error) return <Screen id="036"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const o = q.data;
  const open = ['accepted', 'released', 'qualification', 'proposal'].includes(o.status);
  return (
    <Screen id="036" title={o.title} actions={<>
      <Button variant="secondary" onClick={() => save.run()} loading={save.pending}>{o.saved ? '★ Saved' : '☆ Save'}</Button>
      {!o.isOwner && open && !o.myApplication && <ButtonLink href={`/opportunities/${id}/eligibility`} variant="accent">Check eligibility &amp; apply</ButtonLink>}
    </>}>
      {o.myApplication && <Alert tone="info">Your organization applied on {new Date(o.myApplication.createdAt).toLocaleDateString()} — status <StatusBadge status={o.myApplication.status} />{o.myApplication.decisionReason && ` · ${o.myApplication.decisionReason}`}</Alert>}
      <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
        <Card title="Scope"><p style={{ whiteSpace: 'pre-wrap' }}>{o.summary}</p></Card>
        <Card title="Key facts">
          <DescriptionList items={[
            ['Reference', <span key="c" className="cz-mono">{o.code}</span>], ['Route', ROUTE_LABEL[o.route]], ['Status', <StatusBadge key="s" status={o.status} />], ['Sector', sectorName(o.sector)], ['Type', o.kind.replace('_', ' ')],
            ['Location', [o.city, o.region && regionName(o.region)].filter(Boolean).join(', ') || '—'], ['Indicative value', <Money key="v" minor={o.estimatedValue} currency={o.currency} />],
            ['Closes', o.deadline ? new Date(o.deadline).toLocaleDateString() : 'Open'], ['Minimum level', o.minLevel], ['Certifications', o.requiredCertifications.join(', ') || 'None'], ['Published by', o.publisher],
          ]} />
        </Card>
      </div>
      {o.isOwner && (
        <Card title="Applicants">
          {decide.error && <Alert tone="danger">{decide.error}</Alert>}
          <DataTable caption="Applicants" rows={apps.data ?? []} columns={[
            { key: 'orgName', header: 'Organization', render: (a) => <><strong>{a.orgName}</strong><div className="cz-muted" style={{ fontSize: 12 }}>{a.level} · {a.verificationStatus} · {a.applicant}</div></> },
            { key: 'message', header: 'Proposal', render: (a) => <>{a.message}<div><Money minor={a.proposedValue} /></div></> },
            { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
            { key: 'd', header: 'Decision', render: (a) => ['submitted', 'shortlisted'].includes(a.status) && (
              <div className="cz-stack" style={{ gap: 4 }}>
                <input aria-label={`Reason for ${a.orgName}`} className="cz-input" placeholder="Reason (required)" value={reasons[a.id] ?? ''} onChange={(e) => setReasons({ ...reasons, [a.id]: e.target.value })} />
                <div className="cz-row" style={{ gap: 4 }}>
                  {a.status === 'submitted' && <Button size="sm" variant="secondary" onClick={() => decide.run(a.id, 'shortlisted')}>Shortlist</Button>}
                  <Button size="sm" onClick={() => decide.run(a.id, 'accepted')}>Accept</Button>
                  <Button size="sm" variant="danger" onClick={() => decide.run(a.id, 'rejected')}>Reject</Button>
                </div>
              </div>
            ) },
          ]} />
        </Card>
      )}
      {o.history?.length > 0 && <Card title="Status history (immutable)"><Timeline items={o.history.map((h: any) => ({ id: h.id, at: h.at, title: `v${h.version}: ${h.fromStatus ?? '—'} → ${h.toStatus}`, detail: h.reason }))} /></Card>}
      <p><Link href="/marketplace">← Back to marketplace</Link></p>
    </Screen>
  );
}
