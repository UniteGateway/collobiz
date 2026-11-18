'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, DescriptionList, Skeleton, StatusBadge, Stepper, TextArea, TextInput, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { MICRO_STATUS, dt, num, rs, type Micro } from '@/components/Ops';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Detail extends Omit<Micro, 'applications'> { worker: string | null; myApplication: { status: string; message: string } | null;
  applications: { id: string; org: string; city: string | null; kyb: string; message: string; status: string; done: number; createdAt: string }[] }
const STEPS = ['Open', 'In progress', 'Submitted', 'Accepted', 'Paid'];
const IDX: Record<string, number> = { open: 0, assigned: 1, submitted: 2, accepted: 3, paid: 4, cancelled: 0 };

export default function MicroDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Detail>(`/micro/${id}`);
  const [text, setText] = useState('');
  const act = useMutation(async (path: string, b: object = {}) => { await api.post(`/micro/${id}/${path}`, b); setText(''); q.reload(); return true; });
  const m = q.data;
  const e = act.fieldErrors;
  return (
    <Screen page={{ key: 'micro-detail', title: m?.title ?? 'Micro-contract', access: 'partner' }} eyebrow={m ? `${m.code} · ${m.kindLabel}` : 'Micro-contracts'}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !m ? <Skeleton height={300} /> : <>
        {m.status !== 'cancelled' ? <Stepper steps={STEPS} current={IDX[m.status]} /> : <Alert tone="warning">This micro-contract was cancelled.</Alert>}
        {act.error && <Alert tone="danger">{act.error}</Alert>}
        <div className="cz-grid cz-grid-2" style={{ marginTop: 14 }}>
          <Card title="The job">
            <p style={{ marginTop: 0 }}>{m.scope}</p>
            <DescriptionList items={[
              ['Fixed price', <strong>{rs(m.priceRs)}</strong>], ['Quantity', `${num(m.quantity)} ${m.unit}`], ['Due', dt(m.due)],
              ['Where', m.stateName], ['Accepted when', m.acceptance], ['Posted by', m.poster ?? '—'],
              ...(m.worker ? [['Being done by', m.worker] as [string, React.ReactNode]] : []), ['Status', <StatusBadge status={m.status} label={MICRO_STATUS[m.status]} />],
            ]} />
            {m.demo && <p className="cz-muted" style={{ fontSize: 12 }}>Demo — sample data for testing.</p>}
          </Card>
          <Card title={m.isPoster ? 'Manage' : 'Your part'}>
            {/* Applicant view */}
            {!m.isPoster && m.status === 'open' && !m.myApplication && (
              <form noValidate className="cz-stack" style={{ gap: 10 }} onSubmit={(ev) => { ev.preventDefault(); act.run('apply', { message: text }); }}>
                <TextArea label="Why you, and by when" rows={4} value={text} onChange={(ev) => setText(ev.target.value)} error={e.message} />
                <div><Button type="submit" loading={act.pending}>Apply</Button></div>
              </form>
            )}
            {!m.isPoster && m.myApplication && !m.isWorker && <p>Your application: <StatusBadge status={m.myApplication.status} label={m.myApplication.status === 'not_chosen' ? 'Not chosen' : m.myApplication.status === 'applied' ? 'Waiting for the poster' : m.myApplication.status} /></p>}
            {m.isWorker && m.status === 'assigned' && (
              <form noValidate className="cz-stack" style={{ gap: 10 }} onSubmit={(ev) => { ev.preventDefault(); act.run('submit', { delivery: text }); }}>
                {m.history.at(-1)?.note && <Alert tone="warning" title="Revision requested">{m.history.at(-1)!.note}</Alert>}
                <TextArea label="What you delivered and where to find it" rows={4} value={text} onChange={(ev) => setText(ev.target.value)} error={e.delivery} />
                <div><Button type="submit" loading={act.pending}>Submit the work</Button></div>
              </form>
            )}
            {m.isWorker && m.status === 'submitted' && <p className="cz-muted">Submitted — waiting for the poster to check it.</p>}
            {m.isWorker && m.status === 'accepted' && <p>Accepted. {rs(m.priceRs)} is due from {m.poster} directly.</p>}
            {m.isWorker && m.status === 'paid' && (m.paymentConfirmed ? <Alert tone="success">Payment confirmed. This job is in your Proof passport.</Alert>
              : <div className="cz-stack" style={{ gap: 8 }}><p style={{ margin: 0 }}>The poster recorded payment ref <strong>{m.paymentRef}</strong>. Confirm once it reaches your account.</p><div><Button onClick={() => act.run('confirm-payment')} loading={act.pending}>Confirm payment received</Button></div></div>)}

            {/* Poster view */}
            {m.isPoster && m.status === 'open' && (m.applications.length ? (
              <ul className="cz-micro-apps">{m.applications.map((a) => (
                <li key={a.id}><div><strong>{a.org}</strong> <span className="cz-muted">{a.city ?? ''} · {a.kyb === 'verified' ? 'Verified' : a.kyb} · {a.done} paid micro-contracts</span><p>{a.message}</p></div>
                  {a.status === 'applied' && <Button size="sm" onClick={() => act.run('assign', { applicationId: a.id })} loading={act.pending}>Choose</Button>}</li>
              ))}</ul>) : <p className="cz-muted">No applicants yet.</p>)}
            {m.isPoster && m.status === 'assigned' && <p className="cz-muted">{m.worker} is working on it.</p>}
            {m.isPoster && m.status === 'submitted' && (
              <div className="cz-stack" style={{ gap: 10 }}>
                <Card title="Delivered"><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.delivery}</p></Card>
                <p className="cz-muted" style={{ margin: 0 }}>Check it against: {m.acceptance}</p>
                <TextArea label="Note (needed if you ask for a revision)" rows={3} value={text} onChange={(ev) => setText(ev.target.value)} error={e.note} />
                <div className="cz-row" style={{ gap: 8 }}><Button onClick={() => act.run('review', { decision: 'accept', note: text || undefined })} loading={act.pending}>Accept the work</Button><Button variant="secondary" onClick={() => act.run('review', { decision: 'revise', note: text })}>Ask for a revision</Button></div>
              </div>
            )}
            {m.isPoster && m.status === 'accepted' && (
              <form noValidate className="cz-stack" style={{ gap: 10 }} onSubmit={(ev) => { ev.preventDefault(); act.run('paid', { paymentRef: text }); }}>
                <p style={{ margin: 0 }}>Pay {m.worker} {rs(m.priceRs)} directly, then record the reference.</p>
                <TextInput label="UTR / payment reference" value={text} onChange={(ev) => setText(ev.target.value)} error={e.paymentRef} />
                <div><Button type="submit" loading={act.pending}>Record payment</Button></div>
              </form>
            )}
            {m.isPoster && m.status === 'paid' && <p>Paid · ref {m.paymentRef} · {m.paymentConfirmed ? 'receipt confirmed by the worker' : 'waiting for the worker to confirm receipt'}</p>}
            {m.isPoster && ['open', 'assigned'].includes(m.status) && <details style={{ marginTop: 14 }}><summary>Cancel this job</summary>
              <form noValidate className="cz-row" style={{ gap: 8, alignItems: 'flex-end', marginTop: 8 }} onSubmit={(ev) => { ev.preventDefault(); act.run('cancel', { reason: text }); }}>
                <div style={{ flex: 1 }}><TextInput label="Reason" value={text} onChange={(ev) => setText(ev.target.value)} error={e.reason} /></div><Button type="submit" variant="danger">Cancel job</Button></form></details>}
          </Card>
        </div>
        {(m.isPoster || m.isWorker) && <Card title="History" className="cz-mt"><Timeline items={[...m.history].reverse().map((h, i) => ({ id: String(i), at: h.at, title: h.status === 'payment_confirmed' ? 'Payment confirmed by the worker' : MICRO_STATUS[h.status] ?? h.status, detail: h.note }))} /></Card>}
      </>}
    </Screen>
  );
}
