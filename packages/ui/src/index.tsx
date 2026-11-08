'use client';
/**
 * COLLABIZ web component library. Every data view supports the Master Book §5 states:
 * loading, empty, error, success, disabled and permission-denied.
 */
import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRight, BadgeCheck, Bell, BookOpen, Briefcase, Building2, CalendarClock, ChartColumn, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, FileSignature,
  FileText, FolderKanban, Gavel, Handshake, Inbox, Info, LayoutDashboard, Lock, LogOut, Map, Menu, MessageSquare, Package, Search, Settings, ShieldCheck, Store, Truck, Users, Wallet, X,
  type LucideIcon,
} from 'lucide-react';
import { toneForStatus, toneColors, humanize, type Tone } from './tokens';

export * from './tokens';

// ---------------- Icons ----------------
/** One curated, consistent icon set (lucide, 1.75 stroke). Navigation refers to icons by name. */
export const ICONS = {
  home: LayoutDashboard, opportunities: Store, leads: ShieldCheck, crm: ChartColumn, teams: Handshake, tenders: Gavel, contracts: FileSignature, projects: FolderKanban,
  trading: Truck, earnings: Wallet, messages: MessageSquare, inbox: Inbox, settings: Settings, help: CircleHelp, users: Users, building: Building2, verify: BadgeCheck,
  audit: ClipboardList, documents: FileText, map: Map, calendar: CalendarClock, learning: BookOpen, briefcase: Briefcase, package: Package, lock: Lock, bell: Bell, search: Search,
  info: Info, warning: AlertTriangle, success: CheckCircle2, arrow: ArrowRight, logout: LogOut, menu: Menu, close: X, prev: ChevronLeft, next: ChevronRight,
} satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof ICONS;
export function Icon({ name, size = 18, className, label }: { name: IconName; size?: number; className?: string; label?: string }) {
  const C = ICONS[name];
  return <C size={size} className={`cz-icon${className ? ` ${className}` : ''}`} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined} />;
}

type LinkLike = React.ComponentType<{ href: string; className?: string; children?: React.ReactNode; 'aria-current'?: 'page' | undefined; onClick?: () => void }>;
const DefaultLink: LinkLike = ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>;
const LinkCtx = createContext<LinkLike>(DefaultLink);
export const LinkProvider = ({ link, children }: { link: LinkLike; children: React.ReactNode }) => <LinkCtx.Provider value={link}>{children}</LinkCtx.Provider>;
export const UiLink = (p: React.ComponentProps<LinkLike>) => { const L = useContext(LinkCtx); return <L {...p} />; };

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------- Brand ----------------
export function Logo({ src = '/brand/collabiz-mark.png', label = 'collabiz', href = '/', product }: { src?: string; label?: string; href?: string; product?: string }) {
  return (
    <UiLink href={href} className="cz-brand">
      <img src={src} alt="" width={30} height={30} />
      <span>{label}</span>
      {product && <small>{product}</small>}
    </UiLink>
  );
}

