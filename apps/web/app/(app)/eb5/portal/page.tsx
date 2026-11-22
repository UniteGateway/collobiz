'use client';
import Link from 'next/link';
import { Alert, ButtonLink, Card, Grid, Kpi, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, day, usd, when } from '@/components/Eb5';
import { useQuery } from '@/lib/hooks';

interface Portal {
  lead: { code: string; fullName: string; stage: number; stageLabel: string }; application: { id: string; code: string; status: string } | null;
  consultations: { id: string; scheduledAt: string; timezone: string; mode: string; kind: string; status: string; location: string | null }[];
  agreements: { id: string; code: string; state: string }[]; invoices: { id: string; number: string; amountCents: number; status: string; receiptNumber: string | null; description: string }[];
  documents: { id: string; title: string; category: string; status: string; note: string | null; reviewNote: string | null }[]; manager: { name: string; email: string } | null; attorney: { name: string } | null;
  caseUpdates: { stageLabel: string; note: string; source: string; at: string }[]; brand: string; entity: string; disclaimer: string;
}

/** The client's own GO EB5 portal. */
export default function Eb5Portal() {
  const q = useQuery<Portal>('/eb5/portal');
  const p = q.data;
  const next = p?.consultations.find((c) => c.status === 'scheduled' && new Date(c.scheduledAt) > new Date());
  const toUpload = p?.documents.filter((d) => ['requested', 'rejected'].includes(d.status)) ?? [];
  return (
    <Screen page={{ key: 'eb5-portal', title: p ? `Welcome, ${p.lead.fullName.split(' ')[0]}` : 'My EB-5 portal', access: 'authenticated' }} eyebrow={p ? `${p.brand} · ${p.lead.code}` : 'GO EB5'}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !p ? <LoadingState /> : <>
        <Grid cols={4}>
          <Kpi label="Where you are" value={p.lead.stageLabel} />
          <Kpi label="Application" value={p.application ? p.application.status : 'Not started'} href="/eb5/apply" />
          <Kpi label="Next consultation" value={next ? day(next.scheduledAt) : '—'} hint={next ? `${next.kind} · ${next.mode}` : 'Your manager will book one'} />
          <Kpi label="Documents to upload" value={toUpload.length} accent={toUpload.length > 0} />
        </Grid>
        <div className="cz-grid cz-grid-2 cz-mt">
          <Card title="Your team">
            <dl className="cz-dl"><dt>GO EB5 manager</dt><dd>{p.manager ? `${p.manager.name} · ${p.manager.email}` : 'Being assigned'}</dd><dt>U.S. immigration attorney</dt><dd>{p.attorney?.name ?? 'Not yet assigned'}</dd><dt>Consultancy provider</dt><dd>{p.entity}</dd></dl>
            {!p.application || p.application.status === 'draft' ? <div style={{ marginTop: 12 }}><ButtonLink href="/eb5/apply">{p.application ? 'Continue your application' : 'Start your application'}</ButtonLink></div> : <p style={{ marginBottom: 0 }}><Link href={`/eb5/applications/${p.application.id}/print`}>View your submitted application</Link></p>}
          </Card>
          <Card title="Document requests">
            {toUpload.length || p.documents.length ? <ul className="cz-ws-list">{p.documents.map((d) => <li key={d.id}><span><Link href={`/eb5/documents/${d.id}`}>{d.title}</Link>{d.reviewNote && d.status === 'rejected' ? <span className="cz-muted"> · {d.reviewNote}</span> : null}</span><Badge s={d.status} /></li>)}</ul> : <p className="cz-muted" style={{ margin: 0 }}>No documents requested. Your manager asks for each document here — never by email attachment.</p>}
          </Card>
        </div>
        <div className="cz-grid cz-grid-2 cz-mt">
          <Card title="Agreement and invoices">
            <ul className="cz-ws-list">
              {p.agreements.map((a) => <li key={a.id}><Link href={`/eb5/agreements/${a.id}`}>Consultancy agreement {a.code}</Link><Badge s={a.state} /></li>)}
              {p.invoices.map((i) => <li key={i.id}><Link href={`/eb5/invoices/${i.id}`}>{i.number} · {usd(i.amountCents)}</Link><Badge s={i.status} label={i.receiptNumber ? `Receipt ${i.receiptNumber}` : i.status.replace('_', ' ')} /></li>)}
              {!p.agreements.length && !p.invoices.length && <li className="cz-muted">Nothing yet.</li>}
            </ul>
          </Card>
          <Card title="Verified case updates">
            {p.caseUpdates.length ? <ul className="cz-ws-list">{p.caseUpdates.map((u, i) => <li key={i}><span><strong>{u.stageLabel}</strong> — {u.note}</span><span className="cz-muted">{when(u.at)}</span></li>)}</ul> : <p className="cz-muted" style={{ margin: 0 }}>Only updates confirmed by your attorney or by an official document appear here.</p>}
          </Card>
        </div>
        <Card title="Consultations" className="cz-mt">
          {p.consultations.length ? <ul className="cz-ws-list">{p.consultations.map((c) => <li key={c.id}><span>{when(c.scheduledAt)} ({c.timezone}) · {c.kind} · {c.mode}{c.location ? ` · ${c.location}` : ''}</span><Badge s={c.status} /></li>)}</ul> : <p className="cz-muted" style={{ margin: 0 }}>None booked yet.</p>}
        </Card>
        <Alert tone="info">{p.disclaimer}</Alert>
      </>}
    </Screen>
  );
}
