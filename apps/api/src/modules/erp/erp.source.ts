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
export interface ErpSource {
  kind: 'erpnext' | 'sample';
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
