import { z } from 'zod';
import { SECTOR_CODES } from './taxonomy';

/**
 * AI Growth Desk — campaign agents (one per product or service) that find, score and draft outreach to lawful leads.
 * AI drafts; people approve; only contacts with a lawful basis are used; opted-out people are never contacted.
 */
export const GROWTH_AUDIENCES = ['buyers', 'partners', 'associations', 'trade', 'investors'] as const;
export const GROWTH_AUDIENCE_LABELS: Record<string, string> = {
  buyers: 'Customers and buyers', partners: 'New partners', associations: 'Associations and chambers', trade: 'Export and import buyers', investors: 'Investors (opt-in only)',
};
export const GROWTH_CADENCES = ['manual', 'daily', 'weekly'] as const;
export const GROWTH_CADENCE_LABELS: Record<string, string> = { manual: 'Only when run by hand', daily: 'Every day', weekly: 'Every week' };
export const GROWTH_AGENT_STATUS_LABELS: Record<string, string> = { draft: 'Draft', active: 'Active', paused: 'Paused' };

/** Where a contact came from. Scraping websites or social networks is deliberately not an option. */
export const CONTACT_SOURCES = ['inbound_form', 'partner_referral', 'event', 'opt_in_list', 'public_registry', 'licensed_directory', 'existing_customer', 'manual'] as const;
export const CONTACT_SOURCE_LABELS: Record<string, string> = {
  inbound_form: 'Enquiry or website form', partner_referral: 'Partner referral (with consent)', event: 'Event or exhibition sign-up', opt_in_list: 'Opted in to updates',
  public_registry: 'Public company registry or tender portal', licensed_directory: 'Licensed directory or trade data', existing_customer: 'Existing customer', manual: 'Added by Unite staff',
};
/** Lawful basis for contacting (DPDP Act 2023 / GDPR). Without one, a contact is stored but never used by agents. */
export const LAWFUL_BASES = ['consent', 'legitimate_interest_b2b', 'existing_relationship', 'none'] as const;
export const LAWFUL_BASIS_LABELS: Record<string, string> = {
  consent: 'Consent given', legitimate_interest_b2b: 'Business contact — legitimate interest', existing_relationship: 'Existing business relationship', none: 'No basis yet — do not contact',
};
export const GROWTH_LEAD_STATUSES = ['new', 'approved', 'rejected', 'contacted', 'replied', 'meeting', 'won', 'lost'] as const;
export const GROWTH_LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'To review', approved: 'Approved', rejected: 'Not a fit', contacted: 'Contacted', replied: 'Replied', meeting: 'Meeting set', won: 'Won', lost: 'Lost',
};
export const GROWTH_MESSAGE_STATUS_LABELS: Record<string, string> = {
  draft: 'Waiting for approval', approved: 'Approved — ready to send', rejected: 'Rejected', queued: 'Sending', sent: 'Sent', failed: 'Failed', blocked: 'Blocked by a safety check',
};
/** Wording an agent may never use — promises that are misleading or regulated. */
export const BLOCKED_CLAIMS = [
  'guaranteed', 'guarantee', 'risk-free', 'risk free', 'assured return', 'assured returns', 'fixed return', 'double your money', 'no risk', '100% safe', 'get rich', 'limited time only', 'act now',
];
export const blockedClaimsIn = (text: string) => BLOCKED_CLAIMS.filter((w) => text.toLowerCase().includes(w));

const id = z.string().uuid();
const optText = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

export const GrowthAgentSchema = z.object({
  name: z.string().trim().min(3).max(120),
  ventureId: id.nullable().optional(),
  product: z.string().trim().min(3).max(200),
  audience: z.enum(GROWTH_AUDIENCES),
  sectors: z.array(z.enum(SECTOR_CODES)).min(1, { message: 'Choose at least one sector to look in' }).max(8),
  regions: z.array(z.string().trim().min(2).max(6)).max(40).default([]),
  countries: z.array(z.string().trim().length(2)).max(30).default(['IN']),
  pitch: z.string().trim().min(40, { message: 'Describe the offer in at least 40 characters' }).max(2000),
  callToAction: z.string().trim().min(5).max(200),
  cadence: z.enum(GROWTH_CADENCES).default('weekly'),
  minScore: z.number().int().min(10).max(95).default(45),
  maxLeadsPerRun: z.number().int().min(1).max(200).default(25),
  dailySendCap: z.number().int().min(1).max(500).default(40),
});
export type GrowthAgentInput = z.input<typeof GrowthAgentSchema>;

export const GrowthContactSchema = z.object({
  organizationName: z.string().trim().min(2).max(200),
  contactName: optText(120),
  email: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal('').transform(() => undefined)),
  phone: optText(30),
  website: optText(200),
  country: z.string().trim().length(2).default('IN'),
  region: optText(6),
  city: optText(80),
  sector: z.enum(SECTOR_CODES),
  kind: z.enum(['company', 'association', 'investor', 'institution']).default('company'),
  source: z.enum(CONTACT_SOURCES),
  sourceDetail: z.string().trim().min(3, { message: 'Say where exactly this contact came from' }).max(300),
  lawfulBasis: z.enum(LAWFUL_BASES),
  consentEvidence: optText(500),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  notes: optText(2000),
}).refine((c) => c.lawfulBasis !== 'consent' || !!c.consentEvidence, { path: ['consentEvidence'], message: 'Record how consent was given (form, date, reference)' });
export type GrowthContactInput = z.input<typeof GrowthContactSchema>;

export const GrowthMessageEditSchema = z.object({ subject: z.string().trim().min(3).max(200), body: z.string().trim().min(40).max(6000) });
