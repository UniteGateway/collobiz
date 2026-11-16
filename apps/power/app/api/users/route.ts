import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';

/** Admin: everyone who can sign in, with their role. */
export const GET = handle(async () => {
  await requireRole('admin');
  return { users: await db.user.findMany({ select: { id: true, name: true, email: true, role: true, createdAt: true }, orderBy: { createdAt: 'asc' } }) };
});
