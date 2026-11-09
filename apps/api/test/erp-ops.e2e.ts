import type { INestApplication } from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { resetConfigForTests } from '../src/config';
import { importCatalogue } from '../src/db/import-catalogue';

const t0 = () => new Date().toISOString().slice(0, 10);
const day = (off: number) => new Date(Date.now() + off * 86400_000).toISOString().slice(0, 10);

/** Generic stand-in for the Frappe REST API: list with fields/filters, get, insert. */
function fakeErp(port: number, db: Record<string, any[]>) {
  const inserts: { doctype: string; body: any }[] = [];
  const ok = (row: any, filters: [string, string, unknown][]) => filters.every(([f, op, v]) => op === '=' ? row[f] === v : op === '<' ? (row[f] ?? 0) < (v as number) : op === '>=' ? row[f] >= (v as string) : op === 'in' ? (v as unknown[]).includes(row[f]) : true);
  const server = createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
      const send = (st: number, d: unknown) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
      if (req.headers.authorization !== 'token k:s') return send(401, {});
      const url = new URL(req.url!, 'http://x'); const [, , doctype] = decodeURIComponent(url.pathname).split('/').filter(Boolean);
      const rows = db[doctype] ?? (db[doctype] = []);
      if (req.method === 'GET') {
        const fields: string[] = JSON.parse(url.searchParams.get('fields') ?? '[]'); const filters = JSON.parse(url.searchParams.get('filters') ?? '[]');
        return send(200, { data: rows.filter((r) => ok(r, filters)).map((r) => Object.fromEntries(fields.map((f) => [f, r[f]]))) });
      }
      const body = JSON.parse(raw); inserts.push({ doctype, body });
      if (doctype === 'Item' && !body.item_group) return send(417, { exception: 'Item Group is mandatory' });
      const doc = { name: body.item_code ?? `X-${rows.length + 1}`, ...body }; rows.push(doc); send(200, { data: doc });
    });
  });
  return new Promise<{ server: Server; inserts: typeof inserts }>((r) => server.listen(port, '127.0.0.1', () => r({ server, inserts })));
}

