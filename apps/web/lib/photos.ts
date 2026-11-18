/**
 * Royalty-free photography (Pexels License — free to use, no attribution required; IDs in public/photos/CREDITS.md).
 * Bundled with the app (no external requests), served as WebP.
 */
export const photo = (name: string) => `/photos/${name}.webp`;

/** Home dashboard hero by business domain. */
export const THEME_PHOTO: Record<string, string> = {
  energy: 'energy-installer', build: 'build-engineers', trade: 'trade-port', industry: 'industry-engineer', advisory: 'team-meeting', collabiz: 'team-handshake',
};

/** Page hero by module (menu key). */
export const MODULE_PHOTO: Record<string, string> = {
  collab: 'team-desk', 'business-offers': 'deal-handshake', opportunities: 'team-laptop', leads: 'person-laptop', collaboration: 'team-meeting',
  energy: 'energy-solar-field', 'unite-solar': 'energy-rooftop-install', powertek: 'energy-control-room', ventures: 'global-skyline', tenders: 'build-site-team', projects: 'build-engineers',
  trading: 'trade-warehouse', earnings: 'finance-analysis', global: 'trade-ship', growth: 'growth-seedling', help: 'office-open', community: 'team-startup',
  invest: 'property-tower', launch: 'team-startup', micro: 'person-laptop', capacity: 'trade-warehouse', pools: 'trade-port', commit: 'deal-handshake', books: 'finance-analysis', proof: 'team-handshake', 'action-os': 'team-boardroom', messages: 'office-loft', crm: 'person-laptop', franchise: 'property-solar-home', property: 'property-modern-house',
};

/** Programme tiles on Home. */
export const PROGRAMMES: { title: string; text: string; href: string; photo: string }[] = [
  { title: 'Unite Solar', text: 'Quote rooftop, EPC and PPA solar; franchise and store network.', href: '/unite-solar', photo: 'energy-panel-roof' },
  { title: 'Powertek products', text: '360+ power and solar products — anyone can sell and earn.', href: '/powertek', photo: 'energy-solar-field' },
  { title: 'Business offers', text: 'Share capacity, find partners, close collaborations.', href: '/business-offers', photo: 'deal-handshake' },
  { title: 'Tenders & projects', text: 'Bid together, deliver milestones, get paid on certification.', href: '/tenders', photo: 'build-site-team' },
  { title: 'Trade & XCHANGE', text: 'RFQs, purchase orders, barter and part-cash deals.', href: '/xchange', photo: 'trade-port' },
  { title: 'Energy marketplace', text: 'Unite Green Park — plants, buyers, delivered cost and licensed traders.', href: '/energy', photo: 'energy-wind-solar' },
];
