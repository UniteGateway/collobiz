/**
 * Where HR, payroll and accounting data comes from.
 *  - `erpnext`: the connected ERPNext site (ERPNEXT_URL + API key/secret). The system of record.
 *  - `sample`: built-in illustrative data, used only when ERPNext is not connected AND the platform runs in demo mode.
 *    Every response says so, and nothing can be posted to it.
 *  - none: screens show "Connect ERPNext".
 * Personal data is limited to what the screens need: no date of birth, PAN, bank or address fields are ever requested.
 */
import { config } from '../../config';
import { ErpnextClient } from './erpnext.client';

export interface Employee { id: string; name: string; designation: string | null; department: string | null; company: string; status: string; joined: string | null; branch: string | null }
export interface LeaveRequest { id: string; employee: string; employeeName: string; leaveType: string; from: string; to: string; days: number; status: string; company: string; reason: string | null }
export interface Slip { id: string; employee: string; employeeName: string; company: string; gross: number; deductions: number; net: number }
export interface Payroll { period: { start: string; end: string } | null; slips: Slip[]; statutory: { pf: number; esi: number; pt: number; tds: number; lwf: number; other: number } }
export interface CompanyBooks { company: string; receivable: number; payable: number; salesThisMonth: number; purchasesThisMonth: number; overdueInvoices: number }
export interface StockRow { item: string; itemName: string; warehouse: string; qty: number; projected: number; reserved: number; value: number; uom: string }
export interface Movement { id: string; type: string; date: string; company: string; value: number; status: string }
export interface WorkOrder { id: string; item: string; itemName: string; qty: number; produced: number; status: string; start: string | null; due: string | null; company: string }
export interface PosSale { id: string; date: string; customer: string; store: string; amount: number; company: string }
export interface PurchaseOrder { id: string; supplier: string; date: string; due: string | null; amount: number; received: number; status: string; company: string }
export interface Dispatch { id: string; customer: string; date: string; status: string; transporter: string | null; vehicle: string | null; lrNo: string | null; company: string; amount: number }
export interface Ops { stock: StockRow[]; movements: Movement[]; workOrders: WorkOrder[]; boms: number; pos: PosSale[]; purchaseOrders: PurchaseOrder[]; openMaterialRequests: number; dispatches: Dispatch[] }
export interface ErpSource {
  kind: 'erpnext' | 'sample';
  ops(part: 'inventory' | 'manufacturing' | 'pos' | 'procurement'): Promise<Partial<Ops>>;
  employees(): Promise<Employee[]>;
  leave(status?: string): Promise<LeaveRequest[]>;
  decideLeave(id: string, decision: 'Approved' | 'Rejected'): Promise<LeaveRequest>;
  attendanceToday(): Promise<{ present: number; absent: number; onLeave: number; marked: number }>;
  payroll(): Promise<Payroll>;
  books(): Promise<CompanyBooks[]>;
}

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
/** Map a salary component name to a statutory bucket (amounts in rupees). */
export function bucket(component: string): keyof Payroll['statutory'] {
  if (/provident|\bpf\b|epf/i.test(component)) return 'pf';
  if (/\besi|employee.?s state/i.test(component)) return 'esi';
  if (/professional tax|\bpt\b/i.test(component)) return 'pt';
  if (/\btds\b|income tax/i.test(component)) return 'tds';
  if (/\blwf\b|labour welfare/i.test(component)) return 'lwf';
  return 'other';
}

export class ErpnextSource implements ErpSource {
  kind = 'erpnext' as const;
  constructor(public client: ErpnextClient) {}

