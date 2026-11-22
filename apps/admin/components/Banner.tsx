'use client';
/** Admin page header on a photo band. Photos: Pexels licence (see /photos/CREDITS.md). */
import { usePathname } from 'next/navigation';
import { PageHeader } from '@collabiz/ui';

const ADMIN_PHOTO: [string, string][] = [['/verification', 'team-handshake'], ['/finance', 'finance-analysis'], ['/billing', 'finance-report'], ['/reconciliation', 'finance-report'], ['/bank-statements', 'finance-report'],
  ['/commission-policy', 'finance-charts'], ['/analytics', 'finance-charts'], ['/growth', 'finance-charts'], ['/energy', 'energy-solar-field'], ['/tender', 'build-site-team'], ['/ventures', 'global-skyline'], ['/group-companies', 'global-skyline'],
  ['/country-partners', 'global-skyline'], ['/users', 'tech-data'], ['/audit', 'tech-data'], ['/risk', 'tech-data'], ['/integrations', 'tech-data'], ['/ai', 'tech-data'], ['/business-offers', 'deal-handshake'], ['/offers', 'deal-handshake'],
  ['/opportunities', 'deal-handshake'], ['/routing', 'deal-handshake'], ['/lead-conflicts', 'deal-handshake'], ['/resolution', 'team-boardroom'], ['/reputation-appeals', 'team-boardroom'], ['/cms', 'team-desk'], ['/catalogue', 'team-desk'],
  ['/pilot', 'team-desk'], ['/sla', 'team-desk'], ['/workspace/solar', 'energy-panel-roof'], ['/workspace/franchise', 'team-handshake'], ['/workspace/property', 'global-skyline']];
export const adminPhoto = (path: string) => ADMIN_PHOTO.filter(([p]) => path === p || path.startsWith(p + '/') || path.startsWith(p + '-')).sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? 'team-boardroom';

export function BannerHeader(props: React.ComponentProps<typeof PageHeader>) {
  const path = usePathname();
  return <div className="cz-hero cz-hero-photo cz-hero-compact" data-palette="navy"><img className="cz-hero-img" src={`/photos/${adminPhoto(path)}.webp`} alt="" aria-hidden /><PageHeader {...props} /></div>;
}
