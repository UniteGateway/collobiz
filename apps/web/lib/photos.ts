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

/** Banner photo for pages outside a module (or in a module without its own photo), by path prefix. Longest prefix wins. */
export const PATH_PHOTO: [string, string][] = [
  ['/profile', 'office-open'], ['/company', 'team-boardroom'], ['/settings', 'office-open'], ['/onboarding', 'team-handshake'], ['/verify', 'team-handshake'],
  ['/vault', 'finance-report'], ['/library', 'finance-report'], ['/documents', 'finance-report'], ['/inbox', 'office-loft'], ['/messages', 'office-loft'], ['/chat', 'office-loft'],
  ['/notifications', 'office-loft'], ['/announcements', 'office-loft'], ['/meetings', 'team-boardroom'], ['/search', 'tech-data'], ['/help', 'office-open'], ['/support', 'office-open'],
  ['/community', 'team-startup'], ['/teams', 'team-meeting'], ['/partners', 'team-handshake'], ['/consortiums', 'team-boardroom'], ['/xchange', 'trade-warehouse-team'],
  ['/learning', 'team-laptop'], ['/certificates', 'team-laptop'], ['/resources', 'team-desk'], ['/performance', 'growth-green-energy'], ['/reputation', 'growth-green-energy'],
  ['/finance', 'finance-charts'], ['/commissions', 'finance-analysis'], ['/earnings', 'finance-analysis'], ['/contracts', 'deal-signing'], ['/leads', 'person-laptop'],
  ['/crm', 'person-laptop'], ['/global', 'global-city'], ['/workspace', 'team-desk'], ['/apps', 'tech-data'], ['/ai', 'tech-data'], ['/erp', 'finance-report'],
  ['/solar', 'energy-rooftop-install'], ['/franchise', 'property-solar-home'], ['/property', 'property-modern-house'], ['/rfq', 'trade-warehouse'], ['/packages', 'build-site-team'],
  ['/proof', 'team-handshake'], ['/business-qr', 'team-handshake'], ['/store', 'trade-warehouse'],
];
export function bannerPhoto(path: string, moduleKey?: string): string {
  if (moduleKey && MODULE_PHOTO[moduleKey]) return MODULE_PHOTO[moduleKey];
  const hit = PATH_PHOTO.filter(([pre]) => path === pre || path.startsWith(pre + '/')).sort((a, b) => b[0].length - a[0].length)[0];
  return hit ? hit[1] : 'office-open';
}
