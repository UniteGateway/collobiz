'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { COMPANY_CATEGORY_LABELS, WORKSPACE_APPS } from '@collabiz/types';
import { Card, EmptyState, Icon, LoadingState, type IconName } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { AppTile, Hero, WorkspaceNav, inr, resolveHref, webUrl } from '@/components/Workspace';
import { useQuery } from '@/lib/hooks';

interface Home {
  me: { name: string };
  kpis: Record<string, number>;
  approvals: { key: string; label: string; n: number; href: string }[];
  businessLines: { id: string; name: string; category: string; value: number; liveProjects: number; wonSales: number }[];
  meetings: { id: string; title: string; startsAt: string; endsAt: string; organizer: string; attendees: number }[];
  activity: { at: string; who: string; what: string }[];
}
const time = (d: string) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const day = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const ago = (d: string) => { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : day(d); };

/** Unite Group workspace home — one place for every Unite business, with live numbers from the platform. */
export default function WorkspaceHome() {
  const q = useQuery<Home>('/admin/workspace');
  const router = useRouter();
  const [ask, setAsk] = useState('');
  const d = q.data;
  const kpis: [IconName, string, string, string][] = d ? [
    ['building', `${d.kpis.groupCompanies}`, 'Group companies', `${d.kpis.countries} countries`],
    ['teams', `${d.kpis.partnersVerified}`, 'Verified partners', `${d.kpis.partners} registered`],
    ['projects', `${d.kpis.liveProjects}`, 'Live projects', inr(d.kpis.projectPortfolio)],
    ['briefcase', `${d.kpis.openOffers}`, 'Open offers', `${d.kpis.openOpportunities} opportunities`],
    ['value', inr(d.kpis.salesWonThisMonth), 'Sales won this month', `${inr(d.kpis.salesWonTotal)} to date`],
    ['users', `${d.kpis.staff}`, 'Unite Group people', 'on the platform'],
  ] : [];
  const maxLine = Math.max(1, ...(d?.businessLines.map((b) => b.value) ?? [1]));
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero eyebrow="Unite Group workspace" title="One platform." accent="All Unite businesses." sub={`Welcome${d ? `, ${d.me.name.split(' ')[0]}` : ''}. Operate, manage and grow every Unite business — partners, projects, offers, people and finance — with one sign-in and one database.`} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <div className="cz-ws-kpis" aria-label="Key numbers">
            {kpis.map(([icon, v, l, sub]) => <div key={l} className="cz-ws-kpi"><span className="cz-app-icon cz-tint-navy"><Icon name={icon} size={20} /></span><div><strong>{v}</strong><span>{l}</span><small>{sub}</small></div></div>)}
          </div>
          <div className="cz-ws-cols">
            <div className="cz-ws">
              <Card>
                <div className="cz-ws-section-head"><h2>Business apps</h2><Link href="/workspace/apps">All apps</Link></div>
                <div className="cz-app-grid cz-compact">{WORKSPACE_APPS.filter((a) => a.category !== 'ai' || a.key === 'growth').slice(0, 16).map((a) => <AppTile key={a.key} app={a} compact />)}</div>
              </Card>
              <Card>
                <div className="cz-ws-section-head"><h2>Business lines</h2><Link href="/workspace/companies">All companies</Link></div>
                {!d.businessLines.length ? <EmptyState icon="value" title="No business recorded yet">Projects and won sales appear here as soon as they are recorded.</EmptyState> : (
                  <div className="cz-stack" style={{ gap: 10 }}>
                    {d.businessLines.map((b) => (
                      <div key={b.id} className="cz-pilot-bar" style={{ gridTemplateColumns: 'minmax(130px, 220px) 1fr auto' }}>
                        <span><strong style={{ color: 'var(--cz-navy-900)' }}>{b.name}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{COMPANY_CATEGORY_LABELS[b.category]} · {b.liveProjects} live project{b.liveProjects === 1 ? '' : 's'}</span></span>
                        <span><i style={{ width: `${(b.value / maxLine) * 100}%` }} /></span>
                        <span style={{ fontWeight: 600, color: 'var(--cz-navy-900)' }}>{inr(b.value)}</span>
                      </div>
                    ))}
                    <p className="cz-muted" style={{ margin: 0, fontSize: 12.5 }}>Value of live projects plus sales won through partners. Accounting revenue arrives with Finance (Phase C).</p>
                  </div>
                )}
              </Card>
            </div>
            <aside className="cz-ws-side" aria-label="Your day">
              <section className="cz-ws-ai" aria-labelledby="ai-h">
                <h2 id="ai-h"><Icon name="info" size={18} /> COLLABIZ AI</h2>
                <p>Find anything across the Unite businesses.</p>
                <form onSubmit={(e) => { e.preventDefault(); if (ask.trim().length >= 2) router.push(`/workspace/search?q=${encodeURIComponent(ask.trim())}`); }}>
                  <input aria-label="Ask COLLABIZ AI" placeholder="e.g. Powertek, Volt EPC, solar…" value={ask} onChange={(e) => setAsk(e.target.value)} />
                  <button type="submit">Ask</button>
                </form>
                <small>Searches companies, partners, projects, offers and leads today. Answers in full sentences once an AI provider is connected.</small>
              </section>
              <Card title="Waiting for you">
                {!d.approvals.length ? <p className="cz-muted" style={{ margin: 0 }}>Nothing assigned to your role.</p> : (
                  <ul className="cz-ws-list">{d.approvals.map((a) => <li key={a.key}><a href={resolveHref(a.href)}>{a.label}</a><span className="cz-ws-count" data-on={a.n > 0 || undefined}>{a.n}</span></li>)}</ul>
                )}
              </Card>
              <Card title="Your meetings" actions={<Link href="/workspace/meet" style={{ fontSize: 14 }}>Meet</Link>}>
                {!d.meetings.length ? <p className="cz-muted" style={{ margin: 0 }}>No upcoming meetings. <Link href="/workspace/meet">Schedule one</Link>.</p> : d.meetings.map((m) => (
                  <div key={m.id} className="cz-ws-meeting">
                    <span className="cz-ws-date">{new Date(m.startsAt).toLocaleDateString('en-IN', { weekday: 'short' })}<strong>{new Date(m.startsAt).getDate()}</strong></span>
                    <div style={{ minWidth: 0 }}><strong style={{ color: 'var(--cz-navy-900)', fontSize: 14 }}>{m.title}</strong><div className="cz-muted" style={{ fontSize: 12.5 }}>{time(m.startsAt)}–{time(m.endsAt)} · {m.attendees} people</div></div>
                    <a className="cz-btn cz-btn-secondary cz-btn-sm" href={webUrl(`/meetings/${m.id}`)} style={{ marginLeft: 'auto' }}>Open</a>
                  </div>
                ))}
              </Card>
              <Card title="Recent activity">
                {!d.activity.length ? <p className="cz-muted" style={{ margin: 0 }}>No activity yet.</p> : (
                  <ul className="cz-ws-list">{d.activity.map((a, i) => <li key={i} style={{ alignItems: 'flex-start' }}><span><strong style={{ color: 'var(--cz-navy-900)' }}>{a.who}</strong> {a.what}</span><span className="cz-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{ago(a.at)}</span></li>)}</ul>
                )}
              </Card>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
