/** BIZO ↔ COLLABIZ lead exchange by file: owner/admin export, restricted contacts withheld, safe CSV, audited. */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('BIZO integration', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  it('exports the business’s own customers in a BIZO-ready CSV; restricted contacts go without personal details', async () => {
    const org = (await pool.query("select o.id from organizations o where o.display_name = 'Volt EPC'")).rows[0].id;
    await pool.query("delete from customers where organization_id = $1 and legal_name like 'BIZO test%'", [org]);
    await pool.query(`insert into customers (organization_id, legal_name, contact_name, contact_email, contact_phone, city, country, restricted_contacts) values
      ($1, 'BIZO test Agro Exports', 'Kiran Rao', 'kiran@agro.example', '+91 98480 11111', 'Guntur', 'IN', false),
      ($1, 'BIZO test Private Ltd', 'Hidden Person', 'hidden@private.example', '+91 90000 00000', 'Pune', 'IN', true),
      ($1, '=HYPERLINK("http://evil")', null, null, null, null, 'IN', false)`, [org]);
    await api(app).get('/v1/bizo/export.csv').set(auth(t.rohit)).expect(403); // members (not owner/admin) cannot export
    const r = await api(app).get('/v1/bizo/export.csv').set(auth(t.asha)).expect(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.headers['content-disposition']).toMatch(/collabiz-customers-for-bizo-\d{4}-\d{2}-\d{2}\.csv/);
    const text = r.text.replace(/^﻿/, '');
    expect(text.split('\r\n')[0]).toBe('Company,Contact Name,Email,Phone,City,Country,Tax ID,Source,Notes');
    expect(text).toContain('BIZO test Agro Exports,Kiran Rao,kiran@agro.example,+91 98480 11111,Guntur,IN');
    expect(text).not.toContain('hidden@private.example'); expect(text).not.toContain('Hidden Person');
    expect(text).toMatch(/BIZO test Private Ltd,,,,Pune,IN,,COLLABIZ CRM,Contact details withheld/);
    expect(text).toContain(`"'=HYPERLINK(""http://evil"")"`); // spreadsheet formula neutralised
    expect(text).not.toContain('Ravi'); // only this business's own customers
    const s = (await api(app).get('/v1/bizo/status').set(auth(t.asha)).expect(200)).body;
    expect(s.restricted).toBeGreaterThanOrEqual(1); expect(s.lastExportAt).toBeTruthy(); expect(s.canExport).toBe(true);
    const a = (await pool.query("select after from audit_events where action = 'bizo.customers_exported' order by seq desc limit 1")).rows[0].after;
    expect(a.contactsWithheld).toBeGreaterThanOrEqual(1);
  });

  it('the BIZO page has no pricing, links to bizo.one and the BIZO app, and shows the CSV connection', async () => {
    const { appBrand } = await import('@collabiz/types');
    const b = appBrand('bizo')!;
    expect(b.plans).toBeUndefined(); expect(b.planNote).toBeUndefined();
    expect(b.app).toEqual({ login: 'https://leaddna.bizo.one/', signup: 'https://leaddna.bizo.one/?signup=1' });
    for (const f of b.features) expect(f.href).toMatch(/^https:\/\/bizo\.one\/solutions\//);
    expect(b.integration?.status).toBe('connected');
    const p = (await api(app).get('/v1/public/products/bizo').expect(200)).body;
    expect(p.slug).toBe('bizo');
  });
});
