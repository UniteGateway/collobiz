'use client';
/** Home extras: photo programme tiles, the energy desk (charts from the partner's own solar and Powertek records) and live business news. */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon, Skeleton } from '@collabiz/ui';
import { useQuery } from '@/lib/hooks';
import { PROGRAMMES, photo } from '@/lib/photos';
import { routeIntent } from '@collabiz/types';

const inr = (paise: number) => { const r = paise / 100; return r >= 1e7 ? `₹${(r / 1e7).toFixed(2)} Cr` : r >= 1e5 ? `₹${(r / 1e5).toFixed(1)} L` : `₹${Math.round(r).toLocaleString('en-IN')}`; };
const mon = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
const ago = (iso: string | null) => { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

/** Six programme tiles with real photography. */
export function ProgrammeTiles() {
  return (
    <section className="cz-prog" aria-label="Unite programmes">
      {PROGRAMMES.map((p) => (
        <Link key={p.href} href={p.href} className="cz-prog-tile">
          <img src={photo(p.photo)} alt="" aria-hidden loading="lazy" />
          <span className="cz-prog-text"><strong>{p.title}</strong><span>{p.text}</span></span>
          <span className="cz-prog-go" aria-hidden><Icon name="arrow" size={15} /></span>
        </Link>
      ))}
    </section>
  );
}

interface Energy {
  months: string[]; quotes: number[]; kw: number[]; value: number[]; models: { model: string; n: number; kw: number }[]; statuses: Record<string, { n: number; value: number }>;
  totals: { quotes: number; pipelineValue: number; kwSixMonths: number; won: number }; enquiryLines: { line: string; n: number }[];
  opportunities: { count: number; value: number; latest: { id: string; title: string; city: string | null; value: number | null }[] }; tenders: { open: number; closingSoon: number };
}
const MODEL: Record<string, string> = { kit: 'Solar kits', epc: 'EPC (turnkey)', ppa: 'PPA (no upfront)' };
const MODEL_C = ['#F59E0B', '#1E6BFF', '#16A34A', '#7C3AED'];

function Bars({ labels, values, unit, tone }: { labels: string[]; values: number[]; unit: string; tone: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="cz-bars" role="img" aria-label={labels.map((l, i) => `${l}: ${values[i]} ${unit}`).join(', ')}>
      {values.map((v, i) => (
        <div key={labels[i]} className="cz-bar-col"><span className="cz-bar-val">{v ? v.toLocaleString('en-IN') : ''}</span>
          <span className="cz-bar" style={{ height: `${Math.max(v ? 6 : 2, (v / max) * 100)}%`, background: tone }} /><span className="cz-bar-lbl">{labels[i]}</span></div>
      ))}
    </div>
  );
}
function Donut({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  let acc = 0;
  const stops = parts.map((p) => { const a = (acc / Math.max(1, total)) * 360; acc += p.value; return `${p.color} ${a}deg ${(acc / Math.max(1, total)) * 360}deg`; }).join(', ');
  return (
    <div className="cz-donut-wrap">
      <div className="cz-donut" style={{ background: total ? `conic-gradient(${stops})` : '#E4E7EC' }} role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')}><span>{total}<small>quotes</small></span></div>
      <ul>{parts.map((p) => <li key={p.label}><i style={{ background: p.color }} />{p.label}<strong>{p.value}</strong></li>)}</ul>
    </div>
  );
}

/** Energy desk: shown to energy-sector partners and anyone with solar quotes. */
export function EnergyDesk({ show }: { show: boolean }) {
  const q = useQuery<Energy>('/me/home/energy');
  const e = q.data;
  if (!show && !(e && e.totals.quotes)) return null;
  return (
    <section className="cz-card cz-energy" aria-labelledby="en-h">
      <div className="cz-energy-head" style={{ backgroundImage: `linear-gradient(95deg, rgba(4,30,66,.92), rgba(4,30,66,.55) 60%, rgba(245,158,11,.25)), url(${photo('energy-solar-field')})` }}>
        <div><span className="cz-energy-eyebrow">ENERGY DESK</span><h2 id="en-h">Solar and power business at a glance</h2><p>Your quotes, kilowatts, pipeline and the energy market on COLLABIZ</p></div>
        <div className="cz-row" style={{ gap: 8, flexWrap: 'wrap' }}><Link className="cz-btn cz-btn-light" href="/energy">Energy marketplace</Link><Link className="cz-btn cz-btn-ghost-light" href="/solar/new">New solar quote</Link><Link className="cz-btn cz-btn-ghost-light" href="/powertek">Powertek products</Link></div>
      </div>
      {!e ? <Skeleton height={220} /> : <>
        <div className="cz-energy-kpis">
          <div><span>Quotes</span><strong>{e.totals.quotes}</strong><em>{e.totals.won} won or installed</em></div>
          <div><span>kW quoted (6 months)</span><strong>{e.totals.kwSixMonths.toLocaleString('en-IN')}</strong><em>{(e.totals.kwSixMonths / 1000).toFixed(2)} MW</em></div>
          <div><span>Quote pipeline</span><strong>{inr(e.totals.pipelineValue)}</strong><em>Open, sent and won quotes</em></div>
          <div><span>Energy opportunities</span><strong>{e.opportunities.count}</strong><em>{e.opportunities.value ? `${inr(e.opportunities.value)} listed` : 'Open on the marketplace'}</em></div>
          <div><span>Energy tenders open</span><strong>{e.tenders.open}</strong><em>{e.tenders.closingSoon} closing in 14 days</em></div>
        </div>
        <div className="cz-energy-grid">
          <figure><figcaption>kW quoted by month</figcaption><Bars labels={e.months.map(mon)} values={e.kw} unit="kW" tone="linear-gradient(180deg,#FBBF24,#F59E0B)" /></figure>
          <figure><figcaption>Quotes by type</figcaption><Donut parts={e.models.map((m, i) => ({ label: MODEL[m.model] ?? m.model, value: m.n, color: MODEL_C[i % MODEL_C.length] }))} /></figure>
          <figure><figcaption>Quotes by month</figcaption><Bars labels={e.months.map(mon)} values={e.quotes} unit="quotes" tone="linear-gradient(180deg,#60A5FA,#1E6BFF)" /></figure>
          <figure><figcaption>Powertek enquiries by product line</figcaption>
            {e.enquiryLines.length ? <ul className="cz-hbars">{e.enquiryLines.map((l) => { const max = Math.max(...e.enquiryLines.map((x) => x.n)); return <li key={l.line}><span>{l.line}</span><i style={{ width: `${(l.n / max) * 100}%` }} /><strong>{l.n}</strong></li>; })}</ul>
              : <p className="cz-muted" style={{ fontSize: 13 }}>No product enquiries yet. <Link href="/powertek">Sell Powertek products</Link></p>}
          </figure>
        </div>
        {e.opportunities.latest.length > 0 && (
          <div className="cz-energy-opps"><h3>Latest energy opportunities</h3>
            <ul>{e.opportunities.latest.map((o) => <li key={o.id}><Link href={`/opportunities/${o.id}`}>{o.title}</Link><span>{o.city ?? ''}{o.value ? ` · ${inr(o.value)}` : ''}</span></li>)}</ul></div>
        )}
      </>}
    </section>
  );
}

interface NewsResp { items: { title: string; link: string; source: string; publishedAt: string | null }[]; feeds: { label: string; ok: boolean; items: number; error?: string }[]; fetchedAt: string | null; live: boolean }
/** Live business news (RSS headlines), refreshed every 10 minutes while the page is open. */
export function BusinessNews({ fallback }: { fallback?: { id: string; title: string; publishedAt: string | null }[] }) {
  const q = useQuery<NewsResp>('/me/home/business-news');
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => { q.reload(); tick((x) => x + 1); }, 10 * 60_000); return () => clearInterval(t); }, [q]);
  const d = q.data;
  return (
    <section className="cz-card cz-bnews" aria-labelledby="bn-h">
      <div className="cz-card-head"><div><h2 id="bn-h"><span className={`cz-live-dot${d?.live ? '' : ' cz-off'}`} aria-hidden /> Business news</h2><p>{d?.live ? `Live headlines · updated ${ago(d.fetchedAt)}` : 'Markets, industry and energy headlines'}</p></div>
        <button type="button" className="cz-link-arrow" onClick={() => q.reload()} aria-label="Refresh business news">Refresh<Icon name="arrow" size={14} /></button></div>
      {!d ? <Skeleton height={160} /> : d.items.length ? (
        <ul className="cz-bnews-list">{d.items.slice(0, 8).map((n) => (
          <li key={n.link}><a href={n.link} target="_blank" rel="noopener noreferrer">{n.title}</a><span>{n.source} · {ago(n.publishedAt)}</span></li>
        ))}</ul>
      ) : (
        <>
          {fallback?.length ? <ul className="cz-bnews-list">{fallback.slice(0, 5).map((n) => <li key={n.id}><Link href="/announcements">{n.title}</Link><span>COLLABIZ · {ago(n.publishedAt)}</span></li>)}</ul> : null}
          <p className="cz-muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>Live headlines are not available right now{d.feeds.length ? ` — ${d.feeds.filter((f) => !f.ok).length} of ${d.feeds.length} news sources could not be reached from the server` : ''}. They load automatically once the server can reach them.</p>
        </>
      )}
    </section>
  );
}

