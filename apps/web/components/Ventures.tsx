'use client';
import { VENTURE_ROLE_LABELS, VENTURE_STAGE_LABELS, sectorName } from '@collabiz/types';

export interface Venture { id: string; slug: string; name: string; category: string; sector: string; tagline: string; summary: string; stage: string; roles?: string[]; open: boolean; availability: string; company: string | null; rewardNote?: string | null }
export const stageLabel = (s: string) => VENTURE_STAGE_LABELS[s] ?? s;
export const roleLabel = (r: string) => VENTURE_ROLE_LABELS[r] ?? r;
export const INTEREST: Record<string, [string, 'info' | 'success' | 'warning' | 'neutral']> = { pending: ['Request sent', 'info'], approved: ['You promote this', 'success'], declined: ['Not approved', 'neutral'], withdrawn: ['Withdrawn', 'neutral'] };
/** Two-letter monogram for a business without artwork. */
export const monogram = (name: string) => name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export function VentureMark({ name, sector, size = 44 }: { name: string; sector: string; size?: number }) {
  return <span className={`cz-vmark cz-vmark-${sector}`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>{monogram(name)}</span>;
}
export const sectorLabel = sectorName;
