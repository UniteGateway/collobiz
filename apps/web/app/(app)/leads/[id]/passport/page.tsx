'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { PASSPORT_PARTY_ROLE_LABELS, regionLabel } from '@collabiz/types';
import { Alert, Button, Card, DescriptionList, Dialog, LoadingState, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { LeadTabs } from '@/components/LeadWizard';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

const dt = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const rupees = (p?: number | null) => (p == null ? '—' : `₹${Math.round(p / 100).toLocaleString('en-IN')}`);
const ACTION: Record<string, string> = { 'lead.registered': 'Lead registered', 'lead.protected': 'Protected by Unite', 'passport.issued': 'Passport issued', 'passport.party_added': 'Access shared', 'passport.nda_accepted': 'Undertaking accepted', 'passport.viewed': 'Viewed by a party', 'passport.party_removed': 'Access withdrawn' };

/** Screen 167 — Deal Passport: one verifiable record of a registered deal, from registration to settlement. */
export default function DealPassport() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/leads/${id}/passport`);
  const [sharing, setSharing] = useState(false);
  const d = q.data;
  const remove = useMutation(async (orgId: string) => { await api.request('DELETE', `/leads/${id}/passport/parties/${orgId}`); q.reload(); return true; });
  return (
    <Screen page={{ key: 'deal-passport', title: 'Deal Passport', access: 'authenticated' }}
      description={d ? `${d.passport.code} · ${d.opportunity.code} — ${d.opportunity.title}` : undefined}
      actions={d && d.access !== 'invitee' ? <span className="cz-row cz-no-print" style={{ gap: 8 }}>{d.canManage && <Button variant="secondary" onClick={() => setSharing(true)}>Share with a partner</Button>}<Button variant="secondary" onClick={() => window.print()}>Print or save PDF</Button></span> : undefined}>
      {d && ['owner', 'staff'].includes(d.access) && <LeadTabs id={id} />}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : d.access === 'invitee' ? <Undertaking id={id} d={d} onDone={q.reload} /> : (
        <div className="cz-ws-cols">
          <div className="cz-stack" style={{ gap: 16 }}>
            <section className="cz-certificate" aria-label="Deal Passport summary">
              <div className="cz-row" style={{ justifyContent: 'space-between' }}><img src="/brand/collabiz-logo.png" alt="COLLABIZ" width={170} /><StatusBadge status={d.passport.status} tone={d.passport.status === 'active' ? 'success' : 'danger'} label={d.passport.status === 'active' ? 'Valid' : 'Revoked'} /></div>
              <h2 style={{ margin: '14px 0 4px' }}>Deal Passport <span className="cz-mono">{d.passport.code}</span></h2>
              <p className="cz-muted" style={{ marginTop: 0 }}>Issued {dt(d.passport.issuedAt)} · registered by {d.owner}</p>
              <div className="cz-figures">
                <div className="cz-figure"><span>Opportunity</span><strong style={{ fontSize: 17 }}>{d.opportunity.code}</strong><small>{d.opportunity.title}</small></div>
                <div className="cz-figure"><span>Protection</span><strong style={{ fontSize: 17 }}><StatusBadge status={d.ownership.status} /></strong><small>until {dt(d.ownership.protectedUntil)}</small></div>
                <div className="cz-figure"><span>Estimated value</span><strong style={{ fontSize: 17 }}>{rupees(d.opportunity.estimatedValue)}</strong><small>{d.opportunity.region ? regionLabel(d.opportunity.region) : '—'}</small></div>
              </div>
              <p className="cz-muted" style={{ fontSize: 12.5, margin: '14px 0 0' }}>{d.notice} Verify at collabiz with the code above.</p>
            </section>
            <Card title="Ownership and consent">
              <DescriptionList items={[['Registered by', `${d.ownership.registeredBy ?? '—'} (${d.owner})`], ['Registered at', dt(d.ownership.registeredAt)], ['Lead certificate', <span key="c" className="cz-mono">{d.ownership.certificateCode}</span>], ['Evidence fingerprint', <span key="h" className="cz-mono">{d.ownership.evidenceHash}</span>],
                ['Protected', `${dt(d.ownership.protectedFrom)} → ${dt(d.ownership.protectedUntil)}`], ['Commission rule', d.ownership.policy], ['Customer', `${d.customer.name}${d.customer.city ? `, ${d.customer.city}` : ''}`],
                ...(d.customer.contact ? [['Customer contact', [d.customer.contact, d.customer.email, d.customer.phone].filter(Boolean).join(' · ')] as [string, string]] : []),
                ['Customer consent', d.consent?.method ? `${String(d.consent.method).replace(/_/g, ' ')}${d.consent.recordedAt ? ` · ${dt(d.consent.recordedAt)}` : ''}` : 'Recorded with the registration']]} />
            </Card>
            <Card title="Unite priority review">
              <DescriptionList items={[['Group company', d.review.groupCompany ?? '—'], ['Decision', d.review.decision ? String(d.review.decision).replace(/_/g, ' ') : 'In review'], ['Started', dt(d.review.startedAt)], ['Due', dt(d.review.dueAt)], ['Decided', dt(d.review.decidedAt)],
                ['Duplicate checks', d.review.duplicates.length ? d.review.duplicates.map((x: any) => `${Math.round(x.score * 100)}% similar — ${String(x.ruling).replace(/_/g, ' ')}`).join('; ') : 'No similar registrations']]} />
            </Card>
            <Card title="Participation and execution">
              {!d.participation.length && !d.execution.length ? <p className="cz-muted" style={{ margin: 0 }}>No commercial agreement or project yet. Participation is recorded here once an agreement is signed.</p> : (
                <ul className="cz-ws-list">
                  {d.participation.map((a: any) => <li key={a.code}><span><strong>Agreement {a.code}</strong><br /><span className="cz-muted" style={{ fontSize: 13 }}>{a.policy?.name ?? 'Commission agreement'} · share {a.shareBps / 100}% · terms fingerprint {String(a.termsHash).slice(0, 12)}…</span></span><StatusBadge status={a.status} /></li>)}
                  {d.execution.map((p: any) => <li key={p.code}><span><strong>Project {p.code}</strong> — {p.title}<br /><span className="cz-muted" style={{ fontSize: 13 }}>{rupees(p.value)}{p.contract ? ` · contract ${p.contract.code} (${p.contract.status})` : ''} · {p.milestones.filter((m: any) => ['certified', 'invoiced', 'paid'].includes(m.status)).length} of {p.milestones.length} milestones certified</span></span><StatusBadge status={p.status} /></li>)}
                </ul>
              )}
            </Card>
            <Card title="History">
              <ol className="cz-timeline">{d.audit.map((e: any) => <li key={e.seq}><strong>{ACTION[e.action] ?? e.action.replace(/[._]/g, ' ')}</strong> · <span className="cz-muted">{dt(e.at)}</span><br /><span className="cz-mono cz-muted" style={{ fontSize: 11 }}>#{e.seq} {String(e.hash).slice(0, 16)}…</span></li>)}</ol>
              <p className="cz-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Each entry is chained to the one before it; any change would break the chain.</p>
            </Card>
          </div>
          <aside className="cz-ws-side cz-no-print">
            <Card title="Who can see this passport">
              <ul className="cz-ws-list">
                <li><span><strong>{d.owner}</strong><br /><span className="cz-muted" style={{ fontSize: 13 }}>Registering partner</span></span></li>
                <li><span><strong>Unite Group reviewers</strong></span></li>
                {d.parties?.filter((p: any) => !p.revoked).map((p: any) => (
                  <li key={p.organizationId} data-party={p.organization}><span><strong>{p.organization}</strong><br /><span className="cz-muted" style={{ fontSize: 13 }}>{PASSPORT_PARTY_ROLE_LABELS[p.role]} · {p.ndaAccepted ? `undertaking accepted ${dt(p.ndaAcceptedAt)}` : 'waiting for undertaking'}</span></span>
                    {d.canManage && <Button size="sm" variant="ghost" onClick={() => remove.run(p.organizationId)}>Remove</Button>}</li>
                ))}
              </ul>
              {d.access === 'party' && <p className="cz-muted" style={{ fontSize: 13, marginBottom: 0 }}>You see this passport as a shared party. Customer contact details are hidden; your views are logged.</p>}
            </Card>
            <Card title="Documents">{d.documents.length ? <ul className="cz-ws-list">{d.documents.map((x: any, i: number) => <li key={i}><span>{x.name}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{Math.round(x.size / 1024)} KB · {dt(x.at)}</span></span></li>)}</ul> : <p className="cz-muted" style={{ margin: 0 }}>No evidence documents attached.</p>}</Card>
          </aside>
          {d.canManage && <Share id={id} open={sharing} onClose={() => setSharing(false)} onDone={() => { setSharing(false); q.reload(); }} />}
        </div>
      )}
    </Screen>
  );
}

function Undertaking({ id, d, onDone }: { id: string; d: any; onDone: () => void }) {
  const [name, setName] = useState('');
  const accept = useMutation(async () => { await api.post(`/leads/${id}/passport/nda`, { typedName: name }); onDone(); return true; });
  return (
    <Card title={`${d.owner} shared Deal Passport ${d.passport.code} with you`}>
      <p style={{ marginTop: 0 }}>Role: <strong>{PASSPORT_PARTY_ROLE_LABELS[d.role]}</strong> · {d.opportunity.code} — {d.opportunity.title}</p>
      <pre className="cz-doc">{d.ndaText}</pre>
      {accept.error && <Alert tone="danger">{accept.error}</Alert>}
      <form className="cz-row" style={{ gap: 10, alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); accept.run(); }}>
        <div style={{ flex: 1, minWidth: 220 }}><TextInput label="Type your full name to accept" value={name} onChange={(e) => setName(e.target.value)} error={accept.fieldErrors.typedName} /></div>
        <Button type="submit" loading={accept.pending} disabled={name.trim().length < 2}>Accept and view</Button>
      </form>
    </Card>
  );
}

function Share({ id, open, onClose, onDone }: { id: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const partners = useQuery<any>(open ? '/partners?verified=true' : null);
  const [f, setF] = useState({ organizationId: '', role: 'execution_partner' });
  const list: { id: string; name: string }[] = (Array.isArray(partners.data) ? partners.data : partners.data?.items ?? partners.data?.partners ?? []).map((p: any) => ({ id: p.organizationId ?? p.id, name: p.displayName ?? p.name }));
  const share = useMutation(async () => { await api.post(`/leads/${id}/passport/parties`, f); onDone(); return true; });
  return (
    <Dialog open={open} onClose={onClose} title="Share this Deal Passport">
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); share.run(); }}>
        {share.error && <Alert tone="danger">{share.error}</Alert>}
        <Select label="Verified partner" placeholder="Choose a partner" value={f.organizationId} onChange={(e) => setF({ ...f, organizationId: e.target.value })} options={list.map((p) => ({ value: p.id, label: p.name }))} />
        <Select label="Their role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={Object.entries(PASSPORT_PARTY_ROLE_LABELS).map(([value, label]) => ({ value, label }))} />
        <p className="cz-muted" style={{ fontSize: 13, margin: 0 }}>They must accept a confidentiality undertaking before they see anything, and never see the customer’s contact details. You can withdraw access at any time.</p>
        <div><Button type="submit" loading={share.pending} disabled={!f.organizationId}>Share</Button></div>
      </form>
    </Dialog>
  );
}
