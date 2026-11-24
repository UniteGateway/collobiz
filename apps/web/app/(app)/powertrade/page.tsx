'use client';
import Link from 'next/link';
import { PT_MODELS, type PtInterest } from '@collabiz/types';
import { ButtonLink, Icon, Skeleton, type IconName } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { PtHeader, PtNav, PtStatusBadge, rupees } from '@/components/Powertrade';
import { useQuery } from '@/lib/hooks';

interface Coll { id: string; code: string; title: string; model: keyof typeof PT_MODELS; status: string; counterparty: string | null; owner: string; mine: boolean; powerTariffPaisePerKwh: number | null; benefitValuePaise: number | null; required: { status: string; label: string }[]; next: string[] }
interface Dash {
  joined: boolean; profile?: { industry: string; state: string; interests: PtInterest[]; sample: boolean };
  energy?: { monthlyUnits: number; tariffPaisePerKwh: number } | null; contributions?: { id: string }[];
  collaborations?: Coll[]; activeCount?: number;
  finance?: { savings: { verified: number; reported: number }; sales: { purchaseOrdersPaise: number; orders: number }; benefits: { anticipated: number; earned: number; verified: number; collected: number }; allocations: { approved: number };
    powerExpense: { expensePaise: number | null; basis: string | null; approvedSupportPaise: number; netEconomicExpensePaise: number | null; period: string } };
  actions?: { title: string; detail: string; href: string; tone: string }[];
  series?: { month: string; salesPaise: number; savingsPaise: number; savingsVerified: boolean }[];
  matchCount?: number; matches?: { type: string; partner: string; title: string; arrangement: string; href: string }[];
}
const WAYS: [string, string, string, IconName][] = [
  ['Discounted power PPA', 'Buy renewable power at agreed long-term rates.', '/powertrade/power', 'zap'],
  ['Product-for-Power', 'Supply products under one contract, buy power under a separate PPA.', '/powertrade/collaborations?model=product_for_power', 'package'],
  ['Sell to Unite projects', 'Supply materials and equipment to Unite and partner projects.', '/powertrade/matches', 'trading'],
  ['Rooftop / land integration', 'Earn from your rooftop or land with solar.', '/businesses/roofz', 'roof'],
  ['Solar EPC partnership', 'Install, commission and maintain projects as an EPC partner.', '/powertrade/collaborations?model=solar_integration', 'factory'],
  ['Business microsite', 'Your own page to show products, collaborate and receive leads.', '/powertrade/join', 'building'],
];
const TYPICAL: [string, IconName, string, string][] = [
  ['Steel manufacturer', 'factory', 'Mounting structures, fabrication, balance-of-plant steel', 'Supply orders for solar projects + a power PPA option'],
  ['Textile mill', 'package', 'Textiles, uniforms, industrial fabric', 'Group-captive solar + export buyer introductions'],
  ['Retail chain', 'trading', 'Store network, distribution, co-branding', 'Commissions on solar products + rooftop for its own stores'],
  ['EPC contractor', 'sun', 'Installation, commissioning, O&M', 'Project assignments + power for its own premises'],
  ['Exporter', 'globe', 'International buyers, product offtake', 'Sourcing partners + export-linked business'],
];
const STEPS: [string, string, IconName][] = [['Join COLLABIZ', 'Use your existing business account.', 'users'], ['Add your profile', 'Industry, products, power needs and goals.', 'building'], ['Matching finds fits', 'Power, sales, barter, EPC and more — with reasons.', 'sparkles'], ['Collaborate & track', 'Agreements, approvals, savings and earnings in one place.', 'trend']];
const mon = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
const NEXT: Record<string, string> = { draft: 'Submit', submitted: 'Track review', under_review: 'Track review', awaiting_documents: 'Add documents', negotiating: 'Respond', approved: 'Contract', contracted: 'Start', in_progress: 'Track', partially_fulfilled: 'Track' };

