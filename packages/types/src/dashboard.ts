/** Dashboard themes by business domain, and the admin-managed ad and video slots shown on partner dashboards. */
import { z } from 'zod';

export const DASHBOARD_THEMES = ['energy', 'build', 'trade', 'industry', 'advisory', 'collabiz'] as const;
export type DashboardTheme = (typeof DASHBOARD_THEMES)[number];
export const DASHBOARD_THEME_LABELS: Record<DashboardTheme, string> = { energy: 'Energy & power', build: 'Construction & infrastructure', trade: 'Trading & logistics', industry: 'Manufacturing & agri', advisory: 'Advisory & services', collabiz: 'COLLABIZ' };
const SECTOR_THEME: Record<string, DashboardTheme> = {
  solar: 'energy', power_equipment: 'energy', ev: 'energy', construction_epc: 'build', infrastructure: 'build', real_estate: 'build',
  trading: 'trade', logistics: 'trade', local_commerce: 'trade', manufacturing: 'industry', agri_food: 'industry',
  consulting: 'advisory', financial_services: 'advisory', technology: 'advisory', education: 'advisory', media: 'advisory', employment: 'advisory', social_impact: 'advisory',
};
/** The organisation's first listed sector decides the theme (the one it put first is its main business). */
export const themeForSectors = (sectors: string[] | null | undefined): DashboardTheme => (sectors ?? []).map((s) => SECTOR_THEME[s]).find(Boolean) ?? 'collabiz';

export const DASHBOARD_CONTENT_KINDS = ['ad', 'video'] as const;
/** YouTube / Vimeo links become privacy-friendly embed URLs; anything else is refused. */
export function videoEmbed(url: string): string | null {
  const yt = url.match(/^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = url.match(/^https:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d{6,12})/);
  return vm ? `https://player.vimeo.com/video/${vm[1]}` : null;
}
export const DashboardContentSchema = z.object({
  kind: z.enum(DASHBOARD_CONTENT_KINDS),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().max(400).optional(),
  url: z.string().trim().max(500).refine((u) => u.startsWith('/') || u.startsWith('https://'), 'Use an https:// link or an in-app path'),
  ctaLabel: z.string().trim().max(40).optional(),
  theme: z.enum(DASHBOARD_THEMES).nullable().default(null), // show only to this domain; null = everyone
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sortOrder: z.number().int().min(0).max(999).default(100),
}).refine((c) => c.kind !== 'video' || !!videoEmbed(c.url), { message: 'Use a YouTube or Vimeo link for videos', path: ['url'] })
  .refine((c) => !c.startsOn || !c.endsOn || c.startsOn <= c.endsOn, { message: 'The end date is before the start date', path: ['endsOn'] });