  async employees() {
    const rows = await this.client.list<any>('Employee', { fields: ['name', 'employee_name', 'designation', 'department', 'company', 'status', 'date_of_joining', 'branch'], filters: [['status', '!=', 'Left']], orderBy: 'employee_name asc', limit: 5000 });
    return rows.map((r) => ({ id: r.name, name: r.employee_name, designation: r.designation ?? null, department: r.department ?? null, company: r.company, status: r.status, joined: r.date_of_joining ?? null, branch: r.branch ?? null }));
  }
  private leaveRow = (r: any): LeaveRequest => ({ id: r.name, employee: r.employee, employeeName: r.employee_name, leaveType: r.leave_type, from: r.from_date, to: r.to_date, days: Number(r.total_leave_days ?? 0), status: r.status, company: r.company, reason: r.description ?? null });
  async leave(status?: string) {
    const rows = await this.client.list<any>('Leave Application', { fields: ['name', 'employee', 'employee_name', 'leave_type', 'from_date', 'to_date', 'total_leave_days', 'status', 'company', 'description'], filters: status ? [['status', '=', status]] : [], orderBy: 'from_date desc', limit: 300 });
    return rows.map(this.leaveRow);
  }
  /** Sets the decision, then submits the application (Frappe HR requires submission for approved/rejected leave). */
  async decideLeave(id: string, decision: 'Approved' | 'Rejected') {
    await this.client.update('Leave Application', id, { status: decision });
    const doc = await this.client.get<Record<string, unknown>>('Leave Application', id);
    const done = await this.client.submit<any>(doc);
    return this.leaveRow(done);
  }
  async attendanceToday() {
    const rows = await this.client.list<{ status: string }>('Attendance', { fields: ['status'], filters: [['attendance_date', '=', today()], ['docstatus', '=', 1]], limit: 10000 });
    return { present: rows.filter((r) => r.status === 'Present' || r.status === 'Work From Home').length, absent: rows.filter((r) => r.status === 'Absent').length, onLeave: rows.filter((r) => r.status === 'On Leave').length, marked: rows.length };
  }
  async payroll(): Promise<Payroll> {
    const [last] = await this.client.list<any>('Salary Slip', { fields: ['start_date', 'end_date'], filters: [['docstatus', '=', 1]], orderBy: 'start_date desc', limit: 1 });
    const empty = { pf: 0, esi: 0, pt: 0, tds: 0, lwf: 0, other: 0 };
    if (!last) return { period: null, slips: [], statutory: empty };
    const f: [string, string, unknown][] = [['docstatus', '=', 1], ['start_date', '=', last.start_date]];
    const slips = await this.client.list<any>('Salary Slip', { fields: ['name', 'employee', 'employee_name', 'company', 'gross_pay', 'total_deduction', 'net_pay'], filters: f, limit: 10000 });
    const lines = await this.client.list<any>('Salary Slip', { fields: ['name', 'deductions.salary_component as component', 'deductions.amount as amount'], filters: f, limit: 100000 });
    const statutory = { ...empty };
    for (const l of lines) if (l.component) statutory[bucket(l.component)] += Number(l.amount ?? 0);
    return { period: { start: last.start_date, end: last.end_date }, statutory, slips: slips.map((s) => ({ id: s.name, employee: s.employee, employeeName: s.employee_name, company: s.company, gross: Number(s.gross_pay), deductions: Number(s.total_deduction), net: Number(s.net_pay) })) };
  }
  async ops(part: 'inventory' | 'manufacturing' | 'pos' | 'procurement'): Promise<Partial<Ops>> {
    const c = this.client;
    if (part === 'inventory') {
      const [bins, items, ses, dns] = await Promise.all([
        c.list<any>('Bin', { fields: ['item_code', 'warehouse', 'actual_qty', 'projected_qty', 'reserved_qty', 'stock_value', 'stock_uom'], limit: 20000 }),
        c.list<any>('Item', { fields: ['item_code', 'item_name'], filters: [['disabled', '=', 0]], limit: 20000 }),
        c.list<any>('Stock Entry', { fields: ['name', 'stock_entry_type', 'posting_date', 'company', 'total_outgoing_value', 'total_incoming_value', 'docstatus'], orderBy: 'posting_date desc', limit: 15 }),
        c.list<any>('Delivery Note', { fields: ['name', 'customer', 'posting_date', 'status', 'transporter_name', 'vehicle_no', 'lr_no', 'company', 'grand_total'], filters: [['docstatus', '<', 2]], orderBy: 'posting_date desc', limit: 20 }),
      ]);
      const names = new Map(items.map((i) => [i.item_code, i.item_name]));
      return {
        stock: bins.map((b) => ({ item: b.item_code, itemName: names.get(b.item_code) ?? b.item_code, warehouse: b.warehouse, qty: Number(b.actual_qty ?? 0), projected: Number(b.projected_qty ?? 0), reserved: Number(b.reserved_qty ?? 0), value: Number(b.stock_value ?? 0), uom: b.stock_uom ?? 'Nos' })),
        movements: ses.map((x) => ({ id: x.name, type: x.stock_entry_type, date: x.posting_date, company: x.company, value: Number(x.total_incoming_value || x.total_outgoing_value || 0), status: ['Draft', 'Submitted', 'Cancelled'][x.docstatus ?? 0] })),
        dispatches: dns.map((d) => ({ id: d.name, customer: d.customer, date: d.posting_date, status: d.status, transporter: d.transporter_name ?? null, vehicle: d.vehicle_no ?? null, lrNo: d.lr_no ?? null, company: d.company, amount: Number(d.grand_total ?? 0) })),
      };
    }
    if (part === 'manufacturing') {
      const [wos, boms] = await Promise.all([
        c.list<any>('Work Order', { fields: ['name', 'production_item', 'item_name', 'qty', 'produced_qty', 'status', 'planned_start_date', 'expected_delivery_date', 'company'], filters: [['docstatus', '<', 2]], orderBy: 'planned_start_date desc', limit: 200 }),
        c.list<any>('BOM', { fields: ['name'], filters: [['is_active', '=', 1], ['docstatus', '=', 1]], limit: 5000 }),
      ]);
      return { boms: boms.length, workOrders: wos.map((w) => ({ id: w.name, item: w.production_item, itemName: w.item_name ?? w.production_item, qty: Number(w.qty ?? 0), produced: Number(w.produced_qty ?? 0), status: w.status, start: w.planned_start_date ?? null, due: w.expected_delivery_date ?? null, company: w.company })) };
    }
    if (part === 'pos') {
      const since = monthStart();
      const rows = await c.list<any>('POS Invoice', { fields: ['name', 'posting_date', 'customer', 'pos_profile', 'grand_total', 'company'], filters: [['docstatus', '=', 1], ['posting_date', '>=', since]], orderBy: 'posting_date desc', limit: 20000 });
      return { pos: rows.map((r) => ({ id: r.name, date: r.posting_date, customer: r.customer, store: r.pos_profile ?? 'Store', amount: Number(r.grand_total ?? 0), company: r.company })) };
    }
    const [pos, mrs] = await Promise.all([
      c.list<any>('Purchase Order', { fields: ['name', 'supplier', 'transaction_date', 'schedule_date', 'grand_total', 'per_received', 'status', 'company'], filters: [['docstatus', '<', 2]], orderBy: 'transaction_date desc', limit: 200 }),
      c.list<any>('Material Request', { fields: ['name'], filters: [['docstatus', '=', 1], ['status', 'in', ['Pending', 'Partially Ordered']]], limit: 5000 }),
    ]);
    return { openMaterialRequests: mrs.length, purchaseOrders: pos.map((p) => ({ id: p.name, supplier: p.supplier, date: p.transaction_date, due: p.schedule_date ?? null, amount: Number(p.grand_total ?? 0), received: Number(p.per_received ?? 0), status: p.status, company: p.company })) };
  }

