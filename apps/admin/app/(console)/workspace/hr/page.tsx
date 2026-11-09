'use client';
import { useState } from 'react';
import { Alert, Button, Card, EmptyState, Icon, LoadingState, SearchInput, Segmented, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, SourceBanner, WorkspaceNav } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type Src<T> = { source: 'erpnext' | 'sample'; data: T };
interface Overview { headcount: number; joinersThisMonth: number; pendingLeave: number; attendance: { present: number; absent: number; onLeave: number; marked: number }; byCompany: { company: string; headcount: number; departments: number }[]; departments: { company: string; department: string; headcount: number }[] }
interface Employee { id: string; name: string; designation: string | null; department: string | null; company: string; status: string; joined: string | null; branch: string | null }
interface Leave { id: string; employee: string; employeeName: string; leaveType: string; from: string; to: string; days: number; status: string; company: string; reason: string | null }
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Human Resources — people, departments, attendance and leave across the group (data from ERPNext / Frappe HR). */
export default function WorkspaceHR() {
  const ov = useQuery<Src<Overview>>('/admin/hr/overview');
  const [tab, setTab] = useState('leave');
  const [term, setTerm] = useState('');
  const [company, setCompany] = useState('');
  const emps = useQuery<Src<Employee[]>>(tab === 'people' ? `/admin/hr/employees?${new URLSearchParams({ ...(term ? { q: term } : {}), ...(company ? { company } : {}) })}` : null);
  const leave = useQuery<Src<Leave[]>>(tab === 'leave' ? '/admin/hr/leave' : null);
  const decide = useMutation(async (id: string, decision: 'approve' | 'reject') => { const r = await api.post(`/admin/hr/leave/${encodeURIComponent(id)}/decide`, { decision }); leave.reload(); ov.reload(); return r; });
  const o = ov.data?.data;
  const open = (leave.data?.data ?? []).filter((l) => l.status === 'Open');
  const decided = (leave.data?.data ?? []).filter((l) => l.status !== 'Open');
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Human" accent="Resources" sub="People, departments, attendance and leave across every Unite company — one record per person, kept in ERPNext (Frappe HR)." chips={['Employees and departments', 'Attendance', 'Leave approvals', 'Indian payroll ready']} />
      {ov.error ? <ApiErrorView error={ov.error} onRetry={ov.reload} /> : !ov.data || !o ? <LoadingState /> : (
        <>
          <SourceBanner source={ov.data.source} />
          <div className="cz-ws-kpis">
            {([['users', o.headcount, 'Employees', `${o.byCompany.length} companies`], ['plus', o.joinersThisMonth, 'Joined this month', 'new starters'], ['check', o.attendance.present, 'Present today', `${o.attendance.marked} marked`], ['calendar', o.attendance.onLeave, 'On leave today', `${o.attendance.absent} absent`], ['clock', o.pendingLeave, 'Leave to approve', 'waiting for a decision']] as const).map(([icon, v, l, sub]) => (
              <div key={l} className="cz-ws-kpi"><span className="cz-app-icon cz-tint-green"><Icon name={icon} size={20} /></span><div><strong>{v}</strong><span>{l}</span><small>{sub}</small></div></div>
            ))}
          </div>
          <div className="cz-ws-scroll"><Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'leave', label: `Leave ${o.pendingLeave ? `· ${o.pendingLeave} to approve` : ''}` }, { value: 'people', label: 'People' }, { value: 'departments', label: 'Departments' }]} /></div>
          {tab === 'leave' && (leave.error ? <ApiErrorView error={leave.error} onRetry={leave.reload} /> : !leave.data ? <LoadingState /> : (
            <>
              {decide.error && <Alert tone="danger">{decide.error}</Alert>}
              <Card title="Waiting for approval">
                {!open.length ? <EmptyState icon="check" title="No leave waiting for a decision" /> : (
                  <ul className="cz-stack" style={{ gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
                    {open.map((l) => (
                      <li key={l.id} className="cz-card cz-lead" data-leave={l.employeeName}>
                        <div className="cz-lead-head"><strong>{l.employeeName}</strong><span className="cz-muted">{l.company} · {l.leaveType}</span></div>
                        <span>{day(l.from)} – {day(l.to)} · {l.days} day{l.days === 1 ? '' : 's'}{l.reason ? ` · “${l.reason}”` : ''}</span>
                        <div className="cz-row" style={{ gap: 8 }}><Button size="sm" loading={decide.pending} onClick={() => decide.run(l.id, 'approve')}>Approve</Button><Button size="sm" variant="secondary" onClick={() => decide.run(l.id, 'reject')}>Reject</Button></div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {decided.length > 0 && (
                <Card title="Recently decided">
                  <ul className="cz-ws-list">{decided.slice(0, 10).map((l) => <li key={l.id}><span>{l.employeeName} · {l.leaveType} · {day(l.from)}</span><StatusBadge status={l.status.toLowerCase()} tone={l.status === 'Approved' ? 'success' : 'neutral'} label={l.status} /></li>)}</ul>
                </Card>
              )}
            </>
          ))}
          {tab === 'people' && (
            <Card>
              <div className="cz-row" style={{ gap: 12, marginBottom: 12 }}>
                <SearchInput label="Search people" placeholder="Name, role or department" value={term} onChange={(e) => setTerm(e.target.value)} />
                <select className="cz-select" aria-label="Company" value={company} onChange={(e) => setCompany(e.target.value)} style={{ maxWidth: 240 }}><option value="">All companies</option>{o.byCompany.map((c) => <option key={c.company}>{c.company}</option>)}</select>
              </div>
              {emps.error ? <ApiErrorView error={emps.error} onRetry={emps.reload} /> : !emps.data ? <LoadingState /> : !emps.data.data.length ? <EmptyState icon="users" title="Nobody matches" /> : (
                <div className="cz-table-wrap"><table className="cz-table"><caption className="cz-sr-only">Employees</caption>
                  <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Department</th><th scope="col">Company</th><th scope="col">Joined</th></tr></thead>
                  <tbody>{emps.data.data.map((e) => <tr key={e.id}><td><strong>{e.name}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{e.id}</span></td><td>{e.designation ?? '—'}</td><td>{e.department ?? '—'}</td><td>{e.company}{e.branch ? <><br /><span className="cz-muted" style={{ fontSize: 12 }}>{e.branch}</span></> : null}</td><td>{day(e.joined)}</td></tr>)}</tbody>
                </table></div>
              )}
            </Card>
          )}
          {tab === 'departments' && (
            <div className="cz-company-grid">
              {o.byCompany.map((c) => (
                <article key={c.company} className="cz-company">
                  <div className="cz-company-head"><strong>{c.company}</strong><span className="cz-company-cat cz-tint-green">{c.headcount} people</span></div>
                  <ul className="cz-ws-list">{o.departments.filter((d) => d.company === c.company).map((d) => <li key={d.department}><span>{d.department}</span><span className="cz-ws-count">{d.headcount}</span></li>)}</ul>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
