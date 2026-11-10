'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TradingTabs } from '@/components/Trading';

export const inr = (p: number | null | undefined) => (p == null ? '—' : `₹${Math.round(p / 100).toLocaleString('en-IN')}`);
const SUB: [string, string][] = [['/xchange', 'Marketplace'], ['/xchange/matches', 'Matches for you'], ['/xchange/deals', 'My exchanges']];
/** Trading tabs plus XCHANGE sections. */
export function XchangeNav() {
  const path = usePathname();
  return (
    <>
      <TradingTabs />
      <nav aria-label="XCHANGE sections" className="cz-segment" style={{ marginBottom: 4 }}>
        {SUB.map(([h, l]) => <Link key={h} href={h} aria-current={(h === '/xchange' ? path === h : path.startsWith(h)) ? 'page' : undefined}>{l}</Link>)}
      </nav>
    </>
  );
}
