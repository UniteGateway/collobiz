'use client';
/** Client types and helpers for the Hybrid Power Lab. */
import { useEffect, useRef, useState } from 'react';
import { api } from './client';

export const DECISION_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'slate'> = { feasible: 'green', feasible_with_conditions: 'blue', infeasible: 'red', insufficient_data: 'amber', regulatory_review_required: 'amber' };
export const DECISION_TEXT: Record<string, string> = { feasible: 'Feasible', feasible_with_conditions: 'Feasible with Conditions', infeasible: 'Infeasible', insufficient_data: 'Insufficient Data', regulatory_review_required: 'Regulatory Review Required' };
export const TECH_TEXT: Record<string, string> = { feasible: 'Meets the contract', feasible_with_conditions: 'Meets the contract, with conditions', infeasible: 'Does not meet the contract' };
export const cr = (x: number | null | undefined, d = 1) => (x == null ? '—' : `₹${x.toLocaleString('en-IN', { maximumFractionDigits: d })} cr`);
export const pctN = (x: number | null | undefined, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
export const gwh = (mwhV: number) => `${(mwhV / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} GWh`;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface Job { id: string; status: 'running' | 'done' | 'failed'; done: number; total: number; error?: string; resultId?: string; elapsedMs: number }
/** Polls a background job until it finishes. */
export function useJob(onDone: (j: Job) => void) {
  const [job, setJob] = useState<Job | null>(null);
  const cb = useRef(onDone); cb.current = onDone;
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const t = setTimeout(async () => {
      try { const j = await api<Job>(`/api/hybrid/jobs/${job.id}`); setJob(j); if (j.status === 'done') cb.current(j); } catch (e) { setJob({ ...job, status: 'failed', error: (e as Error).message }); }
    }, 800);
    return () => clearTimeout(t);
  }, [job]);
  return { job, start: async (path: string, body?: unknown) => { const r = await api<{ jobId: string }>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }); setJob({ id: r.jobId, status: 'running', done: 0, total: 1, elapsedMs: 0 }); } };
}
