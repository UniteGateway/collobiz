import { REWARD_LABELS } from '@collabiz/types';

/** Shared helpers for the native offer screens. */
export const MY_STATUS: Record<string, [string, 'info' | 'success' | 'warning' | 'neutral']> = { sent: ['New', 'info'], viewed: ['Not answered', 'warning'], responded: ['Response sent', 'info'], declined: ['Declined', 'neutral'], selected: ['Selected', 'success'], not_selected: ['Not selected', 'neutral'] };
export const rupees = (p: number | null | undefined, unit?: string | null) => (p == null ? null : `₹${Math.round(p / 100).toLocaleString('en-IN')}${unit ? ` ${unit}` : ''}`);
export const dueText = (d: string) => { const ms = new Date(d).getTime() - Date.now(); if (ms <= 0) return 'Closed'; const days = Math.floor(ms / 86400_000); return days >= 1 ? `${days}d left` : `${Math.max(1, Math.floor(ms / 3600_000))}h left`; };
export const termsLine = (o: { pricing: string; unitePrice: number | null; priceUnit: string | null; uniteReward: { text: string } | null; rewardModels: string[] }) => (o.pricing === 'partner_quote' ? `Quote your price · ${o.rewardModels.map((m) => REWARD_LABELS[m]).join(' / ')}` : [rupees(o.unitePrice, o.priceUnit), o.uniteReward?.text].filter(Boolean).join(' · '));
