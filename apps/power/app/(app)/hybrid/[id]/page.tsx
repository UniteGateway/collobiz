'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Badge, Button, Notice, Skeleton, cn } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { Inputs } from '@/components/hybrid/Inputs';
import { Results } from '@/components/hybrid/Results';
import { ReviewPanel } from '@/components/hybrid/Review';
import { useApi } from '@/lib/client';
import { DECISION_TEXT, DECISION_TONE, useJob } from '@/lib/hybridClient';

/** One scenario: inputs, simulated results and the pre-signature review. */
export default function HybridScenario() {
  const { id } = useParams<{ id: string }>();
  const tab = useSearchParams().get('tab') ?? 'results';
  const router = useRouter();
  const q = useApi<any>(`/api/hybrid/scenarios/${id}?series=${tab === 'results' ? 1 : 0}`);
  const me = useApi<{ role: string }>('/api/me');
  const sim = useJob(() => q.reload());
  const d = q.data;
  const go = (t: string) => router.replace(`/hybrid/${id}?tab=${t}`);
  const running = sim.job?.status === 'running';
  const run = () => sim.start(`/api/hybrid/scenarios/${id}/simulate`);
  const canEdit = me.data?.role === 'admin' || me.data?.role === 'analyst';
  return (
    <>
      <PageTitle title={d?.name ?? 'Scenario'} subtitle={d ? `Input version ${d.inputVersion}${d.resultVersion ? ` · results from version ${d.resultVersion}` : ' · not simulated'}${d.sampleKey ? ' · demonstration scenario (illustrative)' : ''}` : undefined}
        actions={<div className="flex flex-wrap items-center gap-2">
          {d?.results && <Badge tone={DECISION_TONE[d.results.decision.status]}>{DECISION_TEXT[d.results.decision.status]}</Badge>}
          {d?.results && <a className="text-[13px] font-medium text-blue-600 hover:underline" href={`/api/hybrid/scenarios/${id}/report?format=pdf`}>PDF report</a>}
          {d?.results && <a className="text-[13px] font-medium text-blue-600 hover:underline" href={`/api/hybrid/scenarios/${id}/report?format=xlsx`}>Excel</a>}
          <Link className="text-[13px] font-medium text-blue-600 hover:underline" href={`/hybrid/combinations?from=${id}`}>Find better combinations</Link>
          {canEdit && <Button onClick={run} disabled={running}>{running ? 'Simulating…' : d?.results ? 'Re-run simulation' : 'Simulate the year'}</Button>}
        </div>} />
      {running && sim.job && (
        <div className="mb-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10" role="status" aria-live="polite">
          <div className="mb-2 flex justify-between text-[13px]"><span>Optimising dispatch day by day</span><span className="tabular-nums">{sim.job.total > 1 ? `${sim.job.done} / ${sim.job.total} days` : 'Starting…'}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full bg-blue-600 transition-all" style={{ width: `${(sim.job.done / Math.max(1, sim.job.total)) * 100}%` }} /></div>
        </div>
      )}
      {sim.job?.status === 'failed' && <div className="mb-4"><Notice tone="red" title="Simulation failed">{sim.job.error}</Notice></div>}
      <nav className="mb-4 flex gap-1 border-b border-slate-200 dark:border-white/10" aria-label="Scenario sections">
        {[['results', 'Results'], ['inputs', 'Inputs'], ['review', 'PPA review']].map(([k, l]) => <button key={k} onClick={() => go(k)} aria-current={tab === k ? 'page' : undefined} className={cn('-mb-px border-b-2 px-4 py-2 text-[14px] font-medium', tab === k ? 'border-blue-600 text-navy-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-navy-900')}>{l}</button>)}
      </nav>
      {q.error ? <Notice tone="red">{q.error}</Notice> : !d ? <Skeleton className="h-96" /> : tab === 'inputs' ? (
        <Inputs key={d.inputVersion} id={id} inputs={d.inputs} version={d.inputVersion} canEdit={canEdit} onSaved={async (r) => { await q.reload(); if (r) { await run(); go('results'); } }} />
      ) : tab === 'review' ? (
        <ReviewPanel id={id} review={d.review} stale={d.stale || !d.results} onChange={q.reload} role={me.data?.role} />
      ) : !d.results ? (
        <Notice tone="blue" title="Not simulated yet">Run the full-year simulation to see delivery compliance, battery behaviour, landed cost and returns. Quick checks: land needs {d.quick.land.requiredAcres.toFixed(0)} of {d.quick.land.availableAcres} acres{d.quick.grid.issues.filter((i: { severity: string }) => i.severity === 'block').map((i: { message: string }) => ` · ${i.message}`).join('')}.</Notice>
      ) : (
        <>
          {d.stale && <div className="mb-4"><Notice tone="amber">These results are from input version {d.resultVersion}; the inputs have changed since. Re-run to update.</Notice></div>}
          <Results results={d.results} series={d.series ?? null} inputs={d.inputs} />
        </>
      )}
    </>
  );
}
