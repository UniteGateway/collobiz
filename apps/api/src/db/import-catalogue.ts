/**
 * Imports a Unite company's published product catalogue into COLLABIZ. Safe in production and safe to repeat:
 * items are matched by SKU (the company's own product code) and updated in place; nothing is deleted.
 *
 *   node dist/db/import-catalogue.js powertek                 # into the group company whose name contains "Powertek"
 *   node dist/db/import-catalogue.js powertek --draft         # import as drafts for review instead of publishing
 *   (development: node -r @swc-node/register src/db/import-catalogue.ts powertek)
 */
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createPool, type Db } from './client';
import * as s from './schema';
import { POWERTEK_CATALOGUE, type PowertekItem } from './data/powertek-catalogue';

const SOURCES: Record<string, { match: string; items: PowertekItem[] }> = { powertek: { match: 'powertek', items: POWERTEK_CATALOGUE } };

export async function importCatalogue(db: Db, source: string, o: { publish?: boolean } = {}, log: (m: string) => void = console.log) {
  const src = SOURCES[source];
  if (!src) throw new Error(`Unknown catalogue "${source}". Available: ${Object.keys(SOURCES).join(', ')}`);
  const owners = await db.select({ id: s.organizations.id, name: s.organizations.displayName }).from(s.groupCompanies).innerJoin(s.organizations, eq(s.organizations.id, s.groupCompanies.organizationId))
    .where(or(ilike(s.organizations.displayName, `%${src.match}%`), ilike(s.organizations.legalName, `%${src.match}%`)));
  if (owners.length !== 1) throw new Error(owners.length ? `More than one group company matches "${src.match}": ${owners.map((x) => x.name).join(', ')}` : `No group company matches "${src.match}". Create it in the admin console first.`);
  const owner = owners[0];
  let created = 0, updated = 0;
  for (const it of src.items) {
    const values = { name: it.name, kind: it.kind, sector: it.sector, description: it.description, specs: it.specs, visibility: 'public', status: o.publish === false ? 'draft' : 'published', updatedAt: new Date() };
    const [found] = await db.select({ id: s.catalogItems.id }).from(s.catalogItems).where(and(eq(s.catalogItems.ownerOrgId, owner.id), eq(s.catalogItems.sku, it.sku))).limit(1);
    if (found) { await db.update(s.catalogItems).set(values).where(eq(s.catalogItems.id, found.id)); updated++; }
    else { await db.insert(s.catalogItems).values({ ...values, ownerOrgId: owner.id, sku: it.sku, currency: 'INR' }); created++; }
  }
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(s.catalogItems).where(eq(s.catalogItems.ownerOrgId, owner.id));
  log(`${owner.name}: ${created} added, ${updated} updated, ${n.n} catalogue items in total`);
  return { owner: owner.name, created, updated, total: n.n };
}

if (require.main === module) {
  const [source, ...flags] = process.argv.slice(2);
  const pool = createPool();
  importCatalogue(drizzle(pool, { schema: s }) as unknown as Db, source ?? '', { publish: !flags.includes('--draft') })
    .then(() => pool.end())
    .catch(async (e) => { console.error(`Import stopped: ${e.message}`); await pool.end(); process.exit(1); });
}
