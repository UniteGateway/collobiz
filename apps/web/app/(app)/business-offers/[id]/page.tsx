'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, ButtonLink, Card, DescriptionList, LoadingState, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { Reasons, STATUS_TONE, inr, send, type OfferView, type Reason } from '@/components/Collab';
import { useMutation, useQuery } from '@/lib/hooks';

interface Detail extends OfferView {
  assets: { id: string; kindLabel: string; title: string; capacity: number | null; verification: string }[];
  notice: string | null;
  applyCheck: { eligible: boolean; checks: { key: string; label: string; result: string; detail: string }[] } | null;
  myApplication: { id: string; status: string } | null;
  applications: { id: string; orgName: string; verificationStatus: string; message: string; proposedValue: number | null; status: string; createdAt: string }[];
  suggested: { organization: string; resource: { kindLabel: string; title: string; city: string | null; capacity: number | null; verification: string }; score: number; reasons: Reason[] }[];
}
const APP_LABEL: Record<string, string> = { submitted: 'New', shortlisted: 'Shortlisted', accepted: 'Accepted', rejected: 'Declined', withdrawn: 'Withdrawn' };

/** Offer detail: the offer and its checks; responders apply; the publisher reviews applicants and suggested partners. */
export default function OfferDetail() {
  const { id } = useParams<{ id: string }>();
  const r = useQuery<Detail>(`/business-offers/${id}`);
  const [msg, setMsg] = useState(''); const [val, setVal] = useState('');
  const apply = useMutation(async () => { const a = await send(`/opportunities/${id}/apply`, { message: msg, proposedValue: val ? Math.round(Number(val) * 100) : undefined }); r.reload(); return a; });
  const decide = useMutation(async (appId: string, status: string) => { await send(`/opportunities/${id}/applications/${appId}/decision`, { status, reason: status === 'rejected' ? 'Not the right fit for this offer' : 'Good fit — let us discuss terms' }); r.reload(); return true; });
  const submit = useMutation(async () => { await send(`/business-offers/${id}/submit`); r.reload(); return true; });
  const d = r.data;
  return (
    <Screen page={{ key: 'business-offer', title: d?.title ?? 'Business offer', access: 'partner' }} eyebrow={d ? `${d.code} · ${d.categoryLabel}` : 'BUSINESS OFFERS'}
      actions={d ? <StatusBadge status={d.status} tone={STATUS_TONE[d.status]} label={d.statusLabel} /> : undefined}>
      {r.error ? <ApiErrorView error={r.error} onRetry={r.reload} /> : !d ? <LoadingState /> : (
        <div className="cz-collab-detail">
          <div className="cz-stack" style={{ gap: 16 }}>
            {d.notice && <Alert tone="warning">{d.notice}</Alert>}
            {d.isOwner && d.status === 'draft' && <Alert tone="info" title="Draft">Submit it for checks when ready. {submit.error && <strong>{submit.error}</strong>}<div style={{ marginTop: 8 }}><Button size="sm" loading={submit.pending} onClick={() => submit.run()}>Submit for checks</Button></div></Alert>}
            {d.isOwner && d.status === 'pending_verification' && <Alert tone="info">COLLABIZ is checking this offer. It becomes visible once approved.</Alert>}
            {d.isOwner && d.moderationNote && <Alert tone="warning" title="Note from COLLABIZ">{d.moderationNote}</Alert>}
            <Card>
              <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{d.summary}</p>
              <DescriptionList items={[
                ['Published by', d.publisher], ['Type', d.side === 'offering' ? 'Offering' : 'Seeking a partner'], ['Sector', d.sectorName],
                ['Location', [d.city, d.region].filter(Boolean).join(', ') || '—'], ...(d.territory ? [['Territory', d.territory] as [string, string]] : []),
                ['Indicative value', d.estimatedValue != null ? inr(d.estimatedValue) : 'On request'], ['Upfront fee or capital', d.upfrontRequired ? inr(d.upfrontAmount) : 'None required (not risk-free)'],
                ['Open until', new Date(d.expiresOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })],
                ...(d.eligibility ? [['Eligibility', d.eligibility] as [string, string]] : []),
              ]} />
            </Card>
            {d.assets.length > 0 && <Card title="Resources behind this offer"><ul className="cz-ws-list">{d.assets.map((a) => <li key={a.id}><span><strong>{a.title}</strong> · {a.kindLabel}{a.capacity ? ` · ${a.capacity}` : ''}</span><span className="cz-muted">{a.verification === 'verified' ? 'Verified' : 'Self-declared'}</span></li>)}</ul></Card>}
            {d.isOwner && (
              <Card title={`Applications (${d.applications.length})`} subtitle="Shortlist to open a private proposal room with the applicant.">
                {decide.error && <Alert tone="danger">{decide.error}</Alert>}
                {!d.applications.length ? <p className="cz-muted" style={{ margin: 0 }}>No applications yet.</p> : (
                  <ul className="cz-collab-items">{d.applications.map((a) => (
                    <li key={a.id} data-application={a.orgName}>
                      <div><strong>{a.orgName}</strong> <span className="cz-muted">· {a.verificationStatus === 'verified' ? 'Verified business' : 'Not yet verified'}{a.proposedValue ? ` · proposes ${inr(a.proposedValue)}` : ''}</span><p>{a.message}</p>
                        <StatusBadge status={a.status} label={APP_LABEL[a.status]} tone={a.status === 'rejected' ? 'neutral' : a.status === 'submitted' ? 'warning' : 'success'} /></div>
                      <div className="cz-row" style={{ gap: 6 }}>
                        {a.status === 'submitted' && <><Button size="sm" onClick={() => decide.run(a.id, 'shortlisted')}>Shortlist</Button><Button size="sm" variant="ghost" onClick={() => decide.run(a.id, 'rejected')}>Decline</Button></>}
                        {['shortlisted', 'accepted'].includes(a.status) && <ButtonLink size="sm" href={`/collab/room/${a.id}`}>Open proposal room</ButtonLink>}
                      </div>
                    </li>
                  ))}</ul>
                )}
              </Card>
            )}
            {d.isOwner && d.suggested.length > 0 && (
              <Card title="Partners who could fit" subtitle="Verified partners whose published resources match this offer. They see it in their matches.">
                <div className="cz-product-grid">{d.suggested.map((s, i) => (
                  <article key={i} className="cz-product"><span className="cz-tag">{s.resource.kindLabel}</span><h3>{s.resource.title}</h3>
                    <span className="cz-muted" style={{ fontSize: 13 }}>{s.organization}{s.resource.city ? ` · ${s.resource.city}` : ''}</span><Reasons reasons={s.reasons} score={s.score} /></article>
                ))}</div>
              </Card>
            )}
          </div>
          <aside className="cz-stack" style={{ gap: 16 }}>
            <Card title="Checks done by COLLABIZ">
              {d.checks.length ? <ul className="cz-collab-checks">{d.checks.map((c) => <li key={c}>{c}</li>)}</ul> : <p className="cz-muted" style={{ margin: 0 }}>Not checked yet.</p>}
              <p className="cz-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>These checks are not a guarantee of the offer, its value or the publisher’s performance.</p>
            </Card>
            {!d.isOwner && (
              <Card title={d.myApplication ? 'Your application' : 'Interested?'}>
                {d.myApplication ? (
                  <div className="cz-stack" style={{ gap: 8 }}>
                    <StatusBadge status={d.myApplication.status} label={APP_LABEL[d.myApplication.status]} tone={d.myApplication.status === 'rejected' ? 'neutral' : 'success'} />
                    {['shortlisted', 'accepted'].includes(d.myApplication.status) ? <ButtonLink href={`/collab/room/${d.myApplication.id}`}>Open proposal room</ButtonLink> : <p className="cz-muted" style={{ margin: 0 }}>The publisher will shortlist applications before discussing terms.</p>}
                  </div>
                ) : d.regulated ? <p className="cz-muted" style={{ margin: 0 }}>Express interest through a licensed intermediary. COLLABIZ does not handle these transactions.</p> : (
                  <form className="cz-stack" style={{ gap: 4 }} onSubmit={(ev) => { ev.preventDefault(); apply.run(); }} noValidate>
                    {apply.error && <Alert tone="danger">{apply.error}</Alert>}
                    {d.applyCheck && !d.applyCheck.eligible && <Alert tone="warning" title="Before you can apply"><ul style={{ margin: 0, paddingLeft: 18 }}>{d.applyCheck.checks.filter((c) => c.result === 'fail').map((c) => <li key={c.key}>{c.label}: {c.detail}</li>)}</ul></Alert>}
                    <TextArea label="Why you are a good fit" rows={4} value={msg} onChange={(ev) => setMsg(ev.target.value)} error={apply.fieldErrors.message} hint="At least 20 characters" />
                    <TextInput label="Your indicative price (₹, optional)" inputMode="numeric" value={val} onChange={(ev) => setVal(ev.target.value.replace(/\D/g, ''))} />
                    <Button type="submit" loading={apply.pending} disabled={msg.trim().length < 20 || (!!d.applyCheck && !d.applyCheck.eligible)}>Apply</Button>
                  </form>
                )}
              </Card>
            )}
            <Link href="/business-offers" className="cz-muted" style={{ fontSize: 13 }}>← All business offers</Link>
          </aside>
        </div>
      )}
    </Screen>
  );
}
