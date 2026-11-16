/**
 * Partner information architecture (audit §3.2). Task-based primary destinations with icons; each module's secondary
 * screens are reachable through module tabs on the page. Replaces the registry-generated sidebar.
 */
import type { IconName, NavSection } from '@collabiz/ui';
import type { Me } from './session';

export interface Module { key: string; label: string; icon: IconName; home: string; tabs?: [string, string][]; ownTabs?: boolean; match: string[] }

export const MODULES: Module[] = [
  { key: 'home', label: 'Home', icon: 'home', home: '/dashboard', match: ['/dashboard'] },
  { key: 'collab', label: 'Collab', icon: 'teams', home: '/collab', match: ['/collab'], tabs: [['/collab', 'Find collaborations'], ['/collab/workspace', 'My collaborations']] },
  { key: 'business-offers', label: 'Business Offers', icon: 'briefcase', home: '/business-offers', match: ['/business-offers'], tabs: [['/business-offers', 'Browse'], ['/business-offers/new', 'Publish'], ['/business-offers/mine', 'My offers']] },
  { key: 'opportunities', label: 'Opportunities', icon: 'opportunities', home: '/marketplace', match: ['/marketplace', '/opportunities', '/my/opportunities', '/feed', '/rfq', '/ai/matching', '/offers', '/one', '/radar'],
    tabs: [['/marketplace', 'Browse'], ['/one', 'COLLABIZ ONE'], ['/radar', 'Radar'], ['/offers', 'Offers for you'], ['/ai/matching', 'AI matches'], ['/feed', 'Recommended'], ['/my/opportunities', 'My applications'], ['/marketplace/saved', 'Saved & alerts'], ['/marketplace/categories', 'Categories'], ['/marketplace/map', 'Map']] },
  { key: 'leads', label: 'Leads & CRM', icon: 'leads', home: '/my/leads', match: ['/my/leads', '/leads', '/crm', '/tasks', '/activity', '/lead-protection', '/lead-disputes', '/passports', '/resolution'],
    tabs: [['/my/leads', 'My leads'], ['/crm/pipeline', 'Pipeline'], ['/tasks', 'Tasks'], ['/activity', 'Activity'], ['/lead-protection', 'Protection'], ['/lead-disputes', 'Disputes'], ['/passports', 'Shared passports'], ['/resolution', 'All disputes']] },
  { key: 'collaboration', label: 'Teams & partners', icon: 'teams', home: '/teams', match: ['/teams', '/partners', '/collaboration', '/consortiums', '/ai/partners', '/ai/team-builder', '/ai/team-plans'],
    tabs: [['/teams', 'My teams'], ['/collaboration/requests', 'Requests'], ['/partners/find', 'Find partners'], ['/ai/partners', 'Recommended partners'], ['/ai/team-builder', 'Team builder'], ['/ai/team-plans', 'Team plans'], ['/partners', 'Directory'], ['/consortiums', 'Consortiums']] },
  { key: 'unite-solar', label: 'Unite Solar', icon: 'value', home: '/unite-solar/my', match: ['/unite-solar'],
    tabs: [['/unite-solar', 'Franchise plans'], ['/unite-solar/apply', 'Become a partner'], ['/unite-solar/my', 'My franchise'], ['/unite-solar/catalogue', 'Product catalogue'], ['/unite-solar/sales', 'Sales & orders'], ['/unite-solar/inventory', 'Inventory'], ['/unite-solar/earnings', 'Earnings'], ['/unite-solar/marketing', 'Marketing & training'], ['/unite-solar/support', 'Support']] },
  { key: 'powertek', label: 'Powertek products', icon: 'package', home: '/powertek', match: ['/powertek'], tabs: [['/powertek', 'All products'], ['/powertek/enquiries', 'My enquiries']] },
  { key: 'ventures', label: 'Unite businesses', icon: 'building', home: '/ventures', match: ['/ventures', '/solar', '/franchise', '/property', '/store/redeem'],
    tabs: [['/ventures', 'Businesses'], ['/solar', 'Solar desk'], ['/franchise', 'Franchise'], ['/property', 'Property sales']] },
  { key: 'action-os', label: 'Action board', icon: 'bell', home: '/action-os', match: ['/action-os'],
    tabs: [['/action-os', 'My action board'], ['/action-os/plans', 'Plans'], ['/action-os/settings', 'Schedule & channels']] },
  { key: 'community', label: 'Community', icon: 'teams', home: '/community', match: ['/community'] },
  { key: 'invest', label: 'Invest together', icon: 'building', home: '/invest', match: ['/invest'] },
  { key: 'messages', label: 'Messages', icon: 'messages', home: '/inbox', match: ['/inbox', '/chat', '/meetings', '/announcements', '/notifications'],
    tabs: [['/inbox', 'Inbox'], ['/meetings', 'Meetings'], ['/announcements', 'Announcements'], ['/notifications', 'Notifications']] },
  { key: 'tenders', label: 'Tenders', icon: 'tenders', home: '/tenders', match: ['/tenders'], ownTabs: true },
  { key: 'projects', label: 'Projects', icon: 'projects', home: '/projects', match: ['/projects', '/packages'], ownTabs: true },
  { key: 'trading', label: 'Trading', icon: 'trading', home: '/trading', match: ['/trading', '/xchange'], ownTabs: true },
  { key: 'earnings', label: 'Earnings', icon: 'earnings', home: '/earnings', match: ['/earnings', '/commissions', '/payouts', '/payments', '/tax-records', '/finance', '/gst'], ownTabs: true },
  { key: 'global', label: 'Global', icon: 'map', home: '/global', match: ['/global', '/alliances', '/data-room'],
    tabs: [['/global', 'Markets'], ['/global/import-export', 'Import & export'], ['/global/compliance', 'Compliance'], ['/alliances', 'Alliances'], ['/global/country-partner', 'Country partner'], ['/global/territory', 'My territory']] },
  { key: 'growth', label: 'Performance', icon: 'award', home: '/performance', match: ['/performance', '/reputation', '/learning', '/certificates', '/resources'],
    tabs: [['/performance', 'Scorecard'], ['/reputation/reviews', 'Reviews'], ['/reputation/excellence', 'Next level'], ['/learning', 'Learning'], ['/certificates', 'Certificates'], ['/resources', 'Marketing'], ['/resources/social', 'Social posts'], ['/resources/brochure', 'Brochure']] },
  { key: 'documents', label: 'Documents', icon: 'documents', home: '/vault', match: ['/vault', '/contracts'] },
  { key: 'account', label: 'Account', icon: 'settings', home: '/profile', match: ['/profile', '/company', '/settings'],
    tabs: [['/profile', 'Profile'], ['/company/team', 'Company & team'], ['/settings/capacity', 'Capacity'], ['/settings/notifications', 'Notifications'], ['/settings/regional', 'Language & region'], ['/settings/security', 'Security'], ['/settings/privacy', 'Privacy & data'], ['/settings/plan', 'Plan'], ['/settings/tax', 'Tax profile'], ['/settings/import', 'Import data']] },
  { key: 'help', label: 'Help & support', icon: 'help', home: '/help', match: ['/help', '/support'], tabs: [['/help', 'Help & feedback'], ['/help/pilot', 'Pilot check-in'], ['/support/tickets', 'Support tickets']] },
];

