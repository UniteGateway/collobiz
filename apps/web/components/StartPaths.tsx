/** The four reasons people come to COLLABIZ — one clear door each (home page and /start). */
import Link from 'next/link';
import { Icon, type IconName } from '@collabiz/ui';

export const START_PATHS: { key: string; icon: IconName; title: string; who: string; text: string; examples: string; href: string; cta: string }[] = [
  { key: 'buy', icon: 'package', title: 'Buy from Unite', who: 'Homes, shops, factories, builders', text: 'Get a solar quote, buy Unite products, book a property visit or use any Unite business.', examples: 'Solar for your roof · Unite Cement & Steel · Property · Courses', href: '/businesses', cta: 'Explore Unite businesses' },
  { key: 'sell', icon: 'briefcase', title: 'Sell Unite products', who: 'Dealers, distributors, stores, franchises', text: 'Become a Unite distributor, dealer, store or franchise in your area — or manufacture for the Unite brand.', examples: 'Cement · Steel · Ply · Carpets · Furniture · Solar', href: '/partner-with-unite', cta: 'Find my fit and apply' },
  { key: 'grow', icon: 'teams', title: 'Grow my business', who: 'Any industry, anywhere', text: 'Join the Unite Industry Club free: buy green power, sell under the Unite brand, find buyers, barter, trade and export.', examples: 'Your own board with matched opportunities', href: '/join', cta: 'Join the Industry Club' },
  { key: 'earn', icon: 'earnings', title: 'Earn as a partner', who: 'Consultants, agents, EPC companies', text: 'Introduce customers to Unite and other members. Your introduction is protected and your commission is tracked until it is paid.', examples: 'Protected leads · Tenders · Teams · Commissions', href: '/signup', cta: 'Create a partner account' },
];

export function StartPaths({ compact }: { compact?: boolean }) {
  return (
    <ul className={`cz-start${compact ? ' is-compact' : ''}`} aria-label="Ways to use COLLABIZ">
      {START_PATHS.map((p) => (
        <li key={p.key} data-path={p.key}>
          <span className="cz-start-ic"><Icon name={p.icon} size={24} /></span>
          <h3>{p.title}</h3>
          <p className="cz-start-who">{p.who}</p>
          <p>{p.text}</p>
          {!compact && <p className="cz-start-ex">{p.examples}</p>}
          <Link className="cz-btn cz-btn-primary" href={p.href}>{p.cta}<Icon name="arrow" size={15} /></Link>
        </li>
      ))}
    </ul>
  );
}
