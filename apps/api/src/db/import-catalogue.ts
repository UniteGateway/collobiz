/**
 * Imports a Unite company's published product catalogue into COLLABIZ. Safe in production and safe to repeat:
 * items are matched by SKU (the company's own product code) and updated in place; nothing is deleted.
 *
 *   node dist/db/import-catalogue.js powertek                 # into the group company whose name contains "Powertek"
 *   node dist/db/import-catalogue.js powertek --draft         # import as drafts for review instead of publishing
 *   node dist/db/import-catalogue.js powertek --no-images     # skip copying product photos
 *   node dist/db/import-catalogue.js innovation               # Unite Exim innovation pipeline (partner-only, "Sourcing")
 * Product photos are copied once from the company's website into COLLABIZ storage (and re-copied only if the source
 * address changes), so pages never depend on the other site being up and no outside image host is needed.
 *   (development: node -r @swc-node/register src/db/import-catalogue.ts powertek)
 */
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createPool, type Db } from './client';
import * as s from './schema';
import { POWERTEK_CATALOGUE, type PowertekItem } from './data/powertek-catalogue';
import { StorageService } from '../common/adapters';
import { INNOVATION_CATALOGUE, type InnovationItem } from './data/innovation-catalogue';

export type ImageFetcher = (url: string) => Promise<Buffer>;
const MAX_IMAGE = 5 * 1024 * 1024;
/** Downloads one image with a timeout and size limit. */
export const httpImage: ImageFetcher = async (url) => {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20_000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'COLLABIZ catalogue import (Unite Group)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_IMAGE) throw new Error('image larger than 5 MB');
    return buf;
  } finally { clearTimeout(t); }
};
const mimeOf = (b: Buffer) => (b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.subarray(0, 4).toString('latin1') === '\x89PNG' ? 'image/png' : b.subarray(0, 4).toString('latin1') === 'RIFF' ? 'image/webp' : null);

/** Innovation pipeline items become partner-only catalogue entries marked "Sourcing", with no price and no photo. */
const fromInnovation = (i: InnovationItem): PowertekItem => ({
  sku: i.sku, name: i.name, kind: 'product', sector: i.sector, image: null,
  description: `${i.description} Sourcing: Unite Exim offers this once a supplier and Indian certifications are confirmed — ask for a quotation to register your interest.`,
  specs: {
    'Product line': 'Innovation pipeline', Availability: 'Sourcing — supplied on order once a supplier and Indian certifications are confirmed', 'Launch priority': i.priority,
    'India supply (indicative)': i.supply, 'Market fit': i.marketFit, 'Typical buyers': i.buyers, 'Check before launch': i.check, ...(i.schemes ? { 'Schemes that may help': i.schemes } : {}),
  },
});
const SOURCES: Record<string, { match: string; items: PowertekItem[]; visibility: 'public' | 'partners' }> = {
  powertek: { match: 'powertek', items: POWERTEK_CATALOGUE, visibility: 'public' },
  innovation: { match: 'exim', items: INNOVATION_CATALOGUE.map(fromInnovation), visibility: 'partners' },
};

export async function importCatalogue(db: Db, source: string, o: { publish?: boolean; images?: ImageFetcher | false } = {}, log: (m: string) => void = console.log) {
  const src = SOURCES[source];
  if (!src) throw new Error(`Unknown catalogue "${source}". Available: ${Object.keys(SOURCES).join(', ')}`);
  const owners = await db.select({ id: s.organizations.id, name: s.organizations.displayName }).from(s.groupCompanies).innerJoin(s.organizations, eq(s.organizations.id, s.groupCompanies.organizationId))
    .where(or(ilike(s.organizations.displayName, `%${src.match}%`), ilike(s.organizations.legalName, `%${src.match}%`)));
  if (owners.length !== 1) throw new Error(owners.length ? `More than one group company matches "${src.match}": ${owners.map((x) => x.name).join(', ')}` : `No group company matches "${src.match}". Create it in the admin console first.`);
  const owner = owners[0];
  let created = 0, updated = 0;
  for (const it of src.items) {
    const values = { name: it.name, kind: it.kind, sector: it.sector, description: it.description, specs: it.specs, visibility: src.visibility, status: o.publish === false ? 'draft' : 'published', updatedAt: new Date() };
    const [found] = await db.select({ id: s.catalogItems.id }).from(s.catalogItems).where(and(eq(s.catalogItems.ownerOrgId, owner.id), eq(s.catalogItems.sku, it.sku))).limit(1);
    if (found) { await db.update(s.catalogItems).set(values).where(eq(s.catalogItems.id, found.id)); updated++; }
    else { await db.insert(s.catalogItems).values({ ...values, ownerOrgId: owner.id, sku: it.sku, currency: 'INR' }); created++; }
  }
  // Photos: copy new or changed ones, a few at a time.
  const fetchImage = o.images === undefined ? httpImage : o.images;
  const images = { copied: 0, unchanged: 0, failed: 0, none: 0 };
  if (fetchImage) {
    const storage = new StorageService();
    const rows = await db.select({ id: s.catalogItems.id, sku: s.catalogItems.sku, imageKey: s.catalogItems.imageKey, imageSource: s.catalogItems.imageSource }).from(s.catalogItems).where(eq(s.catalogItems.ownerOrgId, owner.id));
    const bySku = new Map(src.items.map((i) => [i.sku, i.image]));
    const todo = rows.filter((r) => { const u = r.sku ? bySku.get(r.sku) : undefined; if (!u) { if (r.sku && bySku.has(r.sku)) images.none++; return false; } if (r.imageKey && r.imageSource === u) { images.unchanged++; return false; } return true; });
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const r = todo[next++]; const url = bySku.get(r.sku!)!;
        try {
          const buf = await fetchImage(url);
          const mime = mimeOf(buf);
          if (!mime) throw new Error('not a JPEG, PNG or WebP image');
          const stored = await storage.put(buf, mime, `catalog/${owner.id}`);
          await db.update(s.catalogItems).set({ imageKey: stored.key, imageSource: url }).where(eq(s.catalogItems.id, r.id));
          images.copied++;
        } catch (e) { images.failed++; log(`  image for ${r.sku} not copied: ${(e as Error).message}`); }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  }
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(s.catalogItems).where(eq(s.catalogItems.ownerOrgId, owner.id));
  log(`${owner.name}: ${created} added, ${updated} updated, ${n.n} catalogue items in total${fetchImage ? `; photos: ${images.copied} copied, ${images.unchanged} unchanged, ${images.none} without a source photo, ${images.failed} failed` : ''}`);
  return { owner: owner.name, created, updated, total: n.n, images };
}

if (require.main === module) {
  const [source, ...flags] = process.argv.slice(2);
  const pool = createPool();
  importCatalogue(drizzle(pool, { schema: s }) as unknown as Db, source ?? '', { publish: !flags.includes('--draft'), images: flags.includes('--no-images') ? false : httpImage })
    .then(() => pool.end())
    .catch(async (e) => { console.error(`Import stopped: ${e.message}`); await pool.end(); process.exit(1); });
}
