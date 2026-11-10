import { PrismaClient } from '@prisma/client';

const g = globalThis as unknown as { __powerDb?: PrismaClient };
/** One Prisma client per server process (re-used across hot reloads in development). */
export const db = g.__powerDb ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.__powerDb = db;