/** "What do you want to do today?" — free text routed to the right tool (rules shared with the API types). */
export function IntentBox() {
  const [text, setText] = useState('');
  const hit = routeIntent(text);
  const go = (t: string) => { const r = routeIntent(t); if (r) window.location.assign(r.href); };
  const EXAMPLES = ['I have an office with 30 seats', 'Start a business with my warehouse', 'Buy cables together in bulk', 'Find spare installation crews', 'Post a franchise offer'];
  return (
    <section className="cz-card cz-intent" aria-labelledby="intent-h">
      <h2 id="intent-h">What do you want to do today?</h2>
      <p className="cz-muted">Tell us what you have, need or want to start — we take you to the right tool.</p>
      <form className="cz-intent-form" role="search" onSubmit={(e) => { e.preventDefault(); go(text); }}>
        <label className="cz-sr-only" htmlFor="intent-q">What do you want to do?</label>
        <input id="intent-q" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. I have an office with 30 seats" autoComplete="off" />
        <button type="submit" className="cz-btn cz-btn-primary" disabled={!hit}>Go</button>
      </form>
      <p className="cz-intent-hint" aria-live="polite">{hit ? <>Takes you to <strong>{hit.label}</strong></> : 'Takes you to the right tool — Launch, Collab, Offers, Pools, Capacity or search.'}</p>
      <div className="cz-chips">{EXAMPLES.map((x) => <button key={x} type="button" className="cz-chip" onClick={() => go(x)}>{x}</button>)}</div>
    </section>
  );
}

