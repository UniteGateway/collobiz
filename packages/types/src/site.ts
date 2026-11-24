/**
 * Website content (admin-managed): social links, YouTube video library, and the COLLABIZ guide chat.
 * The guide is rules-based: it answers with links to the right place and always offers a person from the Unite team.
 */
import { z } from 'zod';

export const SOCIAL_NETWORKS = [
  { key: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'www.facebook.com', 'fb.com'] },
  { key: 'instagram', label: 'Instagram', hosts: ['instagram.com', 'www.instagram.com'] },
  { key: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'www.youtube.com', 'youtu.be'] },
  { key: 'linkedin', label: 'LinkedIn', hosts: ['linkedin.com', 'www.linkedin.com', 'in.linkedin.com'] },
  { key: 'x', label: 'X (Twitter)', hosts: ['x.com', 'twitter.com', 'www.twitter.com'] },
  { key: 'whatsapp', label: 'WhatsApp', hosts: ['wa.me', 'whatsapp.com', 'chat.whatsapp.com', 'www.whatsapp.com'] },
  { key: 'telegram', label: 'Telegram', hosts: ['t.me', 'telegram.me'] },
] as const;
export type SocialKey = (typeof SOCIAL_NETWORKS)[number]['key'];
const socialUrl = (hosts: readonly string[]) => z.string().trim().url().refine((u) => { try { const x = new URL(u); return x.protocol === 'https:' && hosts.includes(x.hostname); } catch { return false; } }, { message: `Use an https link on ${hosts[0]}` });
export const SocialLinksSchema = z.object(Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n.key, socialUrl(n.hosts).optional().or(z.literal('').transform(() => undefined))])) as unknown as Record<SocialKey, z.ZodTypeAny>);
export type SocialLinks = Partial<Record<SocialKey, string>>;

/** Extracts the 11-character video id from any usual YouTube link (watch, youtu.be, shorts, embed, live). */
export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return /^[\w-]{11}$/.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = u.searchParams.get('v');
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      return m ? m[1] : null;
    }
  } catch { /* not a URL */ }
  return null;
}
export const VideoSchema = z.object({
  url: z.string().trim().min(5).max(300).refine((u) => !!youtubeId(u), 'Paste a YouTube link (watch, youtu.be or shorts)'),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(400).optional().or(z.literal('').transform(() => undefined)),
  placements: z.array(z.string().trim().regex(/^(home|page:\/[\w/-]*|product:[a-z0-9-]+|module:[a-z0-9-]+)$/, 'Unknown place')).min(1, 'Choose at least one page').max(30),
  sort: z.number().int().min(0).max(999).default(0),
  published: z.boolean().default(true),
});
/** Pages a video can be placed on (products are added by slug). */
export const VIDEO_PAGES = [
  ['home', 'Home page'], ['page:/about', 'About'], ['page:/how-it-works', 'How it works'], ['page:/start', 'Get started'], ['page:/businesses', 'Unite businesses'],
  ['page:/partner-with-unite', 'Sell Unite products'], ['page:/club', 'Industry Club'], ['page:/join', 'Join the Industry Club'], ['page:/membership', 'Membership'],
  ['page:/group-companies', 'Unite Group'], ['page:/success-stories', 'Success stories'], ['page:/support/contact', 'Contact'], ['module:dashboard', 'Members’ home'], ['module:umeet', 'U meet'],
] as const;

