'use client';
import { useState } from 'react';
import { Card, EmptyState, Icon, LoadingState, SearchInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, SourceBanner, WorkspaceNav, rupees } from '@/components/Workspace';
import { useQuery } from '@/lib/hooks';

interface Slip { id: string; employee: string; employeeName: string; company: string; gross: number; deductions: number; net: number }
interface Payroll { period: { start: string; end: string } | null; employees: number; gross: number; deductions: number; net: number; statutory: { pf: number; esi: number; pt: number; tds: number; lwf: number; other: number }; byCompany: { company: string; employees: number; gross: number; net: number }[]; slips: Slip[] }
const month = (d: string) => new Date(d).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/** Payroll — the latest pay run with Indian statutory deductions (data from ERPNext / India Payroll). Finance and super admins only. */
export default function WorkspacePayroll() {
  const q = useQuery<{ source: 'erpnext' | 'sample'; data: Payroll }>('/admin/payroll/overview');
  const [term, setTerm] = useState('');
  const p = q.data?.data;
  const st = p?.statutory;
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Payroll" sub="Salaries across the group with PF, ESI, professional tax, labour welfare fund and TDS — calculated and filed in ERPNext with India Payroll." chips={['Salary slips', 'PF · ESI · PT · LWF · TDS', 'ECR and ESI returns in ERPNext', 'Finance access only']} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data || !p || !st ? <LoadingState /> : (
        <>
          <SourceBanner source={q.data.source} />
          {!p.period ? <Card><EmptyState icon="value" title="No submitted pay run yet">Pay runs appear here once salary slips are submitted in ERPNext.</EmptyState></Card> : (
            <>
              <div className="cz-ws-kpis">
                {([['users', `${p.employees}`, 'Paid this run', month(p.period.start)], ['value', rupees(p.gross), 'Gross pay', 'before deductions'], ['earnings', rupees(p.deductions), 'Deductions', 'statutory and other'], ['check', rupees(p.net), 'Net pay', 'paid to employees']] as const).map(([icon, v, l, sub]) => (
                  <div key={l} className="cz-ws-kpi"><span className="cz-app-icon cz-tint-amber"><Icon name={icon} size={20} /></span><div><strong>{v}</strong><span>{l}</span><small>{sub}</small></div></div>
                ))}
              </div>
              <div className="cz-ws-cols">
                <Card title={`Salary slips — ${month(p.period.start)}`}>
                  <div style={{ marginBottom: 12 }}><SearchInput label="Find an employee" placeholder="Name or ID" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
                  <div className="cz-table-wrap"><table className="cz-table"><caption className="cz-sr-only">Salary slips</caption>
                    <thead><tr><th scope="col">Employee</th><th scope="col">Company</th><th scope="col" style={{ textAlign: 'right' }}>Gross</th><th scope="col" style={{ textAlign: 'right' }}>Deductions</th><th scope="col" style={{ textAlign: 'right' }}>Net</th></tr></thead>
                    <tbody>{p.slips.filter((s) => !term || `${s.employeeName} ${s.employee}`.toLowerCase().includes(term.toLowerCase())).map((s) => (
                      <tr key={s.id}><td><strong>{s.employeeName}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{s.employee}</span></td><td>{s.company}</td><td style={{ textAlign: 'right' }}>{rupees(s.gross)}</td><td style={{ textAlign: 'right' }}>{rupees(s.deductions)}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{rupees(s.net)}</td></tr>
                    ))}</tbody>
                  </table></div>
                </Card>
                <aside className="cz-ws-side">
                  <Card title="Statutory deductions">
                    <ul className="cz-ws-list">
                      {([['Provident Fund (employee)', st.pf], ['ESI (employee)', st.esi], ['Professional tax', st.pt], ['Labour welfare fund', st.lwf], ['TDS on salary', st.tds], ['Other deductions', st.other]] as const).map(([l, v]) => <li key={l}><span>{l}</span><strong style={{ color: 'var(--cz-navy-900)' }}>{rupees(v)}</strong></li>)}
                    </ul>
                    <p className="cz-muted" style={{ margin: '10px 0 0', fontSize: 12.5 }}>Employer PF and ESI contributions, challans, ECR and ESI returns are generated in ERPNext.</p>
                  </Card>
                  <Card title="By company">
                    <ul className="cz-ws-list">{p.byCompany.map((c) => <li key={c.company} style={{ alignItems: 'flex-start' }}><span>{c.company}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{c.employees} people · gross {rupees(c.gross)}</span></span><strong style={{ color: 'var(--cz-navy-900)' }}>{rupees(c.net)}</strong></li>)}</ul>
                  </Card>
                </aside>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
