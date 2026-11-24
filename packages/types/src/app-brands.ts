/**
 * Brand and feature data for Unite apps (presentation only). Logos are the selected artwork from the Unite Master Concept
 * Portfolio (Part 1) and the BIZO brochure; features come from each concept's highlights and suggested add-ons. Apps
 * without supplied artwork use a lettered mark. Prices shown for BIZO are the brochure's indicative figures.
 */
/** `planned` marks a feature that is on the roadmap, not yet built; pages label it "Planned". */
export interface AppFeature { title: string; text: string; icon: string; planned?: boolean; /** Page on the business's own website that explains this feature. */ href?: string }
export interface AppBrand {
  logo?: string; mark?: string; accent: [string, string]; website?: string;
  /** Wide brand artwork (used as the page hero) when there is no standalone logo. */
  artwork?: string;
  features: AppFeature[]; workflow?: { title: string; text: string }[];
  plans?: { name: string; price: string; per: string; text: string; featured?: boolean }[]; planNote?: string;
  integration?: { status: 'not_connected' | 'link_only' | 'connected'; text: string };
  /** The business's own application: sign-in and sign-up addresses. */
  app?: { login: string; signup: string };
  /** COLLABIZ sector → the page on the business's website for that industry. */
  industryPages?: Record<string, string>;
}

import { PORTFOLIO_BRANDS } from './app-brands-portfolio';

const f = (title: string, text: string, icon = 'check'): AppFeature => ({ title, text, icon });

