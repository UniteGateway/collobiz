import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import { createPool } from './client';

export async function runMigrations(url?: string) {
  const pool = createPool(url);
  try {
    await migrate(drizzle(pool), { migrationsFolder: join(__dirname, '..', '..', 'drizzle') });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => console.info('Migrations applied'))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
