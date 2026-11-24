'use client';
/** Everything COLLABIZ does, as one grid (How it works). Big tiles carry a photo. */
import Link from 'next/link';
import { Icon, type IconName } from '@collabiz/ui';

const PLATFORM: { icon: IconName; title: string; text: string; href: string; photo?: string; wide?: boolean }[] = [
  { icon: 'leads', title: 'Protected leads & CRM', text: 'Register a customer with consent and evidence. A time-stamped certificate protects your introduction, and the deal runs in your own pipeline.', href: '/how-it-works', photo: 'team-success', wide: true },
  { icon: 'tenders', title: 'Teams & tenders', text: 'Form multi-company teams under NDA and bid together.', href: '/how-it-works' },
  { icon: 'projects', title: 'Projects & milestones', text: 'Evidence-backed milestones the client certifies.', href: '/how-it-works' },
  { icon: 'earnings', title: 'Commissions you can trace', text: 'Projected → eligible → earned → paid, on an append-only ledger.', href: '/how-it-works' },
  { icon: 'value', title: 'Unite Solar & Green Park', text: 'Rooftop, EPC and PPA quotes from a bill; renewable capacity meets industrial demand with landed-cost estimates.', href: '/businesses/sunite', photo: 'energy-wind-coast', wide: true },
  { icon: 'building', title: 'Property & industrial parks', text: 'Unite residential projects and industrial parks with RERA details, live availability and site-visit booking.', href: '/businesses/prodeal', photo: 'property-tower', wide: true },
  { icon: 'briefcase', title: 'Micro-contracts & capacity', text: 'Small fixed-price jobs and bookable idle capacity.', href: '/businesses/xpert' },
  { icon: 'trading', title: 'Business offers & XCHANGE', text: 'Franchises, dealerships, capacity — and barter or part-cash deals.', href: '/login?next=/business-offers' },
  { icon: 'verify', title: 'Proof passport', text: 'Verified delivery and payment history that buyers can check.', href: '/login?next=/proof' },
  { icon: 'bell', title: 'ACTION OS', text: 'One board for every follow-up, deadline and approval.', href: '/login?next=/action-os' },
  { icon: 'learning', title: 'Learning & certificates', text: 'Short courses with certificates partners can share.', href: '/businesses/unite-learning' },
];


export function PlatformGrid() {
  return (
    <ul className="cz-hx-bento">
      {PLATFORM.map((x) => (
        <li key={x.title} className={x.wide ? 'is-wide' : undefined}>
          <Link href={x.href}>
            {x.photo && <img src={`/photos/${x.photo}.webp`} alt="" aria-hidden loading="lazy" />}
            <span className="cz-hx-bento-ic"><Icon name={x.icon} size={20} /></span>
            <h3>{x.title}</h3>
            <p>{x.text}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