export const APP_BRANDS: Record<string, AppBrand> = {
  bizo: {
    logo: '/brands/bizo.png', mark: '/brands/bizo-mark.png', accent: ['#0E7BF0', '#19D3C5'], website: 'https://bizo.one',
    app: { login: 'https://leaddna.bizo.one/', signup: 'https://leaddna.bizo.one/?signup=1' },
    features: [
      { ...f('Opportunity discovery', 'Find tenders, buyers and projects that match your Business DNA.', 'search'), href: 'https://bizo.one/solutions/opportunity-discovery' },
      { ...f('Global buyer intelligence', 'Importers, distributors and buyers by country, with available public contacts and shipment evidence where licensed.', 'globe'), href: 'https://bizo.one/solutions/global-buyers' },
      { ...f('Market intelligence', 'Import demand, country rankings, competitor markets and price context from official trade data.', 'chart'), href: 'https://bizo.one/solutions/market-intelligence' },
      { ...f('Business verification', 'Check a company before you work with it.', 'shield'), href: 'https://bizo.one/solutions/business-verification' },
      { ...f('Personal AI Growth Agent', 'Research briefs, prioritised opportunities, weekly alerts and recommended actions — drafts wait for your approval.', 'sparkle'), href: 'https://bizo.one/solutions/ai-growth-agent' },
      { ...f('CRM and deal management', 'Leads, pipeline, tasks, quotations and reports in one workspace.', 'grid'), href: 'https://bizo.one/solutions/crm' },
      { ...f('AI proposal studio', 'Branded proposals and quotations.', 'doc'), href: 'https://bizo.one/solutions/proposal-studio' },
      { ...f('Outreach and AI client chatbot', 'Approved email outreach and a supervised chatbot for inbound enquiries.', 'people'), href: 'https://bizo.one/solutions/outreach' },
      { ...f('Automation and analytics', 'Automations and dashboards that adapt to your industry.', 'clock'), href: 'https://bizo.one/solutions/automation' },
    ],
    workflow: [
      { title: 'Register your company', text: 'Website, sector, products and business objectives.' },
      { title: 'BIZO understands', text: 'AI reviews your business profile and suggests ideal customers.' },
      { title: 'Your dashboard appears', text: 'Relevant tools, pipeline stages and research widgets.' },
      { title: 'Research begins', text: 'Connected sources help identify relevant opportunities.' },
      { title: 'Your team converts', text: 'Qualify prospects, approve outreach and manage deals — and move leads between BIZO and COLLABIZ.' },
    ],
    industryPages: {
      solar: 'https://bizo.one/industries/solar', power_equipment: 'https://bizo.one/industries/solar', manufacturing: 'https://bizo.one/industries/manufacturing', construction_epc: 'https://bizo.one/industries/construction',
      infrastructure: 'https://bizo.one/industries/construction', real_estate: 'https://bizo.one/industries/real-estate', trading: 'https://bizo.one/industries/trade', logistics: 'https://bizo.one/industries/logistics',
      technology: 'https://bizo.one/industries/it', education: 'https://bizo.one/industries/education', agri_food: 'https://bizo.one/industries/trade', local_commerce: 'https://bizo.one/industries/trade',
    },
    integration: { status: 'connected', text: 'Leads move between BIZO and the COLLABIZ CRM today: export from BIZO and import into COLLABIZ, or download your COLLABIZ customers in a BIZO-ready file. Single sign-on and automatic sync follow when BIZO’s public API launches (planned by BIZO).' },
  },
  roofz: { logo: '/brands/roofz.png', accent: ['#E11D2E', '#111827'], features: [
    f('Roof-rights checklist', 'Document checklist for ownership and roof rights before listing.', 'doc'), f('Structural review status', 'Track structural assessment before any use is offered.', 'shield'),
    f('Map search', 'Find assessed roofs by area and suitable use.', 'map'), f('Agreement milestones', 'Sale, rent, lease or joint-development milestones in one place.', 'flag'),
    f('Income scenarios', 'Compare realistic uses: solar, advertising, telecom, urban farming.', 'chart')] },
  ugrow: { logo: '/brands/ugrow.png', accent: ['#0B3B8C', '#16A34A'], features: [
    f('Cohort applications', 'Structured applications for funded programme cohorts.', 'doc'), f('Milestone disbursement records', 'Support released against business milestones.', 'flag'),
    f('Mentor matching', 'Match entrepreneurs with mentors and sponsors.', 'people'), f('Cash-flow diary', 'Simple business cash-flow records for participants.', 'chart'),
    f('Sponsor outcome dashboard', 'Transparent outcomes for programme sponsors.', 'grid')] },
  zuppo: { logo: '/brands/zuppo.png', accent: ['#F97316', '#1F2937'], features: [
    f('Live spending approvals', 'Approve each purchase on live video before the shopper pays.', 'check'), f('Receipt reconciliation', 'Every receipt matched to what was approved.', 'doc'),
    f('Time estimates', 'Know how long the shopping trip will take.', 'clock'), f('Shopper identity checks', 'Verified personal shoppers only.', 'shield'),
    f('Complaints and returns', 'A clear path for returns and issues.', 'flag')] },
  socpost: { logo: '/brands/socpost.png', accent: ['#2563EB', '#C026D3'], features: [
    f('Brand voice library', 'Keep every post in your brand’s voice.', 'sparkle'), f('Regional-language drafts', 'Drafts in the languages your customers use.', 'globe'),
    f('Campaign templates', 'Reusable campaigns for recurring promotions.', 'grid'), f('Client approval links', 'Agencies get client sign-off before publishing.', 'check'),
    f('Publishing-failure alerts', 'Know when a scheduled post did not go out.', 'bell')] },
  sunite: { logo: '/brands/sunite.png', accent: ['#0F2A4A', '#F59E0B'], features: [
    f('Shared project ID', 'One project record from lead to maintenance.', 'flag'), f('Approved equipment catalogue', 'Design and quote only from approved equipment.', 'grid'),
    f('Quotation versioning', 'Every revision kept and compared.', 'doc'), f('Offline survey capture', 'Site surveys captured without signal.', 'map'),
    f('Milestones and commissioning', 'EPC milestones through commissioning and O&M.', 'check')] },
  wakin: { logo: '/brands/wakin.png', accent: ['#F97316', '#1E3A5F'], features: [
    f('Verified vacancy expiry', 'Stale vacancies close automatically.', 'clock'), f('Queue estimates', 'Candidates see their wait for a live interview.', 'people'),
    f('Interview reminders', 'Reminders for both candidates and employers.', 'bell'), f('Accessible candidate profiles', 'Profiles that work for every candidate.', 'shield'),
    f('Offer-to-joining tracking', 'Follow each offer through to joining.', 'flag')] },
  prizo: { logo: '/brands/prizo.png', accent: ['#1E3A8A', '#F97316'], features: [
    f('Comparable landed prices', 'Compare quotes on the full delivered price.', 'chart'), f('Seller response deadlines', 'Sellers reply within a set time.', 'clock'),
    f('Warranty comparison', 'Warranty terms side by side.', 'shield'), f('Audit trail', 'Every request, quote and approval recorded.', 'doc'),
    f('Buyer approves every purchase', 'The AI negotiates within limits; sellers keep control of their prices.', 'check')] },
  'nano-bazar': { logo: '/brands/nano-bazar.png', accent: ['#1E3A5F', '#D97706'], features: [
    f('Easy catalogue import', 'Get a shop online in minutes.', 'grid'), f('Stock availability', 'Show what is in stock today.', 'check'),
    f('Delivery-area settings', 'Merchants choose where they deliver.', 'map'), f('Merchant verification', 'Verified local sellers.', 'shield'),
    f('Local-language ordering', 'Order in the customer’s language.', 'globe')] },
  'goodtime-live': { logo: '/brands/goodtime-live.png', accent: ['#1D4ED8', '#F97316'], features: [
    f('Language and interest matching', 'Volunteers matched by language and interests.', 'people'), f('Scheduled calls', 'Regular, reliable conversations.', 'clock'),
    f('Volunteer orientation', 'Trained volunteers only.', 'shield'), f('Accessibility settings', 'Designed for elderly users.', 'check'),
    f('Coordinator support', 'Community organisations stay in the loop.', 'flag')] },
  leaddna: { logo: '/brands/leaddna.png', accent: ['#0F2A4A', '#14B8A6'], features: [
    f('Source and freshness labels', 'Know where every lead came from and when.', 'doc'), f('Duplicate detection', 'One record per company and contact.', 'check'),
    f('Account-level scoring', 'Prioritise the accounts most likely to convert.', 'chart'), f('Outreach approval queue', 'People approve outreach before it is sent.', 'shield'),
    f('Pipeline handover', 'Qualified leads flow into the sales pipeline.', 'flag')] },
  'ai-teacher': { logo: '/brands/ai-teacher.png', accent: ['#111827', '#6366F1'], features: [
    f('Live teaching', 'Interactive lessons with board and voice.', 'sparkle'), f('Choose teacher and language', 'Selectable teacher appearance and language.', 'globe'),
    f('Lesson-content review', 'Lesson content reviewed before use.', 'shield'), f('Mastery records', 'Progress tracked topic by topic.', 'chart'),
    f('Human help', 'Escalate to a human teacher any time.', 'people')] },
};

/** Brand data for a business: hand-written entries first, then the concept-portfolio entries. */
export function appBrand(slug: string): AppBrand | undefined { return APP_BRANDS[slug] ?? PORTFOLIO_BRANDS[slug]; }
