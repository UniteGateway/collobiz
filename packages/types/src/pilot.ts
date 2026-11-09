import { z } from 'zod';

/** Pilot feedback survey — a two-minute structured check-in partners send during the pilot. */
export const PILOT_FEATURES = ['offers', 'ventures', 'opportunities', 'leads', 'teams', 'tenders', 'contracts', 'commissions', 'messages', 'mobile'] as const;
export const PILOT_FEATURE_LABELS: Record<string, string> = {
  offers: 'Offers for you', ventures: 'Unite businesses', opportunities: 'Opportunities', leads: 'Lead protection', teams: 'Collaboration teams',
  tenders: 'Tenders and bids', contracts: 'Contracts and signing', commissions: 'Earnings and commission', messages: 'Messages and meetings', mobile: 'Mobile app',
};
export const PILOT_CONTINUE = ['yes', 'maybe', 'no'] as const;
export const PILOT_CONTINUE_LABELS: Record<string, string> = { yes: 'Yes', maybe: 'Not sure yet', no: 'No' };

export const PilotFeedbackSchema = z.object({
  usefulness: z.number().int().min(1, { message: 'Choose a rating' }).max(5),
  ease: z.number().int().min(1, { message: 'Choose a rating' }).max(5),
  recommend: z.number().int().min(0).max(10),
  used: z.array(z.enum(PILOT_FEATURES)).max(PILOT_FEATURES.length).default([]),
  mostValuable: z.string().trim().max(1000).optional(),
  blockers: z.string().trim().max(2000).optional(),
  wishlist: z.string().trim().max(2000).optional(),
  continueUse: z.enum(PILOT_CONTINUE),
  contactOk: z.boolean().default(false),
  platform: z.enum(['web', 'mobile']).default('web'),
});
export type PilotFeedbackInput = z.input<typeof PilotFeedbackSchema>;

/** Net promoter score from 0–10 answers: % promoters (9–10) minus % detractors (0–6), rounded. */
export function netPromoterScore(scores: number[]): number | null {
  if (!scores.length) return null;
  const p = scores.filter((s) => s >= 9).length;
  const d = scores.filter((s) => s <= 6).length;
  return Math.round(((p - d) / scores.length) * 100);
}
