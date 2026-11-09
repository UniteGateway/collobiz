import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema';
import { importCatalogue, type ImageFetcher } from '../src/db/import-catalogue';
import { POWERTEK_CATALOGUE } from '../src/db/data/powertek-catalogue';
import { api, bootApp, resetDatabase, seed } from './helpers';

/** Unite Powertek's published catalogue (360 products from unitepowertek.com) imports into COLLABIZ, idempotently. */
describe('Catalogue import — Unite Powertek', () => {
  let app: INestApplication;
  let pool: Pool;
  const BAD = 'https://www.unitepowertek.com/catalogue/pt-002.jpg';
  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
  const fetched: string[] = [];
  const fakeImages: ImageFetcher = async (url) => { fetched.push(url); if (url === BAD) return Buffer.from('<html>not an image</html>'); return JPEG; };
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('adds all 360 products to Powertek, then updates in place on a second run', async () => {
    const db = drizzle(pool, { schema }) as any;
    const before = (await pool.query("select count(*)::int n from catalog_items c join organizations o on o.id = c.owner_org_id where o.display_name = 'Powertek'")).rows[0].n;
    const r1 = await importCatalogue(db, 'powertek', { images: fakeImages }, () => undefined);
    const withPhoto = POWERTEK_CATALOGUE.filter((i) => i.image).length;
    const bad = POWERTEK_CATALOGUE.filter((i) => i.image === BAD).length;
    expect(r1).toMatchObject({ owner: 'Powertek', created: 360, updated: 0, total: before + 360, images: { copied: withPhoto - bad, failed: bad, none: 360 - withPhoto, unchanged: 0 } });
    expect(fetched.every((u) => u.startsWith('https://www.unitepowertek.com/'))).toBe(true);
    fetched.length = 0;
    const r2 = await importCatalogue(db, 'powertek', { images: fakeImages }, () => undefined);
    expect(r2).toMatchObject({ created: 0, updated: 360, total: before + 360, images: { copied: 0, unchanged: withPhoto - bad, failed: bad } });
    expect(new Set(fetched)).toEqual(new Set([BAD])); // only failures are retried
    await expect(importCatalogue(db, 'nonexistent', {}, () => undefined)).rejects.toThrow(/Unknown catalogue/);
  });

  it('products keep the site’s own codes, lines and specifications, and appear in the public catalogue', async () => {
    const pump = (await pool.query("select * from catalog_items where sku = 'PT-106'")).rows[0];
    expect(pump).toMatchObject({ name: 'Solar Water Pumps', sector: 'agri_food', kind: 'product', status: 'published', visibility: 'public', list_price: null });
    expect(pump.specs).toMatchObject({ 'Product line': 'POWERTEK AGRI', Category: 'Solar Pumps', 'UP-SP-1': expect.stringContaining('Capacity: 1 HP'), 'Product page': 'https://www.unitepowertek.com/products/solar-water-pumps-pt-106' });
    const tx = (await pool.query("select description, specs from catalog_items where sku = 'PT-040'")).rows[0];
    expect(tx.description).toMatch(/available on request/); // the site gives no details — nothing is invented
    expect(Object.values(tx.specs).every((v) => typeof v === 'string')).toBe(true);
    const services = (await pool.query("select count(*)::int n from catalog_items where sku like 'PT-%' and kind = 'service'")).rows[0].n;
    expect(services).toBe(15);
    const pub = await api(app).get('/v1/catalog?q=transformer').expect(200);
    const names = (pub.body.items ?? pub.body).map((i: any) => i.name);
    expect(names).toEqual(expect.arrayContaining(['Distribution Transformers']));
  });

  it('serves each product photo from COLLABIZ, only when the product is visible to the viewer', async () => {
    const item = (await api(app).get('/v1/catalog?q=solar%20water%20pumps').expect(200)).body;
    const pump = (item.items ?? item).find((i: any) => i.name === 'Solar Water Pumps');
    expect(pump.image).toBe(`/api/v1/catalog/${pump.id}/image`);
    const img = await api(app).get(`/v1/catalog/${pump.id}/image`).expect(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.headers['cache-control']).toMatch(/public/);
    expect(Buffer.compare(img.body, JPEG)).toBe(0);
    const noPhoto = (await pool.query("select id from catalog_items where sku like 'PT-%' and image_key is null limit 1")).rows[0].id;
    await api(app).get(`/v1/catalog/${noPhoto}/image`).expect(404);
    await pool.query("update catalog_items set visibility = 'private' where id = $1", [pump.id]);
    await api(app).get(`/v1/catalog/${pump.id}/image`).expect(404); // hidden item: no photo either
    await pool.query("update catalog_items set visibility = 'public' where id = $1", [pump.id]);
  });

  it('innovation pipeline: partner-only "Sourcing" items under Unite Exim, unbranded, invisible to the public', async () => {
    const db = drizzle(pool, { schema }) as any;
    const r = await importCatalogue(db, 'innovation', { images: false }, () => undefined);
    expect(r).toMatchObject({ owner: 'Unite Exim', created: 25, updated: 0 });
    const rows = (await pool.query("select name, description, specs, visibility, status, list_price, image_key from catalog_items where sku like 'INV-%'")).rows;
    expect(rows).toHaveLength(25);
    expect(rows.every((x) => x.visibility === 'partners' && x.status === 'published' && x.list_price === null && x.image_key === null)).toBe(true);
    expect(rows.every((x) => x.specs.Availability.startsWith('Sourcing') && /Sourcing:/.test(x.description))).toBe(true);
    const BRANDS = /alibaba|ecoflow|jackery|bluetti|anker|growatt|huawei|jinko|longi|trina|tesla|byd|catl|luminous|havells|tata power|exide|amaron|su-kam|microtek|livguard|v-guard|crompton|godrej|samsung|lg\b|haier|daikin|voltas/i;
    expect(rows.filter((x) => BRANDS.test(`${x.name} ${x.description} ${Object.values(x.specs).join(' ')}`)).map((x) => x.name)).toEqual([]);
    const anon = await api(app).get('/v1/catalog?q=vendor%20cart').expect(200);
    expect((anon.body.items ?? anon.body).some((i: any) => i.name === 'Solar Street-Vendor Cart')).toBe(false); // public cannot see partner-only items
  });
});