/** POWERTRADE Home — Energy + Business dashboard. Every figure is the member's own data. */
export default function PowertradeHome() {
  const q = useQuery<Dash>('/powertrade/dashboard');
  const d = q.data;
  const f = d?.finance;
  const tariff = d?.energy?.tariffPaisePerKwh;
  const netPerKwh = f?.powerExpense.netEconomicExpensePaise != null && d?.energy ? Math.round(f.powerExpense.netEconomicExpensePaise / d.energy.monthlyUnits) : null;
  return (
    <Screen page={{ key: 'powertrade', title: 'POWERTRADE', access: 'partner' }} header={false}>
      <PtHeader>{d && <div className="pt-cta">{d.joined ? <ButtonLink href="/powertrade/matches" variant="accent">Explore opportunities</ButtonLink> : <><ButtonLink href="/powertrade/join" variant="accent">Join POWERTRADE</ButtonLink><span>Free for COLLABIZ businesses.</span></>}</div>}</PtHeader>
      <PtNav />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <Skeleton height={300} /> : (
        <>
          {d.joined && f && (
            <div className="pt-kpis" data-pt-kpis>
              <Kpi icon="zap" tone="green" label="Electricity savings" value={rupees(f.savings.verified)} hint={f.savings.reported > f.savings.verified ? `${rupees(f.savings.reported)} reported · awaiting verification` : 'Verified from your bills'} href="/powertrade/finance" />
              <Kpi icon="trading" tone="blue" label="Product sales" value={rupees(f.sales.purchaseOrdersPaise)} hint={`${f.sales.orders} accepted orders · turnover`} href="/trading/orders" />
              <Kpi icon="coins" tone="amber" label="Power benefits earned" value={rupees(f.benefits.earned + f.benefits.verified)} hint={`${rupees(f.benefits.collected)} collected`} href="/powertrade/finance" />
              <Kpi icon="leaf" tone="teal" label="Net power cost" value={netPerKwh != null ? `₹${(netPerKwh / 100).toFixed(2)}/kWh` : '—'} hint={tariff ? `vs grid ₹${(tariff / 100).toFixed(2)}/kWh` : 'Add your electricity profile'} href="/powertrade/power" />
              <Kpi icon="teams" tone="violet" label="Active collaborations" value={String(d.activeCount ?? 0)} href="/powertrade/collaborations" />
              <Kpi icon="sparkles" tone="indigo" label="New matches" value={String(d.matchCount ?? 0)} hint="From live listings" href="/powertrade/matches" />
            </div>
          )}

          <section className="pt-sec" aria-labelledby="ways-h">
            <h2 id="ways-h">How you can collaborate</h2>
            <div className="pt-ways">{WAYS.map(([t, x, h, i]) => <Link key={t} href={d.joined ? h : '/powertrade/join'} className="pt-way"><span className="pt-way-icon"><Icon name={i} size={22} /></span><span><strong>{t}</strong><small>{x}</small></span><Icon name="next" size={16} className="pt-way-go" /></Link>)}</div>
          </section>

          <div className="pt-row3">
            <section className="pt-panel" aria-labelledby="agent-h">
              <div className="pt-panel-head"><h2 id="agent-h"><Icon name="sparkles" size={18} />Matching agent</h2><span className="pt-chip">Rules + your data</span></div>
              <p className="pt-sub">{d.joined ? 'Recommended collaboration matches for your business' : 'Industries that collaborate through POWERTRADE'}</p>
              {d.joined ? (!d.matches?.length ? <p className="cz-muted">Add products with keywords and your electricity profile to get matches. <Link href="/powertrade/join">Complete profile</Link></p> : (
                <ul className="pt-agent">{d.matches.map((m) => <li key={m.title}><Link href={m.href}><span className="pt-tag" data-type={m.type}>{m.type === 'energy' ? 'Energy' : m.type === 'partner' ? 'Partner' : 'Business'}</span><span><strong>{m.partner}</strong> → {m.title}</span><Icon name="next" size={14} /></Link></li>)}</ul>
              )) : (
                <ul className="pt-agent">{TYPICAL.slice(0, 4).map(([n, i, , r]) => <li key={n}><span className="pt-agent-ic"><Icon name={i} size={16} /></span><span><strong>{n}</strong> → {r}</span></li>)}</ul>
              )}
              <Link href="/powertrade/matches" className="pt-link">View all matches <Icon name="arrow" size={14} /></Link>
            </section>

            <section className="pt-panel" aria-labelledby="mix-h">
              <div className="pt-panel-head"><h2 id="mix-h">Energy savings + business earnings</h2></div>
              {d.joined && f ? <Mix f={f} /> : (
                <ul className="pt-track">
                  <li><i style={{ background: '#1E7A3C' }} /><span><strong>Product sales</strong><small>Accepted purchase orders — shown as turnover, not profit</small></span></li>
                  <li><i style={{ background: '#5CC46B' }} /><span><strong>Power savings</strong><small>Bill before vs bill now, verified by Unite finance</small></span></li>
                  <li><i style={{ background: '#8FD3FF' }} /><span><strong>Benefits collected</strong><small>Commissions, rebates and margins actually received</small></span></li>
                  <li><i style={{ background: '#0B2C66' }} /><span><strong>Net power cost</strong><small>Your bill minus approved support — from your own records only</small></span></li>
                </ul>
              )}
              {d.joined && d.series && <Trend series={d.series} />}
            </section>

            <section className="pt-panel" aria-labelledby="week-h">
              <div className="pt-panel-head"><h2 id="week-h"><Icon name="calendar" size={18} />This week — Action OS</h2></div>
              {!d.joined ? <ul className="pt-week"><li><Link href="/powertrade/join"><span className="pt-box" />Join POWERTRADE<Icon name="next" size={14} /></Link></li></ul>
                : !d.actions?.length ? <p className="cz-muted">Nothing waiting on you this week.</p>
                : <ul className="pt-week">{d.actions.map((a) => <li key={a.title} data-tone={a.tone}><Link href={a.href}><span className="pt-box" /><span><strong>{a.title}</strong><small>{a.detail}</small></span><Icon name="next" size={14} /></Link></li>)}</ul>}
              <Link href="/action-os" className="pt-link">Open Action OS <Icon name="arrow" size={14} /></Link>
            </section>
          </div>

          {d.joined ? (
            <section className="pt-sec" aria-labelledby="mine-h">
              <div className="pt-sec-head"><h2 id="mine-h">My energy &amp; business collaboration</h2><Link href="/powertrade/collaborations" className="pt-link">All collaborations <Icon name="arrow" size={14} /></Link></div>
              {!d.collaborations?.length ? <div className="pt-empty"><p>No collaborations yet. Start one from a match, or propose a Product-for-Power deal.</p><ButtonLink href="/powertrade/collaborations" variant="secondary">Propose a collaboration</ButtonLink></div> : (
                <div className="cz-table-wrap"><table className="cz-table pt-table"><caption className="cz-sr-only">My collaborations</caption>
                  <thead><tr><th>Business / partner</th><th>Collaboration model</th><th>Status</th><th>Power benefit</th><th>Next action</th></tr></thead>
                  <tbody>{d.collaborations.map((c) => (
                    <tr key={c.id}><td><strong>{c.mine ? c.counterparty ?? 'Unite Group' : c.owner}</strong><br /><span className="cz-muted">{c.code}</span></td><td>{PT_MODELS[c.model].label}</td><td><PtStatusBadge s={c.status} /></td>
                      <td className="pt-pos">{c.powerTariffPaisePerKwh && tariff ? `₹${((tariff - c.powerTariffPaisePerKwh) / 100).toFixed(2)}/kWh saving` : c.benefitValuePaise ? `${rupees(c.benefitValuePaise)} agreed benefit` : '—'}</td>
                      <td><Link href={`/powertrade/collaborations/${c.id}`} className="cz-btn cz-btn-secondary cz-btn-sm">{NEXT[c.status] ?? 'Open'} <Icon name="next" size={13} /></Link></td></tr>
                  ))}</tbody></table></div>
              )}
            </section>
          ) : (
            <section className="pt-sec" aria-labelledby="typ-h">
              <h2 id="typ-h">Who collaborates — and how</h2>
              <div className="cz-table-wrap"><table className="cz-table pt-table"><caption className="cz-sr-only">Typical collaborations</caption>
                <thead><tr><th>Industry partner</th><th>Can contribute</th><th>Can receive</th></tr></thead>
                <tbody>{TYPICAL.map(([n, i, c, r]) => <tr key={n}><td><span className="pt-agent-ic"><Icon name={i} size={15} /></span> <strong>{n}</strong></td><td>{c}</td><td>{r}</td></tr>)}</tbody></table></div>
              <p className="cz-muted" style={{ fontSize: 13 }}>Typical arrangements, not offers. Savings depend on your bill, location, approvals and the agreed tariff.</p>
            </section>
          )}

          <section className="pt-sec" aria-labelledby="how-h">
            <h2 id="how-h">How it works</h2>
            <ol className="pt-how">{STEPS.map(([t, x, i], n) => <li key={t}><span className="pt-how-n">{n + 1}</span><Icon name={i} size={22} /><span><strong>{t}</strong><small>{x}</small></span></li>)}</ol>
          </section>
          <p className="cz-muted" style={{ fontSize: 12.5 }}>“Free power” needs a funding source. A zero net power cost is shown only when verified, collected and approved business benefits cover it — your power supplier and DISCOM are paid in full. COLLABIZ does not sell electricity.</p>
        </>
      )}
    </Screen>
  );
}

