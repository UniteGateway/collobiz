'use client';
import { Notice, Skeleton } from './ui';
export function SimLoading({ error }: { error?: string }) {
  if (error) return <Notice tone="red" title="Could not run the simulation">{error}</Notice>;
  return <div className="grid gap-4" aria-busy="true" aria-live="polite"><p className="text-sm text-slate-500">Running the 15-minute simulation for the full year (35,040 intervals)…</p><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-72" /></div>;
}
