import { z } from 'zod';
import { RULE_LABELS } from '@unite/power-engine';
import { audit, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';
import { activeRules } from '@/lib/offtake';

export const GET = handle(async () => {
  await requireRole('viewer');
  await activeRules();
  return { labels: RULE_LABELS, rules: await db.offtakeRule.findMany({ orderBy: [{ state: 'asc' }, { key: 'asc' }, { createdAt: 'desc' }] }) };
});

/** Records a rule. It replaces the active rule for the same state, structure and limit (the old one is kept, inactive). */
export const POST = handle(async (req: Request) => {
  const s = await requireRole('analyst');
  const b = z.object({
    state: z.string().trim().toUpperCase().min(2).max(3), structure: z.enum(['third_party', 'group_captive', 'captive', 'rooftop', 'all_open_access', 'all']),
    key: z.enum(Object.keys(RULE_LABELS) as [keyof typeof RULE_LABELS]), value: z.number().finite().min(0), confidence: z.enum(['verified', 'secondary', 'user']),
    source: z.string().trim().min(5).max(500), sourceUrl: z.string().url().optional().or(z.literal('')), effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')), note: z.string().max(500).optional(),
  }).refine((x) => x.confidence !== 'verified' || (!!x.sourceUrl && !!x.effectiveFrom), { message: 'A verified rule needs the order link and its effective date', path: ['sourceUrl'] }).parse(await req.json());
  const row = await db.$transaction(async (tx) => {
    await tx.offtakeRule.updateMany({ where: { state: b.state, structure: b.structure, key: b.key, active: true }, data: { active: false } });
    return tx.offtakeRule.create({ data: { ...b, sourceUrl: b.sourceUrl || null, effectiveFrom: b.effectiveFrom || null, enteredBy: s.email } });
  });
  await audit(s, 'offtake.rule_recorded', 'offtakeRule', row.id, undefined, b);
  return row;
});
