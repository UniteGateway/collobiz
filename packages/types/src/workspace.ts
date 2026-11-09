/**
 * Unite Group workspace — one launcher for every business app on the shared COLLABIZ platform (one sign-in, one database,
 * one permission model, one audit log). Apps marked `planned` are delivered in later phases; `partial` apps work today
 * for part of the scope.
 */
export const APP_CATEGORIES = ['business', 'operations', 'communication', 'ai', 'integrations'] as const;
export const APP_CATEGORY_LABELS: Record<string, string> = { business: 'Business suite', operations: 'Operations', communication: 'Communication', ai: 'AI & analytics', integrations: 'Integrations' };
export type AppStatus = 'live' | 'partial' | 'planned';
export interface WorkspaceApp {
  key: string; name: string; category: (typeof APP_CATEGORIES)[number]; description: string; icon: string; tint: string;
  status: AppStatus; app?: 'admin' | 'web'; href?: string; phase?: string; note?: string;
}
/** Icon names come from @collabiz/ui ICONS. Tints are fixed per app family so the launcher reads at a glance. */
export const WORKSPACE_APPS: WorkspaceApp[] = [
  // Business suite
  { key: 'partners', name: 'Partner Network', category: 'business', description: 'Verified partners, onboarding and partner performance', icon: 'teams', tint: 'navy', status: 'live', app: 'admin', href: '/' },
  { key: 'ventures', name: 'Unite Businesses', category: 'business', description: 'All 47 Unite businesses and their promoters', icon: 'building', tint: 'green', status: 'live', app: 'admin', href: '/ventures' },
  { key: 'offers', name: 'Direct Offers', category: 'business', description: 'Work, products and markets offered to partners', icon: 'briefcase', tint: 'navy', status: 'live', app: 'admin', href: '/offers' },
  { key: 'crm', name: 'Sales & CRM', category: 'business', description: 'Leads, pipeline and protected introductions', icon: 'crm', tint: 'violet', status: 'live', app: 'web', href: '/crm/pipeline' },
  { key: 'projects', name: 'Projects & EPC', category: 'business', description: 'Solar EPC and infrastructure projects, milestones', icon: 'projects', tint: 'blue', status: 'live', app: 'web', href: '/projects' },
  { key: 'tenders', name: 'Tenders', category: 'business', description: 'Sealed bids, evaluation and awards', icon: 'tenders', tint: 'blue', status: 'live', app: 'admin', href: '/tenders' },
  { key: 'contracts', name: 'Contracts', category: 'business', description: 'Signed agreements with versions and signatures, kept in the document vault', icon: 'contracts', tint: 'slate', status: 'live', app: 'web', href: '/vault' },
  { key: 'finance', name: 'Finance & Accounting', category: 'business', description: 'Commission ledger and settlements today; full accounts with GST next', icon: 'earnings', tint: 'amber', status: 'partial', app: 'admin', href: '/finance', phase: 'C', note: 'Commission ledger, approvals and payouts are live. Chart of accounts, invoices, GST and bank reconciliation come in Phase C (through ERPNext).' },
  { key: 'hr', name: 'Human Resources', category: 'business', description: 'Employees, departments, attendance and leave', icon: 'users', tint: 'green', status: 'planned', phase: 'B', note: 'Phase B, connected to ERPNext HR.' },
  { key: 'payroll', name: 'Payroll', category: 'business', description: 'Salaries with PF, ESI, PT and TDS', icon: 'value', tint: 'green', status: 'planned', phase: 'B', note: 'Phase B, connected to ERPNext Payroll (Indian statutory rules).' },
  { key: 'compliance', name: 'Compliance & Legal', category: 'business', description: 'Verification, risk flags, audit trail', icon: 'verify', tint: 'teal', status: 'live', app: 'admin', href: '/risk' },
  { key: 'realestate', name: 'Real Estate & Property', category: 'business', description: 'Land, projects and property sales', icon: 'company', tint: 'amber', status: 'planned', phase: 'E' },
  // Operations
  { key: 'procurement', name: 'Procurement', category: 'operations', description: 'Requests for quotation and supplier trading', icon: 'package', tint: 'violet', status: 'partial', app: 'web', href: '/trading', phase: 'D', note: 'Trading requests and quotes are live. Purchase orders and vendor management come in Phase D.' },
  { key: 'catalogue', name: 'Product Catalogue', category: 'operations', description: 'Unite products and services offered to partners', icon: 'package', tint: 'blue', status: 'live', app: 'admin', href: '/catalogue' },
  { key: 'inventory', name: 'Inventory & Stores', category: 'operations', description: 'Stock, warehouses and material control', icon: 'package', tint: 'amber', status: 'planned', phase: 'D' },
  { key: 'manufacturing', name: 'Manufacturing', category: 'operations', description: 'Unite Powertek production and quality', icon: 'sector', tint: 'red', status: 'planned', phase: 'D' },
  { key: 'logistics', name: 'Logistics & Transport', category: 'operations', description: 'Shipments, fleet and delivery tracking', icon: 'map', tint: 'green', status: 'planned', phase: 'D' },
  { key: 'trade', name: 'Imports & Exports', category: 'operations', description: 'Global trade enquiries and country partners', icon: 'external', tint: 'blue', status: 'live', app: 'web', href: '/global' },
  { key: 'franchise', name: 'Franchise Management', category: 'operations', description: 'Franchise network, onboarding and operations', icon: 'location', tint: 'red', status: 'planned', phase: 'E' },
  { key: 'pos', name: 'Retail POS', category: 'operations', description: 'Store billing, stock and customers', icon: 'value', tint: 'slate', status: 'planned', phase: 'E' },
  { key: 'helpdesk', name: 'Helpdesk & Support', category: 'operations', description: 'Tickets, SLA and customer support', icon: 'help', tint: 'teal', status: 'live', app: 'web', href: '/support/tickets' },
  // Communication
  { key: 'meet', name: 'Meet', category: 'communication', description: 'Meetings, agendas, minutes and action items', icon: 'calendar', tint: 'blue', status: 'live', app: 'admin', href: '/workspace/meet', note: 'Live video needs a video provider (Jitsi or similar) to be connected.' },
  { key: 'connect', name: 'Connect', category: 'communication', description: 'Secure chat with colleagues and partners', icon: 'messages', tint: 'green', status: 'live', app: 'web', href: '/inbox' },
  { key: 'announcements', name: 'Announcements', category: 'communication', description: 'News for partners and staff', icon: 'bell', tint: 'amber', status: 'live', app: 'web', href: '/announcements' },
  { key: 'wiki', name: 'Content & Wiki', category: 'communication', description: 'Help pages, policies and knowledge base', icon: 'learning', tint: 'violet', status: 'partial', app: 'admin', href: '/cms', phase: 'E', note: 'Help pages and policies are live; an internal wiki comes in Phase E.' },
  { key: 'drive', name: 'Documents', category: 'communication', description: 'Files, documents and secure storage', icon: 'documents', tint: 'blue', status: 'partial', app: 'web', href: '/vault', phase: 'E', note: 'Company document vault is live; shared team drives come in Phase E.' },
  // AI & analytics
  { key: 'growth', name: 'Growth Desk', category: 'ai', description: 'AI campaign agents: leads, scoring and drafted outreach', icon: 'opportunities', tint: 'green', status: 'live', app: 'admin', href: '/growth' },
  { key: 'analytics', name: 'Analytics', category: 'ai', description: 'Group dashboards and trends', icon: 'crm', tint: 'violet', status: 'live', app: 'admin', href: '/analytics' },
  { key: 'ai', name: 'AI Governance', category: 'ai', description: 'AI switches, drafts and review', icon: 'info', tint: 'slate', status: 'live', app: 'admin', href: '/ai' },
  { key: 'pilot', name: 'Pilot Feedback', category: 'ai', description: 'What pilot partners say each week', icon: 'messages', tint: 'teal', status: 'live', app: 'admin', href: '/pilot' },
  { key: 'audit', name: 'Audit & Security', category: 'ai', description: 'Who did what, sign-ins and alerts', icon: 'audit', tint: 'red', status: 'live', app: 'admin', href: '/audit' },
];

export const COMPANY_CATEGORIES = ['parent', 'operating', 'manufacturing', 'infra', 'projects', 'jv', 'international', 'media', 'business', 'trade', 'fintech', 'allied'] as const;
export const COMPANY_CATEGORY_LABELS: Record<string, string> = {
  parent: 'Parent', operating: 'Operating', manufacturing: 'Manufacturing', infra: 'Infrastructure', projects: 'Projects', jv: 'Joint venture', international: 'International',
  media: 'Media', business: 'Business', trade: 'Trade', fintech: 'Fintech', allied: 'Associates',
};
/** Country names for the workspace (wider than the partner coverage list). */
export const WORLD_COUNTRIES: Record<string, string> = {
  IN: 'India', US: 'United States', GE: 'Georgia', AE: 'United Arab Emirates', SA: 'Saudi Arabia', GB: 'United Kingdom', SG: 'Singapore', KE: 'Kenya', NG: 'Nigeria', BD: 'Bangladesh', NP: 'Nepal', LK: 'Sri Lanka', XX: 'Global',
};
export const countryLabel = (c: string) => WORLD_COUNTRIES[c] ?? c;
