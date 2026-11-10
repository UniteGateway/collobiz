import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';

export const GET = handle(async () => { const s = await requireRole('viewer'); return { name: s.name, email: s.email, role: s.role }; });
