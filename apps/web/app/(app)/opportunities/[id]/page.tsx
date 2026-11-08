'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { sectorName, newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, ButtonLink, EmptyState, Icon, Skeleton, StatusBadge, type IconName } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ROUTE_LABEL } from '@/components/Opportunities';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { regionName } from '@/lib/regions';

interface Check { key: string; label: string; result: 'pass' | 'fail' | 'warn'; detail: string }
interface Eligibility { eligible: boolean; checks: Check[] }

const KIND_LABEL: Record<string, string> = { project: 'Project', product_supply: 'Product supply', service: 'Service', job: 'Job', distributorship: 'Distributorship', rfq: 'Request for quotation', tender: 'Tender' };
const LEVEL = (l?: string | null) => (l ? `${l.charAt(0).toUpperCase()}${l.slice(1).replace('_', ' ')} partner` : '—');
const CERT = (c: string) => c.replace(/^ISO(\d+)/, 'ISO $1');
const STATE: Record<string, string> = { draft: 'Draft', submitted: 'Submitted for review', under_review: 'Under review', accepted: 'Published', released: 'Released to partner exchange', qualification: 'Qualification', proposal: 'Proposals invited', won: 'Won', lost: 'Lost', closed: 'Closed', withdrawn: 'Withdrawn', rejected: 'Rejected', expired: 'Expired' };
const human = (s?: string | null) => (s ? STATE[s] ?? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '');
const ROUTE_EXPLAIN: Record<string, { icon: IconName; title: string; body: string }> = {
  unite_owned: { icon: 'building', title: 'How Unite Group listings work', body: 'Published directly by a Unite Group company. Unite approves commercial terms and signs the contract; you deliver your agreed scope.' },
  partner_originated: { icon: 'leads', title: 'How partner introductions work', body: 'Introduced by a verified partner. Their introduction is protected and credited; the buyer’s identity is shared once you are shortlisted.' },
  partner_exchange: { icon: 'teams', title: 'How the partner exchange works', body: 'Released by Unite Group to verified partners with the buyer’s consent. The introducing partner stays credited on the commission ledger.' },
  joint_execution: { icon: 'contracts', title: 'How joint execution works', body: 'Delivered jointly with Unite Group under one contract, with each party’s share agreed before award.' },
};
const APP_STEPS = ['submitted', 'shortlisted', 'accepted'];

const inr = (minor?: number | null) => {
  if (minor == null) return null;
  const r = minor / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1).replace(/\.0$/, '')} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
};
const daysLeft = (d?: string | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400_000) : null);
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

