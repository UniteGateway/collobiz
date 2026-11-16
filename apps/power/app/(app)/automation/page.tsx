'use client';
import { useState } from 'react';
import { Badge, Button, Card, Notice, Skeleton } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { api, useApi } from '@/lib/client';

interface Job { id: string; kind: string; name: string; schedule: string; enabled: boolean; lastRunAt: string | null; what: string; due: boolean }
interface Run { id: string; job: string; status: string; output: Record<string, unknown> | null; error: string | null; startedAt: string; finishedAt: string | null }
interface AlertRow { id: string; kind: string; severity: 'info' | 'warning' | 'critical'; message: string; createdAt: string; acknowledgedAt: string | null }
interface R { jobs: Job[]; runs: Run[]; alerts: AlertRow[]; schedulerConfigured: boolean }
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Never');
const EVERY: Record<number, string> = { 1: 'Daily', 7: 'Weekly', 30: 'Monthly' };
const every = (cron: string) => { const [m, h, dom, , dow] = cron.split(' '); const p = dom !== '*' ? 30 : dow !== '*' ? 7 : 1; return `${EVERY[p]} at ${h.padStart(2, '0')}:${m.padStart(2, '0')} UTC`; };
const TONE = { ok: 'green', skipped: 'amber', failed: 'red', running: 'blue' } as const;

/** Module 13 — automated checks: run them now, see what they found, acknowledge alerts. */
export default function Automation() {
  const r = useApi<R>('/api/automation');
  const me = useApi<{ role: string }>('/api/me');
  const [busy, setBusy] = useState<string>(); const [err, setErr] = useState<string>();
  const act = async (key: string, path: string, body: unknown = {}) => { setBusy(key); setErr(undefined); try { await api(path, { method: 'POST', body: JSON.stringify(body) }); await r.reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(undefined); } };
  const role = me.data?.role ?? 'viewer';
  const open = r.data?.alerts.filter((a) => !a.acknowledgedAt) ?? [];
  return (
    <>
      <PageTitle title="Automation" subtitle="Checks that keep the analysis honest: tariff records, re-simulation, battery health and profitability. Findings become alerts for someone to acknowledge." />
      {r.data && !r.data.schedulerConfigured && <Notice tone="amber" title="Schedules are not running yet">Jobs run when you press “Run now”. For the schedules below to run by themselves, the deployment needs an external scheduler calling <code>POST /api/automation/due</code> with the <code>AUTOMATION_TOKEN</code> secret.</Notice>}
      {err && <div className="mt-3"><Notice tone="red">{err}</Notice></div>}
      {!r.data ? <div className="mt-4 grid gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div> : (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <div className="grid gap-4 xl:col-span-2">
            {r.data.jobs.map((j) => (
              <Card key={j.id} title={j.name} subtitle={`${every(j.schedule)} · last run ${when(j.lastRunAt)}`} action={<div className="flex items-center gap-2">{j.kind === 'weather_update' ? <Badge tone="amber">Blocked: no network access</Badge> : j.enabled ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}</div>}>
                <p className="text-sm text-slate-600 dark:text-slate-300">{j.what}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {role !== 'viewer' && <Button size="sm" onClick={() => act(j.id, `/api/automation/jobs/${j.id}/run`)} disabled={!!busy} aria-label={`Run ${j.name} now`}>{busy === j.id ? 'Running…' : 'Run now'}</Button>}
                  {role === 'admin' && <Button size="sm" variant="secondary" onClick={() => act(`t${j.id}`, `/api/automation/jobs/${j.id}`, { enabled: !j.enabled })} disabled={!!busy}>{j.enabled ? 'Turn off' : 'Turn on'}</Button>}
                </div>
              </Card>
            ))}
          </div>
          <div className="grid content-start gap-4">
            <Card title={`Alerts${open.length ? ` (${open.length} open)` : ''}`} subtitle="Raised by the checks; each stays open until acknowledged">
              {!r.data.alerts.length ? <p className="text-sm text-slate-500">No alerts yet. Run a check.</p> : (
                <ul className="grid gap-2">{r.data.alerts.map((a) => (
                  <li key={a.id} className={`rounded-2xl p-3 text-sm ring-1 ${a.acknowledgedAt ? 'opacity-60 ring-slate-200 dark:ring-white/10' : a.severity === 'critical' ? 'bg-red-50 ring-red-100 dark:bg-red-500/10 dark:ring-red-500/20' : a.severity === 'warning' ? 'bg-amber-50 ring-amber-100 dark:bg-amber-500/10 dark:ring-amber-500/20' : 'bg-blue-50 ring-blue-100 dark:bg-blue-500/10 dark:ring-blue-500/20'}`}>
                    <div>{a.message}</div>
                    <div className="mt-1 flex items-center justify-between text-[12px] text-slate-500"><span>{when(a.createdAt)}{a.acknowledgedAt ? ' · acknowledged' : ''}</span>
                      {!a.acknowledgedAt && role !== 'viewer' && <Button size="sm" variant="ghost" onClick={() => act(a.id, `/api/alerts/${a.id}/ack`)} disabled={!!busy}>Acknowledge</Button>}</div>
                  </li>
                ))}</ul>
              )}
            </Card>
            <Card title="Recent runs">
              {!r.data.runs.length ? <p className="text-sm text-slate-500">Nothing has run yet.</p> : (
                <ul className="grid gap-2 text-sm">{r.data.runs.map((x) => (
                  <li key={x.id} className="flex items-start justify-between gap-2"><span><span className="font-medium">{x.job}</span><div className="text-[12px] text-slate-500">{when(x.startedAt)}{x.error ? ` · ${x.error}` : typeof x.output?.reason === 'string' ? ` · ${x.output.reason}` : ''}</div></span><Badge tone={TONE[x.status as keyof typeof TONE] ?? 'slate'}>{x.status}</Badge></li>
                ))}</ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
