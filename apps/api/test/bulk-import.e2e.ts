import type { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

const fx = (f: string) => readFileSync(join(__dirname, 'fixtures', f));

describe('Bulk import — customers and products from CSV, Excel or Tally; preview, map, check, commit', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const preview = (who: string, target: string, file: Buffer, name: string) => api(app).post('/v1/imports/preview').set(auth(who)).field('target', target).attach('file', file, { filename: name });

  it('previews a CSV: header found, columns mapped, bad and duplicate rows listed with reasons', async () => {
    await preview(t.rohit, 'customers', fx('customers.csv'), 'customers.csv').expect(403);
    await preview(t.asha, 'suppliers', fx('customers.csv'), 'customers.csv').expect(400);
    const p = (await preview(t.asha, 'customers', fx('customers.csv'), 'customers.csv').expect(201)).body;
    expect(p).toMatchObject({ source: 'file', header: 1, rowCount: 4, ready: 2, existing: 0, rejected: 2, missing: [] });
    expect(p.mapping).toMatchObject({ legalName: 0, taxId: 1, contactPhone: 3 });
    expect(p.issues.map((i: any) => i.message)).toEqual(['Not a valid GSTIN (format or check digit)', 'Duplicate of row 3 in this file']);
    expect(p.sample[1]).toMatchObject({ legalName: 'Kolhapur Agro Processors', contactPhone: '9822011226' });
    // A person can re-map: drop the GSTIN column and the bad row passes
    const { taxId: _t, ...noGst } = p.mapping;
    expect((await api(app).post(`/v1/imports/${p.id}/check`).set(auth(t.asha)).send({ header: 1, mapping: noGst }).expect(200)).body).toMatchObject({ ready: 4, rejected: 0 }); // without GSTINs, rows 3 and 6 differ by mobile
    await api(app).post(`/v1/imports/${p.id}/check`).set(auth(t.ravi)).send({ header: 1, mapping: noGst }).expect(404); // another company's import
  });

  it('commits customers with a consent basis; a second import of the same file skips them', async () => {
    const p = (await preview(t.asha, 'customers', fx('customers.csv'), 'customers.csv').expect(201)).body;
    await api(app).post(`/v1/imports/${p.id}/commit`).set(auth(t.asha)).send({ target: 'customers', header: p.header, mapping: p.mapping }).expect(400); // consent basis required
    const c = (await api(app).post(`/v1/imports/${p.id}/commit`).set(auth(t.asha)).send({ target: 'customers', header: p.header, mapping: p.mapping, consentBasis: 'own_records' }).expect(200)).body;
    expect(c).toEqual({ created: 2, skippedExisting: 0, rejected: 2 });
    await api(app).post(`/v1/imports/${p.id}/commit`).set(auth(t.asha)).send({ target: 'customers', header: p.header, mapping: p.mapping, consentBasis: 'own_records' }).expect(409);
    const row = await one("select c.tax_id, c.contact_phone, c.restricted_contacts, c.consent_provenance from customers c join organizations o on o.id = c.organization_id where o.display_name = 'Volt EPC' and c.legal_name = 'Shree Ganesh Engineering'");
    expect(row).toMatchObject({ tax_id: '27AAPFU0939F1ZV', contact_phone: '9822011223', restricted_contacts: true });
    expect(row.consent_provenance).toMatchObject({ source: 'bulk_import', basis: 'own_records', file: 'customers.csv' });
    const again = (await preview(t.asha, 'customers', fx('customers.csv'), 'customers.csv').expect(201)).body;
    expect(again).toMatchObject({ ready: 0, existing: 2 });
    await api(app).post(`/v1/imports/${again.id}/commit`).set(auth(t.asha)).send({ target: 'customers', header: again.header, mapping: again.mapping, consentBasis: 'existing_customer' }).expect(400); // nothing new
    expect((await one("select count(*)::int n from audit_events where action = 'import.customers'")).n).toBe(1);
  });

  it('reads a UTF-16 Tally export: debtor ledgers become customers, stock items become products', async () => {
    const c = (await preview(t.ravi, 'customers', fx('tally-masters.xml'), 'Master.xml').expect(201)).body;
    expect(c).toMatchObject({ source: 'tally', ready: 1, rejected: 1 }); // the landline is not a mobile
    expect(c.sample[0]).toMatchObject({ legalName: 'Shree Ganesh Engineering', taxId: '27AAPFU0939F1ZV', contactName: 'Ramesh Pawar', contactPhone: '9822011223', contactEmail: 'accounts@sge.example', city: 'Pune' });
    expect(c.issues[0]).toMatchObject({ field: 'Mobile' });
    const p = (await preview(t.ravi, 'products', fx('tally-masters.xml'), 'Master.xml').expect(201)).body;
    expect(p).toMatchObject({ source: 'tally', ready: 2, rejected: 0 });
    await api(app).post(`/v1/imports/${p.id}/commit`).set(auth(t.ravi)).send({ target: 'products', header: p.header, mapping: p.mapping }).expect(400); // sector required
    expect((await api(app).post(`/v1/imports/${p.id}/commit`).set(auth(t.ravi)).send({ target: 'products', header: p.header, mapping: p.mapping, sector: 'solar' }).expect(200)).body).toMatchObject({ created: 2 });
    const inv = await one("select price, unit, sku, description from supplier_products where name = '5 kW On-grid Inverter'");
    expect(inv).toMatchObject({ price: '4800000', unit: 'Nos', sku: null });
    expect(inv.description).toMatch(/HSN 8504/);
    expect((await one("select sku, price from supplier_products where name = '540 Wp Mono PERC Panel'"))).toMatchObject({ sku: 'MOD-540', price: '1250000' });
    expect((await api(app).get('/v1/imports').set(auth(t.ravi)).expect(200)).body.map((i: any) => i.status)).toEqual(['committed', 'previewed']);
  });
});
