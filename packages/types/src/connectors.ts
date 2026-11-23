/**
 * Wave 3 — the 17 Unite businesses that were "link only" now run on a COLLABIZ module:
 *  - the product page shows LIVE data from that module (items that are already public in COLLABIZ, or counts only);
 *  - a visitor's request can point at a specific item and is routed to the business AND the item's owner (introduction
 *    only — the visitor's contact details go to the business team, never to the item owner);
 *  - members get a direct action in the module.
 * Item-level feeds show only what the module already shows to the public or members: no owner names, no prices that
 * are not published, nothing marked confidential.
 */
export type ConnectorFeed =
  | { kind: 'capacity'; types: readonly string[] }
  | { kind: 'offers' }
  | { kind: 'energy' }
  | { kind: 'powertek'; keywords: readonly string[] }
  | { kind: 'micro' }
  | { kind: 'community'; topics: readonly string[] }
  | { kind: 'announcements' }
  | { kind: 'actions' }
  | { kind: 'meetings' }
  | { kind: 'storefronts' }
  | { kind: 'register'; intents: readonly string[] };

export interface Connector { module: string; feed: ConnectorFeed; text: string; itemPrompt?: string; member: { label: string; href: string } }

export const CONNECTORS: Record<string, Connector> = {
  'ev-saathi': { module: 'Capacity calendar', feed: { kind: 'capacity', types: ['vehicles', 'workers'] }, text: 'Vehicles and drivers members have published as bookable capacity, live.', itemPrompt: 'Ask about this vehicle or driver', member: { label: 'Publish a vehicle or driver', href: '/capacity' } },
  elwin: { module: 'Capacity calendar', feed: { kind: 'capacity', types: ['vehicles', 'machines'] }, text: 'Electric vehicles, chargers and service equipment available for booking, live.', itemPrompt: 'Ask about this', member: { label: 'Publish charging or fleet capacity', href: '/capacity' } },
  socpost: { module: 'Business offers', feed: { kind: 'offers' }, text: 'Live member offers that SOCPOST campaigns can promote.', itemPrompt: 'Promote or ask about this offer', member: { label: 'Publish an offer to promote', href: '/business-offers/new' } },
  prizo: { module: 'Business offers', feed: { kind: 'offers' }, text: 'Live deals and offers from verified members.', itemPrompt: 'Ask about this deal', member: { label: 'Publish a deal', href: '/business-offers/new' } },
  'unite-biofix': { module: 'Bio-energy register', feed: { kind: 'register', intents: ['feedstock', 'host_land', 'offtake_cbg', 'offtake_fom', 'offtake_h2', 'partner'] }, text: 'Feedstock, land and buyers registered for Bio-CNG and green hydrogen projects — totals update as people register here or through the Unite Industry Club.', member: { label: 'Buy Bio-CNG or green hydrogen (Industry Club)', href: '/club/power' } },
  'unite-aqua': { module: 'Powertek products', feed: { kind: 'powertek', keywords: ['aqua', 'fish', 'feed', 'pump', 'aerat', 'water', 'container'] }, text: 'Aquaculture and water equipment from the Unite Powertek catalogue, live.', itemPrompt: 'Ask about this product', member: { label: 'Sell Powertek products', href: '/powertek' } },
  wakin: { module: 'Micro-contracts', feed: { kind: 'micro' }, text: 'Jobs posted through WAKIN become fixed-price micro-contracts that verified businesses and professionals apply for.', member: { label: 'Post a job', href: '/micro/new?source=wakin' } },
  vidplay: { module: 'Micro-contracts', feed: { kind: 'micro' }, text: 'Creator campaigns run as paid micro-contracts with clear deliverables and payment on acceptance.', member: { label: 'Post a creator campaign', href: '/micro/new?source=vidplay' } },
  '99films': { module: 'Micro-contracts', feed: { kind: 'micro' }, text: 'Film crew and post-production work posted as micro-contracts.', member: { label: 'Post film work', href: '/micro/new?source=99films' } },
  'moveon-video': { module: 'Micro-contracts', feed: { kind: 'micro' }, text: 'Video editing, subtitling and distribution tasks posted as micro-contracts.', member: { label: 'Post video work', href: '/micro/new?source=moveon-video' } },
  'help-today': { module: 'Community', feed: { kind: 'community', topics: ['question', 'general'] }, text: 'Help requests and answers in the COLLABIZ members’ community.', member: { label: 'Ask the community', href: '/community' } },
  'goodtime-live': { module: 'Community', feed: { kind: 'community', topics: ['events'] }, text: 'Events and get-togethers posted in the members’ community.', member: { label: 'Post an event', href: '/community' } },
  withme: { module: 'Community', feed: { kind: 'community', topics: ['events', 'general'] }, text: 'Members meet through community events and posts; one-to-one services open after verification.', member: { label: 'Join the community', href: '/community' } },
  weekend: { module: 'Announcements', feed: { kind: 'announcements' }, text: 'Editions and notices published to all COLLABIZ members.', member: { label: 'Read announcements', href: '/announcements' } },
  ibrain: { module: 'ACTION OS', feed: { kind: 'actions' }, text: 'Commitments captured by members become follow-ups on the ACTION OS board.', member: { label: 'Open my action board', href: '/action-os' } },
  'u-meet': { module: 'Meetings', feed: { kind: 'meetings' }, text: 'Meetings scheduled and held by members inside COLLABIZ.', member: { label: 'Schedule a meeting', href: '/meetings' } },
  'nano-bazar': { module: 'Business QR', feed: { kind: 'storefronts' }, text: 'Shops with a live Business QR page that opens their verified profile.', member: { label: 'Create my shop’s Business QR', href: '/business-qr' } },
};
export const connectorFor = (slug: string): Connector | undefined => CONNECTORS[slug];
/** Feeds whose items a visitor can ask about. */
export const ITEM_FEEDS = ['capacity', 'offers', 'energy', 'powertek'] as const;

