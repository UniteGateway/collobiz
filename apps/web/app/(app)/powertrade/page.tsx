'use client';
import Link from 'next/link';
import { PT_INTERESTS, PT_MODELS, type PtInterest } from '@collabiz/types';
import { ButtonLink, EmptyState, Icon, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { PtHeader, PtNav, PtStatusBadge, Widget, rupees } from '@/components/Powertrade';
import { useQuery } from '@/lib/hooks';

interface Dash {
  joined: boolean; profile?: { industry: string; state: string; interests: PtInterest[]; sample: boolean };
  energy?: { monthlyUnits: number; tariffPaisePerKwh: number; contractDemandKva: number } | null; contributions?: { id: string; title: string; kind: string }[];
  collaborations?: { id: string; code: string; title: string; model: keyof typeof PT_MODELS; status: string; counterparty: string | null; mine: boolean }[]; activeCount?: number;
  finance?: { savings: { verified: number; reported: number }; sales: { purchaseOrdersPaise: number; orders: number }; benefits: { anticipated: number; earned: number; verified: number; collected: number }; allocations: { requested: number; approved: number };
    powerExpense: { expensePaise: number | null; basis: string | null; approvedSupportPaise: number; netEconomicExpensePaise: number | null; period: string } };
  lastScenario?: { results: { rows: { label: string; eligible: boolean; monthlySavingPaise: number | null }[]; ranked: string[] } } | null;
  actions?: { title: string; detail: string; href: string; tone: string }[];
}
const OPTIONS: [string, string, string, string][] = [
  ['Get discounted power', 'Compare rooftop, open access, group captive and captive — with every charge and approval shown.', '/powertrade/power', 'sun'],
  ['Earn power benefits through business', 'Sell, refer and distribute; verified, collected earnings can support your power expense.', '/powertrade/finance', 'coins'],
  ['Exchange products or services', 'Barter, part-cash and multi-party deals in XCHANGE, each leg valued and invoiced.', '/xchange', 'barter'],
  ['Become a solar business partner', 'Supply steel, transformers, cement, cables or services to Unite projects, or install as an EPC partner.', '/powertrade/matches', 'factory'],
];

/** POWERTRADE Home — the Energy + Business dashboard (real data only). */
export default function PowertradeHome() {
  const q = useQuery<Dash>('/powertrade/dashboard');
  const d = q.data;
  return (
    <Screen page={{ key: 'powertrade', title: 'POWERTRADE', access: 'partner' }} header={false}>
      <PtHeader>{d && !d.joined && <div className="pt-cta"><ButtonLink href="/powertrade/join" variant="accent">Join POWERTRADE</ButtonLink><span>Free for COLLABIZ businesses — takes a few minutes.</span></div>}</PtHeader>
      <PtNav />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <Skeleton height={300} /> : !d.joined ? (
        <>
          <div className="pt-options">{OPTIONS.map(([t, x, h, i]) => <Link key={t} href={d.joined ? h : '/powertrade/join'} className="pt-option"><Icon name={i as never} size={26} /><strong>{t}</strong><span>{x}</span></Link>)}</div>
          <section className="cz-card pt-models"><h2>Six ways any industry can collaborate</h2>
            <ul>{Object.entries(PT_MODELS).map(([k, m]) => <li key={k}><strong>{m.label}</strong><span>{m.text}</span></li>)}</ul>
            <p className="cz-muted">“Free power” needs a funding source. COLLABIZ shows a zero net power expense only when verified, collected and approved business benefits cover it — your power supplier and DISCOM are always paid in full.</p>
          </section>
        </>
      ) : (
        <>
          {d.profile?.sample && <p className="cz-alert cz-alert-info">Sample data — this business is a demonstration record.</p>}
          <div className="pt-widgets">
            <Widget icon="sun" tone="green" label="Electricity savings (verified)" value={rupees(d.finance!.savings.verified)} hint={d.finance!.savings.reported > d.finance!.savings.verified ? `${rupees(d.finance!.savings.reported)} reported, awaiting verification` : 'From bills you recorded'} href="/powertrade/finance" />
            <Widget icon="package" tone="blue" label="Product sales (turnover)" value={rupees(d.finance!.sales.purchaseOrdersPaise)} hint={`${d.finance!.sales.orders} accepted purchase orders · not profit`} href="/trading/orders" />
            <Widget icon="coins" tone="amber" label="Collaboration earnings collected" value={rupees(d.finance!.benefits.collected)} hint={`${rupees(d.finance!.benefits.verified + d.finance!.benefits.earned)} earned, not yet collected`} href="/powertrade/finance" />
            <Widget icon="zap" tone="indigo" label={`Net power expense · ${d.finance!.powerExpense.period}`} value={rupees(d.finance!.powerExpense.netEconomicExpensePaise)} hint={d.finance!.powerExpense.basis ? `${d.finance!.powerExpense.basis}; ${rupees(d.finance!.powerExpense.approvedSupportPaise)} approved support` : 'Add your electricity profile'} href="/powertrade/power" />
            <Widget icon="teams" tone="violet" label="Active collaborations" value={d.activeCount ?? 0} href="/powertrade/collaborations" />
          </div>
          <div className="pt-grid">
            <section className="cz-card"><div className="cz-card-head"><h2>Action plan</h2><Link href="/action-os" className="cz-link-arrow">All tasks<Icon name="arrow" size={14} /></Link></div>
              {!d.actions?.length ? <p className="cz-muted">Nothing waiting on you in POWERTRADE.</p> : <ul className="pt-actions">{d.actions.map((a) => <li key={a.title} data-tone={a.tone}><Link href={a.href}><strong>{a.title}</strong><span>{a.detail}</span></Link></li>)}</ul>}
            </section>
            <section className="cz-card"><div className="cz-card-head"><h2>Power PPA opportunities</h2><Link href="/powertrade/power" className="cz-link-arrow">Compare<Icon name="arrow" size={14} /></Link></div>
              {!d.energy ? <EmptyState title="Add your electricity profile">Units, tariff and contract demand let you compare options.</EmptyState> : !d.lastScenario ? <p>Your bill is about <strong>{rupees(d.energy.monthlyUnits * d.energy.tariffPaisePerKwh)}</strong> a month. <Link href="/powertrade/power">Compare power options</Link>.</p> : (
                <ul className="pt-scen">{d.lastScenario.results.rows.map((r) => <li key={r.label}><span>{r.label}</span><strong>{r.eligible ? rupees(r.monthlySavingPaise) + '/mo' : 'Not eligible'}</strong></li>)}</ul>
              )}
            </section>
            <section className="cz-card pt-span2"><div className="cz-card-head"><h2>My collaborations</h2><Link href="/powertrade/collaborations" className="cz-link-arrow">All<Icon name="arrow" size={14} /></Link></div>
              {!d.collaborations?.length ? <EmptyState title="No collaborations yet" action={<ButtonLink href="/powertrade/matches" variant="secondary">See matches</ButtonLink>}>Start one from a match or propose a Product-for-Power deal.</EmptyState> : (
                <ul className="cz-umeet-list">{d.collaborations.map((c) => <li key={c.id}><div><strong>{c.code} · {c.title}</strong><span>{PT_MODELS[c.model].label} · with {c.counterparty ?? 'Unite Group'}</span></div><div className="cz-row" style={{ gap: 8, flexWrap: 'nowrap' }}><PtStatusBadge s={c.status} /><Link className="cz-btn cz-btn-secondary cz-btn-sm" href={`/powertrade/collaborations/${c.id}`}>Open</Link></div></li>)}</ul>
              )}
            </section>
            <section className="cz-card"><h2>My business</h2>
              <p className="cz-muted" style={{ marginTop: 0 }}>{d.profile!.industry} · {d.profile!.state}</p>
              <div className="cz-chips">{d.profile!.interests.map((i) => <span key={i} className="cz-chip">{PT_INTERESTS[i]}</span>)}</div>
              <p style={{ marginBottom: 0 }}>{d.contributions!.length} thing{d.contributions!.length === 1 ? '' : 's'} you contribute · <Link href="/powertrade/join#contributions">Edit</Link></p>
            </section>
            <section className="cz-card"><h2>Benefits pipeline</h2>
              <ul className="pt-scen">
                <li><span>Anticipated (not earned)</span><strong>{rupees(d.finance!.benefits.anticipated)}</strong></li>
                <li><span>Earned</span><strong>{rupees(d.finance!.benefits.earned)}</strong></li>
                <li><span>Verified by Unite finance</span><strong>{rupees(d.finance!.benefits.verified)}</strong></li>
                <li><span>Collected (cash received)</span><strong>{rupees(d.finance!.benefits.collected)}</strong></li>
                <li><span>Approved for power support</span><strong>{rupees(d.finance!.allocations.approved)}</strong></li>
              </ul>
            </section>
          </div>
        </>
      )}
    </Screen>
  );
}