// ---------------------------------------------------------------- guide chat
export interface GuideReply { text: string; links: { label: string; href: string }[]; handover?: boolean }
const RULES: { words: RegExp; reply: GuideReply }[] = [
  { words: /\b(person|human|agent|call me|talk to|someone|support team|executive)\b/i, reply: { text: 'Sure — I’ll ask someone from the Unite team to reply here. They usually reply within one working day.', links: [], handover: true } },
  { words: /\b(solar|rooftop|roof|panel|electricity bill|power bill)\b/i, reply: { text: 'You can get a solar quote in two minutes — upload your bill and the Unite Solar team calls you.', links: [{ label: 'Get a solar quote', href: '/businesses/sunx' }, { label: 'Buy green power (Industry Club)', href: '/join' }] } },
  { words: /\b(dealer|distributor|dealership|franchise|stockist|sell (your|unite)|retail(er)?|store)\b/i, reply: { text: 'To sell Unite products — Cement, Steel, Ply, Carpets, Furniture, Sunora Paints, UNIECO and more — the matching agent shows which product fits your business, then you apply in two minutes.', links: [{ label: 'Find my fit and apply', href: '/partner-with-unite' }] } },
  { words: /\b(cement|steel|ply|plywood|carpet|furniture|paint|sunora|unieco|eco|tableware)\b/i, reply: { text: 'Each Unite product has its own page — buy it, find your nearest partner, or apply to sell it.', links: [{ label: 'Unite businesses', href: '/businesses' }, { label: 'Sell Unite products', href: '/partner-with-unite' }] } },
  { words: /\b(join|register|sign ?up|industry|club|my business|collaborat|membership)\b/i, reply: { text: 'Any business can join the Unite Industry Club free. Tell us your industry and what you want, and you get your own board.', links: [{ label: 'Join the Industry Club', href: '/join' }, { label: 'What would you like to do?', href: '/start' }] } },
  { words: /\b(earn|commission|refer|referral|partner|consultant|agent|lead)\b/i, reply: { text: 'As a partner you introduce customers; your introduction is protected and your commission is tracked until it is paid. Earnings are never guaranteed.', links: [{ label: 'Create a partner account', href: '/signup' }, { label: 'How it works', href: '/how-it-works' }] } },
  { words: /\b(meet|meeting|video call|u ?meet|conference)\b/i, reply: { text: 'U meet runs video meetings with chat inside COLLABIZ. Start one now or schedule it.', links: [{ label: 'Open U meet', href: '/umeet' }] } },
  { words: /\b(price|cost|rate|quotation|quote|fees?)\b/i, reply: { text: 'Prices come from each Unite business — ask for a quote on its page, or I can ask a person to reply here.', links: [{ label: 'Unite businesses', href: '/businesses' }] } },
  { words: /\b(login|log in|sign in|password|otp|account)\b/i, reply: { text: 'Sign in with your email and password. If you forgot it, use “Forgot password” on the sign-in page.', links: [{ label: 'Sign in', href: '/login' }] } },
  { words: /\b(tender|opportunit|project|work|job|contract)\b/i, reply: { text: 'Open opportunities from Unite Group and members are listed here; verified partners can apply.', links: [{ label: 'Opportunities', href: '/opportunities/public' }] } },
  { words: /\b(eb-?5|green card|usa invest)\b/i, reply: { text: 'GO EB5 has a preliminary consultancy application. It is not legal or investment advice.', links: [{ label: 'GO EB5', href: '/go-eb5/apply' }] } },
  { words: /\b(contact|phone|email|address|office)\b/i, reply: { text: 'You can reach the Unite team from the contact page — or ask me for a person and they will reply here.', links: [{ label: 'Contact', href: '/support/contact' }] } },
];
export const GUIDE_WELCOME: GuideReply = {
  text: 'Hi! I’m the COLLABIZ guide. What would you like to do? You can also ask me anything, or ask for a person.',
  links: [{ label: 'Buy from Unite', href: '/businesses' }, { label: 'Sell Unite products', href: '/partner-with-unite' }, { label: 'Grow my business', href: '/join' }, { label: 'Earn as a partner', href: '/signup' }],
};
export function guideReply(text: string): GuideReply {
  const hit = RULES.find((r) => r.words.test(text));
  return hit?.reply ?? { text: 'I’m not sure I understood. Here are the main places to start — or ask for a person and someone from the Unite team will reply here.', links: GUIDE_WELCOME.links };
}
export const GuideMessageSchema = z.object({
  token: z.string().trim().min(20).max(80).optional(),
  text: z.string().trim().min(1, 'Type a message').max(1000),
  page: z.string().trim().max(200).optional(),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('').transform(() => undefined)),
  handover: z.boolean().optional(),
});
