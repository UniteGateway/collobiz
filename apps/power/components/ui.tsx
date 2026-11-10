'use client';
/** Small, shadcn-style UI kit (Tailwind, no runtime dependency). Accessible labels on every control. */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

export function Button({ variant = 'primary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' }) {
  return <button {...p} className={cn('inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
    size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-5 text-sm',
    variant === 'primary' && 'bg-navy-900 text-white hover:bg-navy-800 dark:bg-blue-500 dark:hover:bg-blue-400',
    variant === 'secondary' && 'bg-white text-navy-900 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-white/5 dark:text-slate-100 dark:ring-white/10 dark:hover:bg-white/10',
    variant === 'ghost' && 'text-navy-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10',
    variant === 'danger' && 'bg-red-500 text-white hover:bg-red-600', className)} />;
}

export function Card({ title, subtitle, action, children, className }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[1.25rem] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04),0_8px_24px_rgba(11,31,58,0.05)] ring-1 ring-slate-200/70 dark:bg-white/[0.04] dark:ring-white/10', className)}>
      {(title || action) && <header className="mb-4 flex items-start justify-between gap-3"><div>{title && <h2 className="text-[15px] font-semibold text-navy-900 dark:text-white">{title}</h2>}{subtitle && <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{subtitle}</p>}</div>{action}</header>}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = 'navy' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'navy' | 'blue' | 'green' | 'amber' | 'red' }) {
  const c = { navy: 'text-navy-900 dark:text-white', blue: 'text-blue-500', green: 'text-green-600 dark:text-green-500', amber: 'text-amber-500', red: 'text-red-500' }[tone];
  return <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200/70 dark:bg-white/[0.04] dark:ring-white/10"><div className="text-[12px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div><div className={cn('mt-1 text-2xl font-semibold tabular-nums', c)}>{value}</div>{hint && <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{hint}</div>}</div>;
}

export function Field({ label, hint, error, suffix, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string; suffix?: string }) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{label}</label>
      <div className="relative">
        <input id={id} {...p} aria-invalid={!!error || undefined} aria-describedby={hint || error ? `${id}-h` : undefined} className={cn('h-10 w-full rounded-xl bg-slate-50 px-3 text-sm text-navy-900 ring-1 ring-slate-200 transition focus:bg-white focus:ring-2 focus:ring-blue-500 dark:bg-white/5 dark:text-white dark:ring-white/10', suffix && 'pr-14', error && 'ring-red-500')} />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] text-slate-500">{suffix}</span>}
      </div>
      {(hint || error) && <p id={`${id}-h`} className={cn('text-[12px]', error ? 'text-red-500' : 'text-slate-500 dark:text-slate-400')}>{error ?? hint}</p>}
    </div>
  );
}

export function Select({ label, options, className, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: { value: string; label: string }[] }) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{label}</label>
      <select id={id} {...p} className="h-10 rounded-xl bg-slate-50 px-3 text-sm text-navy-900 ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500 dark:bg-white/5 dark:text-white dark:ring-white/10">{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    </div>
  );
}

export function Badge({ tone = 'slate', children }: { tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue'; children: ReactNode }) {
  const c = { slate: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200', green: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400', amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', red: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400', blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' }[tone];
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium', c)}>{children}</span>;
}

export const PROVENANCE_TONE = { verified: 'green', user: 'blue', illustrative: 'amber' } as const;
export function Provenance({ kind }: { kind: 'verified' | 'user' | 'illustrative' }) {
  return <Badge tone={PROVENANCE_TONE[kind]}>{kind === 'verified' ? 'Verified' : kind === 'user' ? 'User-entered' : 'Illustrative'}</Badge>;
}

export function Notice({ tone = 'blue', title, children }: { tone?: 'blue' | 'amber' | 'red' | 'green'; title?: string; children: ReactNode }) {
  const c = { blue: 'bg-blue-50 text-navy-900 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-100 dark:ring-blue-500/20', amber: 'bg-amber-50 text-amber-900 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-500/20', red: 'bg-red-50 text-red-900 ring-red-100 dark:bg-red-500/10 dark:text-red-100 dark:ring-red-500/20', green: 'bg-green-50 text-green-900 ring-green-100 dark:bg-green-500/10 dark:text-green-100 dark:ring-green-500/20' }[tone];
  return <div role={tone === 'red' ? 'alert' : 'status'} className={cn('rounded-2xl p-4 text-sm ring-1', c)}>{title && <strong className="mb-1 block">{title}</strong>}{children}</div>;
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded-xl bg-slate-200/70 dark:bg-white/10', className)} />;

export const mwh = (v: number, d = 0) => `${v.toLocaleString('en-IN', { maximumFractionDigits: d })} MWh`;
export const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
export const crore = (rs: number) => `₹${(rs / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} cr`;
export const rupees = (rs: number) => `₹${Math.round(rs).toLocaleString('en-IN')}`;
