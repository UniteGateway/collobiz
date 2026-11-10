'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Activity, BarChart3, BatteryCharging, Cable, CircleDollarSign, Factory, FileText, Gauge, LayoutDashboard, LineChart, Map, Moon, Settings, SlidersHorizontal, Sun, Workflow, Zap } from 'lucide-react';
import { cn, Select } from './ui';
import { useScenario } from './Scenario';
import { api, useApi } from '@/lib/client';

export const NAV = [
  { href: '/', label: 'Executive Dashboard', icon: LayoutDashboard },
  { href: '/config', label: 'Project Configuration', icon: SlidersHorizontal },
  { href: '/solar', label: 'Solar Generation', icon: Sun },
  { href: '/battery', label: 'Battery Storage', icon: BatteryCharging },
  { href: '/dispatch', label: 'Smart Dispatch', icon: Zap },
  { href: '/graph', label: 'Interactive Power Graph', icon: LineChart },
  { href: '/voltage', label: 'Voltage & Evacuation', icon: Cable },
  { href: '/open-access', label: 'AP Open Access', icon: Activity },
  { href: '/interstate', label: 'Interstate Transmission', icon: Map },
  { href: '/savings', label: 'Industrial Savings', icon: Factory },
  { href: '/finance', label: 'Financial Analysis', icon: CircleDollarSign },
  { href: '/cuf', label: 'CUF & Reliability', icon: Gauge },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/automation', label: 'Automation', icon: Workflow },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const me = useApi<{ name: string; role: string }>('/api/me');
  const { s, set } = useScenario();
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let d = false;
    try { const v = localStorage.getItem('upd.theme'); d = v ? v === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; } catch { /* ignore */ }
    setDark(d); document.documentElement.classList.toggle('dark', d);
  }, []);
  const toggle = () => { const d = !dark; setDark(d); document.documentElement.classList.toggle('dark', d); try { localStorage.setItem('upd.theme', d ? 'dark' : 'light'); } catch { /* ignore */ } };
  const signOut = async () => { await api('/api/auth/logout', { method: 'POST' }); router.push('/login'); };
  return (
    <div className="min-h-screen text-navy-900 dark:text-slate-100">
      <aside className={cn('fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto border-r border-slate-200/70 bg-white/90 px-3 py-5 backdrop-blur-xl transition-transform dark:border-white/10 dark:bg-navy-950/90 lg:translate-x-0 no-print', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="mb-6 flex items-center gap-2 px-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-green-500 text-white"><Zap size={18} /></span>
          <div><div className="text-[15px] font-semibold leading-tight">Unite Power Dispatch</div><div className="text-[11px] text-slate-500">Solar + BESS optimiser</div></div>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, icon: I }, i) => {
            const active = href === '/' ? path === '/' : path.startsWith(href);
            return <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined} className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] transition-colors', active ? 'bg-navy-900 text-white dark:bg-blue-500' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10')}><I size={17} aria-hidden /><span className="flex-1">{label}</span><span className="text-[10px] opacity-50">{i + 1}</span></Link>;
          })}
        </nav>
        <p className="mt-6 px-3 text-[11px] leading-relaxed text-slate-500">Unite Developers Global Inc. · powered by Unite Group Inc., USA</p>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex flex-wrap items-end gap-3 border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-navy-950/80 sm:px-6 no-print">
          <button className="rounded-lg p-2 lg:hidden" aria-label="Open navigation" onClick={() => setOpen(!open)}><BarChart3 size={18} /></button>
          <Select label="Dispatch mode" className="min-w-[200px]" value={s.mode} onChange={(e) => set({ mode: e.target.value as never })} options={[{ value: 'max_reliability', label: 'Maximum reliability' }, { value: 'max_savings', label: 'Maximum customer savings' }, { value: 'max_profit', label: 'Maximum developer profit' }]} />
          <Select label="Weather" className="min-w-[170px]" value={s.scenario} onChange={(e) => set({ scenario: e.target.value as never })} options={[{ value: 'typical', label: 'Typical year' }, { value: 'sunny', label: 'Sunny year' }, { value: 'monsoon_heavy', label: 'Heavy monsoon' }, { value: 'low_production', label: 'Low production' }]} />
          <Select label="CUF scenario" className="min-w-[150px]" value={s.cuf ? `${s.cuf}-${s.basis}` : ''} onChange={(e) => { const [c, b] = e.target.value.split('-'); set({ cuf: c ?? '', basis: (b as 'dc' | 'ac') ?? 'dc' }); }}
            options={[{ value: '', label: 'Modelled weather' }, ...[19, 20, 21, 22].flatMap((c) => [{ value: `${c}-dc`, label: `${c}% (DC basis)` }, { value: `${c}-ac`, label: `${c}% (AC basis)` }])]} />
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggle} className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-white/10" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
            {me.data && <span className="hidden text-[13px] text-slate-600 dark:text-slate-300 sm:inline">{me.data.name} · {me.data.role}</span>}
            <button onClick={signOut} className="rounded-full px-3 py-1.5 text-[13px] hover:bg-slate-100 dark:hover:bg-white/10">Sign out</button>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>{subtitle && <p className="mt-1 max-w-3xl text-[14px] text-slate-500 dark:text-slate-400">{subtitle}</p>}</div>{actions}</div>;
}
