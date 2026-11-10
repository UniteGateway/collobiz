'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LEAD_STEPS } from '@/lib/leadDraft';

export function LeadSteps() {
  const path = usePathname();
  return (
    <nav aria-label="Lead registration steps" className="cz-tabs">
      {LEAD_STEPS.map((s) => <Link key={s.href} href={s.href} aria-current={path === s.href ? 'page' : undefined}>{s.label}</Link>)}
    </nav>
  );
}

export function LeadTabs({ id }: { id: string }) {
  const path = usePathname();
  const tabs = [['', 'Overview'], ['/review-status', 'Unite review'], ['/documents', 'Documents'], ['/duplicates', 'Duplicate check'], ['/certificate', 'Protection certificate'], ['/passport', 'Deal Passport'], ['/registration-certificate', 'Registration certificate'], ['/timeline', 'Timeline']];
  return (
    <nav aria-label="Lead sections" className="cz-tabs">
      {tabs.map(([p, l]) => <Link key={p} href={`/leads/${id}${p || '/confirmation'}`} aria-current={path === `/leads/${id}${p || '/confirmation'}` ? 'page' : undefined}>{l}</Link>)}
    </nav>
  );
}
