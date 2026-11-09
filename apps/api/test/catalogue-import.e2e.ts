import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema';
import { importCatalogue } from '../src/db/import-catalogue';
import { api, bootApp, resetDatabase, seed } from './helpers';

/** Unite Powertek's published catalogue (360 products from unitepowertek.com) imports into COLLABIZ, idempotently. */
describe('Catalogue import — Unite Powertek', () => {
  let app: INestApplication;
  let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('adds all 360 products to Powertek, then updates in place on a second run', async () => {
    const db = drizzle(pool, { schema }) as any;
    const before = (await pool.query("select count(*)::int n from catalog_items c join organizations o on o.id = c.owner_org_id where o.display_name = 'Powertek'")).rows[0].n;
    const r1 = await importCatalogue(db, 'powertek', {}, () => undefined);
    expect(r1).toMatchObject({ owner: 'Powertek', created: 360, updated: 0, total: before + 360 });
    const r2 = await importCatalogue(db, 'powertek', {}, () => undefined);
    expect(r2).toMatchObject({ created: 0, updated: 360, total: before + 360 });
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
});
