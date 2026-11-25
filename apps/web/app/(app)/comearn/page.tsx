'use client';
import Link from 'next/link';
import { CE_CATEGORIES, type CeStage } from '@collabiz/types';
import { Card, EmptyState, Icon, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CATEGORY_ICON, CeHeader, CeNav, OppCard, Tracker, rupees, type CeCard } from '@/components/Comearn';
import { useQuery } from '@/lib/hooks';

interface Home {
  earnedPaise: number; pendingPaise: number; potentialPaise: number; activeOpportunities: number; myEngagements: number;
  categories: Record<string, number>; recommended: CeCard[];
  tracker: { id: string; title: string; stage: CeStage; stageLabel: string; step: number }[];
  company: { posted: number; live: number; toAct: number };
}

/** COMEARN home — every figure is this member's own record (₹0 until something is earned). */
export default function ComearnHome() {
  const q = useQuery<Home>('/comearn/home');
  const d = q.data;
  return (
    <Screen page={{ key: 'comearn', title: 'COMEARN', access: 'partner' }} header={false}>
      <CeHeader />
      <CeNav />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <Skeleton height={320} /> : (
        <>
          <section className="ce-stats" aria-label="Your commissions">
            <div className="ce-stat ce-stat-main"><span>Your commission earnings</span><strong data-ce-earned>{rupees(d.earnedPaise)}</strong><small>Paid to you, after tax deducted</small></div>
            <div className="ce-stat"><span>Pending</span><strong>{rupees(d.pendingPaise)}</strong><small>Verified, awaiting approval or transfer</small></div>
            <div className="ce-stat"><span>Potential earnings</span><strong>{rupees(d.potentialPaise)}</strong><small>Estimate from your open engagements</small></div>
            <div className="ce-stat"><span>Active opportunities</span><strong>{d.activeOpportunities}</strong><small>Live from other businesses</small></div>
          </section>
          <section className="ce-split">
            <Link href="/comearn/explore" className="ce-big" data-tone="earn"><Icon name="coins" size={26} /><strong>Earn Commissions</strong><span>Find opportunities</span></Link>
            <Link href="/comearn/offer" className="ce-big" data-tone="offer"><Icon name="trend" size={26} /><strong>Offer Commissions</strong><span>Grow your business{d.company.toAct ? ` · ${d.company.toAct} to act on` : ''}</span></Link>
          </section>
          <Card title="Your earning assistant" subtitle="Rules-based for now: suggestions come from the categories you already earn in and the newest opportunities. AI suggestions switch on when the AI key is connected.">
            {d.recommended.length ? <div className="ce-grid">{d.recommended.map((o) => <OppCard key={o.id} o={o} />)}</div> : <EmptyState icon="sparkles" title="No live opportunities yet">Companies’ earning opportunities appear here as soon as they publish them.</EmptyState>}
          </Card>
          <Card title="Explore categories">
            <div className="ce-cats">{Object.entries(CE_CATEGORIES).map(([k, l]) => <Link key={k} href={`/comearn/explore?category=${k}`} className="ce-cat"><Icon name={CATEGORY_ICON[k]} size={20} /><span>{l}</span><small>{d.categories[k] ?? 0}</small></Link>)}
              <Link href="/comearn/explore" className="ce-cat"><Icon name="target" size={20} /><span>All</span><small>{d.activeOpportunities}</small></Link></div>
          </Card>
          <Card title="My commission tracker" actions={<Link href="/comearn/my">All my leads →</Link>}>
            {d.tracker.length ? d.tracker.map((t) => (
              <Link key={t.id} href={`/comearn/engagements/${t.id}`} className="ce-trackrow"><span><strong>{t.title}</strong><small>Step {t.step} of 8 · {t.stageLabel}</small></span><span className="ce-progress"><i style={{ width: `${(t.step / 8) * 100}%` }} /></span></Link>
            )) : <><EmptyState icon="leads" title="Nothing tracked yet">Join an opportunity to start. Every step is recorded here:</EmptyState><Tracker stage={'selected' as CeStage} stages={undefined} /></>}
          </Card>
        </>
      )}
    </Screen>
  );
}