// ---------------- Shell ----------------
export interface NavItem { href: string; label: string; screen?: string; icon?: IconName; count?: number }
export interface NavSection { title?: string; items: NavItem[] }
export function AppShell({
  topNav = [], sections, currentPath, userInitials, userMenu, children, brandLabel, logoSrc, product, tools, banner,
}: {
  topNav?: NavItem[]; sections: NavSection[]; currentPath: string; userInitials?: string; userMenu?: React.ReactNode;
  children: React.ReactNode; brandLabel?: string; logoSrc?: string; product?: string; tools?: React.ReactNode; banner?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const all = [...topNav, ...sections.flatMap((s) => s.items)].map((n) => n.href);
  // Longest matching prefix wins, so /projects/123/milestones highlights "Projects", not "Home".
  const best = all.filter((h) => h === '/' ? currentPath === '/' : currentPath === h || currentPath.startsWith(h + '/')).sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === best;
  return (
    <>
      <a href="#main" className="cz-skip">Skip to content</a>
      {banner}
      <header className="cz-topbar">
        <button className="cz-menu-btn" aria-expanded={open} aria-controls="cz-sidebar" onClick={() => setOpen(!open)}><Icon name={open ? 'close' : 'menu'} size={16} />Menu</button>
        <Logo label={brandLabel} src={logoSrc} product={product} />
        {topNav.length > 0 && (
          <nav aria-label="Primary">
            {topNav.map((n) => <UiLink key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}>{n.label}</UiLink>)}
          </nav>
        )}
        <div className="cz-spacer" />
        {tools && <div className="cz-topbar-tools">{tools}</div>}
        {userMenu}
        {userInitials && !userMenu && <span className="cz-avatar" aria-hidden>{userInitials}</span>}
      </header>
      <div className="cz-layout">
        <div className="cz-scrim" data-open={open} onClick={() => setOpen(false)} aria-hidden />
        <aside id="cz-sidebar" className="cz-sidebar" data-open={open} aria-label="Section navigation">
          {sections.map((s, i) => (
            <div key={i}>
              {s.title && <h4>{s.title}</h4>}
              {s.items.map((it) => (
                <UiLink key={it.href} href={it.href} aria-current={isActive(it.href) ? 'page' : undefined} onClick={() => setOpen(false)}>
                  {it.icon && <Icon name={it.icon} />}{it.label}{it.count ? <span className="cz-count" aria-label={`${it.count} new`}>{it.count > 99 ? '99+' : it.count}</span> : null}
                </UiLink>
              ))}
            </div>
          ))}
        </aside>
        <main id="main" className="cz-main" tabIndex={-1}>{children}</main>
      </div>
    </>
  );
}

/** Page header. Screen IDs are a development aid only (shown when showScreenId is set); never part of production chrome. */
export function PageHeader({ title, screenId, breadcrumb, eyebrow, actions, description, showScreenId }: { title: string; screenId?: string; breadcrumb?: string; eyebrow?: string; actions?: React.ReactNode; description?: React.ReactNode; showScreenId?: boolean }) {
  const top = eyebrow ?? breadcrumb;
  return (
    <div className="cz-page-head" data-screen-id={screenId}>
      <div>
        {(top || (showScreenId && screenId)) && <div className="cz-eyebrow">{top}{showScreenId && screenId && <span className="cz-screen-id" title="Screen ID (development)">{screenId}</span>}</div>}
        <h1>{title}</h1>
        {description && <p className="cz-muted">{description}</p>}
      </div>
      {actions && <div className="cz-actions">{actions}</div>}
    </div>
  );
}