function Kpi({ icon, tone, label, value, hint, href }: { icon: IconName; tone: string; label: string; value: string; hint?: string; href: string }) {
  return <Link href={href} className="pt-kpi"><span className="pt-w-icon" data-tone={tone}><Icon name={icon} size={20} /></span><span><small>{label}</small><strong>{value}</strong>{hint && <em>{hint}</em>}</span></Link>;
}

/** Donut of the member's own figures; amounts are shown, not percentages of a made-up total. */
function Mix({ f }: { f: NonNullable<Dash['finance']> }) {
  const parts: [string, number, string][] = [['Product sales (turnover)', f.sales.purchaseOrdersPaise, '#1E7A3C'], ['Power savings (verified)', f.savings.verified, '#5CC46B'], ['Benefits collected', f.benefits.collected, '#8FD3FF'], ['Net power expense (month)', f.powerExpense.netEconomicExpensePaise ?? 0, '#0B2C66']];
  const total = parts.reduce((s, p) => s + p[1], 0);
  let acc = 0;
  const C = 2 * Math.PI * 42;
  return (
    <div className="pt-mix">
      <svg viewBox="0 0 100 100" role="img" aria-label="Your savings, sales, benefits and net power expense">
        <circle cx="50" cy="50" r="42" fill="none" stroke="#EEF1F5" strokeWidth="14" />
        {total > 0 && parts.map(([l, v, c]) => { const len = (v / total) * C; const el = <circle key={l} cx="50" cy="50" r="42" fill="none" stroke={c} strokeWidth="14" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 50 50)" />; acc += len; return el; })}
        <text x="50" y="48" textAnchor="middle" className="pt-mix-v">{total ? rupees(total - (f.powerExpense.netEconomicExpensePaise ?? 0)) : '₹0'}</text>
        <text x="50" y="60" textAnchor="middle" className="pt-mix-l">value created</text>
      </svg>
      <ul>{parts.map(([l, v, c]) => <li key={l}><i style={{ background: c }} />{l}<strong>{rupees(v)}</strong></li>)}</ul>
    </div>
  );
}

function Trend({ series }: { series: NonNullable<Dash['series']> }) {
  const max = Math.max(1, ...series.map((s) => s.salesPaise));
  const maxS = Math.max(1, ...series.map((s) => s.savingsPaise));
  if (!series.some((s) => s.salesPaise || s.savingsPaise)) return <p className="cz-muted" style={{ fontSize: 13 }}>Monthly sales and savings appear here as orders are accepted and bills are recorded.</p>;
  return (
    <figure className="v5-chart" style={{ marginTop: 10 }} aria-label="Sales (bars) and power savings (line), last six months">
      <svg viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden>
        {series.map((s, i) => <rect key={s.month} x={12 + i * 48} y={105 - (s.salesPaise / max) * 90} width="26" height={(s.salesPaise / max) * 90} rx="4" className="v5-bar" />)}
        <polyline fill="none" className="v5-line" points={series.map((s, i) => `${25 + i * 48},${105 - (s.savingsPaise / maxS) * 90}`).join(' ')} />
      </svg>
      <figcaption><span>{series.map((s) => mon(s.month)).join(' · ')}</span><span><i className="v5-k-bar" />Sales <i className="v5-k-line" />Savings</span></figcaption>
    </figure>
  );
}