  async books() {
    const since = `${new Date().getFullYear() - 1}-01-01`;
    const [sales, purchases] = await Promise.all([
      this.client.list<any>('Sales Invoice', { fields: ['company', 'grand_total', 'outstanding_amount', 'posting_date', 'due_date'], filters: [['docstatus', '=', 1], ['posting_date', '>=', since]], limit: 50000 }),
      this.client.list<any>('Purchase Invoice', { fields: ['company', 'grand_total', 'outstanding_amount', 'posting_date'], filters: [['docstatus', '=', 1], ['posting_date', '>=', since]], limit: 50000 }),
    ]);
    const m = monthStart(), t = today();
    const companies = [...new Set([...sales, ...purchases].map((r) => r.company))].sort();
    return companies.map((company) => {
      const s = sales.filter((r) => r.company === company), p = purchases.filter((r) => r.company === company);
      return {
        company, receivable: s.reduce((a, r) => a + Number(r.outstanding_amount ?? 0), 0), payable: p.reduce((a, r) => a + Number(r.outstanding_amount ?? 0), 0),
        salesThisMonth: s.filter((r) => r.posting_date >= m).reduce((a, r) => a + Number(r.grand_total ?? 0), 0), purchasesThisMonth: p.filter((r) => r.posting_date >= m).reduce((a, r) => a + Number(r.grand_total ?? 0), 0),
        overdueInvoices: s.filter((r) => Number(r.outstanding_amount) > 0 && r.due_date && r.due_date < t).length,
      };
    });
  }
}