/**
 * Structured requests a business page accepts (stored with the enquiry, validated per business).
 * Unite Biofix — Bio-CNG and green hydrogen.
 */
export interface PageIntent { code: string; label: string; quantityLabel?: string; unit?: string; needsFeedstock?: boolean }
export const BIOFIX_FEEDSTOCKS = ['Paddy or wheat straw', 'Sugarcane press mud', 'Cattle dung', 'Poultry litter', 'Municipal solid waste (organic)', 'Food, market or hotel waste', 'Distillery or dairy effluent', 'Other agri residue'] as const;
export const PAGE_INTENTS: Record<string, readonly PageIntent[]> = {
  'unite-biofix': [
    { code: 'feedstock', label: 'Supply feedstock', quantityLabel: 'Quantity available', unit: 'tonnes a day', needsFeedstock: true },
    { code: 'host_land', label: 'Host a plant on my land', quantityLabel: 'Land available', unit: 'acres' },
    { code: 'offtake_cbg', label: 'Buy Bio-CNG', quantityLabel: 'Quantity needed', unit: 'kg a day' },
    { code: 'offtake_fom', label: 'Buy organic manure (FOM)', quantityLabel: 'Quantity needed', unit: 'tonnes a month' },
    { code: 'offtake_h2', label: 'Buy green hydrogen', quantityLabel: 'Quantity needed', unit: 'kg a day' },
    { code: 'partner', label: 'Build, operate or supply equipment (EPC / O&M)' },
  ],
};
export const pageIntent = (slug: string, code: string) => PAGE_INTENTS[slug]?.find((i) => i.code === code);

/** Public programmes a Bio-CNG or green hydrogen project may look at. Facts only; eligibility and terms are in the official guidelines. */
export const BIOFIX_SCHEMES = [
  { name: 'SATAT', by: 'Ministry of Petroleum and Natural Gas (launched 2018)', text: 'Offtake of compressed biogas (CBG/Bio-CNG) by oil and gas marketing companies from new plants.' },
  { name: 'GOBARdhan', by: 'Government of India (Ministry of Jal Shakti, nodal)', text: 'Converting cattle dung and organic waste into biogas, CBG and organic manure; registration of plants on the unified portal.' },
  { name: 'National Green Hydrogen Mission', by: 'Ministry of New and Renewable Energy (approved January 2023)', text: 'Aims for at least 5 million tonnes a year of green hydrogen production capacity in India by 2030, with programmes for electrolysers and production.' },
] as const;
