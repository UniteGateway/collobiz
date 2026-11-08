/**
 * Partner information architecture (audit §3.2). Task-based primary destinations with icons; each module's secondary
 * screens are reachable through module tabs on the page. Replaces the registry-generated sidebar.
 */
import type { IconName, NavSection } from '@collabiz/ui';
import type { Me } from './session';

export interface Module { key: string; label: string; icon: IconName; home: string; tabs?: [string, string][]; ownTabs?: boolean; match: string[] }

export const MODULES: Module[] = [
  { key: 'home', label: 'Home', icon: 'home', home: '/dashboard', match: ['/dashboard'] },
  { key: 'opportunities', label: 'Opportunities', icon: 'opportunities', home: '/marketplace', match: ['/marketplace', '/opportunities', '/my/opportunities', '/feed', '/rfq'],
    tabs: [['/marketplace', 'All'], ['/marketplace/unite', 'Unite Group'], ['/marketplace/exchange', 'Partner exchange'], ['/feed', 'Recommended'], ['/my/opportunities', 'My applications'], ['/marketplace/saved', 'Saved & alerts'], ['/marketplace/categories', 'Categories'], ['/marketplace/map', 'Map']] },
  { key: 'leads', label: 'Leads & CRM', icon: 'leads', home: '/my/leads', match: ['/my/leads', '/leads', '/crm', '/tasks', '/activity', '/lead-protection', '/lead-disputes'],
    tabs: [['/my/leads', 'My leads'], ['/crm/pipeline', 'Pipeline'], ['/tasks', 'Tasks'], ['/activity', 'Activity'], ['/lead-protection', 'Protection'], ['/lead-disputes', 'Disputes']] },
  { key: 'collaboration', label: 'Collaboration', icon: 'teams', home: '/teams', match: ['/teams', '/partners', '/collaboration', '/consortiums'],
    tabs: [['/teams', 'My teams'], ['/collaboration/requests', 'Requests'], ['/partners/find', 'Find partners'], ['/partners/ai-matches', 'AI matches'], ['/partners', 'Directory'], ['/consortiums', 'Consortiums']] },
  { key: 'tenders', label: 'Tenders', icon: 'tenders', home: '/tenders', match: ['/tenders'], ownTabs: true },
  { key: 'projects', label: 'Projects', icon: 'projects', home: '/projects', match: ['/projects'], ownTabs: true },
  { key: 'trading', label: 'Trading', icon: 'trading', home: '/trading', match: ['/trading'], ownTabs: true },
  { key: 'earnings', label: 'Earnings', icon: 'earnings', home: '/earnings', match: ['/earnings', '/commissions', '/payouts', '/payments', '/tax-records', '/finance'], ownTabs: true },
  { key: 'documents', label: 'Documents', icon: 'documents', home: '/vault', match: ['/vault'] },
  { key: 'account', label: 'Account', icon: 'settings', home: '/profile', match: ['/profile', '/company', '/settings'],
    tabs: [['/profile', 'Profile'], ['/company/team', 'Company & team'], ['/settings/security', 'Security'], ['/settings/privacy', 'Privacy & data']] },
];

export function moduleFor(path: string) {
  return MODULES.map((m) => ({ m, len: Math.max(...m.match.map((p) => (path === p || path.startsWith(p + '/') ? p.length : -1))) })).filter((x) => x.len >= 0).sort((a, b) => b.len - a.len)[0]?.m ?? null;
}

export function partnerNav(me: Me | null, counts: { alerts?: number } = {}): NavSection[] {
  const verified = me?.activeOrg?.verificationStatus === 'verified';
  const sections: NavSection[] = [];
  if (me?.activeOrg && !verified) sections.push({ title: 'Get started', items: [{ href: '/onboarding/status', label: 'Complete verification', icon: 'verify' }] });
  if (!me?.activeOrg) sections.push({ title: 'Get started', items: [{ href: '/onboarding/account-type', label: 'Create partner account', icon: 'verify' }] });
  const work = MODULES.filter((m) => !['account', 'documents'].includes(m.key)).map((m) => ({ href: m.home, label: m.label, icon: m.icon, count: m.key === 'home' ? undefined : undefined }));
  sections.push({ title: 'Workspace', items: work });
  if (me?.capabilities.includes('commission.approve')) sections.push({ title: 'Finance', items: [{ href: '/commissions/approvals', label: 'Commission approvals', icon: 'verify' }] });
  sections.push({ title: 'Account', items: [{ href: '/vault', label: 'Documents', icon: 'documents' }, { href: '/profile', label: 'Settings', icon: 'settings' }, { href: '/support/contact', label: 'Help & support', icon: 'help' }] });
  void counts;
  return sections;
}
