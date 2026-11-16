'use client';
import { useState } from 'react';
import { Badge, Card, Notice, Select } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { api, useApi } from '@/lib/client';

interface User { id: string; name: string; email: string; role: string }
interface Entry { id: string; at: string; action: string; entity: string; by: string }
interface Tariff { provenance: string; status: string }
const ROLES = [{ value: 'admin', label: 'Admin — everything, approves tariff changes' }, { value: 'analyst', label: 'Analyst — edits inputs, proposes changes, runs checks' }, { value: 'viewer', label: 'Viewer — reads and downloads' }];

/** Settings: your account, people and roles (admin), data sources and their status, recent activity (admin). */
export default function Settings() {
  const me = useApi<{ name: string; email: string; role: string }>('/api/me');
  const admin = me.data?.role === 'admin';
  const users = useApi<{ users: User[] }>(admin ? '/api/users' : null);
  const log = useApi<{ entries: Entry[] }>(admin ? '/api/audit' : null);
  const tariffs = useApi<{ records: Tariff[] }>('/api/tariffs');
  const auto = useApi<{ schedulerConfigured: boolean }>('/api/automation');
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string }>();
  const setRole = async (u: User, role: string) => {
    setMsg(undefined);
    try { await api(`/api/users/${u.id}`, { method: 'POST', body: JSON.stringify({ role }) }); await users.reload(); setMsg({ tone: 'green', text: `${u.name} is now ${role}.` }); }
    catch (e) { setMsg({ tone: 'red', text: (e as Error).message }); }
  };
  const live = (tariffs.data?.records ?? []).filter((r) => r.status === 'approved');
  const illus = live.filter((r) => r.provenance === 'illustrative').length;
  const sources: [string, React.ReactNode, string][] = [
    ['Climate / irradiance', <Badge key="c" tone="amber">Illustrative</Badge>, 'PVGIS and NASA POWER are not reachable from this environment; the solar model runs on illustrative monthly climate inputs, calibrated to a CUF target when you set one.'],
    ['Tariff records', illus ? <Badge key="t" tone="amber">{illus} of {live.length} illustrative</Badge> : <Badge key="t" tone="green">All verified or user-entered</Badge>, 'Change values on the AP Open Access and Interstate pages; an admin approves each change and the old version is kept.'],
    ['Prices (PPA, peak, merchant)', <Badge key="p" tone="blue">Per project</Badge>, 'Edit them in Project Configuration; each price carries its own provenance label.'],
    ['Cost assumptions', <Badge key="f" tone="amber">Illustrative by default</Badge>, 'Set quotation or actual figures on Financial Analysis.'],
    ['Scheduled automation', auto.data?.schedulerConfigured ? <Badge key="a" tone="green">Configured</Badge> : <Badge key="a" tone="amber">Not configured</Badge>, 'Needs an external scheduler and the AUTOMATION_TOKEN secret in the deployment.'],
  ];
  return (
    <>
      <PageTitle title="Settings" subtitle="Your account, who can do what, and where every input comes from." />
      {msg && <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Your account">
          {me.data ? <dl className="grid gap-2 text-sm"><div><dt className="text-slate-500">Name</dt><dd className="font-medium">{me.data.name}</dd></div><div><dt className="text-slate-500">Email</dt><dd>{me.data.email}</dd></div><div><dt className="text-slate-500">Role</dt><dd><Badge tone="blue">{me.data.role}</Badge></dd></div></dl> : <p className="text-sm text-slate-500">Loading…</p>}
        </Card>
        <Card title="Data sources" subtitle="What the results rest on" className="xl:col-span-2">
          <ul className="grid gap-3">{sources.map(([name, badge, text]) => <li key={name} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-sm font-medium">{name}</div><div className="text-[12.5px] text-slate-500 dark:text-slate-400">{text}</div></div><div className="shrink-0">{badge}</div></li>)}</ul>
        </Card>
      </div>
      {admin && (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card title="People and roles" subtitle="You cannot change your own role; at least one admin always remains">
            <ul className="grid gap-3">{(users.data?.users ?? []).map((u) => (
              <li key={u.id} className="flex flex-wrap items-end justify-between gap-2"><div><div className="text-sm font-medium">{u.name}</div><div className="text-[12px] text-slate-500">{u.email}</div></div>
                <Select label={`Role for ${u.name}`} className="w-72" value={u.role} disabled={u.email === me.data?.email} onChange={(e) => setRole(u, e.target.value)} options={ROLES} /></li>
            ))}</ul>
          </Card>
          <Card title="Recent activity" subtitle="Sign-ins excluded; latest 100 audited actions">
            <ul className="grid max-h-96 gap-1.5 overflow-auto text-[13px]">{(log.data?.entries ?? []).map((e) => <li key={e.id} className="flex justify-between gap-2"><span><span className="font-mono text-[12px]">{e.action}</span> · {e.by}</span><span className="shrink-0 text-slate-500">{new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span></li>)}</ul>
          </Card>
        </div>
      )}
    </>
  );
}