/** Screen 036 — Opportunity detail: understand the work, see whether you qualify, and act. */
export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const q = useQuery<any>(`/opportunities/${id}`);
  const o = q.data;
  const isPartner = !!me?.activeOrg && !o?.isOwner;
  const elig = useQuery<Eligibility>(o && isPartner ? `/opportunities/${id}/eligibility` : null);
  const apps = useQuery<any[]>(o?.isOwner ? `/opportunities/${id}/applications` : null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const save = useMutation(async () => { if (o.saved) await api.delete(`/opportunities/${id}/save`); else await api.post(`/opportunities/${id}/save`); q.reload(); return true; });
  const withdraw = useMutation(async () => { await api.post(`/opportunities/${id}/applications/${o.myApplication.id}/withdraw`); q.reload(); elig.reload(); return true; });
  const decide = useMutation(async (appId: string, status: string) => { await api.request('POST', `/opportunities/${id}/applications/${appId}/decision`, { status, reason: reasons[appId] ?? '' }, { idempotencyKey: newIdempotencyKey() }); apps.reload(); return true; });
  const share = async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ } };

  if (q.error) return <Screen id="036" title="Opportunity"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  if (!o) return (
    <Screen id="036" title="Opportunity">
      <div className="cz-od" aria-busy><Skeleton height={34} width="70%" /><Skeleton height={16} width="40%" style={{ marginTop: 12 }} /><Skeleton height={96} style={{ marginTop: 28 }} /><Skeleton height={220} style={{ marginTop: 20 }} /></div>
    </Screen>
  );

  const left = daysLeft(o.deadline);
  const open = ['accepted', 'released', 'qualification', 'proposal'].includes(o.status) && (left == null || left >= 0);
  const route = ROUTE_EXPLAIN[o.route];
  const app = o.myApplication && o.myApplication.status !== 'withdrawn' ? o.myApplication : null;
  const checks = elig.data?.checks.filter((c) => c.key !== 'duplicate') ?? [];
  const passed = checks.filter((c) => c.result !== 'fail').length;
  const appCounts = (apps.data ?? []).reduce<Record<string, number>>((m, a) => ({ ...m, [a.status]: (m[a.status] ?? 0) + 1 }), {});

  return (
    <Screen id="036" title={o.title} header={false}>
      <div className="cz-od">
        <Link href="/marketplace" className="cz-od-back"><Icon name="prev" size={16} />Opportunities</Link>

        {/* ---------- Hero ---------- */}
        <header className="cz-od-hero">
          <div className="cz-od-meta">
            <span className={`cz-route cz-route-${o.route === 'unite_owned' ? 'unite' : 'partner'}`}>{ROUTE_LABEL[o.route]}</span>
            <span>{KIND_LABEL[o.kind] ?? human(o.kind)}</span>
            <span className="cz-mono">{o.code}</span>
            {!open && <StatusBadge status={o.status} label={human(o.status)} />}
          </div>
          <h1 className="cz-od-title">{o.title}</h1>
          <p className="cz-od-sub">
            <span><Icon name="company" size={15} />{o.publisher}</span>
            <span><Icon name="sector" size={15} />{sectorName(o.sector)}</span>
            <span><Icon name="location" size={15} />{[o.city, o.region && regionName(o.region)].filter(Boolean).join(', ') || 'Location shared on shortlisting'}</span>
          </p>
          <div className="cz-od-tools">
            <Button variant="secondary" size="sm" onClick={() => save.run()} loading={save.pending} aria-pressed={!!o.saved}><Icon name="bookmark" size={15} />{o.saved ? 'Saved' : 'Save'}</Button>
            <Button variant="ghost" size="sm" onClick={share}><Icon name={copied ? 'check' : 'share'} size={15} />{copied ? 'Link copied' : 'Copy link'}</Button>
          </div>
        </header>

        {/* ---------- Key figures ---------- */}
        <dl className="cz-od-facts">
          <div><dt>Indicative value</dt><dd>{inr(o.estimatedValue) ?? <span className="cz-od-na">On request</span>}</dd></div>
          <div><dt>Closes</dt><dd>{o.deadline ? new Date(o.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Rolling'}</dd>
            {left != null && <span className={left <= 7 ? 'cz-close-urgent' : left <= 21 ? 'cz-close-soon' : ''}>{left < 0 ? 'Closed' : left === 0 ? 'Closes today' : `${left} day${left === 1 ? '' : 's'} left`}</span>}</div>
          <div><dt>Who can apply</dt><dd>{LEVEL(o.minLevel)}</dd><span>or above</span></div>
          <div><dt>Certifications</dt><dd>{o.requiredCertifications.length ? o.requiredCertifications.map(CERT).join(', ') : 'None'}</dd>{o.requiredCertifications.length > 0 && <span>required</span>}</div>
        </dl>

        <div className="cz-od-grid">
          {/* ---------- Main column ---------- */}
          <div className="cz-od-main">
            <section className="cz-od-section" aria-labelledby="scope-h">
              <h3 id="scope-h">About this opportunity</h3>
              <p className="cz-od-body">{o.summary}</p>
            </section>

            <section className="cz-od-section" aria-labelledby="req-h">
              <h3 id="req-h">What you’ll need</h3>
              <ul className="cz-od-reqs">
                <li><Icon name="verify" size={18} /><span><strong>Verified company</strong>KYB verification completed on COLLABIZ, at {LEVEL(o.minLevel)} level or above.</span></li>
                <li><Icon name="sector" size={18} /><span><strong>{sectorName(o.sector)} capability</strong>Declared in your company profile, with relevant past work.</span></li>
                {o.requiredCertifications.map((c: string) => <li key={c}><Icon name="award" size={18} /><span><strong>{CERT(c)}</strong>Current certificate uploaded to your documents.</span></li>)}
                {o.region && <li><Icon name="location" size={18} /><span><strong>Presence in {regionName(o.region)}</strong>Your service area should cover the site, or note that you will travel.</span></li>}
              </ul>
            </section>

            {route && (
              <section className="cz-od-section cz-od-route" aria-labelledby="route-h">
                <span className="cz-od-route-icon"><Icon name={route.icon} size={20} /></span>
                <div>
                  <h3 id="route-h">{route.title}</h3>
                  <p>{route.body} Any commission is recorded on the ledger and earned only when the customer pays.</p>
                </div>
              </section>
            )}

            {o.isOwner && (
              <section className="cz-od-section" aria-labelledby="apps-h" id="applicants">
                <h3 id="apps-h">Applicants</h3>
                {decide.error && <Alert tone="danger">{decide.error}</Alert>}
                {!apps.data ? <Skeleton height={80} /> : !apps.data.length ? <EmptyState icon="users" title="No applications yet">Verified partners who meet the requirements can apply until the closing date.</EmptyState> : (
                  <ul className="cz-od-applicants">
                    {apps.data.map((a) => (
                      <li key={a.id}>
                        <div className="cz-od-app-head">
                          <span className="cz-avatar" aria-hidden>{String(a.orgName).slice(0, 2).toUpperCase()}</span>
                          <div><strong>{a.orgName}</strong><span className="cz-muted">{LEVEL(a.level)} · {a.applicant}</span></div>
                          <StatusBadge status={a.status} label={human(a.status)} />
                        </div>
                        <p>{a.message}</p>
                        {a.proposedValue != null && <p className="cz-muted" style={{ margin: 0 }}>Proposed value <strong className="cz-num" style={{ color: 'var(--cz-navy-900)' }}>{inr(a.proposedValue)}</strong></p>}
                        {['submitted', 'shortlisted'].includes(a.status) && (
                          <div className="cz-od-decide">
                            <input aria-label={`Reason for ${a.orgName}`} className="cz-input" placeholder="Reason shared with the applicant (required)" value={reasons[a.id] ?? ''} onChange={(e) => setReasons({ ...reasons, [a.id]: e.target.value })} />
                            {a.status === 'submitted' && <Button size="sm" variant="secondary" onClick={() => decide.run(a.id, 'shortlisted')}>Shortlist</Button>}
                            <Button size="sm" onClick={() => decide.run(a.id, 'accepted')}>Accept</Button>
                            <Button size="sm" variant="ghost" onClick={() => decide.run(a.id, 'rejected')}>Decline</Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {o.history?.length > 0 && (
              <section className="cz-od-section" aria-labelledby="hist-h">
                <h3 id="hist-h">History</h3>
                <ol className="cz-od-history">
                  {o.history.map((h: any) => (
                    <li key={h.id}><span className="cz-od-dot" /><div><strong>{human(h.toStatus)}</strong>{h.reason && <span className="cz-muted"> — {h.reason}</span>}<time className="cz-muted" dateTime={h.at}>{fmtDate(h.at)} · version {h.version}</time></div></li>
                  ))}
                </ol>
                <p className="cz-muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}><Icon name="lock" size={13} /> History is append-only and cannot be edited.</p>
              </section>
            )}
          </div>

          {/* ---------- Decision panel ---------- */}
          <aside className="cz-od-panel" aria-label="Your next step">
            {o.isOwner ? (
              <div className="cz-od-card">
                <h3>Your listing</h3>
                <p className="cz-muted">{open ? 'Accepting applications.' : `Status: ${human(o.status)}.`}</p>
                <dl className="cz-od-counts">
                  {[['Applied', (appCounts.submitted ?? 0)], ['Shortlisted', appCounts.shortlisted ?? 0], ['Accepted', appCounts.accepted ?? 0]].map(([k, v]) => <div key={k as string}><dt>{k}</dt><dd>{apps.data ? v : '–'}</dd></div>)}
                </dl>
                <a href="#applicants" className="cz-btn cz-btn-primary cz-btn-block">Review applicants</a>
              </div>
            ) : app ? (
              <div className="cz-od-card">
                <h3>Your application</h3>
                <p className="cz-muted">Submitted {fmtDate(app.createdAt)}</p>
                <ol className="cz-od-steps" aria-label="Application progress">
                  {APP_STEPS.map((s, i) => {
                    const at = APP_STEPS.indexOf(app.status);
                    const state = app.status === 'rejected' ? (i === 0 ? 'done' : 'todo') : i < at || (i === at && s === 'accepted') ? 'done' : i === at ? 'current' : 'todo';
                    return <li key={s} data-state={state}><span />{s === 'submitted' ? 'Submitted' : s === 'shortlisted' ? 'Shortlisted' : 'Accepted'}</li>;
                  })}
                </ol>
                {app.status === 'rejected' && <Alert tone="info" title="Not selected this time.">{app.decisionReason || 'The publisher chose another partner.'}</Alert>}
                {app.status === 'accepted' && <Alert tone="success" title="You’ve been selected.">{app.decisionReason || 'The publisher will contact you about next steps.'}</Alert>}
                {app.decisionReason && ['submitted', 'shortlisted'].includes(app.status) && <p className="cz-muted" style={{ fontSize: 13 }}>{app.decisionReason}</p>}
                {withdraw.error && <Alert tone="danger">{withdraw.error}</Alert>}
                {['submitted', 'shortlisted'].includes(app.status) && <Button variant="ghost" size="sm" onClick={() => { if (window.confirm('Withdraw your application? You can apply again while the opportunity is open.')) withdraw.run(); }} loading={withdraw.pending}>Withdraw application</Button>}
              </div>
            ) : isPartner ? (
              <div className="cz-od-card">
                <h3>{!open ? 'Applications closed' : !elig.data ? 'Checking your eligibility…' : elig.data.eligible ? 'You can apply' : 'Not eligible yet'}</h3>
                {elig.data && open && <p className="cz-muted">You meet {passed} of {checks.length} requirements.</p>}
                {!elig.data ? <Skeleton height={120} /> : (
                  <ul className="cz-od-checks">
                    {checks.map((c) => (
                      <li key={c.key} data-result={c.result} data-check={c.key}>
                        <Icon name={c.result === 'pass' ? 'check' : c.result === 'warn' ? 'alert' : 'cross'} size={16} />
                        <span><strong>{c.label}</strong><span>{c.detail}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
                {open && elig.data && (elig.data.eligible
                  ? <ButtonLink href={`/opportunities/${id}/apply`} variant="accent" size="lg">Apply now<Icon name="arrow" size={16} /></ButtonLink>
                  : <ButtonLink href={`/opportunities/${id}/eligibility`} variant="secondary">See how to qualify</ButtonLink>)}
                {open && elig.data && !elig.data.eligible && <p className="cz-muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>Missing a capability? <Link href={`/ai/team-builder?opportunity=${id}`}>Plan a team</Link> with partners who have it.</p>}
              </div>
            ) : (
              <div className="cz-od-card">
                <h3>Set up your partner account</h3>
                <p className="cz-muted">Create and verify your company profile to apply.</p>
                <ButtonLink href="/onboarding/account-type" variant="accent">Get started</ButtonLink>
              </div>
            )}
            <p className="cz-od-assure"><Icon name="leads" size={14} />Your details are shared with the publisher only when you apply.</p>
          </aside>
        </div>
      </div>
    </Screen>
  );
}
