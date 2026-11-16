'use client';
/** Partner Home extras: Unite apps tray, members online, group-investment highlight and the newest opportunities. */
import Link from 'next/link';
import { appBrand, sectorName } from '@collabiz/types';
import { Icon, Skeleton } from '@collabiz/ui';
import { useQuery } from '@/lib/hooks';
import { inr, type Offer } from '@/components/InvestKit';

interface Venture { id: string; slug: string; name: string; category: string; sector: string; tagline: string; stage: string; open: boolean; myInterest: string | null }
const SECTOR_HUE: Record<string, string> = { solar: '#f59e0b', power_equipment: '#1E6BFF', ev: '#10b981', real_estate: '#8b5cf6', infrastructure: '#0e7490', construction_epc: '#0e7490', trading: '#db2777', logistics: '#db2777', local_commerce: '#ec4899', manufacturing: '#ea580c', agri_food: '#16a34a', financial_services: '#4338ca', technology: '#0891b2', education: '#7c3aed', media: '#e11d48', employment: '#2563eb', social_impact: '#059669', consulting: '#0f766e' };

/** Every Unite app as an icon: open apps go to the app; others show "Coming soon" and open their page. */
export function AppsTray() {
  const q = useQuery<Venture[]>('/ventures');
  const apps = (q.data ?? []).slice().sort((a, b) => Number(b.open) - Number(a.open) || a.name.localeCompare(b.name));
  return (
    <section className="cz-card cz-apps" aria-labelledby="apps-h">
      <div className="cz-card-head"><div><h2 id="apps-h">Unite apps</h2><p>Open an app or ask to join and promote it</p></div><Link href="/ventures" className="cz-link-arrow">All {q.data?.length ?? ''}<Icon name="arrow" size={14} /></Link></div>
      {!q.data ? <Skeleton height={120} /> : (
        <ul className="cz-apps-grid">{apps.slice(0, 18).map((v) => (
          <li key={v.id}><Link href={`/ventures/${v.slug}`} title={`${v.name} — ${v.tagline}`}>
            {appBrand(v.slug)?.logo ? <span className="cz-app-ic cz-app-ic-logo" aria-hidden><img src={appBrand(v.slug)!.mark ?? appBrand(v.slug)!.logo} alt="" /></span> : <span className="cz-app-ic" style={{ ['--hue' as string]: SECTOR_HUE[v.sector] ?? '#0B3D91' }} aria-hidden>{(() => { const w = v.name.split(/[\s/·-]+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : v.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2)).toUpperCase(); })()}</span>}
            <span className="cz-app-name">{v.name}</span>
            <span className={`cz-app-state${v.open ? '' : ' cz-soon'}`}>{v.myInterest === 'approved' ? 'Joined' : v.open ? 'Open' : 'Coming soon'}</span>
          </Link></li>
        ))}</ul>
      )}
    </section>
  );
}

export function OnlineStrip() {
  const q = useQuery<{ members: { userId: string; name: string; org: string }[] }>('/community/online');
  const m = q.data?.members ?? [];
  return (
    <section className="cz-card cz-online-strip" aria-labelledby="ol-h">
      <div className="cz-card-head"><h2 id="ol-h"><span className="cz-live-dot" aria-hidden /> Members online</h2><Link href="/community" className="cz-link-arrow">Community<Icon name="arrow" size={14} /></Link></div>
      {!q.data ? <Skeleton height={50} /> : !m.length ? <p className="cz-muted" style={{ margin: 0, fontSize: 13.5 }}>No one else is online right now — share a post in the Community.</p> : (
        <div className="cz-avatars">{m.slice(0, 8).map((x) => <span key={x.userId} className="cz-person-av" title={`${x.name} · ${x.org}`}>{x.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}<i /></span>)}{m.length > 8 && <span className="cz-person-av cz-more">+{m.length - 8}</span>}<span className="cz-muted" style={{ fontSize: 13 }}>{m.length} online</span></div>
      )}
    </section>
  );
}

export function InvestHighlight() {
  const q = useQuery<Offer[]>('/invest/offers');
  const o = q.data?.find((x) => x.status === 'interest_open');
  return (
    <section className="cz-card cz-invest-hi" aria-labelledby="inv-h">
      <div className="cz-card-head"><h2 id="inv-h">Invest together</h2><Link href="/invest" className="cz-link-arrow">All offers<Icon name="arrow" size={14} /></Link></div>
      {!q.data ? <Skeleton height={90} /> : !o ? <p className="cz-muted" style={{ margin: 0, fontSize: 13.5 }}>Group investment offers from Unite — like owning a share of a property and receiving rent pro rata — appear here.</p> : (
        <Link href="/invest" className="cz-invest-row">
          <strong>{o.title}</strong>
          <span className="cz-muted">{o.location} · {inr(o.unitPrice)}/{o.unitLabel} · projected {o.grossYieldPct}% a year</span>
          <span className="cz-offer-progress"><span style={{ width: `${o.subscribedPct}%` }} /></span>
          <span className="cz-muted" style={{ fontSize: 12 }}>{o.subscribedPct}% has interest · interest only until regulatory clearance</span>
        </Link>
      )}
    </section>
  );
}

interface Opp { id: string; title: string; sector: string; city: string | null; estimatedValue: number | null; deadline: string | null }
export function LatestOpportunities() {
  const q = useQuery<{ items: Opp[] }>('/opportunities', { paged: 'true', limit: '5', sort: 'newest' });
  return (
    <section className="cz-card cz-latest" aria-labelledby="lo-h">
      <div className="cz-card-head"><div><h2 id="lo-h">New business opportunities</h2><p>Latest on the marketplace</p></div><Link href="/marketplace" className="cz-link-arrow">Marketplace<Icon name="arrow" size={14} /></Link></div>
      {!q.data ? <Skeleton height={140} /> : !q.data.items.length ? <p className="cz-muted" style={{ margin: 0 }}>New opportunities appear here.</p> : (
        <ul className="cz-latest-list">{q.data.items.map((o) => (
          <li key={o.id}><Link href={`/opportunities/${o.id}`}><span className="cz-latest-dot" style={{ ['--hue' as string]: SECTOR_HUE[o.sector] ?? '#0B3D91' }} aria-hidden /><span><strong>{o.title}</strong><span className="cz-muted">{sectorName(o.sector)}{o.city ? ` · ${o.city}` : ''}{o.estimatedValue ? ` · ${inr(o.estimatedValue)}` : ''}{o.deadline ? ` · closes ${new Date(o.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</span></span><Icon name="next" size={16} /></Link></li>
        ))}</ul>
      )}
    </section>
  );
}
