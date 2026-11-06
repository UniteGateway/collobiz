'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Alert } from '@collabiz/ui';
import { OnboardingProvider, STEP_META, useOnboarding } from '@/lib/onboarding';

function Progress() {
  const { status, locked } = useOnboarding();
  const path = usePathname();
  return (
    <nav aria-label="Onboarding steps" className="cz-card" style={{ marginBottom: 16, padding: 12 }}>
      <ol style={{ display: 'flex', flexWrap: 'wrap', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
        {STEP_META.map((s, i) => {
          const done = status?.steps.find((x) => x.step === s.step)?.complete;
          const href = s.href(status?.kind);
          const current = path === href;
          return (
            <li key={s.step}>
              <Link href={href} className="cz-chip" aria-current={current ? 'step' : undefined} style={{ display: 'inline-flex', gap: 6, background: current ? 'var(--cz-navy-100)' : undefined, textDecoration: 'none' }}>
                <span aria-hidden>{done ? '✅' : `${i + 1}.`}</span>{s.label}<span className="cz-sr-only">{done ? ' (complete)' : ''}</span>
              </Link>
            </li>
          );
        })}
        <li><Link href="/onboarding/status" className="cz-chip" style={{ textDecoration: 'none' }}>Review &amp; submit</Link></li>
      </ol>
      {locked && <div style={{ marginTop: 10 }}><Alert tone="info">Your application is with our compliance team. Editing is locked until review completes.</Alert></div>}
    </nav>
  );
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <OnboardingProvider><Progress />{children}</OnboardingProvider>;
}
