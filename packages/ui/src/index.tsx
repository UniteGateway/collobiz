'use client';
/**
 * COLLABIZ web component library. Every data view supports the Master Book §5 states:
 * loading, empty, error, success, disabled and permission-denied.
 */
import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { toneForStatus, toneColors, humanize, type Tone } from './tokens';

export * from './tokens';

type LinkLike = React.ComponentType<{ href: string; className?: string; children?: React.ReactNode; 'aria-current'?: 'page' | undefined; onClick?: () => void }>;
const DefaultLink: LinkLike = ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>;
const LinkCtx = createContext<LinkLike>(DefaultLink);
export const LinkProvider = ({ link, children }: { link: LinkLike; children: React.ReactNode }) => <LinkCtx.Provider value={link}>{children}</LinkCtx.Provider>;
export const UiLink = (p: React.ComponentProps<LinkLike>) => { const L = useContext(LinkCtx); return <L {...p} />; };

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------- Brand ----------------
export function Logo({ src = '/brand/collabiz-mark.png', label = 'collabiz', href = '/' }: { src?: string; label?: string; href?: string }) {
  return (
    <UiLink href={href} className="cz-brand">
      <img src={src} alt="" width={30} height={30} />
      <span>{label}</span>
    </UiLink>
  );
}

// ---------------- Shell ----------------
export interface NavItem { href: string; label: string; screen?: string }
export interface NavSection { title?: string; items: NavItem[] }
export function AppShell({
  topNav = [], sections, currentPath, userInitials, userMenu, children, brandLabel, logoSrc,
}: {
  topNav?: NavItem[]; sections: NavSection[]; currentPath: string; userInitials?: string; userMenu?: React.ReactNode;
  children: React.ReactNode; brandLabel?: string; logoSrc?: string;
}) {
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === '/' ? currentPath === '/' : currentPath === href || currentPath.startsWith(href + '/'));
  return (
    <>
      <a href="#main" className="cz-skip">Skip to content</a>
      <header className="cz-topbar">
        <button className="cz-menu-btn" aria-expanded={open} aria-controls="cz-sidebar" onClick={() => setOpen(!open)}>Menu</button>
        <Logo label={brandLabel} src={logoSrc} />
        <nav aria-label="Primary">
          {topNav.map((n) => <UiLink key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}>{n.label}</UiLink>)}
        </nav>
        <div className="cz-spacer" />
        {userMenu}
        {userInitials && <span className="cz-avatar" aria-hidden>{userInitials}</span>}
      </header>
      <div className="cz-layout">
        <aside id="cz-sidebar" className="cz-sidebar" data-open={open} aria-label="Section navigation">
          {sections.map((s, i) => (
            <div key={i}>
              {s.title && <h4>{s.title}</h4>}
              {s.items.map((it) => (
                <UiLink key={it.href} href={it.href} aria-current={isActive(it.href) ? 'page' : undefined} onClick={() => setOpen(false)}>{it.label}</UiLink>
              ))}
            </div>
          ))}
        </aside>
        <main id="main" className="cz-main" tabIndex={-1}>{children}</main>
      </div>
    </>
  );
}

export function PageHeader({ title, screenId, breadcrumb, actions, description }: { title: string; screenId?: string; breadcrumb?: string; actions?: React.ReactNode; description?: React.ReactNode }) {
  return (
    <div className="cz-page-head">
      <div>
        <div className="cz-breadcrumb">{breadcrumb ?? 'Unite-first hybrid network'} {screenId && <span className="cz-screen-id" title="Screen ID">SCREEN {screenId}</span>}</div>
        <h1>{title}</h1>
        {description && <p className="cz-muted" style={{ maxWidth: 760 }}>{description}</p>}
      </div>
      {actions && <div className="cz-actions">{actions}</div>}
    </div>
  );
}

// ---------------- Primitives ----------------
type BtnVariant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost';
export function Button({ variant = 'primary', size, loading, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm'; loading?: boolean }) {
  return (
    <button className={cx('cz-btn', `cz-btn-${variant}`, size === 'sm' && 'cz-btn-sm', className)} disabled={rest.disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? 'Please wait…' : children}
    </button>
  );
}
export function ButtonLink({ href, variant = 'primary', size, children }: { href: string; variant?: BtnVariant; size?: 'sm'; children: React.ReactNode }) {
  return <UiLink href={href} className={cx('cz-btn', `cz-btn-${variant}`, size === 'sm' && 'cz-btn-sm')}>{children}</UiLink>;
}
export function Card({ title, actions, children, className, id }: { title?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string; id?: string }) {
  return (
    <section className={cx('cz-card', className)} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || actions) && <div className="cz-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>{title && <h2 style={{ margin: 0 }}>{title}</h2>}{actions}</div>}
      {children}
    </section>
  );
}
export function Kpi({ label, value, accent, hint }: { label: string; value: React.ReactNode; accent?: boolean; hint?: string }) {
  return (
    <div className="cz-kpi">
      <div className={cx('cz-kpi-value', accent && 'cz-accent')}>{value}</div>
      <div className="cz-kpi-label">{label}</div>
      {hint && <div className="cz-muted" style={{ fontSize: 12 }}>{hint}</div>}
    </div>
  );
}
export function Grid({ cols = 2, children }: { cols?: 2 | 3 | 4; children: React.ReactNode }) {
  return <div className={cx('cz-grid', `cz-grid-${cols}`)}>{children}</div>;
}
export function StatusBadge({ status, tone, label }: { status: string; tone?: Tone; label?: string }) {
  const t = toneColors[tone ?? toneForStatus(status)];
  return <span className="cz-badge" style={{ color: t.fg, background: t.bg }} data-status={status}>{label ?? humanize(status)}</span>;
}
export function Alert({ tone = 'info', children, title }: { tone?: 'info' | 'success' | 'warning' | 'danger'; children: React.ReactNode; title?: string }) {
  return <div className={`cz-alert cz-alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>{title && <strong>{title} </strong>}{children}</div>;
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
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return <div className="cz-state"><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Something went wrong.';
  return (
    <div className="cz-state" role="alert">
      <h3>We couldn’t load this</h3>
      <p>{msg}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
export function PermissionDenied({ reason }: { reason?: string }) {
  return (
    <div className="cz-state" role="alert" data-testid="permission-denied">
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
        <li key={it.id}><div><strong>{it.title}</strong></div><div className="cz-muted" style={{ fontSize: 12 }}>{new Date(it.at).toLocaleString()}</div>{it.detail && <div>{it.detail}</div>}</li>
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
