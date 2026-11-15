import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';
import { ensureSeeded } from '@/lib/tariffs';

/** Every tariff record with its full version history. Filter with ?jurisdiction=AP. */
export const GET = handle(async (req: Request) => {
  await requireRole('viewer');
  await ensureSeeded();
  const j = new URL(req.url).searchParams.get('jurisdiction');
  const rows = await db.tariffRecord.findMany({ where: j ? { jurisdiction: j } : {}, orderBy: [{ jurisdiction: 'asc' }, { key: 'asc' }, { version: 'desc' }] });
  return { records: rows };
});
