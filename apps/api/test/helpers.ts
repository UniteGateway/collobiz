import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { runMigrations } from '../src/db/migrate';
import { createApp } from '../src/bootstrap';

/** Drops and re-migrates the dedicated test database so each suite starts clean. */
export async function resetDatabase() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await pool.end();
  await runMigrations(process.env.DATABASE_URL);
}

export async function bootApp(): Promise<INestApplication> {
  const app = await createApp({ logger: false });
  await app.init();
  return app;
}

export const api = (app: INestApplication) => request(app.getHttpServer());
export const auth = (token: string, orgId?: string) => ({ Authorization: `Bearer ${token}`, ...(orgId ? { 'X-Org-Id': orgId } : {}) });

import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema';
import { seedAll, DEMO_PASSWORD, DEMO_TOTP_SECRET, type SeedRefs } from '../src/db/seed';
import { totp } from '../src/common/crypto';

export { DEMO_PASSWORD };
export async function seed(): Promise<SeedRefs> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await seedAll(drizzle(pool, { schema }) as any);
  } finally {
    await pool.end();
  }
}

/** Mobile-style login returning a Bearer token. Admin accounts get a valid TOTP automatically. */
export async function login(app: INestApplication, email: string, opts: { mfa?: boolean; password?: string } = {}) {
  const r = await api(app).post('/v1/auth/login').send({ email, password: opts.password ?? DEMO_PASSWORD, client: 'mobile', ...(opts.mfa ? { mfaCode: totp(DEMO_TOTP_SECRET) } : {}) });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.accessToken as string;
}

export const ACCOUNTS = {
  superadmin: 'superadmin@collabiz.local', compliance: 'compliance@collabiz.local', finance: 'finance@collabiz.local', finance2: 'finance2@collabiz.local',
  uniteAdmin: 'unite.admin@collabiz.local', routing: 'routing@collabiz.local',
  asha: 'asha@voltepc.example', rohit: 'rohit@voltepc.example', ravi: 'ravi@sunrise.example', meera: 'meera@consult.example', vikram: 'vikram@greenbuild.example',
} as const;
export const ADMINS = new Set<string>([ACCOUNTS.superadmin, ACCOUNTS.compliance, ACCOUNTS.finance, ACCOUNTS.finance2, ACCOUNTS.uniteAdmin, ACCOUNTS.routing]);
/** Logs in every demo account (admins with MFA). */
export async function loginAll(app: INestApplication) {
  const out: Record<keyof typeof ACCOUNTS, string> = {} as any;
  for (const [k, email] of Object.entries(ACCOUNTS)) out[k as keyof typeof ACCOUNTS] = await login(app, email, { mfa: ADMINS.has(email) });
  return out;
}