// ---------------- Primitives ----------------
type BtnVariant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost';
export function Button({ variant = 'primary', size, loading, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'lg'; loading?: boolean }) {
  return (
    <button className={cx('cz-btn', `cz-btn-${variant}`, size && `cz-btn-${size}`, className)} disabled={rest.disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? 'Please wait…' : children}
    </button>
  );
}
export function ButtonLink({ href, variant = 'primary', size, children }: { href: string; variant?: BtnVariant; size?: 'sm' | 'lg'; children: React.ReactNode }) {
  return <UiLink href={href} className={cx('cz-btn', `cz-btn-${variant}`, size && `cz-btn-${size}`)}>{children}</UiLink>;
}
export function Card({ title, subtitle, actions, children, className, id, flush }: { title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string; id?: string; flush?: boolean }) {
  return (
    <section className={cx('cz-card', flush && 'cz-card-flush', className)} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || actions) && <div className="cz-card-head"><div>{title && <h2>{title}</h2>}{subtitle && <p>{subtitle}</p>}</div>{actions}</div>}
      {children}
    </section>
  );
}
export function Kpi({ label, value, accent, hint, icon, trend, href }: { label: string; value: React.ReactNode; accent?: boolean; hint?: React.ReactNode; icon?: IconName; trend?: 'up' | 'flat'; href?: string }) {
  const body = (
    <>
      <div className="cz-kpi-top"><span>{label}</span>{icon && <Icon name={icon} size={16} />}</div>
      <div className={cx('cz-kpi-value', accent && 'cz-accent')}>{value}</div>
      {hint && <div className={cx('cz-kpi-hint', trend === 'up' && 'cz-up')}>{hint}</div>}
    </>
  );
  return href ? <UiLink href={href} className="cz-kpi" >{body}</UiLink> : <div className="cz-kpi">{body}</div>;
}
export function Grid({ cols = 2, children }: { cols?: 2 | 3 | 4; children: React.ReactNode }) {
  return <div className={cx('cz-grid', `cz-grid-${cols}`)}>{children}</div>;
}
export function StatusBadge({ status, tone, label }: { status: string; tone?: Tone; label?: string }) {
  const t = toneColors[tone ?? toneForStatus(status)];
  return <span className="cz-badge" style={{ color: t.fg, background: t.bg }} data-status={status}>{label ?? humanize(status)}</span>;
}
const ALERT_ICON: Record<string, IconName> = { info: 'info', success: 'success', warning: 'warning', danger: 'warning' };
export function Alert({ tone = 'info', children, title }: { tone?: 'info' | 'success' | 'warning' | 'danger'; children: React.ReactNode; title?: string }) {
  return <div className={`cz-alert cz-alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}><Icon name={ALERT_ICON[tone]} size={17} /><div>{title && <strong>{title} </strong>}{children}</div></div>;
}
export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="cz-tag">{children}</span>;
}
export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | string; style?: React.CSSProperties }) {
  return <div className="cz-skeleton" style={{ height, width, ...style }} aria-hidden />;
}
export function SearchInput({ label, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <div className="cz-field">
      <label htmlFor={id} className="cz-sr-only">{label}</label>
      <div className="cz-search"><Icon name="search" size={16} /><input id={id} type="search" className="cz-input" aria-label={label} {...rest} /></div>
    </div>
  );
}
export function Segmented({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return <div className="cz-segment" role="group" aria-label={label}>{options.map((o) => <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}
export function Pagination({ page, pageSize, total, onPage, noun = 'results' }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; noun?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  return (
    <nav className="cz-pager" aria-label="Pagination">
      <span>{total ? `${from}–${Math.min(total, page * pageSize)} of ${total} ${noun}` : `No ${noun}`}</span>
      <span className="cz-row" style={{ gap: 6 }}>
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><Icon name="prev" size={15} />Previous</Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">Next<Icon name="next" size={15} /></Button>
      </span>
    </nav>
  );
}
export function DescriptionList({ items }: { items: [string, React.ReactNode][] }) {
  return <dl className="cz-dl">{items.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v ?? '—'}</dd></React.Fragment>)}</dl>;
}
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return <div className="cz-bar" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}><span style={{ width: `${v}%` }} /></div>;
}

// ---------------- States ----------------
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="cz-state" role="status" aria-live="polite"><div className="cz-spinner" />{label}</div>;
}
export function EmptyState({ title, children, action, icon = 'inbox' }: { title: string; children?: React.ReactNode; action?: React.ReactNode; icon?: IconName }) {
  return <div className="cz-state"><span className="cz-state-icon"><Icon name={icon} size={22} /></span><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Something went wrong.';
  return (
    <div className="cz-state" role="alert">
      <span className="cz-state-icon"><Icon name="warning" size={22} /></span>
      <h3>We couldn’t load this</h3>
      <p>{msg}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
export function PermissionDenied({ reason }: { reason?: string }) {
  return (
    <div className="cz-state" role="alert" data-testid="permission-denied">
      <span className="cz-state-icon"><Icon name="lock" size={22} /></span>
      <h3>Access restricted</h3>
      <p>{reason ?? 'Your role does not have permission to view this screen. Contact your organization owner or Unite Group support.'}</p>
    </div>
  );
}

// ---------------- Data ----------------
export interface Column<T> { key: string; header: string; render?: (row: T) => React.ReactNode; width?: string }
export function DataTable<T extends { id?: string }>({ columns, rows, empty, caption, rowKey }: { columns: Column<T>[]; rows: T[]; empty?: React.ReactNode; caption?: string; rowKey?: (r: T, i: number) => string }) {
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return (
    <div className="cz-table-wrap">
      <table className="cz-table">
        {caption && <caption className="cz-sr-only">{caption}</caption>}
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col" style={{ width: c.width }}>{c.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey ? rowKey(r, i) : (r.id ?? String(i))}>
              {columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="cz-stepper" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} data-state={i < current ? 'done' : i === current ? 'current' : 'todo'} aria-current={i === current ? 'step' : undefined}>{s}</li>
      ))}
    </ol>
  );
}
export interface TimelineItem { id: string; at: string; title: React.ReactNode; detail?: React.ReactNode }
export function Timeline({ items, empty = 'No activity recorded yet.' }: { items: TimelineItem[]; empty?: string }) {
  if (!items.length) return <p className="cz-muted">{empty}</p>;
  return (
    <ol className="cz-timeline">
      {items.map((it) => (
        <li key={it.id}><div><strong>{it.title}</strong></div><div className="cz-muted" style={{ fontSize: 12.5 }}>{new Date(it.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>{it.detail && <div>{it.detail}</div>}</li>
      ))}
    </ol>
  );
}
export function Tabs({ tabs, value, onChange }: { tabs: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="cz-tabs" role="tablist">
      {tabs.map((t) => <button key={t.value} role="tab" aria-selected={t.value === value} onClick={() => onChange(t.value)}>{t.label}</button>)}
    </div>
  );
}

// ---------------- Forms ----------------
export function Field({ label, error, hint, children, id }: { label: string; error?: string; hint?: string; children: (p: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => React.ReactNode; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  const describedBy = [hint && `${fid}-hint`, error && `${fid}-err`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="cz-field">
      <label htmlFor={fid}>{label}</label>
      {children({ id: fid, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && <span id={`${fid}-hint`} className="cz-hint">{hint}</span>}
      {error && <span id={`${fid}-err`} className="cz-error-text">{error}</span>}
    </div>
  );
}
export function TextInput({ label, error, hint, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  return <Field label={label} error={error} hint={hint} id={rest.id}>{(a) => <input className="cz-input" {...rest} {...a} />}</Field>;
}
export function TextArea({ label, error, hint, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
  return <Field label={label} error={error} hint={hint} id={rest.id}>{(a) => <textarea className="cz-textarea" {...rest} {...a} />}</Field>;
}
export function Select({ label, error, hint, options, placeholder, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <Field label={label} error={error} hint={hint} id={rest.id}>
      {(a) => (
        <select className="cz-select" {...rest} {...a}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}
export function Checkbox({ label, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  const id = useId();
  return <div className="cz-check"><input type="checkbox" id={id} {...rest} /><label htmlFor={id}>{label}</label></div>;
}
export function ChipSelect({ legend, options, value, onChange, max }: { legend: string; options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; max?: number }) {
  return (
    <fieldset className="cz-fieldset">
      <legend>{legend}</legend>
      <div className="cz-chips">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button type="button" key={o.value} className="cz-chip" aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== o.value) : max && value.length >= max ? value : [...value, o.value])}>
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// ---------------- Dialog ----------------
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  return (
    <dialog ref={ref} className="cz-dialog" onClose={onClose} aria-labelledby="cz-dialog-title">
      <h2 id="cz-dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}

// ---------------- Domain helpers ----------------
export function Money({ minor, currency = 'INR' }: { minor: number | null | undefined; currency?: string }) {
  if (minor == null) return <span className="cz-muted">—</span>;
  return <>{new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100)}</>;
}
export function FactorBars({ factors }: { factors: { factor: string; weight: number; score: number; detail: string }[] }) {
  return (
    <div className="cz-stack" style={{ gap: 8 }}>
      {factors.map((f) => (
        <div key={f.factor}>
          <div className="cz-row" style={{ justifyContent: 'space-between', fontSize: 13 }}><span><strong>{f.factor}</strong> · weight {f.weight}</span><span className="cz-muted">{f.detail}</span></div>
          <ProgressBar value={f.score * 100} label={`${f.factor} score`} />
        </div>
      ))}
    </div>
  );
}
