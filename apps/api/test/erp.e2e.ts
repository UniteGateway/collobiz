import type { INestApplication } from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { resetConfigForTests } from '../src/config';
import { resetSampleForTests } from '../src/modules/erp/erp.source';

/** A small stand-in for a Frappe/ERPNext site: the REST shapes COLLABIZ relies on. */
function fakeErpnext(port: number) {
  const seen: { method: string; path: string; fields?: string[]; body?: any; auth?: string }[] = [];
  const db: Record<string, any[]> = {
    Employee: [
      { name: 'HR-EMP-00001', employee_name: 'Ritu Menon', designation: 'HR Manager', department: 'Human Resources - UGI', company: 'Unite Solar', status: 'Active', date_of_joining: '2021-04-01', branch: 'Hyderabad', date_of_birth: '1990-01-01', pan_number: 'ABCDE1234F' },
      { name: 'HR-EMP-00002', employee_name: 'Sahil Rao', designation: 'Site Engineer', department: 'Projects - US', company: 'Unite Solar', status: 'Active', date_of_joining: '2026-11-02', branch: 'Pune' },
      { name: 'HR-EMP-00003', employee_name: 'Neha Das', designation: 'Machine Operator', department: 'Production - PT', company: 'Powertek', status: 'Active', date_of_joining: '2023-06-01', branch: 'Plant' },
    ],
    'Leave Application': [{ name: 'HR-LAP-2026-00001', employee: 'HR-EMP-00002', employee_name: 'Sahil Rao', leave_type: 'Casual Leave', from_date: '2026-11-20', to_date: '2026-11-21', total_leave_days: 2, status: 'Open', company: 'Unite Solar', description: 'Wedding', docstatus: 0 }],
    Attendance: ['Present', 'Present', 'On Leave'].map((status) => ({ status, attendance_date: new Date().toISOString().slice(0, 10), docstatus: 1 })),
    'Salary Slip': [
      { name: 'SS-1', employee: 'HR-EMP-00001', employee_name: 'Ritu Menon', company: 'Unite Solar', gross_pay: 90000, total_deduction: 9500, net_pay: 80500, start_date: '2026-10-01', end_date: '2026-10-31', docstatus: 1, deductions: [{ salary_component: 'Provident Fund', amount: 1800 }, { salary_component: 'Professional Tax', amount: 200 }, { salary_component: 'Income Tax (TDS)', amount: 7500 }] },
      { name: 'SS-2', employee: 'HR-EMP-00003', employee_name: 'Neha Das', company: 'Powertek', gross_pay: 19000, total_deduction: 1483, net_pay: 17517, start_date: '2026-10-01', end_date: '2026-10-31', docstatus: 1, deductions: [{ salary_component: 'Provident Fund', amount: 1140 }, { salary_component: 'ESI', amount: 143 }, { salary_component: 'Professional Tax', amount: 200 }] },
    ],
    'Sales Invoice': [{ company: 'Unite Solar', grand_total: 500000, outstanding_amount: 200000, posting_date: new Date().toISOString().slice(0, 10), due_date: '2020-01-01', docstatus: 1 }],
    'Purchase Invoice': [{ company: 'Unite Solar', grand_total: 120000, outstanding_amount: 120000, posting_date: new Date().toISOString().slice(0, 10), docstatus: 1 }],
    'Journal Entry': [],
  };
  let down = false;
  const match = (row: any, filters: [string, string, unknown][]) => filters.every(([f, op, v]) => op === '=' ? row[f] === v : op === '!=' ? row[f] !== v : op === '<' ? (row[f] ?? 0) < (v as number) : op === '>=' ? row[f] >= (v as string) : true);
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url!, 'http://x');
      const send = (status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      const body = raw ? JSON.parse(raw) : undefined;
      const fields = url.searchParams.get('fields') ? JSON.parse(url.searchParams.get('fields')!) : undefined;
      seen.push({ method: req.method!, path: decodeURIComponent(url.pathname), fields, body, auth: req.headers.authorization });
      if (down) return send(500, { exc_type: 'InternalServerError' });
      if (req.headers.authorization !== 'token k1:s1') return send(401, { exc_type: 'AuthenticationError' });
      const parts = decodeURIComponent(url.pathname).split('/').filter(Boolean); // api, resource, Doctype, name?
      if (url.pathname === '/api/method/frappe.client.submit') {
        const d = body.doc; const rows = db[d.doctype] ?? []; let row = rows.find((r) => r.name === d.name);
        if (!row) { row = { ...d }; rows.push(row); }
        row.docstatus = 1; return send(200, { message: row });
      }
      const [, , doctype, name] = parts;
      const rows = db[doctype] ?? (db[doctype] = []);
      if (req.method === 'GET' && !name) {
        const filters = JSON.parse(url.searchParams.get('filters') ?? '[]');
        let out = rows.filter((r) => match(r, filters));
        if ((fields ?? []).some((f: string) => f.startsWith('deductions.'))) out = out.flatMap((r) => r.deductions.map((dd: any) => ({ name: r.name, component: dd.salary_component, amount: dd.amount })));
        else out = out.map((r) => Object.fromEntries((fields ?? Object.keys(r)).map((f: string) => [f, r[f]])));
        if (url.searchParams.get('order_by')?.startsWith('start_date desc')) out = out.slice(0, Number(url.searchParams.get('limit_page_length')));
        return send(200, { data: out });
      }
      const row = rows.find((r) => r.name === name);
      if (req.method === 'GET') return row ? send(200, { data: { doctype, ...row } }) : send(404, { exc_type: 'DoesNotExistError' });
      if (req.method === 'PUT') { if (!row) return send(404, {}); Object.assign(row, body); return send(200, { data: { doctype, ...row } }); }
      if (req.method === 'POST') {
        if (doctype === 'Journal Entry') {
          const dr = body.accounts.reduce((a: number, x: any) => a + (x.debit_in_account_currency ?? 0), 0), cr = body.accounts.reduce((a: number, x: any) => a + (x.credit_in_account_currency ?? 0), 0);
          if (Math.abs(dr - cr) > 0.001) return send(417, { _server_messages: JSON.stringify([JSON.stringify({ message: `Total Debit must be equal to Total Credit. Difference is ${dr - cr}` })]) });
        }
        const doc = { doctype, name: `ACC-JV-2026-${String(rows.length + 1).padStart(5, '0')}`, docstatus: 0, ...body }; rows.push(doc); return send(200, { data: doc });
      }
      send(404, {});
    });
  });
  return new Promise<{ server: Server; seen: typeof seen; db: typeof db; setDown: (v: boolean) => void }>((r) => server.listen(port, '127.0.0.1', () => r({ server, seen, db, setDown: (v) => (down = v) })));
}

