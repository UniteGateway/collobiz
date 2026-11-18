/**
 * Unite Group collaboration programmes (from the live COLLABIZ site). A programme opens only after its responsible
 * company approves it; until then partners can ask to be told when it opens. Wording is the published programme text.
 */
import type { AssetKind } from './collab';

export interface UniteProgramme { code: string; title: string; company: string; summary: string; lookingFor: AssetKind[]; areas: string[]; note?: string; href?: string }
export const UNITE_PROGRAMMES: UniteProgramme[] = [
  { code: 'unite_solar', title: 'Unite Solar partner programme', company: 'Unite Solar', summary: 'Stores, electrical dealers, solar contractors, sales consultants and technical teams working with Unite Solar on rooftop, C&I, EPC, AMC and EV charging.',
    lookingFor: ['store', 'team', 'skills', 'customers', 'land'], areas: ['Solar franchise', 'Distribution', 'Residential rooftop sales', 'Commercial & industrial solar', 'EPC execution', 'Customer lead introduction', 'Installation', 'BOOT / PPA enquiries', 'AMC', 'EV charging'],
    note: 'Franchise fees and benefits remain draft until commercially approved. Customer introductions follow the COLLABIZ protected-lead rules.', href: '/unite-solar' },
  { code: 'prizo', title: 'PRIZO store collaboration', company: 'PRIZO', summary: 'Retail stores, electronics dealers, wholesalers, manufacturers and fulfilment partners serving PRIZO buyer enquiries.',
    lookingFor: ['store', 'warehouse', 'products', 'vehicles'], areas: ['Store registration & verification', 'Product categories & service territory', 'Buyer enquiries', 'Merchant quotations', 'Order & fulfilment routing', 'Warranty & returns', 'Partner performance'],
    note: 'AI agents act only on the buyer side. Merchants provide their own approved quotations and decisions — there is no seller-side autonomous negotiation.', href: '/ventures/prizo' },
  { code: 'bpo_office', title: 'BPO & office collaboration', company: 'Unite Group service divisions', summary: 'Offices and teams offering seats, languages and operating hours for customer support, telecalling, lead generation, back-office, accounting, IT and AI data services.',
    lookingFor: ['office', 'team'], areas: ['Customer support', 'Telecalling', 'Lead generation', 'Marketing', 'Data processing', 'Back-office', 'Virtual assistance', 'Accounting support', 'IT support', 'AI data services'],
    note: 'Contracts, SLAs, tasks, deliverables and invoices are agreed per engagement. No work orders exist until one is published by an authorised company.' },
  { code: 'powertek', title: 'Unite Powertek network', company: 'Unite Powertek', summary: 'Manufacturers, distributors, equipment dealers, contractors and installation companies.',
    lookingFor: ['factory', 'machinery', 'store', 'warehouse', 'team'], areas: ['Manufacturing', 'Distribution', 'Equipment dealership', 'Contracting', 'Installation'], href: '/powertek' },
  { code: 'imports_exports', title: 'Unite Imports & Exports', company: 'Unite Imports & Exports', summary: 'International trading, product sourcing, distributor enquiries, logistics and buyer–seller collaboration.',
    lookingFor: ['products', 'warehouse', 'customers', 'capital'], areas: ['Wholesale', 'Product sourcing', 'Distributor enquiries', 'Logistics', 'International representation'], note: 'Cross-border trades follow the COLLABIZ export compliance checklist.' },
  { code: 'adbuz', title: 'ADBUZ marketing work', company: 'ADBUZ', summary: 'Marketing agencies, advertising professionals, influencers and campaign service providers.',
    lookingFor: ['skills', 'team', 'customers', 'services'], areas: ['Campaigns', 'Influencer projects', 'Creative production', 'Media buying'], note: 'Compensation is a fixed project fee or an agreed lead-based project commission for influencers — never a recurring influencer royalty.' },
  { code: 'leaddna', title: 'LeadDNA field & outreach partners', company: 'LeadDNA', summary: 'Lead-generation providers, regional field partners and authorised outreach teams.',
    lookingFor: ['team', 'skills', 'customers'], areas: ['Lead generation', 'Field verification', 'Authorised outreach'], note: 'Outreach only to lawfully obtained contacts with opt-out honoured.', href: '/ventures/leaddna' },
  { code: 'unite_developers', title: 'Unite Developers', company: 'Unite Developers', summary: 'Landowners, property developers, construction contractors and infrastructure partners.',
    lookingFor: ['land', 'capital', 'team', 'machinery'], areas: ['Land JV', 'Construction', 'Infrastructure', 'Real-estate partnerships'], note: 'Land and property partnerships require title and regulatory checks before any commitment.' },
];
export const programmeByCode = (c: string) => UNITE_PROGRAMMES.find((p) => p.code === c);
