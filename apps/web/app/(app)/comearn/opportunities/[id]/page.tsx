'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { CE_CATEGORIES, CE_MODELS, CE_TRIGGERS, CE_TYPES, type CeType } from '@collabiz/types';
import { Alert, Button, ButtonLink, Card, Checkbox, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CeHeader, CeNav, RepLine, SOURCE_LABEL, commissionLabel, rupees, type CeCard, type CeRep } from '@/components/Comearn';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Detail extends CeCard { companyOrgId: string; description: string; idealEarner: string | null; milestones: { label: string; pct: number }[]; recurringMonths: number | null; paymentDays: number; maxEarners: number | null; licenceNote: string | null; version: number; restricted: boolean; agreement: string; engagement: { id: string; stage: string; status: string } | null }

/** Opportunity: terms, what earns the commission, and joining by accepting the commission agreement. */
export default function ComearnOpportunity() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useQuery<Detail>(`/comearn/opportunities/${id}`);
  const [joined, setJoined] = useState<{ id: string; agreement: string; termsHash: string } | null>(null);
  const [ok, setOk] = useState(false);
  const join = useMutation(async () => { const r = await api.post<{ id: string; agreement: string; termsHash: string }>(`/comearn/opportunities/${id}/join`, {}); setJoined(r); return true; });
  const accept = useMutation(async () => { await api.post(`/comearn/engagements/${joined!.id}/accept`, { termsHash: joined!.termsHash, confirm: ok }); router.push(`/comearn/engagements/${joined!.id}`); return true; });
  const o = q.data;
  const rep = useQuery<{ asEarner: CeRep | null; asCompany: CeRep | null; verified: boolean }>(o ? `/comearn/reputation/${o.companyOrgId}` : null);
  return (
    <Screen page={{ key: 'comearn-opportunity', title: 'Earning opportunity', access: 'partner' }} header={false}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !o ? <Skeleton height={320} /> : (
        <>
          <CeHeader title={o.title} lead={<>{o.company} · {CE_CATEGORIES[o.category]} · {CE_TYPES[o.type as CeType]?.label} · {o.territory}</>} />
          <CeNav />
          {o.restricted && <Alert tone="warning">Regulated sector. The company has recorded its licence{o.licenceNote ? `: ${o.licenceNote}` : ''}. Check whether your own work here needs a licence or registration before you start.</Alert>}
          <div className="ce-two">
            <Card title="The opportunity">
              <p className="ce-muted"><strong>{o.company}</strong> <RepLine rep={rep.data} as="company" /></p>
              {o.source && <p className="ce-muted">{SOURCE_LABEL[o.source.module] ?? o.source.module} · {o.source.id}</p>}
              <p className="ce-pre">{o.description}</p>
              {o.idealEarner && <p className="ce-muted"><strong>Who does well here:</strong> {o.idealEarner}</p>}
            </Card>
            <Card title="Commission">
              <div className="ce-commission" data-ce-commission><strong>{commissionLabel(o)}</strong><span>{CE_MODELS[o.model]}</span></div>
              <dl className="ce-dl">
                <div><dt>Earned when</dt><dd>{CE_TRIGGERS[o.trigger as keyof typeof CE_TRIGGERS]} — {CE_TYPES[o.type as CeType]?.earn.toLowerCase()}</dd></div>
                {o.milestones.length > 0 && <div><dt>Milestones</dt><dd>{o.milestones.map((m) => `${m.label} ${m.pct}%`).join(' · ')}</dd></div>}
                {o.recurringMonths && <div><dt>Repeat business</dt><dd>Paid for {o.recurringMonths} months</dd></div>}
                <div><dt>Paid within</dt><dd>{o.paymentDays} days of approval, directly by {o.company}</dd></div>
                {o.estimatedValuePaise != null && <div><dt>Typical business value</dt><dd>{rupees(o.estimatedValuePaise)} — potential commission {rupees(o.potentialPaise)} (estimate, not a promise)</dd></div>}
                <div><dt>Members working on it</dt><dd>{o.earners ?? 0}{o.maxEarners ? ` of ${o.maxEarners}` : ''}</dd></div>
              </dl>
              {o.mine ? <ButtonLink href="/comearn/offer" variant="secondary">Manage in Offer commissions</ButtonLink>
                : o.engagement ? <ButtonLink href={`/comearn/engagements/${o.engagement.id}`}>Open my tracker</ButtonLink>
                : !joined && <><Button onClick={() => join.run()} loading={join.pending}>Start earning</Button>{join.error && <Alert tone="danger">{join.error}</Alert>}</>}
            </Card>
          </div>
          {joined && (
            <Card title="Commission agreement" subtitle="Read the terms. Accepting records them with a fingerprint; later changes by the company do not change what you accepted.">
              <pre className="ce-agreement" data-ce-agreement>{joined.agreement}</pre>
              {accept.error && <Alert tone="danger">{accept.error}</Alert>}
              <Checkbox label="I have read and accept this commission agreement for my business" checked={ok} onChange={(e) => setOk(e.target.checked)} />
              <div><Button onClick={() => accept.run()} disabled={!ok} loading={accept.pending}>Accept and continue</Button></div>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