describe('HR, Payroll and Finance through ERPNext', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  const PORT = 18000 + Math.floor(Math.random() * 1000);
  let fake: Awaited<ReturnType<typeof fakeErpnext>>;
  const saved = { ...process.env };
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); fake = await fakeErpnext(PORT); });
  afterAll(async () => { await pool?.end(); await app?.close(); fake?.server.close(); process.env = saved; resetConfigForTests(); });
  const connect = (extra: Record<string, string> = {}) => { Object.assign(process.env, { ERPNEXT_URL: `http://127.0.0.1:${PORT}`, ERPNEXT_API_KEY: 'k1', ERPNEXT_API_SECRET: 's1', ...extra }); resetConfigForTests(); };

  it('who sees what: HR for Unite admins, salaries and books only for finance and super admins', async () => {
    resetSampleForTests();
    await api(app).get('/v1/admin/hr/overview').set(auth(t.asha)).expect(403);
    await api(app).get('/v1/admin/hr/overview').set(auth(t.finance)).expect(403);
    await api(app).get('/v1/admin/payroll/overview').set(auth(t.uniteAdmin)).expect(403);
    await api(app).get('/v1/admin/finance-books/overview').set(auth(t.uniteAdmin)).expect(403);
    await api(app).get('/v1/admin/payroll/overview').set(auth(t.finance)).expect(200);
    await api(app).get('/v1/admin/hr/overview').set(auth(t.superadmin)).expect(200);
  });

  it('without ERPNext, screens run on clearly labelled sample data that cannot be posted to', async () => {
    const st = (await api(app).get('/v1/admin/erp/status').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(st).toMatchObject({ source: 'sample', site: null });
    const hr = (await api(app).get('/v1/admin/hr/overview').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(hr.source).toBe('sample');
    expect(hr.data.headcount).toBeGreaterThan(20);
    const open = (await api(app).get('/v1/admin/hr/leave?status=Open').set(auth(t.uniteAdmin)).expect(200)).body.data;
    await api(app).post(`/v1/admin/hr/leave/${open[0].id}/decide`).set(auth(t.uniteAdmin)).send({ decision: 'approve' }).expect(200);
    await api(app).post(`/v1/admin/hr/leave/${open[0].id}/decide`).set(auth(t.uniteAdmin)).send({ decision: 'reject' }).expect(409);
    const pay = (await api(app).get('/v1/admin/payroll/overview').set(auth(t.finance)).expect(200)).body;
    expect(pay.data.gross - pay.data.deductions).toBe(pay.data.net);
    expect(pay.data.statutory.pf).toBeGreaterThan(0);
    const post = await api(app).post('/v1/admin/finance-books/post-commission').set(auth(t.finance)).expect(409);
    expect(post.body.message).toMatch(/sample data cannot be posted/);
  });

  it('connected: reads people, leave and attendance with the API token, never asking for personal fields', async () => {
    connect();
    const st = (await api(app).get('/v1/admin/erp/status').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(st).toMatchObject({ source: 'erpnext', site: `127.0.0.1:${PORT}`, commissionAccountsSet: false });
    const hr = (await api(app).get('/v1/admin/hr/overview').set(auth(t.uniteAdmin)).expect(200)).body;
    expect(hr).toMatchObject({ source: 'erpnext', data: { headcount: 3, pendingLeave: 1, attendance: { present: 2, onLeave: 1, marked: 3 } } });
    expect(hr.data.byCompany).toEqual([{ company: 'Powertek', headcount: 1, departments: 1 }, { company: 'Unite Solar', headcount: 2, departments: 2 }]);
    const emps = (await api(app).get('/v1/admin/hr/employees?q=engineer').set(auth(t.uniteAdmin)).expect(200)).body.data;
    expect(emps.map((e: any) => e.name)).toEqual(['Sahil Rao']);
    expect(JSON.stringify(emps)).not.toMatch(/ABCDE1234F|1990-01-01/);
    const empCall = fake.seen.find((s) => s.path === '/api/resource/Employee');
    expect(empCall?.auth).toBe('token k1:s1');
    expect(empCall?.fields).not.toEqual(expect.arrayContaining(['date_of_birth']));
    expect(empCall?.fields).toEqual(['name', 'employee_name', 'designation', 'department', 'company', 'status', 'date_of_joining', 'branch']); // nothing personal: no PAN, bank, birth date or address
  });

  it('connected: approving leave updates and submits the application in ERPNext', async () => {
    const r = await api(app).post('/v1/admin/hr/leave/HR-LAP-2026-00001/decide').set(auth(t.uniteAdmin)).send({ decision: 'approve' }).expect(200);
    expect(r.body).toMatchObject({ source: 'erpnext', data: { status: 'Approved' } });
    expect(fake.db['Leave Application'][0]).toMatchObject({ status: 'Approved', docstatus: 1 });
    const calls = fake.seen.filter((s) => s.path.includes('HR-LAP-2026-00001') || s.path.endsWith('frappe.client.submit')).map((s) => s.method);
    expect(calls).toEqual(['PUT', 'GET', 'POST']);
    expect((await pool.query("select count(*)::int n from audit_events where action = 'hr.leave_decided'")).rows[0].n).toBe(2);
  });

  it('connected: payroll totals and statutory deductions come from the latest salary slips', async () => {
    const p = (await api(app).get('/v1/admin/payroll/overview').set(auth(t.finance)).expect(200)).body;
    expect(p.data).toMatchObject({ period: { start: '2026-10-01', end: '2026-10-31' }, employees: 2, gross: 109000, deductions: 10983, net: 98017, statutory: { pf: 2940, esi: 143, pt: 400, tds: 7500, lwf: 0, other: 0 } });
    const books = (await api(app).get('/v1/admin/finance-books/overview').set(auth(t.finance)).expect(200)).body;
    expect(books.data[0]).toMatchObject({ company: 'Unite Solar', receivable: 200000, payable: 120000, salesThisMonth: 500000, overdueInvoices: 1 });
  });

  it('connected: approved commission posts once as a balanced journal entry; failures are recorded, never duplicated', async () => {
    await api(app).post('/v1/admin/finance-books/post-commission').set(auth(t.uniteAdmin)).expect(403);
    const noAccounts = await api(app).post('/v1/admin/finance-books/post-commission').set(auth(t.finance)).expect(409);
    expect(noAccounts.body.message).toMatch(/CA needs to choose/);
    connect({ ERPNEXT_COMMISSION_EXPENSE_ACCOUNT: 'Commission Paid - US', ERPNEXT_COMMISSION_PAYABLE_ACCOUNT: 'Creditors - US', ERPNEXT_TDS_PAYABLE_ACCOUNT: 'TDS Payable - US', ERPNEXT_GST_INPUT_ACCOUNT: 'Input GST - US' });
    // Two finance-approved lines: one with GST, one without.
    const ids = (await pool.query("select id from commission_entries order by created_at limit 2")).rows.map((r) => r.id);
    await pool.query("update commission_entries set status = 'approved', approved_at = now(), taxable = 600000, gst = 108000, tds = 30000, payable = 678000 where id = $1", [ids[0]]);
    await pool.query("update commission_entries set status = 'approved', approved_at = now(), taxable = 100000, gst = 0, tds = 5000, payable = 95000 where id = $1", [ids[1]]);
    await pool.query("update commission_entries set status = 'estimated' where id <> all($1) and status in ('approved','invoiced','settled')", [ids]);
    const r1 = (await api(app).post('/v1/admin/finance-books/post-commission').set(auth(t.finance)).expect(200)).body;
    expect(r1).toEqual({ posted: 2, failed: 0, considered: 2 });
    const jes = fake.db['Journal Entry'];
    expect(jes).toHaveLength(2);
    const je = jes.find((j) => j.cheque_no === `COLLABIZ-${ids[0]}`)!;
    expect(je).toMatchObject({ docstatus: 1, voucher_type: 'Journal Entry' });
    expect(je.accounts).toEqual([
      expect.objectContaining({ account: 'Commission Paid - US', debit_in_account_currency: 6000 }), expect.objectContaining({ account: 'Input GST - US', debit_in_account_currency: 1080 }),
      expect.objectContaining({ account: 'Creditors - US', credit_in_account_currency: 6780 }), expect.objectContaining({ account: 'TDS Payable - US', credit_in_account_currency: 300 }),
    ]);
    const r2 = (await api(app).post('/v1/admin/finance-books/post-commission').set(auth(t.finance)).expect(200)).body;
    expect(r2).toEqual({ posted: 0, failed: 0, considered: 0 }); // never twice
    // A lost local record is recovered from ERPNext by its reference instead of posting again.
    await pool.query('delete from erp_sync_records where source_id = $1', [ids[1]]);
    const r3 = (await api(app).post('/v1/admin/finance-books/post-commission').set(auth(t.finance)).expect(200)).body;
    expect(r3).toEqual({ posted: 1, failed: 0, considered: 1 });
    expect(fake.db['Journal Entry']).toHaveLength(2);
    const books = (await api(app).get('/v1/admin/finance-books/overview').set(auth(t.finance)).expect(200)).body;
    expect(books.commission).toMatchObject({ waiting: 0, posted: 2 });
  });

  it('connected: when ERPNext is down the screens say so clearly', async () => {
    fake.setDown(true);
    const r = await api(app).get('/v1/admin/hr/overview').set(auth(t.uniteAdmin)).expect(502);
    expect(r.body.message).toMatch(/^ERPNext: /);
    fake.setDown(false);
    Object.assign(process.env, { ERPNEXT_URL: 'http://127.0.0.1:1' }); resetConfigForTests();
    const down = await api(app).get('/v1/admin/hr/overview').set(auth(t.uniteAdmin)).expect(503);
    expect(down.body.message).toMatch(/unreachable|did not answer/);
  });
});
