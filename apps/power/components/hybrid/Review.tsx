'use client';
/** Pre-signature review: checklist and stage gates. The tool records decisions; it never signs or authorises signature itself. */
import { useState } from 'react';
import { Badge, Button, Card, Field, Notice, cn } from '@/components/ui';
import { api } from '@/lib/client';

interface Review { stage: string; stageLabel: string; checklist: Record<string, boolean>; items: Record<string, string>; stages: { key: string; label: string; ok: boolean; blockers: string[] }[]; history: { id: string; fromStage: string; toStage: string; note: string | null; actor: string; at: string }[] }

export function ReviewPanel({ id, review, stale, onChange, role }: { id: string; review: Review; stale: boolean; onChange: () => void; role?: string }) {
  const [note, setNote] = useState(''); const [err, setErr] = useState<string>(); const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>(review.checklist);
  const post = async (body: object) => { setBusy(true); setErr(undefined); try { await api(`/api/hybrid/scenarios/${id}/review`, { method: 'POST', body: JSON.stringify(body) }); setNote(''); onChange(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const idx = review.stages.findIndex((s) => s.key === review.stage);
  const next = review.stages[idx + 1];
  const canEdit = role === 'admin' || role === 'analyst';
  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
      <Card title="Review stages" subtitle="Each stage needs its checklist items confirmed and current results. Approval for signature is recorded by an admin; signing happens outside this tool.">
        <ol className="space-y-1.5">{review.stages.map((s, i) => (
          <li key={s.key} data-stage={s.key} className={cn('flex items-start gap-3 rounded-xl px-3 py-2 text-[14px]', i === idx && 'bg-blue-50 dark:bg-blue-500/10')}>
            <span className={cn('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold', i < idx ? 'bg-green-600 text-white' : i === idx ? 'bg-navy-900 text-white dark:bg-blue-500' : 'bg-slate-200 text-slate-600 dark:bg-white/10')}>{i + 1}</span>
            <div className="min-w-0"><div className="font-medium">{s.label}</div>{i > idx && !s.ok && i === idx + 1 && <p className="text-[12px] text-amber-700 dark:text-amber-400">Needs: {s.blockers.join('; ')}</p>}</div>
          </li>
        ))}</ol>
        {err && <div className="mt-3"><Notice tone="red">{err}</Notice></div>}
        {stale && <div className="mt-3"><Notice tone="amber">Inputs changed after the last run. Re-run the simulation before moving forward.</Notice></div>}
        {canEdit && next && (
          <div className="mt-4 space-y-2">
            <Field label="Review note (who checked what)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !next.ok || stale} onClick={() => post({ toStage: next.key, note: note || undefined })}>Move to “{next.label}”</Button>
              {idx > 0 && <Button variant="secondary" disabled={busy} onClick={() => post({ toStage: review.stages[idx - 1].key, note: note || 'Returned for rework' })}>Send back</Button>}
            </div>
            {next.key === 'approved_for_signature' && role !== 'admin' && <p className="text-[12px] text-slate-500">Only an admin can record approval for signature.</p>}
          </div>
        )}
      </Card>
      <div className="space-y-4">
        <Card title="Pre-signature checklist" subtitle="Confirm only what has actually been checked, with evidence held outside this tool.">
          <ul className="space-y-1">{Object.entries(review.items).map(([k, label]) => (
            <li key={k}><label className="flex items-center gap-2 text-[14px]"><input type="checkbox" disabled={!canEdit} checked={!!checked[k]} onChange={(e) => { setChecked({ ...checked, [k]: e.target.checked }); post({ checklist: { [k]: e.target.checked } }); }} className="h-4 w-4" />{label}</label></li>
          ))}</ul>
        </Card>
        <Card title="History">
          {!review.history.length ? <p className="text-sm text-slate-500">No review actions yet.</p> : <ul className="space-y-2 text-[13px]">{review.history.map((h) => <li key={h.id}><Badge>{h.toStage.replace(/_/g, ' ')}</Badge> <span className="text-slate-500">{h.actor} · {new Date(h.at).toLocaleString('en-IN')}</span>{h.note && <div className="text-slate-600 dark:text-slate-300">{h.note}</div>}</li>)}</ul>}
        </Card>
      </div>
    </div>
  );
}
