import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';

/** Admin: the latest 100 audited actions. */
export const GET = handle(async () => {
  await requireRole('admin');
  const rows = await db.auditLog.findMany({ orderBy: { at: 'desc' }, take: 100, include: { user: { select: { name: true, email: true } } } });
  return { entries: rows.map((r) => ({ id: r.id, at: r.at, action: r.action, entity: r.entity, entityId: r.entityId, by: r.user?.name ?? 'System' })) };
});