describe('Inventory, Manufacturing, POS and Procurement through ERPNext', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  const PORT = 19000 + Math.floor(Math.random() * 900);
  const saved = { ...process.env };
  const erp: Record<string, any[]> = {
    Bin: [
      { item_code: 'PT-040', warehouse: 'Finished Goods - PT', actual_qty: 6, projected_qty: 4, reserved_qty: 2, stock_value: 3850000, stock_uom: 'Nos' },
      { item_code: 'PT-182', warehouse: 'Main Store - US', actual_qty: 0, projected_qty: -4, reserved_qty: 4, stock_value: 0, stock_uom: 'Nos' },
      { item_code: 'PT-001', warehouse: 'Main Store - US', actual_qty: 820, projected_qty: 820, reserved_qty: 0, stock_value: 9020000, stock_uom: 'Nos' },
    ],
    Item: [{ item_code: 'PT-040', item_name: 'Distribution Transformers', disabled: 0 }, { item_code: 'PT-182', item_name: 'AC EV Chargers', disabled: 0 }, { item_code: 'PT-001', item_name: 'Mono PERC Solar PV Modules', disabled: 0, name: 'PT-001' }],
    'Stock Entry': [{ name: 'STE-1', stock_entry_type: 'Manufacture', posting_date: day(-1), company: 'Powertek', total_incoming_value: 100, docstatus: 1 }],
    'Delivery Note': [{ name: 'DN-1', customer: 'Thar Solar Parks', posting_date: day(-1), status: 'To Bill', transporter_name: 'Deccan Roadways', vehicle_no: 'TS09UB4521', lr_no: 'LR-1', company: 'Unite Solar', grand_total: 640000, docstatus: 1 }],
    'Work Order': [
      { name: 'WO-1', production_item: 'PT-040', item_name: 'Distribution Transformers', qty: 4, produced_qty: 1, status: 'In Process', planned_start_date: day(-6), expected_delivery_date: day(-1), company: 'Powertek', docstatus: 1 },
      { name: 'WO-2', production_item: 'PT-049', item_name: 'PCC Panels', qty: 6, produced_qty: 6, status: 'Completed', planned_start_date: day(-14), expected_delivery_date: day(-2), company: 'Powertek', docstatus: 1 },
    ],
    BOM: [{ name: 'BOM-PT-040-001', is_active: 1, docstatus: 1 }, { name: 'BOM-OLD', is_active: 0, docstatus: 1 }],
    'POS Invoice': [
      { name: 'P-1', posting_date: t0(), customer: 'Walk-in', pos_profile: 'Hyderabad Centre', grand_total: 18500, company: 'Unite Solar', docstatus: 1 },
      { name: 'P-2', posting_date: t0(), customer: 'Walk-in', pos_profile: 'Pune Store', grand_total: 42000, company: 'Unite Solar', docstatus: 1 },
      { name: 'P-3', posting_date: day(-40), customer: 'Old', pos_profile: 'Pune Store', grand_total: 999999, company: 'Unite Solar', docstatus: 1 },
    ],
    'Purchase Order': [
      { name: 'PO-1', supplier: 'Sunrise Traders', transaction_date: day(-8), schedule_date: day(-1), grand_total: 2620000, per_received: 60, status: 'To Receive and Bill', company: 'Powertek', docstatus: 1 },
      { name: 'PO-2', supplier: 'Deccan Distributors', transaction_date: day(-20), schedule_date: day(-10), grand_total: 455000, per_received: 100, status: 'Completed', company: 'Unite Solar', docstatus: 1 },
    ],
    'Material Request': [{ name: 'MR-1', docstatus: 1, status: 'Pending' }, { name: 'MR-2', docstatus: 1, status: 'Ordered' }],
  };
  let fake: Awaited<ReturnType<typeof fakeErp>>;
  beforeAll(async () => {
    await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL });
    fake = await fakeErp(PORT, erp);
    Object.assign(process.env, { ERPNEXT_URL: `http://127.0.0.1:${PORT}`, ERPNEXT_API_KEY: 'k', ERPNEXT_API_SECRET: 's' }); resetConfigForTests();
  });
  afterAll(async () => { await pool?.end(); await app?.close(); fake?.server.close(); process.env = saved; resetConfigForTests(); });

  it('role rules: operations for Unite admins; store sales also for finance; partners never', async () => {
    for (const p of ['inventory', 'manufacturing', 'procurement', 'pos']) await api(app).get(`/v1/admin/${p}/overview`).set(auth(t.asha)).expect(403);
    await api(app).get('/v1/admin/inventory/overview').set(auth(t.finance)).expect(403);
    await api(app).get('/v1/admin/pos/overview').set(auth(t.finance)).expect(200);
  });

  it('inventory: stock by warehouse, items to reorder, movements and dispatches with transporter details', async () => {
    const r = (await api(app).get('/v1/admin/inventory/overview').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(r.source).toBe('erpnext');
    expect(r.data).toMatchObject({ itemsInStock: 2, stockValue: 12870000, dispatchesToBill: 1 });
    expect(r.data.warehouses).toEqual([{ warehouse: 'Finished Goods - PT', items: 1, value: 3850000 }, { warehouse: 'Main Store - US', items: 1, value: 9020000 }]);
    expect(r.data.reorder.map((x: any) => x.itemName)).toEqual(['AC EV Chargers']);
    expect(r.data.dispatches[0]).toMatchObject({ transporter: 'Deccan Roadways', vehicle: 'TS09UB4521', lrNo: 'LR-1' });
  });

  it('manufacturing: work orders by status, overdue and active bills of materials', async () => {
    const r = (await api(app).get('/v1/admin/manufacturing/overview').set(auth(t.uniteAdmin)).expect(200)).body.data;
    expect(r).toMatchObject({ boms: 1, inProcess: 1, completed: 1, overdue: 1, unitsPlanned: 4, unitsProduced: 1 });
  });

  it('POS: today and this month by store (older bills excluded)', async () => {
    const r = (await api(app).get('/v1/admin/pos/overview').set(auth(t.uniteAdmin)).expect(200)).body.data;
    expect(r).toMatchObject({ todayBills: 2, todayAmount: 60500 });
    expect(r.monthAmount).toBeLessThan(999999 + 60500); // last month's bill is not counted
    expect(r.stores.map((x: any) => x.store)).toEqual(expect.arrayContaining(['Hyderabad Centre', 'Pune Store']));
  });

  it('procurement: open orders, late deliveries and pending material requests', async () => {
    const r = (await api(app).get('/v1/admin/procurement/overview').set(auth(t.uniteAdmin)).expect(200)).body.data;
    expect(r).toMatchObject({ openOrders: 1, openValue: 2620000, lateDeliveries: 1, openMaterialRequests: 1 });
  });

  it('catalogue → ERPNext items: creates missing items once, links existing ones, never duplicates', async () => {
    await importCatalogue(drizzle(pool, { schema }) as any, 'powertek', { images: false }, () => undefined);
    await api(app).post('/v1/admin/erp/items/sync').set(auth(t.finance)).expect(403);
    const r1 = (await api(app).post('/v1/admin/erp/items/sync').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(r1.failed).toBe(0);
    expect(r1.linked).toBe(3); // PT-001, PT-040, PT-182 already exist in ERPNext
    expect(r1.created).toBe(r1.considered - 3);
    const transformer = fake.inserts.find((x) => x.body.item_code === 'PT-041')!.body;
    expect(transformer).toMatchObject({ item_name: 'Power Transformers', item_group: 'Products', stock_uom: 'Nos', is_stock_item: 1 });
    expect(fake.inserts.find((x) => x.body.item_code === 'PT-256')?.body).toMatchObject({ item_group: 'Services', is_stock_item: 0 });
    const before = fake.inserts.length;
    const r2 = (await api(app).post('/v1/admin/erp/items/sync').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(r2.considered).toBeLessThanOrEqual(Math.max(0, (await pool.query("select count(*)::int n from catalog_items c join group_companies g on g.organization_id = c.owner_org_id where c.status = 'published' and c.sku is not null")).rows[0].n - r1.considered));
    expect(fake.inserts.length - before).toBe(r2.created);
  });

  it('sample data cannot be changed', async () => {
    delete process.env.ERPNEXT_URL; resetConfigForTests();
    const r = await api(app).post('/v1/admin/erp/items/sync').set(auth(t.uniteAdmin)).expect(409);
    expect(r.body.message).toMatch(/sample data/);
    const inv = (await api(app).get('/v1/admin/inventory/overview').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(inv.source).toBe('sample');
  });
});