/** Deterministic illustrative data (fictional people) so the screens can be reviewed before ERPNext is connected. */
export class SampleSource implements ErpSource {
  kind = 'sample' as const;
  private static state: { emps: Employee[]; leaves: LeaveRequest[] } | null = null;
  private get s() {
    if (SampleSource.state) return SampleSource.state;
    let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const first = ['Aarav', 'Diya', 'Kabir', 'Ananya', 'Rohan', 'Isha', 'Vikram', 'Meera', 'Arjun', 'Kavya', 'Nikhil', 'Pooja', 'Sahil', 'Neha', 'Harish', 'Sneha', 'Manoj', 'Ritu'];
    const last = ['Sharma', 'Reddy', 'Iyer', 'Patel', 'Nair', 'Kulkarni', 'Das', 'Gupta', 'Rao', 'Menon'];
    const plan: [string, [string, string[]][]][] = [
      ['Unite Solar', [['Projects', ['Project Manager', 'Site Engineer', 'Site Engineer', 'Electrical Supervisor']], ['Sales', ['Sales Manager', 'Sales Executive', 'Sales Executive']], ['Operations & Maintenance', ['O&M Technician', 'O&M Technician']]]],
      ['Powertek', [['Production', ['Production Manager', 'Machine Operator', 'Machine Operator', 'Quality Inspector']], ['Stores', ['Store Keeper']], ['Dispatch', ['Logistics Coordinator']]]],
      ['Unite Exim', [['Trade Desk', ['Trade Manager', 'Documentation Executive']]]],
      ['Unite Group Inc.', [['Finance', ['Finance Controller', 'Accountant', 'Accountant']], ['Human Resources', ['HR Manager', 'HR Executive']]]],
    ];
    const emps: Employee[] = [];
    let n = 1;
    for (const [company, depts] of plan) for (const [dept, roles] of depts) for (const role of roles) {
      const yr = 2019 + Math.floor(rnd() * 7);
      emps.push({ id: `HR-EMP-${String(n++).padStart(5, '0')}`, name: `${first[Math.floor(rnd() * first.length)]} ${last[Math.floor(rnd() * last.length)]}`, designation: role, department: dept, company, status: 'Active', joined: `${yr}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-01`, branch: company === 'Powertek' ? 'Hyderabad Plant' : company === 'Unite Exim' ? 'Mumbai' : 'Hyderabad' });
    }
    const d = (off: number) => new Date(Date.now() + off * 86400_000).toISOString().slice(0, 10);
    const leaves: LeaveRequest[] = [
      [2, 'Casual Leave', 1, 2, 'Open', 'Family function'], [5, 'Sick Leave', 0, 1, 'Open', 'Fever'], [9, 'Earned Leave', 7, 11, 'Open', 'Travel to hometown'],
      [13, 'Casual Leave', 3, 3, 'Open', null], [17, 'Earned Leave', -12, -8, 'Approved', 'Vacation'], [21, 'Sick Leave', -4, -4, 'Rejected', 'Overlaps month-end closing'],
    ].map(([i, type, a, b, status, reason], k) => {
      const e = emps[(i as number) % emps.length];
      return { id: `HR-LAP-2026-${String(k + 1).padStart(5, '0')}`, employee: e.id, employeeName: e.name, leaveType: type as string, from: d(a as number), to: d(b as number), days: (b as number) - (a as number) + 1, status: status as string, company: e.company, reason: reason as string | null };
    });
    SampleSource.state = { emps, leaves };
    return SampleSource.state;
  }
  async employees() { return this.s.emps; }
  async leave(status?: string) { return this.s.leaves.filter((l) => !status || l.status === status); }
  async decideLeave(id: string, decision: 'Approved' | 'Rejected') {
    const l = this.s.leaves.find((x) => x.id === id);
    if (!l) throw Object.assign(new Error('Leave application not found'), { status: 404 });
    if (l.status !== 'Open') throw Object.assign(new Error('This leave application has already been decided'), { status: 409 });
    l.status = decision;
    return l;
  }
  async attendanceToday() { const n = this.s.emps.length; const onLeave = this.s.leaves.filter((l) => l.status === 'Approved' && l.from <= today() && l.to >= today()).length; return { present: n - 2 - onLeave, absent: 2, onLeave, marked: n }; }
  async payroll(): Promise<Payroll> {
    const d = new Date(); const start = new Date(d.getFullYear(), d.getMonth() - 1, 1); const end = new Date(d.getFullYear(), d.getMonth(), 0);
    const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    const grossFor = (role: string | null) => (/Manager|Controller/.test(role ?? '') ? 95000 : /Engineer|Supervisor|Accountant|Executive|Inspector|Coordinator/.test(role ?? '') ? 38000 : 19500);
    const statutory = { pf: 0, esi: 0, pt: 0, tds: 0, lwf: 0, other: 0 };
    const slips = this.s.emps.map((e, i) => {
      const gross = grossFor(e.designation);
      const pf = Math.round(Math.min(gross * 0.5, 15000) * 0.12);
      const esi = gross <= 21000 ? Math.round(gross * 0.0075) : 0;
      const pt = 200;
      const tds = gross > 75000 ? Math.round(((gross * 12 - 1200000) * 0.1) / 12) : 0;
      statutory.pf += pf; statutory.esi += esi; statutory.pt += pt; statutory.tds += Math.max(0, tds);
      const ded = pf + esi + pt + Math.max(0, tds);
      return { id: `Sal Slip/${e.id}/${String(i + 1).padStart(5, '0')}`, employee: e.id, employeeName: e.name, company: e.company, gross, deductions: ded, net: gross - ded };
    });
    return { period: { start: fmt(start), end: fmt(end) }, slips, statutory };
  }
  async ops(part: 'inventory' | 'manufacturing' | 'pos' | 'procurement'): Promise<Partial<Ops>> {
    const d = (off: number) => new Date(Date.now() + off * 86400_000).toISOString().slice(0, 10);
    if (part === 'inventory') {
      const items: [string, string, string, number, number, number][] = [
        ['PT-040', 'Distribution Transformers', 'Finished Goods - PT', 6, 2, 3850000], ['PT-049', 'PCC Panels', 'Finished Goods - PT', 4, 4, 1240000], ['PT-063', 'Ring Main Units (RMU)', 'Finished Goods - PT', 1, 3, 860000],
        ['PT-001', 'Mono PERC Solar PV Modules', 'Main Store - US', 820, 0, 9020000], ['PT-009', 'Hybrid Solar Inverters', 'Main Store - US', 14, 6, 1610000], ['PT-106', 'Solar Water Pumps', 'Main Store - US', 9, 12, 1305000],
        ['PT-182', 'AC EV Chargers', 'Main Store - US', 0, 4, 0], ['PT-084', 'Battery Racks & Cabinets', 'Finished Goods - PT', 11, 0, 935000],
      ];
      return {
        stock: items.map(([item, itemName, warehouse, qty, reserved, value]) => ({ item, itemName, warehouse, qty, reserved, projected: qty - reserved, value, uom: 'Nos' })),
        movements: [
          { id: 'MAT-STE-2026-00118', type: 'Material Receipt', date: d(-1), company: 'Unite Solar', value: 2640000, status: 'Submitted' },
          { id: 'MAT-STE-2026-00117', type: 'Manufacture', date: d(-2), company: 'Powertek', value: 1925000, status: 'Submitted' },
          { id: 'MAT-STE-2026-00116', type: 'Material Transfer', date: d(-3), company: 'Powertek', value: 410000, status: 'Submitted' },
          { id: 'MAT-STE-2026-00115', type: 'Material Issue', date: d(-5), company: 'Unite Solar', value: 182000, status: 'Submitted' },
        ],
        dispatches: [
          { id: 'MAT-DN-2026-00042', customer: 'Shree Ganesh Polymers', date: d(-1), status: 'To Bill', transporter: 'Deccan Roadways', vehicle: 'TS09UB4521', lrNo: 'LR-88213', company: 'Unite Solar', amount: 2310000 },
          { id: 'MAT-DN-2026-00041', customer: 'Vindhya Infra Projects', date: d(-2), status: 'Completed', transporter: 'Krishna Logistics', vehicle: 'MP09HG7713', lrNo: 'LR-55102', company: 'Powertek', amount: 1925000 },
          { id: 'MAT-DN-2026-00040', customer: 'Thar Solar Parks', date: d(-4), status: 'To Bill', transporter: null, vehicle: null, lrNo: null, company: 'Unite Solar', amount: 640000 },
        ],
      };
    }
    if (part === 'manufacturing') return {
      boms: 12,
      workOrders: [
        { id: 'MFG-WO-2026-00031', item: 'PT-040', itemName: 'Distribution Transformers (1000 kVA)', qty: 4, produced: 1, status: 'In Process', start: d(-6), due: d(8), company: 'Powertek' },
        { id: 'MFG-WO-2026-00030', item: 'PT-049', itemName: 'PCC Panels', qty: 6, produced: 6, status: 'Completed', start: d(-14), due: d(-2), company: 'Powertek' },
        { id: 'MFG-WO-2026-00029', item: 'PT-063', itemName: 'Ring Main Units (RMU)', qty: 3, produced: 0, status: 'Not Started', start: d(2), due: d(16), company: 'Powertek' },
        { id: 'MFG-WO-2026-00028', item: 'PT-084', itemName: 'Battery Racks & Cabinets', qty: 10, produced: 4, status: 'In Process', start: d(-9), due: d(-1), company: 'Powertek' },
      ],
    };
    if (part === 'pos') {
      const stores = ['Solar Experience Centre — Hyderabad', 'Franchise Store — Vijayawada', 'Franchise Store — Pune'];
      return { pos: Array.from({ length: 18 }, (_, i) => ({ id: `ACC-PSINV-2026-${String(200 + i).padStart(5, '0')}`, date: d(-(i % 6)), customer: ['Walk-in Customer', 'Ravi Kumar', 'Walk-in Customer', 'Lakshmi Traders', 'Walk-in Customer', 'Sai Agro Farms'][i % 6], store: stores[i % 3], amount: [18500, 42000, 7600, 126000, 9900, 64000][i % 6], company: 'Unite Solar' })) };
    }
    return {
      openMaterialRequests: 5,
      purchaseOrders: [
        { id: 'PUR-ORD-2026-00087', supplier: 'Sunrise Traders', date: d(-3), due: d(7), amount: 1840000, received: 0, status: 'To Receive and Bill', company: 'Powertek' },
        { id: 'PUR-ORD-2026-00086', supplier: 'Andhra Copper Works', date: d(-8), due: d(-1), amount: 2620000, received: 60, status: 'To Receive and Bill', company: 'Powertek' },
        { id: 'PUR-ORD-2026-00085', supplier: 'Deccan Distributors', date: d(-12), due: d(-5), amount: 740000, received: 100, status: 'To Bill', company: 'Unite Solar' },
        { id: 'PUR-ORD-2026-00084', supplier: 'Sunrise Traders', date: d(-20), due: d(-10), amount: 455000, received: 100, status: 'Completed', company: 'Unite Solar' },
      ],
    };
  }

  async books() {
    return [
      { company: 'Unite Solar', receivable: 18450000, payable: 6230000, salesThisMonth: 9200000, purchasesThisMonth: 4100000, overdueInvoices: 3 },
      { company: 'Powertek', receivable: 12600000, payable: 8840000, salesThisMonth: 7400000, purchasesThisMonth: 5200000, overdueInvoices: 2 },
      { company: 'Unite Exim', receivable: 4300000, payable: 2900000, salesThisMonth: 2100000, purchasesThisMonth: 1650000, overdueInvoices: 1 },
    ];
  }
}

export function erpSource(): ErpSource | null {
  const c = config();
  if (c.ERPNEXT_URL && c.ERPNEXT_API_KEY && c.ERPNEXT_API_SECRET) return new ErpnextSource(new ErpnextClient(c.ERPNEXT_URL, c.ERPNEXT_API_KEY, c.ERPNEXT_API_SECRET));
  if (c.DEMO_MODE || c.NODE_ENV === 'test') return new SampleSource();
  return null;
}
export const resetSampleForTests = () => { (SampleSource as unknown as { state: unknown }).state = null; };
