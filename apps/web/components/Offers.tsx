'use client';
import { OFFER_KIND_LABELS, OFFER_PRICING_LABELS, PERCENT_REWARDS, REWARD_LABELS, regionLabel, sectorName } from '@collabiz/types';

export interface OfferReward { model: string; bps: number | null; amount: number | null; text: string }
export interface Offer {
  id: string; code: string; title: string; summary: string; kind: string; sector: string; regions: string[]; issuer: string;
  pricing: string; unitePrice: number | null; priceUnit: string | null; uniteReward: OfferReward | null; rewardModels: string[];
  needsOffice: boolean; minManpower: number | null; exclusive: boolean; places: number; deadline: string; status: string; open: boolean; createdAt: string;
  agreementNote: string | null; venture?: { slug: string; name: string } | null;
}

export const kindLabel = (k: string) => OFFER_KIND_LABELS[k] ?? k;
export const pricingLabel = (p: string) => OFFER_PRICING_LABELS[p] ?? p;
export const rewardLabel = (m: string) => REWARD_LABELS[m] ?? m;
export const isPercent = (m: string) => PERCENT_REWARDS.has(m);
export const rupees = (paise: number | null | undefined) => (paise == null ? '—' : `₹${Math.round(paise / 100).toLocaleString('en-IN')}`);
export const priceText = (paise: number | null | undefined, unit: string | null | undefined) => (paise == null ? null : `${rupees(paise)}${unit ? ` ${unit}` : ''}`);
export const placesText = (o: Pick<Offer, 'regions' | 'sector'>) => [sectorName(o.sector), o.regions.length ? o.regions.map(regionLabel).join(', ') : 'Anywhere'].join(' · ');
export function dueText(deadline: string) {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return 'Closed for responses';
  const d = Math.floor(ms / 86400_000);
  return d >= 1 ? `${d} day${d === 1 ? '' : 's'} left` : `${Math.max(1, Math.floor(ms / 3600_000))} h left`;
}
/** What the partner earns, in one line. */
export const termsLine = (o: Offer) => (o.pricing === 'partner_quote' ? `Quote your price · ${o.rewardModels.map(rewardLabel).join(' / ')}` : [priceText(o.unitePrice, o.priceUnit), o.uniteReward?.text].filter(Boolean).join(' · '));

/** Partner-facing status of an offer for this company. */
export const MY_STATUS: Record<string, [string, 'info' | 'success' | 'warning' | 'neutral']> = {
  sent: ['New', 'info'], viewed: ['Not answered', 'warning'], responded: ['Response sent', 'info'], declined: ['Declined', 'neutral'], selected: ['Selected', 'success'], not_selected: ['Not selected', 'neutral'],
};

/** Sales registered under an offer. */
export interface OfferSale {
  id: string; code: string; partner: string; partnerOrgId: string; buyerName: string; buyerCity: string; contactName: string | null; contactPhone: string | null; contactEmail: string | null;
  description: string; estimatedValue: number | null; consentMethod: string; status: string; saleValue: number | null; invoiceNumber: string | null; paymentReference: string | null; paidAt: string | null;
  lostReason: string | null; createdAt: string; commission: { id: string; status: string; payable: number; gross: number; tds: number } | null;
}
export const SALE_STATUS: Record<string, [string, 'info' | 'success' | 'warning' | 'neutral' | 'danger']> = {
  registered: ['Registered', 'info'], in_discussion: ['In discussion', 'info'], quoted: ['Quoted', 'warning'], won: ['Won — awaiting payment', 'success'], paid: ['Customer paid', 'success'], lost: ['Lost', 'neutral'], withdrawn: ['Withdrawn', 'neutral'],
};
export const CONSENT_METHODS: [string, string][] = [['meeting_minutes', 'Meeting minutes'], ['written_email', 'Written email'], ['signed_letter', 'Signed letter'], ['recorded_call', 'Recorded call']];
export const CONTRACT_STATUS: Record<string, string> = { draft: 'Draft — Unite Group is preparing it', in_review: 'Awaiting Unite Group approval', approved: 'Ready for signatures', partially_signed: 'Partly signed', executed: 'Signed by both sides', terminated: 'Terminated' };
export const COMMISSION_STATUS: Record<string, string> = { estimated: 'Projected', eligible: 'Eligible', earned: 'Earned', approved: 'Approved', invoiced: 'Requested', settled: 'Paid to you', on_hold: 'On hold', disputed: 'Disputed', reversed: 'Reversed' };