interface Setup { steps: { key: string; title: string; text: string; href: string; done: boolean }[]; done: number; total: number; next: { title: string } | null }
/** "Get set up" — each step read from real records; can be hidden for this browser. */
export function SetupChecklist() {
  const q = useQuery<Setup>('/me/setup-checklist');
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem('cz-setup-hidden') === '1'); } catch { /* storage unavailable */ } }, []);
  const d = q.data;
  if (!d || hidden || d.done === d.total) return null;
  return (
    <section className="cz-card cz-setup" aria-labelledby="setup-h">
      <div className="cz-card-head"><div><h2 id="setup-h">Get set up</h2><p>{d.done} of {d.total} done{d.next ? ` · next: ${d.next.title.toLowerCase()}` : ''}</p></div>
        <button type="button" className="cz-link-arrow" onClick={() => { setHidden(true); try { localStorage.setItem('cz-setup-hidden', '1'); } catch { /* ignore */ } }}>Hide</button></div>
      <div className="cz-ops-meter" role="meter" aria-valuemin={0} aria-valuemax={d.total} aria-valuenow={d.done} aria-label="Setup progress"><span style={{ width: `${(d.done / d.total) * 100}%` }} /></div>
      <ol className="cz-setup-list">{d.steps.map((s) => (
        <li key={s.key} className={s.done ? 'done' : ''}><span className="cz-setup-dot" aria-hidden>{s.done ? '✓' : ''}</span>
          <div>{s.done ? <strong>{s.title}</strong> : <Link href={s.href}><strong>{s.title}</strong></Link>}<span>{s.text}</span></div><em>{s.done ? 'Done' : 'To do'}</em></li>
      ))}</ol>
    </section>
  );
}
