import { z } from 'zod';

/** COLLABIZ's own subscription plans. Prices are set by Unite (none are decided yet) and plans go live only when published. */
export const PLAN_LIMIT_KEYS = { leadsPerMonth: 'Leads registered per month', teamMembers: 'Team members', gstDocsPerMonth: 'GST documents per month', importsPerMonth: 'Imports per month' } as const;
export type PlanLimitKey = keyof typeof PLAN_LIMIT_KEYS;
export type PlanLimits = Partial<Record<PlanLimitKey, number | null>>; // null = unlimited

export interface UsageRow { key: PlanLimitKey; label: string; used: number; limit: number | null; pct: number | null; state: 'ok' | 'near' | 'over' | 'unlimited' }
/** Usage against a plan's limits: near at 80 %, over at 100 %. */
export function usageAgainst(limits: PlanLimits, used: Partial<Record<PlanLimitKey, number>>): UsageRow[] {
  return (Object.keys(PLAN_LIMIT_KEYS) as PlanLimitKey[]).map((key) => {
    const limit = limits[key] ?? null;
    const u = used[key] ?? 0;
    const pct = limit == null ? null : limit === 0 ? 100 : Math.round((u / limit) * 100);
    return { key, label: PLAN_LIMIT_KEYS[key], used: u, limit, pct, state: limit == null ? 'unlimited' : pct! >= 100 ? 'over' : pct! >= 80 ? 'near' : 'ok' };
  });
}

/** Yearly saving shown on the plan card, in whole percent, or null when not cheaper. */
export function yearlySavingPct(monthly: number | null, yearly: number | null) {
  if (!monthly || !yearly) return null;
  const pct = Math.round((1 - yearly / (monthly * 12)) * 100);
  return pct > 0 ? pct : null;
}

const limit = z.number().int().min(0).max(1_000_000).nullable();
export const PlanUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(400),
  priceMonthly: z.number().int().min(0).nullable(),
  priceYearly: z.number().int().min(0).nullable(),
  limits: z.object({ leadsPerMonth: limit, teamMembers: limit, gstDocsPerMonth: limit, importsPerMonth: limit }),
  features: z.array(z.string().trim().min(2).max(120)).max(20),
});
export const PlanRequestSchema = z.object({ plan: z.string().min(2).max(40), cycle: z.enum(['monthly', 'yearly']) });
export const PlanActivateSchema = z.object({ paymentReference: z.string().trim().min(4).max(80), periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
