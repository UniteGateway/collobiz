/**
 * Unite Club — a members' business club with local chapters (like Rotary, Lions or BNI).
 * Members meet regularly, pass referrals to each other, run service projects and grow together.
 */
import { z } from 'zod';
import { slugify } from './brand-channels';

export const UC_VALUES = [
  { title: 'Givers gain', text: 'Members help each other first — referrals, introductions and advice.' },
  { title: 'One seat per business', text: 'Each chapter has one member per business category, so members do not compete in the room.' },
  { title: 'Meet every week or fortnight', text: 'In person or online in U meet, with a set agenda and attendance.' },
  { title: 'Serve the community', text: 'Chapters run service projects — health camps, school support, tree planting, skills days.' },
  { title: 'Trust and integrity', text: 'Members are approved by their chapter, and every referral is passed with the person’s consent.' },
] as const;

export const UC_ROLES = { president: 'President', secretary: 'Secretary', treasurer: 'Treasurer', member: 'Member' } as const;
export type UcRole = keyof typeof UC_ROLES;
export const UC_OFFICERS: UcRole[] = ['president', 'secretary'];
export const UC_EVENT_KINDS = { meeting: 'Chapter meeting', service: 'Service project', social: 'Social', visit: 'Business visit' } as const;
export const UC_REFERRAL_STATUS = { given: 'Given', contacted: 'Contacted', won: 'Business won', lost: 'Did not go ahead' } as const;

/** Normalised category key for the one-seat-per-category rule ("Chartered Accountant" ≡ "chartered accountants"). */
export const ucCategoryKey = (c: string) => c.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/s$/, '');

const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number');
export const UcChapterSchema = z.object({
  name: z.string().trim().min(3).max(80),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().max(80).optional().or(z.literal('').transform(() => undefined)),
  country: z.string().trim().length(2).toUpperCase().default('IN'),
  about: z.string().trim().min(20, 'Say what the chapter is about (at least 20 characters)').max(1000),
  meetingSchedule: z.string().trim().min(5, 'e.g. Every Tuesday, 7:30 am').max(120),
  venue: z.string().trim().max(200).optional().or(z.literal('').transform(() => undefined)),
  meetsOnline: z.boolean().default(false),
  exclusiveCategories: z.boolean().default(true),
  category: z.string().trim().min(3, 'Your business category, e.g. Interior designer').max(80),
});
export const ucChapterSlug = (name: string, city: string) => slugify(`${name.toLowerCase().includes(city.toLowerCase()) ? name : `${name} ${city}`}`);
export const UcApplySchema = z.object({
  category: z.string().trim().min(3, 'Your business category, e.g. Interior designer').max(80),
  intro: z.string().trim().max(600).optional().or(z.literal('').transform(() => undefined)),
});
export const UcDecisionSchema = z.object({ decision: z.enum(['approve', 'decline']), note: z.string().trim().max(400).optional() });
export const UcRoleSchema = z.object({ role: z.enum(['president', 'secretary', 'treasurer', 'member']) });
export const UcEventSchema = z.object({
  kind: z.enum(['meeting', 'service', 'social', 'visit']),
  title: z.string().trim().min(3).max(120),
  details: z.string().trim().max(1000).optional().or(z.literal('').transform(() => undefined)),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  venue: z.string().trim().max(200).optional().or(z.literal('').transform(() => undefined)),
  online: z.boolean().default(false),
}).refine((e) => new Date(e.endsAt) > new Date(e.startsAt), { path: ['endsAt'], message: 'Ends after it starts' });
export const UcRsvpSchema = z.object({ answer: z.enum(['going', 'not_going']) });
export const UcReferralSchema = z.object({
  toUserId: z.string().uuid('Choose the member'),
  contactName: z.string().trim().min(2).max(120),
  contactPhone: phone.optional().or(z.literal('').transform(() => undefined)),
  contactEmail: z.string().trim().toLowerCase().email().optional().or(z.literal('').transform(() => undefined)),
  need: z.string().trim().min(10, 'What do they need? (at least 10 characters)').max(600),
  consent: z.literal(true, { message: 'Pass contact details only with the person’s consent' }),
}).refine((r) => r.contactPhone || r.contactEmail, { path: ['contactPhone'], message: 'Add a phone number or email' });
export const UcReferralUpdateSchema = z.object({
  status: z.enum(['contacted', 'won', 'lost']),
  reportedValueMinor: z.number().int().min(0).max(1e13).optional(),
  note: z.string().trim().max(400).optional(),
});
export const UcHoursSchema = z.object({ hours: z.number().int().min(1).max(24) });
