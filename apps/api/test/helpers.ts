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
