import { z } from 'zod';
import { validatePlant, type PlantConfig, type PriceInputs } from '@unite/power-engine';
import { audit, HttpError, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';
import { loadProject } from '@/lib/sim';

export const GET = handle(async (req: Request) => {
  await requireRole('viewer');
  const p = await loadProject(new URL(req.url).searchParams.get('id'));
  return { ...p, issues: validatePlant(p.config) };
});

/** Saves configuration and prices as a new version. Errors block saving; warnings are returned for display. */
export const PUT = handle(async (req: Request) => {
  const s = await requireRole('analyst');
  const b = z.object({ id: z.string().uuid().nullable(), name: z.string().trim().min(3).max(120), config: z.record(z.string(), z.unknown()), prices: z.record(z.string(), z.unknown()) }).parse(await req.json());
  const config = b.config as unknown as PlantConfig, prices = b.prices as unknown as PriceInputs;
  const issues = validatePlant(config);
  if (issues.some((i) => i.severity === 'error')) throw Object.assign(new HttpError(400, issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')), {});
  const before = b.id ? await db.project.findUnique({ where: { id: b.id } }) : null;
  const saved = before
    ? await db.project.update({ where: { id: before.id }, data: { name: b.name, config: config as never, prices: prices as never, version: before.version + 1 } })
    : await db.project.create({ data: { name: b.name, config: config as never, prices: prices as never, createdBy: s.userId } });
  await audit(s, before ? 'project.updated' : 'project.created', 'project', saved.id, before ? { config: before.config, prices: before.prices } : undefined, { config, prices });
  return { id: saved.id, version: saved.version, issues };
});