export function moduleFor(path: string) {
  return MODULES.map((m) => ({ m, len: Math.max(...m.match.map((p) => (path === p || path.startsWith(p + '/') ? p.length : -1))) })).filter((x) => x.len >= 0).sort((a, b) => b.len - a.len)[0]?.m ?? null;
}

export function partnerNav(me: Me | null, counts: { alerts?: number } = {}): NavSection[] {
  const verified = me?.activeOrg?.verificationStatus === 'verified';
  const sections: NavSection[] = [];
  if (me?.activeOrg && !verified) sections.push({ title: 'Get started', items: [{ href: '/onboarding/status', label: 'Complete verification', icon: 'verify' }] });
  if (!me?.activeOrg) sections.push({ title: 'Get started', items: [{ href: '/onboarding/account-type', label: 'Create partner account', icon: 'verify' }] });
  // Modules grouped by what partners do; each module's own pages appear as an expandable sub-menu.
  const byKey = Object.fromEntries(MODULES.map((m) => [m.key, m]));
  const item = (k: string) => { const m = byKey[k]; return { href: m.home, label: m.label, icon: m.icon, children: m.tabs?.filter(([h]) => h !== m.home).map(([href, label]) => ({ href, label })) }; };
  const GROUPS: [string, string[]][] = [
    ['Grow your business', ['collab', 'business-offers', 'opportunities', 'leads', 'collaboration']],
    ['Unite programmes', ['unite-solar', 'powertek', 'invest', 'ventures']],
    ['Deliver & trade', ['tenders', 'projects', 'trading']],
    ['Money', ['earnings']],
    ['Network & growth', ['community', 'messages', 'global', 'growth']],
  ];
  sections.push({ items: [item('home'), item('action-os')] });
  for (const [title, keys] of GROUPS) sections.push({ title, collapsible: true, items: keys.filter((k) => byKey[k]).map(item) });
  if (me?.capabilities.includes('commission.approve')) sections.push({ title: 'Finance', items: [{ href: '/commissions/approvals', label: 'Commission approvals', icon: 'verify' }] });
  sections.push({ title: 'Account', collapsible: true, items: [{ href: '/library', label: 'Catalogues & documents', icon: 'package' }, { href: '/vault', label: 'My documents', icon: 'documents' }, { href: '/profile', label: 'Settings', icon: 'settings' }, { href: '/help', label: 'Help & support', icon: 'help' }] });
  void counts;
  return sections;
}
