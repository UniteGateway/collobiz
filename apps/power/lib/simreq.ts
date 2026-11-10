import { z } from 'zod';
import type { SimRequest } from './sim';

const Q = z.object({
  mode: z.enum(['max_profit', 'max_savings', 'max_reliability']).default('max_reliability'),
  scenario: z.enum(['typical', 'sunny', 'monsoon_heavy', 'low_production']).default('typical'),
  cuf: z.coerce.number().min(0.05).max(0.5).optional(),
  basis: z.enum(['dc', 'ac']).default('dc'),
  export: z.enum(['0', '1']).optional(),
  firming: z.enum(['0', '1']).optional(),
  exportLimit: z.coerce.number().min(1).max(400).optional(),
});
/** Parses simulation options from a URL's search parameters. */
export function simRequest(url: string): SimRequest {
  const q = Q.parse(Object.fromEntries(new URL(url).searchParams));
  return { mode: q.mode, scenario: q.scenario, cufTarget: q.cuf ?? null, cufBasis: q.basis, allowExport: q.export !== '0', allowGridFirming: q.firming === '1', exportLimitMw: q.exportLimit ?? null };
}
export const projectIdOf = (url: string) => new URL(url).searchParams.get('project');
