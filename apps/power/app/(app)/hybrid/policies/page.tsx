'use client';
import { Badge, Card, Notice, Provenance, Skeleton } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { useApi } from '@/lib/client';

interface P { sources: { id: string; title: string; authority: string; scope: string; url: string; status: string; note: string }[]; states: Record<string, string>; charges: { key: string; jurisdiction: string; chargeType: string; value: number; unit: string; provenance: 'verified' | 'user' | 'illustrative'; orderTitle: string | null; effectiveFrom: string | null; version: number; waiver: unknown }[] }

/** Regulatory sources and the charge records the calculations use, by state. Unverified values are labelled, never zeroed. */
export default function Policies() {
  const q = useApi<P>('/api/hybrid/policies');
  const d = q.data;
  return (
    <>
      <PageTitle title="Regulatory sources and charges" subtitle="Charges are versioned records with their source and effective date. Changes go through the review workflow on the open-access page before they apply." />
      <Notice tone="amber" title="Nothing here has been verified against the official texts yet">The official sites below could not be reached from this environment, so no rule from them is applied. Every charge used today is an illustrative placeholder until a reviewer records the order, effective date and value.</Notice>
      {q.error ? <Notice tone="red">{q.error}</Notice> : !d ? <Skeleton className="mt-4 h-96" /> : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.2fr]">
          <Card title="Source register">
            <ul className="space-y-3 text-[13px]">{d.sources.map((s) => <li key={s.id}><div className="flex items-center gap-2"><strong>{s.title}</strong><Badge tone="amber">Not reviewed</Badge></div><div className="text-slate-500">{s.authority} · {s.scope}{s.url && <> · <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.url.replace('https://', '')}</a></>}</div>{s.note && <div className="text-slate-500">{s.note}</div>}</li>)}</ul>
          </Card>
          <Card title="Charges in force today" className="overflow-x-auto">
            {Object.keys(d.states).concat('ISTS').map((st) => {
              const rows = d.charges.filter((c) => c.jurisdiction === st);
              return rows.length ? <div key={st} className="mb-4"><h3 className="mb-1 text-[13px] font-semibold">{d.states[st] ?? 'Inter-state (ISTS)'}</h3>
                <table className="w-full text-[12.5px]"><tbody>{rows.map((c) => <tr key={c.key} className="border-b border-slate-100 dark:border-white/5"><td className="py-1">{c.chargeType.replace(/_/g, ' ')}{c.waiver ? ' (waiver — needs every condition confirmed)' : ''}</td><td className="py-1 text-right tabular-nums">{c.value} {c.unit}</td><td className="py-1 pl-2"><Provenance kind={c.provenance} /></td><td className="py-1 pl-2 text-slate-500">v{c.version} · from {c.effectiveFrom ?? '—'}</td></tr>)}</tbody></table></div> : null;
            })}
          </Card>
        </div>
      )}
    </>
  );
}
