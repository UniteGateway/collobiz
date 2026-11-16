import { z } from 'zod';
import { audit, HttpError, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';

/** Admin: change someone's role. You cannot change your own, and the last admin stays an admin. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireRole('admin');
  const { id } = await ctx.params;
  const b = z.object({ role: z.enum(['admin', 'analyst', 'viewer']) }).parse(await req.json());
  if (id === s.userId) throw new HttpError(409, 'You cannot change your own role');
  const u = await db.user.findUnique({ where: { id } });
  if (!u) throw new HttpError(404, 'User not found');
  if (u.role === 'admin' && b.role !== 'admin' && (await db.user.count({ where: { role: 'admin' } })) <= 1) throw new HttpError(409, 'Keep at least one admin');
  const r = await db.user.update({ where: { id }, data: { role: b.role }, select: { id: true, name: true, email: true, role: true } });
  await audit(s, 'user.role_changed', 'user', id, { role: u.role }, { role: b.role });
  return r;
});
